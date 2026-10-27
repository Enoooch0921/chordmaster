import { render, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import SetlistNavigator, { setlistPanelVariants } from './SetlistNavigator';

it('pushes the next level from the right and reverses that path when returning', () => {
  const forward = { direction: 1, instant: false, reduced: false };
  const back = { ...forward, direction: -1 };
  expect(setlistPanelVariants.enter(forward).transform).toBe('translate3d(100%, 0, 0)');
  expect(setlistPanelVariants.exit(forward).transform).toBe('translate3d(-25%, 0, 0)');
  expect(setlistPanelVariants.enter(back).transform).toBe('translate3d(-25%, 0, 0)');
  expect(setlistPanelVariants.exit(back).transform).toBe('translate3d(100%, 0, 0)');
  expect(setlistPanelVariants.visible(forward).transition.duration).toBe(0.24);
});

it('replaces sliding with a gentle fade for reduced motion and switches instantly for keyboards', () => {
  const reduced = { direction: 1, instant: false, reduced: true };
  expect(setlistPanelVariants.enter(reduced)).toEqual({ transform: 'none', opacity: 0 });
  expect(setlistPanelVariants.exit(reduced).transform).toBe('none');
  expect(setlistPanelVariants.visible(reduced).transition.duration).toBe(0.125);
  const keyboard = { ...reduced, reduced: false, instant: true };
  expect(setlistPanelVariants.enter(keyboard)).toEqual({ transform: 'none', opacity: 1 });
  expect(setlistPanelVariants.exit(keyboard).transition.duration).toBe(0);
});

it('disables outgoing controls during a slide and skips animation when restoring memory', async () => {
  const props = { list: <button>Project</button>, detail: <button>Meeting</button>, addSongs: '', manageProjects: '' };
  const { container, rerender } = render(<SetlistNavigator {...props} ready={false} view="list" />);
  rerender(<SetlistNavigator {...props} ready view="detail" />);
  expect(container.querySelectorAll('[data-setlist-panel-layer]')).toHaveLength(1);
  expect(container.querySelector('[data-setlist-panel-layer]')).toHaveStyle({ opacity: '1' });
  rerender(<SetlistNavigator {...props} ready view="list" />);
  const outgoing = container.querySelector('[data-setlist-panel-layer="detail"]');
  expect(outgoing).toHaveAttribute('inert');
  expect(outgoing).toHaveAttribute('aria-hidden', 'true');
  expect(outgoing).toHaveStyle({ zIndex: '1' });
  expect(container.querySelector('[data-setlist-panel-layer="list"]')).toHaveStyle({ zIndex: '0' });
  // Reverse before the outgoing child finishes: the restored child is active again.
  rerender(<SetlistNavigator {...props} ready view="detail" />);
  expect(container.querySelector('[data-setlist-panel-layer="detail"]')).not.toHaveAttribute('inert');
  expect(container.querySelector('[data-setlist-panel-layer="list"]')).toHaveAttribute('inert');
  await waitFor(() => expect(container.querySelectorAll('[data-setlist-panel-layer]')).toHaveLength(1));
});

it('animates root folders even while both levels use the list view and restores the root scroll', async()=>{
 const panel=(label:string)=><div data-setlist-scroll><button>{label}</button></div>;
 const options={detail:'',addSongs:'',manageProjects:'',view:'list' as const,motion:{instant:true,reduced:false}};
 const {container,rerender}=render(<SetlistNavigator {...options} path={[]} list={panel('Root folder')}/>);
 const scroller=container.querySelector<HTMLElement>('[data-setlist-scroll]')!;scroller.scrollTop=260;
 rerender(<SetlistNavigator {...options} path={['project:la']} list={panel('Meeting')}/>);
 await waitFor(()=>expect(container.querySelectorAll('[data-setlist-panel-layer]')).toHaveLength(1));
 expect(container.querySelector('[data-setlist-location]')).toHaveStyle({zIndex:'1'});
 rerender(<SetlistNavigator {...options} path={[]} list={panel('Root folder')}/>);
 await waitFor(()=>expect(container.querySelectorAll('[data-setlist-panel-layer]')).toHaveLength(1));
 expect(container.querySelector('[data-setlist-location]')).toHaveStyle({zIndex:'0'});
 expect(container.querySelector<HTMLElement>('[data-setlist-scroll]')!.scrollTop).toBe(260);
});
