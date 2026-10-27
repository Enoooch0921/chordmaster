import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import type { PreviewEditorDeviceLayout } from '../lib/previewEditorLayout';
import PreviewWysiwygEditor, { type PreviewWysiwygTarget } from './PreviewWysiwygEditor';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const song: Song = {
  title: 'Metadata test',
  originalKey: 'C',
  currentKey: 'C',
  timeSignature: '4/4',
  tempo: 72,
  shuffle: true,
  sections: [{ id: 'section-1', title: 'Verse', bars: [{ id: 'bar-1', chords: ['C'] }] }]
};

const anchorRect = {
  left: 420,
  top: 120,
  right: 500,
  bottom: 152,
  width: 80,
  height: 32
};

const makeTarget = (field: PreviewWysiwygTarget['field']): PreviewWysiwygTarget => ({
  field,
  anchorRect,
  anchorKey: `song-1|meta|${field}`,
  previewIdentity: 'song-1'
});

const StatefulEditor = ({
  deviceLayout,
  field = 'metadata'
}: {
  deviceLayout: PreviewEditorDeviceLayout;
  field?: PreviewWysiwygTarget['field'];
}) => {
  const [currentSong, setCurrentSong] = React.useState(song);
  return (
    <PreviewWysiwygEditor
      song={currentSong}
      language="zh"
      target={makeTarget(field)}
      deviceLayout={deviceLayout}
      currentKey={currentSong.currentKey}
      currentCapo={currentSong.capo ?? 0}
      originalKey={currentSong.originalKey}
      jianpuInputAbsolute={currentSong.jianpuInputAbsolute ?? false}
      onJianpuInputAbsoluteChange={(value) => setCurrentSong({ ...currentSong, jianpuInputAbsolute: value })}
      showReferenceFields
      onChange={setCurrentSong}
      onKeyChange={() => undefined}
      onCapoChange={() => undefined}
      onClose={() => undefined}
    />
  );
};

