import { describe, expect, it } from 'vitest';
import { selectPreviewBarRange, togglePreviewBarSelection } from './previewBarSelection';

describe('preview bar selection', () => {
  it('seeds command/control multi-selection with the active bar before adding the clicked bar', () => {
    const selected = togglePreviewBarSelection(
      [],
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-b' },
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-a' }
    );

    expect(selected).toEqual([
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-a' },
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-b' }
    ]);
  });

  it('keeps later command/control clicks as normal toggles once selection exists', () => {
    const current = [
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-a' },
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-b' }
    ];

    expect(togglePreviewBarSelection(current, current[1], current[0])).toEqual([
      { previewIdentity: 'song-1', sectionId: 'section-1', barId: 'bar-a' }
    ]);
  });
});

const ordered = ['a', 'b', 'c', 'd', 'e'].map((barId, index) => ({
  previewIdentity: 'song', sectionId: index < 3 ? 'verse' : 'chorus', barId
}));

it('selects forward and reverse inclusive ranges across sections in score order', () => {
  expect(selectPreviewBarRange([], ordered, ordered[4], ordered[1])).toEqual(ordered.slice(1));
  expect(selectPreviewBarRange([], ordered, ordered[1], ordered[4])).toEqual(ordered.slice(1));
});
it('shrinks a repeated Shift range while retaining its original anchor', () => {
  const expanded = selectPreviewBarRange([], ordered, ordered[4], ordered[0]);
  expect(selectPreviewBarRange(expanded, ordered, ordered[2], ordered[0])).toEqual(ordered.slice(0, 3));
});
it('adds a Cmd+Shift range and discards stale or other-song selections', () => {
  const stale = { ...ordered[0], previewIdentity: 'other' };
  expect(selectPreviewBarRange([ordered[0], stale], ordered, ordered[4], ordered[3], true))
    .toEqual([ordered[0], ordered[3], ordered[4]]);
});
it('falls back to the clicked bar when an anchor is missing or belongs to another song', () => {
  expect(selectPreviewBarRange([], ordered, ordered[2], null)).toEqual([ordered[2]]);
  expect(selectPreviewBarRange([], ordered, ordered[2], { ...ordered[0], previewIdentity: 'other' }))
    .toEqual([ordered[2]]);
});
