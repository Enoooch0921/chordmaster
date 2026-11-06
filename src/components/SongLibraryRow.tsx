import { memo, type TouchEvent } from 'react';
import { Archive, ArchiveRestore, Copy, Download, Edit3, Star, Trash2, Upload } from 'lucide-react';
import type { AppLanguage, StoredSong } from '../types';
import type { SongEditorPresence } from '../lib/songEditingPresence';
import { getUiCopy } from '../constants/i18n';
import { getSongLibraryIdentity, getSongLibraryMeta } from '../lib/songLibraryPresentation';
import { currentKeyMode, formatKeyName } from '../utils/keyMode';
import { ManagementActions } from './ProjectManagementPanel';
import { SongEditingNotice } from './SongEditingNotice';
import SongTitle from './SongTitle';

export type SongLibraryAction = 'select' | 'edit' | 'duplicate' | 'delete' | 'restore'
  | 'sync-team' | 'copy-to-team' | 'copy-to-personal' | 'toggle-selection' | 'toggle-favorite';

interface Props {
  item: StoredSong;
  language: AppLanguage;
  isActive: boolean;
  isSelected: boolean;
  isFavorite?: boolean;
  lyricsSnippet?: string | null;
  isLibraryEditing: boolean;
  isTeamWorkspace: boolean;
  canEditTeamSongs: boolean;
  canCopyPersonalSongsToTeam: boolean;
  isImportingPersonalSongs: boolean;
  editors?: SongEditorPresence[];
  teamSourceStatus?: { latestUpdatedAt?: number; missing?: boolean; error?: string };
  onAction: (action: SongLibraryAction, id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onTitleFocus: (id: string) => void;
  onTitleCommit: (id: string, title: string) => void;
  onTouchStart: (id: string, event: TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
  onTouchCancel: () => void;
}

// Each row depends on its own song and state, not the search query or other rows.
export default memo(function SongLibraryRow({
  item, language, isActive, isSelected, isFavorite = false, lyricsSnippet, isLibraryEditing, isTeamWorkspace,
  canEditTeamSongs, canCopyPersonalSongsToTeam, isImportingPersonalSongs,
  editors = [], teamSourceStatus, onAction, onTitleChange, onTitleFocus, onTitleCommit,
  onTouchStart, onTouchMove, onTouchEnd, onTouchCancel,
}: Props) {
  const copy = getUiCopy(language);
  const title = item.title || copy.untitledSong;
  const libraryMeta = getSongLibraryMeta(item, copy.editor.shuffle);
  const identity = getSongLibraryIdentity(item, language);
  const hasLinkedTeamUpdate = !isTeamWorkspace
    && Boolean(item.teamSource)
    && typeof teamSourceStatus?.latestUpdatedAt === 'number'
    && teamSourceStatus.latestUpdatedAt > (item.teamSource?.updatedAt ?? 0);
  const teamSourceLabel = item.teamSource
    ? hasLinkedTeamUpdate
      ? (language === 'zh' ? '團隊版有更新' : 'Team version updated')
      : teamSourceStatus?.missing
        ? (language === 'zh' ? '團隊來源找不到' : 'Team source missing')
        : teamSourceStatus?.error
          ? (language === 'zh' ? '無法檢查團隊來源' : 'Unable to check team source')
          : `${language === 'zh' ? '連結' : 'Linked'}: ${item.teamSource.libraryName ?? (language === 'zh' ? '團隊歌曲' : 'Team song')}`
    : null;
  const metadata = (
    <div className="song-library-meta" title={libraryMeta.tooltip}>
      <div className="song-library-credit-slot" title={identity.authors}>{identity.authors}</div>
      <div className="song-library-version-slot"><span title={identity.version}>{identity.version}</span>{identity.language && <span className="song-library-language">{identity.language}</span>}</div>
      <div className="song-library-facts">
        <span className="song-library-key" aria-label={item.originalKeyUnspecified ? (language === 'zh' ? '調性未確認' : 'Key unconfirmed') : `Key ${formatKeyName(item.currentKey, currentKeyMode(item))}`} title={item.originalKeyUnspecified ? (language === 'zh' ? '調性未確認' : 'Key unconfirmed') : undefined}>{item.originalKeyUnspecified ? '—' : formatKeyName(item.currentKey, currentKeyMode(item))}</span>
        {typeof item.tempo === 'number' && <span className="song-library-tempo">{item.tempo}<span className="song-library-unit">BPM</span></span>}
        {item.timeSignature && <span className="song-library-meter">{item.timeSignatureUnspecified ? (language === 'zh' ? '拍號未確認' : 'Meter unknown') : item.timeSignature}</span>}
        {(item.shuffle ?? item.groove?.trim().toLowerCase() === 'shuffle') && <span>{copy.editor.shuffle}</span>}
      </div>
    </div>
  );
  return (
    <div data-library-song-id={item.id} className={`song-library-row${isActive ? ' is-current' : ''}${!isLibraryEditing ? ' has-actions' : ''}`}>
      <div className="song-library-main">
        {isLibraryEditing ? (
          <div className="song-library-edit-row">
            <label className="song-library-checkbox">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onAction('toggle-selection', item.id)}
                aria-label={language === 'zh' ? `選取：${title}` : `Select: ${title}`}
              />
            </label>
            <input
              value={item.title}
              onChange={(event) => onTitleChange(item.id, event.target.value)}
              onFocus={() => onTitleFocus(item.id)}
              onBlur={(event) => {
                onTitleCommit(item.id, event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
              }}
              className="song-library-title-input"
              placeholder={copy.untitledSong}
              aria-label={language === 'zh' ? `歌曲名稱：${title}` : `Song title: ${title}`}
            />
            {item.archivedAt ? <span className="song-library-archived">{language === 'zh' ? '已封存' : 'Archived'}</span> : null}
            {metadata}
          </div>
        ) : (
          <button
            type="button"
            aria-label={language === 'zh' ? `開啟歌曲：${title}` : `Open song: ${title}`}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onAction('select', item.id)}
            onTouchStart={(event) => onTouchStart(item.id, event)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            onContextMenu={(event) => { if (canEditTeamSongs) event.preventDefault(); }}
            className="song-library-select"
          >
            <span className="song-library-title">
              <SongTitle title={identity.title || title}/>
              {item.archivedAt ? <span className="song-library-archived">{language === 'zh' ? '已封存' : 'Archived'}</span> : null}
            </span>
            {metadata}
            {lyricsSnippet && <span className="song-library-lyrics-match" title={lyricsSnippet}>{language === 'zh' ? '歌詞：' : 'Lyrics: '}「{lyricsSnippet}」</span>}
          </button>
        )}
        {!isLibraryEditing && (
          <div className="song-library-row-actions">
            <button type="button" className="song-library-favorite" aria-pressed={isFavorite} aria-label={language === 'zh' ? `${isFavorite ? '取消收藏' : '收藏'}：${title}` : `${isFavorite ? 'Unfavorite' : 'Favorite'}: ${title}`} onClick={() => onAction('toggle-favorite', item.id)}><Star size={17} fill={isFavorite ? 'currentColor' : 'none'} /></button>
            {canEditTeamSongs && <ManagementActions label={language === 'zh' ? `歌曲操作：${title}` : `Song actions: ${title}`} actions={[
              ...(hasLinkedTeamUpdate ? [{ label: language === 'zh' ? '同步團隊最新版' : 'Sync latest team version', icon: <Download size={16} />, run: () => onAction('sync-team', item.id) }] : []),
              ...(canCopyPersonalSongsToTeam && !item.archivedAt ? [{ label: language === 'zh' ? '複製到團隊…' : 'Copy to team…', icon: <Upload size={16} />, run: () => onAction('copy-to-team', item.id), disabled: isImportingPersonalSongs }] : []),
              ...(isTeamWorkspace ? [{ label: language === 'zh' ? '轉存到個人區' : 'Copy to personal', icon: <Download size={16} />, run: () => onAction('copy-to-personal', item.id) }] : []),
              ...(item.archivedAt ? [
                { label: language === 'zh' ? '取消封存' : 'Restore', icon: <ArchiveRestore size={16} />, run: () => onAction('restore', item.id) },
                { label: language === 'zh' ? '永久刪除歌曲' : 'Permanently delete song', icon: <Trash2 size={16} />, run: () => onAction('delete', item.id), danger: true }
              ] : [
                { label: language === 'zh' ? '複製歌曲' : 'Duplicate song', icon: <Copy size={16} />, run: () => onAction('duplicate', item.id) },
                { label: language === 'zh' ? '編輯歌曲' : 'Edit song', icon: <Edit3 size={16} />, run: () => onAction('edit', item.id) },
                { label: language === 'zh' ? '封存歌曲' : 'Archive song', icon: <Archive size={16} />, run: () => onAction('delete', item.id) }
              ])
            ]} />}
          </div>
        )}
      </div>
      {isLibraryEditing && lyricsSnippet && <div className="song-library-lyrics-match" title={lyricsSnippet}>{language === 'zh' ? '歌詞：' : 'Lyrics: '}「{lyricsSnippet}」</div>}
      {editors.length > 0 && <div className="song-library-source" data-song-editing-status={item.id}><SongEditingNotice editors={editors} language={language} compact /></div>}
      {teamSourceLabel ? <div className={`song-library-source${hasLinkedTeamUpdate ? ' is-warning' : teamSourceStatus?.missing || teamSourceStatus?.error ? ' is-error' : ''}`} title={teamSourceLabel}>{teamSourceLabel}</div> : null}
    </div>
  );
});
