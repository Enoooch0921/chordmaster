import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuditionPiano } from './lib/auditionPiano';
import { mockLyricsReadingGeometry } from './test/lyricsReadingGeometry';
import { ToastProvider } from './components/Toast';
import { getNavigationStorageKey, saveNavigationLocation } from './lib/setlistNavigationMemory';
import type { WorkspaceSnapshot } from './types';

const exports = vi.hoisted(() => vi.fn());
let fixture: WorkspaceSnapshot;
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
vi.mock('./lib/pdfExport', () => ({ exportCaptureHostToPdf: exports }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});

beforeEach(() => {
  mockLyricsReadingGeometry();
  localStorage.clear();
  exports.mockReset().mockImplementation(async (host: HTMLElement) => ({
    layout: host.querySelector<HTMLElement>('[data-book-layout]')?.dataset.bookLayout,
    titles: Array.from(host.querySelectorAll('[data-print-page] [data-book-song-title]'), node => node.textContent),
    controls: host.querySelectorAll('button, select').length,
  }));
  const songs = ['one', 'two'].map(id => ({
    id, updatedAt: 1, title: `歌曲 ${id}`, originalKey: 'C' as const, currentKey: 'C' as const, timeSignature: '4/4',
    sections: [{ id: `${id}-verse`, title: 'Verse', bars: [{ id: `${id}-bar`, chords: ['C'] }] }],
    lyricsDoc: { chinese: '[Verse]\n主歌第一行\n主歌第二行\n\n[Chorus]\n副歌第一行\n副歌第二行' },
  }));
  fixture = { songs, projects: [], joinedProjects: [], joinedSetlists: [], lastSavedAt: 1,
    setlists: [{ id: 'meeting', name: '歌詞排版聚會', displayMode: 'chord-movable-key', createdAt: 1, updatedAt: 1,
      songs: songs.map((song, order) => ({ id: `entry-${song.id}`, setlistId: 'meeting', songId: song.id, songData: song, order, sectionOrder: [song.sections[0].id] })) }],
  };
  localStorage.setItem('chordmaster.workspace-mode.v1', 'setlists');
  localStorage.setItem('chordmaster.selected-setlist-id.v1', 'meeting');
  localStorage.setItem('chordmaster.selected-setlist-song-id.v1', 'entry-one');
  saveNavigationLocation(getNavigationStorageKey(null, null), { version: 1, workspaceMode: 'setlists', filter: { kind: 'all' }, parentFilter: { kind: 'all' }, view: 'detail', setlistId: 'meeting', songId: 'entry-one' });
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

const mountLyrics = async () => {
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findByDisplayValue('歌詞排版聚會');
  fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  await waitFor(() => expect(document.querySelector('.adaptive-lyrics-reader')).not.toBeNull());
};

it.each(['written', 'arranged'])('continues one %s practice session at the current beat across lyrics and chart', async route => {
  const song = fixture.songs[0];
  song.tempo = 96;
  fixture.setlists[0].songs[0].overrideKey = 'D';
  song.sections[0].bars.push({ id: 'second-bar', chords: ['G'], tempo: 120 });
  if (route === 'arranged') song.songMap = ['Verse 1', 'Verse 2', 'Ending'].map(label => ({ label, repeats: 1 }));
  const saved = JSON.stringify(fixture);
  const play = vi.spyOn(AuditionPiano.prototype, 'play').mockImplementation(async function (plan, paint) {
    this.redirect = (_next, at) => at ?? 0;
    paint(0, plan);
    return { metronomeUnavailable: false };
  });
  const stop = vi.spyOn(AuditionPiano.prototype, 'stop');
  await mountLyrics();
  const settings = () => {
    const trigger = screen.getByRole('button', { name: '練唱設定' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 60, 44, 44));
    fireEvent.click(trigger);
  };
  const stepUp = () => fireEvent.click(screen.getByRole('button', { name: '升半音' }));
  settings();
  expect(screen.getByLabelText('目前練唱調性')).toHaveTextContent('D');
  stepUp();
  fireEvent.keyDown(screen.getByRole('button', { name: '升半音' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '開始練唱' }));
  const [plan, paint, done] = play.mock.calls[0];
  const bar = plan.bars.filter(bar => bar.sourceTitle === 'Verse').at(-1)!;
  act(() => paint(bar.start + bar.beatSeconds, plan));
  const rail = () => screen.getByRole('group', { name: '播放段落' });
  fireEvent.click(rail().querySelector<HTMLButtonElement>('button:last-child')!);
  settings();
  stepUp();
  fireEvent.change(screen.getByRole('spinbutton', { name: '練唱速度 (BPM)' }), { target: { value: '72' } });
  fireEvent.keyDown(screen.getByRole('button', { name: '升半音' }), { key: 'Escape' });

  const toggle = () => fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  const mark = () => document.querySelector('[data-practice-beat]');
  toggle();
  await waitFor(() => expect(mark()).toHaveAttribute('data-audition-bar', 'second-bar'));
  expect(mark()).toHaveAttribute('data-practice-beat', '2');
  expect(mark()).toHaveAttribute('data-audition-chart', 'entry-one');
  expect(document.querySelector('[data-audition-chart="entry-one"][data-audition-bar="one-bar"]')).toHaveTextContent('E');
  expect(document.querySelector('[data-tempo-event="second-bar"]')).toHaveTextContent('90');
  settings();
  expect(screen.getByLabelText('目前練唱調性')).toHaveTextContent('E');
  expect(screen.getByRole('spinbutton', { name: '練唱速度 (BPM)' })).toHaveValue(72);
  fireEvent.keyDown(screen.getByRole('button', { name: '升半音' }), { key: 'Escape' });
  expect(screen.getByRole('button', { name: '停止練唱' })).toHaveTextContent(bar.mapLabel!);
  act(() => paint(bar.start + 2 * bar.beatSeconds, plan));
  expect(mark()).toHaveAttribute('data-practice-beat', '3');
  toggle();
  expect(rail().querySelector('button[aria-pressed=true]')).toHaveTextContent('Ending');
  expect(mark()).toBeNull();
  toggle();
  await waitFor(() => expect(mark()).toHaveAttribute('data-practice-beat', '3'));
  expect(play).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  if (route === 'arranged') {
    act(() => paint(plan.bars.at(-1)!.start, plan));
    expect(mark()).toBeNull();
    expect(screen.getByRole('button', { name: '停止練唱' })).toHaveTextContent('Ending');
    act(done);
  } else {
    fireEvent.click(screen.getByRole('button', { name: '停止練唱' }));
  }
  expect(stop).toHaveBeenCalled();
  expect(mark()).toBeNull();
  expect(screen.getByRole('button', { name: '試聽' })).toBeInTheDocument();
  expect(document.querySelector('[data-audition-chart="entry-one"][data-audition-bar="one-bar"]')).toHaveTextContent('D');
  expect(document.querySelector('[data-tempo-event="second-bar"]')).toHaveTextContent('120');
  toggle();
  settings();
  expect(screen.getByLabelText('目前練唱調性')).toHaveTextContent('D');
  expect(screen.getByRole('spinbutton', { name: '練唱速度 (BPM)' })).toHaveValue(96);
  expect(JSON.stringify(fixture)).toBe(saved);
});

it('shares temporary audition tuning with lyrics and applies live edits to the chart and piano', async () => {
  const song = fixture.songs[0];
  song.tempo = 96;
  fixture.setlists[0].songs[0].overrideKey = 'D';
  song.sections[0].bars.push({ id: 'tempo-change', chords: ['G'], tempo: 120 });
  const saved = JSON.stringify(fixture);
  const play = vi.spyOn(AuditionPiano.prototype, 'play').mockResolvedValue({ metronomeUnavailable: false });
  const retune = vi.spyOn(AuditionPiano.prototype, 'setPracticeTuning');
  await mountLyrics();

  const toggleMode = () => fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  const openSettings = (name: string) => {
    const trigger = screen.getByRole('button', { name });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 60, 44, 44));
    fireEvent.click(trigger);
  };
  const raise = () => fireEvent.click(screen.getByRole('button', { name: '升半音' }));
  const closeSettings = () => fireEvent.keyDown(screen.getByRole('button', { name: '升半音' }), { key: 'Escape' });
  const chord = () => document.querySelector('[data-audition-chart="entry-one"][data-audition-bar="one-bar"]');
  const tempoChange = () => document.querySelector('[data-tempo-event="tempo-change"]');
  const auditionTempo = () => screen.getByRole('spinbutton', { name: '試聽速度 (BPM)' });

  toggleMode();
  fireEvent.click(screen.getByRole('button', { name: '試聽' }));
  openSettings('試聽設定');
  expect(screen.getByLabelText('目前試聽調性')).toHaveTextContent('D');
  raise();
  fireEvent.change(auditionTempo(), { target: { value: '72' } });
  expect(tempoChange()).toHaveTextContent('90');
  closeSettings();
  expect(screen.getByRole('button', { name: '試聽設定' })).toHaveFocus();

  toggleMode();
  openSettings('練唱設定');
  expect(screen.getByLabelText('目前練唱調性')).toHaveTextContent('Eb');
  expect(screen.getByRole('spinbutton', { name: '練唱速度 (BPM)' })).toHaveValue(72);
  closeSettings();
  toggleMode();
  fireEvent.click(screen.getByRole('button', { name: '試聽' }));
  fireEvent.click(screen.getByRole('button', { name: '試聽從這裡到曲尾' }));
  expect(retune).toHaveBeenLastCalledWith({ semitones: 1, tempoRatio: .75 });
  openSettings('試聽設定');
  raise();
  fireEvent.change(auditionTempo(), { target: { value: '48' } });
  expect(retune).toHaveBeenLastCalledWith({ semitones: 2, tempoRatio: .5 });
  expect(chord()).toHaveTextContent('E');
  expect(tempoChange()).toHaveTextContent('60');
  closeSettings();

  toggleMode();
  expect(screen.getByRole('button', { name: '停止和弦播放' })).toBeInTheDocument();
  toggleMode();
  expect(screen.getByRole('button', { name: '停止試聽' })).toBeInTheDocument();
  expect(play).toHaveBeenCalledTimes(1);
  act(play.mock.calls[0][2]);
  expect(chord()).toHaveTextContent('D');
  expect(tempoChange()).toHaveTextContent('120');
  openSettings('試聽設定');
  expect(auditionTempo()).toHaveValue(96);
  expect(JSON.stringify(fixture)).toBe(saved);
});

