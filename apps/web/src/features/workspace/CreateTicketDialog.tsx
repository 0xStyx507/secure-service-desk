import type { FormEvent, RefObject } from 'react';
import { CloseIcon } from '../../components/Icons';
import type { Ticket } from '../../types';
import { useCreateTicketDialog } from './useCreateTicketDialog';

export function CreateTicketDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ticket: Ticket) => Promise<void>;
}) {
  const form = useCreateTicketDialog(onClose, onCreated);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && form.close()}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        aria-busy={form.saving}
      >
        <button
          className="dialog__close"
          onClick={form.close}
          aria-label="Cerrar"
          disabled={form.saving}
        >
          <CloseIcon />
        </button>
        <DialogForm {...form} />
      </section>
    </div>
  );
}

function DialogForm({
  subject,
  description,
  error,
  saving,
  subjectInput,
  setSubject,
  setDescription,
  submit,
  close,
}: {
  subject: string;
  description: string;
  error?: string;
  saving: boolean;
  subjectInput: RefObject<HTMLInputElement | null>;
  setSubject: (value: string) => void;
  setDescription: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  close: () => void;
}) {
  return (
    <>
      <p className="eyebrow">NEW REQUEST</p>
      <h2 id="create-title">¿Cómo podemos ayudarte?</h2>
      <p className="muted">
        Describe el incidente con suficiente contexto para que soporte pueda actuar.
      </p>
      <form onSubmit={submit} className="dialog-form">
        <DialogFields
          subject={subject}
          description={description}
          subjectInput={subjectInput}
          setSubject={setSubject}
          setDescription={setDescription}
        />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <DialogActions saving={saving} onClose={close} />
      </form>
    </>
  );
}

function DialogFields({
  subject,
  description,
  subjectInput,
  setSubject,
  setDescription,
}: {
  subject: string;
  description: string;
  subjectInput: RefObject<HTMLInputElement | null>;
  setSubject: (value: string) => void;
  setDescription: (value: string) => void;
}) {
  return (
    <>
      <label>
        Asunto
        <input
          ref={subjectInput}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          minLength={3}
          maxLength={160}
          required
          placeholder="Ej. No puedo acceder al portal"
        />
      </label>
      <label>
        Descripción
        <textarea
          aria-label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={10}
          maxLength={10000}
          required
          rows={6}
          placeholder="Qué ocurrió, cuándo comenzó y qué intentaste…"
        />
      </label>
    </>
  );
}

function DialogActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return (
    <div className="dialog__actions">
      <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button className="button button--primary" disabled={saving}>
        {saving ? 'Creando…' : 'Crear ticket'}
      </button>
    </div>
  );
}
