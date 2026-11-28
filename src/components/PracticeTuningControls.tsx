import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Song } from '../types';
import { practiceKey, practiceTempo, type PracticeTuning } from '../lib/practiceTuning';
import { currentKeyMode, formatKeyName } from '../utils/keyMode';
import { isValidTempoDraft, MAX_TEMPO_BPM, MIN_TEMPO_BPM, normalizeTempoBpm } from '../utils/tempoUtils';

export default function PracticeTuningControls({ song, tuning, onChange, zh, audition = false }: {
  song: Song; tuning: PracticeTuning; onChange: (next: PracticeTuning) => void; zh: boolean; audition?: boolean;
}) {
  const id = useId();
  const [tempoDraft, setTempoDraft] = useState<{ text: string; tuning: PracticeTuning } | null>(null);
  const draft = tempoDraft?.tuning === tuning ? tempoDraft.text : null;
  const base = practiceTempo(normalizeTempoBpm(song.tempo), 1);
  const bpm = practiceTempo(base, tuning.tempoRatio);
  const setTempo = (value: number, text?: string) => {
    const next = { ...tuning, tempoRatio: value / base };
    setTempoDraft(text === undefined ? null : { text, tuning: next });
    onChange(next);
  };
  const valid = draft === null || (draft !== '' && isValidTempoDraft(draft));
  const { semitones } = tuning;
  const key = formatKeyName(practiceKey(song.currentKey, semitones), currentKeyMode(song));
  const offset = semitones > 0 ? `+${semitones}` : String(semitones);
  const keyLabel = zh ? (audition ? '試聽調性' : '練唱調性') : (audition ? 'Playback key' : 'Practice key');
  const tempoLabel = zh ? (audition ? '試聽速度' : '練唱速度') : (audition ? 'Playback tempo' : 'Practice tempo');
  return <div className="practice-tuning">
    <fieldset>
      <legend>{keyLabel}</legend>
      <div className="practice-stepper">
        <button type="button" aria-label={zh ? '降半音' : 'Lower a semitone'} disabled={semitones <= -12}
          onClick={() => onChange({ ...tuning, semitones: semitones - 1 })}><Minus size={17} aria-hidden="true"/></button>
        <output aria-label={zh ? `目前${keyLabel}` : `Current ${keyLabel.toLowerCase()}`} translate="no">
          {song.originalKeyUnspecified ? offset : key}
          {song.originalKeyUnspecified ? <small>{zh ? '半音' : 'semitones'}</small> : semitones !== 0 && <small>{offset}</small>}
        </output>
        <button type="button" aria-label={zh ? '升半音' : 'Raise a semitone'} disabled={semitones >= 12}
          onClick={() => onChange({ ...tuning, semitones: semitones + 1 })}><Plus size={17} aria-hidden="true"/></button>
      </div>
    </fieldset>
    <div>
      <label htmlFor={id}>{tempoLabel} (BPM)</label>
      <div className="practice-stepper">
        <button type="button" aria-label={zh ? '減少 1 BPM' : 'Decrease 1 BPM'} disabled={bpm <= MIN_TEMPO_BPM}
          onClick={() => setTempo(Math.max(MIN_TEMPO_BPM, bpm - 1))}><Minus size={17} aria-hidden="true"/></button>
        <input id={id} name="practice-tempo" autoComplete="off" type="number" inputMode="decimal"
          min={MIN_TEMPO_BPM} max={MAX_TEMPO_BPM} step="any" value={draft ?? bpm}
          aria-invalid={!valid || undefined} aria-describedby={!valid ? `${id}-error` : undefined}
          onFocus={event => event.currentTarget.select()} onChange={event => {
            const text = event.currentTarget.value;
            if (text && isValidTempoDraft(text)) setTempo(normalizeTempoBpm(text)!, text);
            else setTempoDraft({ text, tuning });
          }} onBlur={() => setTempoDraft(null)} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); setTempoDraft(null); event.currentTarget.select(); }
          }}/>
        <button type="button" aria-label={zh ? '增加 1 BPM' : 'Increase 1 BPM'} disabled={bpm >= MAX_TEMPO_BPM}
          onClick={() => setTempo(Math.min(MAX_TEMPO_BPM, bpm + 1))}><Plus size={17} aria-hidden="true"/></button>
      </div>
      {!valid && <p id={`${id}-error`} role="status" className="practice-hint">{zh ? '請輸入 20–400 BPM。' : 'Enter 20–400 BPM.'}</p>}
    </div>
    <p className="practice-hint">{zh ? '停止播放後恢復歌曲設定。' : 'Stopping playback restores the song’s key and tempo.'}</p>
  </div>;
}
