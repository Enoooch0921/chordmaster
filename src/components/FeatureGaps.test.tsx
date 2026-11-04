import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Song } from '../types';
import KeyPicker from './KeyPicker';
import ChordSheet from './ChordSheet';
import LyricsSheet from './LyricsSheet';
import LyricsDocEditor from './LyricsDocEditor';
import TempoChangeControl from './TempoChangeControl';
import ReferencePlayer from './ReferencePlayer';
import PreviewBarEditor from './preview-edit/PreviewBarEditor';
import { createPreviewEditSession } from '../lib/previewEditSession';
import { currentKeyMode, formatKeyName } from '../utils/keyMode';
import { getSongTempoStates } from '../utils/tempoEvents';
import { normalizeSongBars } from '../lib/workspace';
import { updateEditableBarFields } from '../lib/songEditing';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const source: Song = {
  title: 'Feature verification', originalKey: 'D', currentKey: 'D', tempo: 72.5, timeSignature: '4/4', chordTimingVersion: 2,
  sections: [{ id: 'verse', title: 'Verse', bars: [{ id: 'bar', chords: ['D', 'G', 'A', 'D'] }] }]
};

it('switches mode, transposes, restores original mode, and survives a JSON reload without changing harmony', async () => {
  function Picker() {
    const [song, setSong] = React.useState<Song>({ ...source, originalKeyMode: 'minor' });
    const save = (song: Song) => setSong(normalizeSongBars(JSON.parse(JSON.stringify(song))));
    return <><KeyPicker value={song.currentKey} mode={currentKeyMode(song)} originalKey={song.originalKey} originalMode={song.originalKeyMode}
      language="zh" label="Key" onModeChange={mode => save({ ...song, currentKeyMode: mode })}
      onChange={(key, mode) => key && save({ ...song, currentKey: key, currentKeyMode: mode })} />
      <output>{formatKeyName(song.currentKey, currentKeyMode(song))}</output>
      <pre data-testid="harmony">{JSON.stringify(song.sections)}</pre></>;
  }
  render(<Picker />);
  fireEvent.click(screen.getByRole('button', { name: 'Dm' }));
  expect(screen.getByText('小調').closest('button')!).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByText('Em', { selector: 'button' }));
  expect(screen.getByRole('status')).toHaveTextContent('Em');
  fireEvent.click(screen.getByRole('button', { name: 'Em' }));
  fireEvent.click(screen.getByText('大調').closest('button')!);
  expect(screen.getByRole('status')).toHaveTextContent('E');
  fireEvent.click(screen.getByText(/還原原調 Dm/).closest('button')!);
  expect(screen.getByRole('status')).toHaveTextContent('Dm');
  expect(JSON.parse(screen.getByTestId('harmony').textContent!)).toEqual(normalizeSongBars(source).sections);
});

it('renders the selected key mode in score headers without turning major chords into minor chords', () => {
  const { container } = render(<ChordSheet song={{ ...source, currentKeyMode: 'minor' }} currentKey="D" language="zh" />);
  expect(container).toHaveTextContent('Key - Dm');
  expect(container.querySelector('[data-preview-owner-slot="0"]')).toHaveTextContent('D');
  expect(container.querySelector('[data-preview-owner-slot="0"]')).not.toHaveTextContent('Dm');
});

it('preserves annotation case in the score and subdivision rows keep timing markers outside shrink clipping', () => {
  const annotation = 'EG G4 F/C 8 beats · rit. pno';
  const { container } = render(<ChordSheet song={{ ...source, sections: [{ ...source.sections[0], bars: [{ id: 'bar', chords: ['E/A<', '', '', ''], chordSubdivisions: [{ beat: 0, offset: .5, chord: 'D/A' }], annotation }] }] }} currentKey="D" language="zh" />);
  expect(screen.getByText(annotation)).toBeInTheDocument();
  const row = container.querySelector('[data-notation-aligned-chords="beats"]');
  expect(row).not.toBeNull();
  expect(row?.querySelector('[data-chord-event-kind="primary"] [data-chord-marker="push"]')).not.toBeNull();
  expect(row?.querySelector('[data-aligned-chord-content]')).not.toHaveClass('overflow-hidden');
});

