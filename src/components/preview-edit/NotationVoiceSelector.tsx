import { useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AppLanguage } from '../../types';

interface Props {
  language: AppLanguage;
  primaryName: string;
  voices: { id: string; label: string }[];
  selectedId?: string;
  context: string;
  canRenamePrimary?: boolean;
  canAdd?: boolean;
  onSelect: (id?: string) => void;
  onRename: (name: string) => void;
  onAdd: () => void;
  onRemove: () => void;
}

export default function NotationVoiceSelector({ language, primaryName, voices, selectedId, context,
  canRenamePrimary = true, canAdd = true, onSelect, onRename, onAdd, onRemove }: Props) {
  const zh = language === 'zh';
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const choiceGroup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const group = choiceGroup.current;
    const active = group?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!group || !active) return;
    const outer = group.getBoundingClientRect();
    const inner = active.getBoundingClientRect();
    if (inner.left < outer.left) group.scrollLeft -= outer.left - inner.left;
    else if (inner.right > outer.right) group.scrollLeft += inner.right - outer.right;
  }, [selectedId, voices.length]);
  const selectedName = selectedId ? (voices.find(voice => voice.id === selectedId)?.label ?? '') : primaryName;
  const commit = () => { onRename(name.trim()); setRenaming(false); };
  const choices = [{ id: undefined, label: primaryName }, ...voices];
  return <div data-notation-voice-selector className="shrink-0 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2.5 py-1.5 text-[color:var(--color-text)]">
    <div className="flex min-w-0 items-center gap-1.5">
      <div ref={choiceGroup} role="group" aria-label={zh ? '選擇編輯聲部' : 'Voice to edit'} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {choices.map(voice => <button key={voice.id ?? 'primary'} type="button" aria-pressed={selectedId === voice.id}
          onClick={() => { setRenaming(false); onSelect(voice.id); }} title={`${context} · ${voice.label}`}
          className={`h-11 max-w-40 shrink-0 truncate rounded-lg px-2.5 text-xs font-semibold ${selectedId === voice.id
            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
            : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)]'}`}>
          {voice.label || (zh ? '未命名聲部' : 'Untitled voice')}
        </button>)}
      </div>
      <button type="button" aria-label={zh ? '重新命名目前聲部' : 'Rename current voice'}
        disabled={!selectedId && !canRenamePrimary} onClick={() => { setName(selectedName); setRenaming(value => !value); }}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] disabled:opacity-40"><Pencil size={15} /></button>
      <button type="button" onClick={onAdd} disabled={!canAdd} aria-label={zh ? '新增聲部' : 'Add voice'}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] disabled:opacity-40"><Plus size={17} /></button>
    </div>
    {renaming ? <form className="mt-2 space-y-1.5 pb-1" onSubmit={event => { event.preventDefault(); commit(); }}>
      <label className="flex items-center gap-2 text-xs">
        <span className="shrink-0">{zh ? '聲部名稱' : 'Voice name'}</span>
        <input autoFocus aria-label={zh ? '聲部名稱' : 'Voice name'} value={name} onChange={event => setName(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-2 text-base" />
        <button type="submit" className="h-11 shrink-0 rounded-lg bg-indigo-700 px-3 font-semibold text-white hover:bg-indigo-800">{zh ? '儲存' : 'Save'}</button>
        {selectedId ? <button type="button" onClick={() => { setRenaming(false); onRemove(); }} aria-label={zh ? '移除目前聲部' : 'Remove current voice'}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-rose-700 dark:text-rose-300"><Trash2 size={16} /></button> : null}
      </label>
      <p className="text-[11px] text-[color:var(--color-text-muted)]">{context} · {zh ? '名稱只套用到目前小節' : 'Name applies to this bar only'}</p>
    </form> : null}
  </div>;
}
