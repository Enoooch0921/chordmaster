import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import LyricsSheet from './LyricsSheet';
import LyricsBook from './LyricsBook';
import LyricsDocEditor from './LyricsDocEditor';
import { DEFAULT_LYRICS_BOOK_SETTINGS } from '../utils/lyricsBook';
import { getLyricsFields, importLyrics, updateLyricsBlocks, type LyricsLanguage } from '../utils/lyricsDocument';
import { normalizeSongBars } from '../lib/workspace';
import { sourceScoreMeaningSignature } from '../lib/setlistSourceMeaning';
import * as measurement from '../utils/lyricsMeasurement';

const song: Song = {
  title: '原稿演唱語言', originalKey: 'C', currentKey: 'C', timeSignature: '4/4', sections: [],
  lyricsDoc: updateLyricsBlocks({ chinese: '', displayLanguage: 'chinese' }, [
    { id: 'verse', marker: 'Verse 1', chinese: '中文主歌', english: 'Translated verse' },
    { id: 'chorus', marker: 'Chorus', chinese: '副歌中文對照\n第二句譯文', english: 'Sung chorus\nSecond line', singingLanguage: 'english' },
    { id: 'ending', marker: 'Ending', chinese: '', english: 'Sung ending', singingLanguage: 'english' },
  ]),
};

describe.each(['sheet', 'book'] as const)('%s source sung language', kind => {
  const show = (reading: boolean, language: LyricsLanguage = 'chinese', onChange?: (...args: unknown[]) => void, current = song) => render(kind === 'sheet'
    ? <LyricsSheet song={{ ...current, lyricsDoc: { ...current.lyricsDoc!, displayLanguage: language } }} language="zh" reading={reading} onChange={onChange} />
    : <LyricsBook title="主日" entries={[{ id: 'entry', song: current }]} language="zh" settings={{ ...DEFAULT_LYRICS_BOOK_SETTINGS, language }} reading={reading} onSongChange={onChange} />);

  const mixedSong: Song = { ...song, lyricsDoc: updateLyricsBlocks(song.lyricsDoc, [{ id: 'mixed', marker: 'Chorus', chinese: '實際中文唱句\n英文句的中文對照', english: 'Translated first line\nSung English line', singingLineLanguages: ['chinese', 'english'] }]) };
  it.each([true, false])('supports a language change within one section without replacing either source (reading=%s)', reading => {
    const { container } = show(reading, 'chinese', undefined, mixedSong);
    const text = Array.from(container.querySelectorAll('.lyrics-page')).map(page => page.textContent).join('');
    expect(text).toContain('實際中文唱句Sung English line');
    expect(text).not.toContain('英文句的中文對照');
    expect(text).not.toContain('Translated first line');
  });
  it('keeps per-sentence sung language first in bilingual comparison', () => {
    const { container } = show(true, 'mixed', undefined, mixedSong);
    const pairs = container.querySelectorAll('[data-lyrics-pair]');
    expect(pairs[0].textContent).toBe('實際中文唱句Translated first line');
    expect(pairs[1].textContent).toBe('Sung English line英文句的中文對照');
  });
  it('routes a mixed-section edit to the correct raw language and line', () => {
    const onChange = vi.fn();
    show(kind === 'sheet', 'chinese', onChange, mixedSong);
    const label = kind === 'sheet' ? '英文歌詞 Chorus · 第2行' : '原稿演唱語言 · Chorus · 英文 · 第2行';
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: 'Edited sung line' } });
    fireEvent.blur(screen.getByRole('textbox', { name: label }));
    const doc = kind === 'sheet' ? onChange.mock.calls[0][0].lyricsDoc : onChange.mock.calls[0][1];
    expect(doc.blocks[0]).toEqual({ ...mixedSong.lyricsDoc!.blocks![0], english: 'Translated first line\nEdited sung line' });
  });

  it.each([true, false])('shows Chinese verses and English choruses/endings, including A4 (reading=%s)', reading => {
    const { container } = show(reading);
    const text = Array.from(container.querySelectorAll('.lyrics-page')).map(page => page.textContent).join('');
    expect(text).toContain('中文主歌');
    expect(text).toContain('Sung chorus');
    expect(text).toContain('Second line');
    expect(text).toContain('Sung ending');
    expect(text).not.toContain('副歌中文對照');
    expect(text).not.toContain('Translated verse');
    expect(screen.getByRole('option', { name: '原稿唱詞' })).toHaveValue('chinese');
  });

  it('keeps explicit translation view and both bilingual columns intact', () => {
    const view = show(true, 'english');
    expect(view.container.querySelector('.lyrics-page')).toHaveTextContent('Translated verse');
    expect(view.container.querySelector('.lyrics-page')).not.toHaveTextContent('中文主歌');
    view.unmount();
    const bilingual = show(true, 'bilingual');
    expect(bilingual.container.querySelector('.lyrics-page')).toHaveTextContent('副歌中文對照');
    expect(bilingual.container.querySelector('.lyrics-page')).toHaveTextContent('Sung chorus');
  });

  it.each([true, false])('puts the sung language before its translation in alternating view (reading=%s)', reading => {
    const { container } = show(reading, 'mixed');
    const blocks = container.querySelectorAll('[data-lyrics-layout="mixed"]');
    expect(blocks[0].querySelector('[data-lyrics-language]')).toHaveAttribute('data-lyrics-language', 'chinese');
    expect(blocks[1].querySelector('[data-lyrics-language]')).toHaveAttribute('data-lyrics-language', 'english');
    expect(blocks[1]).toHaveTextContent('Sung chorus副歌中文對照');
  });

  it('edits the sung English field without replacing the preserved Chinese translation', () => {
    const onChange = vi.fn();
    show(kind === 'sheet', 'chinese', onChange);
    const label = kind === 'sheet' ? '英文歌詞 Chorus' : '原稿演唱語言 · Chorus · 英文';
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: 'Edited chorus' } });
    fireEvent.blur(screen.getByRole('textbox', { name: label }));
    const doc = kind === 'sheet' ? onChange.mock.calls[0][0].lyricsDoc : onChange.mock.calls[0][1];
    expect(doc.blocks[1]).toMatchObject({ singingLanguage: 'english', chinese: '副歌中文對照\n第二句譯文', english: 'Edited chorus' });
  });

  it('paginates every wrapped English line instead of measuring the shorter Chinese translation', () => {
    const realMeasure = measurement.measureLyricsText;
    vi.spyOn(measurement, 'measureLyricsText').mockImplementation((element, text, lineHeight) => realMeasure(element, text, lineHeight).map(row => ({ ...row, height: 450 })));
    const { container } = show(false);
    const pages = container.querySelectorAll('[data-print-page]');
    const text = Array.from(pages).map(page => page.textContent).join('');
    expect(text.match(/Sung chorus/g)).toHaveLength(1);
    expect(text.match(/Second line/g)).toHaveLength(1);
    expect(text.match(/Sung ending/g)).toHaveLength(1);
  });
});

