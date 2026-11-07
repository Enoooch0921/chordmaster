import React from 'react';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrummerMode, { type DrummerSession } from './DrummerMode';
import type { Song } from '../types';
import type { MidiEvents } from '../lib/midiInput';
import { MIDI_PROFILE_KEY } from '../lib/drummerMidi';
const audio = vi.hoisted(() => ({ start: vi.fn(), prepare: vi.fn(async () => {}), stop: vi.fn(), update: vi.fn(), playing: false, starting: false, beat: -1, notice: null }));
const fullscreen = vi.hoisted(() => ({ requestFullscreen: vi.fn(), exitFullscreen: vi.fn(), canRequestFullscreen: false, isFullscreen: false }));
vi.mock('../hooks/useMetronome', () => ({ useMetronome: () => audio }));
vi.mock('../hooks/usePerformanceFullscreen', () => ({ usePerformanceFullscreen: () => fullscreen }));
vi.mock('./ChordSheet', () => ({ default: ({ song, setlistSongNumber }: { song: Song; setlistSongNumber?: number }) => <div data-testid="chart" data-song-number={setlistSongNumber}>{song.title}{song.title === "雙頁" && <><div data-print-page>第一頁內容</div><div data-print-page>第二頁內容</div></>}</div> }));
const song = (title: string, tempo?: number, timeSignature = '4/4'): Song => ({ title, tempo, timeSignature, originalKey: 'C', currentKey: 'C', sections: [] });
const session: DrummerSession = { name: '測試歌單', initialId: 'a', entries: [{ id: 'a', song: song('第一首', 72) }, { id: 'b', song: song('第二首', 110) }, { id: 'c', song: song('未定速度') }, { id: 'd', song: song('第一首', 72) }] };
const tempo = () => screen.getByRole('textbox', { name: '節拍器速度 BPM' });
function openSoundSettings() { fireEvent.click(screen.getByRole('button', { name: /聲音與拍號 ·/ })); }
function closeSoundSettings() { fireEvent.click(screen.getByRole('button', { name: '關閉聲音設定' })); }
function controlPointer(button: HTMLElement, type: 'pointerDown' | 'pointerUp' | 'pointerCancel' | 'lostPointerCapture', overrides: Record<string, unknown> = {}) {
  const event = createEvent[type](button, { bubbles: true, cancelable: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, ...overrides }).map(([key, value]) => [key, { value }])));
  fireEvent(button, event);
}
const songs = () => within(screen.getByRole('region', { name: '鼓手歌單' }));
function mount(value = session) { return render(<DrummerMode {...value} language="zh" onClose={vi.fn()}/>); }
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); audio.start.mockResolvedValue(true); fullscreen.isFullscreen = false; audio.playing = false; audio.starting = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
describe('drummer session controls', () => {
  it('numbers list, active title and chart by entry position even for repeated songs', () => {
    const mounted = mount({ ...session, initialId: 'd' });
    expect(screen.getByRole('heading', { name: '4. 第一首' })).toBeInTheDocument();
    expect(songs().getByRole('button', { name: /^4 第一首/ })).toHaveTextContent('4. 第一首');
    expect(screen.getByTestId('chart')).toHaveAttribute('data-song-number', '4');
    mounted.rerender(<DrummerMode {...session} entries={[session.entries[3], ...session.entries.slice(0, 3)]} language="zh" onClose={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: '1. 第一首' })).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toHaveAttribute('data-song-number', '1');
    expect(session.entries[3].song.title).toBe('第一首');
  });

  const touch = (element: HTMLElement, kind: 'pointerDown' | 'pointerUp' | 'pointerCancel', x: number, y: number) => {
    const event = createEvent[kind](element, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: 4 }, isPrimary: { value: true }, clientX: { value: x }, clientY: { value: y } });
    fireEvent(element, event);
  };
  it.each(['mouse', 'touch'])('toggles the current song off and on with %s without losing its selection or tempo', input => {
    const view = mount();
    const activate = () => {
      const target = songs().getByRole('button', { name: /^1 第一首/ });
      if (input === 'touch') { touch(target, 'pointerDown', 40, 80); touch(target, 'pointerUp', 40, 80); }
      fireEvent.click(target, { detail: 1 });
    };
    const refresh = () => view.rerender(<DrummerMode {...session} language="zh" onClose={vi.fn()}/>);
    activate();
    expect(audio.start).toHaveBeenCalledOnce();
    audio.playing = true; refresh();
    audio.stop.mockClear(); audio.start.mockClear();
    activate();
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(audio.start).not.toHaveBeenCalled();
    expect(songs().getByRole('button', { name: /^1 第一首/ })).toHaveAttribute('aria-current', 'true');
    expect(tempo()).toHaveValue('72');
    audio.playing = false; refresh();
    activate();
    expect(audio.start).toHaveBeenCalledOnce();
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 72 }));
  });
  it.each(['playing', 'starting'] as const)('stops the current song when it is %s', state => {
    audio[state] = true;
    mount();
    fireEvent.click(songs().getByRole('button', { name: /^1 第一首/ }));
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(audio.start).not.toHaveBeenCalled();
  });
  it('selects a touch-released song without a following click and ignores its duplicate click', () => {
    mount(session);
    const target = songs().getByRole('button', { name: /^2 第二首/ });
    touch(target, 'pointerDown', 40, 80); touch(target, 'pointerUp', 40, 80);
    expect(target).toHaveAttribute('aria-current', 'true');
    expect(audio.start).toHaveBeenCalledTimes(1);
    fireEvent.click(target, { detail: 1 });
    expect(audio.start).toHaveBeenCalledTimes(1);
    fireEvent.click(target, { detail: 0 }); // Keyboard and assistive activation still work.
    expect(audio.start).toHaveBeenCalledTimes(2);
  });
  it('does not select while swiping, scrolling or cancelling a song touch', () => {
    mount(session);
    const target = songs().getByRole('button', { name: /^2 第二首/ });
    touch(target, 'pointerDown', 40, 80); touch(target, 'pointerUp', 40, 120);
    fireEvent.click(target, { detail: 1 });
    touch(target, 'pointerDown', 40, 80);
    document.querySelector('.drummer-list-scroll')!.scrollTop = 30;
    touch(target, 'pointerUp', 40, 80);
    touch(target, 'pointerDown', 40, 80); touch(target, 'pointerCancel', 40, 80); touch(target, 'pointerUp', 40, 80);
    expect(audio.start).not.toHaveBeenCalled();
    expect(target).not.toHaveAttribute('aria-current', 'true');
  });
  it('continues selecting songs while an earlier audio start is pending', () => {
    audio.starting = true;
    mount(session);
    fireEvent.click(songs().getByRole('button', { name: /^2 第二首/ }));
    expect(songs().getByRole('button', { name: /^2 第二首/ })).toHaveAttribute('aria-current', 'true');
    expect(audio.start).toHaveBeenCalled();
  });

  it.each([1, 2])('reveals the previous visual row when moving back in a %s-column phone list', columns => {
    mount({ ...session, initialId: 'c' });
    const list = document.querySelector<HTMLElement>('.drummer-list-scroll')!;
    list.style.display = 'grid';
    list.scrollTop = 110;
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 230, height: 230 } as DOMRect);
    Array.from(list.querySelectorAll<HTMLElement>('.drummer-song-entry')).forEach((entry, index) => {
      const rect = () => {
        const top = Math.floor(index / columns) * 110 - list.scrollTop;
        return { top, bottom: top + 100, height: 100 } as DOMRect;
      };
      vi.spyOn(entry, 'getBoundingClientRect').mockImplementation(rect);
      vi.spyOn(entry.querySelector('.drummer-song-row')!, 'getBoundingClientRect').mockImplementation(rect);
    });
    fireEvent.click(screen.getByRole('button', { name: '上一首' }));
    expect(list.scrollTop).toBe(0);
    expect(songs().getByRole('button', { name: /^2 第二首/ })).toHaveAttribute('aria-current', 'true');
  });
  it.each([['grid', 90], ['block', 0]] as const)('reveals the following row only in the phone %s list', (display, expectedScroll) => {
    mount({ ...session, entries: [...session.entries, { id: 'e', song: song('第五首', 90) }, { id: 'f', song: song('第六首', 100) }] });
    const list = document.querySelector<HTMLElement>('.drummer-list-scroll')!;
    list.style.display = display;
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 230, height: 230 } as DOMRect);
    Array.from(list.querySelectorAll<HTMLElement>('.drummer-song-entry')).forEach((entry, index) => {
      const top = Math.floor(index / 2) * 110;
      const bounds = { top, bottom: top + 100, height: 100 } as DOMRect;
      vi.spyOn(entry, 'getBoundingClientRect').mockReturnValue(bounds);
      vi.spyOn(entry.querySelector('.drummer-song-row')!, 'getBoundingClientRect').mockReturnValue(bounds);
    });
    fireEvent.click(songs().getByRole('button', { name: /^4 第一首/ }));
    expect(list.scrollTop).toBe(expectedScroll);
    expect(songs().getByRole('button', { name: /^4 第一首/ })).toHaveAttribute('aria-current', 'true');
  });
  it.each(['multitracks', 'drive'])('defaults to Ableton Live Classic and remembers %s across songs and reopening', soundId => {
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    openSoundSettings();
    const sound = screen.getByLabelText('音色');
    expect(sound).toHaveValue('ableton-classic');
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ sound: 'ableton-classic' }));
    fireEvent.change(sound, { target: { value: soundId } });
    closeSoundSettings();
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ sound: soundId, bpm: 110 }));
    first.unmount();
    mount();
    openSoundSettings();
    expect(screen.getByLabelText('音色')).toHaveValue(soundId);
    closeSoundSettings();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ sound: soundId }));
  });
  it('ignores and clears a retired mixing preference while retaining sound and volume', () => {
    localStorage.setItem('chordmaster.drummer-preferences.v1', JSON.stringify({ mixWithOtherAudio: true, sound: 'drive', volume: 0.4 }));
    mount();
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ sound: 'drive', volume: 0.4 }));
    expect(audio.update.mock.lastCall?.[0]).not.toHaveProperty('mixWithOtherAudio');
    fireEvent.click(screen.getByRole('button', { name: /聲音與拍號 ·/ }));
    expect(screen.queryByRole('combobox', { name: '音訊播放' })).toBeNull();
    expect(screen.queryByText('與其他 App 音樂混音')).toBeNull();
    expect(JSON.parse(localStorage.getItem('chordmaster.drummer-preferences.v1')!)).toEqual({ sound: 'drive', volume: 0.4, accent: 1, regular: 0.75, subdivisions: 0.4 });
  });
  it('enters live mode without interrupting the click and keeps chart/song selection linked', () => {
    audio.playing = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: '增加 1 BPM' }));
    fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
    expect(fullscreen.requestFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: '鼓手模式' })).toHaveAttribute('data-stage', 'true');
    expect(audio.stop).not.toHaveBeenCalled();
    expect(audio.start).not.toHaveBeenCalled();
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(screen.getByTestId('chart')).toHaveTextContent('第二首');
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ bpm: 110 }));
    fireEvent.click(screen.getByRole('button', { name: '一般模式' }));
    expect(fullscreen.exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: '鼓手模式' })).toHaveAttribute('data-stage', 'false');
    fireEvent.click(songs().getByRole('button', { name: /1 第一首/ }));
    expect(tempo()).toHaveValue('73');
  });
  it('closes the note picker before leaving live mode, and leaves the drummer session open', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
    fireEvent.click(screen.getByRole('button', { name: '本曲節拍細分：四分' }));
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: '四分' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '鼓手模式' })).toBeInTheDocument();
    expect(fullscreen.exitFullscreen).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fullscreen.exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: '鼓手模式' })).toBeInTheDocument();
  });
  it('fits the entire A4 on entering live mode, resizing and changing songs', () => {
    type ResizeCallback = (entries: { target: Element; contentRect: { width: number; height: number } }[]) => void;
    const observers = new Map<Element, ResizeCallback>();
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeCallback) {}
      observe(target: Element) { observers.set(target, this.callback); }
      disconnect() { for (const [target, callback] of observers) if (callback === this.callback) observers.delete(target); }
    });
    mount();
    const resize = (width: number, height: number) => act(() => {
      const target = screen.getByLabelText(/捲動樂譜|翻頁樂譜/);
      observers.get(target)!([{ target, contentRect: { width, height } }]);
    });
    const paperSize = () => {
      const paper = document.querySelector<HTMLElement>('.drummer-scaled-paper')!;
      return { width: parseFloat(paper.style.width), height: parseFloat(paper.style.height) };
    };
    resize(900, 600);
    fireEvent.click(screen.getByRole('button', { name: '放大樂譜' }));
    fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
    expect(paperSize().height).toBeCloseTo(600);
    expect(paperSize().width).toBeLessThan(900);
    resize(400, 900);
    expect(paperSize().width).toBeCloseTo(400);
    expect(paperSize().height).toBeLessThan(900);
    expect(screen.queryByRole('button', { name: '適合寬度' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '放大樂譜' })).not.toBeInTheDocument();
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    resize(900, 600);
    expect(paperSize().height).toBeCloseTo(600);
    expect(document.querySelector('.drummer-score-tools')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '一般模式' }));
    expect(screen.getByRole('button', { name: '適合寬度' })).toBeInTheDocument();
  });
  it.each(['playing', 'starting'] as const)('restarts with the selected samples while %s', state => {
    audio[state] = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: /聲音與拍號/ }));
    const sound = screen.getByLabelText('音色');
    expect(sound).toBeEnabled();
    fireEvent.change(sound, { target: { value: 'drive' } });
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ sound: 'drive', bpm: 72, beats: 4, subdivision: 1 }));
    fireEvent.change(sound, { target: { value: 'ableton-classic' } });
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ sound: 'ableton-classic', bpm: 72 }));
    expect(JSON.parse(localStorage.getItem('chordmaster.drummer-preferences.v1')!)).toMatchObject({ sound: 'ableton-classic' });
  });
  it('resumes the new sound after a native picker interrupts playback', () => {
    audio.playing = true;
    const mounted = mount();
    openSoundSettings();
    const sound = screen.getByLabelText('音色');
    fireEvent.focus(sound);
    audio.playing = false;
    mounted.rerender(<DrummerMode {...session} language="zh" onClose={vi.fn()}/>);
    fireEvent.change(sound, { target: { value: 'drive' } });
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ sound: 'drive' }));
  });
  it('shows preparation progress while loading sound and uses quiet recovery', async () => {
    audio.playing = true;
    let resolve!: (result: boolean) => void;
    audio.start.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /聲音與拍號/ }));
    fireEvent.change(screen.getByLabelText('音色'), { target: { value: 'drive' } });
    expect(screen.getByRole('progressbar', { name: '準備音色' })).toBeInTheDocument();
    expect(audio.start.mock.calls.at(-1)?.[1]).toEqual({ quiet: true, fallbackSound: 'ableton-classic' });
    await act(async () => resolve(true));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByLabelText('音色')).toHaveValue('drive');
  });
  it('restores the previous sound selection after a failed live switch', async () => {
    audio.playing = true; audio.start.mockResolvedValue(false);
    mount();
    openSoundSettings();
    fireEvent.change(screen.getByLabelText('音色'), { target: { value: 'drive' } });
    await waitFor(() => {
      expect(screen.getByLabelText('音色')).toHaveValue('ableton-classic');
      // The selection commits before the persistence effect runs.
      expect(JSON.parse(localStorage.getItem('chordmaster.drummer-preferences.v1')!).sound).toBe('ableton-classic');
    });
  });
  it('changes sound silently while stopped and marks selection without status words', () => {
    mount();
    expect(songs().getByRole('button', { name: /1 第一首/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText('目前')).not.toBeInTheDocument();
    expect(screen.queryByText('播放中')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /聲音與拍號/ }));
    fireEvent.change(screen.getByLabelText('音色'), { target: { value: 'drive' } });
    expect(audio.start).not.toHaveBeenCalled();
  });
  it('opens one symbol picker and remembers each entry subdivision separately on this device', () => {
    const first = mount();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    fireEvent.click(screen.getByRole('button', { name: '本曲節拍細分：四分' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '八分' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '本曲節拍細分：八分' })).toHaveFocus();
    fireEvent.click(songs().getByRole('button', { name: /1 第一首/ }));
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ subdivision: 1 }));
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ subdivision: 2 }));
    first.unmount();
    const reopened = mount({ ...session, initialId: 'b' });
    expect(screen.getByRole('button', { name: '本曲節拍細分：八分' })).toBeInTheDocument();
    reopened.unmount();
    mount({ ...session, id: 'different-setlist', initialId: 'b' });
    expect(screen.getByRole('button', { name: '本曲節拍細分：四分' })).toBeInTheDocument();
  });
  it('supports picker arrow navigation and Escape closes only the picker', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '本曲節拍細分：四分' }));
    const quarter = screen.getByRole('menuitemradio', { name: '四分' });
    expect(quarter).toHaveFocus();
    fireEvent.keyDown(quarter, { key: 'ArrowRight' });
    expect(screen.getByRole('menuitemradio', { name: '八分' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: '八分' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '鼓手模式' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '本曲節拍細分：四分' })).toHaveFocus();
  });
  it('changes subdivisions directly and keeps per-beat accents with each setlist entry', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '本曲節拍細分：四分' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '三連音' }));
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ subdivision: 3 }));
    fireEvent.click(screen.getByRole('button', { name: '第 1 拍：重音，點按切換' }));
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ beatLevels: [0, 1, 1, 1] }));
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ beatLevels: [3, 1, 1, 1], subdivision: 1 }));
    fireEvent.click(songs().getByRole('button', { name: /1 第一首/ }));
    expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ beatLevels: [0, 1, 1, 1] }));
    fireEvent.click(screen.getByRole('button', { name: '第 1 拍：靜音，點按切換' }));
    fireEvent.click(screen.getByRole('button', { name: '第 1 拍：輕拍，點按切換' }));
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ beatLevels: [2, 1, 1, 1] }));
  });
  it('uses setlist metadata, keeps tempo overrides per entry and never mutates shared songs', () => {
    const original = JSON.stringify(session);
    mount();
    fireEvent.click(screen.getByRole('button', { name: '增加 1 BPM' }));
    expect(tempo()).toHaveValue('73');
    fireEvent.click(songs().getByRole('button', { name: /4 第一首/ }));
    expect(tempo()).toHaveValue('72');
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 72, beats: 4 }));
    fireEvent.click(songs().getByRole('button', { name: /1 第一首/ }));
    expect(tempo()).toHaveValue('73');
    expect(JSON.stringify(session)).toBe(original);
    expect(localStorage.getItem('chordmaster.drummer-preferences.v1')).not.toContain('73');
  });
  it('starts the selected song immediately, including while another song is playing', () => {
    audio.playing = true;
    mount();
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(screen.getByTestId('chart')).toHaveTextContent('第二首');
    expect(screen.queryByRole('button', { name: /切換下一首/ })).not.toBeInTheDocument();
    expect(audio.stop).not.toHaveBeenCalled();
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 110, beats: 4 }));
    expect(tempo()).toHaveValue('110');
  });
  it('stops at a song without BPM rather than carrying over the previous song tempo', () => {
    audio.playing = true;
    mount();
    fireEvent.click(songs().getByRole('button', { name: /3 未定速度/ }));
    expect(audio.stop).toHaveBeenCalledOnce(); expect(audio.start).not.toHaveBeenCalled();
    expect(tempo()).toHaveValue('');
  });
  it('requires a valid BPM and confirmed meter, accepts manual entry and TAP', () => {
    mount({ ...session, initialId: 'c' });
    expect(screen.getByRole('button', { name: '播放' })).toBeDisabled();
    fireEvent.change(tempo(), { target: { value: '999' } }); fireEvent.blur(tempo());
    expect(tempo()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: '播放' })).toBeDisabled();
    const tap = screen.getByRole('button', { name: 'TAP 點按測速' });
    for (let i = 0; i < 4; i++) { const event = createEvent.click(tap); Object.defineProperty(event, 'timeStamp', { value: (i + 1) * 500 }); fireEvent(tap, event); }
    expect(tempo()).toHaveValue('120');
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 120 }));
  });
  it('keeps 6/8 beat units explicit and changes grouping only while stopped', () => {
    mount({ name: '6/8', initialId: 'six', entries: [{ id: 'six', song: song('六八拍', 80, '6/8') }] });
    expect(tempo()).toHaveAccessibleDescription('BPM 計拍單位：八分音符');
    openSoundSettings();
    fireEvent.change(screen.getByLabelText('BPM 計拍單位'), { target: { value: 'group' } });
    closeSoundSettings();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 80, beats: 2 }));
  });
  it('restores only validated personal preferences without a mute transport', () => {
    localStorage.setItem('chordmaster.drummer-preferences.v1', JSON.stringify({ volume: 1000, accent: -1, tone: 'soft', sound: 'missing', regular: .6, subdivision: 99 }));
    mount();
    expect(screen.queryByRole('button', { name: '靜音，保持計拍' })).not.toBeInTheDocument();
    expect(audio.stop).not.toHaveBeenCalled();
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ muted: false, volume: .7, accent: 1, regular: .6, subdivision: 1, sound: 'ableton-classic' }));
    expect(audio.update.mock.lastCall?.[0]).not.toHaveProperty('tone');
    openSoundSettings();
    expect(screen.getByLabelText('音色')).toHaveValue('ableton-classic');
  });
  it('does not pass editor shortcuts through the overlay, but supports Enter in the tempo field', () => {
    mount();
    const keydown = vi.fn(); window.addEventListener('keydown', keydown);
    fireEvent.change(tempo(), { target: { value: '98' } }); fireEvent.keyDown(tempo(), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 98 }));
    expect(keydown).not.toHaveBeenCalled();
    window.removeEventListener('keydown', keydown);
  });
  it('retains native decimal precision without truncating pasted values or showing a custom keypad', () => {
    mount();
    fireEvent.focus(tempo());
    fireEvent.change(tempo(), { target: { value: '128.56' } });
    expect(tempo()).toHaveValue('128.56');
    fireEvent.blur(tempo());
    expect(audio.update.mock.lastCall?.[0]).toEqual(expect.objectContaining({ bpm: 128.56 }));
    expect(screen.queryByRole('dialog', { name: '設定速度' })).not.toBeInTheDocument();
  });
});

