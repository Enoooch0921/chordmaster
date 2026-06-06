import React from 'react';
import type { Song, AppLanguage } from '../types';
import { parseLyricsBody, pairSections, type LyricSection } from '../utils/lyricsFormat';

interface LyricsSheetProps {
  song: Song;
  language: AppLanguage;
}

// Renders one indented lyrics section (verse number left-aligned, or a marker
// symbol hanging to the left of an indented text block). Shared by both modes.
const LyricSectionBlock: React.FC<{ section: LyricSection }> = ({ section }) => {
  const lines = section.lines.length > 0 ? section.lines : [''];
  return (
    <div
      className="mb-3 break-inside-avoid"
      style={{ paddingLeft: section.indented ? '2em' : 0 }}
    >
      <div className="flex gap-1.5">
        {section.marker ? (
          <span
            className="shrink-0 font-semibold"
            style={section.indented ? { marginLeft: '-2em', width: '2em' } : undefined}
          >
            {section.marker}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {lines.map((line, idx) => (
            <div key={idx} className="leading-relaxed">
              {line.length > 0 ? line : ' '}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function LyricsSheet({ song, language }: LyricsSheetProps) {
  const doc = song.lyricsDoc;
  const zhSections = React.useMemo(() => parseLyricsBody(doc?.chinese ?? ''), [doc?.chinese]);
  const enSections = React.useMemo(() => parseLyricsBody(doc?.english ?? ''), [doc?.english]);

  const isBilingual = (doc?.english ?? '').trim().length > 0;
  // 出處 / 翻譯 come from the song's own metadata (version = lyricist/composer,
  // translator) so they aren't entered twice.
  const source = Array.from(
    new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))
  ).join(' / ');
  const translation = song.translator?.trim();
  const isEmpty = zhSections.length === 0 && enSections.length === 0;

  const header = (
    <div className="shrink-0 mb-5 border-b-2 border-gray-900 pb-2">
      <h1 className="text-3xl font-bold tracking-tight">《{song.title}》</h1>
      {(source || translation) && (
        <div className="mt-1.5 space-y-0.5 text-sm font-medium text-gray-600">
          {source && <div>{language === 'zh' ? '出處' : 'Source'}：{source}</div>}
          {translation && <div>{language === 'zh' ? '翻譯' : 'Translation'}：{translation}</div>}
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (isEmpty) {
    body = (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        {language === 'zh' ? '在左側輸入歌詞後，這裡會即時排版。' : 'Enter lyrics on the left to see the formatted layout.'}
      </div>
    );
  } else if (isBilingual) {
    const pairs = pairSections(enSections, zhSections);
    body = (
      <div className="flex-1 text-base">
        {pairs.map((pair, idx) => (
          <div
            key={idx}
            className="grid gap-x-8"
            style={{ gridTemplateColumns: '1fr 1fr' }}
          >
            <div>{pair.en ? <LyricSectionBlock section={pair.en} /> : null}</div>
            <div>{pair.zh ? <LyricSectionBlock section={pair.zh} /> : null}</div>
          </div>
        ))}
      </div>
    );
  } else {
    // Monolingual: single-page two-column flow (left fills then flows right).
    body = (
      <div className="flex-1 text-base [column-count:2] [column-gap:2rem]">
        {zhSections.map((section, idx) => (
          <LyricSectionBlock key={idx} section={section} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 print:gap-0">
      <div
        data-print-page
        data-export-page-index={1}
        data-export-page-total={1}
        data-export-song-title={song.title}
        className="bg-white p-6 sm:p-8 shadow-lg border border-gray-100 mx-auto font-sans text-gray-900 w-full max-w-[794px] h-[1123px] flex flex-col overflow-hidden relative"
      >
        {header}
        {body}
      </div>
    </div>
  );
}
