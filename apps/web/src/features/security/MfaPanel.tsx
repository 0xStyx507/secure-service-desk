import { ShieldIcon } from '../../components/Icons';
import { useMfaPanel, type MfaState } from './useMfaPanel';

export function MfaPanel() {
  return <MfaView state={useMfaPanel()} />;
}

function MfaView({ state }: { state: MfaState }) {
  return (
    <section className="panel security-panel" aria-labelledby="mfa-title">
      <MfaHeader enabled={state.enabled} status={state.status} />
      <p className="muted">
        Protege tu cuenta con TOTP. El secreto se cifra en el backend y nunca se almacena en el
        navegador.
      </p>
      <MfaError state={state} />
      <MfaBody state={state} />
      {state.message && (
        <p className="success-copy" role="status">
          {state.message}
        </p>
      )}
      {state.error && state.status !== 'error' && (
        <div className="form-error" role="alert">
          {state.error}
        </div>
      )}
    </section>
  );
}

function MfaHeader({ enabled, status }: Pick<MfaState, 'enabled' | 'status'>) {
  return (
    <div className="panel__heading">
      <div>
        <p className="eyebrow">IDENTITY SECURITY</p>
        <h2 id="mfa-title">Autenticación multifactor</h2>
      </div>
      <span className={`security-status ${enabled ? 'security-status--on' : ''}`}>
        <i /> {status === 'loading' ? 'Consultando' : enabled ? 'Activo' : 'Opcional'}
      </span>
    </div>
  );
}

function MfaError({ state }: { state: MfaState }) {
  if (state.status !== 'error') return null;
  return (
    <div className="inline-alert" role="alert">
      {state.error}
      <button onClick={() => void state.loadStatus()}>Reintentar</button>
    </div>
  );
}

function MfaBody({ state }: { state: MfaState }) {
  if (state.status === 'loading') return null;
  if (state.setup) return <MfaSetupForm state={state} />;
  if (state.enabled) return <MfaDisableForm state={state} />;
  return <MfaEmpty state={state} />;
}

function MfaEmpty({ state }: { state: MfaState }) {
  return (
    <div className="security-empty">
      <ShieldIcon />
      <div>
        <strong>MFA no está configurado</strong>
        <span>
          Genera una clave y regístrala en Google Authenticator, 1Password u otra app TOTP.
        </span>
      </div>
      <input
        type="password"
        aria-label="Contraseña para configurar MFA"
        placeholder="Contraseña actual"
        value={state.password}
        onChange={(event) => state.setPassword(event.target.value)}
      />
      <button
        className="button button--primary"
        disabled={state.busy || !state.password}
        onClick={() => void state.startSetup()}
      >
        {state.busy ? 'Generando...' : 'Configurar MFA'}
      </button>
    </div>
  );
}

function MfaSetupForm({ state }: { state: MfaState }) {
  if (!state.setup) return null;
  return (
    <div className="mfa-setup">
      <div className="mfa-setup__steps">
        <span>01</span>
        <strong>Registra el secreto</strong>
        <code>{state.setup.secret}</code>
        <small>También puedes usar esta URI otpauth:</small>
        <textarea readOnly value={state.setup.otpauthUri} aria-label="URI de configuración MFA" />
      </div>
      <div className="mfa-setup__verify">
        <span>02</span>
        <strong>Confirma el código actual</strong>
        <input
          aria-label="Código para activar MFA"
          inputMode="numeric"
          placeholder="000000"
          value={state.code}
          onChange={(event) => state.setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
        />
        <input
          type="password"
          aria-label="Contraseña para confirmar MFA"
          placeholder="Confirma tu contraseña"
          value={state.password}
          onChange={(event) => state.setPassword(event.target.value)}
        />
        <button
          className="button button--primary"
          disabled={state.busy || state.code.length !== 6}
          onClick={() => void state.verifySetup()}
        >
          Activar MFA
        </button>
      </div>
    </div>
  );
}

function MfaDisableForm({ state }: { state: MfaState }) {
  return (
    <div className="mfa-disable">
      <div>
        <strong>Segundo factor activo</strong>
        <span>El login ahora requiere contraseña y un código TOTP de seis dígitos.</span>
      </div>
      <div className="mfa-disable__fields">
        <input
          type="password"
          aria-label="Contraseña para desactivar MFA"
          placeholder="Contraseña actual"
          value={state.password}
          onChange={(event) => state.setPassword(event.target.value)}
        />
        <input
          inputMode="numeric"
          aria-label="Código para desactivar MFA"
          placeholder="Código TOTP"
          value={state.code}
          onChange={(event) => state.setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          maxLength={6}
        />
        <button
          className="button button--ghost"
          disabled={state.busy || !state.password || state.code.length !== 6}
          onClick={() => void state.disable()}
        >
          Desactivar MFA
        </button>
      </div>
    </div>
  );
}