it('uses previous/next to start songs directly and disables setlist boundaries', () => {
  mount();
  expect(screen.getByRole('button', { name: '上一首' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '下一首' }));
  expect(tempo()).toHaveValue('110'); expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ bpm: 110 }));
  expect(songs().getByRole('button', { name: /2 第二首/ })).toHaveAttribute('aria-current', 'true');
  fireEvent.click(screen.getByRole('button', { name: '上一首' })); expect(tempo()).toHaveValue('72');
  fireEvent.click(songs().getByRole('button', { name: /4 第一首/ })); expect(screen.getByRole('button', { name: '下一首' })).toBeDisabled();
});
it('closes sound settings before leaving live mode and restores trigger focus', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
  const trigger = screen.getByRole('button', { name: /聲音與拍號 ·/ }); fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole('dialog', { name: '聲音與拍號' })).toBeVisible());
  expect(screen.queryByRole('button', { name: '下一首' })).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(trigger).toHaveFocus(); expect(fullscreen.exitFullscreen).not.toHaveBeenCalled();
});
it('captures TAP on press without a duplicate on release/click', () => {
  mount(); const tap = screen.getByRole('button', { name: 'TAP 點按測速' });
  for (const time of [1000, 1500, 2000]) {
    const down = createEvent.pointerDown(tap, { button: 0, isPrimary: true });
    Object.defineProperty(down, 'button', { value: 0 }); Object.defineProperty(down, 'timeStamp', { value: time });
    fireEvent(tap, down);
    expect(tap).toHaveAttribute('data-control-pressed', 'true');
    fireEvent.pointerUp(tap);
    expect(tap).not.toHaveAttribute('data-control-pressed');
    fireEvent.click(tap, { detail: 1 });
  }
  expect(tempo()).toHaveValue('120'); expect(tap).toHaveTextContent('3 次');
  expect(audio.start).not.toHaveBeenCalled();
  expect(audio.prepare).not.toHaveBeenCalled();
});