it('opens locked reading, navigates songs, and retains both A4 layouts independently of reading size', async () => {
  const original = JSON.stringify(fixture);
  await mountLyrics();
  expect(document.querySelector('[data-lyrics-workspace-mode]')).toHaveAttribute('data-lyrics-workspace-mode', 'reading');
  expect(screen.getByRole('combobox', { name: '目前歌曲' }).closest('.slw-toolbar')).not.toBeNull();
  expect(document.querySelector('.alr-heading')).toBeNull();
  expect(document.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'entry-one');
  expect(document.querySelector('.alr-canvas button')).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'entry-two' } });
  expect(screen.getByRole('combobox', { name: '目前歌曲' })).toHaveValue('entry-two');
  fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }));
  fireEvent.click(screen.getByRole('button', { name: '放大歌詞' }));
  expect(document.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-font-size', '26');
  fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
  expect(document.querySelector('[data-print-page]')).toHaveTextContent('《歌曲 one》');
  expect(parseFloat((document.querySelector('[data-print-page]') as HTMLElement).style.fontSize)).toBeCloseTo(16 * 4 / 3);
  expect(screen.getByRole('combobox', { name: 'A4 版面' }).closest('.slw-paper')).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'compact' } });
  expect(document.querySelector('.lyrics-book')).toHaveAttribute('data-book-layout', 'compact');
  fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'readable' } });
  expect(document.querySelector('.lyrics-book')).toHaveAttribute('data-book-layout', 'readable');
  expect(JSON.stringify(fixture)).toBe(original);
});

