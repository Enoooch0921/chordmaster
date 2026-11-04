import { compareMeasurePreviews, type ComparisonMeasure } from './sourceComparisonMeasure';
import { getSongTimeSignatureStates } from './songEditing';
import { getContinuationOnlyChange, describeContinuationPositions, describeRhythm } from './sourceDifferenceText';
import type { AppLanguage, Bar, Song } from '../types';
import { describePickup } from './pickupComparison';
import { normalizeSourceChordNotation } from './setlistSourceMeaning';
import { normalizeSongBars } from './workspace';
import { getLyricsBlocks } from '../utils/lyricsDocument';
import { lyricsLanguageName } from '../utils/lyricsLanguages';

export interface SourceScoreExcerpt {
  song: Song;
  sectionIndex: number;
  barIndex?: number;
}
export interface SourceComparisonRow {
  label: string;
  library: string;
  setlist: string;
  score?: { library?: SourceScoreExcerpt; setlist?: SourceScoreExcerpt; fields: string[] };
  pickup?: { library: Song; setlist: Song };
  measures?: {library:ComparisonMeasure;setlist:ComparisonMeasure};
}
const names: Record<string, string> = {
  title: '歌名', lyricist: '版本／作詞', composer: '作曲', translator: '翻譯', groove: '風格', shuffle: 'Shuffle',
  originalKey: '原調', originalKeyMode: '大小調', originalKeyUnspecified: '原調待確認', tempo: '速度',
  timeSignature: '拍號', timeSignatureUnspecified: '拍號待確認', jianpuInputAbsolute: '簡譜輸入模式',
  references: '參考音源', pickup: '弱起拍', lyricsDoc: '歌詞', chordTimingVersion: '和弦時點格式',
  chords: '和弦', closed: '小節關閉', riff: '簡譜', rhythm: '節奏', annotation: '備註', label: '標籤', riffLabel: '簡譜標籤', rhythmLabel: '節奏標籤',
  keyChangeTo: '轉調', riffVoices: '簡譜聲部', rhythmVoices: '節奏聲部', resetTempo: '恢復原速', repeatStart: '反覆開始',
  repeatEnd: '反覆結束', doubleBar: '後雙小節線', doubleBarStart: '前雙小節線', finalBar: '終止線', ending: '房子', leftText: '左側文字', rightText: '右側文字',
  leftMarker: '左側記號', rightMarker: '右側記號', unisonMark: '齊奏', rhythmMark: '節奏記號', chordMarks: '和弦記號',
  chordSubdivisions: '細分拍和弦', chordPassVariants: '指定遍數和弦', unmeteredChordLines: '未定拍和弦',
  band: '樂團版本', vocal: '歌手版本', chinese: '中文歌詞', english: '英文歌詞', bpm: 'BPM', key: '調性',
  chordTimingUnspecified: '和弦時點待確認', chordKeyUnspecified: '和弦調性待確認', partialMeasure: '不完整小節',
  translationLanguage: '翻譯語言', blocks: '歌詞段落', marker: '段落標記', pageBreakBefore: '段落前換頁', needsPairingReview: '歌詞配對待確認',
  chord: '和弦', pass: '演出遍數', beatOffset: '拍內位置', special: '特別標記',
  url: '連結', enabled: '啟用', color: '標示顏色', beat: '拍', offset: '拍內位置', text: '文字', labelLane: '標籤位置'
};
// Display comparison ignores editing identities, never persistence or concurrency checks.
const content = (value: unknown): unknown => Array.isArray(value) ? value.map(content)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key, v]) => key !== 'id' && v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, content(v)])) : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(content(a)) === JSON.stringify(content(b));
const format = (value: unknown, zh: boolean, field?: string): string => {
  if (field === 'chords' && Array.isArray(value)) return value.length ? value.map(chord => chord || '—').join(' · ') : (zh ? '無和弦' : 'No chords');
  if (field === 'tempo' && typeof value === 'number') return `${value} BPM`;
  if (field === 'rhythm' && typeof value === 'string') return describeRhythm(value, zh ? 'zh' : 'en');
  if (field === 'closed') return value === true ? (zh ? '關閉' : 'Closed') : (zh ? '開啟' : 'Open');
  if (value === undefined || value === null || value === '') return zh ? '未設定' : 'Not set';
  if (typeof value === 'boolean') return value ? (zh ? '有' : 'Yes') : (zh ? '無' : 'No');
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(v => format(v, zh)).join(' / ') : (zh ? '無' : 'None');
  return Object.entries(value).filter(([key,v]) => key !== 'id' && v !== undefined).map(([key,v]) => `${zh ? names[key] ?? key : key}：${format(v, zh, key)}`).join('\n');
};
const summary = (bar: Bar, zh: boolean) => [bar.chords.join(' ') || (zh ? '無和弦' : 'No chords'), bar.riff, bar.rhythm, bar.annotation].filter(Boolean).join(' · ');
const fullBar = (bar: Bar, zh: boolean) => {
  const { id, chords, riff, rhythm, annotation, ...markings } = bar;
  return [summary(bar, zh), format(Object.fromEntries(Object.entries(markings).filter(([, value]) => value !== false && value !== '')), zh)].filter(Boolean).join('\n');
};
const fullSection = (section: Song['sections'][number], zh: boolean) => {
  const { id, title, bars, ...markings } = section;
  return [format(Object.fromEntries(Object.entries(markings).filter(([, value]) => value !== false)), zh), ...bars.map((bar, index) => `${zh ? `第 ${index + 1} 小節` : `Bar ${index + 1}`}：${fullBar(bar, zh)}`)].filter(Boolean).join('\n');
};

