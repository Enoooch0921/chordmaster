import React from 'react';
import { AppLanguage, BarNumberMode, Setlist, SetlistDisplayMode, SetlistSong, Song } from '../types';
import { getUiCopy } from '../constants/i18n';
import { CompactSegmentedControl, CompactToggleSwitch } from './SetlistCompactControls';
import KeyPicker from './KeyPicker';
import CapoPicker from './CapoPicker';

interface SetlistEditorProps {
  language: AppLanguage;
  setlist: Setlist;
  setlistSong: SetlistSong;
  baseSong: Song;
  onChange: (nextSong: SetlistSong) => void;
  onSetlistChange: (updates: Partial<Pick<Setlist, 'displayMode' | 'showLyrics'>>) => void;
}

const DISPLAY_MODE_LABELS: Record<SetlistDisplayMode, string> = {
  'nashville-number-system': 'displayModeNashville',
  'chord-fixed-key': 'displayModeFixed',
  'chord-movable-key': 'displayModeMovable'
};

const BAR_NUMBER_OPTIONS: Array<{ value: BarNumberMode; labelKey: 'barNumbersOff' | 'barNumbersLineStart' | 'barNumbersAll' }> = [
  { value: 'none', labelKey: 'barNumbersOff' },
  { value: 'line-start', labelKey: 'barNumbersLineStart' },
  { value: 'all', labelKey: 'barNumbersAll' }
];

const SetlistEditor: React.FC<SetlistEditorProps> = ({
  language,
  setlist,
  setlistSong,
  baseSong,
  onChange,
  onSetlistChange
}) => {
  const copy = getUiCopy(language);
  const currentKey = setlistSong.overrideKey ?? baseSong.currentKey;
  const currentCapo = typeof setlistSong.capo === 'number' ? setlistSong.capo : (baseSong.capo ?? 0);
  const currentBarNumberMode = baseSong.barNumberMode ?? 'none';

  const displayModeOptions = (Object.keys(DISPLAY_MODE_LABELS) as SetlistDisplayMode[]).map((mode) => ({
    value: mode,
    label: copy.setlistEditor[DISPLAY_MODE_LABELS[mode] as keyof typeof copy.setlistEditor] as string
  }));

  const barNumberOptions = BAR_NUMBER_OPTIONS.map((option) => ({
    value: option.value,
    label: copy.editor[option.labelKey]
  }));

  const toolbarLabelClassName = 'mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400';
  const toolbarFieldClassName = 'flex flex-col gap-1';

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5">
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 xl:max-w-[250px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-500">
            {copy.setlistEditor.instanceSettings}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
            {copy.setlistEditor.instanceSettingsHint}
          </p>
          <div className="mt-1 inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/50 px-2 py-0.5 text-[10px] font-semibold text-indigo-500">
            {copy.editor.originalKey}: {baseSong.originalKey}
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-end gap-x-2.5 gap-y-1.5 xl:justify-end">
          <div className={`${toolbarFieldClassName} min-w-[160px]`}>
            <div className={toolbarLabelClassName}>{copy.setlistEditor.setlist}</div>
            <div className="flex h-8 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 text-[13px] font-semibold text-gray-900">
              <span className="truncate">{setlist.name || copy.untitledSetlist}</span>
            </div>
          </div>
          <div className={toolbarFieldClassName}>
            <div className={toolbarLabelClassName}>{copy.key}</div>
            <KeyPicker
              value={currentKey}
              onChange={(key) => key && onChange({ ...setlistSong, overrideKey: key })}
              label={copy.key}
              originalKey={baseSong.currentKey}
              align="left"
              buttonClassName="h-8 min-w-[104px] px-2"
            />
          </div>
          <div className={toolbarFieldClassName}>
            <div className={toolbarLabelClassName}>Capo</div>
            <CapoPicker
              value={currentCapo}
              currentKey={currentKey}
              onChange={(capo) => onChange({ ...setlistSong, capo })}
              label="Capo"
              align="left"
              buttonClassName="h-8 min-w-[104px] px-2"
            />
          </div>
          <div className={`${toolbarFieldClassName} min-w-[240px]`}>
            <div className={toolbarLabelClassName}>{copy.setlistEditor.displaySettings}</div>
            <CompactSegmentedControl
              value={setlist.displayMode}
              options={displayModeOptions}
              onChange={(mode) => onSetlistChange({ displayMode: mode })}
              size="sm"
            />
          </div>
          <div className={`${toolbarFieldClassName} min-w-[280px]`}>
            <div className={toolbarLabelClassName}>{copy.setlistEditor.displayControls}</div>
            <div className="flex flex-wrap items-center gap-2">
              <CompactToggleSwitch
                checked={setlist.showLyrics}
                onChange={(checked) => onSetlistChange({ showLyrics: checked })}
                label={`${copy.setlistEditor.showLyrics} · ${setlist.showLyrics ? copy.on : copy.off}`}
                size="sm"
              />
              <CompactSegmentedControl
                value={currentBarNumberMode}
                options={barNumberOptions}
                onChange={(mode) => onChange({
                  ...setlistSong,
                  songData: {
                    ...baseSong,
                    barNumberMode: mode
                  }
                })}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SetlistEditor;
