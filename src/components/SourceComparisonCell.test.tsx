import {render,screen} from '@testing-library/react';
import {beforeAll,expect,it,vi} from 'vitest';
import type {Song} from '../types';
import {compareSetlistSourceScores} from '../lib/setlistSourceComparison';
import SourceComparisonCell from './SourceComparisonCell';
const song=(chords:string[]):Song=>({title:'Measure comparison',originalKey:'C',currentKey:'C',timeSignature:'4/4',sections:[{id:'verse',title:'Verse',bars:[{id:'bar',chords}]}]});
beforeAll(()=>vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}}));
it('shows compact and explicit grids on the same beats, highlighting only the added continuations',()=>{
 const a=song(['D','D/E']),b=song(['D','/','D/E','/']);const snapshot=structuredClone([a,b]);
 const row=compareSetlistSourceScores(a,b,'zh')[0],pair=row.measures!;
 expect(pair.library.events.map(event=>event.beat)).toEqual([0,2]);
 expect(pair.library.events.every(event=>!event.changed)).toBe(true);
 expect(pair.setlist.events.filter(event=>event.changed).map(event=>event.beat)).toEqual([1,3]);
 const {container}=render(<><SourceComparisonCell text={row.library} measure={pair.library} language="zh"/><SourceComparisonCell text={row.setlist} measure={pair.setlist} language="zh"/></>);
 expect(screen.getAllByRole('img')).toHaveLength(2);
 expect(screen.getAllByRole('img')[0]).toHaveAccessibleName(/第 1 拍 D.*第 3 拍 D\/E/);
 expect([...container.querySelectorAll('[data-changed]')].map(element=>element.textContent)).toEqual(['/','/']);
 expect(container.querySelectorAll('[data-chord-beat-anchor="0.125"]')).toHaveLength(2);
 expect(container.querySelectorAll('[data-chord-beat-anchor="0.625"]')).toHaveLength(2);
 expect([a,b]).toEqual(snapshot);
});
it('highlights an actual chord edit on both sides',()=>{
 const pair=compareSetlistSourceScores(song(['G']),song(['Am']),'zh')[0].measures!;
 expect(pair.library.events[0]).toMatchObject({chord:'G',changed:true});
 expect(pair.setlist.events[0]).toMatchObject({chord:'Am',changed:true});
});
it('does not highlight an equivalent letter/degree chord along with newly added slash marks',()=>{
 const a={...song(['E']),originalKey:'A' as const,currentKey:'A' as const},b={...song(['5','/','/','/']),originalKey:'A' as const,currentKey:'A' as const};
 const pair=compareSetlistSourceScores(a,b,'zh')[0].measures!;
 expect(pair.library.events[0].changed).toBe(false);expect(pair.setlist.events[0].changed).toBe(false);
 expect(pair.setlist.events.slice(1).every(event=>event.changed)).toBe(true);
});
it('does not invent beat positions for an untimed measure',()=>{
 const a=song(['D','D/E']),b=song(['E','D/E']);a.sections[0].bars[0].chordTimingUnspecified=true;b.sections[0].bars[0].chordTimingUnspecified=true;
 const pair=compareSetlistSourceScores(a,b,'zh')[0].measures!;
 const {container}=render(<SourceComparisonCell text="D D/E" measure={pair.library} language="zh"/>);
 expect(screen.getByRole('img')).toHaveAccessibleName('小節（拍位未指定）：D D/E');
 expect(screen.getByText('拍位未指定')).toBeVisible();
 expect(container.querySelector('[data-comparison-beat]')).toBeNull();
 expect(container.querySelector('.source-mini-beats')).toBeNull();
});
it('uses inherited meters and preserves fractional attack offsets',()=>{
 const a=song(['D']),b=song(['E']);a.timeSignature=b.timeSignature='6/8';
 a.sections[0].bars[0].chordMarks={0:{beatOffset:.5}};b.sections[0].bars[0].chordMarks={0:{beatOffset:.5}};
 const pair=compareSetlistSourceScores(a,b,'zh')[0].measures!;
 expect(pair.library.beats).toBe(6);expect(pair.library.events[0].offset).toBe(.5);
 const {container}=render(<SourceComparisonCell text="D" measure={pair.library} language="zh"/>);
 expect(container.querySelectorAll('.source-mini-beats>span')).toHaveLength(6);
 expect(screen.getByRole('img')).toHaveAccessibleName(/第 1& 拍 D/);
});
it('keeps text-only differences readable',()=>{
 render(<SourceComparisonCell text="新增的歌詞" language="zh"/>);
 expect(screen.getByText('新增的歌詞')).toBeInTheDocument();expect(screen.queryByRole('img')).toBeNull();
});
