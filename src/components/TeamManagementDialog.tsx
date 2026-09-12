import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, Copy, LoaderCircle, Mail, UserPlus, X } from 'lucide-react';
import { EDITABLE_TEAM_ROLES, getTeamRoleDescription, getTeamRoleLabel } from '../constants/teamRoles';
import type { AppLanguage, LibraryRole, TeamInvite, TeamManagementSnapshot } from '../types';

interface TeamManagementDialogProps {
  language: AppLanguage;
  teamName: string;
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

export default function TeamManagementDialog(props: TeamManagementDialogProps) {
  const {
    language, teamName, snapshot, loading, error, inviteEmail, inviteRole,
    inviteShareUrl, creatingInvite, updatingUserId, onClose, onRetry,
    onEmailChange, onRoleChange, onCreateInvite, onCopyUrl, onCopyInvite,
    onRevokeInvite, onUpdateRole, onRemoveMember,
  } = props;
  const zh = language === 'zh';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const emailId = useId();
  const roleId = useId();
  const [view, setView] = useState<'members' | 'invites' | 'invite'>('members');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const directoryView = view === 'invites' ? 'invites' : 'members';
  const members = snapshot?.members ?? [];
  const invites = snapshot?.invites ?? [];
  const busy = creatingInvite || Boolean(updatingUserId) || pendingActionId !== null;

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
    setPendingActionId(id);
    try { await action(); } finally { setPendingActionId(null); }
  };

