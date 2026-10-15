import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '../routes/ProtectedRoute';
import { Provider } from 'react-redux';
import { ROLES } from '../constants/roles';
import { store } from '../store';
import { setCredentials, logout as clearCredentials } from '../store/authSlice';
import { useAuth } from '../hooks/useAuth';
import * as authService from '../services/authService';

vi.mock('../services/authService', async () => {
  const actual = await vi.importActual<typeof import('../services/authService')>('../services/authService');
  return { ...actual, logout: vi.fn(async () => undefined) };
});

const Location = () => <output data-testid="location">{useLocation().pathname}</output>;
const Landing = () => <><h1>Home</h1><Location /></>;
const LoginPage = () => <><h1>Login Page</h1><output data-testid="from">{useLocation().state?.from?.pathname}</output><Location /></>;
const ProtectedPage = () => {
  const { logout } = useAuth();
  return <><h1>Protected Content</h1><button onClick={() => void logout()}>Logout</button><Location /></>;
};

function renderRoutes(initialEntries: string[] = ['/protected'], authenticated = false) {
  store.dispatch(clearCredentials());
  if (authenticated) {
    store.dispatch(setCredentials({
      user: { id: 1, role: ROLES.CHAIRMAN, name: 'Test User', email: 'test@school.com', department_id: null },
      accessToken: 'token', refreshToken: 'refresh'
    }));
  }
  return render(<Provider store={store}><MemoryRouter initialEntries={initialEntries}><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}><Route path="/protected" element={<ProtectedPage />} /></Route>
  </Routes></MemoryRouter></Provider>);
}

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('sends a directly opened protected URL to login and preserves its origin', async () => {
    renderRoutes();
    expect(await screen.findByRole('heading', { name: 'Login Page' })).toBeInTheDocument();
    expect(screen.getByTestId('from')).toHaveTextContent('/protected');
  });

  it('renders children when the user is authenticated', () => {
    renderRoutes(['/protected'], true);
    expect(screen.getByRole('heading', { name: 'Protected Content' })).toBeInTheDocument();
  });

  it('clicking Logout lands on / without routing through login', async () => {
    renderRoutes(['/protected'], true);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
    expect(authService.logout).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Login Page' })).not.toBeInTheDocument();
  });
});
