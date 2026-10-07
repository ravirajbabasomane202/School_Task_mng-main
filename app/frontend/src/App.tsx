import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';
import AppRouter from './routes/AppRouter';
import { refreshToken } from './services/authService';
import { logout, setCredentials } from './store/authSlice';
import { useAppDispatch } from './store/hooks';
import { store } from './store';
import type { AuthUser } from './types/user.types';

const queryClient = new QueryClient();

function AppBootstrap() {
  const dispatch = useAppDispatch();
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const savedUser = localStorage.getItem('authUser');
      const savedRefreshToken = localStorage.getItem('refreshToken');
      const savedAccessToken = sessionStorage.getItem('accessToken');

      if (savedAccessToken || !savedUser || !savedRefreshToken) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const user = JSON.parse(savedUser) as AuthUser;
        const refreshed = await refreshToken();

        dispatch(
          setCredentials({
            user,
            accessToken: refreshed.accessToken
          })
        );
      } catch {
        dispatch(logout());
      } finally {
        setIsBootstrapping(false);
      }
    };

    void restoreSession();
  }, [dispatch]);

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F1F4F9] text-[#1E293B]">
        <div className="rounded-[18px] border border-[#EFF2F6] bg-white px-5 py-4 text-sm font-medium shadow-sm">
          Restoring your session...
        </div>
      </main>
    );
  }

  return <AppRouter />;
}

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              border: '1px solid #EFF2F6',
              borderRadius: '14px',
              color: '#1E293B'
            }
          }}
        />
        <AppBootstrap />
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
