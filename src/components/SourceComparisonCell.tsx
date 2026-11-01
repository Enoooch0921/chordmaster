import type { AppLanguage } from '../types';
import type { ComparisonMeasure } from '../lib/sourceComparisonMeasure';
import { chordBeatAnchors, chordAttackSpan } from '../utils/chordBeatLayout';
import { chordBeatPositionLabel } from '../utils/chordBeatOffsets';
import NotationAlignedChordRow from './NotationAlignedChordRow';

export default function SourceComparisonCell({text,measure,language}:{text:string;measure?:ComparisonMeasure;language:AppLanguage}) {
  if(!measure)return <>{text}</>;
  const zh=language==='zh';
  const description=measure.timed
    ? `${zh?'小節':'Measure'} · ${measure.beats} ${zh?'拍':'beats'}；${measure.events.map(event=>`${zh?'第 ': 'Beat '}${chordBeatPositionLabel(event.beat,event.offset)}${zh?' 拍 ': ': '}${event.chord}`).join('；')}`
    : `${zh?'小節（拍位未指定）':'Measure (timing unspecified)'}：${measure.orderedChords.join(' ')}`;
  const visibleDescription=measure.description??(!measure.timed?(zh?'拍位未指定':'Timing unspecified'):undefined);
  return <div className="source-measure-value">
    {visibleDescription&&<p className="source-measure-description">{visibleDescription}</p>}
    <div role="img" aria-label={description} className="source-mini-measure" data-comparison-measure data-timed={measure.timed}>
      <div aria-hidden="true" className="source-mini-barlines">
        {measure.timed?<NotationAlignedChordRow
          anchors={chordBeatAnchors(measure.events,measure.beats)}
          spans={measure.events.map((_,index)=>chordAttackSpan(measure.events,index))}
          continuations={measure.events.map(event=>event.chord==='/')}
          labels={measure.events.map(event=>event.offset?chordBeatPositionLabel(event.beat,event.offset):'')}>
          {measure.events.map((event,index)=><span key={index} className="source-mini-chord" data-comparison-beat={event.beat} data-comparison-offset={event.offset} data-changed={event.changed||undefined} data-continuation={event.chord==='/'||undefined}>{event.chord}</span>)}
        </NotationAlignedChordRow>:<div className="source-mini-untimed">{measure.orderedChords.map((chord,index)=><span key={index}>{chord}</span>)}</div>}
      </div>
      {measure.timed&&<div aria-hidden="true" className="source-mini-beats" style={{gridTemplateColumns:`repeat(${measure.beats},minmax(0,1fr))`}}>{Array.from({length:measure.beats},(_,index)=><span key={index}>{index+1}</span>)}</div>}
    </div>
  </div>;
}
