import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Play, Square } from 'lucide-react';
import type { AppLanguage, Song } from '../types';
import { AuditionPiano } from '../lib/auditionPiano';
import type { AuditionBar, AuditionPlan } from '../lib/chordAudition';
import { buildPracticeSession, writtenPractice, type PracticeRange } from '../lib/practicePlayback';
import { missingPracticeSections, type PracticeBindings } from '../lib/auditionSongMap';
import type { PracticeReaderState } from '../lib/practiceLyrics';
import { isClosedBar } from '../utils/closedBar';
import { useAuditionPreferences } from '../hooks/useAuditionPreferences';
import { usePracticeChartCursor } from '../hooks/usePracticeChartCursor';
import { issueText } from './preview-edit/ChordAuditionControl';
import ChordAuditionSettings from './preview-edit/ChordAuditionSettings';

type Session = ReturnType<typeof buildPracticeSession>;
interface Cursor { bar: AuditionBar; lastBar: AuditionBar; nextLabel?: string }
interface Cue { label: string; at: number }

export default function PracticeControl({ song, identity, language, userId, controlsHost, feedbackHost, onReaderChange, chartViewport, onPlayingChange }: {
  song: Song; language: AppLanguage; userId?: string | null; controlsHost: HTMLElement | null; feedbackHost: HTMLElement | null;
  identity: string; chartViewport?: React.RefObject<HTMLDivElement | null>; onPlayingChange?: (playing: boolean) => void;
  onReaderChange: (state: PracticeReaderState | undefined) => void;
}) {
  const zh = language === 'zh';
  const preferences = useAuditionPreferences(userId, 'song');
  const {metronome, melody, visualDelayMs} = preferences;
  const [range, setRange] = useState<PracticeRange>('map');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bindings, setBindings] = useState<PracticeBindings>({});
  const missing = useMemo(() => missingPracticeSections(song), [song]);
  const sources = useMemo(() => song.sections.filter((section, i, all) => section.id && section.bars.some(b => !isClosedBar(b))
    && all.findIndex(s => s.id === section.id) === i), [song]);
  const [start, setStart] = useState(0);
  const [playing, setPlaying] = useState(false);
  const paintChart = usePracticeChartCursor(identity, playing ? chartViewport : undefined);
  useLayoutEffect(() => {
    if (!playing) return;
    onPlayingChange?.(true);
    return () => onPlayingChange?.(false);
  }, [playing, onPlayingChange]);
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
    paintChart(null);
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
  useLayoutEffect(() => {
    if (!piano.current) return;
    piano.current.visualDelayMs = visualDelayMs;
    piano.current.setMetronomeEnabled(metronome);
    piano.current.setMelodyEnabled(melody);
  }, [visualDelayMs, metronome, melody]);
  const play = async () => {
    setNotice('');
    const run = ++generation.current;
    const data = buildPracticeSession(song, range, start, bindings);
    if (!data.initial.bars.length) { setNotice(issueText(data.initial.issue ?? {kind:'empty'}, zh)); setSettingsOpen(true); return; }
    setSettingsOpen(false);
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
      paintChart(bar, time);
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
      finish(); setSettingsOpen(true); setNotice(zh ? '播放中斷，請再按一次練唱。' : 'Playback interrupted. Start practice again.');
    };
    try {
      const result = await player.play(data.initial, paint, () => {
        if (run !== generation.current) return;
        const problem = activePlan.issue;
        finish(); setNotice(issueText(problem, zh)); if (problem) setSettingsOpen(true);
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
  const selectRef = useRef(select);
  useLayoutEffect(() => { selectRef.current = select; });
  const label = position?.bar.mapLabel;
  const visit = position?.bar.mapVisit;
  useLayoutEffect(() => {
    onReaderChange(label && session.current ? {label, visit, queued:queued?.label, labels:session.current.labels, select:value => selectRef.current(value)} : undefined);
    return () => onReaderChange(undefined);
  }, [label, visit, queued?.label, onReaderChange]);
  const cueButton = (label: string) => <button type="button" key={label}
    aria-current={position?.bar.mapLabel === label ? 'step' : undefined} aria-pressed={queued?.label === label}
    onClick={() => select(label)}>{label}</button>;
  const labels = zh ? {chord:'', bar:'這個小節', section:'從這裡到段尾', song:'從這裡到曲尾', map:'按曲序播完整首', practice:title}
    : {chord:'', bar:'This bar', section:'To section end', song:'To song end', map:'Whole song in map order', practice:title};
  const rail = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const area = rail.current;
    const current = area?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!area || !current) return;
    const offset = current.offsetLeft - area.scrollLeft;
    if (offset < 0) area.scrollLeft += offset;
    else if (offset + current.offsetWidth > area.clientWidth) area.scrollLeft += offset + current.offsetWidth - area.clientWidth;
  }, [label, feedbackHost, controlsHost]);
  if (chartViewport) return playing && controlsHost ? createPortal(
    <button type="button" className="reader-audition-toggle" aria-label={action} aria-description={label} title={action} onClick={finish}>
      <Square className="shrink-0" size={13} fill="currentColor" aria-hidden="true"/><span className="max-w-[8em] truncate">{label ?? title}</span>
    </button>, controlsHost) : null;
  return controlsHost && createPortal(<div className="chord-audition">
    <div className="chord-audition-split" data-playing={playing || undefined}>
      <button type="button" data-audition-button aria-label={action} title={action} onClick={playing ? finish : play}>
        {playing ? <Square size={13} fill="currentColor" aria-hidden/> : <Play size={13} fill="currentColor" aria-hidden/>}
        <span className="chord-audition-labels" aria-hidden="true"><span className="chord-audition-label" style={{visibility:playing ? 'hidden' : 'visible'}}>{title}</span>
          <span className="chord-audition-label" style={{visibility:playing ? 'visible' : 'hidden'}}>{zh ? '停止' : 'Stop'}</span></span>
      </button>
      <ChordAuditionSettings {...preferences} zh={zh} labels={labels} scope="practice" open={settingsOpen} onOpenChange={setSettingsOpen}>
        {notice && <p role="status" className="practice-hint">{notice}</p>}
        {position && session.current && <>
          <div className="practice-cues" role="group" aria-label={zh ? '跳至段落' : 'Jump to section'}>
            {cueButton('Intro')}
            {session.current.labels.filter(label => label !== 'Intro' && label !== 'Ending').map(cueButton)}
            {cueButton('Ending')}
          </div>
          <p className="practice-hint">{zh ? '點段落可在段尾跳轉，再點同一段立即跳。' : 'Tap to queue at the section end. Tap again to jump now.'}</p>
        </>}
        {!playing && <fieldset><legend>{zh ? '練唱範圍' : 'Practice range'}</legend>
          {(['map','song','section','bar'] as const).map(value => <label key={value} className="chord-audition-option">
            <input type="radio" name="practice-range" checked={range === value} onChange={() => setRange(value)}/><span>{labels[value]}</span>{range === value && <Check size={16} aria-hidden/>}
          </label>)}
          {range !== 'map' && selected && <label className="practice-start">{zh ? '起始小節' : 'Starting bar'}
            <select name="practice-start" value={startBars.indexOf(selected)} onChange={e => setStart(Number(e.target.value))}>
              {startBars.map((b,i) => <option key={i} value={i}>{b.mapLabel} · {b.practiceBar || (zh ? '弱起' : 'Pickup')}</option>)}
            </select></label>}
        </fieldset>}
        {!playing && range === 'map' && missing.length > 0 && <fieldset><legend>{zh ? '指定這次練唱的譜段' : 'Match sections for this practice'}</legend>
          {missing.map(label => <label className="practice-start" key={label}>{label}
            <select aria-label={label} value={bindings[label] ?? ''} onChange={e => {
              setBindings({...bindings, [label]:e.target.value}); setNotice('');
            }}><option value="">{zh ? '選擇譜段' : 'Choose a section'}</option>
              {sources.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>)}
          <button type="button" className="practice-apply" disabled={missing.some(l => !sources.some(s => s.id === bindings[l]))} onClick={play}>
            {zh ? '按曲序開始' : 'Start in map order'}</button>
        </fieldset>}
      </ChordAuditionSettings>
    </div>
    {feedbackHost && position && createPortal(<><button className="practice-now" type="button" aria-haspopup="dialog" aria-expanded={settingsOpen}
      aria-label={zh ? `跳至段落，目前 ${label}，第 ${position.bar.practiceBar} 小節` : `Jump to section, currently ${label}, bar ${position.bar.practiceBar}`}
      onClick={() => setSettingsOpen(true)}><strong>{label}</strong><small>{position.bar.practiceBar || (zh ? '弱起' : 'Pickup')} / {position.bar.practiceTotal}
        {(queued?.label ?? position.nextLabel) && ` → ${queued?.label ?? position.nextLabel}`}</small></button>
      <div ref={rail} className="practice-section-rail" role="group" aria-label={zh ? '播放段落' : 'Playback sections'}
        aria-description={zh ? '點一次預選，唱完當前段落後跳轉。再點同一段可立即跳轉。' : 'Tap once to queue at the section end, or twice to jump immediately.'}>
        {session.current?.labels.map(cueButton)}
      </div></>, feedbackHost)}
  </div>, controlsHost);
}
