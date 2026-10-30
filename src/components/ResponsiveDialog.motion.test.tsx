import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { beforeAll, expect, it, vi } from 'vitest';
import ResponsiveDialog from './ResponsiveDialog';
vi.mock('../hooks/useUiMotion',()=>({useUiMotion:()=>({instant:true,reduced:false}),isKeyboardInteraction:()=>true}));
beforeAll(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 HTMLDialogElement.prototype.close=function(){this.open=false;};
});
it('releases the native top layer when an instant exit completes inside real AnimatePresence',async()=>{
 function Harness(){const[open,setOpen]=useState(true);return <AnimatePresence>{open&&<ResponsiveDialog title="分享歌單" closeLabel="關閉分享" onClose={()=>setOpen(false)}><input aria-label="測試欄位"/></ResponsiveDialog>}</AnimatePresence>;}
 render(<Harness/>);expect(screen.getByRole('dialog')).toHaveAttribute('open');
 fireEvent.click(screen.getByRole('button',{name:'關閉分享'}));
 await waitFor(()=>expect(document.querySelector('dialog')).toBeNull());
 expect(document.body.style.overflow).not.toBe('hidden');
});
