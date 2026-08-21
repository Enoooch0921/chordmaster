export type TapTempoConfidence = 'warming' | 'settling' | 'steady';

export interface TapTempoEstimate {
  bpm: number;
  rawBpm: number;
  preciseBpm: number;
  rawPreciseBpm: number;
  intervalMs: number;
  tapCount: number;
  usedTapCount: number;
  spread: number;
  confidence: TapTempoConfidence;
}

export interface TapTempoLockState {
  lockedBpm: number | null;
  recentPreciseBpms: number[];
}

export interface TapTempoDisplayResolution {
  bpm: number;
  locked: boolean;
  state: TapTempoLockState;
}

interface TapTempoOptions {
  minIntervalMs?: number;
  maxIntervalMs?: number;
  minBpm?: number;
  maxBpm?: number;
  outlierTolerance?: number;
  jitterBlendRangeBpm?: number;
  jitterRawWeight?: number;
  maxStepBpm?: number;
}

interface TapTempoDisplayOptions {
  maxRecentEstimates?: number;
  lockAfterTapCount?: number;
  lockAfterEstimateCount?: number;
  lockToleranceBpm?: number;
  unlockToleranceBpm?: number;
}

interface RecentTapOptions {
  resetAfterMs: number;
  maxSamples: number;
}

interface TapInterval {
  index: number;
  intervalMs: number;
}

const DEFAULT_OPTIONS: Required<TapTempoOptions> = {
  minIntervalMs: 150,
  maxIntervalMs: 3000,
  minBpm: 20,
  maxBpm: 400,
  outlierTolerance: 0.18,
  jitterBlendRangeBpm: 2.25,
  jitterRawWeight: 0.6,
  maxStepBpm: 4
};

const DEFAULT_DISPLAY_OPTIONS: Required<TapTempoDisplayOptions> = {
  maxRecentEstimates: 5,
  lockAfterTapCount: 5,
  lockAfterEstimateCount: 3,
  lockToleranceBpm: 2.5,
  unlockToleranceBpm: 4
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const trimmedAverage = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  return trimmed.reduce((total, value) => total + value, 0) / trimmed.length;
};

const average = (values: number[]) => (
  values.reduce((total, value) => total + value, 0) / values.length
);

const getLinearRegressionSlope = (values: number[]) => {
  const count = values.length;
  const sumX = (count * (count - 1)) / 2;
  const sumX2 = ((count - 1) * count * ((2 * count) - 1)) / 6;
  const sumY = values.reduce((total, value) => total + value, 0);
  const sumXY = values.reduce((total, value, index) => total + (index * value), 0);
  const denominator = (count * sumX2) - (sumX * sumX);
  return denominator === 0 ? null : ((count * sumXY) - (sumX * sumY)) / denominator;
};

const getLongestStableSegment = (intervals: TapInterval[], stableIndexes: Set<number>) => {
  let bestStart = -1;
  let bestEnd = -1;
  let currentStart = -1;

  intervals.forEach((interval, listIndex) => {
    if (!stableIndexes.has(interval.index)) {
      if (currentStart >= 0) {
        const currentEnd = listIndex - 1;
        const currentLength = currentEnd - currentStart + 1;
        const bestLength = bestEnd - bestStart + 1;
        if (currentLength > bestLength || (currentLength === bestLength && currentStart > bestStart)) {
          bestStart = currentStart;
          bestEnd = currentEnd;
        }
      }
      currentStart = -1;
      return;
    }

    if (currentStart < 0) {
      currentStart = listIndex;
    }
  });

  if (currentStart >= 0) {
    const currentEnd = intervals.length - 1;
    const currentLength = currentEnd - currentStart + 1;
    const bestLength = bestEnd - bestStart + 1;
    if (currentLength > bestLength || (currentLength === bestLength && currentStart > bestStart)) {
      bestStart = currentStart;
      bestEnd = currentEnd;
    }
  }

  return bestStart >= 0 ? intervals.slice(bestStart, bestEnd + 1) : [];
};

export const getRecentTapTimes = (
  previousTapTimes: number[],
  nextTapTime: number,
  { resetAfterMs, maxSamples }: RecentTapOptions
) => (
  [...previousTapTimes.filter((time) => nextTapTime - time < resetAfterMs), nextTapTime]
    .slice(-maxSamples)
);

