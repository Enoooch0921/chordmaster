import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, Copy, LoaderCircle, Search, UserMinus, UserPlus, X } from 'lucide-react';
import { EDITABLE_TEAM_ROLES, TEAM_ROLES, canManageTeamMember, getAssignableTeamRoles, getTeamRoleDescription, getTeamRoleLabel } from '../constants/teamRoles';
import type { AppLanguage, LibraryRole, TeamInvite, TeamManagementSnapshot } from '../types';
import TeamScopeDetails from './TeamScopeDetails';

interface TeamManagementDialogProps {
  language: AppLanguage;
  teamName: string;
  currentUserRole: LibraryRole;
  snapshot: TeamManagementSnapshot | null;
  loading: boolean;
  error: string | null;
  inviteEmail: string;
  inviteRole: Exclude<LibraryRole, 'owner'>;
  inviteShareUrl: string | null;
  creatingInvite: boolean;
  updatingUserId: string | null;
  onClose: () => void;
  onRetry: () => void;
  onEmailChange: (email: string) => void;
  onRoleChange: (role: Exclude<LibraryRole, 'owner'>) => void;
  onCreateInvite: () => Promise<void>;
  onCopyUrl: (url: string) => Promise<boolean>;
  onCopyInvite: (invite: TeamInvite) => Promise<boolean>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onUpdateRole: (userId: string, role: Exclude<LibraryRole, 'owner'>) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
}

