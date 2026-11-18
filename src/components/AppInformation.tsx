import { useId, useState } from 'react';
import { BookOpen, ChevronDown, ExternalLink, Keyboard } from 'lucide-react';
import { APP_GITHUB_URL, APP_NAME, APP_VERSION, getLocalizedAppMeta, type ChangelogEntry } from '../constants/appMeta';
import type { AppLanguage } from '../types';
import MeasuredSlidingSelection from './ui/MeasuredSlidingSelection';
import './AppInformation.css';

function FormattedText({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, i) => part.startsWith('`') && part.endsWith('`')
    ? <code key={i}>{part.slice(1, -1)}</code> : part)}</>;
}

function Notes({ items }: { items: string[] }) {
  return <ul className="info-notes">{items.map(text => <li key={text}><FormattedText text={text}/></li>)}</ul>;
}

function Release({ entry }: { entry: ChangelogEntry }) {
  return <article className="info-release">
    <div className="info-release-meta"><strong>v{entry.version}</strong><time dateTime={entry.date}>{entry.date}</time></div>
    <h3>{entry.title}</h3>
    <Notes items={entry.bullets}/>
  </article>;
}

function About({ language }: { language: AppLanguage }) {
  const zh = language === 'zh';
  const { aboutSections, changelogEntries } = getLocalizedAppMeta(language);
  const [latest, ...earlier] = changelogEntries;
  const [archiveOpen, setArchiveOpen] = useState(false);
  return <>
    <header className="info-brand">
      <img src={import.meta.env.BASE_URL + 'logo.svg'} width="64" height="64" alt=""/>
      <div><h1>{APP_NAME}</h1><p>{zh ? '目前版本' : 'Current version'} <strong>v{APP_VERSION}</strong></p></div>
    </header>
    <div className="info-about-body">
      <div>{aboutSections.map(section => <section className="info-story" key={section.title}>
        <h2>{section.title}</h2><p>{section.description}</p><Notes items={section.bullets}/>
      </section>)}</div>
      <section className="info-releases">
        <h2>{zh ? '更新紀錄' : 'Release notes'}</h2>
        {latest && <Release entry={latest}/>}
        {earlier.length > 0 && <details className="info-archive" onToggle={e => setArchiveOpen(e.currentTarget.open)}>
          <summary>{zh ? '歷史版本' : 'Previous releases'}<ChevronDown className="ui-motion-chevron" size={16} aria-hidden="true"/></summary>
          {archiveOpen && earlier.map(entry => <Release key={entry.version + entry.title} entry={entry}/>)}
        </details>}
      </section>
    </div>
    <footer className="info-credit">
      <h2>{zh ? '音源授權' : 'Audio credits'}</h2>
      <p>{zh ? '鋼琴試聽採用 Alexander Holm 錄製的 ' : 'Piano samples recorded by Alexander Holm for the '}
        <a href="https://sfzinstruments.github.io/pianos/salamander/" target="_blank" rel="noreferrer">Salamander Grand Piano V3</a>
        {zh ? '，經選錄、裁切與轉檔，依 ' : ', excerpted, trimmed and encoded under '}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>{zh ? ' 授權使用。' : '.'}</p>
    </footer>
  </>;
}

function Help({ language, onOpenShortcuts }: { language: AppLanguage; onOpenShortcuts: () => void }) {
  const zh = language === 'zh';
  const { helpSections } = getLocalizedAppMeta(language);
  const [selected, setSelected] = useState(0);
  const section = helpSections[selected];
  const heading = useId();
  const topics = zh ? '說明主題' : 'Help topics';
  return <>
    <header className="info-help-header">
      <span className="info-help-icon"><BookOpen size={24} aria-hidden="true"/></span>
      <h1>{zh ? '使用說明' : 'User guide'}</h1>
    </header>
    <div className="info-guide">
      <nav className="info-topics ui-selection-list" aria-label={topics}>
        <MeasuredSlidingSelection value={String(selected)} layoutKey={language} orientation="vertical" />
        {helpSections.map((topic, i) => <button key={topic.title} type="button" aria-pressed={selected === i}
          onClick={() => setSelected(i)}>{topic.title}</button>)}
      </nav>
      <label className="info-topic-picker">{topics}<select name="help-topic" value={selected} onChange={e => setSelected(Number(e.target.value))}>
        {helpSections.map((topic, i) => <option key={topic.title} value={i}>{topic.title}</option>)}
      </select></label>
      <div className="info-guide-main">
        <section aria-labelledby={heading}>
          <h2 id={heading}>{section.title}</h2>
          <p>{section.description}</p>
          <Notes items={section.bullets}/>
        </section>
        <div className="info-resources">
          <button type="button" onClick={onOpenShortcuts}><Keyboard size={17} aria-hidden="true"/>{zh ? '查看快捷鍵' : 'View keyboard shortcuts'}</button>
          <a href={APP_GITHUB_URL} target="_blank" rel="noreferrer">GitHub <ExternalLink size={14} aria-hidden="true"/></a>
        </div>
      </div>
    </div>
  </>;
}

export default function AppInformation({ page, language, onOpenShortcuts }: {
  page: 'about' | 'help'; language: AppLanguage; onOpenShortcuts: () => void;
}) {
  return <div className="info-page" data-content-area><div className="info-inner">
    {page === 'about' ? <About language={language}/> : <Help language={language} onOpenShortcuts={onOpenShortcuts}/>}
  </div></div>;
}
