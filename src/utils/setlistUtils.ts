import { JoinedProject, JoinedSetlist, Key, Section, Setlist, SetlistSong, Song } from '../types';
import { getSuggestedGuitarCapo } from './musicUtils';

export const getSectionReferenceId = (section: Section, index: number) => section.id || `section-${index}`;

export const getDefaultSectionOrder = (song: Song) => song.sections.map((section, index) => getSectionReferenceId(section, index));

export const reorderSetlistSongs = (
  setlistSongs: SetlistSong[],
  sourceId: string,
  targetId: string
) => {
  if (sourceId === targetId) return setlistSongs;
  const sourceIndex = setlistSongs.findIndex((item) => item.id === sourceId);
  const targetIndex = setlistSongs.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return setlistSongs;
  const next = [...setlistSongs];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((item, index) => ({
    ...item,
    order: index
  }));
};

export const getJoinedProjectSetlists = (
  joinedProjects: Array<Pick<JoinedProject, 'setlists'>>
): JoinedSetlist[] => (
  joinedProjects.flatMap((project) =>
    project.setlists.map((setlist) => ({ ...setlist, isJoined: true }))
  )
);

export const pickAvailableSetlist = (
  ownedSetlists: Setlist[],
  joinedSetlists: JoinedSetlist[],
  joinedProjects: Array<Pick<JoinedProject, 'setlists'>>,
  preferredIds: Array<string | null | undefined>
): Setlist | JoinedSetlist | null => {
  const availableSetlists = [
    ...ownedSetlists,
    ...joinedSetlists,
    ...getJoinedProjectSetlists(joinedProjects)
  ];
  for (const preferredId of preferredIds) {
    const match = preferredId
      ? availableSetlists.find((setlist) => setlist.id === preferredId)
      : null;
    if (match) return match;
  }

  return availableSetlists[0] ?? null;
};

export const pickAvailableSetlistSongId = (
  setlist: Pick<Setlist, 'songs'> | null | undefined,
  preferredIds: Array<string | null | undefined>
) => {
  if (!setlist) return null;

  for (const preferredId of preferredIds) {
    if (preferredId && setlist.songs.some((song) => song.id === preferredId)) {
      return preferredId;
    }
  }

  return setlist.songs[0]?.id ?? null;
};

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
  const getDuplicateSignature = (section: Section) => JSON.stringify({
    ...section,
    id: undefined,
    // A duplicated key-change section can omit a now-redundant keyChangeTo
    // while retaining the same written musical content.
    keyChangeTo: undefined,
    bars: section.bars.map((bar) => ({ ...bar, id: undefined }))
  });
  const previousIds = new Set(getDefaultSectionOrder(previousSong));
  const nextIds = getDefaultSectionOrder(nextSong);
  const nextIdSet = new Set(nextIds);
  const result = currentOrder.filter((sectionId) => nextIdSet.has(sectionId));
  const previousSectionByBarId = new Map<string, string>();
  const previousSectionIdsBySignature = new Map<string, string[]>();
  previousSong.sections.forEach((section, sectionIndex) => {
    const sectionId = getSectionReferenceId(section, sectionIndex);
    const signature = getDuplicateSignature(section);
    previousSectionIdsBySignature.set(signature, [
      ...(previousSectionIdsBySignature.get(signature) ?? []),
      sectionId
    ]);
    section.bars.forEach((bar) => {
      if (bar.id) previousSectionByBarId.set(bar.id, sectionId);
    });
  });

  nextSong.sections.forEach((section, sectionIndex) => {
    const sectionId = getSectionReferenceId(section, sectionIndex);
    if (previousIds.has(sectionId) || result.includes(sectionId)) return;
    const splitSourceId = section.bars.map((bar) => bar.id && previousSectionByBarId.get(bar.id)).find(Boolean);
    const previousNextSection = nextSong.sections[sectionIndex - 1];
    const previousNextSectionId = previousNextSection
      ? getSectionReferenceId(previousNextSection, sectionIndex - 1)
      : null;
    const immediateDuplicateSourceId = previousNextSectionId
      && previousIds.has(previousNextSectionId)
      && getDuplicateSignature(previousNextSection) === getDuplicateSignature(section)
      ? previousNextSectionId
      : null;
    const matchingDuplicateSourceId = previousSectionIdsBySignature.get(getDuplicateSignature(section))?.[0];
    const sourceId = splitSourceId ?? immediateDuplicateSourceId ?? matchingDuplicateSourceId;
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
