import React from 'react';
import { AppLanguage, BarNumberMode, ChordFontPreset, Key, SetlistDisplayMode, Song } from '../types';
import { getUiCopy } from '../constants/i18n';
import { DEFAULT_CHORD_FONT_PRESET } from '../constants/chordFonts';
import KeyPicker from './KeyPicker';
import CapoPicker from './CapoPicker';
import { CompactSegmentedControl, CompactToggleSwitch } from './SetlistCompactControls';

interface SongMetadataPanelProps {
  song: Song;
  language: AppLanguage;
  onChange: (song: Song) => void;
  title?: string;
  keyValue?: Key;
  capoValue?: number;
  onKeyChange?: (key: Key) => void;
  onCapoChange?: (capo: number) => void;
  displayMode?: SetlistDisplayMode;
  showLyrics?: boolean;
  onDisplayModeChange?: (mode: SetlistDisplayMode) => void;
  onShowLyricsChange?: (showLyrics: boolean) => void;
}

const CHORD_FONT_PRESET_OPTIONS: ChordFontPreset[] = ['classic-serif', 'stage-sans'];
const DISPLAY_MODE_OPTIONS: SetlistDisplayMode[] = [
  'nashville-number-system',
  'chord-fixed-key',
  'chord-movable-key'
];
const BAR_NUMBER_OPTIONS: BarNumberMode[] = ['none', 'line-start', 'all'];
type MetadataLayoutMode = 'stacked' | 'compact' | 'wide';

const getVersionValue = (song: Song) =>
  Array.from(new Set([song.lyricist?.trim(), song.composer?.trim()].filter(Boolean))).join(' / ');

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
  if (width < 880) return 'compact';
  return 'wide';
};