  const copyLink = async (id: string, action: () => Promise<boolean>) => {
    setCopyError(null);
    try {
      if (await action()) {
        setCopiedId(id);
      } else {
        setCopyError(zh ? '無法複製連結，請再試一次。' : 'Unable to copy the link. Please try again.');
      }
    } catch {
      setCopyError(zh ? '無法複製連結，請再試一次。' : 'Unable to copy the link. Please try again.');
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl rounded-2xl overflow-hidden border-0 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm border border-gray-200"
    >
      <div className="flex max-h-[90dvh] min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-500">{zh ? '團隊管理' : 'Team management'}</p>
            <h2 id={titleId} className="truncate text-base font-semibold" title={teamName}>{teamName}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} autoFocus aria-label={zh ? '關閉團隊管理' : 'Close team management'} className="flex size-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-40"><X size={22} /></button>
        </header>

        {error || copyError ? (
          <div role="alert" className="max-h-32 shrink-0 overflow-y-auto border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
            <p className="whitespace-pre-line break-words">{error || copyError}</p>
            {error && !snapshot ? <button type="button" onClick={onRetry} disabled={loading} className="mt-1 min-h-11 font-bold underline">{zh ? '重新載入' : 'Try again'}</button> : null}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-auto flex-col">
          <section aria-label={zh ? '團隊名單' : 'Team directory'} className={`${view === 'invite' ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-auto flex-col`}>
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-1">
              <nav aria-label={zh ? '名單分類' : 'Directory views'} className="flex gap-4">
                {(['members', 'invites'] as const).map((tab) => (
                  <button key={tab} type="button" aria-pressed={directoryView === tab} onClick={() => setView(tab)} className={`flex min-h-11 items-center gap-1 border-b-2 text-sm font-medium transition-colors ${directoryView === tab ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                    {tab === 'members' ? (zh ? '成員' : 'Members') : (zh ? '待接受' : 'Pending')}
                    <span className="text-xs tabular-nums text-gray-400">{tab === 'members' ? members.length : invites.length}</span>
                  </button>
                ))}
              </nav>
              <button type="button" onClick={() => setView('invite')} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><UserPlus size={16} />{zh ? '邀請' : 'Invite'}</button>
            </div>

            <div aria-busy={loading} className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-4 pb-2">
              {loading && !snapshot ? <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500"><LoaderCircle size={18} className="animate-spin" />{zh ? '載入成員…' : 'Loading members…'}</div> : null}
              {snapshot && view !== 'invites' ? (
                <ul className="divide-y divide-gray-100">
                  {members.map((member) => (
                    <li key={member.userId} className="py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold">{member.name || member.email}</p>
                          {member.name ? <p className="break-all text-xs leading-5 text-gray-500">{member.email}</p> : null}
                        </div>
                        {member.role === 'owner' ? (
                          <span className="shrink-0 text-xs text-gray-500">{getTeamRoleLabel(member.role, language)}</span>
                        ) : (
                          <button type="button" disabled={busy} aria-expanded={editingMemberId === member.userId} aria-label={zh ? `編輯 ${member.name || member.email} 的權限` : `Edit role for ${member.name || member.email}`} onClick={() => setEditingMemberId((current) => current === member.userId ? null : member.userId)} className="inline-flex min-h-11 max-w-[45%] shrink-0 items-center gap-1 rounded-lg px-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            <span>{getTeamRoleLabel(member.role, language)}</span><ChevronDown size={13} className="shrink-0" />
                          </button>
                        )}
                      </div>
                      {member.role !== 'owner' && editingMemberId === member.userId ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-l-2 border-indigo-100 pl-3">
                          <select value={member.role} onChange={(event) => void onUpdateRole(member.userId, event.target.value as Exclude<LibraryRole, 'owner'>)} disabled={busy} aria-label={zh ? `調整 ${member.name || member.email} 的權限` : `Change role for ${member.name || member.email}`} className="min-h-11 min-w-0 max-w-full flex-1 rounded-lg border border-gray-200 bg-white px-2 text-base text-gray-700 disabled:opacity-50 sm:text-sm">
                            {EDITABLE_TEAM_ROLES.map((role) => <option key={role} value={role}>{getTeamRoleLabel(role, language)}</option>)}
                          </select>
                          <button type="button" onClick={() => void runAction(member.userId, () => onRemoveMember(member.userId))} disabled={busy} aria-label={zh ? `移除 ${member.name || member.email}` : `Remove ${member.name || member.email}`} className="min-h-11 rounded-lg px-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40">{zh ? '移除' : 'Remove'}</button>
                          {updatingUserId === member.userId || pendingActionId === member.userId ? <LoaderCircle size={15} className="animate-spin text-indigo-600" /> : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {snapshot && view === 'invites' ? invites.length === 0 ? (
                <div className="py-16 text-center"><Mail size={28} className="mx-auto mb-3 text-gray-300" /><p className="text-sm font-medium text-gray-600">{zh ? '沒有待接受的邀請' : 'No pending invitations'}</p><p className="mt-2 text-xs text-gray-400">{zh ? '新的邀請會顯示在這裡。' : 'New invitations will appear here.'}</p></div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {invites.map((invite) => (
                    <li key={invite.id} className="py-4 first:pt-1">
                      <p className="break-all text-sm font-semibold leading-6">{invite.email}</p>
                      <p className="mt-1 text-xs text-gray-500">{getTeamRoleLabel(invite.role, language)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void copyLink(invite.id, () => onCopyInvite(invite))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{copiedId === invite.id ? <Check size={15} /> : <Copy size={15} />}{copiedId === invite.id ? (zh ? '已複製' : 'Copied') : (zh ? '複製連結' : 'Copy link')}</button>
                        <button type="button" onClick={() => void runAction(invite.id, () => onRevokeInvite(invite.id))} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-gray-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40">{pendingActionId === invite.id ? <LoaderCircle size={15} className="animate-spin" /> : null}{zh ? '取消邀請' : 'Cancel invite'}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <aside aria-label={zh ? '邀請新成員' : 'Invite a member'} className={`${view === 'invite' ? 'flex' : 'hidden'} min-h-0 flex-auto flex-col overflow-y-auto overscroll-contain px-4 pb-4`}>
            <button type="button" onClick={() => setView('members')} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm text-gray-500"><ArrowLeft size={17} />{zh ? '返回成員名單' : 'Back to members'}</button>
            <h3 className="text-base font-semibold">{zh ? '邀請新成員' : 'Invite a member'}</h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">{zh ? '填寫對方的登入信箱，再分享邀請連結。' : 'Enter their sign-in email, then share the invitation link.'}</p>
            <form onSubmit={(event) => { event.preventDefault(); if (!busy && inviteEmail.trim()) void onCreateInvite(); }} className="mt-4 space-y-3">
              <div>
                <label htmlFor={emailId} className="block text-xs font-semibold text-gray-600">{zh ? '電子郵件' : 'Email address'}</label>
                <input id={emailId} type="email" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={inviteEmail} onChange={(event) => onEmailChange(event.target.value)} placeholder="name@gmail.com" disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50" />
              </div>
              <div>
                <label htmlFor={roleId} className="block text-xs font-semibold text-gray-600">{zh ? '成員權限' : 'Member role'}</label>
                <select id={roleId} value={inviteRole} onChange={(event) => onRoleChange(event.target.value as Exclude<LibraryRole, 'owner'>)} disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-800 outline-none focus:border-indigo-500 disabled:opacity-50">{EDITABLE_TEAM_ROLES.map((role) => <option key={role} value={role}>{getTeamRoleLabel(role, language)}</option>)}</select>
                <p className="mt-2 text-xs leading-5 text-gray-500">{getTeamRoleDescription(inviteRole, language)}</p>
              </div>
              <button type="submit" disabled={busy || !inviteEmail.trim()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">{creatingInvite ? <LoaderCircle size={17} className="animate-spin" /> : <UserPlus size={17} />}{creatingInvite ? (zh ? '建立邀請中…' : 'Creating invite…') : (zh ? '建立邀請連結' : 'Create invite link')}</button>
            </form>
            {inviteShareUrl ? (
              <div role="status" className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-indigo-800"><Check size={16} />{zh ? '邀請連結已準備好' : 'Your invitation link is ready'}</p>
                <p className="mt-1 text-xs leading-5 text-indigo-700">{zh ? '將連結傳給對方，登入後即可確認加入。' : 'Share it with the invitee so they can sign in and join.'}</p>
                <button type="button" onClick={() => void copyLink(inviteShareUrl, () => onCopyUrl(inviteShareUrl))} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-semibold text-indigo-700"><Copy size={15} />{copiedId === inviteShareUrl ? (zh ? '已複製' : 'Copied') : (zh ? '複製邀請連結' : 'Copy invite link')}</button>
              </div>
            ) : null}
            <details className="mt-3 border-t border-gray-100 pt-2">
              <summary className="min-h-11 cursor-pointer text-xs font-medium leading-6 text-gray-500">{zh ? '查看所有權限說明' : 'Compare all roles'}</summary>
              <div className="space-y-4 pb-3">{EDITABLE_TEAM_ROLES.map((role) => <div key={role}><p className="text-xs font-semibold text-gray-700">{getTeamRoleLabel(role, language)}</p><p className="mt-1 text-xs leading-5 text-gray-500">{getTeamRoleDescription(role, language)}</p></div>)}</div>
            </details>
          </aside>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
