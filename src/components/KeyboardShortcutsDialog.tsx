import React from 'react';
import { useIsPresent } from 'motion/react';
import { AudioLines, BookOpen, Keyboard, ListMusic, PencilLine, Search, SlidersHorizontal, SquareDashedMousePointer, X } from 'lucide-react';
import type { AppLanguage } from '../types';
import { KEYBOARD_SHORTCUT_SECTIONS as sections, type KeyboardShortcutEntry } from '../constants/keyboardShortcuts';
import { useModalFocus } from '../hooks/useModalFocus';
import { useUiMotion } from '../hooks/useUiMotion';
import { useContentSwitchMotion } from '../hooks/useContentSwitchMotion';
import { backdropVariants, modalVariants } from '../lib/uiMotion';
import { PresenceSurface } from './ui/InteractionMotion';
import MeasuredSlidingSelection from './ui/MeasuredSlidingSelection';
import './KeyboardShortcutsDialog.css';

interface Props {
  language: AppLanguage;
  onClose: () => void;
}

const icons = { global: Keyboard, performance: BookOpen, preview: PencilLine, rhythm: AudioLines, jianpu: ListMusic, fields: SlidersHorizontal };
const arrows: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓', ArrowUp: '↑' };

function keyLabel(key: string, mac: boolean, zh: boolean) {
  switch (key) {
    case 'Ctrl/Cmd': return mac ? '⌘' : 'Ctrl';
    case 'Option/Alt': case 'Alt': return mac ? '⌥' : 'Alt';
    case 'Shift': return mac ? '⇧' : 'Shift';
    case 'Space': return zh ? '空白鍵' : 'Space';
    case 'click': return zh ? '點選' : 'Click';
    default: return arrows[key] ?? key;
  }
}

function Rows({ entries, language }: { entries: KeyboardShortcutEntry[]; language: AppLanguage }) {
  const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return <dl className="shortcuts-rows">
    {entries.map(entry => <div className="shortcuts-row" key={entry.action.en}>
      <dt>{entry.action[language]}{entry.context && <small>{entry.context[language]}</small>}</dt>
      <dd>{entry.keys.map(combo => <span className="shortcuts-combo" translate="no" key={combo} title={combo}>
        <span className="sr-only">{combo}</span>
        {combo.split(' + ').map((key, i) => <kbd aria-hidden="true" key={i}>{keyLabel(key, mac, language === 'zh')}</kbd>)}
      </span>)}</dd>
    </div>)}
  </dl>;
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replaceAll('⌘', 'cmd').replaceAll('⇧', 'shift')
    .replaceAll('⌥', 'alt').replace(/ctrl\/cmd|command|control|ctrl|cmd/g, 'mod')
    .replace(/option\/alt|option/g, 'alt').replace(/[\s+]/g, '');
}