function TeamRoleGuide({ language }: { language: AppLanguage }) {
  const zh = language === 'zh';
  return (
    <details className="group border-t border-stone-100">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[11px] text-stone-500 hover:text-stone-800 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />{zh ? '權限說明' : 'About roles'}
      </summary>
      <dl className="space-y-3 pb-4 text-xs leading-5">{TEAM_ROLES.map((role) => <div key={role} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3"><dt className="font-medium text-stone-700">{getTeamRoleLabel(role, language)}</dt><dd className="text-stone-500">{getTeamRoleDescription(role, language)}</dd></div>)}</dl>
      <p className="pb-4 text-xs leading-5 text-stone-500">{zh ? '改為僅可檢視會移除歌單協作指派；日後恢復編輯角色時，需重新指派。' : 'Changing to View Only removes setlist assignments. Reassign them if editing access is restored later.'}</p>
    </details>
  );
}

export default function TeamManagementDialog(props: TeamManagementDialogProps) {
  const {
    language, teamName, currentUserRole, snapshot, loading, error, inviteEmail, inviteRole,
    inviteShareUrl, creatingInvite, updatingUserId, onClose, onRetry,
    onEmailChange, onRoleChange, onCreateInvite, onCopyUrl, onCopyInvite,
    onRevokeInvite, onUpdateRole, onRemoveMember,
  } = props;
  const zh = language === 'zh';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionInFlight = useRef(false);
  const titleId = useId();
  const emailId = useId();
  const roleId = useId();
  const [view, setView] = useState<'members' | 'invites' | 'invite'>('members');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<LibraryRole | 'all'>('all');
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const members = snapshot?.members ?? [];
  const invites = snapshot?.invites ?? [];
  const busy = creatingInvite || Boolean(updatingUserId) || pendingActionId !== null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = (name: string, email: string) => `${name} ${email}`.toLocaleLowerCase().includes(normalizedQuery);
  const visibleMembers = members.filter((member) => (roleFilter === 'all' || member.role === roleFilter) && matchesQuery(member.name, member.email));
  const visibleInvites = invites.filter((invite) => (roleFilter === 'all' || invite.role === roleFilter) && matchesQuery('', invite.email));
  const directoryEntries = view === 'invites' ? invites : members;
  const directoryRoles = view === 'invites' ? EDITABLE_TEAM_ROLES : TEAM_ROLES;
  const hasDirectoryFilter = Boolean(query.trim()) || roleFilter !== 'all';
  const assignableRoles = getAssignableTeamRoles(currentUserRole);
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';
  const creating = creatingInvite || pendingActionId === 'create-invite';

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const runAction = async (id: string, action: () => Promise<void>) => {
    if (actionInFlight.current || busy || loading) return;
    actionInFlight.current = true;
    setActionError(null);
    setPendingActionId(id);
    try { await action(); } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : (zh ? '無法儲存變更，請再試一次。' : 'Unable to save changes. Please try again.'));
    } finally {
      actionInFlight.current = false;
      setPendingActionId(null);
    }
  };

  const copyLink = async (id: string, action: () => Promise<boolean>) => {
    setCopyError(null);
    setCopiedId(null);
    try {
      if (await action()) setCopiedId(id);
      else setCopyError(zh ? '無法複製連結，請再試一次。' : 'Unable to copy the link. Please try again.');
    } catch {
      setCopyError(zh ? '無法複製連結，請再試一次。' : 'Unable to copy the link. Please try again.');
    }
  };

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-modal="true" aria-busy={busy || loading}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-[640px] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-[0_24px_80px_-20px_rgba(28,25,23,0.3)] backdrop:bg-stone-950/35 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex max-h-[90dvh] min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-xl font-semibold tracking-tight" title={teamName}>{teamName}</h2>
            <p className="mt-1 text-xs text-stone-500">{zh ? '你是' : 'Your role: '}{getTeamRoleLabel(currentUserRole, language)}{canManage ? (zh ? ' · 全團隊管理' : ' · Team-wide access') : ''}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} autoFocus aria-label={zh ? '關閉團隊管理' : 'Close team management'} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-50 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-stone-400 disabled:opacity-40"><X size={19} /></button>
        </header>

        {error || actionError || copyError ? <div role="alert" className="mx-4 mb-2 max-h-28 shrink-0 overflow-y-auto rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 sm:mx-6">
          <p className="whitespace-pre-line break-words">{error || actionError || copyError}</p>
          {error ? <button type="button" onClick={onRetry} disabled={loading || busy} className="min-h-11 font-medium underline">{zh ? '重新載入' : 'Try again'}</button> : null}
        </div> : null}

        <section aria-label={zh ? '團隊名單' : 'Team directory'} className={`${view === 'invite' ? 'hidden' : 'flex'} min-h-0 flex-auto flex-col`}>
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 sm:px-6">
            <nav aria-label={zh ? '名單分類' : 'Directory views'} className="flex gap-5">
              {(['members', 'invites'] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab}
                onClick={() => { setView(tab); if (tab === 'invites' && (roleFilter === 'owner' || roleFilter === 'admin')) setRoleFilter('all'); }}
                className={`flex min-h-12 items-center gap-1.5 border-b-2 text-[13px] transition-colors ${view === tab ? 'border-indigo-700 font-semibold text-indigo-800' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
                {tab === 'members' ? (zh ? '成員' : 'Members') : (zh ? '待接受' : 'Pending')}<span className="text-[11px] font-normal tabular-nums text-stone-400">{tab === 'members' ? members.length : invites.length}</span>
              </button>)}
            </nav>
            <button type="button" onClick={() => setView('invite')} disabled={busy || loading || !canManage} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-40"><UserPlus size={15} />{zh ? '邀請' : 'Invite'}</button>
          </div>

          <div className="flex min-h-12 shrink-0 items-center gap-2 border-y border-stone-100 bg-stone-50/60 px-4 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Search size={15} className="shrink-0 text-stone-400" />
              <input aria-label={zh ? '搜尋成員或邀請' : 'Search members or invitations'} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜尋姓名、信箱' : 'Search name or email'} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" />
              {query ? <button type="button" aria-label={zh ? '清除搜尋' : 'Clear search'} onClick={() => setQuery('')} className="flex h-11 w-7 shrink-0 items-center justify-center text-stone-400 hover:text-stone-700"><X size={13} /></button> : null}
            </div>
            <div className="relative ml-1 w-32 max-w-[45%] shrink-0 border-l border-stone-200 pl-2">
              <select aria-label={zh ? '權限篩選' : 'Filter by role'} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as LibraryRole | 'all')} className="h-11 w-full appearance-none truncate bg-transparent pl-1 pr-5 text-xs text-stone-600 outline-none focus-visible:rounded focus-visible:ring-1 focus-visible:ring-stone-400">
                <option value="all">{zh ? '全部權限' : 'All roles'} ({directoryEntries.length})</option>
                {directoryRoles.map((role) => <option key={role} value={role}>{getTeamRoleLabel(role, language)} ({directoryEntries.filter((entry) => entry.role === role).length})</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-stone-400" />
            </div>
          </div>

          <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 sm:px-6">
            {loading && !snapshot ? <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500"><LoaderCircle size={16} className="animate-spin" />{zh ? '載入成員…' : 'Loading members…'}</div> : null}
            {snapshot && ((view === 'invites' && invites.length > 0 && visibleInvites.length === 0) || (view === 'members' && visibleMembers.length === 0)) ? <div className="py-8 text-center text-xs text-stone-500"><p>{zh ? '沒有符合的成員或邀請' : 'No matching members or invitations'}</p>{hasDirectoryFilter ? <button type="button" onClick={() => { setQuery(''); setRoleFilter('all'); }} className="mt-1 min-h-11 px-3 text-stone-800 underline underline-offset-4">{zh ? '清除篩選' : 'Clear filters'}</button> : null}</div> : null}
            {snapshot && view === 'members' ? <ul className="divide-y divide-stone-100">
              {visibleMembers.map((member) => {
                const editable = canManageTeamMember(currentUserRole, member.role);
                const updating = updatingUserId === member.userId || pendingActionId === member.userId;
                const name = member.name || member.email;
                return <li key={member.userId} className="py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[13px] font-medium text-stone-500">{name.slice(0, 1).toLocaleUpperCase()}</span>
                    <div className="min-w-0 flex-1 py-1">
                      <p className="truncate text-[13px] font-medium text-stone-800" title={name}>{name}</p>
                      {member.name ? <p className="mt-0.5 truncate text-xs text-stone-500" title={member.email}>{member.email}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center">
                      {editable ? <div className="relative w-28 sm:w-36">
                        <select value={member.role} aria-label={zh ? `調整 ${name} 的權限` : `Change role for ${name}`} disabled={busy || loading}
                          onChange={(event) => {
                            const nextRole = event.target.value as Exclude<LibraryRole, 'owner'>;
                            if (nextRole !== member.role && canManageTeamMember(currentUserRole, member.role) && assignableRoles.includes(nextRole)) {
                              void runAction(member.userId, () => onUpdateRole(member.userId, nextRole));
                            }
                          }}
                          className="h-11 w-full appearance-none rounded-lg border border-transparent bg-stone-50 pl-2 pr-6 text-sm text-stone-700 outline-none hover:border-stone-300 focus-visible:border-stone-400 disabled:cursor-wait disabled:opacity-45">
                          {assignableRoles.map((role) => <option key={role} value={role}>{getTeamRoleLabel(role, language)}</option>)}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" />
                      </div> : <span className="inline-flex h-11 w-28 items-center pl-2 text-sm text-stone-500 sm:w-36" title={member.role === 'owner' ? (zh ? '擁有者權限受到保護。' : 'The owner is protected.') : (zh ? '只有團隊擁有者可以調整總管理員。' : 'Only the owner can change administrators.')}>{getTeamRoleLabel(member.role, language)}</span>}
                      {editable ? <button type="button" disabled={busy || loading} aria-label={zh ? `移除 ${name}` : `Remove ${name}`} title={zh ? '移除成員' : 'Remove member'} onClick={() => void runAction(member.userId, () => onRemoveMember(member.userId))} className="flex size-11 items-center justify-center rounded-md text-stone-300 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-stone-400 disabled:cursor-wait disabled:opacity-40">{updating ? <LoaderCircle size={15} className="animate-spin text-stone-500" /> : <UserMinus size={15} />}</button> : <span className="size-11" aria-hidden="true" />}
                    </div>
                  </div>
                  <div className="pb-1 pl-10 pr-1"><TeamScopeDetails language={language} role={member.role} scope={member.scope} /></div>
                </li>;
              })}
            </ul> : null}
            {snapshot && view === 'invites' ? invites.length === 0 ? <p className="py-10 text-center text-xs text-stone-500">{zh ? '沒有待接受的邀請' : 'No pending invitations'}</p> : <ul className="divide-y divide-stone-100">
              {visibleInvites.map((invite) => <li key={invite.id} className="flex min-w-0 flex-wrap items-center gap-x-3 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-stone-700" title={invite.email}>{invite.email}</p><p className="mt-1 text-[11px] text-stone-400">{getTeamRoleLabel(invite.role, language)}</p></div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void copyLink(invite.id, () => onCopyInvite(invite))} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-stone-700 hover:bg-stone-50">{copiedId === invite.id ? <Check size={14} /> : <Copy size={14} />}{copiedId === invite.id ? (zh ? '已複製' : 'Copied') : (zh ? '複製連結' : 'Copy link')}</button>
                  <button type="button" onClick={() => void runAction(invite.id, () => onRevokeInvite(invite.id))} disabled={busy || loading || !canManage} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40">{pendingActionId === invite.id ? <LoaderCircle size={14} className="animate-spin" /> : (zh ? '取消邀請' : 'Cancel invite')}</button>
                </div>
              </li>)}
            </ul> : null}
            <TeamRoleGuide language={language} />
          </div>
        </section>

        <aside aria-label={zh ? '邀請新成員' : 'Invite a member'} className={`${view === 'invite' ? 'flex' : 'hidden'} min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6`}>
          <button type="button" onClick={() => setView('members')} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800"><ArrowLeft size={14} />{zh ? '返回成員名單' : 'Back to members'}</button>
          <h3 className="mt-1 text-sm font-semibold">{zh ? '邀請新成員' : 'Invite a member'}</h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">{zh ? '填寫對方的登入信箱，再分享邀請連結。' : 'Enter their sign-in email, then share the invitation link.'}</p>
          <form onSubmit={(event) => { event.preventDefault(); if (canManage && inviteEmail.trim() && EDITABLE_TEAM_ROLES.includes(inviteRole)) void runAction('create-invite', onCreateInvite); }} className="mb-4 mt-4 space-y-3">
            <div><label htmlFor={emailId} className="block text-xs font-medium text-stone-600">{zh ? '電子郵件' : 'Email address'}</label><input id={emailId} type="email" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={inviteEmail} onChange={(event) => onEmailChange(event.target.value)} placeholder="name@gmail.com" disabled={busy || loading} className="mt-1.5 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-base outline-none placeholder:text-stone-300 focus:border-stone-500 disabled:opacity-50" /></div>
            <div><label htmlFor={roleId} className="block text-xs font-medium text-stone-600">{zh ? '成員權限' : 'Member role'}</label><select id={roleId} value={inviteRole} onChange={(event) => onRoleChange(event.target.value as Exclude<LibraryRole, 'owner'>)} disabled={busy || loading} className="mt-1.5 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-stone-500 disabled:opacity-50">{EDITABLE_TEAM_ROLES.map((role) => <option key={role} value={role}>{getTeamRoleLabel(role, language)}</option>)}</select><p className="mt-2 text-xs leading-5 text-stone-500">{getTeamRoleDescription(inviteRole, language)}</p></div>
            <button type="submit" disabled={busy || loading || !canManage || !inviteEmail.trim() || !EDITABLE_TEAM_ROLES.includes(inviteRole)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-800 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-35">{creating ? <LoaderCircle size={15} className="animate-spin" /> : <UserPlus size={15} />}{creating ? (zh ? '建立邀請中…' : 'Creating invite…') : (zh ? '建立邀請連結' : 'Create invite link')}</button>
          </form>
          {inviteShareUrl ? <div role="status" className="mb-4 border-l-2 border-stone-300 pl-3 text-xs text-stone-600"><p className="flex items-center gap-1.5 font-medium"><Check size={14} />{zh ? '邀請連結已準備好' : 'Your invitation link is ready'}</p><button type="button" onClick={() => void copyLink(inviteShareUrl, () => onCopyUrl(inviteShareUrl))} className="inline-flex min-h-11 items-center gap-1.5 text-stone-800 underline underline-offset-4"><Copy size={13} />{copiedId === inviteShareUrl ? (zh ? '已複製' : 'Copied') : (zh ? '複製邀請連結' : 'Copy invite link')}</button></div> : null}
          <TeamRoleGuide language={language} />
        </aside>
      </div>
    </dialog>, document.body,
  );
}