it('starts, stops and immediately restarts on touch-down while consuming compatibility clicks', () => {
  vi.useFakeTimers();
  try {
    const view = mount(), play = screen.getByRole('button', { name: '播放' });
    controlPointer(play, 'pointerDown');
    expect(audio.start).toHaveBeenCalledOnce(); expect(play).toHaveAttribute('data-control-pressed', 'true');
    audio.starting = true; view.rerender(<DrummerMode {...session} language="zh" onClose={vi.fn()}/>);
    act(() => vi.advanceTimersByTime(700)); expect(play).toHaveAttribute('data-control-pressed', 'true');
    controlPointer(play, 'pointerUp'); controlPointer(play, 'lostPointerCapture');
    expect(play).not.toHaveAttribute('data-control-pressed');
    fireEvent.click(play, { detail: 1 }); expect(audio.start).toHaveBeenCalledOnce(); expect(audio.stop).not.toHaveBeenCalled();
    controlPointer(play, 'pointerDown'); expect(audio.stop).toHaveBeenCalledOnce();
    controlPointer(play, 'pointerUp'); fireEvent.click(play, { detail: 0 });
    expect(audio.start).toHaveBeenCalledOnce(); expect(audio.stop).toHaveBeenCalledOnce();
    audio.starting = false; view.rerender(<DrummerMode {...session} language="zh" onClose={vi.fn()}/>);
    controlPointer(play, 'pointerDown');
    expect(audio.start).toHaveBeenCalledTimes(2);
    controlPointer(play, 'pointerUp'); fireEvent.click(play, { detail: 1 });
    expect(audio.start).toHaveBeenCalledTimes(2); expect(audio.stop).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it('keeps one TAP throughout a long hold and suppresses its context menu without starting audio', () => {
  vi.useFakeTimers();
  try {
    mount(); const tap = screen.getByRole('button', { name: 'TAP 點按測速' });
    controlPointer(tap, 'pointerDown'); act(() => vi.advanceTimersByTime(800));
    expect(tap).toHaveAttribute('data-control-pressed', 'true'); expect(tap).toHaveTextContent('1 次');
    expect(fireEvent.contextMenu(tap)).toBe(false);
    controlPointer(tap, 'pointerUp'); fireEvent.click(tap, { detail: 1 });
    expect(tap).not.toHaveAttribute('data-control-pressed'); expect(tap).toHaveTextContent('1 次');
    expect(audio.start).not.toHaveBeenCalled(); expect(audio.prepare).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it('ignores secondary pointers and disabled play, and releases cancelled or blurred holds', () => {
  mount({ ...session, initialId: 'c' });
  const play = screen.getByRole('button', { name: '播放' }), tap = screen.getByRole('button', { name: 'TAP 點按測速' });
  controlPointer(play, 'pointerDown'); expect(audio.start).not.toHaveBeenCalled(); expect(play).not.toHaveAttribute('data-control-pressed');
  controlPointer(tap, 'pointerDown', { isPrimary: false }); controlPointer(tap, 'pointerDown', { button: 2 }); expect(tap).not.toHaveAttribute('data-control-pressed');
  controlPointer(tap, 'pointerDown'); controlPointer(tap, 'pointerUp', { pointerId: 2 }); expect(tap).toHaveAttribute('data-control-pressed', 'true');
  controlPointer(tap, 'pointerCancel'); expect(tap).not.toHaveAttribute('data-control-pressed');
  controlPointer(tap, 'pointerDown'); fireEvent.blur(window); expect(tap).not.toHaveAttribute('data-control-pressed');
  fireEvent.click(tap); expect(tap).toHaveAttribute('data-control-pressed', 'true'); // Assistive activation still works after cancellation/blur.
});

it('handles focused transport keys on keydown, ignores repeats and releases on keyup', () => {
  mount(); const play = screen.getByRole('button', { name: '播放' });
  fireEvent.keyDown(play, { key: ' ', code: 'Space' }); expect(audio.start).toHaveBeenCalledOnce(); expect(play).toHaveAttribute('data-control-pressed', 'true');
  fireEvent.keyDown(play, { key: ' ', code: 'Space', repeat: true }); expect(audio.start).toHaveBeenCalledOnce();
  fireEvent.keyUp(play, { key: ' ', code: 'Space' }); expect(play).not.toHaveAttribute('data-control-pressed');
});

it('applies rapid MIDI tempo ticks cumulatively and routes song presses through direct playback', async () => {
  localStorage.setItem(MIDI_PROFILE_KEY, JSON.stringify({version:1,activeId:'test',profiles:[{id:'test',name:'Live',device:{id:'one',name:'Test',manufacturer:''},bindings:{tempo:{type:'cc',channel:0,number:16,mode:'twos-complement',step:1},next:{type:'note',channel:0,number:39},tempoUp:{type:'note',channel:0,number:40},tempoDown:{type:'note',channel:0,number:41}}}]}));
  let events!: MidiEvents;
  render(<DrummerMode {...session} language="zh" onClose={vi.fn()} midiConnector={async callbacks => { events=callbacks; callbacks.devices([{id:'one',name:'Test',manufacturer:''}]);return {select:async()=>{},dispose:async()=>{}}; }}/>);
  fireEvent.click(screen.getByRole('button',{name:'設定 MIDI 控制器'}));
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'連接控制器'})));
  act(()=>events.message({deviceId:'one',data:[0xb0,16,1],timestamp:1000}));
  fireEvent.click(screen.getByRole('button',{name:'關閉 MIDI 設定'}));
  expect(tempo()).toHaveValue('72');
  act(()=>{for(let i=0;i<3;i++)events.message({deviceId:'one',data:[0xb0,16,1],timestamp:1100+i});});
  expect(tempo()).toHaveValue('75');
  act(()=>{ events.message({deviceId:'one',data:[0x90,40,100],timestamp:1150}); events.message({deviceId:'one',data:[0x90,40,100],timestamp:1160}); });
  expect(tempo()).toHaveValue('76');
  act(()=>events.message({deviceId:'one',data:[0x90,41,100],timestamp:1170}));
  expect(tempo()).toHaveValue('75');
  act(()=>events.message({deviceId:'one',data:[0x90,39,100],timestamp:1200}));
  expect(tempo()).toHaveValue('110');expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({bpm:110}));
  act(()=>{events.message({deviceId:'one',data:[0x80,39,0],timestamp:1300});events.message({deviceId:'one',data:[0x90,39,100],timestamp:1400});events.message({deviceId:'one',data:[0x80,39,0],timestamp:1450});events.message({deviceId:'one',data:[0x90,39,100],timestamp:1500});});
  expect(songs().getByRole('button',{name:/4 第一首/})).toHaveAttribute('aria-current','true');
});

it('turns live chart pages without changing the song or click and returns to page one on re-entry', () => {
  mount({...session,entries:[{id:'a',song:song('雙頁',72)}]});
  fireEvent.click(screen.getByRole('button',{name:'演出模式'}));
  expect(screen.queryByRole('button',{name:'上一頁樂譜'})).not.toBeInTheDocument();
  expect(screen.getByText('第二頁內容')).toHaveAttribute('aria-hidden','true');
  const area = screen.getByLabelText('翻頁樂譜');
  vi.spyOn(area,'getBoundingClientRect').mockReturnValue({left:0,width:200} as DOMRect);
  fireEvent(area,new MouseEvent('pointerdown',{clientX:150,clientY:100,bubbles:true}));
  fireEvent(area,new MouseEvent('pointerup',{clientX:150,clientY:100,bubbles:true}));
  expect(screen.getByText('第一頁內容')).toHaveAttribute('aria-hidden','true');
  expect(screen.queryByRole('button',{name:'下一頁樂譜'})).not.toBeInTheDocument();
  expect(screen.getByText('第二頁內容')).not.toHaveAttribute('aria-hidden');
  expect(audio.start).not.toHaveBeenCalled(); expect(tempo()).toHaveValue('72');
  fireEvent.click(screen.getByRole('button',{name:'一般模式'}));
  expect(screen.getByText('第一頁內容')).not.toHaveAttribute('aria-hidden');
  fireEvent.click(screen.getByRole('button',{name:'演出模式'}));
  expect(screen.queryByRole('button',{name:'上一頁樂譜'})).not.toBeInTheDocument();
});

it('sets an inactive song subdivision from the list without playback or changing selection', () => {
  mount();
  const control = screen.getByRole('button',{name:'第二首 · 節拍細分'});
  fireEvent.click(control);
  expect(screen.getByRole('menuitemradio',{name:'四分'})).toHaveAttribute('aria-checked','true');
  expect(screen.getByRole('menu')).not.toHaveTextContent('八分');
  fireEvent.keyDown(screen.getByRole('menuitemradio',{name:'四分'}),{key:'ArrowRight'});
  expect(screen.getByRole('menuitemradio',{name:'八分'})).toHaveFocus();
  fireEvent.keyDown(window,{key:'Escape'});
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(control).toHaveFocus();
  fireEvent.click(control);
  fireEvent.click(screen.getByRole('menuitemradio',{name:'八分'}));
  expect(audio.start).not.toHaveBeenCalled(); expect(tempo()).toHaveValue('72');
  fireEvent.click(songs().getByRole('button',{name:/2 第二首/}));
  expect(audio.start.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({subdivision:2,bpm:110}));
});

it('restores the original tempo from a permanent control and shows no missing-tempo spacer', () => {
  mount();
  const reset = screen.getByRole('button',{name:'還原速度'});
  expect(reset).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'增加 1 BPM'}));
  expect(reset).toBeEnabled(); fireEvent.click(reset); expect(tempo()).toHaveValue('72');
  fireEvent.click(songs().getByRole('button',{name:/3 未定速度/}));
  expect(screen.queryByText('這首歌未設定速度。輸入 BPM 或用 TAP 點按測速。')).not.toBeInTheDocument();
  expect(reset).toBeDisabled();
});


