import React from 'react';
import { X } from 'lucide-react';
import type { AppLanguage, Key, Song } from '../types';
import type { ChordSheetMetaField, PreviewAnchorRect } from './ChordSheet';
import KeyPicker from './KeyPicker';
import CapoPicker from './CapoPicker';
import { getUiCopy } from '../constants/i18n';
import { formatInitialCaps } from '../utils/textUtils';
import { formatTempoBpm, normalizeTempoBpm, sanitizeTempoInput } from '../utils/tempoUtils';
import { getChordFontFamily } from '../constants/chordFonts';
import SongMetadataPanel from './SongMetadataPanel';
import type { PreviewEditorDeviceLayout } from '../lib/previewEditorLayout';

export interface PreviewWysiwygTarget {
  field: ChordSheetMetaField;
  anchorRect: PreviewAnchorRect;
  anchorKey: string;
  previewIdentity: string | null;
}

interface TempoOverlayLayout {
  containerLeft: number;
  containerWidth: number;
  valueLeft: number;
  valueWidth: number;
}

interface PreviewWysiwygEditorProps {
  song: Song;
  language: AppLanguage;
  target: PreviewWysiwygTarget;
  deviceLayout: PreviewEditorDeviceLayout;
  currentKey: Key;
  currentCapo: number;
  originalKey: Key | null;
  canEditKey?: boolean;
  metadataKeyValue?: Key;
  onMetadataKeyChange?: (key: Key) => void;
  metadataSuggestions?: {
    versions: string[];
    translators: string[];
  };
  jianpuInputAbsolute?: boolean;
  onJianpuInputAbsoluteChange?: (value: boolean) => void;
  showReferenceFields?: boolean;
  onChange: (song: Song) => void;
  onKeyChange: (key: Key) => void;
  onCapoChange: (capo: number) => void;
  onClose: () => void;
}

const COMMON_TIME_DENOMINATORS = [2, 4, 8, 16];
const VALUE_OVERLAY_FIELDS = new Set<ChordSheetMetaField>(['key', 'performanceKey', 'tempo', 'timeSignature']);
const TEMPO_STEP_BUTTON_SIZE = 16;
const TEMPO_STEP_GAP = 2;
const TEMPO_STEP_CONTROLS_WIDTH = TEMPO_STEP_BUTTON_SIZE * 2 + TEMPO_STEP_GAP * 2;

const getTempoValueWidth = (anchorRect: PreviewAnchorRect, value: string) => {
  const digitCount = value.replace(/[^\d.]+/g, '').length;
  return Math.max(anchorRect.width, digitCount >= 5 ? 54 : digitCount >= 3 ? 44 : digitCount === 1 ? 20 : 30);
};

const getTempoEditBounds = (anchorKey: string, fallbackLeft: number, fallbackRight: number) => {
  if (typeof document === 'undefined') {
    return { left: fallbackLeft, right: fallbackRight };
  }

  const hitKey = anchorKey.endsWith('|value') ? anchorKey.slice(0, -6) : anchorKey;
  const hitElement = Array.from(document.querySelectorAll<HTMLElement>('[data-preview-edit-hit]'))
    .find((element) => element.dataset.previewEditHit === hitKey);
  if (!hitElement) {
    return { left: fallbackLeft, right: fallbackRight };
  }

  const previousRect = hitElement.previousElementSibling?.getBoundingClientRect();
  const nextRect = hitElement.nextElementSibling?.getBoundingClientRect();
  const hitRect = hitElement.getBoundingClientRect();

  return {
    left: previousRect ? previousRect.right + 2 : Math.min(fallbackLeft, hitRect.left),
    right: nextRect ? nextRect.left - 2 : Math.max(fallbackRight, hitRect.right)
  };
};

