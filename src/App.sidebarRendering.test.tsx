import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { saveNavigationLocation, getNavigationStorageKey } from './lib/setlistNavigationMemory';
import type { ComponentProps } from 'react';
import type ChordSheet from './components/ChordSheet';
import type { StoredSong, WorkspaceSnapshot } from './types';
const state = vi.hoisted(() => ({ renders: [] as Array<ComponentProps<typeof ChordSheet>> }));
let fixture: WorkspaceSnapshot;
vi.mock('./components/ChordSheet', () => ({ default: (props: ComponentProps<typeof ChordSheet>) => {
  state.renders.push(props);
  return <div data-print-page data-testid={`chart-${props.previewIdentity}`}>
    <h1>{props.song.title}</h1><span>{props.song.currentKey}/{props.song.capo}/{props.song.sections[0].bars.length}</span>
    <button onClick={() => props.onAddBarClick?.(0)}>Add test bar {props.previewIdentity}</button>
  </div>;
} }));
vi.mock('./lib/auth', () => ({ useSupabaseAuth: () => ({ user: null, session: null, status: 'signed-out', isConfigured: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }) }));
vi.mock('./lib/workspace', async original => ({ ...await original<typeof import('./lib/workspace')>(), loadPersistentWorkspaceSnapshot: async () => fixture }));
vi.mock('./hooks/useLibraryWorkspaceRefresh', () => ({ useLibraryWorkspaceRefresh: () => false }));
vi.mock('./hooks/useJoinedWorkspaceRefresh', () => ({ useJoinedWorkspaceRefresh: () => false }));
beforeAll(() => {
  if (!window.PointerEvent) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerType: string; isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerType = init.pointerType ?? 'mouse'; this.isPrimary = init.isPrimary ?? true; }
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLElement.prototype.scrollIntoView = vi.fn(); HTMLElement.prototype.scrollTo = vi.fn();
});
beforeEach(() => {
  localStorage.clear(); state.renders.length = 0;
  const songs: StoredSong[] = ['first','second','third'].map((id,index) => ({id,title:`Song ${index+1}`,currentKey:'C',originalKey:'C',timeSignature:'4/4',updatedAt:1,sections:[{id:'verse',title:'Verse',bars:[{id:`bar-${id}`,chords:['C']}]}]}));
  const entries = songs.map((song,order)=>({id:`entry-${song.id}`,setlistId:'meeting',songId:song.id,songData:structuredClone(song),order,sectionOrder:['verse']}));
  fixture={songs,setlists:[{id:'meeting',name:'Meeting',displayMode:'chord-movable-key',createdAt:1,updatedAt:1,songs:entries}],joinedSetlists:[],projects:[],joinedProjects:[],lastSavedAt:1};
  saveNavigationLocation(getNavigationStorageKey(null,null),{version:1,workspaceMode:'setlists',filter:{kind:'all'},parentFilter:{kind:'all'},view:'detail',setlistId:'meeting',songId:'entry-first'});
});
const latest = (id: string) => state.renders.filter(p=>p.previewIdentity === id).at(-1)!;
const settle = () => act(async () => { await new Promise(resolve=>setTimeout(resolve,160)); });
it('switches both mobile tabs with feedback while retaining the covered chart, then shows the latest selection', async () => {
  const oldWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  try {
    render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
    await screen.findByTestId('chart-entry-first'); await settle();
    fireEvent.click(screen.getByRole('button', { name: '固定歌曲列表' })); await settle();
    const nav = document.querySelector<HTMLElement>('[data-mobile-sidebar-navigation]')!;
    const content = document.querySelector<HTMLElement>('[data-mobile-workspace-content]')!;
    const fade = vi.fn(() => ({ playState: 'finished', cancel: vi.fn() }) as unknown as Animation);
    content.animate = fade;
    const chart = screen.getByTestId('chart-entry-first');
    state.renders.length = 0;
    for (const label of ['歌曲', '歌單', '歌曲']) {
      const button = within(nav).getByRole('button', { name: label });
      fireEvent.pointerDown(button, { pointerType: 'touch' }); fireEvent.click(button);
      await settle();
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(document.querySelector('[data-covered-preview]')).toHaveAttribute('inert');
      expect(document.querySelector('[data-testid="chart-entry-first"]')).toBe(chart);
      expect(state.renders).toHaveLength(0);
    }
    expect(fade).toHaveBeenCalledTimes(3);
    expect(fade).toHaveBeenLastCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 125 }));
    fireEvent.click(within(nav).getByRole('button', { name: '完成' }));
    await screen.findByTestId('chart-first');
    expect(document.querySelector('[data-covered-preview]')).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('chart-entry-first')).toBeNull();
  } finally {
    if (oldWidth) Object.defineProperty(window, 'innerWidth', oldWidth);
  }
}, 15000);

