import { ShieldIcon } from '../../components/Icons';
import type { AuthState } from './useAuthScreen';

export function MfaLoginForm(state: AuthState) {
  const {
    mfaChallenge,
    mfaCode,
    mfaRemaining,
    error,
    submitting,
    setMfaCode,
    submitMfa,
    cancelMfa,
    retryMfa,
  } = state;
  if (!mfaChallenge) return null;
  return (
    <form onSubmit={submitMfa} className="auth-form mfa-form">
      <div className="mfa-step" aria-hidden="true">
        <ShieldIcon />
        <span>Tu contrasena fue aceptada. Falta el segundo factor.</span>
      </div>
      <MfaCodeInput
        value={mfaCode}
        disabled={submitting || mfaRemaining === 0}
        onChange={setMfaCode}
      />
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
      <button type="button" className="button button--ghost button--wide" onClick={cancelMfa}>
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
  );
}

function MfaCodeInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Codigo de autenticacion
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        placeholder="000000"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        required
        minLength={6}
        maxLength={6}
        autoFocus
        disabled={disabled}
      />
    </label>
  );
}
