import { AnimatePresence } from 'motion/react';
import ResponsiveDialog from './ResponsiveDialog';
import { useContentSwitchMotion } from '../hooks/useContentSwitchMotion';
import { useUiMotion } from '../hooks/useUiMotion';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import {
  AppLanguage,
  StoredSong,
  TeamSongImportInspection,
  TeamSongImportCandidate,
  TeamSongImportRequestItem,
  TeamSongImportResult
} from '../types';

interface TeamSongImportDialogProps {
  open: boolean;
  language: AppLanguage;
  personalSongs: StoredSong[];
  loadingSongs: boolean;
  initialSelectedIds?: string[];
  copyOnly?: boolean;
  destinationTeams?: { id: string; name: string }[];
  destinationId?: string;
  destinationName?: string;
  onDestinationChange?: (id: string) => void;
  onClose: () => void;
  inspectSongs: (sourceSongIds: string[]) => Promise<TeamSongImportInspection>;
  importSongs: (items: TeamSongImportRequestItem[]) => Promise<TeamSongImportResult>;
}

interface ResolutionState {
  resolution: TeamSongImportRequestItem['resolution'];
  targetSongId?: string;
}

const EMPTY_SELECTION: string[] = [];

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase();

const getStoredSongVersion = (song: StoredSong) => {
  const value = (song as StoredSong & { version?: unknown }).version;
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};

const getSongSummary = (song: StoredSong, language: AppLanguage, showId = true) => {
  const version = getStoredSongVersion(song);
  return [
    song.currentKey || song.originalKey ? `Key ${song.currentKey || song.originalKey}` : '',
    version ? `${language === 'zh' ? '版本' : 'Version'} ${version}` : '',
    typeof song.tempo === 'number' ? `${song.tempo} BPM` : '',
    song.lyricist ? `${language === 'zh' ? '詞' : 'Lyrics'} ${song.lyricist}` : '',
    song.composer ? `${language === 'zh' ? '曲' : 'Music'} ${song.composer}` : '',
    showId ? `${language === 'zh' ? '來源歌曲 ID' : 'Source song ID'} ${song.id}` : ''
  ].filter(Boolean).join(' · ');
};

const getCandidateSummary = (candidate: TeamSongImportCandidate, language: AppLanguage, showId = true) => [
  candidate.currentKey || candidate.originalKey
    ? `Key ${candidate.currentKey || candidate.originalKey}`
    : '',
  candidate.version ? `${language === 'zh' ? '版本' : 'Version'} ${candidate.version}` : '',
  candidate.lyricist ? `${language === 'zh' ? '詞' : 'Lyrics'} ${candidate.lyricist}` : '',
  candidate.composer ? `${language === 'zh' ? '曲' : 'Music'} ${candidate.composer}` : '',
  showId ? `${language === 'zh' ? '團隊歌曲 ID' : 'Team song ID'} ${candidate.songId}` : ''
].filter(Boolean).join(' · ');

