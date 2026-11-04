import { useIsPresent } from 'motion/react';
import { PresenceSurface } from './ui/InteractionMotion';
import { useUiMotion } from '../hooks/useUiMotion';
import { backdropVariants, modalVariants } from '../lib/uiMotion';
import { useRef } from 'react';
import type { AppLanguage } from '../types';
import type { WorkspaceChange } from '../lib/workspaceChangeSummary';
import { useModalFocus } from '../hooks/useModalFocus';

export default function WorkspaceSaveDialog({ language, workspaceName, changes, onSave, onDiscard, onCancel }: {
  language: AppLanguage; workspaceName?: string; changes: WorkspaceChange[]; onSave: () => void; onDiscard: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const preference = useUiMotion();
  useModalFocus(present, ref);
  const zh = language === 'zh';
  return <PresenceSurface custom={preference} variants={backdropVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
  }}>
    <PresenceSurface ref={ref} custom={preference} variants={modalVariants} initial="hidden" animate="visible" exit="exit" role="alertdialog" aria-modal="true" aria-labelledby="workspace-save-title" aria-describedby="workspace-save-description" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
      <h2 id="workspace-save-title" className="text-lg font-bold text-slate-900">{zh ? '儲存後切換工作區？' : 'Save before switching workspaces?'}</h2>
      <p id="workspace-save-description" className="mt-2 text-sm text-slate-600">{[workspaceName, zh ? '未儲存變更' : 'Unsaved changes'].filter(Boolean).join(' · ')}</p>
      <ul className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto text-sm">
        {changes.map((change, index) => <li key={index} className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">{change.location}</div>
          <div className="break-words font-semibold text-slate-900">{change.name}<span className="ml-2 text-xs font-normal text-slate-500">{change.detail}</span></div>
        </li>)}
      </ul>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">{zh ? '取消' : 'Cancel'}</button>
        <button type="button" onClick={onDiscard} className="min-h-11 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700">{zh ? '捨棄並切換' : 'Discard and switch'}</button>
        <button type="button" onClick={onSave} className="min-h-11 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white">{zh ? '儲存並切換' : 'Save and switch'}</button>
      </div>
    </PresenceSurface>
  </PresenceSurface>;
}