const keyboardControls = {tempoUp:'KeyU',tempoDown:'KeyD',tap:'KeyT',playPause:'KeyP',previous:'KeyL',next:'KeyR'};
function saveKeyboardControls() {
  localStorage.setItem(MIDI_PROFILE_KEY, JSON.stringify({version:1,activeId:'keys',profiles:[{id:'keys',name:'Keys',device:{id:'keyboard',name:'Computer keyboard',manufacturer:''},bindings:{},keyboard:keyboardControls}]}));
}
it('shows immediate press feedback for all mapped keys without delaying their actions', () => {
  vi.useFakeTimers();
  try {
    saveKeyboardControls(); mount();
    const up = screen.getByRole('button',{name:'增加 1 BPM'});
    fireEvent.keyDown(window,{code:'KeyU'});
    expect(tempo()).toHaveValue('73'); expect(up).toHaveAttribute('data-control-pressed','true');
    act(()=>vi.advanceTimersByTime(60));
    fireEvent.keyDown(window,{code:'KeyU',repeat:true});
    expect(tempo()).toHaveValue('74');
    act(()=>vi.advanceTimersByTime(60));
    expect(up).toHaveAttribute('data-control-pressed','true');
    act(()=>vi.advanceTimersByTime(40));
    expect(up).not.toHaveAttribute('data-control-pressed');
    for (const action of ['tempoDown','tap','playPause','next','previous'] as const) {
      fireEvent.keyDown(window,{code:keyboardControls[action]});
      expect(document.querySelector(`[data-drummer-action="${action}"]`)).toHaveAttribute('data-control-pressed','true');
      fireEvent.keyUp(window,{code:keyboardControls[action]});
    }
    expect(audio.start).toHaveBeenCalled();
    fireEvent.blur(window);
    expect(document.querySelector('[data-control-pressed]')).toBeNull();
  } finally { vi.useRealTimers(); }
});
it('keeps feedback off for protected input/settings and disabled controls, and supports focused TAP', () => {
  saveKeyboardControls(); const rendered = mount();
  fireEvent.keyDown(tempo(),{code:'KeyU'});
  expect(tempo()).toHaveValue('72'); expect(document.querySelector('[data-control-pressed]')).toBeNull();
  fireEvent.keyDown(window,{code:'KeyL'});
  expect(screen.getByRole('button',{name:'上一首'})).not.toHaveAttribute('data-control-pressed');
  fireEvent.click(screen.getByRole('button',{name:'設定 MIDI 控制器'}));
  fireEvent.keyDown(window,{code:'KeyU'});
  expect(document.querySelector('[data-control-pressed]')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'關閉 MIDI 設定'}));
  const tap = screen.getByRole('button',{name:'TAP 點按測速'});
  fireEvent.keyDown(tap,{code:'Enter',key:'Enter'});
  expect(tap).toHaveAttribute('data-control-pressed','true');
  rendered.unmount();
  expect(tap).not.toHaveAttribute('data-control-pressed');
});
it('explicitly exits existing fullscreen and follows a browser-driven fullscreen exit', () => {
  fullscreen.isFullscreen = true;
  const rendered = mount();
  fireEvent.click(screen.getByRole('button',{name:'演出模式'}));
  fireEvent.click(screen.getByRole('button',{name:'一般模式'}));
  expect(fullscreen.exitFullscreen).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button',{name:'演出模式'}));
  fullscreen.isFullscreen = false;
  rendered.rerender(<DrummerMode {...session} language="zh" onClose={vi.fn()}/>);
  expect(screen.getByRole('dialog',{name:'鼓手模式'})).toHaveAttribute('data-stage','false');
  expect(screen.getByRole('button',{name:'演出模式'})).toBeInTheDocument();
});

