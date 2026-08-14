import { useEffect, useState } from 'react';
import { authApi } from '../auth/api';
import type { MfaSetup } from '../../types';

export function useMfaPanel() {
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<MfaSetup>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function loadStatus() {
    setStatus('loading');
    try {
      setEnabled((await authApi.getMfaStatus()).enabled);
      setStatus('ready');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No fue posible consultar el estado MFA.',
      );
      setStatus('error');
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);
  const actions = useMfaActions({
    password,
    code,
    setSetup,
    setCode,
    setPassword,
    setEnabled,
    setBusy,
    setError,
    setMessage,
  });
  return {
    enabled,
    setup,
    code,
    password,
    status,
    busy,
    message,
    error,
    setCode,
    setPassword,
    loadStatus,
    ...actions,
  };
}

function useMfaActions({
  password,
  code,
  setSetup,
  setCode,
  setPassword,
  setEnabled,
  setBusy,
  setError,
  setMessage,
}: {
  password: string;
  code: string;
  setSetup: (value: MfaSetup | undefined) => void;
  setCode: (value: string) => void;
  setPassword: (value: string) => void;
  setEnabled: (value: boolean) => void;
  setBusy: (value: boolean) => void;
  setError: (value: string | undefined) => void;
  setMessage: (value: string | undefined) => void;
}) {
  async function runAction(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback);
    } finally {
      setBusy(false);
    }
  }
  async function startSetup() {
    await runAction(
      async () => setSetup(await authApi.setupMfa(password)),
      'No fue posible iniciar MFA.',
    );
  }
  async function verifySetup() {
    await runAction(async () => {
      await authApi.verifyMfaSetup(password, code);
      setSetup(undefined);
      setCode('');
      setEnabled(true);
      setMessage('MFA quedó activo. Los siguientes accesos pedirán un código TOTP.');
    }, 'El código MFA no es válido.');
  }
  async function disable() {
    await runAction(async () => {
      await authApi.disableMfa(password, code);
      setEnabled(false);
      setPassword('');
      setCode('');
      setMessage('MFA fue desactivado después de validar contraseña y TOTP.');
    }, 'No fue posible desactivar MFA.');
  }
  return { startSetup, verifySetup, disable };
}

export type MfaState = ReturnType<typeof useMfaPanel>;
