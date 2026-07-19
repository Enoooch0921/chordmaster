import React from 'react';
import { AppLanguage, BarNumberMode, Key, SetlistDisplayMode, Song, SongReference, SongReferenceKind } from '../types';
import { getUiCopy } from '../constants/i18n';
import KeyPicker from './KeyPicker';
import CapoPicker from './CapoPicker';
import { CompactSegmentedControl, CompactToggleSwitch } from './SetlistCompactControls';
import { parseYouTubeVideoId } from '../utils/referenceUtils';
import { formatInitialCaps } from '../utils/textUtils';
import type { PreviewEditorDeviceLayout } from '../lib/previewEditorLayout';

type PreviewMetadataFocusField = 'title' | 'credits' | 'key' | 'tempo' | 'timeSignature' | 'capo' | 'groove';

interface SongMetadataPanelProps {
  song: Song;
  language: AppLanguage;
  onChange: (song: Song) => void;
  metadataSuggestions?: {
    versions: string[];
    translators: string[];
  };
  title?: string;
  keyValue?: Key;
  capoValue?: number;
  onKeyChange?: (key: Key) => void;
  onCapoChange?: (capo: number) => void;
  displayMode?: SetlistDisplayMode;
  onDisplayModeChange?: (mode: SetlistDisplayMode) => void;
  // Song-library context: provide a jianpu *input* setting (固定/首調) in place of
  // the display-mode control (which lives in the top-right toolbar there), and hide
  // the Capo field (also available top-right). Absent for setlist instance settings.
  jianpuInputAbsolute?: boolean;
  onJianpuInputAbsoluteChange?: (value: boolean) => void;
  showReferenceFields?: boolean;
  variant?: 'default' | 'preview-header';
  deviceLayout?: PreviewEditorDeviceLayout;
  initialFocusField?: PreviewMetadataFocusField;
  canEditKey?: boolean;
}

const DISPLAY_MODE_OPTIONS: SetlistDisplayMode[] = [
  'nashville-number-system',
  'chord-fixed-key',
  'chord-movable-key'
];
const BAR_NUMBER_OPTIONS: BarNumberMode[] = ['none', 'line-start', 'all'];
type MetadataLayoutMode = 'stacked' | 'compact' | 'wide';

const getVersionValue = (song: Song) =>
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ');

const formatMetadataText = formatInitialCaps;

const splitTimeSignatureInput = (value?: string) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { numerator: '', denominator: '' };
  }

  const [numerator = '', denominator = ''] = trimmed.split('/');
  return {
    numerator: numerator.replace(/\D+/g, ''),
    denominator: denominator.replace(/\D+/g, '')
  };
};

const buildTimeSignatureInput = (numeratorInput: string, denominatorInput: string) => {
  const numerator = numeratorInput.replace(/\D+/g, '').slice(0, 2);
  const denominator = denominatorInput.replace(/\D+/g, '').slice(0, 2);
  if (!numerator && !denominator) {
    return '';
  }
  if (!numerator || !denominator) {
    return `${numerator}/${denominator}`;
  }
  return `${numerator}/${denominator}`;
};

const getMetadataLayoutMode = (width: number): MetadataLayoutMode => {
  if (width < 480) return 'stacked';
  if (width < 820) return 'compact';
  return 'wide';
};

interface TapTempoButtonProps {
  language: AppLanguage;
  onApply: (bpm: number) => void;
  onActivate?: () => void;
}

interface TapTempoButtonHandle {
  tap: (eventTimeStamp?: number) => void;
}

const TAP_RESET_AFTER_MS = 2500;
const TAP_MAX_SAMPLES = 8;
const TAP_MIN_INTERVAL_MS = 150;
const TAP_MAX_INTERVAL_MS = 3000;
const TAP_OUTLIER_TOLERANCE = 0.16;
const TAP_DEADBAND_BPM = 1;
const TAP_MAX_STEP_BPM = 4;
const TAP_APPLY_IDLE_MS = 1400;
const REFERENCE_BPM_TAP_COMMIT_DELAY_MS = 1400;
const REFERENCE_BPM_INPUT_COMMIT_DELAY_MS = 300;

const getTapTimestamp = (eventTimeStamp?: number): number => {
  const now = performance.now();
  if (typeof eventTimeStamp !== 'number' || eventTimeStamp <= 0) {
    return now;
  }

  return Math.abs(eventTimeStamp - now) < 60000 ? eventTimeStamp : now;
};

