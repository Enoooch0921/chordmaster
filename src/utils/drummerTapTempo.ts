import { estimateTapTempo, type TapTempoEstimate } from './tapTempoUtils';

/** Acquire from this tap gesture, never ramp from the song's previous BPM. */
export class DrummerTapTempo {
  private times: number[] = [];
  private estimate: TapTempoEstimate | null = null;
  reset() { this.times = []; this.estimate = null; }
  push(timestamp: number): { count: number; bpm: number | null } {
    if (!Number.isFinite(timestamp)) return { count: this.times.length, bpm: null };
    const last = this.times.at(-1);
    if (last !== undefined && timestamp - last < 150) return { count: this.times.length, bpm: null };
    if (last !== undefined && timestamp - last > 3500) this.reset();
    this.times = [...this.times, timestamp].slice(-8);
    const intervals = this.times.slice(1).map((time, index) => time - this.times[index]);
    const recent = intervals.slice(-3);
    if (recent.length === 3 && this.estimate) {
      const mean = recent.reduce((sum, value) => sum + value, 0) / 3;
      // Three consistent intervals establish a deliberate change, even mid-gesture.
      if (recent.every(value => Math.abs(value - mean) < mean * .12) && Math.abs(mean - this.estimate.intervalMs) > this.estimate.intervalMs * .18) {
        this.times = this.times.slice(-4); this.estimate = null;
      }
    }
    if (intervals.length === 2 && Math.abs(intervals[1] - intervals[0]) > Math.min(...intervals) * .18) return { count: this.times.length, bpm: null };
    const estimate = estimateTapTempo(this.times, this.times.length <= 4 ? null : this.estimate?.bpm ?? null, { jitterRawWeight: .35, maxStepBpm: 4 });
    if (estimate) this.estimate = estimate;
    return { count: this.times.length, bpm: estimate?.bpm ?? null };
  }
}