it('exits fullscreen on primary press and consumes the trailing click without re-entry', () => {
  fullscreen.isFullscreen = true;
  mount();
  fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
  const toggle = screen.getByRole('button', { name: '一般模式' });
  fireEvent(toggle, new MouseEvent('pointerdown', { button: 2, bubbles: true }));
  expect(fullscreen.exitFullscreen).not.toHaveBeenCalled();
  fireEvent(toggle, new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
  expect(fullscreen.exitFullscreen).toHaveBeenCalledWith(true);
  expect(screen.getByRole('dialog', { name: '鼓手模式' })).toHaveAttribute('data-stage', 'false');
  fireEvent.click(toggle, { detail: 1 });
  expect(fullscreen.requestFullscreen).toHaveBeenCalledOnce();
  fireEvent(toggle, new MouseEvent('pointerdown', { button: 0, bubbles: true }));
  fireEvent.click(toggle, { detail: 1 });
  expect(fullscreen.requestFullscreen).toHaveBeenCalledTimes(2);
});

it('maps chart pages independently from songs and clamps page boundaries without disturbing playback', () => {
  localStorage.setItem(MIDI_PROFILE_KEY, JSON.stringify({version:1,activeId:'pages',profiles:[{id:'pages',name:'Pages',device:{id:'keyboard',name:'Computer keyboard',manufacturer:''},bindings:{},keyboard:{previousPage:'PageUp',nextPage:'PageDown'}}]}));
  mount({...session,entries:[{id:'a',song:song('雙頁',72)},session.entries[1]]});
  fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
  const pageKey = (code: string) => {
    fireEvent.keyDown(screen.getByLabelText('翻頁樂譜'), { code, key: code });
    fireEvent.keyUp(window, { code });
  };
  pageKey('PageDown');
  expect(screen.getByText('第二頁內容')).not.toHaveAttribute('aria-hidden');
  pageKey('PageDown');
  expect(screen.getByText('第二頁內容')).not.toHaveAttribute('aria-hidden');
  pageKey('PageUp'); pageKey('PageUp');
  expect(screen.getByText('第一頁內容')).not.toHaveAttribute('aria-hidden');
  expect(tempo()).toHaveValue('72');
  expect(audio.start).not.toHaveBeenCalled(); expect(audio.stop).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '設定 MIDI 控制器' }));
  expect(screen.getByRole('button', { name: '設定鍵盤樂譜上一頁' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '設定鍵盤樂譜下一頁' })).toBeInTheDocument();
});