it('preserves the reading offset when phone navigation closes without a song change', async () => {
  const oldWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  try {
    render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
    await screen.findByTestId('chart-entry-first'); await settle();
    const root = document.querySelector<HTMLElement>('[data-print-preview-container]')!;
    const scroll = vi.fn();
    root.scrollTo = scroll;
    root.scrollTop = 350;
    fireEvent.click(screen.getByRole('button', { name: '固定歌曲列表' })); await settle();
    const nav = document.querySelector<HTMLElement>('[data-mobile-sidebar-navigation]')!;
    fireEvent.click(within(nav).getByRole('button', { name: '完成' })); await settle();
    expect(root.scrollTop).toBe(350);
    expect(scroll).not.toHaveBeenCalled();
  } finally {
    if (oldWidth) Object.defineProperty(window, 'innerWidth', oldWidth);
  }
}, 15000);

it('keeps desktop hover navigation over the score and reserves space only for a pinned sidebar', async () => {
  const oldWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  try {
    render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
    await screen.findByTestId('chart-entry-first'); await settle();
    const sidebar = document.querySelector<HTMLElement>('[data-sidebar]')!;
    const shell = document.querySelector<HTMLElement>('[data-sidebar-shell]')!;
    const toggle = document.querySelector<HTMLButtonElement>('[data-sidebar-toggle]')!;
    const collapsedWidth = sidebar.style.width;
    state.renders.length = 0;
    fireEvent.mouseEnter(shell); await settle();
    expect(sidebar).toHaveAttribute('data-sidebar-expanded', 'true');
    expect(sidebar.style.width).toBe(collapsedWidth);
    expect(screen.queryByRole('button', { name: '調整歌曲列表寬度' })).toBeNull();
    fireEvent.mouseLeave(shell); await settle();
    expect(sidebar.style.width).toBe(collapsedWidth);
    expect(state.renders).toHaveLength(0);
    fireEvent.click(toggle); await settle();
    expect(parseFloat(sidebar.style.width)).toBeGreaterThan(parseFloat(collapsedWidth));
    fireEvent.click(toggle); await settle();
    expect(sidebar.style.width).toBe(collapsedWidth);
  } finally {
    if (oldWidth) Object.defineProperty(window, 'innerWidth', oldWidth);
  }
}, 15000);

