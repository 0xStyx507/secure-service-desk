import { useEffect, useState, type FormEvent } from 'react';
import { ShieldIcon } from '../../components/Icons';
import type { MfaChallenge } from '../../types';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<MfaChallenge | undefined>;
  onCompleteMfa: (challengeToken: string, code: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
}

export function AuthScreen({ onLogin, onCompleteMfa, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const challenge = await onLogin(email, password);
        if (challenge) setMfaChallenge(challenge);
      } else {
        await onRegister(email, password);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible autenticar la sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaChallenge) return;
    if (mfaRemaining === 0) {
      setError('El desafio MFA expiro. Solicita uno nuevo para continuar.');
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      await onCompleteMfa(mfaChallenge.challengeToken, mfaCode);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible validar el codigo MFA.');
    } finally {
      setSubmitting(false);
    }
  }

  async function retryMfa() {
    setError(undefined);
    setSubmitting(true);
    try {
      const challenge = await onLogin(email, password);
      if (!challenge) {
        setMfaChallenge(undefined);
        return;
      }
      setMfaCode('');
      setMfaChallenge(challenge);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No fue posible generar un nuevo desafio MFA.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function cancelMfa() {
    if (submitting) return;
    setMfaChallenge(undefined);
    setMfaCode('');
    setError(undefined);
  }

  function changeMode(nextMode: 'login' | 'register') {
    setMode(nextMode);
    setError(undefined);
  }

  return (
    <main className="auth-page">
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
            <div>
              <span>01</span>
              <p>
                <strong>JWT RS256</strong>Sesiones de corta duración
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Audit trail</strong>Eventos persistentes
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Async jobs</strong>BullMQ y workers
              </p>
            </div>
          </div>
        </div>


      </section>

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
            {mfaChallenge
              ? mfaRemaining > 0
                ? `Introduce el codigo de tu app autenticadora. Quedan ${mfaRemaining} segundos.`
                : 'El desafio MFA expiro. Solicita uno nuevo para continuar.'
              : mode === 'login'
                ? 'Accede para gestionar la cola de servicio.'
                : 'Los nuevos registros reciben únicamente el rol USER.'}
          </p>

          {!mfaChallenge && (
            <div className="segmented" role="tablist" aria-label="Tipo de acceso">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => changeMode('login')}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => changeMode('register')}
              >
                Registrarme
              </button>
            </div>
          )}

          {mfaChallenge ? (
            <form onSubmit={submitMfa} className="auth-form mfa-form">
              <div className="mfa-step" aria-hidden="true">
                <ShieldIcon />
                <span>Tu contrasena fue aceptada. Falta el segundo factor.</span>
              </div>
              <label>
                Codigo de autenticacion
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(event) =>
                    setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  required
                  minLength={6}
                  maxLength={6}
                  autoFocus
                  disabled={submitting || mfaRemaining === 0}
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="button button--primary button--wide"
                disabled={submitting || mfaRemaining === 0 || mfaCode.length !== 6}
              >
                {submitting ? 'Verificando...' : 'Completar acceso'}
              </button>
              <button
                type="button"
                className="button button--ghost button--wide"
                onClick={cancelMfa}
              >
                Volver al inicio de sesion
              </button>
              {mfaRemaining === 0 && (
                <button
                  type="button"
                  className="text-button"
                  disabled={submitting}
                  onClick={() => void retryMfa()}
                >
                  Solicitar nuevo desafio
                </button>
              )}
            </form>
          ) : (
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
              {mode === 'register' && (
                <p className="field-hint">Incluye mayúscula, minúscula y número.</p>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button className="button button--primary button--wide" disabled={submitting}>
                {submitting
                  ? 'Validando…'
                  : mode === 'login'
                    ? 'Entrar a la consola'
                    : 'Crear cuenta'}
              </button>
            </form>
          )}

          <p className="session-note">
            El token de acceso se mantiene en memoria. La sesión extendida usa una cookie HttpOnly.
          </p>
        </div>
      </section>
    </main>
  );
}