export const hasLyricsTextChange = (source: Song, entry: Song) => {
  const text = (song: Song) => ({
    chinese: song.lyricsDoc?.chinese ?? '', english: song.lyricsDoc?.english ?? '',
    blocks: getLyricsBlocks(song.lyricsDoc).map(({ marker, chinese, english }) => ({ marker, chinese, english }))
  });
  return !equal(text(source), text(entry));
};

// Keep unchanged lines out of the comparison, including after an insertion.
const compareTextLines = (oldText: string | undefined, nextText: string | undefined, label: string, zh: boolean): SourceComparisonRow[] => {
  if ((oldText ?? '') === (nextText ?? '')) return [];
  const a = oldText ? oldText.split(/\r?\n/) : [], b = nextText ? nextText.split(/\r?\n/) : [];
  const rows: SourceComparisonRow[] = [];
  const bounded = a.length * b.length <= 1_000_000;
  const lcs = bounded ? Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1)) : [];
  if (bounded) for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    const startA = i, startB = j, removed: string[] = [], added: string[] = [];
    while ((i < a.length || j < b.length) && !(i < a.length && j < b.length && a[i] === b[j])) {
      if (!bounded) {
        if (i < a.length) removed.push(a[i++]);
        if (j < b.length) added.push(b[j++]);
      } else if (j < b.length && (i === a.length || lcs[i][j + 1] > lcs[i + 1][j])) added.push(b[j++]);
      else removed.push(a[i++]);
    }
    const range = (start: number, count: number) => count > 1 ? `${start + 1}–${start + count}` : `${start + 1}`;
    const position = removed.length && added.length && startA === startB && removed.length === added.length
      ? (zh ? `第 ${range(startA, removed.length)} 行` : `Line ${range(startA, removed.length)}`)
      : [removed.length ? (zh ? `曲庫第 ${range(startA, removed.length)} 行` : `Library line ${range(startA, removed.length)}`) : '',
        added.length ? (zh ? `歌單第 ${range(startB, added.length)} 行` : `Setlist line ${range(startB, added.length)}`) : ''].filter(Boolean).join(' / ');
    rows.push({ label: `${label} · ${position}`, library: removed.length ? removed.join('\n') : (zh ? '無此行' : 'Line absent'), setlist: added.length ? added.join('\n') : (zh ? '已移除此行' : 'Line removed') });
  }
  return rows;
};