it('uses Korean labels and preserves all text and pairing when changing translation language and editing a line', () => {
  const block = { id: 'lyrics', marker: 'Verse', chinese: '祢是盼望', english: '나의 소망' };
  let latest: Song | undefined;
  function Sheet() {
    const [song, setSong] = React.useState({ ...source, lyricsDoc: { chinese: '[Verse]\n祢是盼望', english: '[Verse]\n나의 소망', blocks: [block] } } as Song);
    return <LyricsSheet song={song} language="zh" onChange={song => { latest = normalizeSongBars(JSON.parse(JSON.stringify(song))); setSong(latest); }} />;
  }
  render(<Sheet />);
  fireEvent.change(screen.getByLabelText('對照語言'), { target: { value: 'ko' } });
  expect(latest?.lyricsDoc?.blocks).toEqual([block]);
  expect(screen.getByRole('button', { name: '韓文歌詞 Verse' })).toHaveTextContent('나의 소망');
  fireEvent.click(screen.getByRole('button', { name: '韓文歌詞 Verse' }));
  const field = screen.getByRole('textbox', { name: '韓文歌詞 Verse' });
  fireEvent.change(field, { target: { value: '나의 소망!' } }); fireEvent.blur(field);
  expect(latest?.lyricsDoc?.translationLanguage).toBe('ko');
  expect(latest?.lyricsDoc?.blocks?.[0]).toMatchObject({ chinese: block.chinese, english: '나의 소망!' });
});

it('imports a second language using its selected name and saves the metadata', () => {
  const change = vi.fn();
  render(<LyricsDocEditor song={source} language="zh" onChange={change} />);
  fireEvent.change(screen.getByLabelText('對照語言'), { target: { value: 'ko' } });
  fireEvent.click(screen.getByRole('button', { name: '添加韓文對照' }));
  fireEvent.change(screen.getByLabelText('貼上中文歌詞'), { target: { value: '[Verse]\n祢是盼望' } });
  fireEvent.change(screen.getByLabelText('貼上韓文歌詞'), { target: { value: '[Verse]\n나의 소망' } });
  fireEvent.click(screen.getByRole('button', { name: '套用整首歌詞' }));
  expect(change.mock.calls[0][0].lyricsDoc).toMatchObject({ translationLanguage: 'ko', blocks: [{ chinese: '祢是盼望', english: '나의 소망' }] });
});

it('carries tempo events across sections, gives bar events priority, and restores the live song baseline', () => {
  const song: Song = { ...source, sections: [
    { ...source.sections[0], tempo: 65, bars: [{ id: 'a', chords: ['D'] }, { id: 'b', chords: ['A'], tempo: 68.5 }] },
    { id: 'chorus', title: 'Chorus', bars: [{ id: 'c', chords: ['G'] }, { id: 'd', chords: ['D'], resetTempo: true }] },
    { id: 'outro', title: 'Outro', resetTempo: true, bars: [{ id: 'e', chords: ['D'], tempo: 70 }] }
  ] };
  const reload = normalizeSongBars(JSON.parse(JSON.stringify(song)));
  expect(getSongTempoStates(reload).barTempos).toEqual([[65, 68.5], [68.5, 72.5], [70]]);
  expect(getSongTempoStates({ ...reload, tempo: 80 }).barTempos).toEqual([[65, 68.5], [68.5, 80], [70]]);
  const edited = updateEditableBarFields(reload, { sectionId: 'chorus', barId: 'c' }, { tempo: 66.25 });
  expect(getSongTempoStates(edited).barTempos[1]).toEqual([66.25, 72.5]);
  const { container } = render(<ChordSheet song={reload} currentKey="D" language="zh" />);
  expect(container.querySelector('[data-tempo-event="a"]')).toHaveTextContent('65');
  expect(container.querySelector('[data-tempo-event="d"]')).toHaveTextContent('72.5');
});

it('rejects tempo ranges instead of converting 72–74 into 400 BPM', () => {
  const change = vi.fn();
  render(<TempoChangeControl value={{ tempo: 65 }} language="zh" label="段落速度" onChange={change} />);
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '設定段落速度' }));
  const input = screen.getByLabelText('段落速度 BPM');
  fireEvent.change(input, { target: { value: '72–74' } }); fireEvent.blur(input);
  expect(change).not.toHaveBeenCalled(); expect(screen.getByRole('alert', { hidden: true })).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '72.5' } }); fireEvent.blur(input);
  expect(change).toHaveBeenLastCalledWith({ tempo: 72.5, resetTempo: undefined });
  fireEvent.change(screen.getByLabelText('段落速度'), { target: { value: 'reset' } });
  expect(change).toHaveBeenLastCalledWith({ tempo: undefined, resetTempo: true });
});

it('offers chart tempo events in the reference player and applies the selected practice rate', () => {
  const song: Song = { ...source, references: { band: { url: 'https://www.youtube.com/watch?v=abcdefghijk', bpm: 72.5 } },
    sections: [{ ...source.sections[0], tempo: 65 }] };
  const { container } = render(<ReferencePlayer song={song} currentKey="D" activeKind="band" language="zh" onKindChange={() => {}} onClose={() => {}} />);
  const post = vi.spyOn(container.querySelector('iframe')!.contentWindow!, 'postMessage');
  const apply = screen.getByRole('button', { name: '套用練習速度' });
  expect(apply).toBeDisabled();
  fireEvent.change(screen.getByLabelText('譜面速度位置'), { target: { value: '0:0' } });
  expect(screen.getByRole('option', { name: 'Verse · 小節 1 · 65 BPM' })).toBeInTheDocument();
  fireEvent.click(apply);
  expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [65 / 72.5] }), 'https://www.youtube.com');
  expect(screen.getByText('65 BPM')).toBeInTheDocument();
});

