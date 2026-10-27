import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Key, Song } from '../../types';
import { applyPreviewDraft, createPreviewEditSession, setPreviewNotationCursor } from '../../lib/previewEditSession';
import type { PreviewEditorDeviceLayout } from '../../lib/previewEditorLayout';
import PreviewBarEditor from './PreviewBarEditor';
import { PICKUP_EDITOR_BAR_ID, PICKUP_EDITOR_SECTION_ID } from '../../utils/pickupUtils';

const song: Song = {
  title: 'Test song',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }]
};

const target = {
  kind: 'bar' as const,
  previewIdentity: 'song-1',
  sectionId: 'section-1',
  barId: 'bar-1',
  field: 'chords' as const,
  slotIndex: 1,
  rawChordIndex: null,
  anchorKey: 'song-1|section-1|bar-1|chords|1',
  anchorRect: { left: 20, top: 20, right: 40, bottom: 40, width: 20, height: 20 }
};

const renderEditor = ({
  session = createPreviewEditSession({ song, target, inputMode: 'letters' }),
  deviceLayout = 'desktop' as PreviewEditorDeviceLayout,
  hasCopiedBar = false,
  hasCopiedJianpu = false,
  hasCopiedRhythm = false,
  storedKey = 'C' as Key,
  displayedKey = 'C' as Key
} = {}) => {
  const callbacks = {
    onApplyDraft: vi.fn(),
    onInputModeChange: vi.fn(),
    onNotationModeChange: vi.fn(),
    onNotationCursorChange: vi.fn(),
    onJianpuInputAbsoluteChange: vi.fn(),
    onNavigate: vi.fn(),
    onStructure: vi.fn(),
    onCopyJianpu: vi.fn(),
    onPasteJianpu: vi.fn(),
    onCopyRhythm: vi.fn(),
    onPasteRhythm: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDone: vi.fn(),
    onCancel: vi.fn()
  };
  const renderWithSession = (nextSession = session) => (
    <PreviewBarEditor
      session={nextSession}
      language="zh"
      deviceLayout={deviceLayout}
      storedKey={storedKey}
      displayedKey={displayedKey}
      storageMode="letters"
      hasCopiedBar={hasCopiedBar}
      hasCopiedJianpu={hasCopiedJianpu}
      hasCopiedRhythm={hasCopiedRhythm}
      {...callbacks}
    />
  );
  const result = render(renderWithSession());
  return {
    ...callbacks,
    rerenderSession: (nextSession: typeof session) => result.rerender(renderWithSession(nextSession))
  };
};

