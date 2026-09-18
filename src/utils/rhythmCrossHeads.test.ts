import { describe, expect, it } from 'vitest';
import { normalizeRhythmInput, parseRhythmNotation } from './rhythmUtils';
import { applyRhythmEdit } from '../lib/rhythmEditing';
import { normalizeSongBars } from '../lib/workspace';
import type { Song } from '../types';

const target = { sectionId: 's1', barId: 'b1' };
const makeSong = (rhythm: string): Song => ({
  title: 'Crosshead regression', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
  sections: [{ id: 's1', title: 'Bridge', bars: [{ id: 'b1', chords: ['C'], rhythm }] }]
});
const notation = (song: Song) => song.sections[0].bars[0].rhythm;
const edit = (song: Song, cursorUnit: number, action: Parameters<typeof applyRhythmEdit>[3]) => {
  const result = applyRhythmEdit(song, target, { cursorUnit }, action);
  expect(result.error).toBeNull();
  return result.song;
};

describe('crosshead rhythm data', () => {
  it('preserves mixed crosshead patterns without treating hidden gaps as crosses', () => {
    const chorus = parseRhythmNotation('qc qr er s s s s s s', '4/4');
    const bridge = parseRhythmNotation('ecu e ecu e ecu e ecu e', '4/4');
    for (const parsed of [chorus, bridge]) {
      expect(parsed.invalidTokens).toEqual([]);
      expect(parsed.totalUnits).toBe(16);
      expect(parsed.underfilled || parsed.overflow).toBe(false);
    }
    expect(chorus.events[0].crossHead).toBe('normal');
    expect(bridge.events.map(event => event.crossHead)).toEqual(['upper', undefined, 'upper', undefined, 'upper', undefined, 'upper', undefined]);
    expect(parseRhythmNotation('qx ex', '4/4').events.every(event => event.isHidden && !event.crossHead)).toBe(true);
  });

  it('normalizes modifiers and triplets without accepting ambiguous whole/half crosses', () => {
    expect(normalizeRhythmInput('QC^.~  E3CU^')).toBe('qc.^~ e3cu^');
    expect(parseRhythmNotation('qrc ecx qu hc wc', '4/4').invalidTokens).toEqual(['qrc', 'ecx', 'qu', 'hc', 'wc']);
    expect(parseRhythmNotation('e3cu e3 e3cu', '4/4').totalUnits).toBeCloseTo(4);
  });

  it('keeps noteheads through edits elsewhere, deletion gaps, serialization and normalization', () => {
    let song = makeSong('ecu e ecu e ecu e ecu e');
    song = edit(song, 14, { type: 'toggle-accent' });
    song = edit(song, 2, { type: 'delete' });
    expect(notation(song)).toBe('ecu ex ecu e ecu e ecu e^');
    expect(notation(normalizeSongBars(JSON.parse(JSON.stringify(song))))).toBe(notation(song));
  });

  it('preserves crossheads when modifying duration, dot, accent or tie', () => {
    let song = makeSong('qcu');
    song = edit(song, 0, { type: 'insert', token: 'e' });
    song = edit(song, 0, { type: 'toggle-dot' });
    song = edit(song, 0, { type: 'toggle-accent' });
    song = edit(song, 0, { type: 'toggle-tie' });
    expect(notation(song)).toBe('ecu.^~');
    const unsupported = applyRhythmEdit(song, target, { cursorUnit: 0 }, { type: 'insert', token: 'h' });
    expect(unsupported.song).toBe(song);
    expect(unsupported.error).toContain('先取消叉形音頭');
    song = edit(song, 0, { type: 'insert', token: 'er' });
    expect(notation(song)).toBe('er');
  });

  it('cycles crosshead positions explicitly and rejects unsupported durations', () => {
    let song = makeSong('q');
    for (const expected of ['qc', 'qcu', 'q']) {
      song = edit(song, 0, { type: 'cycle-cross-head' });
      expect(notation(song)).toBe(expected);
    }
    for (const token of ['wr', '/', 'h', 'w']) {
      const original = makeSong(token);
      const result = applyRhythmEdit(original, target, { cursorUnit: 0 }, { type: 'cycle-cross-head' });
      expect(result.song).toBe(original);
      expect(result.error).not.toBeNull();
    }
  });
});