it.each([false, true])('does not render charts for sidebar hover/menu changes (joined=%s) and keeps hidden list geometry stable', async joined => {
  if (joined) fixture = { ...fixture, songs: [], setlists: [], joinedSetlists: [{ ...fixture.setlists[0], isJoined: true }] };
  render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
  await screen.findByTestId('chart-entry-second'); await settle();
  state.renders.length=0;
  const sidebar=document.querySelector<HTMLElement>('[data-sidebar]')!;
  const shell=sidebar.firstElementChild as HTMLElement;
  const content=document.querySelector<HTMLElement>('[data-sidebar-content]')!;
  const width=content.style.width;
  const shellWidth=shell.style.width;
  expect(content.hasAttribute('inert')).toBe(true);
  fireEvent.mouseEnter(shell); await settle();
  expect(sidebar.dataset.sidebarExpanded).toBe('true');
  expect(content.hasAttribute('inert')).toBe(false);expect(content.style.width).toBe(width);
  expect(shell.style.width).toBe(shellWidth);
  fireEvent.mouseLeave(shell); await settle();
  expect(sidebar.dataset.sidebarExpanded).toBe('false');
  expect(content.hasAttribute('inert')).toBe(true);expect(content.style.width).toBe(width);
  expect(shell.style.width).toBe(shellWidth);
  expect(document.querySelector('[data-sidebar-backdrop]')).toHaveAttribute('inert');
  expect(document.querySelector('[data-sidebar-backdrop]')).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(screen.getAllByRole('button',{name:'更多'})[0]); await settle();
  fireEvent.keyDown(document,{key:'Escape'});await settle();
  expect(state.renders).toHaveLength(0);
},15000);
it('keeps cached callbacks fresh after selection, edits and another chrome render',async()=>{
  render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
  await screen.findByTestId('chart-entry-second');await settle();
  const first=latest('entry-first');
  act(()=>first.onAddBarClick?.(0));
  await waitFor(()=>expect(latest('entry-first').song.sections[0].bars).toHaveLength(2));
  const row=document.querySelector<HTMLElement>('[data-setlist-song-id="entry-second"]')!;
  fireEvent.click(within(row).getByRole('button',{name:/Song 2原調/}));await settle();
  expect(latest('entry-second').onAddBarClick).toBeTypeOf('function');
  fireEvent.click(screen.getAllByRole('button',{name:'更多'})[0]); await settle();
  act(()=>latest('entry-second').onAddBarClick?.(0));
  await waitFor(()=>expect(latest('entry-second').song.sections[0].bars).toHaveLength(2));
  expect(latest('entry-first').song.sections[0].bars).toHaveLength(2);
},15000);


it.each([834, 1194])('toggles an iPad sidebar on the first press and keeps the green state truthful at %spx', async width => {
  const oldWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const oldTouch = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  try {
    render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
    await screen.findByTestId('chart-entry-second'); await settle();
    const sidebar = document.querySelector<HTMLElement>('[data-sidebar]')!;
    const shell = sidebar.firstElementChild!;
    const toggle = document.querySelector<HTMLButtonElement>('[data-sidebar-toggle]')!;
    const tap = (button: HTMLButtonElement) => {
      fireEvent.pointerDown(button, { pointerType: 'touch', button: 0, isPrimary: true });
      fireEvent.pointerUp(button, { pointerType: 'touch', button: 0, isPrimary: true });
      fireEvent.click(button, { detail: 1 });
    };
    // Safari's synthetic hover must not open an unpinned intermediate state.
    fireEvent.mouseEnter(shell, { clientY: 10 });
    expect(sidebar.dataset.sidebarExpanded).toBe('false');
    tap(toggle);
    expect(sidebar.dataset.sidebarExpanded).toBe('true');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveClass('bg-emerald-600');
    tap(toggle);
    fireEvent.mouseMove(shell, { clientY: 10 });
    expect(sidebar.dataset.sidebarExpanded).toBe('false');
    expect(toggle).not.toHaveClass('bg-emerald-600');
    for (const mode of ['songs', 'setlists']) {
      const button = document.querySelector<HTMLButtonElement>(`[data-sidebar-workspace="${mode}"]`)!;
      tap(button);
      expect(sidebar.dataset.sidebarExpanded).toBe('true');
      expect(toggle).toHaveClass('bg-emerald-600');
      tap(button);
      expect(sidebar.dataset.sidebarExpanded).toBe('false');
      expect(toggle).not.toHaveClass('bg-emerald-600');
    }
    fireEvent.click(toggle, { detail: 0 });
    expect(sidebar.dataset.sidebarExpanded).toBe('true');
  } finally {
    if (oldWidth) Object.defineProperty(window, 'innerWidth', oldWidth);
    if (oldTouch) Object.defineProperty(navigator, 'maxTouchPoints', oldTouch);
    else Reflect.deleteProperty(navigator, 'maxTouchPoints');
  }
}, 15000);