it('exports the selected layout through the real PDF action, including from reading view', async () => {
  await mountLyrics();
  for (const layout of ['readable', 'compact'] as const) {
    fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: layout } });
    if (layout === 'compact') fireEvent.click(screen.getByRole('button', { name: '閱讀' }));
    fireEvent.click(screen.getAllByRole('button', { name: '更多' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '匯出歌單 PDF' }));
    await waitFor(() => expect(exports).toHaveBeenCalledTimes(layout === 'readable' ? 1 : 2));
    expect(await exports.mock.results.at(-1)!.value).toEqual({ layout, titles: ['1. 《歌曲 one》', '2. 《歌曲 two》'], controls: 0 });
    await waitFor(() => expect(document.querySelector('[data-pdf-capture-root]')).toBeNull());
  }
});

it('releases the capture workspace and offers the prepared setlist PDF as a named download', async () => {
  const file = new File(['%PDF-1.4'], '歌詞排版聚會_首調.pdf', { type: 'application/pdf' });
  exports.mockResolvedValueOnce(file);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:setlist');
  await mountLyrics();
  fireEvent.click(screen.getAllByRole('button', { name: '更多' })[0]);
  fireEvent.click(await screen.findByRole('button', { name: '匯出歌單 PDF' }));
  const dialog = await screen.findByRole('dialog', { name: 'PDF 已準備好' });
  expect(dialog).toHaveTextContent(file.name);
  expect(document.querySelector('[data-pdf-capture-root]')).toBeNull();
  expect(document.body).not.toHaveClass('exporting-pdf');
  const download = screen.getByRole('link', { name: '開啟或下載 PDF' });
  expect(download).toHaveAttribute('download', file.name);
  expect(download).toHaveAttribute('href', 'blob:setlist');
  fireEvent.click(screen.getByRole('button', { name: '關閉' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
});

it('uses screen reading in performance independently of the chosen A4 layout', async () => {
  await mountLyrics();
  fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'A4 版面' }), { target: { value: 'compact' } });
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  await waitFor(() => expect(document.querySelector('[data-performance-overlay] .adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'entry-one'));
  expect(document.querySelector('[data-performance-overlay] [data-print-page]')).toBeNull();
});

it('edits only the chosen entry after explicit Edit, returns to locked reading, and restores the chart viewport', async () => {
  await mountLyrics();
  fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'entry-two' } });
  fireEvent.click(screen.getByRole('button', { name: '編輯' }));
  expect(screen.queryByRole('button', { name: '切換 A4 排版' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^中文歌詞 Verse/ }));
  const input = screen.getByRole('textbox', { name: /^中文歌詞 Verse/ });
  fireEvent.change(input, { target: { value: '修改第二首主歌' } });
  fireEvent.blur(input);
  fireEvent.click(screen.getByRole('button', { name: '完成編輯' }));
  expect(document.querySelector('[data-reading-song="entry-two"]')).toHaveTextContent('修改第二首主歌');
  fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'entry-one' } });
  expect(document.querySelector('[data-reading-song="entry-one"]')).toHaveTextContent('主歌第一行');
  expect(document.querySelector('.lyrics-book textarea')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  await waitFor(() => expect(document.querySelector('[data-print-preview-container]')).not.toBeNull());
  expect(document.querySelector('[data-lyrics-workspace-mode]')).toBeNull();
});