export const resolveTapTempoDisplayBpm = (
  estimate: TapTempoEstimate,
  previousState: TapTempoLockState = { lockedBpm: null, recentPreciseBpms: [] },
  options: TapTempoDisplayOptions = {}
): TapTempoDisplayResolution => {
  const config = { ...DEFAULT_DISPLAY_OPTIONS, ...options };
  const recentPreciseBpms = [...previousState.recentPreciseBpms, estimate.rawPreciseBpm]
    .filter((value) => Number.isFinite(value))
    .slice(-config.maxRecentEstimates);
  const candidateBpm = Math.round(average(recentPreciseBpms.length > 0 ? recentPreciseBpms : [estimate.preciseBpm]));
  const hasEnoughData = estimate.tapCount >= config.lockAfterTapCount
    && recentPreciseBpms.length >= config.lockAfterEstimateCount
    && estimate.confidence !== 'warming';
  const currentLock = previousState.lockedBpm;

  if (currentLock !== null) {
    const rawDistance = Math.abs(estimate.rawPreciseBpm - currentLock);
    const candidateDistance = Math.abs(candidateBpm - currentLock);
    const shouldKeepLock = rawDistance <= config.lockToleranceBpm || candidateDistance <= 1;
    if (shouldKeepLock) {
      return {
        bpm: currentLock,
        locked: true,
        state: { lockedBpm: currentLock, recentPreciseBpms }
      };
    }

    if (hasEnoughData && rawDistance >= config.unlockToleranceBpm && candidateDistance >= 2) {
      return {
        bpm: candidateBpm,
        locked: true,
        state: { lockedBpm: candidateBpm, recentPreciseBpms }
      };
    }

    return {
      bpm: currentLock,
      locked: true,
      state: { lockedBpm: currentLock, recentPreciseBpms }
    };
  }

  if (hasEnoughData) {
    return {
      bpm: candidateBpm,
      locked: true,
      state: { lockedBpm: candidateBpm, recentPreciseBpms }
    };
  }

  return {
    bpm: estimate.bpm,
    locked: false,
    state: { lockedBpm: null, recentPreciseBpms }
  };
};

export const estimateTapTempo = (
  tapTimes: number[],
  previousBpm: number | null = null,
  options: TapTempoOptions = {}
): TapTempoEstimate | null => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const cleanTapTimes = tapTimes.filter((time) => Number.isFinite(time));
  if (cleanTapTimes.length < 2) {
    return null;
  }

  const intervals = cleanTapTimes.slice(1).map((time, index) => ({
    index,
    intervalMs: time - cleanTapTimes[index]
  }));
  const plausibleIntervals = intervals.filter((interval) => (
    interval.intervalMs >= config.minIntervalMs && interval.intervalMs <= config.maxIntervalMs
  ));
  if (plausibleIntervals.length === 0) {
    return null;
  }

  const medianInterval = median(plausibleIntervals.map((interval) => interval.intervalMs));
  const inlierIntervals = plausibleIntervals.filter((interval) => (
    Math.abs(interval.intervalMs - medianInterval) <= medianInterval * config.outlierTolerance
  ));
  const usableIntervals = inlierIntervals.length >= 2 ? inlierIntervals : plausibleIntervals;
  const usableIndexes = new Set(usableIntervals.map((interval) => interval.index));
  const stableSegment = getLongestStableSegment(intervals, usableIndexes);
  const stableTapTimes = stableSegment.length >= 2
    ? cleanTapTimes.slice(stableSegment[0].index, stableSegment.at(-1)!.index + 2)
    : [];
  const regressionSlope = stableTapTimes.length >= 3 ? getLinearRegressionSlope(stableTapTimes) : null;
  const intervalMs = regressionSlope && regressionSlope >= config.minIntervalMs && regressionSlope <= config.maxIntervalMs
    ? regressionSlope
    : trimmedAverage(usableIntervals.map((interval) => interval.intervalMs));
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return null;
  }

  const rawPreciseBpm = clamp(60000 / intervalMs, config.minBpm, config.maxBpm);
  const rawBpm = Math.round(rawPreciseBpm);
  const deviations = usableIntervals.map((interval) => Math.abs(interval.intervalMs - intervalMs) / intervalMs);
  const spread = deviations.length > 0
    ? deviations.reduce((total, value) => total + value, 0) / deviations.length
    : 0;
  const usedTapCount = regressionSlope ? stableTapTimes.length : usableIntervals.length + 1;
  const confidence: TapTempoConfidence = cleanTapTimes.length < 4 || usedTapCount < 3
    ? 'warming'
    : spread <= 0.06 && usedTapCount >= 4
      ? 'steady'
      : 'settling';
  let preciseBpm = rawPreciseBpm;

  if (previousBpm !== null && Number.isFinite(previousBpm)) {
    const difference = rawPreciseBpm - previousBpm;
    const absoluteDifference = Math.abs(difference);
    if (absoluteDifference <= config.jitterBlendRangeBpm) {
      preciseBpm = (previousBpm * (1 - config.jitterRawWeight)) + (rawPreciseBpm * config.jitterRawWeight);
    } else {
      preciseBpm = previousBpm + Math.sign(difference) * Math.min(config.maxStepBpm, absoluteDifference);
    }
  }

  const bpm = Math.round(clamp(preciseBpm, config.minBpm, config.maxBpm));

  return {
    bpm,
    rawBpm,
    preciseBpm,
    rawPreciseBpm,
    intervalMs,
    tapCount: cleanTapTimes.length,
    usedTapCount,
    spread,
    confidence
  };
};