export default function KeyboardShortcutsDialog({ language, onClose }: Props) {
  const present = useIsPresent();
  const preference = useUiMotion();
  const dialog = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const [group, setGroup] = React.useState(sections[0].id);
  const [query, setQuery] = React.useState('');
  const titleId = React.useId();
  const zh = language === 'zh';
  const title = zh ? '快捷鍵' : 'Keyboard Shortcuts';
  const category = zh ? '操作分類' : 'Categories';
  const needle = normalize(query.trim());
  const searching = !!query.trim();
  const isCombination = /[⌘⇧⌥]|(?:cmd|ctrl|control|command|shift|alt|option)\s*\+/i.test(query);
  const visible = searching ? sections.map(section => ({
    ...section,
    shortcuts: section.shortcuts.filter(entry => {
      const symbols = entry.keys.map(key => key.split(' + ').map(part => keyLabel(part, true, zh)).join(''));
      const keys = [...entry.keys, ...symbols];
      if (isCombination) return keys.some(key => normalize(key) === needle);
      const searchable = [section.title[language], entry.action[language], entry.context?.[language] ?? '', ...keys];
      return searchable.some(text => needle ? normalize(text).includes(needle) : text.includes(query.trim()));
    })
  })).filter(section => section.shortcuts.length) : sections.filter(section => section.id === group);
  const count = visible.reduce((total, section) => total + section.shortcuts.length, 0);
  useModalFocus(present, dialog, true);
  useContentSwitchMotion(content, searching ? 'search' : group, present);
  React.useLayoutEffect(() => { if (content.current) content.current.scrollTop = 0; }, [group, query]);
  React.useEffect(() => {
    if (!present) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [onClose, present]);

  const select = (id: string) => { setGroup(id); setQuery(''); };
  return <PresenceSurface className="shortcuts-backdrop" data-keyboard-shortcuts-dialog
    custom={preference} variants={backdropVariants} initial={preference.instant ? false : 'hidden'} animate="visible" exit="exit"
    onPointerDown={e => { if (present && e.target === e.currentTarget) onClose(); }}>
    <PresenceSurface ref={dialog} className="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
      custom={preference} variants={modalVariants} initial={preference.instant ? false : 'hidden'} animate="visible" exit="exit"
      onKeyDown={e => e.stopPropagation()}>
      <button type="button" className="ui-press shortcuts-close" aria-label={zh ? '關閉快捷鍵' : 'Close shortcuts'} onClick={onClose}><X size={19} aria-hidden="true"/></button>
      <header className="shortcuts-header">
        <h2 id={titleId}><span className="shortcuts-emblem"><Keyboard size={24} aria-hidden="true"/></span>{title}</h2>
        <label className="shortcuts-search"><Search size={16} aria-hidden="true"/>
          <input type="search" name="shortcut-search" ref={input} aria-label={zh ? '搜尋全部快捷鍵' : 'Search all shortcuts'} placeholder={zh ? '搜尋操作或按鍵…' : 'Search actions or keys…'}
            autoComplete="off" spellCheck={false} value={query} onChange={e => setQuery(e.target.value)}/>
          {query && <button type="button" className="ui-press shortcuts-search-clear" aria-label={zh ? '清除搜尋' : 'Clear search'} onClick={() => { setQuery(''); input.current?.focus(); }}><X size={14} aria-hidden="true"/></button>}
        </label>
      </header>
      <div className="shortcuts-body">
        <nav className="shortcuts-categories ui-selection-list" aria-label={category}>
          <MeasuredSlidingSelection value={searching ? '' : group} layoutKey={language} orientation="vertical" />
          {sections.map(section => {
            const Icon = icons[section.id as keyof typeof icons];
            return <button type="button" key={section.id} aria-pressed={!searching && group === section.id} onClick={() => select(section.id)}>
              <Icon size={17} aria-hidden="true"/><span>{section.title[language]}</span>
            </button>;
          })}
        </nav>
        <label className="shortcuts-picker">{category}
          <select name="shortcut-category" value={searching ? '' : group} onChange={e => select(e.target.value)}>
            {searching && <option value="" disabled>{zh ? '搜尋結果' : 'Search results'}</option>}
            {sections.map(s => <option key={s.id} value={s.id}>{s.title[language]}</option>)}
          </select>
        </label>
        <div className="shortcuts-content" ref={content} tabIndex={0} role="region" aria-label={zh ? '快捷鍵列表' : 'Shortcut list'}>
          {searching && <p className="shortcuts-result" role="status">{zh ? `找到 ${count} 項操作` : `${count} matching actions`}</p>}
          {visible.map(section => <section className="shortcuts-group" key={section.id}>
            <header><h3>{section.title[language]}</h3>{section.description && <p>{section.description[language]}</p>}</header>
            <Rows entries={section.shortcuts} language={language}/>
          </section>)}
          {searching && !count && <div className="shortcuts-empty"><SquareDashedMousePointer size={28} aria-hidden="true"/>
            <p>{zh ? '試試操作名稱或鍵盤上的字。' : 'Try an action name or a key on your keyboard.'}</p>
            <button type="button" onClick={() => { setQuery(''); input.current?.focus(); }}>{zh ? '清除搜尋' : 'Clear search'}</button></div>}
        </div>
      </div>
    </PresenceSurface>
  </PresenceSurface>;
}