it('turns lyrics once per pedal press and retains the page on an App refresh', async () => {
  const lyrics = Array.from({ length: 150 }, (_, i) => `主歌歌詞第 ${i + 1} 行`).join('\n');
  for (const song of fixture.songs) song.lyricsDoc = { chinese: lyrics };
  for (const entry of fixture.setlists[0].songs) entry.songData = fixture.songs.find(song => song.id === entry.songId);
  await mountLyrics();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const reader = () => document.querySelector('[data-performance-overlay] .adaptive-lyrics-reader');
  await waitFor(() => expect(Number(reader()?.getAttribute('data-page-count'))).toBeGreaterThan(2));
  fireEvent.keyDown(window, { key: 'ArrowRight', code: 'ArrowRight' });
  fireEvent.keyUp(window, { key: 'ArrowRight', code: 'ArrowRight' });
  expect(reader()).toHaveAttribute('data-reading-page', '2');
  act(() => window.dispatchEvent(new Event('offline')));
  expect(reader()).toHaveAttribute('data-reading-page', '2');
});

it('preserves native section-button activation in performance', async () => {
  fixture.songs[0].lyricsDoc = { chinese: '[Verse 1]\n' + Array.from({ length: 50 }, (_, i) => `主歌 ${i}`).join('\n') };
  fixture.setlists[0].songs[0].songData = fixture.songs[0];
  await mountLyrics();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const overlay = document.querySelector('[data-performance-overlay]')!;
  const section = overlay.querySelector<HTMLButtonElement>('[data-lyrics-section-target]')!;
  section.focus();
  const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
  act(() => section.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(overlay.querySelector('.adaptive-lyrics-reader')).toHaveAttribute('data-reading-song', 'entry-one');
  expect(section).toHaveFocus();
});

it('retains the single-song reading anchor across its original A4 print view', async () => {
  localStorage.removeItem('chordmaster.workspace-mode.v1');
  localStorage.removeItem('chordmaster.selected-setlist-id.v1');
  localStorage.removeItem('chordmaster.selected-setlist-song-id.v1');
  localStorage.removeItem(getNavigationStorageKey(null, null));
  fixture.songs[0].lyricsDoc = { chinese: Array.from({ length: 80 }, (_, i) => `單首歌第 ${i + 1} 行`).join('\n') };
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findAllByRole('button', { name: '歌詞模式' });
  fireEvent.click(screen.getAllByRole('button', { name: '歌詞模式' })[0]);
  await waitFor(() => expect(document.querySelector('.adaptive-lyrics-reader')).not.toBeNull());
  fireEvent.keyDown(screen.getByLabelText('當頁歌詞'), { key: 'ArrowRight' });
  const firstLine = document.querySelector('.alr-columns [data-source-line]')!.getAttribute('data-source-line');
  fireEvent.click(screen.getByRole('button', { name: '列印排版' }));
  expect(document.querySelector('.adaptive-lyrics-reader')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '大字閱讀' }));
  expect(document.querySelector(`.alr-columns [data-source-line="${firstLine}"]`)).not.toBeNull();
});

