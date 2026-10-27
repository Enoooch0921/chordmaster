import type { AppLanguage, Bar, Song } from '../types';
import { normalizeSongBars } from './workspace';

export interface SourceComparisonRow {
  label: string;
  library: string;
  setlist: string;
}
const names: Record<string, string> = {
  title: '歌名', lyricist: '版本／作詞', composer: '作曲', translator: '翻譯', groove: '風格', shuffle: 'Shuffle',
  originalKey: '原調', originalKeyMode: '大小調', originalKeyUnspecified: '原調待確認', tempo: '速度',
  timeSignature: '拍號', timeSignatureUnspecified: '拍號待確認', jianpuInputAbsolute: '簡譜輸入模式',
  references: '參考音源', pickup: '弱起拍', lyricsDoc: '歌詞', chordTimingVersion: '和弦時點格式',
  chords: '和弦', closed: '小節關閉', riff: '簡譜', rhythm: '節奏', annotation: '備註', label: '標籤', riffLabel: '簡譜標籤', rhythmLabel: '節奏標籤',
  keyChangeTo: '轉調', riffVoices: '簡譜聲部', rhythmVoices: '節奏聲部', resetTempo: '恢復原速', repeatStart: '反覆開始',
  repeatEnd: '反覆結束', doubleBar: '雙小節線', finalBar: '終止線', ending: '房子', leftText: '左側文字', rightText: '右側文字',
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

/** Current library and current setlist values stay in fixed, named columns. */
export function compareSetlistSourceScores(source: Song, entry: Song, language: AppLanguage): SourceComparisonRow[] {
  const a = normalizeSongBars(structuredClone(source)), b = normalizeSongBars(structuredClone(entry));
  const zh = language === 'zh';
  const rows: SourceComparisonRow[] = [];
  const fields = (before: object, after: object, ignored: string[], prefix = '') => {
    const old = before as Record<string, unknown>, next = after as Record<string, unknown>;
    for (const field of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (!ignored.includes(field) && !equal(old[field], next[field])) rows.push({ label: prefix + (zh ? field === 'title' && prefix ? '段落名稱' : names[field] ?? '演奏記號' : field), library: format(old[field], zh, field), setlist: format(next[field], zh, field) });
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
  fields(pick(a), pick(b), []);
  const usedSections = new Set<number>();
  b.sections.forEach((section, index) => {
    let oldIndex = a.sections.findIndex(old => old.id === section.id);
    if (oldIndex < 0 && a.sections[index] && !usedSections.has(index) && !b.sections.some(next => next.id === a.sections[index].id)) oldIndex = index;
    if (oldIndex < 0) { rows.push({label: section.title, library: zh?'無此段落':'Section absent', setlist: fullSection(section,zh)}); return; }
    usedSections.add(oldIndex);
    const old = a.sections[oldIndex];
    fields(old, section, ['id','bars'], `${section.title} · `);
    const usedBars = new Set<number>();
    section.bars.forEach((bar, barIndex) => {
      let oldBarIndex = old.bars.findIndex(item => item.id === bar.id);
      if (oldBarIndex < 0 && old.bars[barIndex] && !usedBars.has(barIndex) && !section.bars.some(next => next.id === old.bars[barIndex].id)) oldBarIndex = barIndex;
      const label = zh ? `${section.title} · 第 ${barIndex + 1} 小節` : `${section.title} · Bar ${barIndex + 1}`;
      if (oldBarIndex < 0) { rows.push({label, library: zh?'無此小節':'Bar absent', setlist: fullBar(bar,zh)}); return; }
      usedBars.add(oldBarIndex);
      fields(old.bars[oldBarIndex], bar, ['id'], label + ' · ');
    });
    old.bars.forEach((bar,barIndex) => {
      if (!usedBars.has(barIndex)) rows.push({label: zh?`${old.title} · 曲庫第 ${barIndex + 1} 小節`:`${old.title} · Library bar ${barIndex + 1}`,library:fullBar(bar,zh),setlist:zh?'此歌單已移除此小節':'Removed from this setlist'});
    });
    const common = old.bars.filter(bar => section.bars.some(next => next.id === bar.id)).map(bar=>bar.id);
    const reordered = section.bars.filter(bar=>common.includes(bar.id)).map(bar=>bar.id);
    if (!equal(common,reordered)) rows.push({label: `${section.title} · ${zh?'小節順序':'Bar order'}`,library: old.bars.map(bar=>summary(bar,zh)).join(' | '),setlist:section.bars.map(bar=>summary(bar,zh)).join(' | ')});
  });
  a.sections.forEach((section,index) => { if (!usedSections.has(index)) rows.push({label:section.title,library:fullSection(section,zh),setlist:zh?'此歌單已移除此段落':'Removed from this setlist'}); });
  const common = a.sections.filter(section=>b.sections.some(next=>next.id===section.id)).map(section=>section.id);
  const reordered = b.sections.filter(section=>common.includes(section.id)).map(section=>section.id);
  if (!equal(common,reordered)) rows.push({label:zh?'段落順序':'Section order',library:a.sections.map(section=>section.title).join(' → '),setlist:b.sections.map(section=>section.title).join(' → ')});
  return rows;
}
