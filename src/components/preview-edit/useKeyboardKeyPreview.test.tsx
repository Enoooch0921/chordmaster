import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useKeyboardKeyPreview} from './useKeyboardKeyPreview';
import {JianpuInputGlyph,RhythmStaffKeyGlyph} from './NotationKeyGlyphs';

function Harness({enabled=true}:{enabled?:boolean}){
 const preview=useKeyboardKeyPreview(enabled);const input=vi.fn();
 return <section onPointerDownCapture={preview.onPointerDownCapture}><div data-key-surface="character"><button onClick={input}>C</button><button aria-label="八分音符"><RhythmStaffKeyGlyph base="e"/></button><button aria-label="簡譜五"><JianpuInputGlyph pitch="5" octave={1} duration="eighth"/></button><button disabled>7</button></div><button>刪除</button>{preview.preview}</section>;
}
const press=(element:Element)=>fireEvent(element,new MouseEvent('pointerdown',{bubbles:true,button:0}));

it('shows the held character above the keyboard and removes it on release',()=>{
 render(<Harness/>);press(screen.getByRole('button',{name:'C'}));
 expect(document.querySelector('[data-keyboard-key-preview]')).toHaveAttribute('data-key-preview-label','C');
 expect(document.querySelector('[data-keyboard-key-preview]')).toHaveTextContent('C');
 fireEvent(document,new MouseEvent('pointerup',{bubbles:true}));
 expect(document.querySelector('[data-keyboard-key-preview]')).toBeNull();
});
it('previews the actual music glyph and preserves jianpu octave and duration',()=>{
 render(<Harness/>);press(screen.getByRole('button',{name:'八分音符'}));
 expect(document.querySelector('[data-keyboard-key-preview] [data-rhythm-staff-key-glyph]')).toHaveAttribute('data-rhythm-base','e');
 press(screen.getByRole('button',{name:'簡譜五'}));
 const glyph=document.querySelector('[data-keyboard-key-preview] [data-jianpu-input-glyph]');
 expect(glyph).toHaveAttribute('data-jianpu-pitch','5');expect(glyph).toHaveAttribute('data-jianpu-octave','1');expect(glyph).toHaveAttribute('data-jianpu-duration','eighth');
});
it('keeps tools and disabled keys quiet and disables previews for desktop mode',()=>{
 const {rerender}=render(<Harness/>);press(screen.getByRole('button',{name:'刪除'}));expect(document.querySelector('[data-keyboard-key-preview]')).toBeNull();
 press(screen.getByRole('button',{name:'7'}));expect(document.querySelector('[data-keyboard-key-preview]')).toBeNull();
 rerender(<Harness enabled={false}/>);press(screen.getByRole('button',{name:'C'}));expect(document.querySelector('[data-keyboard-key-preview]')).toBeNull();
});
it('clears the preview when the finger leaves the key or the gesture is cancelled',()=>{
 render(<Harness/>);press(screen.getByRole('button',{name:'C'}));fireEvent(document,new MouseEvent('pointermove',{bubbles:true,clientX:100,clientY:100}));expect(document.querySelector('[data-keyboard-key-preview]')).toBeNull();
 press(screen.getByRole('button',{name:'C'}));fireEvent(document,new MouseEvent('pointercancel',{bubbles:true}));expect(document.querySelector('[data-keyboard-key-preview]')).toBeNull();
});