describe('PreviewBarEditor', () => {
  it.each(['phone', 'tablet', 'desktop'] as const)('cycles the barline button through double, final and off on %s', async (deviceLayout) => {
    const user = userEvent.setup();
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C'], repeatStart: true, repeatEnd: true }] }] };
    let session = createPreviewEditSession({ song: source, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session, deviceLayout });
    for (const state of ['double', 'final', 'off', 'double']) {
      await user.click(screen.getByRole('button', { name: /切換小節線/ }));
      const edited = onApplyDraft.mock.calls.at(-1)![0] as Song;
      expect(edited.sections[0].bars[0]).toMatchObject({
        doubleBar: state === 'double', finalBar: state === 'final', repeatStart: true, repeatEnd: false, chords: ['C']
      });
      session = applyPreviewDraft(session, edited);
      rerenderSession(session);
      expect(document.querySelector('[data-barline-cycle]')).toHaveAttribute('data-barline-cycle', state);
      expect(document.querySelector('[data-keyboard-picker]')).not.toBeInTheDocument();
    }
  });

  it.each(['C', 'Ab', 'Db'] as const)('keeps b6 in the input after applying a numeric chord in %s', key => {
    const source: Song = { ...song, originalKey: key, currentKey: key };
    const base = createPreviewEditSession({ song: source, target, inputMode: 'nashville' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, storedKey: key, displayedKey: key });
    fireEvent.change(screen.getByRole('textbox', { name: '和弦直接輸入' }), { target: { value: 'b6' } });
    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chords[1]).toBe(key === 'C' ? 'Ab' : key === 'Ab' ? 'Fb' : 'b6');
    rerenderSession({ ...base, draftSong: nextSong });
    expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).toHaveValue('b6');
  });

  it.each(['phone', 'desktop'] as const)('selects and removes a double barline on %s', async (deviceLayout) => {
    const user = userEvent.setup();
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C'], repeatStart: true, finalBar: true }] }] };
    const { onApplyDraft, rerenderSession } = renderEditor({
      session: createPreviewEditSession({ song: source, target, inputMode: 'letters' }), deviceLayout
    });
    const openBarlines = async () => {
      const trigger = screen.queryByRole('button', { name: '選擇小節線與反覆' });
      if (trigger) await user.click(trigger);
    };
    await openBarlines();
    await user.click(screen.getByRole('button', { name: '雙小節線 ||' }));
    const edited = onApplyDraft.mock.calls.at(-1)![0] as Song;
    expect(edited.sections[0].bars[0]).toMatchObject({ doubleBar: true, finalBar: false, repeatEnd: false, repeatStart: true });
    rerenderSession(createPreviewEditSession({ song: edited, target, inputMode: 'letters' }));
    await openBarlines();
    expect(screen.getByRole('button', { name: '雙小節線 ||' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '雙小節線 ||' }));
    expect((onApplyDraft.mock.calls.at(-1)![0] as Song).sections[0].bars[0].doubleBar).toBe(false);
  });

  it.each(['desktop', 'phone'] as const)('edits second-pass chords on %s while preserving first-pass harmony', deviceLayout => {
    const source: Song = {...song, sections:[{...song.sections[0], bars:[{...song.sections[0].bars[0], chords:['C','','C/E',''], chordPassVariants:[{pass:2,chords:['C/E','','C7','']}]}]}]};
    const session=createPreviewEditSession({song:source,target:{...target,slotIndex:0,rawChordIndex:0},inputMode:'letters'});
    const {onApplyDraft}=renderEditor({session,deviceLayout});
    fireEvent.change(screen.getByRole('textbox',{name:'第2遍 第3拍和弦'}),{target:{value:'G7'}});
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0]).toMatchObject({chords:['C','','C/E',''],chordPassVariants:[{pass:2,chords:['C/E','','G7','']}]});
  });

  it.each(['desktop', 'phone'] as const)('sets D.C. al Fine as one structured marker on %s', deviceLayout => {
    const { onApplyDraft } = renderEditor({ deviceLayout });
    fireEvent.click(screen.getByRole('button', { name: '選擇導引記號' }));
    fireEvent.click(screen.getByRole('button', { name: 'D.C. al Fine' }));
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].rightMarker).toBe('dc-al-fine');
  });

  it.each(['desktop','phone'] as const)('edits an additional chord on %s without overwriting the original beat chord', deviceLayout=>{
    const source:Song={...song,sections:[{...song.sections[0],bars:[{...song.sections[0].bars[0],chordSubdivisions:[{beat:0,offset:.5,chord:'G/B'}]}]}]};
    const session=createPreviewEditSession({song:source,target:{...target,slotIndex:0,rawChordIndex:0},inputMode:'letters'});
    const {onApplyDraft}=renderEditor({session,deviceLayout});
    fireEvent.change(screen.getByRole('textbox',{name:'追加和弦 1'}),{target:{value:'Am/C'}});
    const changed=onApplyDraft.mock.calls.at(-1)?.[0];expect(changed.sections[0].bars[0].chords).toEqual(['C']);expect(changed.sections[0].bars[0].chordSubdivisions).toEqual([{beat:0,offset:.5,chord:'Am/C'}]);
    fireEvent.change(screen.getByRole('combobox',{name:'追加和弦 1 拍位'}),{target:{value:'1.75'}});
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].chordSubdivisions[0]).toEqual({beat:1,offset:.75,chord:'G/B'});
    fireEvent.click(screen.getByRole('button',{name:'移除追加和弦 1'}));expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].chordSubdivisions).toBeUndefined();
  });

  it.each(['desktop', 'phone'] as const)('edits precise chord timing on %s without changing the chord or its color', deviceLayout => {
    const source: Song = {...song, sections:[{...song.sections[0],bars:[{...song.sections[0].bars[0],chords:['C','G','',''],chordMarks:{1:{color:'rose'}}}]}]};
    const session=createPreviewEditSession({song:source,target:{...target,rawChordIndex:1},inputMode:'letters'});
    const {onApplyDraft}=renderEditor({session,deviceLayout});
    fireEvent.click(screen.getByRole('button',{name:'選擇演奏記號'}));
    fireEvent.change(screen.getByRole('combobox',{name:'和弦拍內位置'}),{target:{value:'0.25'}});
    const changed=onApplyDraft.mock.calls.at(-1)?.[0];expect(changed.sections[0].bars[0].chordMarks).toEqual({1:{color:'rose',beatOffset:.25}});expect(changed.sections[0].bars[0].chords).toEqual(['C','G','','']);
  });

  it('adds an unmetered grace note from the phone editor without changing the principal pitch', () => {
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ ...song.sections[0].bars[0], riff: '3 | 4 | 5 | 6' }] }] };
    const jianpuTarget = { ...target, field: 'jianpu' as const, slotIndex: 0, cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: 0 } };
    const { onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song: source, target: jianpuTarget, inputMode: 'letters' }), deviceLayout: 'phone' });
    fireEvent.click(screen.getByRole('button', { name: '編輯簡譜裝飾音' }));
    expect(screen.queryByRole('button', { name: '輸入簡譜 2' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '裝飾音音高' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '套用裝飾音' }));
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].riff).toBe('{2}3 | 4 | 5 | 6');
  });

  it.each(['desktop','phone'] as const)('edits only the second ornament and preserves the group on %s', deviceLayout => {
    const source:Song={...song,sections:[{...song.sections[0],bars:[{...song.sections[0].bars[0],riff:"{1'2'}3' | 4 | 5 | 6"}]}]};
    const jianpuTarget={...target,field:'jianpu' as const,slotIndex:0,cursor:{kind:'jianpu' as const,beatIndex:0,unitIndex:0,noteIndex:0}};
    const {onApplyDraft}=renderEditor({session:createPreviewEditSession({song:source,target:jianpuTarget,inputMode:'letters'}),deviceLayout});
    fireEvent.click(screen.getByRole('button',{name:'編輯簡譜裝飾音'}));
    expect(screen.getByRole('combobox',{name:'裝飾音 1 音高'})).toHaveValue('1');
    expect(screen.getByRole('combobox',{name:'裝飾音 2 八度'})).toHaveValue('1');
    fireEvent.change(screen.getByRole('combobox',{name:'裝飾音 2 音高'}),{target:{value:'4'}});
    fireEvent.click(screen.getByRole('button',{name:'套用裝飾音'}));
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].riff).toBe("{1'4'}3' | 4 | 5 | 6");
  });

  it('adds and removes an individual grace without applying intermediate drafts',()=>{
    const source:Song={...song,sections:[{...song.sections[0],bars:[{...song.sections[0].bars[0],riff:'{1}3 | 4 | 5 | 6'}]}]};
    const jianpuTarget={...target,field:'jianpu' as const,slotIndex:0,cursor:{kind:'jianpu' as const,beatIndex:0,unitIndex:0,noteIndex:0}};
    const {onApplyDraft}=renderEditor({session:createPreviewEditSession({song:source,target:jianpuTarget,inputMode:'letters'}),deviceLayout:'phone'});
    fireEvent.click(screen.getByRole('button',{name:'編輯簡譜裝飾音'}));
    fireEvent.click(screen.getByRole('button',{name:'新增裝飾音'}));
    fireEvent.change(screen.getByRole('combobox',{name:'裝飾音 2 音高'}),{target:{value:'4'}});
    fireEvent.click(screen.getByRole('button',{name:'移除裝飾音 1'}));
    expect(onApplyDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox',{name:'裝飾音音高'})).toHaveValue('4');
    fireEvent.click(screen.getByRole('button',{name:'套用裝飾音'}));
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].riff).toBe('{4}3 | 4 | 5 | 6');
  });

  it('closes the grace form with Escape without changing the score or finishing the editor', () => {
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ ...song.sections[0].bars[0], riff: '{2}3 | 4 | 5 | 6' }] }] };
    const jianpuTarget = { ...target, field: 'jianpu' as const, slotIndex: 0, cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: 0 } };
    const { onApplyDraft, onDone } = renderEditor({ session: createPreviewEditSession({ song: source, target: jianpuTarget, inputMode: 'letters' }) });
    fireEvent.click(screen.getByRole('button', { name: '編輯簡譜裝飾音' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('combobox', { name: '裝飾音音高' })).toBeNull();
    expect(onApplyDraft).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('toggles a selected sixteenth into a triplet without shifting its neighbor', () => {
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ ...song.sections[0].bars[0], riff: '1=2=3_ | 4 | 5 | 6' }] }] };
    const jianpuTarget = { ...target, field: 'jianpu' as const, slotIndex: 0, cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: 0 } };
    const { onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song: source, target: jianpuTarget, inputMode: 'letters' }), deviceLayout: 'phone' });
    fireEvent.click(screen.getByRole('button', { name: '切換簡譜三連音' }));
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].riff).toBe('1=ty2=3_ | 4 | 5 | 6');
  });

  it('offers sixteenth triplet notes and rests in the rhythm keyboard', () => {
    const rhythmTarget = { ...target, field: 'rhythm' as const, slotIndex: 0, cursor: { kind: 'rhythm' as const, cursorUnit: 0 } };
    const { onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' }), deviceLayout: 'phone' });
    fireEvent.click(screen.getByRole('button', { name: /^十六分三連音$/ }));
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0].rhythm).toBe('s3');
    expect(screen.getByRole('button', { name: /^十六分三連休止$/ })).toBeEnabled();
  });

  it.each(['rhythm', 'jianpu'] as const)('edits and names a %s voice in the shared keyboard without touching other parts', async mode => {
    const user = userEvent.setup();
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ ...song.sections[0].bars[0],
      rhythm: 'qr q qr q', riff: '1 | 2 | 3 | 4',
      rhythmVoices: [{ id: 'kick', label: 'Kick', rhythm: 'q' }],
      riffVoices: [{ id: 'bass', label: 'Bass', riff: '5 | 6 | 7 | 1' }]
    }, { id: 'neighbor', chords: ['G'], riff: '7', rhythm: 'q' }] }] };
    const notationTarget = { ...target, field: mode, slotIndex: 0, cursor: mode === 'rhythm' ? { kind: 'rhythm' as const, cursorUnit: 0 } : { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null } };
    let latest = createPreviewEditSession({ song: source, target: notationTarget, inputMode: 'letters' });
    function Harness() {
      const [session, setSession] = useState(latest); latest = session;
      return <PreviewBarEditor session={session} language="zh" deviceLayout="phone" storedKey="C" displayedKey="C" storageMode="letters"
        onApplyDraft={draft => setSession(current => applyPreviewDraft(current, draft))}
        onNotationCursorChange={cursor => setSession(current => setPreviewNotationCursor(current, cursor))}
        onNotationModeChange={vi.fn()} onInputModeChange={vi.fn()} onJianpuInputAbsoluteChange={vi.fn()}
        onNavigate={vi.fn()} onStructure={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} onDone={vi.fn()} onCancel={vi.fn()} />;
    }
    render(<Harness />);
    const voiceId = mode === 'rhythm' ? 'kick' : 'bass';
    await user.click(screen.getByRole('button', { name: mode === 'rhythm' ? 'Kick' : 'Bass' }));
    expect(latest.past).toHaveLength(0);
    expect(document.querySelector(`[data-keyboard-view="${mode}"]`)).toBeInTheDocument();
    expect(latest.cursorByMode[mode]).toMatchObject({ voiceId });
    await user.click(screen.getByRole('button', { name: mode === 'rhythm' ? '切換節奏重音' : '刪除簡譜音符' }));
    let bar = latest.draftSong.sections[0].bars[0];
    expect(bar.rhythm).toBe('qr q qr q'); expect(bar.riff).toBe('1 | 2 | 3 | 4');
    if (mode === 'rhythm') expect(bar.rhythmVoices?.[0].rhythm).toBe('q^');
    else expect(bar.riffVoices?.[0].riff).not.toBe(source.sections[0].bars[0].riffVoices?.[0].riff);
    expect(latest.draftSong.sections[0].bars[1]).toEqual(source.sections[0].bars[1]);
    await user.click(screen.getByRole('button', { name: '重新命名目前聲部' }));
    await user.clear(screen.getByRole('textbox', { name: '聲部名稱' }));
    await user.type(screen.getByRole('textbox', { name: '聲部名稱' }), '合唱');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    bar = latest.draftSong.sections[0].bars[0];
    expect((mode === 'rhythm' ? bar.rhythmVoices : bar.riffVoices)?.[0].label).toBe('合唱');
    await user.click(screen.getByRole('button', { name: '主聲部' }));
    await user.click(screen.getByRole('button', { name: '重新命名目前聲部' }));
    await user.clear(screen.getByRole('textbox', { name: '聲部名稱' }));
    await user.type(screen.getByRole('textbox', { name: '聲部名稱' }), '旋律');
    await user.click(screen.getByRole('button', { name: '儲存' }));
    expect(latest.draftSong.sections[0].bars[0][mode === 'rhythm' ? 'rhythmLabel' : 'riffLabel']).toBe('旋律');
    expect(latest.draftSong.sections[0].bars[1]).toEqual(source.sections[0].bars[1]);
    await user.click(screen.getByRole('button', { name: '新增聲部' }));
    expect(screen.getByRole('button', { name: '聲部 3' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '重新命名目前聲部' }));
    await user.click(screen.getByRole('button', { name: '移除目前聲部' }));
    expect(screen.queryByRole('button', { name: '聲部 3' })).toBeNull();
    expect(screen.getByRole('button', { name: '旋律' })).toHaveAttribute('aria-pressed', 'true');
    expect(latest.draftSong.sections[0].bars[0].rhythm).toBe('qr q qr q');
    expect(latest.draftSong.sections[0].bars[0].riff).toBe('1 | 2 | 3 | 4');
  });

  it('does not delete a bar when backspacing an empty additional voice over a populated primary', () => {
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: [], riff: '1 | 2 | 3 | 4', riffVoices: [{ id: 'empty', label: '空聲部', riff: '' }] }] }] };
    const cursor = { kind: 'jianpu' as const, voiceId: 'empty', beatIndex: 0, unitIndex: 0, noteIndex: null };
    const { onStructure, onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song: source, target: { ...target, field: 'jianpu', cursor } }) });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(onStructure).not.toHaveBeenCalled();
    expect(onApplyDraft).not.toHaveBeenCalled();
  });

  it.each(['chords', 'rhythm', 'jianpu'] as const)('opens shared text fields from %s and returns to its keyboard', async field => {
    const user = userEvent.setup();
    const source: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ ...song.sections[0].bars[0], riff: '1', rhythm: 'q', riffVoices: [{ id: 'bass', label: 'Bass', riff: '5' }] }] }] };
    const { onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song: source, target: { ...target, field } }), deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '文字欄位' }));
    expect(screen.getByText('文字套用到目前小節，由所有聲部共用。')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: '上方註記' }), { target: { value: '漸強' } });
    expect(onApplyDraft.mock.calls.at(-1)?.[0].sections[0].bars[0]).toEqual({ ...source.sections[0].bars[0], annotation: '漸強' });
    await user.click(screen.getByRole('button', { name: `返回${field === 'chords' ? '和弦' : field === 'rhythm' ? '節奏' : '簡譜'}鍵盤` }));
    expect(screen.queryByRole('textbox', { name: '上方註記' })).toBeNull();
    expect(screen.getByRole('button', { name: '文字欄位' })).toBeVisible();
  });

  it('cycles a source crosshead without changing its duration or neighboring notes', async () => {
    const user = userEvent.setup();
    let draft: Song = { ...song, sections: [{ ...song.sections[0], bars: [{ ...song.sections[0].bars[0], rhythm: 'e e e e e e e e' }] }] };
    const rhythmTarget = { ...target, field: 'rhythm' as const, slotIndex: 0, cursor: { kind: 'rhythm' as const, cursorUnit: 0 } };
    const session = () => createPreviewEditSession({ song: draft, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: session(), deviceLayout: 'phone' });
    for (const expected of ['ec', 'ecu', 'e']) {
      await user.click(screen.getByRole('button', { name: '切換叉形音頭：一般、上方、實心' }));
      draft = onApplyDraft.mock.calls.at(-1)![0];
      expect(draft.sections[0].bars[0].rhythm).toBe(`${expected} e e e e e e e`);
      rerenderSession(session());
    }
  });

  it.each([
    ['搶拍', '<', 'M7 7l-3 3 3 3'],
    ['拖拍', '>', 'M25 7l3 3-3 3']
  ])('stores the matching suffix when choosing %s', async (label, suffix, arrowhead) => {
    const user = userEvent.setup();
    const session = createPreviewEditSession({
      song: { ...song, chordTimingVersion: 2 },
      target: { ...target, slotIndex: 0, rawChordIndex: 0 },
      inputMode: 'letters'
    });
    const { onApplyDraft } = renderEditor({ session, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '選擇演奏記號' }));
    const button = screen.getByRole('button', { name: label });
    expect(button.querySelector('svg path:last-child')).toHaveAttribute('d', arrowhead);
    await user.click(button);
    const edited = onApplyDraft.mock.calls.at(-1)![0] as Song;
    expect(edited.sections[0].bars[0].chords[0]).toBe(`C${suffix}`);
    expect(edited.chordTimingVersion).toBe(2);
    expect(song.sections[0].bars[0].chords).toEqual(['C']);
  });

  it('shows the inherited sharp key when reopening the following section', async () => {
    const source: Song = { ...song, originalKey: 'F', currentKey: 'F', sections: [
      { id: 'intro', title: 'Intro', bars: [{ id: 'intro-1', keyChangeTo: 'F#', chords: ['5'] }] },
      { id: 'section-1', title: 'Chorus', bars: [{ id: 'bar-1', chords: ['1'] }] }
    ] };
    renderEditor({ session: createPreviewEditSession({ song: source, target, inputMode: 'letters' }), deviceLayout: 'phone' });
    expect(screen.getByTitle('轉Key：沿用 F#')).toBeInTheDocument();
    expect(screen.queryByTitle('轉Key：沿用 Gb')).not.toBeInTheDocument();
  });

  it('auto-focuses the hidden desktop chord capture and expands visual keys on demand', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.queryByPlaceholderText('點這裡使用文字輸入')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '和弦直接輸入' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /^G$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '選擇小節拍號' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '文字欄位' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '顯示字母數字鍵' }));
    expect(screen.getByRole('button', { name: /^G$/ })).toBeInTheDocument();
  });

  it('shows a bar key-change button on the chord keyboard', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: 'Key' })).toBeInTheDocument();
  });

  it('keeps touch input unfocused and writes a visual chord into the selected beat', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor({ deviceLayout: 'phone' });
    expect(screen.queryByPlaceholderText('點這裡使用文字輸入')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '和弦直接輸入' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^G$/ }));
    const nextSong = onApplyDraft.mock.calls[0][0] as Song;
    expect(nextSong.sections[0].bars[0].chords).toEqual(['C', 'G', '', '']);
    expect(screen.getByRole('button', { name: 'Previous beat' })).toHaveTextContent('上一拍');
    expect(screen.getByRole('button', { name: 'Next beat' })).toHaveTextContent('下一拍');
  });

  it('shows all notation modes in the header and switches directly without mutating the draft', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, onNotationModeChange, rerenderSession } = renderEditor({
      session: base,
      deviceLayout: 'phone'
    });
    const group = screen.getByRole('group', { name: '輸入法' });

    expect(within(group).getByRole('button', { name: '目前和弦' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '切換到節奏' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '切換到簡譜' })).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: '切換到節奏' }));
    expect(onNotationModeChange).toHaveBeenCalledWith('rhythm');
    expect(onApplyDraft).not.toHaveBeenCalled();

    rerenderSession({ ...base, notationMode: 'rhythm' });
    await user.click(screen.getByRole('button', { name: '切換到簡譜' }));
    expect(onNotationModeChange).toHaveBeenLastCalledWith('jianpu');

    rerenderSession({ ...base, notationMode: 'jianpu' });
    await user.click(screen.getByRole('button', { name: '切換到和弦' }));
    expect(onNotationModeChange).toHaveBeenLastCalledWith('chords');
  });

  it('keeps the current segmented notation button inert', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onNotationModeChange } = renderEditor({
      session: base,
      deviceLayout: 'phone'
    });

    await user.click(screen.getByRole('button', { name: '目前和弦' }));

    expect(onNotationModeChange).not.toHaveBeenCalled();
  });

  it('writes rhythm notes and rests through semantic rhythm cursors', async () => {
    const user = userEvent.setup();
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft, onNotationCursorChange } = renderEditor({
      session: rhythmSession,
      deviceLayout: 'phone'
    });

    expect(document.querySelector('[data-keyboard-view="rhythm"]')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '和弦直接輸入' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '四分音符' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].rhythm).toBe('q');
    expect(onNotationCursorChange).toHaveBeenLastCalledWith({ kind: 'rhythm', cursorUnit: 4 });
  });

  it('writes slash placeholders from the rhythm keyboard', async () => {
    const user = userEvent.setup();
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft, onNotationCursorChange } = renderEditor({
      session: rhythmSession,
      deviceLayout: 'phone'
    });

    await user.click(screen.getByRole('button', { name: '插入節奏佔用拍' }));

    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].rhythm).toBe('/');
    expect(onNotationCursorChange).toHaveBeenLastCalledWith({ kind: 'rhythm', cursorUnit: 4 });
  });

  it('shows clean rhythm symbols without staff lines, fractions or token labels', () => {
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' });
    renderEditor({ session: rhythmSession, deviceLayout: 'phone' });

    const notes = document.querySelector('[data-rhythm-key-row="notes"]');
    const rests = document.querySelector('[data-rhythm-key-row="rests"]');
    const modifiers = document.querySelector('[data-rhythm-key-row="modifiers"]');
    expect(notes?.querySelectorAll('[data-rhythm-staff-key-glyph]')).toHaveLength(5);
    expect(rests?.querySelectorAll('[data-rhythm-staff-key-glyph]')).toHaveLength(5);
    expect(modifiers?.querySelectorAll('[data-rhythm-triplet-mark]')).toHaveLength(6);
    expect(document.querySelector('[data-rhythm-staff-line]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-rhythm-notation-label]')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '預覽快捷編輯' })).not.toHaveTextContent(/1\/2|1\/4|1\/8|1\/16/);
    expect(notes).not.toHaveTextContent(/\b[whqes]\b/);
  });

  it('dispatches desktop hardware keys to the rhythm command layer', () => {
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: rhythmSession, deviceLayout: 'desktop' });
    expect(screen.queryByRole('textbox', { name: '和弦直接輸入' })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'e' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].rhythm).toBe('e');
  });

  it('uses chord-like space and enter navigation in rhythm mode', () => {
    const rhythmSong: Song = {
      ...song,
      sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q' }] }]
    };
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song: rhythmSong, target: rhythmTarget, inputMode: 'letters' });
    const { onNavigate, onNotationCursorChange } = renderEditor({ session: rhythmSession, deviceLayout: 'desktop' });

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(onNotationCursorChange).toHaveBeenLastCalledWith({ kind: 'rhythm', cursorUnit: 4 });
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith('next', undefined, { bar: true });
  });

  it('advances to the next bar after rhythm input fills the current bar', async () => {
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft, onNavigate } = renderEditor({ session: rhythmSession, deviceLayout: 'phone' });

    fireEvent.click(screen.getByRole('button', { name: '全音符' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].rhythm).toBe('w');
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('next', undefined, { bar: true });
    });
  });

  it('offers rhythm copy and paste from the rhythm keyboard', async () => {
    const user = userEvent.setup();
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song, target: rhythmTarget, inputMode: 'letters' });
    const { onCopyRhythm, onPasteRhythm } = renderEditor({
      session: rhythmSession,
      deviceLayout: 'phone',
      hasCopiedRhythm: true
    });

    expect(document.querySelector('[data-rhythm-key-row="copy-paste"]')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '複製節奏' }));
    expect(onCopyRhythm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '貼上節奏' }));
    expect(onPasteRhythm).toHaveBeenCalledTimes(1);
  });

  it('writes jianpu with independent duration formatting and reports its semantic cursor', async () => {
    const user = userEvent.setup();
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    const { onApplyDraft, onNotationCursorChange } = renderEditor({
      session: jianpuSession,
      deviceLayout: 'phone'
    });

    expect(document.querySelector('[data-keyboard-view="jianpu"]')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '和弦直接輸入' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '切換簡譜八分音符' }));
    await user.click(screen.getByRole('button', { name: '輸入簡譜 5' }));
    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].riff).toMatch(/^5_/);
    expect(onNotationCursorChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'jianpu',
      beatIndex: 0
    }));
  });

  it('offers jianpu copy and paste from the jianpu keyboard', async () => {
    const user = userEvent.setup();
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    const { onCopyJianpu, onPasteJianpu } = renderEditor({
      session: jianpuSession,
      deviceLayout: 'phone',
      hasCopiedJianpu: true
    });

    expect(document.querySelector('[data-jianpu-key-row="bar-actions"]')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '複製簡譜' }));
    expect(onCopyJianpu).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '貼上簡譜' }));
    expect(onPasteJianpu).toHaveBeenCalledTimes(1);
  });

  it('shows the active duration beneath every jianpu pitch key and uses quarter as the unselected default', async () => {
    const user = userEvent.setup();
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    renderEditor({ session: jianpuSession, deviceLayout: 'phone' });

    const formatRow = document.querySelector('[data-jianpu-key-row="format"]');
    expect(formatRow).not.toHaveTextContent(/1\/4|1\/8|1\/16/);
    expect(screen.queryByRole('button', { name: /四分音符/ })).not.toBeInTheDocument();
    const pitchKey = screen.getByRole('button', { name: '輸入簡譜 1' });
    const pitchGlyph = pitchKey.querySelector('[data-jianpu-input-glyph]');
    expect(pitchGlyph).toHaveClass('[&_[data-jianpu-pitch-symbol]]:!text-[24px]', '[&_[data-jianpu-pitch-symbol]]:!font-medium');
    expect(pitchGlyph).toHaveAttribute('data-jianpu-duration', 'quarter');

    const eighthButton = screen.getByRole('button', { name: '切換簡譜八分音符' });
    await user.click(eighthButton);
    const pitchGlyphs = Array.from(document.querySelectorAll('[data-jianpu-key-row="pitches"] [data-jianpu-input-glyph]'));
    expect(pitchGlyphs).toHaveLength(7);
    pitchGlyphs.forEach((glyph) => {
      expect(glyph).toHaveAttribute('data-jianpu-duration', 'eighth');
      expect(glyph.querySelectorAll('[data-jianpu-duration-line]')).toHaveLength(1);
    });
    expect(eighthButton).toHaveClass('!bg-indigo-700');

    await user.click(eighthButton);
    Array.from(document.querySelectorAll('[data-jianpu-key-row="pitches"] [data-jianpu-input-glyph]')).forEach((glyph) => {
      expect(glyph).toHaveAttribute('data-jianpu-duration', 'quarter');
      expect(glyph.querySelectorAll('[data-jianpu-duration-line]')).toHaveLength(0);
    });
    expect(eighthButton).not.toHaveClass('!bg-indigo-700');

    await user.click(screen.getByRole('button', { name: '切換簡譜十六分音符' }));
    Array.from(document.querySelectorAll('[data-jianpu-key-row="pitches"] [data-jianpu-input-glyph]')).forEach((glyph) => {
      expect(glyph).toHaveAttribute('data-jianpu-duration', 'sixteenth');
      expect(glyph.querySelectorAll('[data-jianpu-duration-line]')).toHaveLength(2);
    });
    await user.click(eighthButton);
    await user.click(screen.getByRole('button', { name: '切換簡譜升記號' }));
    await user.click(screen.getByRole('button', { name: '切換高八度簡譜' }));
    await user.click(screen.getByRole('button', { name: '切換簡譜附點' }));

    expect(eighthButton).toHaveClass('!bg-indigo-700');
    expect(screen.getByRole('button', { name: '切換簡譜升記號' })).toHaveClass('!bg-indigo-700');
    expect(screen.getByRole('button', { name: '切換高八度簡譜' })).toHaveClass('!bg-indigo-700');
    expect(screen.getByRole('button', { name: '切換簡譜附點' })).toHaveClass('!bg-indigo-700');
    expect(pitchKey).toHaveTextContent('1');
    expect(document.querySelectorAll('[data-jianpu-input-glyph]')).toHaveLength(11);
  });

  it('marks the selected chord beat color from the preview keyboard', async () => {
    const user = userEvent.setup();
    const chordSong: Song = {
      ...song,
      sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C', 'Dm'] }] }]
    };
    const chordTarget = {
      ...target,
      slotIndex: 1,
      rawChordIndex: 1,
      cursor: { kind: 'chord' as const, slotIndex: 1, rawChordIndex: 1 }
    };
    const chordSession = createPreviewEditSession({ song: chordSong, target: chordTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: chordSession, deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '和弦色: 玫瑰' }));

    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chordMarks).toEqual({ 1: { color: 'rose' } });
  });

  it('keeps preview chord colors as swatch toggles without special or clear buttons', async () => {
    const user = userEvent.setup();
    const chordSong: Song = {
      ...song,
      sections: [{
        id: 'section-1',
        title: 'Verse',
        bars: [{ id: 'bar-1', chords: ['C', 'Dm'], chordMarks: { 1: { color: 'rose' } } }]
      }]
    };
    const chordTarget = {
      ...target,
      slotIndex: 1,
      rawChordIndex: 1,
      cursor: { kind: 'chord' as const, slotIndex: 1, rawChordIndex: 1 }
    };
    const chordSession = createPreviewEditSession({ song: chordSong, target: chordTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: chordSession, deviceLayout: 'phone' });

    expect(screen.queryByRole('button', { name: '切換特殊和弦標記' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '清除目前顏色標註' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '和弦色: 玫瑰' }));

    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chordMarks).toBeUndefined();
  });

  it('marks rhythm color from the rhythm keyboard', async () => {
    const user = userEvent.setup();
    const rhythmSong: Song = {
      ...song,
      sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q' }] }]
    };
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song: rhythmSong, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: rhythmSession, deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '節奏色: 天藍' }));

    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].rhythmMark).toEqual({ color: 'sky' });
  });

  it('clears rhythm color by tapping the selected swatch again', async () => {
    const user = userEvent.setup();
    const rhythmSong: Song = {
      ...song,
      sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'], rhythm: 'q', rhythmMark: { color: 'sky' } }] }]
    };
    const rhythmTarget = {
      ...target,
      field: 'rhythm' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'rhythm' as const, cursorUnit: 0 }
    };
    const rhythmSession = createPreviewEditSession({ song: rhythmSong, target: rhythmTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: rhythmSession, deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '節奏色: 天藍' }));

    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].rhythmMark).toBeUndefined();
  });

  it('marks jianpu color as an enabled unison mark from the jianpu keyboard', async () => {
    const user = userEvent.setup();
    const jianpuSong: Song = {
      ...song,
      sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'], riff: '1 2 3 4' }] }]
    };
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song: jianpuSong, target: jianpuTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: jianpuSession, deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '簡譜色: 紫羅蘭' }));

    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].unisonMark).toEqual({ enabled: true, color: 'violet' });
  });

  it('clears jianpu color by tapping the selected swatch again', async () => {
    const user = userEvent.setup();
    const jianpuSong: Song = {
      ...song,
      sections: [{
        id: 'section-1',
        title: 'Verse',
        bars: [{ id: 'bar-1', chords: ['C'], riff: '1 2 3 4', unisonMark: { enabled: true, color: 'violet' } }]
      }]
    };
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song: jianpuSong, target: jianpuTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: jianpuSession, deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '簡譜色: 紫羅蘭' }));

    const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].unisonMark).toBeUndefined();
  });

  it('keeps the jianpu movable/fixed input toggle separate from song mutation', async () => {
    const user = userEvent.setup();
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    const { onApplyDraft, onJianpuInputAbsoluteChange } = renderEditor({
      session: jianpuSession,
      deviceLayout: 'tablet'
    });

    await user.click(screen.getByRole('button', { name: '切換為固定調簡譜輸入' }));
    expect(onJianpuInputAbsoluteChange).toHaveBeenCalledWith(true);
    expect(onApplyDraft).not.toHaveBeenCalled();
  });

  it('dispatches desktop number keys to jianpu instead of chord input', () => {
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: jianpuSession, deviceLayout: 'desktop' });
    expect(screen.queryByRole('textbox', { name: '和弦直接輸入' })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '3' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].riff).toMatch(/^3/);
  });

  it('toggles jianpu duration and octave with compact hardware shortcuts', () => {
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    renderEditor({ session: jianpuSession, deviceLayout: 'desktop' });

    fireEvent.keyDown(document.body, { key: 'e' });
    expect(screen.getByRole('button', { name: '切換簡譜八分音符' })).toHaveClass('!bg-indigo-700');
    expect(screen.getByRole('button', { name: '輸入簡譜 4' }).querySelector('[data-jianpu-input-glyph]')).toHaveAttribute('data-jianpu-duration', 'eighth');
    fireEvent.keyDown(document.body, { key: 'e' });
    expect(screen.getByRole('button', { name: '切換簡譜八分音符' })).not.toHaveClass('!bg-indigo-700');
    expect(screen.getByRole('button', { name: '輸入簡譜 4' }).querySelector('[data-jianpu-input-glyph]')).toHaveAttribute('data-jianpu-duration', 'quarter');

    fireEvent.keyDown(document.body, { key: 's' });
    expect(screen.getByRole('button', { name: '切換簡譜十六分音符' })).toHaveClass('!bg-indigo-700');
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: '切換高八度簡譜' })).toHaveClass('!bg-indigo-700');
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: '切換高八度簡譜' })).not.toHaveClass('!bg-indigo-700');
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: '切換低八度簡譜' })).toHaveClass('!bg-indigo-700');
  });

  it('hands cross-bar jianpu navigation back to the App target navigator', async () => {
    const user = userEvent.setup();
    const twoBarSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: [] }, { id: 'bar-2', chords: [] }]
      }]
    };
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 3, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({
      song: twoBarSong,
      target: jianpuTarget,
      inputMode: 'letters'
    });
    const { onNavigate, onNotationCursorChange } = renderEditor({
      session: jianpuSession,
      deviceLayout: 'phone'
    });

    await user.click(screen.getByRole('button', { name: 'Next beat' }));
    expect(onNavigate).toHaveBeenCalledWith('next', {
      kind: 'jianpu',
      beatIndex: 0,
      unitIndex: 0,
      noteIndex: null
    });
    expect(onNotationCursorChange).not.toHaveBeenCalled();
  });

  it('uses Space for jianpu cursor navigation and Enter for next-bar navigation', () => {
    const jianpuTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null }
    };
    const jianpuSession = createPreviewEditSession({ song, target: jianpuTarget, inputMode: 'letters' });
    const { onNavigate, onNotationCursorChange } = renderEditor({
      session: jianpuSession,
      deviceLayout: 'desktop'
    });

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(onNotationCursorChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jianpu' }));
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('next', undefined, { bar: true });
  });

  it('moves jianpu navigation between a selected note and its trailing input space', async () => {
    const user = userEvent.setup();
    const partialBeatSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [{ id: 'bar-1', chords: ['C'], riff: '2_' }]
      }]
    };
    const selectedTarget = {
      ...target,
      field: 'jianpu' as const,
      slotIndex: 0,
      rawChordIndex: null,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: 0 }
    };
    const selectedSession = createPreviewEditSession({ song: partialBeatSong, target: selectedTarget, inputMode: 'letters' });
    const { onNavigate, onNotationCursorChange, rerenderSession } = renderEditor({
      session: selectedSession,
      deviceLayout: 'phone'
    });

    await user.click(screen.getByRole('button', { name: 'Next beat' }));
    expect(onNotationCursorChange).toHaveBeenLastCalledWith({
      kind: 'jianpu',
      beatIndex: 0,
      unitIndex: 2,
      noteIndex: null
    });
    expect(onNavigate).not.toHaveBeenCalled();

    const insertTarget = {
      ...selectedTarget,
      cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 2, noteIndex: null }
    };
    rerenderSession(createPreviewEditSession({ song: partialBeatSong, target: insertTarget, inputMode: 'letters' }));

    await user.click(screen.getByRole('button', { name: 'Previous beat' }));
    expect(onNotationCursorChange).toHaveBeenLastCalledWith({
      kind: 'jianpu',
      beatIndex: 0,
      unitIndex: 0,
      noteIndex: 0
    });
  });

  it('docks the iPad keyboard across the full visual viewport without a native chord input', () => {
    renderEditor({ deviceLayout: 'tablet' });
    const dialog = screen.getByRole('dialog', { name: '預覽快捷編輯' });
    expect(dialog).toHaveStyle({ left: '0px', width: '1024px' });
    expect(dialog.style.transform).toBe('');
    expect(screen.queryByRole('textbox', { name: '和弦直接輸入' })).not.toBeInTheDocument();
  });

  it('keeps the phone key rows at their minimum height with a scroll fallback for short visual viewports', () => {
    renderEditor({ deviceLayout: 'phone' });
    const dialog = screen.getByRole('dialog', { name: '預覽快捷編輯' });
    expect(dialog).toHaveAttribute('data-fixed-keyboard-height', 'adaptive');
    expect(dialog.querySelector('[data-keyboard-mode="common"]')).toHaveAttribute('data-keyboard-surface', 'system');
    expect(dialog.querySelector('[data-keyboard-mode="common"]')).toHaveClass('overflow-y-auto');
    expect(dialog.querySelector('[data-keyboard-view="main"]')).toHaveClass('min-h-[192px]');
    expect(dialog.querySelector('[data-keyboard-view="main"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /切換鍵盤模式/ })).not.toBeInTheDocument();
    const roots = dialog.querySelector('[data-chord-key-row="roots"]');
    const modifiers = dialog.querySelector('[data-chord-key-row="modifiers"]');
    expect(roots).toHaveAttribute('data-key-surface', 'character');
    expect(modifiers).toHaveAttribute('data-key-surface', 'utility');
    expect(roots?.querySelectorAll('button')).toHaveLength(10);
    expect(roots?.querySelector('button')).toHaveClass('rounded-[12px]');
    expect(roots).toHaveTextContent('CDEFGAB♭♯m');
    expect(roots).not.toHaveTextContent('♮');
    expect(dialog.querySelector('[data-chord-key-row="suffixes"]')?.querySelectorAll('button')).toHaveLength(12);
    expect(screen.getByRole('button', { name: '加入數字 8' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'maj7' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'm7' })).not.toBeInTheDocument();
  });

  it('composes minor, extended and altered qualities one fragment at a time', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    const applyAndRerender = async (buttonName: string | RegExp) => {
      await user.click(screen.getByRole('button', { name: buttonName }));
      const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
      rerenderSession({ ...base, draftSong: nextSong });
      return nextSong;
    };

    await applyAndRerender(/^C$/);
    await applyAndRerender('加入小和弦 m');
    const minorSeven = await applyAndRerender('加入數字 7');
    expect(minorSeven.sections[0].bars[0].chords[1]).toBe('Cm7');

    const secondTarget = { ...target, slotIndex: 2, anchorKey: 'song-1|section-1|bar-1|chords|2' };
    const secondBase = createPreviewEditSession({ song, target: secondTarget, inputMode: 'letters' });
    rerenderSession(secondBase);
    await user.click(screen.getByRole('button', { name: /^C$/ }));
    let nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '加入數字 1' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '加入數字 1' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chords[2]).toBe('C11');

    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '降記號' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...secondBase, draftSong: nextSong });
    await user.click(screen.getByRole('button', { name: '加入數字 9' }));
    nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(nextSong.sections[0].bars[0].chords[2]).toBe('C11b9');
  });

  it('keeps a visual flat attached to the selected root', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: /^C$/ }));
    const withC = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...base, draftSong: withC });
    await user.click(screen.getByRole('button', { name: '降記號' }));
    const withFlat = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withFlat.sections[0].bars[0].chords[1]).toBe('Cb');
  });

  it('appends additional accidentals instead of replacing the first one', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    let currentSession = base;
    const applyAndRerender = async (buttonName: string | RegExp) => {
      await user.click(screen.getByRole('button', { name: buttonName }));
      const nextSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
      currentSession = { ...currentSession, draftSong: nextSong };
      rerenderSession(currentSession);
      return nextSong;
    };

    await applyAndRerender(/^E$/);
    await applyAndRerender('升記號');
    const sharpThenFlat = await applyAndRerender('降記號');
    expect(sharpThenFlat.sections[0].bars[0].chords[1]).toBe('E#b');

    const secondTarget = { ...target, slotIndex: 2, anchorKey: 'song-1|section-1|bar-1|chords|2' };
    currentSession = createPreviewEditSession({ song, target: secondTarget, inputMode: 'letters' });
    rerenderSession(currentSession);
    await applyAndRerender(/^E$/);
    await applyAndRerender('降記號');
    await applyAndRerender('升記號');
    const flatSharpFive = await applyAndRerender('加入數字 5');
    expect(flatSharpFive.sections[0].bars[0].chords[2]).toBe('Eb#5');
  });

  it('opens compact anchored popovers for time signatures and endings', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });

    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    const timePicker = document.querySelector('[data-keyboard-picker="time"]');
    expect(timePicker).toHaveAttribute('data-picker-placement', 'anchored');
    expect(timePicker?.querySelector('[data-picker-layout="time-grid"]')).toBeInTheDocument();
    expect(timePicker?.querySelector('[data-picker-arrow]')).toBeInTheDocument();
    expect(timePicker?.querySelectorAll('[data-time-signature-glyph]')).toHaveLength(14);
    expect(screen.getByRole('button', { name: '9/8' })).toBeInTheDocument();
    expect(document.querySelector('[data-keyboard-view="main"]')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    await user.click(screen.getByRole('button', { name: '選擇房子記號' }));
    const endingPicker = document.querySelector('[data-keyboard-picker="ending"]');
    expect(endingPicker).toHaveAttribute('data-picker-placement', 'anchored');
    expect(endingPicker?.querySelector('[data-picker-layout="ending-list"]')).toBeInTheDocument();
    expect(endingPicker?.querySelector('[data-picker-arrow]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ending 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清除房子記號' })).toBeInTheDocument();
  });

  it('keeps articulation in its own picker between rests and endings', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });
    const restTrigger = screen.getByRole('button', { name: '休止符與整小節符號' }) as HTMLButtonElement;
    const articulationTrigger = screen.getByRole('button', { name: '選擇演奏記號' }) as HTMLButtonElement;
    const endingTrigger = screen.getByRole('button', { name: '選擇房子記號' }) as HTMLButtonElement;
    const utilityButtons = Array.from(restTrigger.parentElement?.querySelectorAll('button') ?? []);
    expect(utilityButtons.indexOf(articulationTrigger)).toBe(utilityButtons.indexOf(restTrigger) + 1);
    expect(utilityButtons.indexOf(endingTrigger)).toBe(utilityButtons.indexOf(articulationTrigger) + 1);

    await user.click(restTrigger);
    expect(screen.queryByRole('button', { name: '搶拍' })).not.toBeInTheDocument();
    await user.click(restTrigger);
    await user.click(articulationTrigger);
    expect(document.querySelector('[data-keyboard-picker="articulation"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '搶拍' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拖拍' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重音' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '延長記號' })).toBeInTheDocument();
  });

  it('deletes one character from the current chord instead of clearing it', async () => {
    const user = userEvent.setup();
    const chordSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C', 'C11', '', ''] }] }]
    };
    const chordSession = createPreviewEditSession({ song: chordSong, target, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: chordSession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '刪除最後一個字元' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords[1]).toBe('C1');
  });

  it('opens notation pickers from small symbol keys and returns to the same keyboard', async () => {
    const user = userEvent.setup();
    const { onApplyDraft } = renderEditor({ deviceLayout: 'tablet' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    expect(document.querySelector('[data-keyboard-picker="barline"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '一般小節線' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '|: Repeat Start' })).toHaveTextContent('|:');
    expect(screen.getByRole('button', { name: '|: Repeat Start' })).not.toHaveTextContent('Repeat Start');
    await user.click(screen.getByRole('button', { name: '|: Repeat Start' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].repeatStart).toBe(true);
    expect(document.querySelector('[data-keyboard-picker]')).not.toBeInTheDocument();
  });

  it('keeps all structure operations in one fixed picker', async () => {
    const user = userEvent.setup();
    const { onStructure } = renderEditor({ deviceLayout: 'phone', hasCopiedBar: true });
    await user.click(screen.getByRole('button', { name: '小節操作' }));
    const actions = document.querySelector('[data-structure-actions]');
    expect(actions).toBeInTheDocument();
    expect(actions?.querySelectorAll('button')).toHaveLength(7);
    expect(actions).not.toHaveClass('overflow-y-auto');
    await user.click(within(actions as HTMLElement).getByRole('button', { name: '複製小節' }));
    expect(onStructure).toHaveBeenCalledWith('copy-bar');
    await user.click(screen.getByRole('button', { name: '小節操作' }));
    await user.click(within(document.querySelector('[data-structure-actions]') as HTMLElement).getByRole('button', { name: '貼上小節' }));
    expect(onStructure).toHaveBeenCalledWith('paste-bar-after');
    await user.click(screen.getByRole('button', { name: '小節操作' }));
    await user.click(screen.getByRole('button', { name: '拆分段落' }));
    expect(onStructure).toHaveBeenCalledWith('split-section');
  });

  it('shows direct bar copy and paste buttons on the chord keyboard', async () => {
    const user = userEvent.setup();
    const { onStructure } = renderEditor({ deviceLayout: 'phone', hasCopiedBar: true });

    await user.click(screen.getByRole('button', { name: '複製小節' }));
    expect(onStructure).toHaveBeenCalledWith('copy-bar');
    await user.click(screen.getByRole('button', { name: '貼上小節' }));
    expect(onStructure).toHaveBeenCalledWith('paste-bar-after');
  });

  it('toggles a per-bar 4/4 override off and keeps complete symbol controls', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    await user.click(screen.getByRole('button', { name: '|: Repeat Start' }));
    expect((onApplyDraft.mock.calls[0][0] as Song).sections[0].bars[0].repeatStart).toBe(true);

    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    await user.click(screen.getByRole('button', { name: '4/4' }));
    const withOverride = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withOverride.sections[0].bars[0].timeSignature).toBe('4/4');
    rerenderSession({ ...base, draftSong: withOverride });
    await user.click(screen.getByRole('button', { name: '選擇小節拍號' }));
    await user.click(screen.getByRole('button', { name: '4/4' }));
    const withoutOverride = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withoutOverride.sections[0].bars[0].timeSignature).toBeUndefined();
  });

  it('shows an inherited meter without treating it as this bar override', async () => {
    const user = userEvent.setup();
    const inheritedMeterSong: Song = {
      ...song,
      sections: [{
        ...song.sections[0],
        bars: [
          { id: 'bar-1', chords: ['C'], timeSignature: '5/4' },
          { id: 'bar-2', chords: ['G'] }
        ]
      }]
    };
    const secondTarget = {
      ...target,
      barId: 'bar-2',
      slotIndex: 4,
      anchorKey: 'song-1|section-1|bar-2|chords|4'
    };
    const base = createPreviewEditSession({ song: inheritedMeterSong, target: secondTarget, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: base, deviceLayout: 'phone' });

    const timeButton = screen.getByRole('button', { name: '選擇小節拍號' });
    expect(timeButton).toHaveTextContent('5/4');
    await user.click(timeButton);
    await user.click(screen.getByRole('button', { name: '5/4' }));

    const edited = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(edited.sections[0].bars[1].timeSignature).toBe('5/4');
  });

  it('allows repeat start and repeat end together without a normal-barline option', async () => {
    const user = userEvent.setup();
    const repeatSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C'], repeatStart: true }] }]
    };
    const repeatSession = createPreviewEditSession({ song: repeatSong, target, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: repeatSession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '選擇小節線與反覆' }));
    expect(screen.queryByRole('button', { name: '一般小節線' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ':| Repeat End' }));
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0]).toMatchObject({ repeatStart: true, repeatEnd: true });
  });

  it('opens numeric input from the multi-measure glyph and only enables it on beat one of an empty bar', async () => {
    const user = userEvent.setup();
    const emptySong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: [] }] }]
    };
    const firstBeatTarget = { ...target, slotIndex: 0, anchorKey: 'song-1|section-1|bar-1|chords|0' };
    const emptySession = createPreviewEditSession({ song: emptySong, target: firstBeatTarget, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: emptySession, deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));

    const countInput = screen.getByRole('textbox', { name: '多小節休止數量' });
    const openCountInput = screen.getByRole('button', { name: '輸入多小節休止數量' });
    expect(countInput.closest('[data-multi-rest-control]')).not.toBeNull();
    expect(countInput).toHaveAttribute('inputmode', 'numeric');
    expect(openCountInput).toBeEnabled();
    await user.click(openCountInput);
    expect(countInput).toHaveFocus();
    await user.clear(countInput);
    await user.type(countInput, '8');
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords).toEqual(['|8|', '', '', '']);

    const wrongBeatSession = createPreviewEditSession({ song: emptySong, target, inputMode: 'letters' });
    rerenderSession(wrongBeatSession);
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));
    expect(screen.getByRole('button', { name: '輸入多小節休止數量' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('只能放在第一拍');

    const occupiedFirstBeat = createPreviewEditSession({ song, target: firstBeatTarget, inputMode: 'letters' });
    rerenderSession(occupiedFirstBeat);
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));
    expect(screen.getByRole('button', { name: '輸入多小節休止數量' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('請先清空');
  });

  it('disables 0h on the final beat and explains that it needs two beats', async () => {
    const user = userEvent.setup();
    const emptySong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['', '', '', ''] }] }]
    };
    const lastBeatTarget = { ...target, slotIndex: 3, anchorKey: 'song-1|section-1|bar-1|chords|3' };
    renderEditor({
      session: createPreviewEditSession({ song: emptySong, target: lastBeatTarget, inputMode: 'letters' }),
      deviceLayout: 'phone'
    });
    await user.click(screen.getByRole('button', { name: '休止符與整小節符號' }));
    expect(screen.getByRole('button', { name: '二分休止' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('需要連續兩拍');
  });

  it('shows all four text positions together without nested tabs', async () => {
    const user = userEvent.setup();
    renderEditor({ deviceLayout: 'phone' });
    await user.click(screen.getByRole('button', { name: '文字欄位' }));
    expect(screen.getByRole('textbox', { name: '小節標籤' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '上方註記' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '左側文字' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '右側文字' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上方註記' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回和弦鍵盤' }));
    expect(screen.getByRole('button', { name: '選擇小節拍號' })).toBeInTheDocument();
  });

  it('normalizes typed roots before writing the draft', () => {
    const { onApplyDraft } = renderEditor();
    fireEvent.change(screen.getByRole('textbox', { name: '和弦直接輸入' }), { target: { value: 'bb/db' } });
    const nextSong = onApplyDraft.mock.calls[0][0] as Song;
    expect(nextSong.sections[0].bars[0].chords[1]).toBe('Bb/Db');
  });

  it('moves between beats with plain arrows while the desktop chord capture owns focus', () => {
    const chordSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C', 'C11', '', ''] }] }]
    };
    const chordSession = createPreviewEditSession({ song: chordSong, target, inputMode: 'letters' });
    const { onNavigate, onApplyDraft } = renderEditor({ session: chordSession, deviceLayout: 'desktop' });
    const capture = screen.getByRole('textbox', { name: '和弦直接輸入' }) as HTMLInputElement;

    expect(capture.selectionStart).toBe(3);
    expect(capture.selectionEnd).toBe(3);
    expect(capture).toHaveFocus();
    expect(fireEvent.keyDown(capture, { key: 'ArrowLeft' })).toBe(false);
    expect(onNavigate).toHaveBeenNthCalledWith(1, 'previous');
    expect(fireEvent.keyDown(capture, { key: 'ArrowRight' })).toBe(false);
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'next');
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onApplyDraft).not.toHaveBeenCalled();
    expect(capture).toHaveValue('C11');
  });

  it('leaves modified arrows and IME arrows to native chord text input', () => {
    const { onNavigate } = renderEditor();
    const capture = screen.getByRole('textbox', { name: '和弦直接輸入' });
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }]) {
        expect(fireEvent.keyDown(capture, { key, ...modifier })).toBe(true);
      }
    }
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('uses Space for beat navigation and Enter for next-bar navigation without binding Cmd Enter', () => {
    const { onNavigate, onDone, onStructure } = renderEditor();
    const capture = screen.getByRole('textbox', { name: '和弦直接輸入' });

    fireEvent.keyDown(capture, { key: 'ArrowLeft', shiftKey: true });
    expect(onNavigate).toHaveBeenLastCalledWith('previous', undefined, { bar: true });
    fireEvent.keyDown(capture, { key: 'ArrowRight', shiftKey: true });
    expect(onNavigate).toHaveBeenLastCalledWith('next', undefined, { bar: true });
    fireEvent.keyDown(capture, { key: ' ' });
    expect(onNavigate).toHaveBeenLastCalledWith('next');
    fireEvent.keyDown(capture, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith('next', undefined, { bar: true });
    fireEvent.keyDown(capture, { key: 'Enter', shiftKey: true });
    expect(onStructure).toHaveBeenCalledWith('insert-before');

    fireEvent.keyDown(capture, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(capture, { key: 'Enter', ctrlKey: true });
    expect(onStructure).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('finishes preview input with Escape', () => {
    const { onDone } = renderEditor();
    const capture = screen.getByRole('textbox', { name: '和弦直接輸入' });

    fireEvent.keyDown(capture, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('applies the shared barline shortcuts while the chord capture owns focus', () => {
    const finalSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C'], finalBar: true }] }]
    };
    const firstTarget = { ...target, slotIndex: 0, rawChordIndex: 0, anchorKey: 'song-1|section-1|bar-1|chords|0' };
    const { onApplyDraft, rerenderSession } = renderEditor({
      session: createPreviewEditSession({ song: finalSong, target: firstTarget, inputMode: 'letters' }),
      deviceLayout: 'desktop'
    });
    let capture = screen.getByRole('textbox', { name: '和弦直接輸入' });

    fireEvent.keyDown(capture, { key: '[', code: 'BracketLeft' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].repeatStart).toBe(true);
    fireEvent.keyDown(capture, { key: ']', code: 'BracketRight' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0]).toMatchObject({ repeatEnd: true, finalBar: false });

    const repeatEndSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C'], repeatEnd: true }] }]
    };
    rerenderSession(createPreviewEditSession({ song: repeatEndSong, target: firstTarget, inputMode: 'letters' }));
    capture = screen.getByRole('textbox', { name: '和弦直接輸入' });
    fireEvent.keyDown(capture, { key: '\\', code: 'Backslash' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0]).toMatchObject({ finalBar: true, repeatEnd: false });
  });

  it('adds repeat ending numbers with Option digit shortcuts while chord editing', () => {
    const firstTarget = { ...target, slotIndex: 0, rawChordIndex: 0, anchorKey: 'song-1|section-1|bar-1|chords|0' };
    const baseSession = createPreviewEditSession({ song, target: firstTarget, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({
      session: baseSession,
      deviceLayout: 'desktop'
    });
    let capture = screen.getByRole('textbox', { name: '和弦直接輸入' });

    fireEvent.keyDown(capture, { key: '¡', code: 'Digit1', altKey: true });
    const endingOneSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(endingOneSong.sections[0].bars[0].ending).toBe('1');

    rerenderSession(createPreviewEditSession({ song: endingOneSong, target: firstTarget, inputMode: 'letters' }));
    capture = screen.getByRole('textbox', { name: '和弦直接輸入' });
    fireEvent.keyDown(capture, { key: '™', code: 'Digit2', altKey: true });
    const endingOneTwoSong = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(endingOneTwoSong.sections[0].bars[0].ending).toBe('1,2');

    rerenderSession(createPreviewEditSession({ song: endingOneTwoSong, target: firstTarget, inputMode: 'letters' }));
    capture = screen.getByRole('textbox', { name: '和弦直接輸入' });
    fireEvent.keyDown(capture, { key: '™', code: 'Digit2', altKey: true });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].ending).toBe('1');
  });

  it('appends physical chord characters and backspaces one character on hardware layouts', () => {
    const chordSong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: ['C', 'C11', '', ''] }] }]
    };
    const chordSession = createPreviewEditSession({ song: chordSong, target, inputMode: 'letters' });
    const { onApplyDraft } = renderEditor({ session: chordSession, deviceLayout: 'tablet' });

    fireEvent.keyDown(document.body, { key: '7' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords[1]).toBe('C117');
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect((onApplyDraft.mock.calls.at(-1)?.[0] as Song).sections[0].bars[0].chords[1]).toBe('C1');
  });

  it('deletes the selected bar on Backspace only when the whole bar is empty', () => {
    const emptySong: Song = {
      ...song,
      sections: [{ ...song.sections[0], bars: [{ id: 'bar-1', chords: [] }] }]
    };
    const { onStructure } = renderEditor({
      session: createPreviewEditSession({ song: emptySong, target, inputMode: 'letters' })
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '和弦直接輸入' }), { key: 'Backspace' });
    expect(onStructure).toHaveBeenCalledWith('delete');
  });

  it('keeps Backspace navigation when the selected chord slot is empty but the bar has content', () => {
    const { onNavigate, onStructure } = renderEditor();
    fireEvent.keyDown(screen.getByRole('textbox', { name: '和弦直接輸入' }), { key: 'Backspace' });

    expect(onStructure).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('previous');
  });

  it('emphasizes delete keys consistently across all notation keyboards', () => {
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { rerenderSession } = renderEditor({ session: base, deviceLayout: 'phone' });
    expect(screen.getByRole('button', { name: '刪除最後一個字元' })).toHaveAttribute('data-key-emphasis', 'delete');

    rerenderSession(createPreviewEditSession({
      song,
      target: {
        ...target,
        field: 'rhythm',
        cursor: { kind: 'rhythm', cursorUnit: 0 }
      },
      inputMode: 'letters'
    }));
    expect(screen.getByRole('button', { name: '刪除節奏事件' })).toHaveAttribute('data-key-emphasis', 'delete');
    rerenderSession(createPreviewEditSession({
      song,
      target: {
        ...target,
        field: 'jianpu',
        cursor: { kind: 'jianpu', beatIndex: 0, unitIndex: 0, noteIndex: null }
      },
      inputMode: 'letters'
    }));
    expect(screen.getByRole('button', { name: '刪除簡譜音符' })).toHaveAttribute('data-key-emphasis', 'delete');
  });

  it('keeps hardware chord typing active after a visual key takes focus', async () => {
    const user = userEvent.setup();
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const { onApplyDraft, rerenderSession } = renderEditor({ session: base, deviceLayout: 'tablet' });
    const cButton = screen.getByRole('button', { name: /^C$/ });
    await user.click(cButton);
    const withC = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    rerenderSession({ ...base, draftSong: withC });

    fireEvent.keyDown(screen.getByRole('button', { name: /^C$/ }), { key: 'b' });
    const withFlat = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(withFlat.sections[0].bars[0].chords[1]).toBe('Cb');
  });

  it('keeps outside clicks from implicitly completing or cancelling', async () => {
    const user = userEvent.setup();
    const { onDone, onCancel } = renderEditor();
    await user.click(document.body);
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(['desktop', 'tablet', 'phone'] as const)('handles a missing or deleted target without crashing on %s', (deviceLayout) => {
    const base = createPreviewEditSession({ song, target, inputMode: 'letters' });
    const missingDraft = { ...song, sections: [{ ...song.sections[0], bars: [] }] };
    const { rerenderSession } = renderEditor({
      session: { ...base, draftSong: missingDraft, past: [song], dirty: true },
      deviceLayout
    });
    expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
    expect(screen.getByText('正在恢復選取位置，請重新點選小節')).toBeInTheDocument();

    rerenderSession({ ...base, draftSong: missingDraft, past: [song], dirty: true, targetStatus: 'deleted' });
    expect(screen.getByText('小節已刪除，可復原或完成這次編輯')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    rerenderSession(base);
    expect(screen.queryByText('小節已刪除，可復原或完成這次編輯')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '預覽快捷編輯' })).toHaveAttribute('data-notation-mode', 'chords');
  });
});

