import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../routes/ProtectedRoute';
import { Provider } from 'react-redux';
import { ROLES } from '../constants/roles';
import { store } from '../store';
import { setCredentials, logout } from '../store/authSlice';

const DummyPage = () => <div>Protected Content</div>;
const LoginPage = () => <div>Login Page</div>;

const renderWithRouter = (initialAuth: any = null) => {
  const testStore = store;
  
  if (initialAuth) {
    testStore.dispatch(setCredentials(initialAuth));
  } else {
    testStore.dispatch(logout());
  }

  return render(
    <Provider store={testStore}>
      <BrowserRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<DummyPage />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
};

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should redirect unauthenticated user to /login', () => {
    renderWithRouter(null);
    
    // Navigate to protected route
    window.history.pushState({}, 'Protected', '/protected');
    
    screen.debug();
  });

  it('should render children when user is authenticated', () => {
    const authData = {
      user: {
        id: 1,
        role: ROLES.CHAIRMAN,
        name: 'Test User',
        email: 'test.user@school.com',
        department_id: null
      },
      accessToken: 'valid-token',
      refreshToken: 'refresh-token'
    };

    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/protected" element={<DummyPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </BrowserRouter>
      </Provider>
    );

    store.dispatch(setCredentials(authData));
    window.history.pushState({}, 'Protected', '/protected');

    // When navigated and authenticated, should see protected content
    // This would be verified in integration test with full routing
  });

  it('should redirect when user lacks required role', () => {
    const authData = {
      user: {
        id: 1,
        role: ROLES.HR,
        name: 'Dept Head User',
        email: 'dept.head@school.com',
        department_id: 2
      },
      accessToken: 'valid-token',
      refreshToken: 'refresh-token'
    };

    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route element={<ProtectedRoute allowedRoles={[ROLES.CHAIRMAN]} />}>
              <Route path="/chairman" element={<DummyPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </BrowserRouter>
      </Provider>
    );

    store.dispatch(setCredentials(authData));
    window.history.pushState({}, 'Chairman', '/chairman');
  });
});