it('receives live song/key/order changes without retiming the active click, then uses remote timing after stop', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: '播放' }));
  audio.playing = true;
  const remote = { ...session, name: '已更新歌單', entries: [
    { ...session.entries[1], song: { ...session.entries[1].song, title: '第二首更新' } },
    { ...session.entries[0], song: { ...session.entries[0].song, title: '第一首更新', currentKey: 'D' as const, tempo: 140, timeSignature: '3/4' } },
    { id: 'new', song: song('手機新加入', 88) }
  ] };
  audio.update.mockClear(); audio.start.mockClear(); audio.stop.mockClear();
  view.rerender(<DrummerMode {...remote} language="zh" onClose={vi.fn()}/>);
  expect(songs().getByRole('button', { name: /^2 第一首更新/ })).toHaveAttribute('aria-current', 'true');
  expect(songs().getByRole('button', { name: /^3 手機新加入/ })).toBeInTheDocument();
  expect(screen.getByTestId('chart')).toHaveTextContent('第一首更新');
  expect(tempo()).toHaveValue('72');
  expect(audio.update.mock.calls.every(([value]) => value.bpm === 72 && value.beats === 4)).toBe(true);
  expect(audio.start).not.toHaveBeenCalled(); expect(audio.stop).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '增加 1 BPM' }));
  expect(tempo()).toHaveValue('73');
  // A local tempo adjustment remains a session preference across remote edits.
  fireEvent.click(screen.getByRole('button', { name: '停止' }));
  audio.playing = false;
  view.rerender(<DrummerMode {...remote} language="zh" onClose={vi.fn()}/>);
  expect(tempo()).toHaveValue('73');
  expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 73, beats: 3 }));
  fireEvent.click(songs().getByRole('button', { name: /^3 手機新加入/ }));
  expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 88, beats: 4 }));
});

