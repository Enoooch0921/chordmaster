import { describe, expect, it } from 'vitest';
import { togglePreviewBarSelection } from './previewBarSelection';

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
