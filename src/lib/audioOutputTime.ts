/** Estimated AudioContext time audible at the output, used only for on-screen cues. */
export function audioOutputTime(context: AudioContext, now = performance.now()): number {
  try {
    const stamp = context.getOutputTimestamp?.();
    if (stamp && Number.isFinite(stamp.contextTime) && stamp.contextTime >= 0
      && Number.isFinite(stamp.performanceTime) && stamp.performanceTime > 0) {
      const age = now - stamp.performanceTime;
      if (age >= -25 && age < 1000) {
        return Math.min(context.currentTime, stamp.contextTime + Math.max(0, age) / 1000);
      }
    }
  } catch { /* Some engines expose the method before output is ready. */ }
  const latency = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
  return context.currentTime - latency(context.baseLatency) - latency(context.outputLatency);
}
