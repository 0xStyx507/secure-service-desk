import { useState, type FormEvent } from 'react';
import { ShieldIcon } from '../../components/Icons';

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
}

export function AuthScreen({ onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await (mode === 'login' ? onLogin(email, password) : onRegister(email, password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible autenticar la sesión.');
    } finally {
      setSubmitting(false);
    }
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
          <p className="eyebrow eyebrow--light">PORTFOLIO SECURITY PROJECT</p>
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

        <p className="auth-story__foot">Built with NestJS · MongoDB · Redis · TypeScript</p>
      </section>

      <section className="auth-panel" aria-label="Acceso a la demo">
        <div className="auth-card">
          <div className="auth-card__heading">
            <span className="status-dot" aria-hidden="true" />
            <span>Flujo de sesión protegido</span>
          </div>
          <h2>{mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu acceso demo'}</h2>
          <p className="muted">
            {mode === 'login'
              ? 'Accede para gestionar la cola de servicio.'
              : 'Los nuevos registros reciben únicamente el rol USER.'}
          </p>

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

          <p className="session-note">
            El token de acceso se mantiene en memoria. La sesión extendida usa una cookie HttpOnly.
          </p>
        </div>
      </section>
    </main>
  );
}
