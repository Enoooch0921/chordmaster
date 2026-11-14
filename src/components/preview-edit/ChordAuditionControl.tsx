import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square } from 'lucide-react';
import type { AppLanguage, Song } from '../../types';
import { AuditionPiano } from '../../lib/auditionPiano';
import { buildChordAudition, type AuditionPlan, type AuditionScope, type AuditionTarget } from '../../lib/chordAudition';
import ChordAuditionSettings from './ChordAuditionSettings';

interface Props {
  language: AppLanguage;
  song: Song;
  target: AuditionTarget;
  identity: string;
  selectionLabel: string;
  prominent?: boolean;
  editorShortcut?: boolean;
  feedbackHost: HTMLElement | null;
  scope: AuditionScope;
  setScope: (value: AuditionScope) => void;
  metronome: boolean;
  setMetronome: (enabled: boolean) => void;
  melody: boolean;
  setMelody: (enabled: boolean) => void;
}
function issueText(issue: AuditionPlan['issue'], zh: boolean) {
  switch (issue?.kind) {
    case 'key': return zh ? '調性未定，無法試聽此級數。' : 'Set the key to hear this degree.';
    case 'timing': return zh ? '拍號或拍位未定，可選一個和弦試聽。' : 'Timing is unspecified. Select a single chord to listen.';
    case 'unsupported': return zh ? `無法辨識「${issue.token}」，請檢查和弦符號。` : `Check the unrecognized chord “${issue.token}”.`;
    case 'repeat': return zh ? '無法確定要重奏的小節。' : 'The bar to repeat is unclear.';
    case 'empty': return zh ? '此處沒有可試聽的和弦。' : 'Select a sounding chord to listen.';
    default: return '';
  }
}

