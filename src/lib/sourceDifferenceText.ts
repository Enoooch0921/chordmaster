import type { AppLanguage } from '../types';
import { parseRhythmNotation } from '../utils/rhythmUtils';

type Attack = {beat:number;offset:number;chord:string};
const attacks = (value: unknown): Attack[] | null => Array.isArray(value) && value.every(event => event && typeof event === 'object'
  && typeof event.beat === 'number' && typeof event.offset === 'number' && typeof event.chord === 'string') ? value : null;
export const getContinuationOnlyChange = (before: unknown, after: unknown) => {
  const a=attacks(before),b=attacks(after);if(!a||!b)return null;
  const harmony=(events:Attack[])=>events.filter(event=>event.chord!=='/');
  if(JSON.stringify(harmony(a))!==JSON.stringify(harmony(b)))return null;
  const holds=(events:Attack[])=>events.filter(event=>event.chord==='/');
  const old=holds(a),next=holds(b);
  if(JSON.stringify(old)===JSON.stringify(next))return null;
  for(const events of [a,b])for(const hold of holds(events)){
    const previous=harmony(events).filter(event=>event.beat+event.offset<hold.beat+hold.offset).at(-1);
    if(hold.offset!==0||!previous||!/^([A-G]|[#b]?[1-7]|\()/.test(previous.chord))return null;
  }
  return {before:old.map(event=>event.beat+1),after:next.map(event=>event.beat+1)};
};
export const describeContinuationPositions = (beats: number[], language: AppLanguage) => {
  if(!beats.length)return language==='zh'?'未標示延續拍':'No continuation marks';
  return language==='zh'?`第 ${beats.join('、')} 拍標示延續（/）`:`Continuation (/) on beats ${beats.join(', ')}`;
};
export const describeContinuationChange = (change: NonNullable<ReturnType<typeof getContinuationOnlyChange>>, language: AppLanguage) => {
  const added=change.after.filter(beat=>!change.before.includes(beat)),removed=change.before.filter(beat=>!change.after.includes(beat));
  if(language!=='zh')return `${added.length&&!removed.length?'Add':removed.length&&!added.length?'Remove':'Adjust'} continuation marks; chords and attack positions match`;
  const positions=(beats:number[])=>`第 ${beats.join('、')} 拍`;
  const parts=[added.length?`補上延續拍標示（${positions(added)}）`:'',removed.length?`移除延續拍標示（${positions(removed)}）`:''].filter(Boolean);
  return `${parts.join('；')}；和弦與落拍相同`;
};

export const describeRhythm = (notation: string, language: AppLanguage): string => {
  const zh=language==='zh';
  if(!notation.trim())return zh?'未設定':'Not set';
  const parsed=parseRhythmNotation(notation,'4/4');
  const bases={w:['全','whole'],h:['二分','half'],q:['四分','quarter'],e:['八分','eighth'],s:['十六分','sixteenth']} as const;
  const labels:string[]=[];
  let held=0;
  const flush=()=>{if(held)labels.push(zh?`延續 ${held} 拍`:`Continue ${held} ${held===1?'beat':'beats'}`);held=0;};
  for(const event of parsed.events){
    if(event.isSlash){held++;continue;}flush();
    const base=bases[event.base][zh?0:1];
    const duration=zh?`${event.dotted?'附點':''}${base}${event.isRest?'休止符':'音符'}`:`${event.dotted?'dotted ':''}${base} ${event.isRest?'rest':'note'}`;
    const details=[event.triplet?(zh?'三連音':'triplet'):'',event.crossHead?(event.crossHead==='upper'?(zh?'上方叉頭':'upper crosshead'):(zh?'叉頭':'crosshead')):'',event.accent?(zh?'重音':'accent'):'',event.tieAfter?(zh?'連至下一音':'tie to next note'):''].filter(Boolean);
    const detailText=details.length?(zh?`（${details.join('、')}）`:` (${details.join(', ')})`):'';
    const gapDuration=event.token==='y'?(zh?'1/3 個十六分音符':'one third of a sixteenth note'):duration+detailText;
    labels.push(event.isHidden?(zh?`留空（${gapDuration}長度）`:`Unspecified (${gapDuration} duration)`):duration+detailText);
  }
  flush();
  if(parsed.invalidTokens.length)labels.push(`${zh?'未辨識記號':'Unrecognized notation'}：${parsed.invalidTokens.join(' ')}`);
  return labels.join(' → ');
};
