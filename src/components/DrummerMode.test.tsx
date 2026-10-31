import React from 'react';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DrummerMode, { type DrummerSession } from './DrummerMode';
import type { Song } from '../types';
import type { MidiEvents } from '../lib/midiInput';
import { MIDI_PROFILE_KEY } from '../lib/drummerMidi';
const audio = vi.hoisted(() => ({ start: vi.fn(), prepare: vi.fn(async () => {}), stop: vi.fn(), update: vi.fn(), playing: false, starting: false, beat: -1, notice: null }));
const fullscreen = vi.hoisted(() => ({ requestFullscreen: vi.fn(), exitFullscreen: vi.fn(), canRequestFullscreen: false, isFullscreen: false }));
vi.mock('../hooks/useMetronome', () => ({ useMetronome: () => audio }));
vi.mock('../hooks/usePerformanceFullscreen', () => ({ usePerformanceFullscreen: () => fullscreen }));
vi.mock('./ChordSheet', () => ({ default: ({ song }: { song: Song }) => <div data-testid="chart">{song.title}{song.title === "雙頁" && <><div data-print-page>第一頁內容</div><div data-print-page>第二頁內容</div></>}</div> }));
const song = (title: string, tempo?: number, timeSignature = '4/4'): Song => ({ title, tempo, timeSignature, originalKey: 'C', currentKey: 'C', sections: [] });
const session: DrummerSession = { name: '測試歌單', initialId: 'a', entries: [{ id: 'a', song: song('第一首', 72) }, { id: 'b', song: song('第二首', 110) }, { id: 'c', song: song('未定速度') }, { id: 'd', song: song('第一首', 72) }] };
const tempo = () => screen.getByRole('textbox', { name: '節拍器速度 BPM' });
const songs = () => within(screen.getByRole('region', { name: '鼓手歌單' }));
function mount(value = session) { return render(<DrummerMode {...value} language="zh" onClose={vi.fn()}/>); }
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); fullscreen.isFullscreen = false; audio.playing = false; audio.starting = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
describe('drummer session controls', () => {
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
  it.each(['ableton-classic', 'drive'])('defaults to MultiTracks and remembers %s across songs and reopening', soundId => {
    const first = mount();
    const sound = screen.getByLabelText('音色');
    expect(sound).toHaveValue('multitracks');
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ sound: 'multitracks' }));
    fireEvent.change(sound, { target: { value: soundId } });
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ sound: soundId, bpm: 110 }));
    first.unmount();
    mount();
    expect(screen.getByLabelText('音色')).toHaveValue(soundId);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ sound: soundId }));
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
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 110 }));
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
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ sound: 'drive', bpm: 72, beats: 4, subdivision: 1 }));
    fireEvent.change(sound, { target: { value: 'ableton-classic' } });
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ sound: 'ableton-classic', bpm: 72 }));
    expect(JSON.parse(localStorage.getItem('chordmaster.drummer-preferences.v1')!)).toMatchObject({ sound: 'ableton-classic' });
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
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ subdivision: 1 }));
    fireEvent.click(songs().getByRole('button', { name: /2 第二首/ }));
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ subdivision: 2 }));
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
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ beatLevels: [3, 1, 1, 1], subdivision: 1 }));
    fireEvent.click(songs().getByRole('button', { name: /1 第一首/ }));
    expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ beatLevels: [0, 1, 1, 1] }));
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
    expect(audio.stop).toHaveBeenCalledOnce();
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
    fireEvent.change(screen.getByLabelText('BPM 計拍單位'), { target: { value: 'group' } });
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ bpm: 80, beats: 2 }));
  });
  it('restores only validated personal preferences without a mute transport', () => {
    localStorage.setItem('chordmaster.drummer-preferences.v1', JSON.stringify({ volume: 1000, accent: -1, tone: 'soft', sound: 'missing', regular: .6, subdivision: 99 }));
    mount();
    expect(screen.queryByRole('button', { name: '靜音，保持計拍' })).not.toBeInTheDocument();
    expect(audio.stop).not.toHaveBeenCalled();
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ muted: false, volume: .7, accent: 1, regular: .6, subdivision: 1, sound: 'multitracks' }));
    expect(audio.update.mock.lastCall?.[0]).not.toHaveProperty('tone');
    expect(screen.getByLabelText('音色')).toHaveValue('multitracks');
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
});

it('uses previous/next to start songs directly and disables setlist boundaries', () => {
  mount();
  expect(screen.getByRole('button', { name: '上一首' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '下一首' }));
  expect(tempo()).toHaveValue('110'); expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 110 }));
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
  expect(tempo()).toHaveValue('110');expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({bpm:110}));
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
  expect(audio.start).toHaveBeenLastCalledWith(expect.objectContaining({subdivision:2,bpm:110}));
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
