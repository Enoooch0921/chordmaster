import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Play, Square } from 'lucide-react';
import type { AppLanguage, Song } from '../types';
import { AuditionPiano } from '../lib/auditionPiano';
import type { AuditionBar, AuditionPlan } from '../lib/chordAudition';
import { buildPracticeSession, writtenPractice, type PracticeRange } from '../lib/practicePlayback';
import type { LyricsLanguage } from '../utils/lyricsDocument';
import { useAuditionPreferences } from '../hooks/useAuditionPreferences';
import { issueText } from './preview-edit/ChordAuditionControl';
import ChordAuditionSettings from './preview-edit/ChordAuditionSettings';
import PracticeLyrics from './PracticeLyrics';

type Session = ReturnType<typeof buildPracticeSession>;
interface Cursor { bar: AuditionBar; lastBar: AuditionBar; nextLabel?: string }
interface Cue { label: string; at: number }

export default function PracticeControl({ song, language, userId, practiceHost, feedbackHost, onActive, displayLanguage }: {
  song: Song; language: AppLanguage; userId?: string | null; practiceHost: HTMLElement | null; feedbackHost: HTMLElement | null;
  onActive: (active: boolean) => void; displayLanguage: LyricsLanguage;
}) {
  const zh = language === 'zh';
  const preferences = useAuditionPreferences(userId, 'song');
  const {metronome, melody, visualDelayMs} = preferences;
  const [range, setRange] = useState<PracticeRange>('map');
  const [start, setStart] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState<Cursor>();
  const [queued, setQueued] = useState<Cue>();
  const [notice, setNotice] = useState('');
  const session = useRef<Session>(undefined);
  const piano = useRef<AuditionPiano>(undefined);
  const pending = useRef<Cue>(undefined);
  const generation = useRef(0);
  const written = useMemo(() => range === 'map' ? undefined : writtenPractice(song), [range, song]);
  const startBars = written?.bars ?? [];
  const selected = startBars[start] ?? startBars[0];
  const title = zh ? '練唱' : 'Sing along';
  const action = playing ? (zh ? '停止練唱' : 'Stop practice') : (zh ? '開始練唱' : 'Start sing-along practice');
  const finish = () => {
    generation.current++;
    piano.current?.stop();
    pending.current = undefined;
    session.current = undefined;
    setQueued(undefined); setPosition(undefined); setPlaying(false);
  };
  useLayoutEffect(() => {
    const hidden = () => { if (document.hidden) finish(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', finish);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', finish);
      finish(); piano.current?.dispose();
    };
  }, [song]);
  const active = Boolean(position);
  useLayoutEffect(() => {
    onActive(active);
    return () => onActive(false);
  }, [active, onActive]);
  useLayoutEffect(() => {
    if (!piano.current) return;
    piano.current.visualDelayMs = visualDelayMs;
    piano.current.setMetronomeEnabled(metronome);
    piano.current.setMelodyEnabled(melody);
  }, [visualDelayMs, metronome, melody]);
  const play = async () => {
    setNotice('');
    const run = ++generation.current;
    const data = buildPracticeSession(song, range, start);
    if (!data.initial.bars.length) { setNotice(issueText(data.initial.issue ?? {kind:'empty'}, zh)); return; }
    session.current = data;
    const player = piano.current ??= new AuditionPiano();
    player.visualDelayMs = visualDelayMs;
    player.setMetronomeEnabled(metronome); player.setMelodyEnabled(melody);
    setPlaying(true);
    let index = 0;
    let previous: AuditionBar | undefined;
    let activePlan = data.initial;
    let sectionStart = -1;
    let sectionEnd = -1;
    const paint = (time: number, timeline: AuditionPlan) => {
      if (activePlan !== timeline) { index = 0; sectionEnd = -1; activePlan = timeline; }
      const bars = timeline.bars;
      while (index > 0 && bars[index].start > time) index--;
      while (index + 1 < bars.length && bars[index].end <= time) index++;
      if (pending.current && time >= pending.current.at) { pending.current = undefined; setQueued(undefined); }
      const bar = bars[index];
      if (bar === previous) return;
      previous = bar;
      // A repeated or manually re-entered section starts a new visit even when the label matches.
      if (index < sectionStart || index > sectionEnd) {
        sectionStart = index;
        sectionEnd = index;
        while (sectionEnd + 1 < bars.length && bars[sectionEnd + 1].mapVisit === bar.mapVisit
          && bars[sectionEnd + 1].practiceBar! > bars[sectionEnd].practiceBar!) sectionEnd++;
      }
      setPosition({bar, lastBar:bars[sectionEnd], nextLabel:bars[sectionEnd + 1]?.mapLabel});
    };
    const failed = () => {
      if (run !== generation.current) return;
      finish(); setNotice(zh ? '播放中斷，請再按一次練唱。' : 'Playback interrupted. Start practice again.');
    };
    try {
      const result = await player.play(data.initial, paint, () => {
        if (run !== generation.current) return;
        const problem = activePlan.issue;
        finish(); setNotice(issueText(problem, zh));
      }, failed, data.auxiliaryNotes);
      if (result?.metronomeUnavailable && run === generation.current) setNotice(zh ? '節拍器載入失敗' : 'Metronome unavailable');
    } catch { failed(); }
  };
  const select = (label: string) => {
    if (!position || !session.current || !piano.current?.redirect) return;
    const immediate = pending.current?.label === label;
    const next = session.current.select(label, immediate ? position.bar : position.lastBar);
    if (!next?.duration) return;
    const at = piano.current.redirect(next, immediate ? undefined : pending.current?.at ?? position.lastBar.end);
    pending.current = {label, at}; setQueued(pending.current);
  };
  const cueButton = (label: string) => <button type="button" key={label}
    aria-current={position?.bar.mapLabel === label ? 'step' : undefined} aria-pressed={queued?.label === label}
    onClick={() => select(label)}>{label}</button>;
  const labels = zh ? {chord:'', bar:'這個小節', section:'從這裡到段尾', song:'從這裡到曲尾', map:'按曲序播完整首', practice:title}
    : {chord:'', bar:'This bar', section:'To section end', song:'To song end', map:'Whole song in map order', practice:title};
  return <div className="chord-audition">
    <div className="chord-audition-split" data-playing={playing || undefined}>
      <button type="button" data-audition-button aria-label={action} title={action} onClick={playing ? finish : play}>
        {playing ? <Square size={13} fill="currentColor" aria-hidden/> : <Play size={13} fill="currentColor" aria-hidden/>}
        {playing ? (zh ? '停止' : 'Stop') : title}
      </button>
      <ChordAuditionSettings {...preferences} zh={zh} labels={labels} scope="practice">
        <fieldset disabled={playing}><legend>{zh ? '練唱範圍' : 'Practice range'}</legend>
          {(['map','song','section','bar'] as const).map(value => <label key={value} className="chord-audition-option">
            <input type="radio" name="practice-range" checked={range === value} onChange={() => setRange(value)}/><span>{labels[value]}</span>{range === value && <Check size={16} aria-hidden/>}
          </label>)}
          {range !== 'map' && selected && <label className="practice-start">{zh ? '起始小節' : 'Starting bar'}
            <select name="practice-start" value={startBars.indexOf(selected)} onChange={e => setStart(Number(e.target.value))}>
              {startBars.map((b,i) => <option key={i} value={i}>{b.mapLabel} · {b.practiceBar || (zh ? '弱起' : 'Pickup')}</option>)}
            </select></label>}
        </fieldset>
      </ChordAuditionSettings>
    </div>
    {feedbackHost && createPortal(<>
      <div role="status" className="practice-status">{position && <><strong>{position.bar.mapLabel}</strong>
        <span>{zh ? '小節' : 'Bar'} {position.bar.practiceBar || (zh ? '弱起' : 'pickup')} / {position.bar.practiceTotal}</span></>}
        {queued ? <strong>{zh ? '已預選' : 'Queued'} · {queued.label}</strong> : position?.nextLabel && <span>{zh ? '接下來' : 'Next'} · {position.nextLabel}</span>}{notice}</div>
      {position && session.current && <><div className="practice-cues" role="group" aria-label={zh ? '跳至段落' : 'Jump to section'}>
        {cueButton('Intro')}
        <div className="practice-cue-list">{session.current.labels.filter(label => label !== 'Intro' && label !== 'Ending').map(cueButton)}</div>
        {cueButton('Ending')}
      </div><p className="practice-hint">{zh ? '點段落可在段尾跳轉，再點同一段立即跳。' : 'Tap to queue at the section end. Tap again to jump now.'}</p></>}
    </>, feedbackHost)}
    {practiceHost && position && createPortal(<PracticeLyrics doc={song.lyricsDoc} label={position.bar.mapLabel!}
      labels={session.current?.labels} onSelect={select} language={language} displayLanguage={displayLanguage}/>, practiceHost)}
  </div>;
}
