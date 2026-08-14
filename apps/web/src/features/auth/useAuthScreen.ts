import { useEffect, useState } from 'react';
import type { MfaChallenge } from '../../types';
import { useAuthActions } from './useAuthActions';

export interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<MfaChallenge | undefined>;
  onCompleteMfa: (challengeToken: string, code: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
}
export type AuthMode = 'login' | 'register';

export function useAuthScreen({ onLogin, onCompleteMfa, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge>();
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRemaining, setMfaRemaining] = useState(0);
  useEffect(() => {
    if (!mfaChallenge) {
      setMfaRemaining(0);
      return;
    }
    const expiresAt = Date.now() + mfaChallenge.expiresIn * 1_000;
    const updateRemaining = () =>
      setMfaRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000)));
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1_000);
    return () => window.clearInterval(timer);
  }, [mfaChallenge]);
  const actions = useAuthActions({
    mode,
    email,
    password,
    mfaChallenge,
    mfaCode,
    mfaRemaining,
    onLogin,
    onCompleteMfa,
    onRegister,
    setMfaChallenge,
    setMfaCode,
  });
  return {
    mode,
    email,
    password,
    error: actions.error,
    submitting: actions.submitting,
    mfaChallenge,
    mfaCode,
    mfaRemaining,
    setEmail,
    setPassword,
    setMfaCode,
    setMode,
    setError: actions.setError,
    submit: actions.submit,
    submitMfa: actions.submitMfa,
    retryMfa: actions.retryMfa,
    cancelMfa: actions.cancelMfa,
  };
}

export type AuthState = ReturnType<typeof useAuthScreen>;
