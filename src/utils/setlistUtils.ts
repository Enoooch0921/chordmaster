import { Key, Section, Setlist, SetlistSong, Song } from '../types';

export const getSectionReferenceId = (section: Section, index: number) => section.id || `section-${index}`;

export const getDefaultSectionOrder = (song: Song) => song.sections.map((section, index) => getSectionReferenceId(section, index));

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

export const applySetlistSongOverrides = (song: Song, setlist: Setlist, setlistSong: SetlistSong): Song => {
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
    capo: typeof setlistSong.capo === 'number' ? setlistSong.capo : song.capo,
    showNashvilleNumbers: setlist.displayMode === 'nashville-number-system',
    showAbsoluteJianpu: setlist.displayMode === 'chord-fixed-key',
    showLyrics: setlist.showLyrics,
    sections: orderedSections
  };
};
