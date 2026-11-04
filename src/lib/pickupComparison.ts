import type { AppLanguage, PickupMeasure } from '../types';
import { getPickupDisplay, normalizePickupTimeSignature } from '../utils/pickupUtils';
import { parseTimeSignature } from '../utils/rhythmUtils';

export const describePickupLength = (pickup: PickupMeasure, meter: string, language: AppLanguage) => {
  const zh = language === 'zh', display = getPickupDisplay(pickup, meter);
  if (!normalizePickupTimeSignature(pickup.timeSignature) && !display.hasContent)
    return zh ? '未設定' : 'Not set';
  const pulse = parseTimeSignature(meter);
  const beats = display.durationUnits / pulse.beatUnits;
  const count = Number(beats.toFixed(3));
  const duration = zh ? count === .5 ? '半拍' : `${count} 拍` : `${count} ${count === 1 ? 'beat' : 'beats'}`;
  const [numerator, denominator] = display.timeSignature.split('/').map(Number);
  const notes: Record<number, [string, string]> = {1:['全音符','whole note'],2:['二分音符','half note'],4:['四分音符','quarter note'],8:['八分音符','eighth note'],16:['十六分音符','sixteenth note']};
  const note = notes[denominator]?.[zh ? 0 : 1];
  const units = note ? zh ? numerator === 1 ? note : `${numerator} 個${note}` : `${numerator} ${note}${numerator === 1 ? '' : 's'}` : display.timeSignature;
  // Compound meters group written beats into dotted pulses. A note-length
  // description avoids implying either a different meter or a rounded pulse.
  if (pulse.beatUnits !== 16 / pulse.beatValue) return zh ? `${units}長度` : `${units} long`;
  return zh ? `${duration}（${units}）` : `${duration} (${units})`;
};

export const describePickup = (pickup: PickupMeasure | undefined, meter: string, language: AppLanguage) => {
  const zh = language === 'zh';
  if (!pickup) return zh ? '無弱起拍' : 'No pickup';
  const colon = zh ? '：' : ': ';
  const lines = [zh ? '有弱起拍' : 'Pickup present', `${zh ? '長度' : 'Length'}${colon}${describePickupLength(pickup, meter, language)}`];
  if (pickup.riff?.trim()) lines.push(`${zh ? '旋律' : 'Melody'}${colon}${pickup.riff}`);
  if (pickup.rhythm?.trim()) lines.push(`${zh ? '節奏' : 'Rhythm'}${colon}${pickup.rhythm}`);
  for (const voice of pickup.riffVoices ?? []) if (voice.riff.trim()) lines.push(`${voice.label || (zh ? '旋律聲部' : 'Melody voice')}${colon}${voice.riff}`);
  if (!pickup.riff?.trim() && !pickup.rhythm?.trim() && !pickup.riffVoices?.some(voice => voice.riff.trim()))
    lines.push(zh ? '未填入旋律或節奏' : 'No melody or rhythm entered');
  return lines.join('\n');
};

// Arguments follow the selected update direction, unlike the fixed comparison columns.
export const describePickupChange = (before: PickupMeasure | undefined, after: PickupMeasure | undefined, beforeMeter: string, afterMeter: string, language: AppLanguage) => {
  const zh = language === 'zh', colon = zh ? '：' : ': ';
  if (before && !after) return `${zh ? '移除弱起拍 · 原長度' : 'Remove pickup · Previous length'}${colon}${describePickupLength(before, beforeMeter, language)}`;
  if (!before && after) return `${zh ? '新增弱起拍 · 長度' : 'Add pickup · Length'}${colon}${describePickupLength(after, afterMeter, language)}`;
  if (before && after) {
    const oldLength = describePickupLength(before, beforeMeter, language), newLength = describePickupLength(after, afterMeter, language);
    return oldLength !== newLength ? `${zh ? '調整弱起拍長度' : 'Change pickup length'}${colon}${oldLength} → ${newLength}` : (zh ? '修改弱起拍的旋律／節奏' : 'Change pickup melody/rhythm');
  }
  return zh ? '弱起拍' : 'Pickup';
};