export const TeamSongImportDialog: React.FC<TeamSongImportDialogProps> = ({
  open,
  language,
  personalSongs,
  loadingSongs,
  initialSelectedIds = EMPTY_SELECTION,
  copyOnly = false,
  destinationTeams,
  destinationId,
  destinationName,
  onDestinationChange,
  onClose,
  inspectSongs,
  importSongs
}) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspection, setInspection] = useState<TeamSongImportInspection | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({});
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useRef(0);
  const busy = useRef(false);
  const current = useRef({ open, destinationId });
  current.current = { open, destinationId };
  const contentRef = useRef<HTMLDivElement>(null);
  useContentSwitchMotion(contentRef, inspection ? 'review' : 'select', open);
  useLayoutEffect(() => {
    request.current++;
    busy.current = false;
    setInspection(null);
    setResolutions({});
    setError(null);
    setIsInspecting(false);
    setIsImporting(false);
  }, [open, destinationId]);
  useLayoutEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIds([...new Set(initialSelectedIds)]);
  }, [open, initialSelectedIds]);
  useEffect(() => () => { request.current++; }, []);

  const visibleSongs = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    return personalSongs.filter((song) => {
      if (song.archivedAt) return false;
      if (!normalizedQuery) return true;
      return normalizeSearchText([
        song.id,
        song.title,
        song.currentKey,
        song.originalKey,
        getStoredSongVersion(song),
        song.lyricist,
        song.composer,
        song.translator
      ].filter(Boolean).join(' ')).includes(normalizedQuery);
    });
  }, [personalSongs, query]);

  const preference = useUiMotion();

  const selectedSet = new Set(selectedIds);
  const allVisibleSelected = visibleSongs.length > 0 && visibleSongs.every((song) => selectedSet.has(song.id));
  const selectedSongs = selectedIds
    .map((id) => personalSongs.find((song) => song.id === id))
    .filter((song): song is StoredSong => Boolean(song) && !song!.archivedAt);

  const toggleSong = (songId: string) => {
    setSelectedIds((current) => current.includes(songId)
      ? current.filter((id) => id !== songId)
      : [...current, songId]);
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleSongs.forEach((song) => {
        if (allVisibleSelected) next.delete(song.id); else next.add(song.id);
      });
      return Array.from(next);
    });
  };

  const startInspection = async () => {
    if (selectedSongs.length === 0 || selectedSongs.length > 500 || busy.current) return;
    const token = ++request.current; busy.current = true;
    try {
      setIsInspecting(true);
      setError(null);
      const requestedIds = selectedSongs.map(song => song.id);
      const nextInspection = await inspectSongs(requestedIds);
      if (request.current !== token || !current.current.open) return;
      const inspectedIds = new Set(nextInspection.songs.map(song => song.sourceSongId));
      if (inspectedIds.size !== requestedIds.length || nextInspection.songs.length !== requestedIds.length || requestedIds.some(id => !inspectedIds.has(id))) {
        throw new Error(language === 'zh' ? '部分歌曲已變更或無法讀取，請返回重新選擇。' : 'Some songs changed or are unavailable. Select the songs again.');
      }
      const nextResolutions: Record<string, ResolutionState> = {};
      nextInspection.songs.forEach((item) => {
        nextResolutions[item.sourceSongId] = copyOnly && (item.existingSongId || item.possibleMatches.length > 0)
          ? { resolution: 'duplicate' }
          : item.existingSongId
          ? { resolution: 'overwrite', targetSongId: item.existingSongId }
          : item.possibleMatches.length > 0
            ? { resolution: 'duplicate' }
            : { resolution: 'create' };
      });
      setInspection(nextInspection);
      setResolutions(nextResolutions);
    } catch (reason) {
      if (request.current !== token || !current.current.open) return;
      setError(reason instanceof Error ? reason.message : (language === 'zh' ? '無法檢查匯入歌曲。' : 'Unable to inspect songs.'));
    } finally {
      if (request.current === token) { busy.current = false; setIsInspecting(false); }
    }
  };

  const runImport = async () => {
    if (!inspection || busy.current) return;
    const token = ++request.current; busy.current = true;
    const items: TeamSongImportRequestItem[] = inspection.songs.map((item) => {
      const selected = resolutions[item.sourceSongId] ?? { resolution: 'create' as const };
      const legacyCandidateIds = new Set(item.possibleMatches.map((candidate) => candidate.songId));
      const targetSongId = item.existingSongId
        ?? (selected.targetSongId && legacyCandidateIds.has(selected.targetSongId)
          ? selected.targetSongId
          : item.possibleMatches[0]?.songId);
      return {
        sourceSongId: item.sourceSongId,
        resolution: selected.resolution,
        ...(selected.resolution === 'overwrite' && targetSongId
          ? { targetSongId }
          : {})
      };
    });

    try {
      setIsImporting(true);
      setError(null);
      await importSongs(items);
      if (request.current === token && current.current.open) onClose();
    } catch (reason) {
      if (request.current !== token || !current.current.open) return;
      setError(reason instanceof Error ? reason.message : (language === 'zh' ? '無法匯入歌曲。' : 'Unable to import songs.'));
    } finally {
      if (request.current === token) { busy.current = false; setIsImporting(false); }
    }
  };

  return (
    <AnimatePresence initial={false} custom={preference}>{open && <ResponsiveDialog
      title={copyOnly ? (language === 'zh' ? '複製到團隊' : 'Copy to team') : (language === 'zh' ? '從個人區匯入團隊曲庫' : 'Import from your personal library')}
      subtitle={inspection ? (language === 'zh' ? '確認歌曲與目標團隊' : 'Review songs and destination') : (language === 'zh' ? '選擇歌曲與目標團隊' : 'Choose songs and destination')}
      closeLabel={language === 'zh' ? '關閉' : 'Close'} busy={isImporting} onClose={onClose}>
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
        {destinationTeams && <div className="shrink-0 border-b border-gray-100 px-4 py-3 [@media(max-height:500px)]:py-2">
          <label className="block text-xs font-semibold text-gray-600 [@media(max-height:500px)]:flex [@media(max-height:500px)]:items-center [@media(max-height:500px)]:gap-2">{language === 'zh' ? '目標團隊' : 'Destination team'}
            <select aria-label={language === 'zh' ? '目標團隊' : 'Destination team'} value={destinationId ?? ''} disabled={loadingSongs || isInspecting || isImporting || Boolean(inspection)} onChange={event => onDestinationChange?.(event.target.value)} className="mt-1 min-h-11 w-full [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1 rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900">
              {destinationTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-gray-500 [@media(max-height:500px)]:hidden">{language === 'zh' ? '保留個人原譜；團隊已有的歌曲會另建副本。' : 'Keep your personal originals; existing team songs get a separate copy.'}</p>
        </div>}
        {!destinationTeams && destinationName && <p className="shrink-0 px-4 pt-3 text-xs text-gray-500">{language === 'zh' ? `目標團隊：${destinationName}` : `Destination: ${destinationName}`}</p>}

        {error ? (
          <div role="alert" className="mx-4 mt-3 flex max-h-28 shrink-0 items-start overflow-y-auto gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-line">{error}</span>
          </div>
        ) : null}

        {!inspection ? (
          <>
            <div className="shrink-0 border-b border-gray-100 px-4 py-3 [@media(max-height:500px)]:flex [@media(max-height:500px)]:items-center [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:py-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:bg-white">
                <Search size={14} className="text-gray-400" />
                <input value={query} enterKeyHint="done" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'zh' ? '搜尋個人歌曲' : 'Search personal songs'} aria-label={language === 'zh' ? '搜尋個人歌曲' : 'Search personal songs'} className="min-h-8 min-w-0 flex-1 bg-transparent text-base text-gray-800 outline-none" />
              </label>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs font-bold [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:shrink-0">
                <span className="text-gray-500">{language === 'zh' ? `已選 ${selectedSongs.length} 首` : `${selectedSongs.length} selected`}</span>
                {selectedSongs.length > 500 && <span role="alert" className="text-rose-700">{language === 'zh' ? '每次最多 500 首' : 'Up to 500 songs at a time'}</span>}
                <button type="button" onClick={toggleAllVisible} disabled={visibleSongs.length === 0 || loadingSongs || isInspecting} className="min-h-11 rounded-lg px-2 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40">
                  {allVisibleSelected
                    ? (language === 'zh' ? '取消全選' : 'Deselect results')
                    : (language === 'zh' ? '全選目前結果' : 'Select results')}
                </button>
              </div>
            </div>
            <div data-team-import-list className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {loadingSongs ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-gray-500"><LoaderCircle size={18} className="animate-spin" />{language === 'zh' ? '載入個人曲庫…' : 'Loading personal library…'}</div>
              ) : visibleSongs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">{language === 'zh' ? '沒有符合的個人歌曲' : 'No personal songs match'}</div>
              ) : (
                <div className="space-y-2">
                  {visibleSongs.map((song) => {
                    const selected = selectedSet.has(song.id);
                    return (
                      <button key={song.id} type="button" disabled={isInspecting} onClick={() => { if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur(); toggleSong(song.id); }} aria-pressed={selected} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${selected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200'}`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-transparent'}`}><Check size={14} strokeWidth={3} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-bold text-gray-900">{song.title || (language === 'zh' ? '未命名歌曲' : 'Untitled Song')}</span>
                          <span className="mt-0.5 block break-words text-xs leading-5 text-gray-500">{getSongSummary(song, language, !copyOnly)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">{language === 'zh' ? '取消' : 'Cancel'}</button>
              <button type="button" onClick={() => void startInspection()} disabled={selectedSongs.length === 0 || selectedSongs.length > 500 || isInspecting || loadingSongs} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
                {isInspecting ? <LoaderCircle size={15} className="animate-spin" /> : <ChevronGlyph />}
                <span>{language === 'zh' ? '下一步' : 'Continue'}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="space-y-3">
                {inspection.songs.map((item) => {
                  const sourceSong = selectedSongs.find((song) => song.id === item.sourceSongId);
                  const state = resolutions[item.sourceSongId] ?? { resolution: 'create' as const };
                  const existingCandidate = item.existingSong ?? (item.existingSongId
                    ? { songId: item.existingSongId, title: item.existingTitle ?? item.title }
                    : null);
                  const hasPrimaryMapping = Boolean(item.existingSongId);
                  const candidates = hasPrimaryMapping
                    ? (existingCandidate ? [existingCandidate] : [])
                    : item.possibleMatches;
                  const hasConflict = hasPrimaryMapping || candidates.length > 0;
                  const selectedTargetSongId = hasPrimaryMapping
                    ? item.existingSongId
                    : state.targetSongId ?? candidates[0]?.songId;
                  return (
                    <div key={item.sourceSongId} className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-black text-gray-900">{item.title}</div>
                        {sourceSong ? <div className="mt-0.5 truncate text-[11px] text-gray-500">{getSongSummary(sourceSong, language, !copyOnly)}</div> : null}
                      </div>
                      {hasConflict && copyOnly ? (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{language === 'zh' ? '團隊已有對應或同名歌曲，會另建副本，保留現有版本。' : 'The team already has a matching song. Create a separate copy and keep its existing version.'}</p>
                      ) : hasConflict ? (
                        <div className="mt-3 rounded-xl bg-amber-50 p-2.5">
                          <div className="text-[11px] font-bold text-amber-800">
                            {item.existingSongId
                              ? (language === 'zh' ? '這首來源歌曲已匯入過' : 'This source song was imported before')
                              : (language === 'zh' ? '團隊曲庫有同名歌曲，請確認是否為舊匯入版' : 'A same-title team song may be an older import')}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              aria-pressed={state.resolution === 'overwrite'}
                              onClick={() => setResolutions((current) => ({
                                ...current,
                                [item.sourceSongId]: {
                                  resolution: 'overwrite',
                                  targetSongId: hasPrimaryMapping
                                    ? item.existingSongId ?? undefined
                                    : current[item.sourceSongId]?.targetSongId ?? candidates[0]?.songId
                                }
                              }))}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold ${state.resolution === 'overwrite' ? 'border-amber-400 bg-white text-amber-800' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
                            >
                              <RefreshCw size={13} />
                              {hasPrimaryMapping
                                ? (language === 'zh' ? '覆蓋團隊版' : 'Overwrite')
                                : (language === 'zh' ? '連結並覆蓋' : 'Link & overwrite')}
                            </button>
                            <button
                              type="button"
                              aria-pressed={state.resolution === 'duplicate'}
                              onClick={() => setResolutions((current) => ({
                                ...current,
                                [item.sourceSongId]: { resolution: 'duplicate' }
                              }))}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold ${state.resolution === 'duplicate' ? 'border-indigo-400 bg-white text-indigo-700' : 'border-indigo-200 bg-indigo-50 text-indigo-600'}`}
                            >
                              <Copy size={13} />
                              {language === 'zh' ? '建立同名副本' : 'Create copy'}
                            </button>
                          </div>
                          {candidates.length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                                {hasPrimaryMapping
                                  ? (language === 'zh' ? '目前主要團隊版' : 'Current primary team version')
                                  : (language === 'zh' ? '可能的舊匯入版本' : 'Possible legacy imports')}
                              </div>
                              {candidates.map((candidate) => {
                                const selectedCandidate = state.resolution === 'overwrite'
                                  && selectedTargetSongId === candidate.songId;
                                const canSelectCandidate = !hasPrimaryMapping
                                  && state.resolution === 'overwrite'
                                  && candidates.length > 1;
                                return (
                                  <button
                                    key={candidate.songId}
                                    type="button"
                                    disabled={!canSelectCandidate}
                                    aria-pressed={selectedCandidate}
                                    onClick={() => setResolutions((current) => ({
                                      ...current,
                                      [item.sourceSongId]: {
                                        resolution: 'overwrite',
                                        targetSongId: candidate.songId
                                      }
                                    }))}
                                    title={candidate.songId}
                                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${selectedCandidate
                                      ? 'border-amber-400 bg-white'
                                      : 'border-amber-200 bg-amber-50/70'} disabled:cursor-default disabled:opacity-100`}
                                  >
                                    <span className="block truncate text-[11px] font-bold text-gray-800">{candidate.title || item.title}</span>
                                    <span className="mt-0.5 block break-words text-[11px] leading-4 text-gray-600">{getCandidateSummary(candidate, language, !copyOnly)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><Check size={11} />{language === 'zh' ? '建立團隊歌曲' : 'Create team song'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => { setInspection(null); setError(null); }} disabled={isImporting} className="min-h-11 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40">{language === 'zh' ? '返回選擇' : 'Back'}</button>
              <button type="button" onClick={() => void runImport()} disabled={isImporting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-50">
                {isImporting ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                <span>{language === 'zh' ? `${copyOnly ? '複製' : '匯入'} ${inspection.songs.length} 首` : `${copyOnly ? 'Copy' : 'Import'} ${inspection.songs.length}`}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>}</AnimatePresence>
  );
};

const ChevronGlyph = () => <span aria-hidden className="text-base leading-none">›</span>;

export default TeamSongImportDialog;