it('keeps a remotely removed playing song until stop, then selects a surviving entry without auto-playing', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: '播放' }));
  audio.playing = true;
  const remote = { ...session, entries: [session.entries[1]] };
  view.rerender(<DrummerMode {...remote} language="zh" onClose={vi.fn()}/>);
  expect(tempo()).toHaveValue('72');
  expect(screen.getByTestId('chart')).toHaveTextContent('第一首');
  expect(songs().queryByRole('button', { name: /第一首/ })).toBeNull();
  audio.start.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '停止' }));
  audio.playing = false;
  view.rerender(<DrummerMode {...remote} language="zh" onClose={vi.fn()}/>);
  expect(tempo()).toHaveValue('110');
  expect(audio.start).not.toHaveBeenCalled();
  view.rerender(<DrummerMode {...remote} entries={[]} language="zh" onClose={vi.fn()}/>);
  expect(screen.getByText('這份歌單還沒有可播放的歌曲。')).toBeInTheDocument();
});

it('applies an incoming tempo after stopping when the drummer has not overridden it', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: '播放' }));
  audio.playing = true;
  const remote = { ...session, entries: session.entries.map(entry => entry.id === 'a'
    ? { ...entry, song: { ...entry.song, tempo: 140 } } : entry) };
  view.rerender(<DrummerMode {...remote} language="zh" onClose={vi.fn()}/>);
  expect(tempo()).toHaveValue('72');
  fireEvent.click(screen.getByRole('button', { name: '停止' }));
  audio.playing = false;
  view.rerender(<DrummerMode {...remote} language="zh" onClose={vi.fn()}/>);
  expect(tempo()).toHaveValue('140');
});