/** Current library and current setlist values stay in fixed, named columns. */
export function compareSetlistSourceScores(source: Song, entry: Song, language: AppLanguage, visual = false): SourceComparisonRow[] {
  const a = normalizeSongBars(structuredClone(source)), b = normalizeSongBars(structuredClone(entry));
  const aMeaning = normalizeSourceChordNotation(a), bMeaning = normalizeSourceChordNotation(b);
  const aMeters=getSongTimeSignatureStates(a),bMeters=getSongTimeSignatureStates(b);
  const zh = language === 'zh';
  const rows: SourceComparisonRow[] = [];
  const fields = (before: object, after: object, ignored: string[], prefix = '', beforeMeaning: object = before, afterMeaning: object = after, measurePair?:SourceComparisonRow['measures']) => {
    const old = before as Record<string, unknown>, next = after as Record<string, unknown>;
    for (const field of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (ignored.includes(field) || equal(old[field], next[field])
        || equal((beforeMeaning as Record<string, unknown>)[field], (afterMeaning as Record<string, unknown>)[field])) continue;
      const continuation = field === 'chords' ? getContinuationOnlyChange((beforeMeaning as Record<string, unknown>)[field], (afterMeaning as Record<string, unknown>)[field]) : null;
      const preview=field==='chords'&&measurePair?{measures:measurePair}:{};
      if (continuation&&measurePair) {
        measurePair.library.description=describeContinuationPositions(continuation.before,language);
        measurePair.setlist.description=describeContinuationPositions(continuation.after,language);
      }
      if (continuation) rows.push({...preview,label:prefix+(zh?'延續拍標示':'Continuation marks'),
        library:describeContinuationPositions(continuation.before,language)+'\n'+format(old[field],zh,field),
        setlist:describeContinuationPositions(continuation.after,language)+'\n'+format(next[field],zh,field)});
      else rows.push({ ...preview, label: prefix + (zh ? field === 'title' && prefix ? '段落名稱' : names[field] ?? '演奏記號' : field), library: format(old[field], zh, field), setlist: format(next[field], zh, field) });
    }
  };
  const scoreFields = ['title','lyricist','composer','translator','groove','shuffle','originalKey','originalKeyMode','originalKeyUnspecified','tempo','timeSignature','timeSignatureUnspecified','jianpuInputAbsolute','references','pickup','lyricsDoc','chordTimingVersion'];
  const pick = (song: Song) => Object.fromEntries(scoreFields.map(key => {
    let value = song[key as keyof Song];
    if (key === 'lyricsDoc' && value && typeof value === 'object') {
      const { displayLanguage, fontSize, lineHeight, ...rest } = value as NonNullable<Song['lyricsDoc']>;
      value = rest;
    }
    return [key,value];
  }));
  fields(pick(a), pick(b), ['lyricsDoc', 'pickup']);
  if (!equal(a.pickup, b.pickup)) rows.push({ label: zh ? '弱起拍' : 'Pickup', library: describePickup(a.pickup, a.timeSignature, language), setlist: describePickup(b.pickup, b.timeSignature, language) });
  const oldDoc = a.lyricsDoc ?? { chinese: '' }, nextDoc = b.lyricsDoc ?? { chinese: '' };
  fields(oldDoc, nextDoc, ['chinese', 'english', 'blocks', 'displayLanguage', 'fontSize', 'lineHeight', 'translationLanguage'], zh ? '歌詞 · ' : 'Lyrics · ');
  if ((oldDoc.translationLanguage || 'en') !== (nextDoc.translationLanguage || 'en')) rows.push({
    label: zh ? '歌詞 · 翻譯語言設定' : 'Lyrics · Translation language',
    library: oldDoc.translationLanguage ? lyricsLanguageName(oldDoc.translationLanguage, language) : (zh ? '未設定（預設英文）' : 'Not set (defaults to English)'),
    setlist: nextDoc.translationLanguage ? lyricsLanguageName(nextDoc.translationLanguage, language) : (zh ? '未設定（預設英文）' : 'Not set (defaults to English)')
  });
  for (const field of ['chinese', 'english'] as const) rows.push(...compareTextLines(oldDoc[field], nextDoc[field], zh ? names[field] : field === 'chinese' ? 'Chinese lyrics' : 'Translated lyrics', zh));
  const oldBlocks = oldDoc.blocks ?? [], nextBlocks = nextDoc.blocks ?? [];
  for (let i = 0; i < Math.max(oldBlocks.length, nextBlocks.length); i++) {
    const old = oldBlocks[i] ?? {}, next = nextBlocks[i] ?? {};
    const label = `${zh ? '歌詞' : 'Lyrics'} · ${nextBlocks[i]?.marker || oldBlocks[i]?.marker || (zh ? `第 ${i + 1} 段` : `Section ${i + 1}`)}`;
    fields(old, next, ['id', 'chinese', 'english'], label + ' · ');
    // The legacy bodies normally mirror these blocks. Show their edits once.
    for (const field of ['chinese', 'english'] as const) if ((oldDoc[field] ?? '') === (nextDoc[field] ?? ''))
      rows.push(...compareTextLines(oldBlocks[i]?.[field], nextBlocks[i]?.[field], `${label} · ${zh ? names[field] : field}`, zh));
  }
  if (visual) {
    const pickupRow = rows.find(row => row.label === (zh ? '弱起拍' : 'Pickup'));
    if (pickupRow) pickupRow.pickup = { library: a, setlist: b };
  }
  const excerpt = (song: Song, sectionIndex: number, barIndex?: number): SourceScoreExcerpt => ({ song, sectionIndex, ...(barIndex !== undefined ? { barIndex } : {}) });
  const score = (library: SourceScoreExcerpt | undefined, setlist: SourceScoreExcerpt | undefined, fields: string[] = ['all']) => visual ? { score: { library, setlist, fields } } : {};
  const usedSections = new Set<number>();
  b.sections.forEach((section, index) => {
    let oldIndex = a.sections.findIndex(old => old.id === section.id);
    if (oldIndex < 0 && a.sections[index] && !usedSections.has(index) && !b.sections.some(next => next.id === a.sections[index].id)) oldIndex = index;
    if (oldIndex < 0) { rows.push({label: section.title, library: zh?'無此段落':'Section absent', setlist: fullSection(section,zh), ...score(undefined, excerpt(b,index))}); return; }
    usedSections.add(oldIndex);
    const old = a.sections[oldIndex];
    fields(old, section, ['id','bars'], `${section.title} · `);
    const usedBars = new Set<number>();
    section.bars.forEach((bar, barIndex) => {
      let oldBarIndex = old.bars.findIndex(item => item.id === bar.id);
      if (oldBarIndex < 0 && old.bars[barIndex] && !usedBars.has(barIndex) && !section.bars.some(next => next.id === old.bars[barIndex].id)) oldBarIndex = barIndex;
      const label = zh ? `${section.title} · 第 ${barIndex + 1} 小節` : `${section.title} · Bar ${barIndex + 1}`;
      if (oldBarIndex < 0) { rows.push({label, library: zh?'無此小節':'Bar absent', setlist: fullBar(bar,zh), ...score(undefined, excerpt(b,index,barIndex))}); return; }
      usedBars.add(oldBarIndex);
      const oldMeaning=aMeaning.sections[oldIndex].bars[oldBarIndex],nextMeaning=bMeaning.sections[index].bars[barIndex];
      if (visual) {
        const before = old.bars[oldBarIndex];
        const changed = [...new Set([...Object.keys(before), ...Object.keys(bar)])]
          .filter(field => field !== 'id' && !equal((oldMeaning as unknown as Record<string, unknown>)[field] ?? before[field as keyof Bar], (nextMeaning as unknown as Record<string, unknown>)[field] ?? bar[field as keyof Bar]));
        if (changed.length) rows.push({
          label: label + ' · ' + changed.map(field => field === 'chords' && getContinuationOnlyChange(oldMeaning.chords, nextMeaning.chords) ? (zh ? '延續拍標示' : 'Continuation marks') : zh ? names[field] ?? '演奏記號' : field).join('、'),
          library: fullBar(before, zh), setlist: fullBar(bar, zh),
          ...score(excerpt(a,oldIndex,oldBarIndex), excerpt(b,index,barIndex), changed)
        });
      } else {
      const oldMeaning=aMeaning.sections[oldIndex].bars[oldBarIndex],nextMeaning=bMeaning.sections[index].bars[barIndex];
      const measures=!equal(old.bars[oldBarIndex].chords,bar.chords)&&!equal(oldMeaning.chords,nextMeaning.chords)
        ? compareMeasurePreviews(old.bars[oldBarIndex],bar,aMeters.barActiveTimeSignatures[oldIndex][oldBarIndex],bMeters.barActiveTimeSignatures[index][barIndex],oldMeaning,nextMeaning) : undefined;
      fields(old.bars[oldBarIndex], bar, ['id'], label + ' · ', oldMeaning, nextMeaning, measures);
      }

    });
    old.bars.forEach((bar,barIndex) => {
      if (!usedBars.has(barIndex)) rows.push({label: zh?`${old.title} · 曲庫第 ${barIndex + 1} 小節`:`${old.title} · Library bar ${barIndex + 1}`,library:fullBar(bar,zh),setlist:zh?'此歌單已移除此小節':'Removed from this setlist', ...score(excerpt(a,oldIndex,barIndex),undefined)});
    });
    const common = old.bars.filter(bar => section.bars.some(next => next.id === bar.id)).map(bar=>bar.id);
    const reordered = section.bars.filter(bar=>common.includes(bar.id)).map(bar=>bar.id);
    if (!equal(common,reordered)) rows.push({label: `${section.title} · ${zh?'小節順序':'Bar order'}`,library: old.bars.map(bar=>summary(bar,zh)).join(' | '),setlist:section.bars.map(bar=>summary(bar,zh)).join(' | '), ...score(excerpt(a,oldIndex),excerpt(b,index))});
  });
  a.sections.forEach((section,index) => { if (!usedSections.has(index)) rows.push({label:section.title,library:fullSection(section,zh),setlist:zh?'此歌單已移除此段落':'Removed from this setlist', ...score(excerpt(a,index),undefined)}); });
  const common = a.sections.filter(section=>b.sections.some(next=>next.id===section.id)).map(section=>section.id);
  const reordered = b.sections.filter(section=>common.includes(section.id)).map(section=>section.id);
  if (!equal(common,reordered)) rows.push({label:zh?'段落順序':'Section order',library:a.sections.map(section=>section.title).join(' → '),setlist:b.sections.map(section=>section.title).join(' → ')});
  return rows;
}
