import { Key, Section, Setlist, SetlistSong, Song } from '../types';
import { getSuggestedGuitarCapo } from './musicUtils';

export const getSectionReferenceId = (section: Section, index: number) => section.id || `section-${index}`;

export const getDefaultSectionOrder = (song: Song) => song.sections.map((section, index) => getSectionReferenceId(section, index));

export const reorderSetlistSectionOrder = (
  order: string[],
  sourceSectionId: string,
  targetSectionId: string,
  placement: 'before' | 'after'
) => {
  if (sourceSectionId === targetSectionId) return order;
  const sourceIndex = order.indexOf(sourceSectionId);
  const targetIndex = order.indexOf(targetSectionId);
  if (sourceIndex < 0 || targetIndex < 0) return order;
  const next = [...order];
  next.splice(sourceIndex, 1);
  const nextTargetIndex = next.indexOf(targetSectionId);
  next.splice(nextTargetIndex + (placement === 'after' ? 1 : 0), 0, sourceSectionId);
  return next;
};

export const insertNewSetlistSectionsAfterSources = (
  currentOrder: string[],
  previousSong: Song,
  nextSong: Song
) => {
  const previousIds = new Set(getDefaultSectionOrder(previousSong));
  const nextIds = getDefaultSectionOrder(nextSong);
  const nextIdSet = new Set(nextIds);
  const result = currentOrder.filter((sectionId) => nextIdSet.has(sectionId));
  const previousSectionByBarId = new Map<string, string>();
  previousSong.sections.forEach((section, sectionIndex) => {
    const sectionId = getSectionReferenceId(section, sectionIndex);
    section.bars.forEach((bar) => {
      if (bar.id) previousSectionByBarId.set(bar.id, sectionId);
    });
  });

  nextSong.sections.forEach((section, sectionIndex) => {
    const sectionId = getSectionReferenceId(section, sectionIndex);
    if (previousIds.has(sectionId) || result.includes(sectionId)) return;
    const sourceId = section.bars.map((bar) => bar.id && previousSectionByBarId.get(bar.id)).find(Boolean);
    if (!sourceId) return;
    const sourceIndex = result.lastIndexOf(sourceId);
    if (sourceIndex >= 0) result.splice(sourceIndex + 1, 0, sectionId);
  });

  nextIds.forEach((sectionId) => {
    if (!result.includes(sectionId)) result.push(sectionId);
  });
  return result;
};

export const getSectionShortLabel = (title: string, fallbackIndex: number) => {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return String(fallbackIndex + 1);
  }

  const letters = trimmedTitle
    .split(/[\s/-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (letters) {
    return letters.slice(0, 2);
  }

  return trimmedTitle.slice(0, 2).toUpperCase();
};

export const getEffectiveSetlistSongCapo = (setlistSong: SetlistSong, fallbackCapo?: number) => (
  typeof setlistSong.personalCapoOverride === 'number'
    ? setlistSong.personalCapoOverride
    : typeof setlistSong.capo === 'number'
      ? setlistSong.capo
      : fallbackCapo
);

// Guitarist mode: a live, non-destructive overlay. Songs with an explicit capo
// (base > 0) keep their value; only songs that resolve to capo 0/unset get an
// auto-filled guitar-friendly capo. Returns the effective capo to display.
export const resolveSetlistSongCapo = (
  setlistSong: SetlistSong,
  sourceSong: Pick<Song, 'capo' | 'currentKey'>,
  guitaristMode: boolean
): number => {
  const base = getEffectiveSetlistSongCapo(setlistSong, sourceSong.capo ?? 0) ?? 0;
  if (!guitaristMode || base > 0) {
    return base;
  }
  const effectiveKey = (setlistSong.overrideKey ?? sourceSong.currentKey) as Key;
  return getSuggestedGuitarCapo(effectiveKey);
};

export const applySetlistSongOverrides = (song: Song, setlist: Setlist, setlistSong: SetlistSong, guitaristMode = false): Song => {
  const sectionMap = new Map<string, Section>();
  song.sections.forEach((section, index) => {
    sectionMap.set(getSectionReferenceId(section, index), section);
  });

  const explicitOrder = setlistSong.sectionOrder.length > 0
    ? setlistSong.sectionOrder
    : getDefaultSectionOrder(song);
  const orderedSections = explicitOrder
    .map((sectionId) => sectionMap.get(sectionId))
    .filter((section): section is Section => Boolean(section))
    .map((section) => JSON.parse(JSON.stringify(section)) as Section);

  return {
    ...JSON.parse(JSON.stringify(song)) as Song,
    currentKey: (setlistSong.overrideKey ?? song.currentKey) as Key,
    capo: resolveSetlistSongCapo(setlistSong, song, guitaristMode),
    showNashvilleNumbers: setlist.displayMode === 'nashville-number-system',
    showAbsoluteJianpu: setlist.displayMode === 'chord-fixed-key',
    sections: orderedSections
  };
};
