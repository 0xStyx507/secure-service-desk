import { useEffect, useState } from 'react';
import { ShieldIcon } from '../../components/Icons';
import { api } from '../../lib/api';
import type { MfaSetup } from '../../types';

export function MfaPanel() {
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
      setEnabled((await api.getMfaStatus()).enabled);
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

  async function startSetup() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      setSetup(await api.setupMfa());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible iniciar MFA.');
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.verifyMfaSetup(code);
      setSetup(undefined);
      setCode('');
      setEnabled(true);
      setMessage('MFA quedo activo. Los siguientes accesos pediran un codigo TOTP.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'El codigo MFA no es valido.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.disableMfa(password, code);
      setEnabled(false);
      setPassword('');
      setCode('');
      setMessage('MFA fue desactivado despues de validar contraseña y TOTP.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible desactivar MFA.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel security-panel" aria-labelledby="mfa-title">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">IDENTITY SECURITY</p>
          <h2 id="mfa-title">Autenticacion multifactor</h2>
        </div>
        <span className={`security-status ${enabled ? 'security-status--on' : ''}`}>
          <i /> {status === 'loading' ? 'Consultando' : enabled ? 'Activo' : 'Opcional'}
        </span>
      </div>

      <p className="muted">
        Protege tu cuenta con TOTP. El secreto se cifra en el backend y nunca se almacena en el
        navegador.
      </p>

      {status === 'error' && (
        <div className="inline-alert" role="alert">
          {error}
          <button onClick={() => void loadStatus()}>Reintentar</button>
        </div>
      )}

      {!enabled && !setup && status !== 'loading' && (
        <div className="security-empty">
          <ShieldIcon />
          <div>
            <strong>MFA no esta configurado</strong>
            <span>
              Genera una clave y registrala en Google Authenticator, 1Password u otra app TOTP.
            </span>
          </div>
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void startSetup()}
          >
            {busy ? 'Generando...' : 'Configurar MFA'}
          </button>
        </div>
      )}

      {setup && (
        <div className="mfa-setup">
          <div className="mfa-setup__steps">
            <span>01</span>
            <strong>Registra el secreto</strong>
            <code>{setup.secret}</code>
            <small>Tambien puedes usar esta URI otpauth:</small>
            <textarea readOnly value={setup.otpauthUri} aria-label="URI de configuracion MFA" />
          </div>
          <div className="mfa-setup__verify">
            <span>02</span>
            <strong>Confirma el codigo actual</strong>
            <input
              aria-label="Codigo para activar MFA"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
            />
            <button
              className="button button--primary"
              disabled={busy || code.length !== 6}
              onClick={() => void verifySetup()}
            >
              Activar MFA
            </button>
          </div>
        </div>
      )}

      {enabled && !setup && (
        <div className="mfa-disable">
          <div>
            <strong>Segundo factor activo</strong>
            <span>El login ahora requiere contraseña y un codigo TOTP de seis digitos.</span>
          </div>
          <div className="mfa-disable__fields">
            <input
              type="password"
              aria-label="Contraseña para desactivar MFA"
              placeholder="Contraseña actual"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              inputMode="numeric"
              aria-label="Codigo para desactivar MFA"
              placeholder="Codigo TOTP"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
            />
            <button
              className="button button--ghost"
              disabled={busy || !password || code.length !== 6}
              onClick={() => void disable()}
            >
              Desactivar MFA
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="success-copy" role="status">
          {message}
        </p>
      )}
      {error && status !== 'error' && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
