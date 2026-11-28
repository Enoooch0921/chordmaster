import { useCallback, useState } from 'react';
import { DEFAULT_PRACTICE_TUNING, type PracticeTuning } from '../lib/practiceTuning';

export interface PlaybackTuning {
  tuning: PracticeTuning;
  setTuning: (tuning: PracticeTuning) => void;
}

export function usePlaybackTuning(identity: string | null): PlaybackTuning {
  const [state, setState] = useState({ identity, tuning: DEFAULT_PRACTICE_TUNING });
  if (state.identity !== identity) {
    setState({ identity, tuning: DEFAULT_PRACTICE_TUNING });
  }
  const setTuning = useCallback((tuning: PracticeTuning) => {
    // A player for the previous song may finish during navigation.
    setState(current => current.identity === identity && current.tuning !== tuning ? { identity, tuning } : current);
  }, [identity]);
  return { tuning: state.identity === identity ? state.tuning : DEFAULT_PRACTICE_TUNING, setTuning };
}