const getStableTapBpm = (tapTimes: number[], previousBpm: number | null): number | null => {
  if (tapTimes.length < 2) {
    return null;
  }

  const intervals = tapTimes
    .slice(1)
    .map((time, index) => time - tapTimes[index])
    .filter((interval) => interval >= TAP_MIN_INTERVAL_MS && interval <= TAP_MAX_INTERVAL_MS);

  if (intervals.length < 2) {
    const interval = intervals[0];
    return interval ? Math.min(400, Math.max(20, Math.round(60000 / interval))) : null;
  }

  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  const inlierIntervals = sortedIntervals.filter((interval) => (
    Math.abs(interval - medianInterval) <= medianInterval * TAP_OUTLIER_TOLERANCE
  ));
  const usableIntervals = inlierIntervals.length >= 2 ? inlierIntervals : sortedIntervals;
  const trimmedIntervals = usableIntervals.length >= 5
    ? usableIntervals.slice(1, -1)
    : usableIntervals;
  const trimmedAverageInterval = trimmedIntervals.reduce((total, interval) => total + interval, 0) / trimmedIntervals.length;
  const stableInterval = medianInterval * 0.65 + trimmedAverageInterval * 0.35;
  const rawBpm = Math.min(400, Math.max(20, Math.round(60000 / stableInterval)));

  if (previousBpm === null) {
    return rawBpm;
  }

  const difference = Math.abs(rawBpm - previousBpm);
  if (difference <= TAP_DEADBAND_BPM) {
    return previousBpm;
  }

  return previousBpm + Math.sign(rawBpm - previousBpm) * Math.min(TAP_MAX_STEP_BPM, difference);
};

const getReferenceBpmDrafts = (song: Song): Record<SongReferenceKind, string> => ({
  band: typeof song.references?.band?.bpm === 'number' ? String(song.references.band.bpm) : '',
  vocal: typeof song.references?.vocal?.bpm === 'number' ? String(song.references.vocal.bpm) : ''
});

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT';
};

const TapTempoButton = React.forwardRef<TapTempoButtonHandle, TapTempoButtonProps>(({ language, onApply, onActivate }, ref) => {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const tapTimesRef = React.useRef<number[]>([]);
  const detectedBpmRef = React.useRef<number | null>(null);
  const displayedBpmRef = React.useRef<number | null>(null);
  const applyTimeoutRef = React.useRef<number | null>(null);
  const displayFrameRef = React.useRef<number | null>(null);
  const onApplyRef = React.useRef(onApply);
  const [displayedBpm, setDisplayedBpm] = React.useState<number | null>(null);

  React.useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  React.useEffect(() => () => {
    if (applyTimeoutRef.current !== null) {
      window.clearTimeout(applyTimeoutRef.current);
    }
    if (displayFrameRef.current !== null) {
      window.cancelAnimationFrame(displayFrameRef.current);
    }
  }, []);

  const updateDisplayedBpm = React.useCallback((bpm: number | null) => {
    if (displayedBpmRef.current === bpm) {
      return;
    }

    displayedBpmRef.current = bpm;
    if (displayFrameRef.current !== null) {
      window.cancelAnimationFrame(displayFrameRef.current);
    }

    displayFrameRef.current = window.requestAnimationFrame(() => {
      setDisplayedBpm(displayedBpmRef.current);
      displayFrameRef.current = null;
    });
  }, []);

  const handleTap = React.useCallback((eventTimeStamp?: number) => {
    const now = getTapTimestamp(eventTimeStamp);
    buttonRef.current?.animate([
      {
        transform: 'scale(0.94)',
        backgroundColor: '#ecfdf5',
        borderColor: '#6ee7b7',
        color: '#047857',
        boxShadow: '0 0 0 3px rgba(167, 243, 208, 0.9)'
      },
      {
        transform: 'scale(1)',
        backgroundColor: '#ffffff',
        borderColor: '#d1d5db',
        color: '#4b5563',
        boxShadow: '0 0 0 0 rgba(167, 243, 208, 0)'
      }
    ], {
      duration: 150,
      easing: 'ease-out'
    });

    const recentTaps = tapTimesRef.current.filter((time) => now - time < TAP_RESET_AFTER_MS);
    const nextTaps = [...recentTaps, now].slice(-TAP_MAX_SAMPLES);
    tapTimesRef.current = nextTaps;

    const nextBpm = getStableTapBpm(nextTaps, detectedBpmRef.current);
    if (nextBpm === null) {
      detectedBpmRef.current = null;
      updateDisplayedBpm(null);
      return;
    }

    if (nextBpm !== detectedBpmRef.current) {
      detectedBpmRef.current = nextBpm;
      updateDisplayedBpm(nextBpm);
    }

    if (applyTimeoutRef.current !== null) {
      window.clearTimeout(applyTimeoutRef.current);
    }

    applyTimeoutRef.current = window.setTimeout(() => {
      if (detectedBpmRef.current !== null) {
        onApplyRef.current(detectedBpmRef.current);
      }
      applyTimeoutRef.current = null;
    }, TAP_APPLY_IDLE_MS);
  }, [updateDisplayedBpm]);

  React.useImperativeHandle(ref, () => ({
    tap: handleTap
  }), [handleTap]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        onActivate?.();
        handleTap(event.timeStamp);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        onActivate?.();
        handleTap(event.timeStamp);
      }}
      onFocus={onActivate}
      className="inline-flex h-7 w-full min-w-[4.5rem] items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-[11px] font-bold tabular-nums text-gray-600 transition-colors duration-75 hover:border-indigo-200 hover:text-indigo-700 active:scale-95 active:border-emerald-300 active:bg-emerald-50 active:text-emerald-700 active:ring-2 active:ring-emerald-100"
      title={language === 'zh' ? '跟著音樂按下節拍，自動套用 BPM' : 'Press with the music to apply BPM'}
    >
      {displayedBpm ?? 'TAP'}
    </button>
  );
});