it.each(['timing-unspecified', 'key-unspecified', 'unmetered'] as const)('preserves annotation case in %s score blocks', kind => {
  const annotation = 'G4 F/C · eBow · AG 8 beats';
  const bar = { id: 'bar', chords: ['D'], annotation,
    ...(kind === 'timing-unspecified' ? { chordTimingUnspecified: true } : kind === 'key-unspecified' ? { chordKeyUnspecified: true } : { unmeteredChordLines: [['D', 'G']] }) };
  render(<ChordSheet song={{ ...source, sections: [{ ...source.sections[0], bars: [bar] }] }} currentKey="D" language="zh" />);
  expect(screen.getByText(annotation)).toBeInTheDocument();
});

it('edits bar and section tempo from the subdivision editor without changing the chords', () => {
  const song: Song = { ...source, sections: [{ ...source.sections[0], bars: [{ ...source.sections[0].bars[0], chordSubdivisions: [{ beat: 0, offset: .5, chord: 'A' }] }] }] };
  const session = createPreviewEditSession({ song, inputMode: 'letters', target: {
    kind: 'bar', previewIdentity: 'fixture', sectionId: 'verse', barId: 'bar', field: 'chords', slotIndex: 0, rawChordIndex: 0,
    anchorKey: 'fixture|verse|bar|chords|0', anchorRect: { left: 20, top: 20, right: 40, bottom: 40, width: 20, height: 20 }
  } });
  const apply = vi.fn();
  render(<PreviewBarEditor session={session} language="zh" deviceLayout="desktop" storedKey="D" displayedKey="D" storageMode="letters"
    onApplyDraft={apply} onInputModeChange={() => {}} onNotationModeChange={() => {}} onNotationCursorChange={() => {}}
    onJianpuInputAbsoluteChange={() => {}} onNavigate={() => {}} onStructure={() => {}} onUndo={() => {}} onRedo={() => {}} onDone={() => {}} onCancel={() => {}} />);
  expect(screen.getByRole('button', { name: '拍內和弦與指定遍數和弦' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: '拍內和弦與指定遍數和弦' }));
  expect(screen.getByRole('button', { name: '拍內和弦與指定遍數和弦' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByText('速度變化'));
  fireEvent.click(screen.getByRole('button', { name: '設定小節速度' }));
  fireEvent.change(screen.getByLabelText('小節速度'), { target: { value: 'reset' } });
  expect(apply.mock.calls.at(-1)![0].sections[0].bars[0]).toMatchObject({ resetTempo: true, chords: song.sections[0].bars[0].chords, chordSubdivisions: song.sections[0].bars[0].chordSubdivisions });
  fireEvent.click(screen.getByRole('button', { name: '設定段落速度' }));
  fireEvent.change(screen.getByLabelText('段落速度'), { target: { value: 'custom' } });
  expect(apply.mock.calls.at(-1)![0].sections[0].tempo).toBe(120);
});

it('keeps tempo changes as compact key-change badges without increasing row spacing or pagination', () => {
  const bars = Array.from({ length: 8 }, (_, index) => ({ id: `compact-${index}`, chords: ['D'] }));
  const base = { ...source, sections: [{ ...source.sections[0], bars }] };
  const { container, rerender } = render(<ChordSheet song={base} currentKey="D" language="zh" />);
  const weights = () => Array.from(container.querySelectorAll('[data-preview-layout-weight]'), node => node.getAttribute('data-preview-layout-weight'));
  const originalWeights = weights();
  const originalPages = container.querySelectorAll('[data-print-page]').length;
  rerender(<ChordSheet song={{ ...base, sections: [{ ...base.sections[0], tempo: 65, bars: bars.map((bar, index) => index === 1 ? { ...bar, tempo: 68.5, keyChangeTo: 'E', annotation: 'AG 8 beats' } : bar) }] }} currentKey="D" language="zh" />);
  expect(weights()).toEqual(originalWeights);
  expect(container.querySelectorAll('[data-print-page]')).toHaveLength(originalPages);
  const badge = container.querySelector('[data-tempo-event="compact-1"]')!.closest('[data-score-change-tag]');
  expect(badge).toHaveClass('-top-[10px]');
  expect(badge).toHaveTextContent('Key: E');
  expect(badge).toHaveTextContent('68.5');
  expect(screen.getByText('AG 8 beats')).toBeInTheDocument();
  for (const row of container.querySelectorAll<HTMLElement>('[data-preview-layout-weight]')) expect(row.style.marginTop).toBe('');
});
