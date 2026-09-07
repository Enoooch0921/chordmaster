import type { Song } from '../types';

export const SYMBOL_TEST_SONG_LEGACY_TITLE = '符號測試頁';
export const SYMBOL_TEST_SONG_TWO_ROW_TITLE = '符號測試頁（2行）';
export const SYMBOL_TEST_SONG_THREE_ROW_TITLE = '符號測試頁（3行）';

// Symbol test pages are bundled app fixtures, not user content. Detect them by
// their stable fixture section ids so renaming a page cannot accidentally make
// it eligible for cloud sync.
export const isLocalOnlySymbolTestSong = (song: Pick<Song, 'sections'>) => (
  song.sections.some((section) => section.id === 'test-bars')
  && song.sections.some((section) => section.id === 'test-meter')
);