it('keeps other setlist charts cached while entering, deleting and undoing a jianpu draft', async () => {
  render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
  await screen.findByTestId('chart-entry-second'); await settle();
  act(() => latest('entry-first').onElementClick?.(0,0,'riff',{
    previewIdentity:'entry-first',sectionId:'verse',barId:'bar-first',field:'riff',slotIndex:null,rawChordIndex:null,
    notationMode:'jianpu',cursor:{kind:'jianpu',beatIndex:0,unitIndex:0,noteIndex:null},
    anchorKey:'entry-first|verse|bar-first|jianpu|all',anchorRect:{left:10,top:10,right:50,bottom:30,width:40,height:20}
  }));
  await screen.findByRole('button',{name:'輸入簡譜 1'}); await settle(); state.renders.length=0;
  fireEvent.click(screen.getByRole('button',{name:'輸入簡譜 1'}));
  await waitFor(()=>expect(latest('entry-first').song.sections[0].bars[0].riff).toContain('1'));
  expect(state.renders.filter(p=>p.previewIdentity==='entry-second')).toHaveLength(0);
  state.renders.length=0;
  fireEvent.click(screen.getByRole('button',{name:'刪除簡譜音符'}));
  await waitFor(()=>expect(latest('entry-first').song.sections[0].bars[0].riff ?? '').not.toContain('1'));
  expect(state.renders.filter(p=>p.previewIdentity==='entry-second')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Undo'}));
  await waitFor(()=>expect(latest('entry-first').song.sections[0].bars[0].riff).toContain('1'));
  expect(state.renders.filter(p=>p.previewIdentity==='entry-second')).toHaveLength(0);
},15000);


it('reuses untouched chart data when selecting another song, and stops background chart updates during performance', async () => {
  render(<MemoryRouter><ToastProvider><App/></ToastProvider></MemoryRouter>);
  await screen.findByTestId('chart-entry-third'); await settle();
  const firstSong = latest('entry-first').song;
  const secondSong = latest('entry-second').song;
  state.renders.length = 0;
  const secondRow = document.querySelector<HTMLElement>('[data-setlist-song-id="entry-second"]')!;
  fireEvent.click(within(secondRow).getByRole('button', { name: /Song 2原調/ })); await settle();
  expect(state.renders.some(props => props.previewIdentity === 'entry-third')).toBe(false);
  expect(latest('entry-first').song).toBe(firstSong);
  expect(latest('entry-second').song).toBe(secondSong);
  expect(latest('entry-second').onAddBarClick).toBeTypeOf('function');

  fireEvent.click(screen.getByRole('button', { name: '演出模式' })); await settle();
  state.renders.length = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Next page' })); await settle();
  expect(document.querySelector('[data-performance-overlay] h1')).toHaveTextContent('Song 3');
  // The stage renders; the background previews must stay unchanged.
  expect(state.renders.length).toBeGreaterThan(0);
  expect(state.renders.every(props => props.previewIdentity === 'entry-third' && !props.onElementClick)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '退出' })); await settle();
  expect(latest('entry-third').onAddBarClick).toBeTypeOf('function');
  act(() => latest('entry-third').onAddBarClick?.(0));
  await waitFor(() => expect(latest('entry-third').song.sections[0].bars).toHaveLength(2));
}, 15000);
it('does not redraw the chart for song-library search changes', async () => {
  render(<MemoryRouter><ToastProvider><App /></ToastProvider></MemoryRouter>);
  await screen.findByTestId('chart-entry-first'); await settle();
  fireEvent.click(screen.getByRole('button', { name: '歌曲' })); await settle();
  const search = screen.getByRole('textbox', { name: '搜尋歌曲' });
  state.renders.length = 0;
  fireEvent.change(search, { target: { value: 'Song 2' } }); await settle();
  expect(state.renders).toHaveLength(0);
  fireEvent.change(search, { target: { value: '' } }); await settle();
  expect(state.renders).toHaveLength(0);
});