it('retains sung-language instructions through normalization, JSON sharing and unambiguous whole-song edits', () => {
  const roundTrip = normalizeSongBars(JSON.parse(JSON.stringify(song)));
  expect(roundTrip.lyricsDoc).toEqual(song.lyricsDoc);
  const onChange = vi.fn();
  render(<LyricsDocEditor song={roundTrip} language="zh" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('貼上英文歌詞'), { target: { value: song.lyricsDoc!.english!.replace('Sung chorus', 'Edited chorus') } });
  fireEvent.click(screen.getByRole('button', { name: '套用整首歌詞' }));
  expect(onChange.mock.calls[0][0].lyricsDoc.blocks[1]).toMatchObject({ id: 'chorus', singingLanguage: 'english', chinese: '副歌中文對照\n第二句譯文', english: 'Edited chorus\nSecond line' });
  expect(onChange.mock.calls[0][0].lyricsDoc.displayLanguage).toBe('chinese');
});

it('does not guess missing translations, transfer ambiguous source instructions or hide a stale empty sung field', () => {
  const block = { ...song.lyricsDoc!.blocks![1], english: '' };
  expect(getLyricsFields(block, 'chinese')).toEqual(['chinese']);
  expect(getLyricsFields({ ...block, chinese: '', english: 'Unpaired translation', singingLanguage: undefined }, 'chinese')).toEqual(['chinese']);
  const repeated = importLyrics('[Chorus]\n甲\n\n[Chorus]\n乙', '[Chorus]\nA\n\n[Chorus]\nB', song.lyricsDoc!.blocks);
  expect(repeated.every(block => block.singingLanguage === undefined)).toBe(true);
  const previous = importLyrics('[Verse 1]\n甲\n\n[Chorus]\n乙');
  const inserted = importLyrics('[Verse 1]\n甲\n\n[Verse 2]\n丙\n\n[Chorus]\n乙', '', previous);
  expect(new Set(inserted.map(block => block.id)).size).toBe(3);
  expect(inserted[2].id).toBe(previous[1].id);
  expect(getLyricsFields({ ...block, singingLanguage: 'invalid' } as unknown as typeof block, 'chinese')).toEqual(['chinese']);
  const plain = { ...song, lyricsDoc: { ...song.lyricsDoc!, blocks: song.lyricsDoc!.blocks!.map(({ singingLanguage, ...block }) => block) } };
  expect(sourceScoreMeaningSignature(plain)).not.toBe(sourceScoreMeaningSignature(song));
});

it('lets an editor change a section’s sung language while retaining both texts', () => {
  const onChange = vi.fn();
  render(<LyricsSheet song={song} language="zh" reading onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '段落操作 Chorus' }));
  fireEvent.change(screen.getByLabelText('段落演唱語言'), { target: { value: 'chinese' } });
  expect(onChange.mock.calls[0][0].lyricsDoc.blocks[1]).toEqual({ ...song.lyricsDoc!.blocks![1], singingLanguage: 'chinese' });
});
