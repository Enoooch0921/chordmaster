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
  const [tempoDraft, setTempoDraft] = React.useState(typeof song.tempo === 'number' ? String(song.tempo) : '');
  const timeSignatureParts = splitTimeSignatureInput(song.timeSignature);
  const resolvedKey = keyValue ?? song.originalKey;
  const resolvedCapo = capoValue ?? (song.capo ?? 0);

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
      : copy.setlistEditor[
          mode === 'nashville-number-system'
            ? 'displayModeNashville'
            : mode === 'chord-fixed-key'
              ? 'displayModeFixed'
              : 'displayModeMovable'
        ]
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
      : copy.editor[
          mode === 'none'
            ? 'barNumbersOff'
            : mode === 'line-start'
              ? 'barNumbersLineStart'
              : 'barNumbersAll'
        ]
  }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-bold text-gray-900">{title || copy.editor.editSong}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-gray-400">{copy.editor.originalKey}: {song.originalKey}</div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.2fr)_minmax(110px,0.8fr)_minmax(108px,0.75fr)_minmax(100px,0.7fr)_minmax(240px,1.15fr)]">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.editor.title}</label>
            <input
              type="text"
              value={song.title}
              onChange={(event) => updateField('title', event.target.value)}
              className="h-8 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.key}</label>
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
              buttonClassName="w-full h-8 min-w-[104px] px-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Capo</label>
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
              buttonClassName="w-full h-8 min-w-[104px] px-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.editor.tempo}</label>
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
              className="h-8 w-full rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.editor.timeSignature}</label>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center rounded-lg border border-gray-300 bg-white px-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={timeSignatureParts.numerator}
                  onChange={(event) => updateField('timeSignature', buildTimeSignatureInput(event.target.value, timeSignatureParts.denominator))}
                  placeholder="4"
                  className="h-8 w-full border-0 bg-transparent px-1 text-center text-sm font-semibold text-gray-800 outline-none focus:ring-0"
                />
                <span className="px-0.5 text-sm font-semibold text-gray-400">/</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={timeSignatureParts.denominator}
                  onChange={(event) => updateField('timeSignature', buildTimeSignatureInput(timeSignatureParts.numerator, event.target.value))}
                  placeholder="4"
                  className="h-8 w-full border-0 bg-transparent px-1 text-center text-sm font-semibold text-gray-800 outline-none focus:ring-0"
                />
              </div>
              <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-2.5">
                <input
                  type="checkbox"
                  checked={song.shuffle ?? song.groove?.trim().toLowerCase() === 'shuffle'}
                  onChange={(event) => onChange({ ...song, shuffle: event.target.checked, groove: undefined })}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[12px] font-medium text-gray-600">{copy.editor.shuffle}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-0 basis-[132px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.editor.chordFont}</label>
            <select
              value={song.chordFontPreset || DEFAULT_CHORD_FONT_PRESET}
              onChange={(event) => updateField('chordFontPreset', event.target.value as ChordFontPreset)}
              className="h-8 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            >
              {CHORD_FONT_PRESET_OPTIONS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset === 'classic-serif' ? copy.editor.chordFontClassic : copy.editor.chordFontStage}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-[1_1_148px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.version}</label>
            <input
              type="text"
              value={getVersionValue(song)}
              onChange={(event) => onChange({ ...song, lyricist: event.target.value, composer: '' })}
              className="h-8 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="min-w-0 flex-[1_1_148px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.editor.translator}</label>
            <input
              type="text"
              value={song.translator || ''}
              onChange={(event) => updateField('translator', event.target.value)}
              className="h-8 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="min-w-0 basis-[188px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.setlistEditor.displaySettings}</label>
            <div className="w-full">
              <CompactSegmentedControl
                value={displayMode ?? 'chord-movable-key'}
                options={displayModeOptions}
                onChange={(mode) => onDisplayModeChange?.(mode)}
                size="sm"
              />
            </div>
          </div>

          <div className="min-w-0 basis-[148px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.setlistEditor.showLyrics}</label>
            <div className="inline-flex h-8 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3">
              <span className="text-[12px] font-medium text-gray-600">{language === 'zh' ? '歌詞' : copy.setlistEditor.showLyrics}</span>
              <CompactToggleSwitch
                checked={showLyrics ?? false}
                onChange={(checked) => onShowLyricsChange?.(checked)}
                label={(showLyrics ?? false) ? copy.on : copy.off}
                size="sm"
                showLabel={false}
              />
            </div>
          </div>

          <div className="min-w-0 basis-[170px]">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{copy.editor.barNumbers}</label>
            <div className="w-full">
              <CompactSegmentedControl
                value={song.barNumberMode ?? 'none'}
                options={barNumberOptions}
                onChange={(mode) => updateField('barNumberMode', mode)}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SongMetadataPanel;
