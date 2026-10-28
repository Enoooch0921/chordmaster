import type { MouseEvent } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronDown, Music2, RefreshCw } from 'lucide-react';
import type { AppLanguage, SharedProjectPayload, SharedSetlistPayload } from '../types';
import '../styles/invitation.css';

type Action = (event: MouseEvent<HTMLButtonElement>) => void;
interface Props {
  setlist?: SharedSetlistPayload;
  project?: SharedProjectPayload;
  language: AppLanguage;
  onLanguage: (language: AppLanguage) => void;
  signedIn: boolean;
  account: string | null;
  checking: boolean;
  member: boolean;
  busy: boolean;
  error: string | null;
  refreshFailed: boolean;
  inAppBrowser: boolean;
  linkCopied: boolean;
  onCopy: () => void;
  onSignIn: Action;
  onJoin: Action;
  onOpen: Action;
}

function Songs({ setlist, language }: { setlist: SharedSetlistPayload; language: AppLanguage }) {
  if (!setlist.songs.length) return <p className="invitation-empty">{language === 'zh' ? '目前還沒有歌曲，加入後可隨時查看更新。' : 'No songs yet. Join to follow future updates.'}</p>;
  return <ol className="invitation-songs">{setlist.songs.map((item, index) => {
    const key = item.overrideKey ?? item.song.currentKey;
    const tempo = typeof item.song.tempo === 'number' && Number.isFinite(item.song.tempo) ? `${item.song.tempo} BPM` : null;
    return <li key={item.id}>
      <span className="invitation-song-number" aria-hidden="true">{index + 1}</span>
      <span className="invitation-song-title">{item.title}{item.archivedAt && <small>{language === 'zh' ? '已封存' : 'Archived'}</small>}</span>
      <span className="invitation-song-meta">{[key, tempo].filter(Boolean).join(' · ')}</span>
    </li>;
  })}</ol>;
}

export default function InvitationPage(props: Props) {
  const { setlist, project, language, signedIn, checking, member, busy } = props;
  const zh = language === 'zh';
  const resource = project ?? setlist!;
  const noun = project ? (zh ? '專案' : 'project') : (zh ? '歌單' : 'setlist');
  const action = !signedIn ? props.onSignIn : member ? props.onOpen : props.onJoin;
  const label = checking ? (zh ? '正在確認帳號…' : 'Checking your account…')
    : busy ? (zh ? '請稍候…' : 'Please wait…')
    : !signedIn ? (zh ? '使用 Google 登入' : 'Continue with Google')
    : member ? (zh ? `開啟${noun}` : `Open ${noun}`) : (zh ? `加入並開啟${noun}` : `Join and open ${noun}`);
  return <main className="invitation-page">
    <div className="invitation-sheet">
      <header className="invitation-header">
        <span className="invitation-brand"><Music2 size={20} aria-hidden="true" />ChordMaster</span>
        <label className="invitation-language"><span className="sr-only">{zh ? '語言' : 'Language'}</span><select value={language} onChange={event => props.onLanguage(event.target.value as AppLanguage)}><option value="zh">繁體中文</option><option value="en">English</option></select></label>
      </header>
      <div className="invitation-body">
        <h1>{resource.name}</h1>
        <p className="invitation-meta">{zh ? `${noun}邀請` : `${project ? 'Project' : 'Setlist'} invitation`}<span aria-hidden="true"> · </span>{project ? (zh ? `${project.setlists.length} 份歌單` : `${project.setlists.length} setlists`) : (zh ? `${setlist!.songs.length} 首歌曲` : `${setlist!.songs.length} songs`)}</p>
        <p className="invitation-description">{zh ? (project ? '邀請你一起查看這個專案的歌單與最新譜面。' : '邀請你一起查看這份歌單與最新譜面。') : (project ? 'Your invitation to the project’s setlists and latest charts.' : 'Your invitation to this setlist and its latest charts.')}</p>
        <div className="invitation-action">
          {signedIn && <p className="invitation-account"><CheckCircle2 size={16} aria-hidden="true" /><span>{member ? (zh ? '已在你的帳號中' : 'Already in your account') : (zh ? '已登入' : 'Signed in')}{props.account && ` · ${props.account}`}</span></p>}
          {props.inAppBrowser && !signedIn ? <div className="invitation-browser-help">
            <h2>{zh ? '請用 Safari 或 Chrome 開啟' : 'Open in Safari or Chrome'}</h2>
            <p>{zh ? 'LINE 等內建瀏覽器可能無法使用 Google 登入。請從右上角選單選擇「用其他瀏覽器開啟」，或複製連結。' : 'Google sign-in may be blocked in this in-app browser. Use its menu to open in your browser, or copy the link.'}</p>
            <button type="button" className="invitation-primary" onClick={props.onCopy}>{props.linkCopied ? (zh ? '已複製連結' : 'Link copied') : (zh ? '複製邀請連結' : 'Copy invitation link')}</button>
          </div> : <>
            <button type="button" className="invitation-primary" disabled={checking || busy} onClick={action}>{label}{!busy && !checking && <ArrowUpRight size={18} aria-hidden="true" />}</button>
            <p className="invitation-helper">{!signedIn ? (zh ? '登入後會回到這份邀請，再確認加入。' : 'Return here after sign-in, then confirm to join.') : member ? (zh ? '直接開啟，接著一起準備。' : 'Open it and pick up where you left off.') : (zh ? '加入後，會保留在你的帳號中。' : 'Once joined, it stays in your account.')}</p>
          </>}
          {props.error && <p className="invitation-error" role="alert">{props.error}</p>}
        </div>
        <section className="invitation-preview" aria-labelledby="invitation-preview-heading">
          <h2 id="invitation-preview-heading">{project ? (zh ? '專案中的歌單' : 'Setlists in this project') : (zh ? '歌單內容' : 'In this setlist')}</h2>
          {setlist && <Songs setlist={setlist} language={language} />}
          {project && (project.setlists.length ? project.setlists.map(list => <details className="invitation-project-list" key={list.id}>
            <summary><span>{list.name}</span><small>{zh ? `${list.songs.length} 首` : `${list.songs.length} songs`}</small><ChevronDown size={16} aria-hidden="true" /></summary>
            <Songs setlist={list} language={language} />
          </details>) : <p className="invitation-empty">{zh ? '這個專案目前沒有歌單。' : 'This project has no setlists yet.'}</p>)}
        </section>
        <details className="invitation-details"><summary>{zh ? '加入後，哪些內容會同步？' : 'What stays in sync?'}<ChevronDown size={16} aria-hidden="true" /></summary>
          <p>{zh ? '歌序、調性與譜面會跟隨管理員儲存的更新。Capo 可自行設定，不會影響其他人。' : 'Song order, keys and charts follow saved updates. Your Capo setting is personal and does not affect others.'}</p>
        </details>
        <p className={`invitation-sync${props.refreshFailed ? ' invitation-sync--failed' : ''}`} role="status"><RefreshCw size={13} aria-hidden="true" />{props.refreshFailed ? (zh ? '更新暫時中斷，連線恢復後會自動更新。' : 'Updates paused. They will resume when connected.') : (zh ? '自動更新中 · 管理員儲存後約 5 秒更新' : 'Auto-updating · About 5 seconds after changes are saved')}</p>
      </div>
      <footer className="invitation-footer">ChordMaster · {zh ? '一起準備每一次敬拜' : 'Prepare for worship, together'}</footer>
    </div>
  </main>;
}
