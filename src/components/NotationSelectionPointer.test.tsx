import { act, render } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import NotationSelectionPointer from './NotationSelectionPointer';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each([0.7,1.4,2])('keeps one stable alignment at preview zoom %s without React updates or a self-observing loop', async zoom => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(()=>fn(performance.now()),16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const commits=vi.fn();
  const {container,unmount}=render(<div className="sheet-bar"><div><span data-jianpu-onset="0"/>
    <Profiler id="arrow" onRender={commits}><NotationSelectionPointer data-pointer jianpuOnset={0} style={{borderBottom:'5px solid black'}}/></Profiler>
  </div></div>);
  const pointer=container.querySelector<HTMLElement>('[data-pointer]')!,bar=container.firstElementChild!,digit=container.querySelector<HTMLElement>('[data-jianpu-onset]')!;
  let center=60;
  const reads=vi.fn(()=>{const [x,y]=(pointer.style.translate||'0px 0px').split(' ').map(parseFloat);return new DOMRect((40+x)*zoom,(97+y)*zoom,6*zoom,5*zoom)});
  pointer.getBoundingClientRect=reads;
  bar.getBoundingClientRect=()=>new DOMRect(0,0,100*zoom,100*zoom);
  digit.getBoundingClientRect=()=>new DOMRect((center-4)*zoom,70*zoom,8*zoom,10*zoom);
  act(()=>window.dispatchEvent(new Event('resize')));
  await act(async()=>{vi.advanceTimersByTime(20);await Promise.resolve();vi.advanceTimersByTime(100)});
  const aligned = pointer.style.translate.split(' ').map(parseFloat);
  expect(aligned[0]).toBeCloseTo(17); expect(aligned[1]).toBeCloseTo(6);
  expect(commits).toHaveBeenCalledTimes(1);
  expect(reads).toHaveBeenCalledTimes(1);
  center=80;digit.style.left='80px';
  await act(async()=>{await Promise.resolve();vi.advanceTimersByTime(20);await Promise.resolve();vi.advanceTimersByTime(100)});
  expect(parseFloat(pointer.style.translate)).toBeCloseTo(37);
  expect(reads).toHaveBeenCalledTimes(2);expect(commits).toHaveBeenCalledTimes(1);
  unmount();act(()=>vi.advanceTimersByTime(100));expect(reads).toHaveBeenCalledTimes(2);
});
