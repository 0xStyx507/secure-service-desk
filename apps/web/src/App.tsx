import { useEffect, useState } from 'react';
import { ShieldIcon } from './components/Icons';
import { AuthScreen } from './features/auth/AuthScreen';
import { Workspace } from './features/workspace/Workspace';
import { api } from './lib/api';
import type { CurrentUser } from './types';

export default function App() {
  const [user, setUser] = useState<CurrentUser>();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [recoveryError, setRecoveryError] = useState<string>();

  useEffect(() => {
    api.setSessionExpiredHandler(() => setUser(undefined));
    void restoreSession();
    return () => api.setSessionExpiredHandler(undefined);
  }, []);

  async function restoreSession() {
    setBootstrapping(true);
    setRecoveryError(undefined);
    try {
      setUser(await api.restore());
    } catch {
      setRecoveryError('La API no respondió durante la recuperación de la sesión.');
    } finally {
      setBootstrapping(false);
    }
  }

  async function login(email: string, password: string) {
    setUser(await api.login(email, password));
  }

  async function register(email: string, password: string) {
    setUser(await api.register(email, password));
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Local logout still completes if server-side revocation is unavailable.
    } finally {
      setUser(undefined);
    }
  }

  if (bootstrapping) {
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

  if (recoveryError) {
    return (
      <main className="boot-screen recovery-screen" role="alert">
        <span className="brand__mark">
          <ShieldIcon />
        </span>
        <strong>No pudimos recuperar tu sesión</strong>
        <p>{recoveryError}</p>
        <div>
          <button className="button button--primary" onClick={() => void restoreSession()}>
            Reintentar
          </button>
          <button className="button button--ghost" onClick={() => setRecoveryError(undefined)}>
            Ir al acceso
          </button>
        </div>
      </main>
    );
  }

  if (!user) return <AuthScreen onLogin={login} onRegister={register} />;

  return <Workspace user={user} onLogout={logout} />;
}