describe('preview pickup keyboard', () => {
  const pickupTarget = { ...target, sectionId: PICKUP_EDITOR_SECTION_ID, barId: PICKUP_EDITOR_BAR_ID,
    field: 'jianpu' as const, slotIndex: 0, cursor: { kind: 'jianpu' as const, beatIndex: 0, unitIndex: 0, noteIndex: null } };
  it.each(['desktop', 'phone'] as const)('edits a half-beat pickup on %s without exposing chords or changing regular bars', deviceLayout => {
    const source = { ...song, pickup: { id: 'pickup', timeSignature: '1/8' } };
    const { onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song: source, target: pickupTarget }), deviceLayout });
    expect(screen.getByRole('combobox', { name: '弱起長度' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '切換到和弦' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '輸入簡譜 5' }));
    const changed = onApplyDraft.mock.calls.at(-1)?.[0] as Song;
    expect(changed.pickup).toMatchObject({ id: 'pickup', timeSignature: '1/8', riff: '5_' });
    expect(changed.sections).toEqual(source.sections);
    expect(changed.timeSignature).toBe('4/4');
  });

  it('resizes and removes the pickup using preview controls', () => {
    const source = { ...song, pickup: { id: 'pickup', timeSignature: '1/4', riff: '5_6_' } };
    const { onApplyDraft } = renderEditor({ session: createPreviewEditSession({ song: source, target: pickupTarget }) });
    expect(screen.getByRole('option', { name: '0.5 拍' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '弱起長度' }), { target: { value: '3/8' } });
    expect(onApplyDraft.mock.calls.at(-1)?.[0].pickup).toMatchObject({ timeSignature: '3/8', riff: '5_ | 6_' });
    fireEvent.click(screen.getByRole('button', { name: '移除弱起拍' }));
    expect(onApplyDraft.mock.calls.at(-1)?.[0]).toMatchObject({ sections: source.sections, pickup: undefined });
  });

  it('continues typing, navigates, changes a selected note and deletes without looping or overwriting', () => {
    const source = { ...song, pickup: { id: 'pickup', timeSignature: '1/4' } };
    let latest = createPreviewEditSession({ song: source, target: pickupTarget });
    let renderCount = 0;
    function Harness() {
      const [session, setSession] = useState(latest);
      latest = session;
      renderCount++;
      return <PreviewBarEditor session={session} language="zh" deviceLayout="desktop" storedKey="C" displayedKey="C" storageMode="letters"
        onApplyDraft={draft => setSession(current => applyPreviewDraft(current, draft))}
        onNotationCursorChange={cursor => setSession(current => setPreviewNotationCursor(current, cursor))}
        onNotationModeChange={vi.fn()} onInputModeChange={vi.fn()} onJianpuInputAbsoluteChange={vi.fn()}
        onNavigate={vi.fn()} onStructure={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} onDone={vi.fn()} onCancel={vi.fn()} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '切換簡譜八分音符' }));
    fireEvent.click(screen.getByRole('button', { name: '輸入簡譜 5' }));
    expect(latest.cursorByMode.jianpu).toMatchObject({ unitIndex: 2, noteIndex: null });
    fireEvent.click(screen.getByRole('button', { name: '輸入簡譜 6' }));
    expect(latest.draftSong.pickup?.riff).toBe('5_6_');
    expect(latest.cursorByMode.jianpu).toMatchObject({ unitIndex: 4, noteIndex: null });
    fireEvent.click(screen.getByRole('button', { name: '輸入簡譜 7' }));
    expect(latest.draftSong.pickup?.riff).toBe('5_6_');
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Previous beat' }));
    fireEvent.click(screen.getByRole('button', { name: '輸入簡譜 2' }));
    expect(latest.draftSong.pickup?.riff).toBe('5_2_');
    fireEvent.click(screen.getByRole('button', { name: '刪除簡譜音符' }));
    expect(latest.draftSong.pickup?.riff).not.toContain('2');
    fireEvent.click(screen.getByRole('button', { name: '刪除簡譜音符' }));
    expect(latest.draftSong.pickup?.riff ?? '').not.toMatch(/[1-7]/);
    expect(latest.draftSong.sections).toEqual(source.sections);
    expect(renderCount).toBeLessThan(30);
  });
});
