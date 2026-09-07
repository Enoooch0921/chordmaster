import React from 'react';
import type { Song, AppLanguage } from '../types';
import { getLyricsBlocks, importLyrics, updateLyricsBlocks } from '../utils/lyricsDocument';

interface LyricsDocEditorProps {
  song: Song;
  language: AppLanguage;
  onChange: (song: Song) => void;
}

// Bulk paste is a secondary workflow. Normal editing happens on LyricsSheet.
export default function LyricsDocEditor({ song, language, onChange }: LyricsDocEditorProps) {
  const zh = language === 'zh';
  const [initialBody] = React.useState(() => updateLyricsBlocks(song.lyricsDoc, getLyricsBlocks(song.lyricsDoc)));
  const [chinese, setChinese] = React.useState(initialBody.chinese);
  const [english, setEnglish] = React.useState(initialBody.english ?? '');
  const [showEnglish, setShowEnglish] = React.useState(Boolean(english));
  const [applied, setApplied] = React.useState(false);
  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
      <p>{zh ? '直接點選歌詞頁上的段落即可編輯。需要整首貼上時，可在下方匯入。' : 'Click a section on the lyrics page to edit in place. Use the fields below to paste a whole song.'}</p>
      <label className="block font-medium">
        {zh ? '中文歌詞' : 'Chinese lyrics'}
        <textarea aria-label={zh ? '貼上中文歌詞' : 'Paste Chinese lyrics'} value={chinese}
          onChange={e => { setChinese(e.target.value); setApplied(false); }}
          placeholder={'[Verse 1]\n第一句歌詞…\n\n[Chorus]\n副歌歌詞…'}
          className="mt-2 min-h-48 w-full rounded-lg border border-stone-300 p-3 text-base font-normal" />
      </label>
      <button type="button" aria-expanded={showEnglish} onClick={() => setShowEnglish(!showEnglish)} className="text-indigo-600">
        {showEnglish ? (zh ? '收起英文對照' : 'Hide English') : (zh ? '添加英文對照' : 'Add English translation')}
      </button>
      {showEnglish && <label className="block font-medium">
        {zh ? '英文歌詞' : 'English lyrics'}
        <textarea aria-label={zh ? '貼上英文歌詞' : 'Paste English lyrics'} value={english}
          onChange={e => { setEnglish(e.target.value); setApplied(false); }}
          className="mt-2 min-h-48 w-full rounded-lg border border-stone-300 p-3 text-base font-normal" />
      </label>}
      <details className="text-xs leading-relaxed text-stone-500">
        <summary className="cursor-pointer">{zh ? '格式與配對說明' : 'Formatting and pairing'}</summary>
        <p className="mt-2">{zh ? '段落標題使用 [Verse 1]、[Pre-Chorus]、[Chorus]、[Bridge] 等，放在歌詞上方。舊版數字與符號也能識別並轉成英文標題。中英文會優先依相同標題配對；未能確定的段落會提示檢查。套用會取代目前歌詞，並重新建立段落與分頁設定。' : 'Place headings such as [Verse 1], [Pre-Chorus], [Chorus] or [Bridge] above the lyrics. Old numbers and symbols are also recognized. Matching headings are paired first; uncertain pairs are flagged. Applying replaces the lyrics and rebuilds sections and page breaks.'}</p>
      </details>
      <button type="button" onClick={() => {
        onChange({ ...song, lyricsDoc: { ...updateLyricsBlocks(song.lyricsDoc, importLyrics(chinese, english)), displayLanguage: english.trim() ? (chinese.trim() ? 'bilingual' : 'english') : 'chinese' } });
        setApplied(true);
      }} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white">
        {zh ? '套用整首歌詞' : 'Apply lyrics'}
      </button>
      {applied && <p role="status" className="text-emerald-700">{zh ? '已套用，可在歌詞頁繼續編輯。' : 'Applied. Continue editing on the lyrics page.'}</p>}
    </div>
  );
}
