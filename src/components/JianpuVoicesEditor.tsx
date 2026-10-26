import React from 'react';
import type { AppLanguage, JianpuVoice } from '../types';
import Jianpu from './Jianpu';

interface Props {
  voices?: JianpuVoice[];
  timeSignature: string;
  literalDurations?: boolean;
  language: AppLanguage;
  onChange: (voices: JianpuVoice[] | undefined) => void;
}

export default function JianpuVoicesEditor({ voices = [], timeSignature, literalDurations, language, onChange }: Props) {
  const zh = language === 'zh';
  const update = (index: number, voice: JianpuVoice) => onChange(voices.map((item, i) => i === index ? voice : item));
  return <details className="my-2 text-xs" data-additional-jianpu-editor>
    <summary className="cursor-pointer font-semibold">
      {zh ? '其他簡譜聲部' : 'Additional jianpu voices'}{voices.length ? ` (${voices.length})` : ''}
    </summary>
    <div className="mt-2 space-y-2">
      {voices.map((voice, index) => <div key={voice.id} data-jianpu-voice-editor={voice.id}
        className="space-y-2 rounded border border-slate-200 bg-white p-2">
        <div className="flex gap-2">
          <input aria-label={zh ? '簡譜聲部名稱' : 'Jianpu voice name'}
            className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
            value={voice.label} onChange={event => update(index, { ...voice, label: event.target.value })} />
          <button type="button" className="text-xs text-rose-700"
            onClick={() => { const next = voices.filter((_, i) => i !== index); onChange(next.length ? next : undefined); }}>
            {zh ? '移除聲部' : 'Remove voice'}
          </button>
        </div>
        <input aria-label={zh ? '簡譜聲部記法' : 'Jianpu voice notation'} lang="en" spellCheck={false}
          className="w-full rounded border px-2 py-1 font-mono text-xs"
          value={voice.riff} onChange={event => update(index, { ...voice, riff: event.target.value })} />
        {voice.riff.trim() && <Jianpu notation={voice.riff} timeSignature={timeSignature} literalDurations={literalDurations} compact className="w-full" />}
      </div>)}
      <button type="button" className="rounded border px-2 py-1"
        onClick={() => onChange([...voices, { id: crypto.randomUUID(), label: zh ? '下聲部' : 'Lower voice', riff: '' }])}>
        {zh ? '新增簡譜聲部' : 'Add jianpu voice'}
      </button>
    </div>
  </details>;
}
