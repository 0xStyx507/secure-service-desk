import { useEffect, useState } from 'react';
import { ShieldIcon } from './components/Icons';
import { AuthScreen } from './features/auth/AuthScreen';
import { Workspace } from './features/workspace/Workspace';
import { authApi } from './features/auth/api';
import type { CurrentUser, MfaChallenge } from './types';

export default function App() {
  const [user, setUser] = useState<CurrentUser>();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string>();

  useEffect(() => {
    authApi.setSessionExpiredHandler(() => setUser(undefined));
    void restoreSession();
    return () => authApi.setSessionExpiredHandler(undefined);
  }, []);

  async function restoreSession() {
    setBootstrapping(true);
    setRecoveryError(undefined);
    try {
      setUser(await authApi.restore());
    } catch {
      setRecoveryError('La API no respondió durante la recuperación de la sesión.');
    } finally {
      setBootstrapping(false);
    }
  }

  async function login(email: string, password: string): Promise<MfaChallenge | undefined> {
    const result = await authApi.login(email, password);
    if ('mfaRequired' in result) return result;
    setUser(result);
    return undefined;
  }

  async function completeMfaLogin(challengeToken: string, code: string) {
    setUser(await authApi.completeMfaLogin(challengeToken, code));
  }

  async function register(email: string, password: string) {
    setUser(await authApi.register(email, password));
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Local logout still completes if server-side revocation is unavailable.
    } finally {
      setUser(undefined);
    }
  }

  if (bootstrapping) return <BootScreen />;
  if (recoveryError) {
    return (
      <RecoveryScreen
        message={recoveryError}
        onRetry={restoreSession}
        onDismiss={() => setRecoveryError(undefined)}
      />
    );
  }
  if (!user)
    return <AuthScreen onLogin={login} onCompleteMfa={completeMfaLogin} onRegister={register} />;
  return <Workspace user={user} onLogout={logout} />;
}

function BootScreen() {
  return (
    <main className="boot-screen" aria-label="Restaurando sesión">
      <span className="brand__mark">
        <ShieldIcon />
      </span>
      <strong>Secure Service Desk</strong>
      <span className="boot-line">
        <i />
      </span>
    </main>
  );
}

function RecoveryScreen({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <main className="boot-screen recovery-screen" role="alert">
      <span className="brand__mark">
        <ShieldIcon />
      </span>
      <strong>No pudimos recuperar tu sesión</strong>
      <p>{message}</p>
      <div>
        <button className="button button--primary" onClick={() => void onRetry()}>
          Reintentar
        </button>
        <button className="button button--ghost" onClick={onDismiss}>
          Ir al acceso
        </button>
      </div>
    </main>
  );
}