it('keeps the same chart page and DOM when the same song receives a remote key edit', () => {
  const initial = { ...session, entries: [{ id: 'a', song: song('雙頁', 72) }] };
  const view = mount(initial);
  fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
  const area = screen.getByLabelText('翻頁樂譜');
  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 } as DOMRect);
  fireEvent(area, new MouseEvent('pointerdown', { clientX: 150, clientY: 100, bubbles: true }));
  fireEvent(area, new MouseEvent('pointerup', { clientX: 150, clientY: 100, bubbles: true }));
  const page = screen.getByText('第二頁內容');
  expect(page).not.toHaveAttribute('aria-hidden');
  view.rerender(<DrummerMode {...initial} entries={[{ ...initial.entries[0], song: { ...initial.entries[0].song, currentKey: 'D' } }]} language="zh" onClose={vi.fn()}/>);
  expect(screen.getByLabelText('翻頁樂譜')).toBe(area);
  expect(screen.getByText('第二頁內容')).toBe(page);
  expect(page).not.toHaveAttribute('aria-hidden');
  expect(screen.getByText('第一頁內容')).toHaveAttribute('aria-hidden', 'true');
  // If a page is removed remotely, clamp before paint instead of hiding all pages.
  view.rerender(<DrummerMode {...initial} entries={[{ ...initial.entries[0], song: song('單頁更新', 72) }]} language="zh" onClose={vi.fn()}/>);
  expect(screen.getByLabelText('翻頁樂譜')).toBe(area);
  expect(screen.getByTestId('chart')).toHaveTextContent('單頁更新');
});


it('leaves a manually scrolled song list in place when remote entries update', () => {
  const view = mount();
  const list = document.querySelector<HTMLElement>('.drummer-list-scroll')!;
  list.scrollTop = 240;
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 200, height: 200 } as DOMRect);
  const selected = songs().getByRole('button', { name: /^1 第一首/ });
  vi.spyOn(selected, 'getBoundingClientRect').mockReturnValue({ top: -240, bottom: -140 } as DOMRect);
  view.rerender(<DrummerMode {...session} entries={[...session.entries, { id: 'new', song: song('手機新增', 88) }]} language="zh" onClose={vi.fn()}/>);
  expect(list.scrollTop).toBe(240);
  expect(songs().getByRole('button', { name: /^1 第一首/ })).toBe(selected);
  expect(selected).toHaveAttribute('aria-current', 'true');
});

function viewportMedia(narrow = true, portrait = true, phoneLandscape = false) {
  const matches = new Map([
    ['(max-width: 599px)', narrow],
    ['(orientation: portrait)', portrait],
    ['(orientation: landscape) and (max-width: 1000px) and (max-height: 500px)', phoneLandscape]
  ]);
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return Boolean(matches.get(query)); },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
  })));
  return (next: boolean[]) => act(() => {
    [...matches.keys()].forEach((query, index) => matches.set(query, next[index]));
    listeners.forEach(notify => notify());
  });
}
it('does not paginate hidden phone charts when selecting songs; opens only the selected chart on demand', () => {
  viewportMedia();
  mount();
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  fireEvent.click(songs().getByRole('button', { name: /^2 第二首/ }));
  expect(tempo()).toHaveValue('110');
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '樂譜' }));
  expect(screen.getByTestId('chart')).toHaveTextContent('第二首');
  fireEvent.click(screen.getByRole('button', { name: '歌單' }));
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
});
it('mounts the current chart when rotating from phone landscape to a desktop chart layout', () => {
  const resize = viewportMedia(false, false, true);
  mount();
  fireEvent.click(songs().getByRole('button', { name: /^2 第二首/ }));
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  resize([false, false, false]);
  expect(screen.getByTestId('chart')).toHaveTextContent('第二首');
  expect(audio.stop).not.toHaveBeenCalled();
});
it('omits portrait performance charts and restores the normal tablet chart without stopping Click', () => {
  viewportMedia(false, true);
  audio.playing = true;
  mount();
  expect(screen.getByTestId('chart')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '演出模式' }));
  expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '一般模式' }));
  expect(screen.getByTestId('chart')).toBeInTheDocument();
  expect(audio.stop).not.toHaveBeenCalled();
});
it('keeps config effects from replacing a pending song start and applies the latest tempo afterward', () => {
  const result = mount();
  audio.playing = true; audio.starting = true;
  audio.update.mockClear();
  fireEvent.click(songs().getByRole('button', { name: /^2 第二首/ }));
  fireEvent.click(screen.getByRole('button', { name: '增加 1 BPM' }));
  expect(audio.stop).not.toHaveBeenCalled();
  expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 110 }));
  expect(audio.update).not.toHaveBeenCalled();
  audio.starting = false;
  result.rerender(<DrummerMode {...session} language="zh" onClose={vi.fn()}/>);
  expect(audio.update).toHaveBeenCalledWith(expect.objectContaining({ bpm: 111 }));
});
it('rejects a pasted BPM range without modifying the current tempo or truncating the draft', () => {
  mount(); audio.update.mockClear();
  fireEvent.change(tempo(), { target: { value: '100–120' } });
  fireEvent.blur(tempo());
  expect(tempo()).toHaveValue('100–120'); expect(tempo()).toHaveAttribute('aria-invalid', 'true');
  expect(audio.update).not.toHaveBeenCalled();
  expect(songs().getByRole('button', { name: /^1 第一首/ })).toHaveAccessibleName(/72 BPM/);
});

it('keeps duplicate songs distinguished by order without extra author lines in drummer mode', () => {
  mount({ ...session, entries: [
    { id: 'a', song: { ...song('Same God', 72), composer: 'Writer One' } },
    { id: 'b', song: { ...song('Same God', 72), composer: 'Writer Two' } },
    { id: 'c', song: { ...song('Unique', 72), composer: 'Writer Three' } },
  ] });
  expect(songs().getByRole('button', { name: /^1 Same God/ })).not.toHaveTextContent('Writer One');
  expect(songs().getByRole('button', { name: /^2 Same God/ })).not.toHaveTextContent('Writer Two');
  expect(songs().getByRole('button', { name: /^3 Unique/ })).not.toHaveTextContent('Writer Three');
});

it('keeps version and bilingual labels out of setlist rows while preserving the chart title', () => {
  const title = 'Same God（中英雙語／現場版本）';
  mount({ ...session, entries: [{ id: 'a', song: { ...song(title, 72), composer: 'Writer' } }] });
  const row = songs().getByRole('button', { name: /^1 Same God/ });
  expect(row).toHaveTextContent('Same God');
  expect(row).not.toHaveTextContent('中英雙語');
  expect(row).not.toHaveTextContent('Writer');
  expect(screen.getByTestId('chart')).toHaveTextContent(title);
});

it('keeps the drummer score inside the light paper scope in night mode', () => {
  document.documentElement.classList.add('dark');
  try {
    render(<DrummerMode {...session} language="zh" onClose={() => {}}/>);
    const paper = screen.getByTestId('chart').closest('[data-print-preview]');
    expect(paper).not.toBeNull();
    expect(paper).toHaveStyle({ colorScheme: 'light' });
  } finally { document.documentElement.classList.remove('dark'); }
});
