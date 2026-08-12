import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

describe('AuthScreen', () => {
  it('submits credentials through the login contract', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onLogin={onLogin} onCompleteMfa={vi.fn()} onRegister={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'Portfolio123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a la consola' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('user@example.com', 'Portfolio123');
    });
  });

  it('renders the second factor challenge and completes MFA login', async () => {
    const onLogin = vi.fn().mockResolvedValue({
      mfaRequired: true,
      challengeToken: 'challenge-token-that-is-long-enough-for-the-demo',
      expiresIn: 300,
    });
    const onCompleteMfa = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onLogin={onLogin} onCompleteMfa={onCompleteMfa} onRegister={vi.fn()} />);

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'mfa@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Contrase/), {
      target: { value: 'Portfolio123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a la consola' }));

    expect(
      await screen.findByRole('heading', { name: 'Verificacion en dos pasos' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Codigo de autenticacion'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Completar acceso' }));

    await waitFor(() => {
      expect(onCompleteMfa).toHaveBeenCalledWith(
        'challenge-token-that-is-long-enough-for-the-demo',
        '123456',
      );
    });
  });

  it('explains that self-registration grants only USER access', () => {
    render(<AuthScreen onLogin={vi.fn()} onCompleteMfa={vi.fn()} onRegister={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Registrarme' }));
    expect(screen.getByText(/únicamente el rol USER/i)).toBeInTheDocument();
  });

  it('submits a new USER registration through its dedicated contract', async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onLogin={vi.fn()} onCompleteMfa={vi.fn()} onRegister={onRegister} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Registrarme' }));
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'new.user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'Portfolio123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(onRegister).toHaveBeenCalledWith('new.user@example.com', 'Portfolio123');
    });
  });

  it('renders authentication failures as accessible text', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Credenciales inválidas.'));
    render(<AuthScreen onLogin={onLogin} onCompleteMfa={vi.fn()} onRegister={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'Portfolio123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a la consola' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas.');
  });
});
