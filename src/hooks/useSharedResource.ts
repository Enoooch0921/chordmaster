import { useEffect, useState } from 'react';
import type { SharedResourcePayload } from '../types';
import { resolveShareLink, ShareLinkResolutionError } from '../lib/sharing';
import { normalizeSharedSongs } from '../lib/sharedSongNormalization';

export const SHARED_RESOURCE_REFRESH_MS = 5000;

interface SharedResourceState {
  token: string;
  payload: SharedResourcePayload | null;
  isLoading: boolean;
  errorMessage: string | null;
  refreshFailed: boolean;
}

const initialState = (token: string): SharedResourceState => ({
  token, payload: null, isLoading: Boolean(token),
  errorMessage: token ? null : 'Missing share token.', refreshFailed: false
});

/** Public viewers refresh through the token-checked endpoint, without table access. */
export const useSharedResource = (token: string) => {
  const [state, setState] = useState(() => initialState(token));

  useEffect(() => {
    setState(initialState(token));
    if (!token) return;

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    let hasPayload = false;
    let signature: string | null = null;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const canRefresh = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };

    const refresh = async () => {
      if (cancelled || stopped || inFlight || !canRefresh()) return;
      clearTimer();
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await resolveShareLink(token, controller.signal);
        if (cancelled) return;
        // Compare server data before normalization, which can generate legacy IDs.
        // Identical responses retain the same chart objects and mounted UI.
        const nextSignature = JSON.stringify(response);
        const nextPayload = nextSignature === signature ? null : normalizeSharedSongs(response);
        signature = nextSignature;
        hasPayload = true;
        failures = 0;
        setState((current) => !nextPayload && !current.refreshFailed && !current.errorMessage
          ? current
          : { token, payload: nextPayload ?? current.payload, isLoading: false, errorMessage: null, refreshFailed: false });
      } catch (error) {
        if (cancelled) return;
        failures += 1;
        const message = error instanceof Error ? error.message : 'Unable to load shared chart.';
        if (error instanceof ShareLinkResolutionError && [400, 403, 404, 410].includes(error.status ?? 0)) {
          stopped = true;
          setState({ token, payload: null, isLoading: false, errorMessage: message, refreshFailed: false });
        } else {
          setState((current) => ({ ...current, isLoading: false,
            errorMessage: hasPayload ? null : message, refreshFailed: hasPayload }));
        }
      } finally {
        inFlight = false;
        if (!cancelled && !stopped && canRefresh()) {
          timer = setTimeout(() => void refresh(), Math.min(30000, SHARED_RESOURCE_REFRESH_MS * 2 ** Math.min(failures, 3)));
        }
      }
    };

    const resume = () => {
      clearTimer();
      if (canRefresh()) void refresh();
    };
    const offline = () => {
      clearTimer();
      setState((current) => ({ ...current, refreshFailed: Boolean(current.payload) }));
    };
    if (navigator.onLine === false) {
      setState({ ...initialState(token), isLoading: false, errorMessage: 'Offline. Waiting for a connection.' });
    } else {
      void refresh();
    }
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [token]);

  return state.token === token ? state : initialState(token);
};
