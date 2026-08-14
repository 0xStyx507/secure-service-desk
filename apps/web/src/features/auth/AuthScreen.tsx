import { ShieldIcon } from '../../components/Icons';
import type { MfaChallenge } from '../../types';
import { MfaLoginForm } from './MfaLoginForm';
import {
  useAuthScreen,
  type AuthMode,
  type AuthScreenProps,
  type AuthState,
} from './useAuthScreen';

export function AuthScreen(props: AuthScreenProps) {
  const state = useAuthScreen(props);
  return (
    <main className="auth-page">
      <AuthStory />
      <AuthPanel {...state} />
    </main>
  );
}

function AuthStory() {
  return (
    <section className="auth-story" aria-labelledby="auth-title">
      <a className="brand brand--light" href="/" aria-label="Secure Service Desk">
        <span className="brand__mark">
          <ShieldIcon aria-hidden="true" />
        </span>
        <span>Secure Service Desk</span>
      </a>
      <div className="auth-story__content">
        <p className="eyebrow eyebrow--light">SECURITY PROJECT</p>
        <h1 id="auth-title">
          Soporte operativo.
          <br />
          Seguridad verificable.
        </h1>
        <p>
          Una mesa de servicio diseñada para mostrar autenticación robusta, autorización por rol y
          trazabilidad de cada acción.
        </p>
        <div className="security-proof" aria-label="Controles destacados">
          <ProofItem number="01" title="JWT RS256">
            Sesiones de corta duración
          </ProofItem>
          <ProofItem number="02" title="Audit trail">
            Eventos persistentes
          </ProofItem>
          <ProofItem number="03" title="Async jobs">
            BullMQ y workers
          </ProofItem>
        </div>
      </div>
    </section>
  );
}

function ProofItem({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: string;
}) {
  return (
    <div>
      <span>{number}</span>
      <p>
        <strong>{title}</strong>
        {children}
      </p>
    </div>
  );
}

function AuthPanel(state: AuthState) {
  const { mode, mfaChallenge, mfaRemaining, setMode, setError } = state;
  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(undefined);
  };
  return (
    <section className="auth-panel" aria-label="Acceso a la demo">
      <div className="auth-card">
        <h2>
          {mfaChallenge
            ? 'Verificacion en dos pasos'
            : mode === 'login'
              ? 'Bienvenido de vuelta'
              : 'Crea tu acceso demo'}
        </h2>
        <p className="muted">
          <AuthHint mode={mode} challenge={mfaChallenge} remaining={mfaRemaining} />
        </p>
        {!mfaChallenge && <ModeTabs mode={mode} onChange={changeMode} />}
        {mfaChallenge ? <MfaLoginForm {...state} /> : <CredentialsForm {...state} />}
        <p className="session-note">
          El token de acceso se mantiene en memoria. La sesión extendida usa una cookie HttpOnly.
        </p>
      </div>
    </section>
  );
}

function AuthHint({
  mode,
  challenge,
  remaining,
}: {
  mode: AuthMode;
  challenge?: MfaChallenge;
  remaining: number;
}) {
  if (challenge)
    return remaining > 0
      ? `Introduce el código de tu app autenticadora. Quedan ${remaining} segundos.`
      : 'El desafío MFA expiró. Solicita uno nuevo para continuar.';
  return mode === 'login'
    ? 'Accede para gestionar la cola de servicio.'
    : 'Los nuevos registros reciben únicamente el rol USER.';
}

function ModeTabs({ mode, onChange }: { mode: AuthMode; onChange: (mode: AuthMode) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="Tipo de acceso">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'login'}
        onClick={() => onChange('login')}
      >
        Iniciar sesión
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'register'}
        onClick={() => onChange('register')}
      >
        Registrarme
      </button>
    </div>
  );
}

function CredentialsForm(state: AuthState) {
  const { mode, email, password, error, submitting, setEmail, setPassword, submit } = state;
  return (
    <form onSubmit={submit} className="auth-form">
      <label>
        Correo electrónico
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          name="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="12 caracteres o más"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      {mode === 'register' && <p className="field-hint">Incluye mayúscula, minúscula y número.</p>}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button className="button button--primary button--wide" disabled={submitting}>
        {submitting ? 'Validando…' : mode === 'login' ? 'Entrar a la consola' : 'Crear cuenta'}
      </button>
    </form>
  );
}
