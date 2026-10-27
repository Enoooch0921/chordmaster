import { useLayoutEffect, useRef, useState, useTransition } from 'react';

/** Paint an acknowledgement before scheduling an expensive chart render. */
export function useSetlistOpening(scope: string | null) {
  const [opening, setOpening] = useState<{ id: string; name: string } | null>(null);
  const [, startTransition] = useTransition();
  const request = useRef(0);
  const frame = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  useLayoutEffect(() => {
    setOpening(null);
    return () => {
      request.current++;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [scope]);

  const begin = (id: string, name: string) => {
    const token = ++request.current;
    setOpening({ id, name });
    return token;
  };
  const commit = (token: number, navigate: () => void) => {
    if (token !== request.current) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (timer.current !== null) window.clearTimeout(timer.current);
    // The timeout runs after the frame containing the loading feedback paints.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (token !== request.current) return;
        startTransition(() => {
          navigate();
          setOpening(null);
        });
      }, 0);
    });
  };
  return { opening, begin, commit };
}
