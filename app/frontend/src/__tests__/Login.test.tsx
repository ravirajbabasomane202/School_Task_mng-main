import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Login from '../pages/auth/Login';
import * as authService from '../services/authService';
import { Provider } from 'react-redux';
import { store } from '../store';

vi.mock('../services/authService');
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(async (payload) => {
      if (!payload.email || !payload.password) {
        throw new Error('Email and password are required');
      }
      if (payload.email === 'invalid@example.com') {
        const error = new Error('Invalid credentials');
        (error as any).response = { status: 401 };
        throw error;
      }
      return {
        user: { id: 1, role: 'CHAIRMAN', name: 'Test User' },
        accessToken: 'token',
        refreshToken: 'refresh'
      };
    })
  })
}));

const renderLogin = () => {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    </Provider>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should render login form with email and password fields', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: /EduTask Pro/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });

  it('should show validation error when submitting with empty fields', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /Sign in/i });

    // Clear default values
    await user.clear(emailInput);
    await user.clear(passwordInput);

    // HTML5 validation will prevent form submission
    fireEvent.click(submitButton);

    // Browser will show validation errors due to required attributes
    expect(emailInput.hasAttribute('required')).toBe(true);
    expect(passwordInput.hasAttribute('required')).toBe(true);
  });

  it('should show error message on failed login (401 Unauthorized)', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign in/i });

    await user.clear(emailInput);
    await user.clear(passwordInput);
    await user.type(emailInput, 'invalid@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
    });
  });

  it('should show generic error on network/server failure', async () => {
    const user = userEvent.setup();
    
    vi.doMock('../hooks/useAuth', () => ({
      useAuth: () => ({
        login: vi.fn(async () => {
          throw new Error('Network error');
        })
      })
    }));

    renderLogin();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign in/i });

    await user.type(emailInput, 'user@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Unable to sign in/i)).toBeInTheDocument();
    });
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;
    const toggleButton = screen.getByRole('button', { name: /Show/i });

    expect(passwordInput.type).toBe('password');

    await user.click(toggleButton);
    expect(passwordInput.type).toBe('text');

    await user.click(toggleButton);
    expect(passwordInput.type).toBe('password');
  });

  it('should handle remember me checkbox', async () => {
    const user = userEvent.setup();
    renderLogin();

    const rememberCheckbox = screen.getByRole('checkbox', { name: /Remember me/i }) as HTMLInputElement;
    expect(rememberCheckbox.checked).toBe(true);

    await user.click(rememberCheckbox);
    expect(rememberCheckbox.checked).toBe(false);
  });

  it('should have pre-filled default credentials', () => {
    renderLogin();

    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;

    expect(emailInput.value).toBe('chairman@adhira.edu');
    expect(passwordInput.value).toBe('Admin@123');
  });

  it('should disable submit button while loading', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign in/i }) as HTMLButtonElement;

    await user.type(emailInput, 'chairman@adhira.edu');
    await user.type(passwordInput, 'Admin@123');
    await user.click(submitButton);

    // Check if button gets disabled during submission
    expect(submitButton.disabled).toBe(true);
  });
});