describe('PreviewWysiwygEditor song information panel', () => {
  it('keeps the panel open while Shuffle is turned off and back on', () => {
    render(<StatefulEditor deviceLayout="phone" />);

    const dialog = screen.getByRole('dialog', { name: '歌曲資訊' });
    const shuffle = screen.getByRole('checkbox', { name: 'Shuffle' });
    expect(shuffle).toBeChecked();

    fireEvent.click(shuffle);
    expect(shuffle).not.toBeChecked();
    expect(dialog).toBeInTheDocument();

    fireEvent.click(shuffle);
    expect(shuffle).toBeChecked();
    expect(dialog).toBeInTheDocument();
  });

  it('uses readable phone fields and focuses the tapped field', async () => {
    const { container } = render(<StatefulEditor deviceLayout="phone" field="title" />);
    const panel = container.querySelector<HTMLElement>('[data-song-metadata-panel]');
    const titleInput = container.querySelector<HTMLInputElement>('[data-song-metadata-field="title"] input');

    expect(panel?.dataset.deviceLayout).toBe('phone');
    expect(screen.getByRole('textbox', { name: '歌名' })).toBe(titleInput);
    await waitFor(() => expect(document.activeElement).toBe(titleInput));
  });

  it('exposes complete phone editing through song, chart and audio tabs', () => {
    render(<StatefulEditor deviceLayout="phone" />);
    expect(screen.getByRole('tab', { name: '歌曲資料' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '參考音源' }));
    expect(screen.getByRole('group', { name: '樂團版本' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '歌手版本' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '譜面設定' }));
    expect(screen.getByText('簡譜輸入設定')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '樂團版本' })).toBeNull();
  });

  it('supports keyboard navigation between phone editing tabs', () => {
    render(<StatefulEditor deviceLayout="phone" />);
    fireEvent.keyDown(screen.getByRole('tab', { name: '歌曲資料' }), { key: 'ArrowRight' });
    const layout = screen.getByRole('tab', { name: '譜面設定' });
    expect(layout).toHaveAttribute('aria-selected', 'true');
    expect(layout).toHaveFocus();
  });

  it('closes the phone panel from a keyboard-activated Done button', async () => {
    const onClose = vi.fn();
    render(<PreviewWysiwygEditor song={song} language="zh" target={makeTarget('metadata')}
      deviceLayout="phone" currentKey="C" currentCapo={0} originalKey="C"
      onChange={() => undefined} onKeyChange={() => undefined} onCapoChange={() => undefined} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('opens the complete song information panel from the metadata target', () => {
    const { container } = render(<StatefulEditor deviceLayout="tablet" />);
    const panel = container.querySelector<HTMLElement>('[data-song-metadata-panel]');

    expect(panel?.dataset.deviceLayout).toBe('tablet');
    expect(panel).not.toHaveClass('grid-cols-2');
    expect(screen.getByText('編輯歌曲')).toBeInTheDocument();
    expect(screen.getByText('參考音源')).toBeInTheDocument();
    expect(screen.getByText('簡譜輸入設定')).toBeInTheDocument();
  });

  it('edits the song metadata key instead of the temporary transpose key', () => {
    const onMetadataKeyChange = vi.fn();
    const onKeyChange = vi.fn();
    render(
      <PreviewWysiwygEditor
        song={{ ...song, originalKey: 'C', currentKey: 'D' }}
        language="zh"
        target={makeTarget('key')}
        deviceLayout="desktop"
        currentKey="D"
        currentCapo={0}
        originalKey="C"
        metadataKeyValue="C"
        onMetadataKeyChange={onMetadataKeyChange}
        onChange={() => undefined}
        onKeyChange={onKeyChange}
        onCapoChange={() => undefined}
        onClose={() => undefined}
      />
    );

    const ebOption = screen.getByText('Eb').closest('button');
    expect(ebOption).not.toBeNull();
    fireEvent.click(ebOption!);
    expect(onMetadataKeyChange).toHaveBeenCalledWith('Eb', 'major');
    expect(onKeyChange).not.toHaveBeenCalled();
  });

  it('edits the temporary transpose key from the performance key target', () => {
    const onMetadataKeyChange = vi.fn();
    const onKeyChange = vi.fn();
    render(
      <PreviewWysiwygEditor
        song={{ ...song, originalKey: 'C', currentKey: 'D' }}
        language="zh"
        target={makeTarget('performanceKey')}
        deviceLayout="desktop"
        currentKey="D"
        currentCapo={0}
        originalKey="C"
        metadataKeyValue="C"
        onMetadataKeyChange={onMetadataKeyChange}
        onChange={() => undefined}
        onKeyChange={onKeyChange}
        onCapoChange={() => undefined}
        onClose={() => undefined}
      />
    );

    const ebOption = screen.getByText('Eb').closest('button');
    expect(ebOption).not.toBeNull();
    fireEvent.click(ebOption!);
    expect(onKeyChange).toHaveBeenCalledWith('Eb', 'major');
    expect(onMetadataKeyChange).not.toHaveBeenCalled();
  });

  it('anchors the complete panel at desktop width', () => {
    const { container } = render(<StatefulEditor deviceLayout="desktop" />);
    const dialog = screen.getByRole('dialog', { name: '歌曲資訊' });
    const shell = dialog.parentElement;

    expect(container.querySelector('[data-preview-metadata-backdrop]')).toBeNull();
    expect(shell).toHaveStyle({ width: '900px' });
  });

  it('closes the complete panel with Escape', async () => {
    const onClose = vi.fn();
    render(
      <PreviewWysiwygEditor
        song={song}
        language="zh"
        target={makeTarget('metadata')}
        deviceLayout="desktop"
        currentKey="C"
        currentCapo={0}
        originalKey="C"
        onChange={() => undefined}
        onKeyChange={() => undefined}
        onCapoChange={() => undefined}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: '歌曲資訊' }), { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('reverting an accidental credit edit', () => {
  it.each(['desktop', 'tablet', 'phone'] as const)('keeps the original credit fields and source status on %s', async deviceLayout => {
    const original: Song = { ...song, lyricist: 'Original Writer', composer: 'Original Composer', translator: 'original translator' };
    let latest = original;
    const onClose = vi.fn();
    function CreditsEditor() {
      const [value, setValue] = React.useState(original);
      return <PreviewWysiwygEditor song={value} language="zh" target={makeTarget('credits')} deviceLayout={deviceLayout}
        currentKey="C" currentCapo={0} originalKey="C" onChange={next => { latest = next; setValue(next); }}
        onKeyChange={() => {}} onCapoChange={() => {}} onClose={onClose} />;
    }
    const { container } = render(<CreditsEditor />);
    const input = deviceLayout === 'desktop' ? screen.getByRole('textbox', { name: '版本 / 詞曲' })
      : container.querySelector<HTMLInputElement>('[data-song-metadata-field="credits"] input')!;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Original Writer / Original Composer1' } });
    fireEvent.change(input, { target: { value: 'Original Writer / Original Composer' } });
    if (deviceLayout === 'desktop') fireEvent.keyDown(input, { key: 'Enter' });
    else fireEvent.blur(input);
    expect(latest).toEqual(original);
    const { classifySetlistSource } = await import('../lib/setlistSourceSync');
    expect(classifySetlistSource(original, latest, { songId: 'song', sourceContent: original, entryContent: original, sourceRevision: '2026-10-27', capturedAt: '2026-10-27' })).toBe('aligned');
  });

  it('does not rewrite authors when only the translator text is entered and removed', () => {
    const original: Song = { ...song, composer: 'Original Composer', translator: 'original translator' };
    const onChange = vi.fn();
    render(<PreviewWysiwygEditor song={original} language="zh" target={makeTarget('credits')} deviceLayout="desktop"
      currentKey="C" currentCapo={0} originalKey="C" onChange={onChange} onKeyChange={() => {}} onCapoChange={() => {}} onClose={() => {}} />);
    const input = screen.getByRole('textbox', { name: '翻譯' });
    fireEvent.change(input, { target: { value: 'original translator1' } });
    fireEvent.change(input, { target: { value: 'original translator' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '版本 / 詞曲' }), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

it.each(['tablet', 'phone'] as const)('preserves unchanged translator capitalization on %s', deviceLayout => {
  const original: Song = { ...song, composer: 'Original Composer', translator: 'original translator' };
  let latest = original;
  function CreditsEditor() {
    const [value, setValue] = React.useState(original);
    return <PreviewWysiwygEditor song={value} language="zh" target={makeTarget('credits')} deviceLayout={deviceLayout}
      currentKey="C" currentCapo={0} originalKey="C" onChange={next => { latest = next; setValue(next); }}
      onKeyChange={() => {}} onCapoChange={() => {}} onClose={() => {}} />;
  }
  const { container } = render(<CreditsEditor />);
  const input = container.querySelector<HTMLInputElement>('[data-song-metadata-field="translator"] input')!;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'original translator1' } });
  fireEvent.change(input, { target: { value: 'original translator' } });
  fireEvent.blur(input);
  expect(latest).toEqual(original);
});
