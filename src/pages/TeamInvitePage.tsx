import { useEffect, useState, type ReactNode } from 'react';
import { Check, LoaderCircle, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { signInWithGoogleRedirect, useSupabaseAuth } from '../lib/auth';
import { getTeamRoleDescription, getTeamRoleLabel } from '../constants/teamRoles';
import { createCloudRepository } from '../lib/repository';
import { AppLanguage, PendingTeamInvite } from '../types';

const getUnknownErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length > 0) return parts.join('\n');
  }
  return '';
};

const getTeamInviteErrorMessage = (error: unknown, fallback: string) => {
  const reason = getUnknownErrorMessage(error);
  return reason ? `${fallback}\n\n${reason}` : fallback;
};

const InviteShell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-stone-50 px-5 py-10">
    <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-7 shadow-xl shadow-stone-200/60 sm:p-8">{children}</div>
  </div>
);

const InviteError = ({ message }: { message: string }) => (
  <div className="mt-4 whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-700">{message}</div>
);

export default function TeamInvitePage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { user, status } = useSupabaseAuth();
  const language: AppLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const [invite, setInvite] = useState<PendingTeamInvite | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isStartingSignIn, setIsStartingSignIn] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || status === 'loading' || !user) return;

    let isCancelled = false;
    const loadInvite = async () => {
      try {
        setIsLoadingInvite(true);
        const repository = createCloudRepository({ userId: user.id, email: user.email, name: user.name, picture: user.picture });
        const invites = await repository.getPendingTeamInvites();
        const matchingInvite = invites.find((item) => item.token === token) ?? null;
        if (!isCancelled) {
          setInvite(matchingInvite);
          setErrorMessage(matchingInvite ? null : (language === 'zh'
            ? '找不到這份邀請。邀請可能已失效、已處理，或不是寄給目前登入的帳號。'
            : 'This invite is unavailable. It may be expired, already handled, or intended for another account.'));
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getTeamInviteErrorMessage(error, language === 'zh' ? '無法載入團隊邀請。' : 'Unable to load this team invite.'));
        }
      } finally {
        if (!isCancelled) setIsLoadingInvite(false);
      }
    };

    void loadInvite();
    return () => {
      isCancelled = true;
    };
  }, [language, status, token, user]);

  const handleSignIn = async () => {
    if (!token || isStartingSignIn) return;
    try {
      setIsStartingSignIn(true);
      await signInWithGoogleRedirect(`/team-invite/${token}`);
    } catch (error) {
      setErrorMessage(getTeamInviteErrorMessage(error, language === 'zh' ? '無法開始登入。' : 'Unable to start sign-in.'));
      setIsStartingSignIn(false);
    }
  };

  const handleAccept = async () => {
    if (!invite || !user || isAccepting) return;
    try {
      setIsAccepting(true);
      const repository = createCloudRepository({ userId: user.id, email: user.email, name: user.name, picture: user.picture });
      const libraryId = await repository.acceptPendingTeamInvite(invite.id);
      navigate(`/?team=${encodeURIComponent(libraryId)}`, { replace: true });
    } catch (error) {
      setErrorMessage(getTeamInviteErrorMessage(error, language === 'zh' ? '無法加入團隊。' : 'Unable to join this team.'));
      setIsAccepting(false);
    }
  };

  if (!token) {
    return <InviteShell><InviteError message={language === 'zh' ? '邀請連結不完整。' : 'The invite link is incomplete.'} /></InviteShell>;
  }

  if (status === 'loading' || isLoadingInvite || (user && !invite && !errorMessage)) {
    return (
      <InviteShell>
        <div className="flex items-center gap-3 text-sm font-semibold text-stone-600">
          <LoaderCircle size={18} className="animate-spin text-indigo-600" />
          {language === 'zh' ? '正在確認邀請…' : 'Checking your invitation…'}
        </div>
      </InviteShell>
    );
  }

  if (!user) {
    return (
      <InviteShell>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><Users size={23} /></div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-stone-900">{language === 'zh' ? '團隊邀請' : 'Team invitation'}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {language === 'zh' ? '請先登入受邀的 Google 帳號，再確認是否加入團隊。' : 'Sign in with the invited Google account, then confirm whether you want to join.'}
        </p>
        {errorMessage ? <InviteError message={errorMessage} /> : null}
        <button type="button" onClick={() => void handleSignIn()} disabled={isStartingSignIn} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60">
          {isStartingSignIn ? <LoaderCircle size={17} className="animate-spin" /> : null}
          {language === 'zh' ? '登入後確認邀請' : 'Sign in to review'}
        </button>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      {invite ? (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><Users size={23} /></div>
          <div className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">{language === 'zh' ? '邀請你加入' : 'You are invited to'}</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{invite.libraryName}</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {language === 'zh' ? `${invite.inviterName || invite.inviterEmail} 邀請你加入這個團隊。` : `${invite.inviterName || invite.inviterEmail} invited you to join this team.`}
          </p>
          <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="text-xs font-bold text-stone-800">{getTeamRoleLabel(invite.role, language)}</div>
            <div className="mt-1 text-xs leading-5 text-stone-500">{getTeamRoleDescription(invite.role, language)}</div>
          </div>
          {errorMessage ? <InviteError message={errorMessage} /> : null}
          <div className="mt-6 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => navigate('/', { replace: true })} disabled={isAccepting} className="h-11 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-600 disabled:opacity-50">
              {language === 'zh' ? '稍後再說' : 'Not now'}
            </button>
            <button type="button" onClick={() => void handleAccept()} disabled={isAccepting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60">
              {isAccepting ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}
              {language === 'zh' ? '確認加入團隊' : 'Confirm and join'}
            </button>
          </div>
        </>
      ) : <InviteError message={errorMessage ?? (language === 'zh' ? '找不到這份邀請。' : 'Invite not found.')} />}
    </InviteShell>
  );
}
