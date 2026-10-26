import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: mocks }));
import { createCloudRepository } from './repository';

const makeRepository = () => createCloudRepository({ userId: 'user', email: 'user@example.com', name: 'User' });
beforeEach(() => vi.clearAllMocks());

describe('team administrator role normalization', () => {
  it('preserves the administrator role when listing accessible workspaces', async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    ['select', 'eq', 'order', 'limit'].forEach((method) => { query[method] = vi.fn(() => query); });
    query.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'personal', kind: 'personal' }, error: null });
    query.upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockResolvedValue({ data: [{ id: 'team', name: 'TopWorship', kind: 'team', role: 'admin' }], error: null });
    expect(await makeRepository().listLibraries()).toEqual([expect.objectContaining({ id: 'team', role: 'admin' })]);
  });

  it('preserves administrator members and invitations while rejecting unknown roles', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: {
      members: [{ userId: 'admin-user', role: 'admin' }, { userId: 'unknown-user', role: 'root' }],
      invites: [{ id: 'invite', email: 'admin@example.com', role: 'admin' }]
    } });
    const result = await makeRepository().getTeamManagement('team');
    expect(result.members.map((member) => member.role)).toEqual(['admin', 'viewer']);
    expect(result.invites[0].role).toBe('admin');
  });

  it('keeps the administrator role in the pending invitation inbox', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [{ id: 'invite', libraryId: 'team', email: 'admin@example.com', role: 'admin' }] });
    expect(await makeRepository().getPendingTeamInvites()).toEqual([expect.objectContaining({ role: 'admin' })]);
  });

  it('preserves validated member scopes without treating older or invalid scope payloads as empty', async () => {
    const scope = {
      projects: [{ id: 'p', name: 'Sunday', archived: false }],
      setlists: [{ id: 's', name: 'Worship', projectId: 'p', archived: true, access: 'assigned' }],
    };
    mocks.rpc.mockResolvedValue({ error: null, data: { members: [
      { userId: 'manager', role: 'setlist_manager', scope },
      { userId: 'legacy', role: 'editor' },
      { userId: 'invalid', role: 'editor', scope: { projects: [], setlists: [null] } },
      { userId: 'viewer', role: 'viewer', scope },
    ] } });
    const result = await makeRepository().getTeamManagement('team');
    expect(result.members[0].scope).toEqual(scope);
    expect(result.members.slice(1).map((member) => member.scope)).toEqual([undefined, undefined, undefined]);
  });
});
