import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';

describe('AuthScreen', () => {
  it('submits credentials through the login contract', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onLogin={onLogin} onRegister={vi.fn()} />);

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

  it('explains that self-registration grants only USER access', () => {
    render(<AuthScreen onLogin={vi.fn()} onRegister={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Registrarme' }));
    expect(screen.getByText(/únicamente el rol USER/i)).toBeInTheDocument();
  });

  it('submits a new USER registration through its dedicated contract', async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    render(<AuthScreen onLogin={vi.fn()} onRegister={onRegister} />);
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
    render(<AuthScreen onLogin={onLogin} onRegister={vi.fn()} />);
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