const SongMetadataPanel: React.FC<SongMetadataPanelProps> = ({
  song,
  language,
  onChange,
  title,
  keyValue,
  capoValue,
  onKeyChange,
  onCapoChange,
  displayMode,
  showLyrics,
  onDisplayModeChange,
  onShowLyricsChange
}) => {
  const copy = getUiCopy(language);
  const panelRef = React.useRef<HTMLElement>(null);
  const [tempoDraft, setTempoDraft] = React.useState(typeof song.tempo === 'number' ? String(song.tempo) : '');
  const [layoutMode, setLayoutMode] = React.useState<MetadataLayoutMode>('wide');
  const timeSignatureParts = splitTimeSignatureInput(song.timeSignature);
  const resolvedKey = keyValue ?? song.originalKey;
  const resolvedCapo = capoValue ?? (song.capo ?? 0);
  const isWideLayout = layoutMode === 'wide';
  const isStackedLayout = layoutMode === 'stacked';
  const segmentedSize = isStackedLayout ? 'sm' : 'xs';
  const toggleSize = isStackedLayout ? 'sm' : 'xs';
  const labelClassName = 'mb-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-400';
  const controlLabelClassName = 'mb-1 block text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-400';
  const fieldClassName = 'h-7 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-800 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500';
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
    setTempoDraft(typeof song.tempo === 'number' ? String(song.tempo) : '');
  }, [song.tempo]);

  const commitTempoDraft = React.useCallback(() => {
    const digitsOnly = tempoDraft.replace(/\D+/g, '').slice(0, 3);
    onChange({
      ...song,
      tempo: digitsOnly ? Number(digitsOnly) : undefined
    });
  }, [onChange, song, tempoDraft]);

  const updateField = <K extends keyof Song>(field: K, value: Song[K]) => {
    onChange({ ...song, [field]: value });
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
    <div>
      <label className={labelClassName}>{copy.editor.title}</label>
      <input
        type="text"
        value={song.title}
        onChange={(event) => updateField('title', event.target.value)}
        className={`${fieldClassName} font-semibold`}
      />
    </div>
  );

  const keyField = (
    <div>
      <label className={labelClassName}>{copy.key}</label>
      <KeyPicker
        value={resolvedKey}
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
        buttonClassName="h-7 w-full min-w-0 rounded-lg px-2.5"
        valueTextClassName="text-[13px]"
        metaTextClassName={isWideLayout ? '' : 'hidden'}
        triggerIconSize={14}
      />
    </div>
  );

  const capoField = (
    <div>
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
        buttonClassName="h-7 w-full min-w-0 rounded-lg px-2.5"
        valueTextClassName="text-[13px]"
        showPlayKey={isWideLayout}
        triggerIconSize={14}
      />
    </div>
  );

  const tempoField = (
    <div>
      <label className={labelClassName}>{copy.editor.tempo}</label>
      <input
        type="number"
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
    <div>
      <label className={labelClassName}>{copy.editor.timeSignature}</label>
      <div className="flex min-w-0 items-center rounded-lg border border-gray-300 bg-white px-2">
        <input
          type="text"
          inputMode="numeric"
          value={timeSignatureParts.numerator}
          onChange={(event) => updateField('timeSignature', buildTimeSignatureInput(event.target.value, timeSignatureParts.denominator))}
          placeholder="4"
          className="h-7 w-full border-0 bg-transparent px-1 text-center text-[13px] font-semibold text-gray-800 outline-none focus:ring-0"
        />
        <span className="px-0.5 text-sm font-semibold text-gray-400">/</span>
        <input
          type="text"
          inputMode="numeric"
          value={timeSignatureParts.denominator}
          onChange={(event) => updateField('timeSignature', buildTimeSignatureInput(timeSignatureParts.numerator, event.target.value))}
          placeholder="4"
          className="h-7 w-full border-0 bg-transparent px-1 text-center text-[13px] font-semibold text-gray-800 outline-none focus:ring-0"
        />
      </div>
    </div>
  );

  const shuffleField = (
    <div>
      <label className={labelClassName}>{copy.editor.shuffle}</label>
      <label className="flex h-7 cursor-pointer items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2.5">
        <span className="truncate text-[12px] font-medium text-gray-600">{copy.editor.shuffle}</span>
        <input
          type="checkbox"
          checked={song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle'}
          onChange={(event) => onChange({ ...song, shuffle: event.target.checked, groove: undefined })}
          className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
      </label>
    </div>
  );

  const chordFontField = (
    <div>
      <label className={controlLabelClassName}>{copy.editor.chordFont}</label>
      <select
        value={song.chordFontPreset || DEFAULT_CHORD_FONT_PRESET}
        onChange={(event) => updateField('chordFontPreset', event.target.value as ChordFontPreset)}
        className={controlFieldClassName}
      >
        {CHORD_FONT_PRESET_OPTIONS.map((preset) => (
          <option key={preset} value={preset}>
            {preset === 'classic-serif' ? copy.editor.chordFontClassic : copy.editor.chordFontStage}
          </option>
        ))}
      </select>
    </div>
  );

  const versionField = (
    <div>
      <label className={labelClassName}>{copy.version}</label>
      <input
        type="text"
        value={getVersionValue(song)}
        onChange={(event) => onChange({ ...song, lyricist: event.target.value, composer: '' })}
        className={fieldClassName}
      />
    </div>
  );

  const translatorField = (
    <div>
      <label className={labelClassName}>{copy.editor.translator}</label>
      <input
        type="text"
        value={song.translator || ''}
        onChange={(event) => updateField('translator', event.target.value)}
        className={fieldClassName}
      />
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

  const showLyricsField = (
    <div>
      <label className={controlLabelClassName}>{copy.setlistEditor.showLyrics}</label>
      <div className="inline-flex h-7 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-2">
        <span className="truncate text-[12px] font-medium text-gray-600">{language === 'zh' ? '歌詞' : 'Lyrics'}</span>
        <CompactToggleSwitch
          checked={showLyrics ?? false}
          onChange={(checked) => onShowLyricsChange?.(checked)}
          label={(showLyrics ?? false) ? copy.on : copy.off}
          size={toggleSize}
          showLabel={false}
        />
      </div>
    </div>
  );

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
          <div className="grid gap-2 [grid-template-columns:minmax(0,3.5fr)_minmax(6rem,1.2fr)_minmax(6rem,1.2fr)_minmax(4.5rem,0.85fr)_minmax(5rem,0.95fr)_minmax(4.5rem,0.85fr)_minmax(5.5rem,1.1fr)]">
            {titleField}
            {versionField}
            {translatorField}
            {keyField}
            {capoField}
            {tempoField}
            {timeField}
          </div>

          <div className="grid items-start gap-2 [grid-template-columns:minmax(5rem,0.8fr)_minmax(6rem,1fr)_minmax(7rem,1.4fr)_minmax(5rem,0.9fr)_minmax(7rem,1.2fr)]">
            {shuffleField}
            {chordFontField}
            {displayModeField}
            {showLyricsField}
            {barNumbersField}
          </div>
        </div>
      ) : isStackedLayout ? (
        <div className="mt-2 space-y-2">
          {titleField}

          <div className="grid grid-cols-2 gap-2">
            {versionField}
            {translatorField}
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">{keyField}</div>
            <div className="col-span-6">{capoField}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {tempoField}
            {timeField}
          </div>

          {shuffleField}

          <div className="grid grid-cols-2 gap-2">
            {chordFontField}
            {showLyricsField}
          </div>

          {displayModeField}
          {barNumbersField}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">{titleField}</div>
            <div className="col-span-3">{versionField}</div>
            <div className="col-span-3">{translatorField}</div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">{keyField}</div>
            <div className="col-span-3">{capoField}</div>
            <div className="col-span-2">{tempoField}</div>
            <div className="col-span-3">{timeField}</div>
            <div className="col-span-2">{shuffleField}</div>
          </div>

          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3">{chordFontField}</div>
            <div className="col-span-4">{displayModeField}</div>
            <div className="col-span-2">{showLyricsField}</div>
            <div className="col-span-3">{barNumbersField}</div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SongMetadataPanel;
