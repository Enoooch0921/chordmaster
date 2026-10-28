import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInvitationAuthReturn, rememberInvitationAuthReturn, safeAuthNextPath, takeInvitationAuthReturn, type InvitationAuthReturn } from './invitationJourney';
const native = vi.hoisted(() => vi.fn(() => false));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native } }));
const invitation: InvitationAuthReturn = { kind: 'setlist', id: 'sl', token: 'invitation', name: 'Sunday', language: 'zh', motion: 'full' };
beforeEach(() => { native.mockReturnValue(false); sessionStorage.clear(); localStorage.clear(); vi.useRealTimers(); });

describe('invitation-only OAuth return', () => {
  it('does nothing for an ordinary login or a manually opened share link', () => {
    expect(takeInvitationAuthReturn('/')).toBeNull();
    expect(takeInvitationAuthReturn('/share/invitation')).toBeNull();
  });
  it.each(['setlist', 'project'] as const)('consumes a matching %s invitation once, so refresh cannot replay it', kind => {
    rememberInvitationAuthReturn({ ...invitation, kind });
    expect(takeInvitationAuthReturn('/share/invitation')).toEqual({ ...invitation, kind });
    expect(takeInvitationAuthReturn('/share/invitation')).toBeNull();
  });
  it('discards mismatched and expired returns', () => {
    rememberInvitationAuthReturn(invitation);
    expect(takeInvitationAuthReturn('/share/another')).toBeNull();
    expect(takeInvitationAuthReturn('/share/invitation')).toBeNull();
    vi.useFakeTimers(); rememberInvitationAuthReturn(invitation); vi.advanceTimersByTime(600001);
    expect(takeInvitationAuthReturn('/share/invitation')).toBeNull(); vi.useRealTimers();
  });
  it('isolates web tabs and supports the native callback store', () => {
    rememberInvitationAuthReturn(invitation);
    expect(localStorage.length).toBe(0);
    clearInvitationAuthReturn(); native.mockReturnValue(true);
    rememberInvitationAuthReturn(invitation);
    expect(sessionStorage.length).toBe(0);
    expect(takeInvitationAuthReturn('/share/invitation')).toEqual(invitation);
  });
  it('fails softly with blocked storage and rejects external return paths', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(() => rememberInvitationAuthReturn(invitation)).not.toThrow();
    expect(takeInvitationAuthReturn('/share/invitation')).toBeNull();
    for (const path of ['//example.com', '/\\example.com', 'https://example.com']) expect(safeAuthNextPath(path)).toBe('/');
  });
});
