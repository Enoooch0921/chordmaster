import { describe, expect, it } from 'vitest';
import { getPickupDisplay, resizePickup, normalizePickupTimeSignature, getPickupContentUnits } from './pickupUtils';
import { normalizeSongBars } from '../lib/workspace';
import type { Song } from '../types';
import { parseRhythmNotation } from './rhythmUtils';

describe('pickup duration', () => {
  it('retains duration through a workspace JSON round trip without changing meter or regular bars', () => {
    const song: Song = { title: 'Pickup', originalKey: 'C', currentKey: 'C', timeSignature: '4/4',
      pickup: { id: 'p', timeSignature: '1/8', riff: '5_' },
      sections: [{ id: 's', title: 'Verse', bars: [{ id: 'b', chords: ['C'] }] }] };
    const normalized = normalizeSongBars(JSON.parse(JSON.stringify(song)));
    expect(normalized.pickup).toMatchObject(song.pickup!);
    expect(normalized.timeSignature).toBe('4/4');
    expect(normalized.sections[0].bars[0]).toMatchObject(song.sections[0].bars[0]);
    expect(normalizePickupTimeSignature('0/4')).toBeUndefined();
    expect(normalizePickupTimeSignature('2/3')).toBeUndefined();
  });

  it('compacts a legacy half-beat pickup without mutating its stored notation', () => {
    const pickup = { riff: ' | | | 5_', rhythm: 'hx qx e' };
    const before = JSON.stringify(pickup);
    const display = getPickupDisplay(pickup, '4/4');
    expect(display).toMatchObject({ durationUnits: 2, timeSignature: '1/8', riff: '5_', rhythm: 'e' });
    expect(JSON.stringify(pickup)).toBe(before);
    expect(resizePickup(pickup, '4/4', '1/8')).toMatchObject({ timeSignature: '1/8', riff: '5_', rhythm: 'e' });
  });

  it('preserves rests and relative offsets between all voices', () => {
    const pickup = { riff: ' | | 0_5_ | 6_', rhythm: 'hx er e e',
      riffVoices: [{ id: 'bass', label: 'Bass', riff: ' | | e1_ | 2_' }] };
    const display = getPickupDisplay(pickup, '4/4');
    expect(display.durationUnits).toBe(6);
    expect(display.riff).toBe('0_ | 5_ | 6_');
    expect(display.rhythm).toBe('er e e');
    expect(display.riffVoices?.[0].riff).toBe(' | 1_ | 2_');
  });

  it('keeps a quarter note unchanged when regrouping a one-and-a-half-beat pickup', () => {
    const pickup = { id: 'p', riff: '(5 | 6_)', rhythm: 'q e', riffVoices: [{ id: 'bass', label: 'Bass', riff: '1 | 2_' }] };
    const resized = resizePickup(pickup, '4/4', '3/8')!;
    expect(resized.riff).toBe('(5 |  | 6_)');
    expect(resized.rhythm).toBe('q e');
    expect(getPickupContentUnits(resized, '4/4')).toBe(6);
    expect(getPickupDisplay(resized, '4/4').riff).toBe('(5 |  | 6_)');
    expect(resizePickup(resized, '4/4', '2/4')?.riff).toBe('(5 | 6_)');
    expect(resizePickup(resized, '4/4', '1/4')).toBeNull();
  });

  it('checks lower voices before shortening and preserves accent, grace and triplet markers', () => {
    const pickup = { riff: '[{3}5=t!6=t7=t] |', riffVoices: [{ id: 'bass', label: '', riff: '1 | 2' }] };
    expect(resizePickup(pickup, '4/4', '1/4')).toBeNull();
    expect(resizePickup(pickup, '4/4', '2/4')?.riff).toBe('[{3}5=t!6=t7=t]');
  });

  it('handles compound meter without changing source beat positions', () => {
    const pickup = { riff: ' | 5_6_7_', rhythm: 'qx. e e e' };
    expect(getPickupDisplay(pickup, '6/8')).toMatchObject({ durationUnits: 6, riff: '5_ | 6_ | 7_', rhythm: 'e e e' });
  });

  it('clips only invisible tail slots when shortening rhythm', () => {
    const resized = resizePickup({ timeSignature: '4/4', rhythm: 'e hx' }, '4/4', '1/4')!;
    const parsed = parseRhythmNotation(resized.rhythm!, resized.timeSignature!);
    expect(parsed.totalUnits).toBe(4);
    expect(parsed.events.filter(e => !e.isHidden).map(e => e.token)).toEqual(['e']);
    expect(resizePickup({ rhythm: 'e qr' }, '4/4', '1/4')).toBeNull();
  });
});