it('remembers a pinch in the stage reader when returning to the workspace, without turning or resizing another song', async () => {
  await mountLyrics();
  fireEvent.click(screen.getAllByRole('button', { name: /^演出模式$/ })[0]);
  const stage = await waitFor(() => {
    const element = document.querySelector('[data-performance-overlay] .alr-canvas');
    expect(element).toBeInTheDocument();
    return element!;
  });
  const point = (x: number, id: number) => ({ clientX: x, clientY: 60, identifier: id, target: stage });
  const a = point(40, 4), b = point(140, 5), end = point(190, 5);
  fireEvent.touchStart(stage, { touches: [a] });
  fireEvent.touchStart(stage, { touches: [a, b] });
  fireEvent.touchMove(stage, { touches: [a, end] });
  fireEvent.touchEnd(stage, { touches: [a], changedTouches: [end] });
  fireEvent.touchEnd(stage, { touches: [], changedTouches: [a] });
  fireEvent.click(stage, { clientX: 320, detail: 1 });
  expect(stage.closest('[data-reading-song]')).toHaveAttribute('data-reading-song', 'entry-one');
  expect(stage.closest('[data-reading-song]')).toHaveAttribute('data-font-size', '36');
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(document.querySelector('[data-performance-overlay]')).toBeNull());
  expect(document.querySelector('[data-reading-song]')).toHaveAttribute('data-font-size', '36');
  fireEvent.change(screen.getByRole('combobox', { name: '目前歌曲' }), { target: { value: 'entry-two' } });
  expect(document.querySelector('[data-reading-song]')).toHaveAttribute('data-font-size', '24');
});
