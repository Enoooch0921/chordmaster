import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { signInWithGoogleRedirect, useSupabaseAuth } from '../lib/auth';
import { createCloudRepository } from '../lib/repository';

export default function TeamInvitePage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { user, status } = useSupabaseAuth();
  const [message, setMessage] = useState('Checking your team invite...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMessage('Missing invite token.');
      return;
    }

    if (status === 'loading') {
      return;
    }

    if (!user) {
      setMessage('Redirecting to Google sign-in...');
      void signInWithGoogleRedirect(`/team-invite/${token}`).catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to start sign-in.');
      });
      return;
    }

    let isCancelled = false;
    const acceptInvite = async () => {
      try {
        setMessage('Accepting your team invite...');
        const repository = createCloudRepository({
          userId: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        });
        const libraryId = await repository.acceptTeamInvite(token);
        if (!isCancelled) {
          navigate(`/?team=${encodeURIComponent(libraryId)}`, { replace: true });
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to accept this invite.');
        }
      }
    };

    void acceptInvite();
    return () => {
      isCancelled = true;
    };
  }, [navigate, status, token, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/60">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Team Invite</h1>
        <p className={`mt-3 text-sm leading-6 ${errorMessage ? 'text-rose-700' : 'text-stone-600'}`}>
          {errorMessage ?? message}
        </p>
      </div>
    </div>
  );
}