const getDesktopPosition = (anchorRect: PreviewAnchorRect, field: ChordSheetMetaField): React.CSSProperties => {
  if (typeof window === 'undefined') {
    return { left: anchorRect.left, top: anchorRect.top, width: Math.max(220, anchorRect.width) };
  }

  const margin = 12;
  const minimumWidth = field === 'metadata'
    ? 900
    : field === 'title'
    ? 280
    : field === 'credits'
      ? 520
      : 220;
  const width = Math.min(
    Math.max(minimumWidth, anchorRect.width + (field === 'title' ? 32 : 24)),
    Math.max(minimumWidth, window.innerWidth - margin * 2)
  );
  const left = Math.min(
    Math.max(margin, field === 'metadata' ? anchorRect.right - width : anchorRect.left),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const estimatedHeight = field === 'metadata' ? 560 : field === 'credits' ? 170 : 150;
  const availableBelow = window.innerHeight - anchorRect.bottom - margin;
  const top = field === 'metadata'
    ? availableBelow >= estimatedHeight
      ? anchorRect.bottom + 8
      : Math.max(margin, Math.min(anchorRect.top - estimatedHeight - 8, window.innerHeight - estimatedHeight - margin))
    : Math.min(
        Math.max(margin, anchorRect.top - 8),
        Math.max(margin, window.innerHeight - estimatedHeight - margin)
      );

  return { left, top, width };
};

const getInlinePosition = (
  anchorRect: PreviewAnchorRect,
  field: ChordSheetMetaField,
  inlineValue = '',
  anchorKey = ''
): React.CSSProperties => {
  if (typeof window === 'undefined') {
    return { left: anchorRect.left, top: anchorRect.top, width: Math.max(220, anchorRect.width) };
  }

  const margin = 12;
  if (VALUE_OVERLAY_FIELDS.has(field)) {
    const tempoValueWidth = getTempoValueWidth(anchorRect, inlineValue);
    const preferredWidth = field === 'tempo'
      ? tempoValueWidth + TEMPO_STEP_CONTROLS_WIDTH
      : field === 'timeSignature'
        ? Math.max(anchorRect.width, 34)
        : Math.max(anchorRect.width, 1);
    const valueLeftOffset = field === 'tempo' ? TEMPO_STEP_CONTROLS_WIDTH : 0;
    const tempoBounds = field === 'tempo'
      ? getTempoEditBounds(anchorKey, anchorRect.right - tempoValueWidth - valueLeftOffset, anchorRect.right)
      : null;
    const minLeft = tempoBounds ? Math.max(margin, tempoBounds.left) : margin;
    const maxRight = tempoBounds ? Math.min(window.innerWidth - margin, tempoBounds.right) : window.innerWidth - margin;
    const width = Math.min(preferredWidth, Math.max(1, maxRight - minLeft));
    const height = Math.max(1, anchorRect.height);
    const preferredLeft = field === 'tempo'
      ? anchorRect.right - tempoValueWidth - valueLeftOffset
      : anchorRect.left;
    const left = Math.min(
      Math.max(minLeft, preferredLeft),
      Math.max(minLeft, maxRight - width)
    );
    const top = Math.min(
      Math.max(margin, anchorRect.top),
      Math.max(margin, window.innerHeight - height - margin)
    );

    return { left, top, width, height };
  }

  const preferredWidth = (() => {
    if (field === 'title') {
      return Math.max(260, anchorRect.width + 18);
    }
    if (field === 'credits') {
      return Math.max(148, Math.min(240, anchorRect.width * 1.05));
    }
    if (field === 'timeSignature') {
      return Math.max(34, anchorRect.width + 14);
    }
    if (field === 'tempo') {
      return Math.max(36, anchorRect.width + 14);
    }
    if (field === 'key') {
      return Math.max(30, Math.min(42, anchorRect.width + 18));
    }
    return Math.max(96, anchorRect.width + 18);
  })();
  const width = Math.min(preferredWidth, Math.max(96, window.innerWidth - margin * 2));
  const left = Math.min(
    Math.max(margin, anchorRect.left - 4),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const height = field === 'credits'
    ? 24
    : field === 'title'
      ? Math.max(34, anchorRect.height + 8)
      : Math.max(20, anchorRect.height + 8);
  const top = Math.min(
    Math.max(margin, field === 'title'
      ? anchorRect.top - 4
      : anchorRect.top - Math.max(2, (height - anchorRect.height) / 2)),
    Math.max(margin, window.innerHeight - height - margin)
  );

  return { left, top, width, height };
};

const getVersionValue = (song: Song) => (
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ')
);

const normalizeOptional = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const clampNumber = (value: number, min: number, max: number) => (
  Math.min(max, Math.max(min, value))
);

const sanitizeTimeSignatureText = (value: string) => {
  const cleaned = value.replace(/[^\d/]+/g, '');
  if (!cleaned.includes('/')) {
    return cleaned.replace(/\D+/g, '').slice(0, 4);
  }

  const [rawNumerator = '', ...rawDenominatorParts] = cleaned.split('/');
  const numerator = rawNumerator.replace(/\D+/g, '').slice(0, 2);
  const denominator = rawDenominatorParts.join('').replace(/\D+/g, '').slice(0, 2);
  return `${numerator}/${denominator}`;
};

const splitFuzzyTimeSignatureInput = (value: string) => {
  const cleaned = value.replace(/[^\d/]+/g, '');
  if (!cleaned) {
    return { numerator: '', denominator: '' };
  }

  if (cleaned.includes('/')) {
    const [rawNumerator = '', ...rawDenominatorParts] = cleaned.split('/');
    return {
      numerator: rawNumerator.replace(/\D+/g, '').slice(0, 2),
      denominator: rawDenominatorParts.join('').replace(/\D+/g, '').slice(0, 2)
    };
  }

  const digits = cleaned.replace(/\D+/g, '').slice(0, 4);
  if (digits.length < 2) {
    return { numerator: digits, denominator: '' };
  }
  if (digits.length === 2) {
    return {
      numerator: digits.slice(0, 1),
      denominator: digits.slice(1)
    };
  }
  if (digits.length === 3) {
    const trailingTwoDigits = digits.slice(1);
    if (COMMON_TIME_DENOMINATORS.includes(Number(trailingTwoDigits))) {
      return {
        numerator: digits.slice(0, 1),
        denominator: trailingTwoDigits
      };
    }

    return {
      numerator: digits.slice(0, 2),
      denominator: digits.slice(2)
    };
  }

  return {
    numerator: digits.slice(0, 2),
    denominator: digits.slice(2)
  };
};

const splitTimeSignatureDraft = (value: string) => {
  const normalizedValue = normalizeTimeSignature(value);
  const [rawNumerator = '', rawDenominator = ''] = (normalizedValue || value).split('/');
  return {
    numerator: rawNumerator.replace(/\D+/g, '').slice(0, 2),
    denominator: rawDenominator.replace(/\D+/g, '').slice(0, 2)
  };
};

const buildTimeSignatureDraft = (numeratorInput: string, denominatorInput: string) => {
  const numerator = numeratorInput.replace(/\D+/g, '').slice(0, 2);
  const denominator = denominatorInput.replace(/\D+/g, '').slice(0, 2);
  if (!numerator && !denominator) return '';
  return `${numerator}/${denominator}`;
};

const normalizeTimeSignature = (value: string) => {
  const { numerator, denominator } = splitFuzzyTimeSignatureInput(value);
  if (!numerator || !denominator) return '';
  return `${numerator}/${denominator}`;
};

export default function PreviewWysiwygEditor({
  song,
  language,
  target,
  deviceLayout,
  currentKey,
  currentCapo,
  originalKey,
  canEditKey = true,
  metadataKeyValue,
  onMetadataKeyChange,
  metadataSuggestions,
  jianpuInputAbsolute,
  onJianpuInputAbsoluteChange,
  showReferenceFields = true,
  onChange,
  onKeyChange,
  onCapoChange,
  onClose
}: PreviewWysiwygEditorProps) {
  const copy = getUiCopy(language);
  const zh = language === 'zh';
  const editorInputId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const cancelCloseRef = React.useRef(false);
  const finishedRef = React.useRef(false);
  const [titleDraft, setTitleDraft] = React.useState(song.title);
  const [versionDraft, setVersionDraft] = React.useState(getVersionValue(song));
  const [translatorDraft, setTranslatorDraft] = React.useState(song.translator ?? '');
  const [tempoDraft, setTempoDraft] = React.useState(formatTempoBpm(song.tempo));
  const [timeDraft, setTimeDraft] = React.useState(song.timeSignature);
  const usesMetadataPanel = target.field === 'metadata'
    || target.field === 'groove'
    || (deviceLayout !== 'desktop' && target.field !== 'performanceKey');
  const isTouchLayout = deviceLayout !== 'desktop';
  const [visualViewportState, setVisualViewportState] = React.useState(() => ({
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
    keyboardOffset: 0
  }));
  const editableMetadataKey = metadataKeyValue ?? currentKey;
  const metadataOriginalKey = metadataKeyValue ?? originalKey;
  const metadataKeyMetaText = metadataKeyValue ? copy.original : originalKey ?? undefined;
  const isPerformanceKeyField = target.field === 'performanceKey';
  const inlineKeyValue = isPerformanceKeyField ? currentKey : editableMetadataKey;
  const inlineKeyOriginalKey = isPerformanceKeyField ? (metadataKeyValue ?? originalKey) : metadataOriginalKey;
  const inlineKeyMetaText = isPerformanceKeyField
    ? (metadataKeyValue ?? originalKey ?? undefined)
    : metadataKeyMetaText;
  const handleMetadataKeyChange = React.useCallback((key: Key) => {
    if (onMetadataKeyChange) {
      onMetadataKeyChange(key);
      return;
    }
    onKeyChange(key);
  }, [onKeyChange, onMetadataKeyChange]);
  const handleInlineKeyChange = React.useCallback((key: Key) => {
    if (isPerformanceKeyField) {
      onKeyChange(key);
      return;
    }

    handleMetadataKeyChange(key);
  }, [handleMetadataKeyChange, isPerformanceKeyField, onKeyChange]);

  React.useEffect(() => {
    cancelCloseRef.current = false;
    finishedRef.current = false;
    setTitleDraft(song.title);
    setVersionDraft(getVersionValue(song));
    setTranslatorDraft(song.translator ?? '');
    setTempoDraft(formatTempoBpm(song.tempo));
    setTimeDraft(song.timeSignature);
  }, [song.composer, song.lyricist, song.tempo, song.timeSignature, song.title, song.translator, target.anchorKey, target.field]);

  React.useEffect(() => {
    if (usesMetadataPanel) {
      return;
    }
    const focusInput = () => {
      const input = panelRef.current?.querySelector<HTMLInputElement>('input[data-wysiwyg-autofocus]');
      if (!input) return;
      input.focus({ preventScroll: true });
      input.select();
    };
    focusInput();
    const frameId = window.requestAnimationFrame(focusInput);
    const timeoutId = window.setTimeout(focusInput, 80);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [target.anchorKey, target.field, usesMetadataPanel]);

  React.useEffect(() => {
    if (!usesMetadataPanel || !isTouchLayout || typeof window === 'undefined') {
      return;
    }

    const updateViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const keyboardOffset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setVisualViewportState((current) => (
        Math.abs(current.height - height) < 1 && Math.abs(current.keyboardOffset - keyboardOffset) < 1
          ? current
          : { height, keyboardOffset }
      ));
    };

    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [isTouchLayout, usesMetadataPanel]);

  const closeWithoutCommit = () => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    cancelCloseRef.current = true;
    onClose();
  };

  const markCommitted = () => {
    if (finishedRef.current || cancelCloseRef.current) {
      return false;
    }
    finishedRef.current = true;
    return true;
  };

  React.useEffect(() => {
    if (target.field !== 'key' && !usesMetadataPanel) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (panelRef.current?.contains(targetNode)) {
        return;
      }
      if (targetNode instanceof Element && targetNode.closest('[data-placement]')) {
        return;
      }
      closeWithoutCommit();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [target.field, usesMetadataPanel]);

  const commitTitle = () => {
    if (!markCommitted()) {
      return;
    }
    const nextTitle = formatInitialCaps(titleDraft).trim() || song.title;
    onChange({ ...song, title: nextTitle });
    onClose();
  };

  const commitCredits = () => {
    if (!markCommitted()) {
      return;
    }
    const nextVersion = formatInitialCaps(versionDraft).trim();
    const nextTranslator = formatInitialCaps(translatorDraft).trim();
    onChange({
      ...song,
      lyricist: normalizeOptional(nextVersion),
      composer: undefined,
      translator: normalizeOptional(nextTranslator)
    });
    onClose();
  };

  const commitTempo = () => {
    if (!markCommitted()) {
      return;
    }
    onChange({ ...song, tempo: normalizeTempoBpm(tempoDraft) });
    onClose();
  };

  const applyTempoValue = (value: number) => {
    const nextTempo = normalizeTempoBpm(value) ?? 120;
    setTempoDraft(formatTempoBpm(nextTempo));
    onChange({ ...song, tempo: nextTempo });
  };

  const applyTempoDelta = (delta: number) => {
    const currentTempo = normalizeTempoBpm(tempoDraft) ?? song.tempo ?? 120;
    applyTempoValue(currentTempo + delta);
  };

  const commitTimeSignature = () => {
    if (!markCommitted()) {
      return;
    }
    const normalized = normalizeTimeSignature(timeDraft);
    onChange({ ...song, timeSignature: normalized || song.timeSignature });
    onClose();
  };

  const applyTimeSignatureDraft = (nextDraft: string) => {
    const normalized = normalizeTimeSignature(nextDraft);
    setTimeDraft(nextDraft);
    if (normalized) {
      onChange({ ...song, timeSignature: normalized });
    }
  };

  const stepTimeSignaturePart = (part: 'numerator' | 'denominator', delta: number) => {
    const current = splitTimeSignatureDraft(timeDraft || song.timeSignature || '4/4');
    if (part === 'numerator') {
      const currentNumerator = Number(current.numerator) || 4;
      applyTimeSignatureDraft(buildTimeSignatureDraft(String(clampNumber(currentNumerator + delta, 1, 32)), current.denominator || '4'));
      return;
    }

    const currentDenominator = Number(current.denominator) || 4;
    const currentIndex = COMMON_TIME_DENOMINATORS.includes(currentDenominator)
      ? COMMON_TIME_DENOMINATORS.indexOf(currentDenominator)
      : COMMON_TIME_DENOMINATORS.reduce((bestIndex, denominator, index) => (
          Math.abs(denominator - currentDenominator) < Math.abs(COMMON_TIME_DENOMINATORS[bestIndex] - currentDenominator)
            ? index
            : bestIndex
        ), 0);
    const nextIndex = clampNumber(currentIndex + delta, 0, COMMON_TIME_DENOMINATORS.length - 1);
    applyTimeSignatureDraft(buildTimeSignatureDraft(current.numerator || '4', String(COMMON_TIME_DENOMINATORS[nextIndex])));
  };

  const handleEscape = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (event.target instanceof Element && event.target.closest('[data-placement]')) {
        return;
      }
      event.preventDefault();
      closeWithoutCommit();
    }
  };

  const inlineInputClassName = 'h-full min-w-0 rounded-sm border-0 bg-transparent px-1 font-semibold text-gray-950 outline-none ring-0';
  const inlineShellClassName = 'rounded-md bg-white/95 shadow-[0_0_0_2px_rgba(99,102,241,0.45),0_8px_18px_rgba(15,23,42,0.12)]';
  const metadataFontFamily = getChordFontFamily('stage-sans');
  const valueOverlayHeight = Math.max(1, target.anchorRect.height);
  const valueOverlayFontSize = Math.max(8, Math.min(16, valueOverlayHeight * 0.74));
  const valueOverlayTextStyle: React.CSSProperties = {
    fontFamily: metadataFontFamily,
    fontSize: `${valueOverlayFontSize}px`,
    fontWeight: 700,
    letterSpacing: '0.1em',
    lineHeight: `${valueOverlayHeight}px`
  };
  const valueOverlayShellClassName = 'h-full w-full rounded-[2px] bg-white/90 shadow-[0_0_0_1px_rgba(99,102,241,0.45),0_3px_10px_rgba(15,23,42,0.08)]';
  const versionListId = metadataSuggestions?.versions.length ? `${editorInputId}-versions` : undefined;
  const translatorListId = metadataSuggestions?.translators.length ? `${editorInputId}-translators` : undefined;

  const chrome = (children: React.ReactNode, title: string, fullMetadata = false) => (
    <div
      ref={panelRef}
      role={fullMetadata ? 'dialog' : undefined}
      aria-label={fullMetadata ? title : undefined}
      className={`flex max-h-full flex-col border border-gray-200 bg-white shadow-2xl ${isTouchLayout ? 'rounded-t-[24px] sm:rounded-[24px]' : 'rounded-xl'}`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={handleEscape}
    >
      <div className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 rounded-t-[inherit] border-b border-gray-100 bg-white ${deviceLayout === 'phone' && fullMetadata ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-bold text-gray-900">{title}</div>
          {fullMetadata ? (
            <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
              {copy.editor.originalKey}: {song.originalKey}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            closeWithoutCommit();
          }}
          onClick={(event) => event.preventDefault()}
          className={`${isTouchLayout ? 'h-11 min-w-11 px-3' : 'h-8 w-8'} inline-flex shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700`}
          title={zh ? '關閉' : 'Close'}
        >
          {fullMetadata && isTouchLayout ? (
            <span className="text-sm font-bold text-indigo-600">{zh ? '完成' : 'Done'}</span>
          ) : (
            <X size={16} />
          )}
        </button>
      </div>
      <div className={`${fullMetadata ? 'overflow-y-auto overscroll-contain' : ''} ${deviceLayout === 'phone' && fullMetadata ? 'p-3' : 'space-y-3 p-4'}`}>
        {children}
      </div>
    </div>
  );

  const renderTitle = () => {
    const inlineHeight = Math.max(34, target.anchorRect.height + 8);
    const inlineFontSize = Math.max(18, Math.min(34, target.anchorRect.height * 0.76));

    return (
      <div
        ref={panelRef}
        className={inlineShellClassName}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onKeyDown={handleEscape}
      >
        <input
          data-wysiwyg-autofocus
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commitTitle();
            }
          }}
          className="w-full rounded-md border-0 bg-transparent px-1.5 font-bold tracking-tight text-gray-950 outline-none"
          style={{
            height: inlineHeight,
            fontSize: inlineFontSize,
            lineHeight: `${inlineHeight}px`
          }}
        />
      </div>
    );
  };

  const renderCredits = () => (
    <form
      ref={panelRef}
      className={`${inlineShellClassName} flex h-6 items-center gap-0.5 p-0.5`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={handleEscape}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          commitCredits();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        commitCredits();
      }}
    >
      <div className="min-w-0 flex-1">
        <input
          data-wysiwyg-autofocus
          list={versionListId}
          value={versionDraft}
          onChange={(event) => setVersionDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commitCredits();
            }
          }}
          className={`${inlineInputClassName} w-full text-[10px]`}
          placeholder={zh ? '版本 / 詞曲' : 'Version / Credits'}
          aria-label={zh ? '版本 / 詞曲' : 'Version / Credits'}
        />
        {versionListId ? (
          <datalist id={versionListId}>
            {metadataSuggestions?.versions.map((version) => (
              <option key={version} value={version} />
            ))}
          </datalist>
        ) : null}
      </div>
      <div className="min-w-0 flex-[0.72]">
        <input
          list={translatorListId}
          value={translatorDraft}
          onChange={(event) => setTranslatorDraft(event.target.value)}
          className={`${inlineInputClassName} w-full text-[10px]`}
          placeholder={zh ? '翻譯' : 'Translation'}
          aria-label={zh ? '翻譯' : 'Translation'}
        />
        {translatorListId ? (
          <datalist id={translatorListId}>
            {metadataSuggestions?.translators.map((translator) => (
              <option key={translator} value={translator} />
            ))}
          </datalist>
        ) : null}
      </div>
    </form>
  );

  const renderKey = () => (
    <div
      ref={panelRef}
      className={`${valueOverlayShellClassName} overflow-visible`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={handleEscape}
    >
      <KeyPicker
        value={inlineKeyValue}
        onChange={(key) => {
          if (!key) return;
          handleInlineKeyChange(key);
          onClose();
        }}
        disabled={!canEditKey}
        label={isPerformanceKeyField ? copy.performanceKey : copy.key}
        originalKey={inlineKeyOriginalKey}
        panelMetaText={inlineKeyMetaText}
        align="left"
        triggerDensity="compact"
        autoOpen
        hideTriggerIcon
        valueTextClassName="!font-bold !text-gray-900"
        valueTextStyle={valueOverlayTextStyle}
        metaTextClassName="hidden"
        buttonStyle={{ borderWidth: 0, height: '100%', lineHeight: `${valueOverlayHeight}px`, minWidth: 0, padding: 0, width: '100%' }}
        buttonClassName="h-full w-full min-w-0 rounded-[2px] border-0 bg-transparent px-0 shadow-none ring-0 hover:border-transparent hover:bg-transparent"
      />
    </div>
  );

  const tempoStepButtonClassName = 'absolute top-1/2 flex items-center justify-center rounded-[3px] border border-gray-300 bg-white/95 text-[12px] font-bold leading-none text-gray-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700';

  const renderTempo = (layout?: TempoOverlayLayout) => {
    const valueWidth = layout?.valueWidth ?? getTempoValueWidth(target.anchorRect, tempoDraft);
    const valueLeft = layout?.valueLeft ?? TEMPO_STEP_CONTROLS_WIDTH;
    const containerWidth = layout?.containerWidth ?? valueWidth + (TEMPO_STEP_BUTTON_SIZE + TEMPO_STEP_GAP) * 2;
    const minusLeft = Math.max(0, valueLeft - TEMPO_STEP_CONTROLS_WIDTH);
    const plusLeft = Math.max(0, valueLeft - TEMPO_STEP_BUTTON_SIZE - TEMPO_STEP_GAP);

    return (
    <div
      ref={panelRef}
      className={`${valueOverlayShellClassName} relative overflow-visible`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={handleEscape}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          commitTempo();
        }
      }}
    >
      <button
        type="button"
        className={tempoStepButtonClassName}
        style={{
          height: TEMPO_STEP_BUTTON_SIZE,
          left: minusLeft,
          marginTop: -(TEMPO_STEP_BUTTON_SIZE / 2),
          width: TEMPO_STEP_BUTTON_SIZE
        }}
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyTempoDelta(-1)}
        aria-label={zh ? 'Tempo 減 1' : 'Decrease tempo'}
      >
        -
      </button>
      <input
        data-wysiwyg-autofocus
        type="text"
        inputMode="decimal"
        pattern="[0-9]*[.]?[0-9]?"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={tempoDraft}
        onChange={(event) => setTempoDraft(sanitizeTempoInput(event.target.value))}
        onBlur={commitTempo}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitTempo();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            applyTempoDelta(event.shiftKey ? 10 : 1);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            applyTempoDelta(event.shiftKey ? -10 : -1);
          }
        }}
        className={`${inlineInputClassName} absolute top-0 px-0 text-right tabular-nums`}
        style={{
          ...valueOverlayTextStyle,
          left: valueLeft,
          width: valueWidth
        }}
        placeholder="120"
        aria-label={copy.editor.tempo}
      />
      <button
        type="button"
        className={tempoStepButtonClassName}
        style={{
          height: TEMPO_STEP_BUTTON_SIZE,
          left: plusLeft,
          marginTop: -(TEMPO_STEP_BUTTON_SIZE / 2),
          width: TEMPO_STEP_BUTTON_SIZE
        }}
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyTempoDelta(1)}
        aria-label={zh ? 'Tempo 加 1' : 'Increase tempo'}
      >
        +
      </button>
    </div>
    );
  };

  const renderTimeSignature = () => {
    return (
      <div
        ref={panelRef}
        className={`${valueOverlayShellClassName} flex items-center`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onKeyDown={handleEscape}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
            commitTimeSignature();
          }
        }}
      >
        <input
          data-wysiwyg-autofocus
          type="text"
          inputMode="numeric"
          pattern="[0-9/]*"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={timeDraft}
          onChange={(event) => setTimeDraft(sanitizeTimeSignatureText(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTimeSignature();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              stepTimeSignaturePart(event.shiftKey ? 'denominator' : 'numerator', 1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              stepTimeSignaturePart(event.shiftKey ? 'denominator' : 'numerator', -1);
            }
          }}
          className={`${inlineInputClassName} w-full px-0 text-left tabular-nums`}
          style={valueOverlayTextStyle}
          placeholder="4/4"
          aria-label={copy.editor.timeSignature}
        />
      </div>
    );
  };

  const renderCapo = () => chrome(
    <CapoPicker
      value={currentCapo}
      currentKey={currentKey}
      onChange={(capo) => {
        onCapoChange(capo);
        onClose();
      }}
      label="Capo"
      align="left"
      triggerDensity="compact"
      autoOpen
      buttonClassName="h-10 w-full min-w-0 rounded-lg px-3"
    />,
    'Capo'
  );

  const usesFullSongInfoPanel = target.field === 'metadata' && showReferenceFields;
  const renderMetadataPanel = () => chrome(
    <SongMetadataPanel
      song={song}
      language={language}
      onChange={onChange}
      metadataSuggestions={metadataSuggestions}
      title={usesFullSongInfoPanel ? copy.editor.editSong : undefined}
      keyValue={editableMetadataKey}
      capoValue={currentCapo}
      onKeyChange={handleMetadataKeyChange}
      onCapoChange={onCapoChange}
      jianpuInputAbsolute={jianpuInputAbsolute}
      onJianpuInputAbsoluteChange={onJianpuInputAbsoluteChange}
      showReferenceFields={showReferenceFields}
      variant={usesFullSongInfoPanel ? 'default' : 'preview-header'}
      deviceLayout={deviceLayout}
      initialFocusField={target.field === 'metadata' ? undefined : target.field}
      initialAdvancedOpen={usesFullSongInfoPanel}
      canEditKey={canEditKey}
    />,
    zh ? '歌曲資訊' : 'Song information',
    true
  );

  const isInlineField = !usesMetadataPanel && (target.field === 'title'
    || target.field === 'credits'
    || target.field === 'key'
    || target.field === 'performanceKey'
    || target.field === 'tempo'
    || target.field === 'timeSignature');
  const desktopStyle = isInlineField
    ? getInlinePosition(
        target.anchorRect,
        target.field,
        target.field === 'tempo' ? tempoDraft : target.field === 'timeSignature' ? timeDraft : inlineKeyValue,
        target.anchorKey
      )
    : getDesktopPosition(target.anchorRect, usesMetadataPanel ? 'metadata' : target.field);
  const tempoOverlayLayout = target.field === 'tempo' && typeof desktopStyle.left === 'number' && typeof desktopStyle.width === 'number'
    ? {
        containerLeft: desktopStyle.left,
        containerWidth: desktopStyle.width,
        valueLeft: target.anchorRect.right - desktopStyle.left - getTempoValueWidth(target.anchorRect, tempoDraft),
        valueWidth: getTempoValueWidth(target.anchorRect, tempoDraft)
      }
    : undefined;
  const renderBody = () => {
    if (usesMetadataPanel) return renderMetadataPanel();
    if (target.field === 'title') return renderTitle();
    if (target.field === 'credits') return renderCredits();
    if (target.field === 'key' || target.field === 'performanceKey') return renderKey();
    if (target.field === 'tempo') return renderTempo(tempoOverlayLayout);
    if (target.field === 'timeSignature') return renderTimeSignature();
    return renderCapo();
  };
  const body = renderBody();

  if (usesMetadataPanel && isTouchLayout) {
    const maxHeight = deviceLayout === 'phone'
      ? Math.max(280, Math.min(680, visualViewportState.height * 0.82))
      : Math.max(300, Math.min(480, visualViewportState.height * 0.5));
    return (
      <div
        data-preview-metadata-backdrop
        data-device-layout={deviceLayout}
        className={`fixed inset-x-0 top-0 z-[82] flex items-end justify-center bg-slate-950/10 ${deviceLayout === 'phone' ? 'px-0' : 'px-4'} pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
        style={{ bottom: visualViewportState.keyboardOffset }}
        onPointerDown={(event) => {
          if (event.currentTarget === event.target) closeWithoutCommit();
        }}
      >
        <div
          className={deviceLayout === 'phone' ? 'w-full' : 'w-full max-w-[720px]'}
          style={{ maxHeight }}
        >
          {body}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[82]"
      style={usesMetadataPanel ? { ...desktopStyle, maxHeight: 'min(70vh, 520px)' } : desktopStyle}
    >
      {body}
    </div>
  );
}