TapTempoButton.displayName = 'TapTempoButton';

const SongMetadataPanel: React.FC<SongMetadataPanelProps> = ({
  song,
  language,
  onChange,
  metadataSuggestions,
  title,
  keyValue,
  capoValue,
  onKeyChange,
  onCapoChange,
  displayMode,
  onDisplayModeChange,
  jianpuInputAbsolute,
  onJianpuInputAbsoluteChange,
  showReferenceFields = true,
  variant = 'default',
  deviceLayout = 'desktop',
  initialFocusField,
  canEditKey = true
}) => {
  const copy = getUiCopy(language);
  const panelRef = React.useRef<HTMLElement>(null);
  const metadataInputId = React.useId();
  const [tempoDraft, setTempoDraft] = React.useState(typeof song.tempo === 'number' ? String(song.tempo) : '');
  const [referenceBpmDrafts, setReferenceBpmDrafts] = React.useState<Record<SongReferenceKind, string>>(() => getReferenceBpmDrafts(song));
  const [activeReferenceTapKind, setActiveReferenceTapKind] = React.useState<SongReferenceKind>('band');
  const [layoutMode, setLayoutMode] = React.useState<MetadataLayoutMode>('wide');
  // Keep only the core fields visible by default; everything else lives in a
  // collapsible "advanced" block so the panel stays compact on small laptops.
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);
  const bandTapButtonRef = React.useRef<TapTempoButtonHandle>(null);
  const vocalTapButtonRef = React.useRef<TapTempoButtonHandle>(null);
  const referenceBpmCommitTimeoutsRef = React.useRef<Record<SongReferenceKind, number | null>>({
    band: null,
    vocal: null
  });
  const timeSignatureParts = splitTimeSignatureInput(song.timeSignature);
  const resolvedKey = keyValue ?? song.originalKey;
  const resolvedCapo = capoValue ?? (song.capo ?? 0);
  const isPreviewHeader = variant === 'preview-header';
  const isTouchOptimized = isPreviewHeader && deviceLayout !== 'desktop';
  const isPhonePreviewHeader = isPreviewHeader && deviceLayout === 'phone';
  const isWideLayout = layoutMode === 'wide';
  const isStackedLayout = layoutMode === 'stacked';
  const segmentedSize = isStackedLayout ? 'sm' : 'xs';
  const toggleSize = isStackedLayout ? 'sm' : 'xs';
  const labelClassName = isPhonePreviewHeader
    ? 'mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400'
    : `${isTouchOptimized ? 'text-[11px]' : 'text-[9px]'} mb-1 block font-semibold uppercase tracking-[0.16em] text-gray-400`;
  const controlLabelClassName = 'mb-1 block text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-400';
  const fieldHeightClassName = isTouchOptimized ? 'h-11' : isPreviewHeader ? 'h-10' : 'h-7';
  const fieldClassName = `${fieldHeightClassName} w-full rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-800 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500`;
  const controlFieldClassName = 'h-7 w-full rounded-lg border border-gray-300 bg-white px-2 text-[12px] font-medium text-gray-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500';

  React.useEffect(() => {
    const node = panelRef.current;
    if (!node) return;

    const updateLayoutMode = () => {
      const width = node.clientWidth || node.getBoundingClientRect().width || 0;
      setLayoutMode((current) => {
        const nextMode = getMetadataLayoutMode(width);
        return current === nextMode ? current : nextMode;
      });
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateLayoutMode);
    });

    observer.observe(node);
    updateLayoutMode();

    return () => {
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (!isPreviewHeader || !initialFocusField) {
      return;
    }

    const focusField = () => {
      const field = panelRef.current?.querySelector<HTMLElement>(`[data-song-metadata-field="${initialFocusField}"]`);
      const control = field?.querySelector<HTMLElement>('input:not([type="hidden"]), button, select, textarea');
      if (!control) return;
      control.focus({ preventScroll: true });
      if (control instanceof HTMLInputElement && control.type !== 'checkbox') {
        control.select();
      }
      if (typeof field.scrollIntoView === 'function') {
        field.scrollIntoView({ block: 'nearest' });
      }
    };

    focusField();
    const frameId = window.requestAnimationFrame(focusField);
    const timeoutId = window.setTimeout(focusField, 80);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [initialFocusField, isPreviewHeader]);

  React.useEffect(() => {
    setTempoDraft(typeof song.tempo === 'number' ? String(song.tempo) : '');
  }, [song.tempo]);

  React.useEffect(() => {
    setReferenceBpmDrafts(getReferenceBpmDrafts(song));
  }, [song.id, song.references?.band?.bpm, song.references?.vocal?.bpm]);

  React.useEffect(() => () => {
    (['band', 'vocal'] as SongReferenceKind[]).forEach((kind) => {
      const timeout = referenceBpmCommitTimeoutsRef.current[kind];
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    });
  }, []);

  React.useEffect(() => {
    if (!showReferenceFields) {
      return;
    }

    const handleReferenceTapKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 't'
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      const activeTapButton = activeReferenceTapKind === 'vocal'
        ? vocalTapButtonRef.current
        : bandTapButtonRef.current;
      const fallbackTapButton = activeReferenceTapKind === 'vocal'
        ? bandTapButtonRef.current
        : vocalTapButtonRef.current;
      const tapButton = activeTapButton ?? fallbackTapButton;
      if (!tapButton) {
        return;
      }

      event.preventDefault();
      tapButton.tap(event.timeStamp);
    };

    window.addEventListener('keydown', handleReferenceTapKeyDown);
    return () => window.removeEventListener('keydown', handleReferenceTapKeyDown);
  }, [activeReferenceTapKind, showReferenceFields]);

  const commitTempoDraft = React.useCallback(() => {
    const digitsOnly = tempoDraft.replace(/\D+/g, '').slice(0, 3);
    const parsedTempo = digitsOnly ? Number(digitsOnly) : undefined;
    onChange({
      ...song,
      tempo: parsedTempo === undefined ? undefined : Math.min(400, Math.max(20, parsedTempo))
    });
  }, [onChange, song, tempoDraft]);

  const updateField = <K extends keyof Song>(field: K, value: Song[K]) => {
    onChange({ ...song, [field]: value });
  };

  const updateReference = (kind: SongReferenceKind, updates: Partial<SongReference>) => {
    const currentReferences = song.references ?? {};
    const currentReference = currentReferences[kind] ?? {};
    const nextReference = { ...currentReference, ...updates };
    const cleanReference: SongReference = {};

    if (nextReference.url?.trim()) {
      cleanReference.url = nextReference.url;
    }

    if (nextReference.key) {
      cleanReference.key = nextReference.key;
    }

    if (typeof nextReference.bpm === 'number') {
      cleanReference.bpm = nextReference.bpm;
    }

    const nextReferences = { ...currentReferences };
    if (cleanReference.url || cleanReference.key || typeof cleanReference.bpm === 'number') {
      nextReferences[kind] = cleanReference;
    } else {
      delete nextReferences[kind];
    }

    onChange({
      ...song,
      references: nextReferences.band || nextReferences.vocal ? nextReferences : undefined
    });
  };

  const commitReferenceBpmDraft = (kind: SongReferenceKind, draft: string) => {
    const currentTimeout = referenceBpmCommitTimeoutsRef.current[kind];
    if (currentTimeout !== null) {
      window.clearTimeout(currentTimeout);
      referenceBpmCommitTimeoutsRef.current[kind] = null;
    }

    const digitsOnly = draft.replace(/\D+/g, '').slice(0, 3);
    updateReference(kind, { bpm: digitsOnly ? Number(digitsOnly) : undefined });
  };

  const scheduleReferenceBpmCommit = (kind: SongReferenceKind, draft: string, delay: number) => {
    const currentTimeout = referenceBpmCommitTimeoutsRef.current[kind];
    if (currentTimeout !== null) {
      window.clearTimeout(currentTimeout);
    }

    referenceBpmCommitTimeoutsRef.current[kind] = window.setTimeout(() => {
      commitReferenceBpmDraft(kind, draft);
      referenceBpmCommitTimeoutsRef.current[kind] = null;
    }, delay);
  };

  const updateReferenceBpmDraft = (kind: SongReferenceKind, draft: string, delay: number) => {
    const digitsOnly = draft.replace(/\D+/g, '').slice(0, 3);
    setReferenceBpmDrafts((current) => (
      current[kind] === digitsOnly ? current : { ...current, [kind]: digitsOnly }
    ));
    scheduleReferenceBpmCommit(kind, digitsOnly, delay);
  };

  const renderReferenceEditor = (kind: SongReferenceKind) => {
    const reference = song.references?.[kind] ?? {};
    const bpmDraft = referenceBpmDrafts[kind] ?? '';
    const url = reference.url ?? '';
    const videoId = parseYouTubeVideoId(url);
    const hasInvalidUrl = url.trim().length > 0 && !videoId;
    const label = language === 'zh'
      ? kind === 'band' ? '樂團版本' : '歌手版本'
      : kind === 'band' ? 'Band Version' : 'Vocal Version';

    return (
      <div className="grid grid-cols-12 items-center gap-1.5">
        <div className="col-span-12 flex min-w-0 items-center gap-1.5 sm:col-span-12 lg:col-span-2">
          <div className="min-w-0 truncate text-[11px] font-bold text-gray-600">{label}</div>
          {hasInvalidUrl ? (
            <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600 ring-1 ring-rose-100">
              {language === 'zh' ? '無效' : 'Invalid'}
            </span>
          ) : videoId ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              YouTube
            </span>
          ) : null}
        </div>

        <div className="col-span-12 grid grid-cols-12 gap-1.5 lg:col-span-10">
          <input
            type="url"
            value={url}
            onChange={(event) => updateReference(kind, { url: event.target.value })}
            placeholder={language === 'zh' ? '貼上 YouTube 連結' : 'Paste YouTube URL'}
            className="col-span-12 h-7 min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-[12px] font-medium text-gray-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 sm:col-span-6 xl:col-span-7"
          />

          <div className="col-span-4 sm:col-span-2">
            <KeyPicker
              value={reference.key ?? null}
              onChange={(key) => updateReference(kind, { key: key ?? undefined })}
              label={language === 'zh' ? 'Reference 調性' : 'Reference Key'}
              originalKey={song.originalKey}
              clearLabel={language === 'zh' ? '清除' : 'Clear'}
              align="left"
              triggerDensity="compact"
              buttonClassName="h-7 w-full min-w-0 rounded-lg px-2"
              valueTextClassName="text-[12px]"
              metaTextClassName="hidden"
              triggerIconSize={13}
            />
          </div>

          <input
            type="number"
            min={20}
            max={400}
            step={1}
            value={bpmDraft}
            onChange={(event) => {
              updateReferenceBpmDraft(kind, event.target.value, REFERENCE_BPM_INPUT_COMMIT_DELAY_MS);
            }}
            onBlur={() => commitReferenceBpmDraft(kind, referenceBpmDrafts[kind] ?? '')}
            placeholder="BPM"
            className="col-span-4 h-7 min-w-[4.75rem] rounded-lg border border-gray-300 bg-white px-2 text-[12px] font-medium text-gray-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 sm:col-span-2 xl:col-span-1"
          />

          <div className="col-span-4 sm:col-span-2">
            <TapTempoButton
              ref={kind === 'band' ? bandTapButtonRef : vocalTapButtonRef}
              language={language}
              onActivate={() => setActiveReferenceTapKind((current) => current === kind ? current : kind)}
              onApply={(bpm) => updateReferenceBpmDraft(kind, String(bpm), REFERENCE_BPM_TAP_COMMIT_DELAY_MS)}
            />
          </div>
        </div>
      </div>
    );
  };

  const displayModeOptions = DISPLAY_MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: language === 'zh'
      ? (
          mode === 'nashville-number-system'
            ? '級數'
            : mode === 'chord-fixed-key'
              ? '固定'
              : '首調'
        )
      : isWideLayout
        ? (
            mode === 'nashville-number-system'
              ? 'Nashville'
              : mode === 'chord-fixed-key'
                ? 'Fixed'
                : 'Movable'
          )
        : (
            mode === 'nashville-number-system'
              ? 'NNS'
              : mode === 'chord-fixed-key'
                ? 'Fixed'
                : 'Move'
          )
  }));

  const barNumberOptions = BAR_NUMBER_OPTIONS.map((mode) => ({
    value: mode,
    label: language === 'zh'
      ? (
          mode === 'none'
            ? '不顯示'
            : mode === 'line-start'
              ? '行首'
              : '每小節'
        )
      : (
          mode === 'none'
            ? 'Off'
            : mode === 'line-start'
              ? 'Line'
              : 'All'
        )
  }));

  const titleField = (
    <div data-song-metadata-field="title">
      <label className={labelClassName}>{copy.editor.title}</label>
      <input
        type="text"
        value={song.title}
        onChange={(event) => updateField('title', event.target.value)}
        onBlur={(event) => {
          const formattedTitle = formatMetadataText(event.target.value);
          if (formattedTitle !== song.title) {
            updateField('title', formattedTitle);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.currentTarget.blur();
          }
        }}
        className={`${fieldClassName} font-semibold`}
      />
    </div>
  );

  const keyField = (
    <div data-song-metadata-field="key">
      <label className={labelClassName}>{copy.key}</label>
      <KeyPicker
        value={resolvedKey}
        disabled={!canEditKey}
        onChange={(key) => {
          if (!key) {
            return;
          }

          if (onKeyChange) {
            onKeyChange(key);
            return;
          }

          updateField('originalKey', key);
        }}
        label={copy.key}
        originalKey={song.originalKey}
        panelMetaText={song.originalKey === resolvedKey ? copy.original : song.originalKey}
        align="left"
        triggerDensity="compact"
        autoOpen={isPreviewHeader && initialFocusField === 'key'}
        touchOptimized={isTouchOptimized}
        buttonClassName={`${isTouchOptimized ? '!h-11' : isPreviewHeader ? '!h-10' : 'h-7'} w-full min-w-0 rounded-lg px-2.5`}
        valueTextClassName="text-[13px]"
        metaTextClassName={isWideLayout ? '' : 'hidden'}
        triggerIconSize={14}
      />
    </div>
  );

  const capoField = (
    <div data-song-metadata-field="capo">
      <label className={labelClassName}>Capo</label>
      <CapoPicker
        value={resolvedCapo}
        currentKey={resolvedKey}
        onChange={(capo) => {
          if (onCapoChange) {
            onCapoChange(capo);
            return;
          }

          updateField('capo', capo);
        }}
        label="Capo"
        align="left"
        triggerDensity="compact"
        autoOpen={isPreviewHeader && initialFocusField === 'capo'}
        touchOptimized={isTouchOptimized}
        buttonClassName={`${isTouchOptimized ? '!h-11' : isPreviewHeader ? '!h-10' : 'h-7'} w-full min-w-0 rounded-lg px-2.5`}
        valueTextClassName="text-[13px]"
        showPlayKey={isWideLayout}
        triggerIconSize={14}
      />
    </div>
  );

  const tempoField = (
    <div data-song-metadata-field="tempo">
      <label className={labelClassName}>{copy.editor.tempo}</label>
      <input
        type={isPreviewHeader ? 'text' : 'number'}
        inputMode="numeric"
        pattern="[0-9]*"
        min={20}
        max={400}
        step={1}
        value={tempoDraft}
        onChange={(event) => setTempoDraft(event.target.value.replace(/\D+/g, '').slice(0, 3))}
        onBlur={commitTempoDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitTempoDraft();
            event.currentTarget.blur();
          }
        }}
        className={fieldClassName}
      />
    </div>
  );

  const timeField = (
    <div data-song-metadata-field="timeSignature">
      <label className={labelClassName}>{copy.editor.timeSignature}</label>
      <div className={`flex min-w-0 items-center rounded-lg border border-gray-300 bg-white px-2 ${fieldHeightClassName}`}>
        <input
          type="text"
          inputMode="numeric"
          value={timeSignatureParts.numerator}
          onChange={(event) => updateField('timeSignature', buildTimeSignatureInput(event.target.value, timeSignatureParts.denominator))}
          placeholder="4"
          className="h-full w-full border-0 bg-transparent px-1 text-center text-[13px] font-semibold text-gray-800 outline-none focus:ring-0"
        />
        <span className="px-0.5 text-sm font-semibold text-gray-400">/</span>
        <input
          type="text"
          inputMode="numeric"
          value={timeSignatureParts.denominator}
          onChange={(event) => updateField('timeSignature', buildTimeSignatureInput(timeSignatureParts.numerator, event.target.value))}
          placeholder="4"
          className="h-full w-full border-0 bg-transparent px-1 text-center text-[13px] font-semibold text-gray-800 outline-none focus:ring-0"
        />
      </div>
    </div>
  );

  const shuffleField = (
    <div data-song-metadata-field="groove">
      <label className={labelClassName}>{copy.editor.shuffle}</label>
      <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2.5 ${fieldHeightClassName}`}>
        <span className="truncate text-[12px] font-medium text-gray-600">{copy.editor.shuffle}</span>
        <input
          type="checkbox"
          checked={song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle'}
          onChange={(event) => onChange({ ...song, shuffle: event.target.checked, groove: undefined })}
          className={`${isTouchOptimized ? 'h-5 w-5' : 'h-3.5 w-3.5'} shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500`}
        />
      </label>
    </div>
  );

  const versionField = (
    <div data-song-metadata-field="credits">
      <label className={labelClassName}>{copy.version}</label>
      <input
        type="text"
        list={metadataSuggestions?.versions.length ? `${metadataInputId}-versions` : undefined}
        value={getVersionValue(song)}
        onChange={(event) => onChange({ ...song, lyricist: event.target.value, composer: '' })}
        onBlur={(event) => {
          const formattedVersion = formatMetadataText(event.target.value);
          if (formattedVersion !== getVersionValue(song)) {
            onChange({ ...song, lyricist: formattedVersion, composer: '' });
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.currentTarget.blur();
          }
        }}
        className={fieldClassName}
      />
      {metadataSuggestions?.versions.length ? (
        <datalist id={`${metadataInputId}-versions`}>
          {metadataSuggestions.versions.map((version) => (
            <option key={version} value={version} />
          ))}
        </datalist>
      ) : null}
    </div>
  );

  const translatorField = (
    <div data-song-metadata-field="translator">
      <label className={labelClassName}>{copy.editor.translator}</label>
      <input
        type="text"
        list={metadataSuggestions?.translators.length ? `${metadataInputId}-translators` : undefined}
        value={song.translator || ''}
        onChange={(event) => updateField('translator', event.target.value)}
        onBlur={(event) => {
          const formattedTranslator = formatMetadataText(event.target.value);
          if (formattedTranslator !== (song.translator || '')) {
            updateField('translator', formattedTranslator);
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.currentTarget.blur();
          }
        }}
        className={fieldClassName}
      />
      {metadataSuggestions?.translators.length ? (
        <datalist id={`${metadataInputId}-translators`}>
          {metadataSuggestions.translators.map((translator) => (
            <option key={translator} value={translator} />
          ))}
        </datalist>
      ) : null}
    </div>
  );

  const displayModeField = (
    <div>
      <label className={controlLabelClassName}>{copy.setlistEditor.displaySettings}</label>
      <CompactSegmentedControl
        value={displayMode ?? 'chord-movable-key'}
        options={displayModeOptions}
        onChange={(mode) => onDisplayModeChange?.(mode)}
        size={segmentedSize}
        stretch
        className="rounded-lg"
        buttonClassName="min-w-0"
      />
    </div>
  );

  // In the song library, the panel offers a jianpu *input* setting (固定/首調)
  // instead of a display control, and hides Capo — both live in the top-right
  // toolbar there, so repeating them in the editor only wastes space.
  const isLibraryInputMode = Boolean(onJianpuInputAbsoluteChange);

  const jianpuInputField = (
    <div>
      <label className={controlLabelClassName}>{language === 'zh' ? '簡譜輸入設定' : 'Jianpu Input'}</label>
      <CompactSegmentedControl
        value={jianpuInputAbsolute ? 'fixed' : 'movable'}
        options={[
          { value: 'movable', label: language === 'zh' ? '首調' : 'Movable' },
          { value: 'fixed', label: language === 'zh' ? '固定' : 'Fixed' }
        ]}
        onChange={(value) => onJianpuInputAbsoluteChange?.(value === 'fixed')}
        size={segmentedSize}
        stretch
        className="rounded-lg"
        buttonClassName="min-w-0"
      />
    </div>
  );

  // The control that sits where the display-mode field used to be.
  const displayOrInputField = isLibraryInputMode ? jianpuInputField : displayModeField;

  const barNumbersField = (
    <div>
      <label className={controlLabelClassName}>{copy.editor.barNumbers}</label>
      <CompactSegmentedControl
        value={song.barNumberMode ?? 'none'}
        options={barNumberOptions}
        onChange={(mode) => updateField('barNumberMode', mode)}
        size={segmentedSize}
        stretch
        className="rounded-lg"
        buttonClassName="min-w-0"
      />
    </div>
  );

  const referencesField = (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-2.5 py-2">
      <div className="flex items-center gap-2 px-0.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">{language === 'zh' ? '參考音源' : 'Reference'}</div>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <div className="mt-1.5 space-y-1.5">
        {renderReferenceEditor('band')}
        {renderReferenceEditor('vocal')}
      </div>
    </div>
  );

  // Whether any of the collapsed advanced fields actually hold a value, so the
  // toggle can hint that there's hidden content even while collapsed.
  const hasAdvancedValues = Boolean(
    getVersionValue(song)?.trim()
    || typeof song.tempo === 'number'
    || song.shuffle
    || song.references?.band?.url?.trim()
    || song.references?.vocal?.url?.trim()
  );

  const advancedToggle = (
    <button
      type="button"
      onClick={() => setIsAdvancedOpen((current) => !current)}
      aria-expanded={isAdvancedOpen}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 transition-colors hover:bg-gray-100"
    >
      <span className="flex items-center gap-1.5">
        {language === 'zh' ? '進階設定' : 'Advanced'}
        {hasAdvancedValues && !isAdvancedOpen ? (
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden />
        ) : null}
      </span>
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );

  if (isPreviewHeader) {
    if (isPhonePreviewHeader) {
      return (
        <section
          ref={panelRef}
          data-song-metadata-panel
          data-device-layout={deviceLayout}
          className="grid grid-cols-6 gap-x-2 gap-y-2"
        >
          <div className="col-span-6">{titleField}</div>
          <div className="col-span-3">{versionField}</div>
          <div className="col-span-3">{translatorField}</div>
          <div className="col-span-3">{keyField}</div>
          <div className="col-span-3">{capoField}</div>
          <div className="col-span-2">{tempoField}</div>
          <div className="col-span-2">{timeField}</div>
          <div className="col-span-2">{shuffleField}</div>
        </section>
      );
    }

    const twoColumn = deviceLayout !== 'phone';
    return (
      <section
        ref={panelRef}
        data-song-metadata-panel
        data-device-layout={deviceLayout}
        className={twoColumn ? 'grid grid-cols-2 gap-x-3 gap-y-3' : 'space-y-3'}
      >
        <div className={twoColumn ? 'col-span-2' : undefined}>{titleField}</div>
        {versionField}
        {translatorField}
        {keyField}
        {capoField}
        {tempoField}
        {timeField}
        <div className={twoColumn ? 'col-span-2' : undefined}>{shuffleField}</div>
      </section>
    );
  }

  return (
    <section
      ref={panelRef}
      className={`border border-gray-200 bg-white shadow-sm ${
        isWideLayout ? 'rounded-[18px] px-3.5 py-2.5' : 'rounded-xl px-3 py-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="text-sm font-bold text-gray-900">{title || copy.editor.editSong}</div>
        <div className="rounded-full border border-stone-200 bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
          {copy.editor.originalKey}: {song.originalKey}
        </div>
      </div>

      {isWideLayout ? (
        <div className="mt-1.5 space-y-1.5">
          <div className="grid items-start gap-2 [grid-template-columns:minmax(0,2.6fr)_minmax(5rem,0.9fr)_minmax(4.5rem,0.8fr)_minmax(5.5rem,1fr)_minmax(6rem,1.05fr)]">
            {titleField}
            {keyField}
            {tempoField}
            {timeField}
            {shuffleField}
          </div>

          {advancedToggle}

          {isAdvancedOpen ? (
            <div className="space-y-1.5">
              <div className={`grid gap-2 ${isLibraryInputMode
                ? '[grid-template-columns:minmax(6rem,1fr)_minmax(6rem,1fr)]'
                : '[grid-template-columns:minmax(6rem,1fr)_minmax(6rem,1fr)_minmax(4.5rem,0.7fr)]'}`}>
                {versionField}
                {translatorField}
                {!isLibraryInputMode && capoField}
              </div>

              <div className="grid items-start gap-2 [grid-template-columns:minmax(7rem,1.4fr)_minmax(7rem,1.2fr)]">
                {displayOrInputField}
                {barNumbersField}
              </div>

              {showReferenceFields ? referencesField : null}
            </div>
          ) : null}
        </div>
      ) : isStackedLayout ? (
        <div className="mt-2 space-y-2">
          {titleField}

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">{keyField}</div>
            <div className="col-span-4">{tempoField}</div>
            <div className="col-span-4">{timeField}</div>
          </div>

          {shuffleField}

          {advancedToggle}

          {isAdvancedOpen ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {versionField}
                {translatorField}
              </div>

              {!isLibraryInputMode && capoField}

              {displayOrInputField}
              {barNumbersField}
              {showReferenceFields ? referencesField : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">{titleField}</div>
            <div className="col-span-2">{keyField}</div>
            <div className="col-span-2">{tempoField}</div>
            <div className="col-span-2">{timeField}</div>
            <div className="col-span-2">{shuffleField}</div>
          </div>

          {advancedToggle}

          {isAdvancedOpen ? (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2">
                <div className={isLibraryInputMode ? 'col-span-6' : 'col-span-4'}>{versionField}</div>
                <div className={isLibraryInputMode ? 'col-span-6' : 'col-span-4'}>{translatorField}</div>
                {!isLibraryInputMode && <div className="col-span-4">{capoField}</div>}
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">{displayOrInputField}</div>
                <div className="col-span-6">{barNumbersField}</div>
              </div>

              {showReferenceFields ? referencesField : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};

export default SongMetadataPanel;
