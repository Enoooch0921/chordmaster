import React from 'react';
import type { Song, LyricsDoc, AppLanguage } from '../types';
import {
  LYRIC_QUICK_SYMBOLS,
  LYRIC_KEYWORD_SYMBOLS,
  LYRIC_VERSE_KEYWORDS,
  nextVerseNumber,
} from '../utils/lyricsFormat';

interface LyricsDocEditorProps {
  song: Song;
  language: AppLanguage;
  onChange: (song: Song) => void;
}

type BodyField = 'chinese' | 'english';

const labelClassName = 'mb-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-400';
const textareaClassName = 'min-h-[260px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-gray-800 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 font-mono';

// If the just-typed char (space / newline) follows a `/keyword` at the start of
// the current line, swap the keyword for its marker symbol.
function maybeAutoConvert(value: string, caret: number): { value: string; caret: number } | null {
  const trigger = value[caret - 1];
  if (trigger !== ' ' && trigger !== '\n') return null;

  const segEnd = caret - 1; // position of the trigger char
  const lineStart = value.lastIndexOf('\n', segEnd - 1) + 1;
  const segment = value.slice(lineStart, segEnd);
  const match = segment.match(/^\s*\/([a-zA-Z]+)$/);
  if (!match) return null;

  const keyword = match[1].toLowerCase();
  let symbol: string | null = null;
  if (LYRIC_VERSE_KEYWORDS.has(keyword)) {
    symbol = `${nextVerseNumber(value.slice(0, lineStart))}.`;
  } else if (LYRIC_KEYWORD_SYMBOLS[keyword]) {
    symbol = LYRIC_KEYWORD_SYMBOLS[keyword];
  }
  if (!symbol) return null;

  const nextValue = value.slice(0, lineStart) + symbol + value.slice(segEnd);
  return { value: nextValue, caret: lineStart + symbol.length + 1 };
}

const LyricsDocEditor: React.FC<LyricsDocEditorProps> = ({ song, language, onChange }) => {
  const zh = language === 'zh';
  const doc: LyricsDoc = song.lyricsDoc ?? { chinese: '' };
  const chineseRef = React.useRef<HTMLTextAreaElement>(null);
  const englishRef = React.useRef<HTMLTextAreaElement>(null);

  const patchDoc = (patch: Partial<LyricsDoc>) => {
    onChange({ ...song, lyricsDoc: { ...doc, chinese: doc.chinese ?? '', ...patch } });
  };

  const refFor = (field: BodyField) => (field === 'chinese' ? chineseRef : englishRef);

  const setBodyValue = (field: BodyField, value: string, caret?: number) => {
    patchDoc({ [field]: value } as Partial<LyricsDoc>);
    if (caret != null) {
      const ref = refFor(field);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.focus();
          el.setSelectionRange(caret, caret);
        }
      });
    }
  };

  const handleBodyChange = (field: BodyField, event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    const converted = maybeAutoConvert(value, caret);
    if (converted) {
      setBodyValue(field, converted.value, converted.caret);
    } else {
      patchDoc({ [field]: value } as Partial<LyricsDoc>);
    }
  };

  // Insert a marker (symbol or verse number) at the start of the caret's line.
  const insertMarker = (field: BodyField, symbol: string) => {
    const el = refFor(field).current;
    const value = (field === 'chinese' ? doc.chinese : doc.english) ?? '';
    const pos = el?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const insert = `${symbol} `;
    const nextValue = value.slice(0, lineStart) + insert + value.slice(lineStart);
    setBodyValue(field, nextValue, pos + insert.length);
  };

  const renderSymbolBar = (field: BodyField) => (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {zh ? '插入' : 'Insert'}
      </span>
      <button
        type="button"
        onClick={() => insertMarker(field, `${nextVerseNumber((field === 'chinese' ? doc.chinese : doc.english) ?? '')}.`)}
        title="Verse"
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
      >
        <span className="text-sm">1.</span>
        <span className="text-[10px] text-gray-400">Verse</span>
      </button>
      {LYRIC_QUICK_SYMBOLS.map(({ symbol, label }) => (
        <button
          key={symbol}
          type="button"
          onClick={() => insertMarker(field, symbol)}
          title={label}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
        >
          <span className="text-sm">{symbol}</span>
          <span className="text-[10px] text-gray-400">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="@container space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] leading-relaxed text-gray-400">
        {zh
          ? '出處與翻譯會自動套用歌曲的「版本／翻譯」，不必在此重複輸入。段落用空白行分隔：行首數字（1. 2. 3.）為主歌不縮排；行首符號（○ ※ ◎ △ 或任意符號）整段縮排。也可在行首打 /pre /chorus /bridge /refrain /v 後按空白自動轉成符號。'
          : 'Source and translation are taken from the song’s version / translator automatically. Separate sections with a blank line: lines starting with a number (1. 2. 3.) are verses (no indent); lines starting with a symbol (○ ※ ◎ △ or any) are indented. You can also type /pre /chorus /bridge /refrain /v at line start, then press space to auto-convert.'}
      </p>

      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        <div>
          <label className={labelClassName}>
            {zh ? '英文原文（選填，填了即啟用中英對照）' : 'English (optional — enables bilingual)'}
          </label>
          {renderSymbolBar('english')}
          <textarea
            ref={englishRef}
            value={doc.english ?? ''}
            onChange={(event) => handleBodyChange('english', event)}
            placeholder={zh ? '留空＝純中文雙欄排版' : 'Leave empty for monolingual layout'}
            className={textareaClassName}
            spellCheck={false}
          />
        </div>

        <div>
          <label className={labelClassName}>{zh ? '中文歌詞（必填）' : 'Chinese lyrics (required)'}</label>
          {renderSymbolBar('chinese')}
          <textarea
            ref={chineseRef}
            value={doc.chinese ?? ''}
            onChange={(event) => handleBodyChange('chinese', event)}
            placeholder={zh ? '1. 第一句歌詞…\n\n○ 導歌…\n\n※ 副歌…' : '1. first line…\n\n○ pre-chorus…\n\n※ chorus…'}
            className={textareaClassName}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};

export default LyricsDocEditor;