export default function ChordAuditionControl({ language, song, target, identity, scope, setScope, selectionLabel, prominent = false, editorShortcut = false, feedbackHost, metronome, setMetronome, melody, setMelody }: Props) {
  const zh = language === 'zh';
  const labels = zh ? { chord: '這個和弦', bar: '這個小節', section: '從這裡到段尾', song: '從這裡到曲尾' }
    : { chord: 'This Chord', bar: 'This Bar', section: 'To Section End', song: 'To Song End' };
  const compactLabel = scope === 'chord' ? selectionLabel || (zh ? '試聽' : 'Play')
    : scope === 'bar' ? (zh ? '小節' : 'Bar') : scope === 'section' ? (zh ? '至段尾' : 'Section End') : (zh ? '至曲尾' : 'Song End');
  const label = prominent ? (scope === 'chord' && selectionLabel
    ? (zh ? `試聽 ${selectionLabel}` : `Play ${selectionLabel}`)
    : zh ? { chord: '試聽和弦', bar: '播放小節', section: '播至段尾', song: '播至曲尾' }[scope]
      : { chord: 'Play chord', bar: 'Play bar', section: 'To section end', song: 'To song end' }[scope]) : compactLabel;
  const [playing, setPlaying] = useState(false);
  const stopLabel = zh ? '停止' : 'Stop';
  const playTarget = scope === 'chord' && selectionLabel ? selectionLabel : labels[scope];
  const actionLabel = playing ? (zh ? '停止試聽' : 'Stop audition') : (zh ? `試聽${playTarget}` : `Play ${playTarget}`);
  const [notice, setNotice] = useState('');
  const [clickUnavailable, setClickUnavailable] = useState(false);
  const piano = useRef<AuditionPiano | null>(null);
  useLayoutEffect(() => piano.current?.setMetronomeEnabled(metronome), [metronome]);
  useLayoutEffect(() => piano.current?.setMelodyEnabled(melody), [melody]);
  const run = useRef(0);
  const loading = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const marked = useRef<HTMLElement | null>(null);
  const clearMark = useCallback(() => {
    marked.current?.removeAttribute('data-audition-playing');
    marked.current = null;
  }, []);
  const stop = useCallback(() => {
    run.current++;
    clearTimeout(loading.current);
    setNotice('');
    setClickUnavailable(false);
    piano.current?.stop();
    clearMark();
    setPlaying(false);
  }, [clearMark]);
  useLayoutEffect(() => {
    setNotice('');
    return stop;
  }, [song, identity, target.sectionId, target.sectionOccurrence, target.barId, target.slotIndex, target.offset, target.orderedIndex, scope, stop]);
  useLayoutEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', stop);
      piano.current?.dispose();
      piano.current = null;
    };
  }, [stop]);

  const play = async () => {
    if (playing) { stop(); return; }
    setClickUnavailable(false);
    const plan = buildChordAudition(song, target, scope, melody);
    const problem = issueText(plan.issue, zh);
    if (plan.duration <= 0) { setNotice(problem || issueText({ kind: 'empty' }, zh)); return; }
    const hints = plan.fallbackTempo ? (zh ? '試聽速度 80 BPM' : 'Preview tempo 80 BPM') : '';
    setNotice(hints);
    setPlaying(true);
    const request = ++run.current;
    loading.current = setTimeout(() => {
      if (run.current === request) setNotice(zh ? '正在載入鋼琴…' : 'Loading piano…');
    }, 220);
    piano.current ??= new AuditionPiano();
    piano.current.setMetronomeEnabled(metronome);
    piano.current.setMelodyEnabled(melody);
    let index = 0;
    let priorBeat = -1;
    let priorSpan = -1;
    const paint = (elapsed: number) => {
      while (index + 1 < plan.bars.length && plan.bars[index].end <= elapsed) index++;
      const span = plan.bars[index];
      const beat = Math.floor(span.firstBeat + (elapsed - span.start) / span.beatSeconds) % span.beats;
      if (priorSpan === index && priorBeat === beat) return;
      priorSpan = index;
      priorBeat = beat;
      clearMark();
      const prefix = `[data-audition-chart="${CSS.escape(identity)}"][data-audition-section="${CSS.escape(span.sectionId)}"][data-audition-bar="${CSS.escape(span.barId)}"]`;
      const cell = document.querySelectorAll<HTMLElement>(prefix)[span.sectionOccurrence];
      if (!cell) return;
      const tokens = cell.querySelectorAll<HTMLElement>('[data-unmetered-chord], [data-untimed-chord]');
      const slot = tokens[target.orderedIndex ?? 0] ?? cell.querySelector<HTMLElement>(`[data-preview-slot-index="${beat}"]`);
      marked.current = slot ?? cell;
      marked.current.setAttribute('data-audition-playing', '');
    };
    const failed = () => {
      if (run.current !== request) return;
      stop();
      setNotice(zh ? '鋼琴試聽中斷，請再按一次播放。' : 'Piano playback was interrupted. Press play to retry.');
    };
    try {
      const result = await piano.current.play(plan, paint, () => {
        if (run.current !== request) return;
        clearMark(); setPlaying(false); setNotice(problem || hints);
      }, failed);
      if (run.current === request) {
        clearTimeout(loading.current); setNotice(hints);
        setClickUnavailable(result?.metronomeUnavailable ?? false);
      }
    } catch { failed(); }
  };

  return <div className="chord-audition" data-prominent={prominent || undefined} role="group" aria-label={zh ? '和弦試聽' : 'Chord audition'}>
    <div className="chord-audition-split" data-playing={playing || undefined}>
      <button type="button" data-audition-button data-playing={playing || undefined}
        aria-keyshortcuts={editorShortcut ? 'Alt+P' : undefined}
        title={editorShortcut ? `${actionLabel} (Alt + P)` : actionLabel}
        aria-label={actionLabel}
        onMouseDown={event => event.preventDefault()} onClick={event => {
          if (event.detail > 0) {
            const editor = event.currentTarget.closest('[data-preview-bar-editor]');
            editor?.querySelector<HTMLElement>('[data-preview-chord-capture]')?.focus({ preventScroll: true });
          }
          void play();
        }}>
        {playing ? <Square aria-hidden size={13} fill="currentColor"/> : <Play aria-hidden size={13} fill="currentColor"/>}
        <span className="chord-audition-labels" aria-hidden="true">
          <span className="chord-audition-label" style={{ visibility: playing ? 'hidden' : undefined }} translate={scope === 'chord' ? 'no' : undefined}>{label}</span>
          <span className="chord-audition-label" style={{ visibility: playing ? undefined : 'hidden' }}>{stopLabel}</span>
        </span>
      </button>
      <ChordAuditionSettings zh={zh} labels={labels} scope={scope} setScope={setScope}
        metronome={metronome} setMetronome={setMetronome} melody={melody} setMelody={setMelody} />
    </div>
    {feedbackHost && createPortal(<div aria-live="polite" className="chord-audition-notice">{[notice,
      metronome && clickUnavailable ? (zh ? '節拍器載入失敗，可再按播放重試。' : 'Metronome unavailable. Play again to retry.') : ''
    ].filter(Boolean).join(' ')}</div>, feedbackHost)}
  </div>;
}
