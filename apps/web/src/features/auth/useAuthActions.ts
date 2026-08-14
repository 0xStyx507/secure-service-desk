import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { MfaChallenge } from '../../types';
import type { AuthMode } from './useAuthScreen';

interface AuthActionDependencies {
  mode: AuthMode;
  email: string;
  password: string;
  mfaChallenge?: MfaChallenge;
  mfaCode: string;
  mfaRemaining: number;
  onLogin: (email: string, password: string) => Promise<MfaChallenge | undefined>;
  onCompleteMfa: (challengeToken: string, code: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  setMfaChallenge: Dispatch<SetStateAction<MfaChallenge | undefined>>;
  setMfaCode: Dispatch<SetStateAction<string>>;
}

export function useAuthActions(deps: AuthActionDependencies) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      if (deps.mode === 'login') {
        const challenge = await deps.onLogin(deps.email, deps.password);
        if (challenge) deps.setMfaChallenge(challenge);
      } else await deps.onRegister(deps.email, deps.password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible autenticar la sesión.');
    } finally {
      setSubmitting(false);
    }
  }
  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deps.mfaChallenge) return;
    if (deps.mfaRemaining === 0)
      return setError('El desafío MFA expiró. Solicita uno nuevo para continuar.');
    setError(undefined);
    setSubmitting(true);
    try {
      await deps.onCompleteMfa(deps.mfaChallenge.challengeToken, deps.mfaCode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible validar el código MFA.');
    } finally {
      setSubmitting(false);
    }
  }
  async function retryMfa() {
    setError(undefined);
    setSubmitting(true);
    try {
      const challenge = await deps.onLogin(deps.email, deps.password);
      if (!challenge) return deps.setMfaChallenge(undefined);
      deps.setMfaCode('');
      deps.setMfaChallenge(challenge);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No fue posible generar un nuevo desafío MFA.',
      );
    } finally {
      setSubmitting(false);
    }
  }
  function cancelMfa() {
    if (submitting) return;
    deps.setMfaChallenge(undefined);
    deps.setMfaCode('');
    setError(undefined);
  }
  return { error, submitting, submit, submitMfa, retryMfa, cancelMfa, setError };
}
