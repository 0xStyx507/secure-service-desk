import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ticketsApi } from '../tickets/api';
import type { Ticket } from '../../types';

export function useCreateTicketDialog(
  onClose: () => void,
  onCreated: (ticket: Ticket) => Promise<void>,
) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const subjectInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    subjectInput.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, saving]);
  function close() {
    if (!saving) onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await onCreated(await ticketsApi.create(subject, description));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible crear el ticket.');
    } finally {
      setSaving(false);
    }
  }
  return {
    subject,
    description,
    error,
    saving,
    subjectInput,
    setSubject,
    setDescription,
    close,
    submit,
  };
}
