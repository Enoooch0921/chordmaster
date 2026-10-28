import { Capacitor } from '@capacitor/core';
import type { AppLanguage } from '../types';

export interface InvitationResource {
  kind: 'setlist' | 'project';
  id: string;
  name: string;
  token: string;
  language: AppLanguage;
}
export type InvitationMotion = 'full' | 'reduced' | 'instant';
export interface InvitationAuthReturn extends InvitationResource { motion: InvitationMotion }

const AUTH_RETURN_KEY = 'chordmaster.invitation-auth-return.v1';
const AUTH_RETURN_TTL = 10 * 60 * 1000;
const storage = () => Capacitor.isNativePlatform() ? window.localStorage : window.sessionStorage;
export const invitationPath = (token: string) => `/share/${encodeURIComponent(token)}`;
export const invitationTarget = (resource: InvitationResource) => `${resource.kind}:${resource.id}`;

export function clearInvitationAuthReturn() {
  try { storage().removeItem(AUTH_RETURN_KEY); } catch { /* Motion is optional when storage is blocked. */ }
}

/** Written only by a Google sign-in initiated from a resolved setlist/project invitation. */
export function rememberInvitationAuthReturn(value: InvitationAuthReturn) {
  try { storage().setItem(AUTH_RETURN_KEY, JSON.stringify({ ...value, createdAt: Date.now() })); }
  catch { /* Authentication still works without the return animation. */ }
}

/** Consume before returning. Reload, history navigation and unrelated sign-ins cannot replay it. */
export function takeInvitationAuthReturn(nextPath: string): InvitationAuthReturn | null {
  try {
    const raw = storage().getItem(AUTH_RETURN_KEY);
    clearInvitationAuthReturn();
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !['setlist', 'project'].includes(value.kind)
      || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string'
      || typeof value.token !== 'string' || !value.token
      || !['zh', 'en'].includes(value.language) || !['full', 'reduced', 'instant'].includes(value.motion)
      || typeof value.createdAt !== 'number' || value.createdAt > Date.now()
      || Date.now() - value.createdAt > AUTH_RETURN_TTL
      || nextPath !== invitationPath(value.token)) return null;
    return { kind: value.kind, id: value.id, name: value.name, token: value.token, language: value.language, motion: value.motion };
  } catch { return null; }
}

export const safeAuthNextPath = (path: string | null) => (
  path?.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/'
);
