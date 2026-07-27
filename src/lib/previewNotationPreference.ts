export const PREVIEW_LAST_NON_CHORD_MODE_STORAGE_KEY = 'chordmaster.preview-last-non-chord-mode.v1';

export type PreviewNonChordMode = 'rhythm' | 'jianpu';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

const getBrowserStorage = (): Storage | null => (
  typeof window === 'undefined' ? null : window.localStorage
);

export const loadPreviewLastNonChordMode = (
  storage: ReadableStorage | null = getBrowserStorage()
): PreviewNonChordMode => (
  storage?.getItem(PREVIEW_LAST_NON_CHORD_MODE_STORAGE_KEY) === 'jianpu'
    ? 'jianpu'
    : 'rhythm'
);

export const savePreviewLastNonChordMode = (
  mode: PreviewNonChordMode,
  storage: WritableStorage | null = getBrowserStorage()
) => {
  storage?.setItem(PREVIEW_LAST_NON_CHORD_MODE_STORAGE_KEY, mode);
};
