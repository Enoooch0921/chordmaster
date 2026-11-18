import type { AuditionPlan } from './chordAudition';

export function sliceAudition(plan: AuditionPlan, start: number, end = plan.duration): AuditionPlan {
  const inRange = (event: {start: number; end: number}) => event.start < end && event.end > start;
  const trim = <T extends {start: number; end: number}>(event: T) => ({
    ...event, start: Math.max(0, event.start - start), end: Math.min(end, event.end) - start
  });
  return { ...plan, duration: end - start, issue: end >= plan.duration ? plan.issue : undefined,
    bars: plan.bars.filter(inRange).map(trim), sounds: plan.sounds.filter(inRange).map(trim) };
}

export function joinAuditions(before: AuditionPlan, after: AuditionPlan): AuditionPlan {
  const shift = <T extends {start: number; end: number}>(event: T) => ({
    ...event, start: event.start + before.duration, end: event.end + before.duration
  });
  return { ...after, duration: before.duration + after.duration, fallbackTempo: before.fallbackTempo || after.fallbackTempo,
    bars: before.bars.concat(after.bars.map(shift)), sounds: before.sounds.concat(after.sounds.map(shift)) };
}
