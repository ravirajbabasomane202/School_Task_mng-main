import { FormEvent, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('chairman@school.com');
  const [password, setPassword] = useState('chairman123');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ email, password });

      if (!rememberMe) {
        localStorage.removeItem('refreshToken');
      }
    } catch (loginError) {
      if (axios.isAxiosError(loginError) && loginError.response?.status === 401) {
        setError('Invalid email or password.');
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F1F4F9] px-4 py-10 text-[#1E293B]">
      <section className="w-full max-w-[420px] rounded-lg border border-[#EFF2F6] bg-[#FFFFFF] px-8 py-9 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-[#185FA5] text-[11px] font-bold text-white">
            EP
          </div>
          <h1 className="mt-4 text-2xl font-bold leading-8 text-[#1E293B]">EduTask Pro</h1>
          <p className="mt-1 text-sm font-medium text-[#5B6E8C]">School Staff Task Management</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <label className="block text-sm font-semibold text-[#1E293B]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-md border border-[#EFF2F6] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none transition focus:border-[#185FA5] focus:bg-white"
            placeholder="chairman@school.com"
            required
          />

          <label className="mt-5 block text-sm font-semibold text-[#1E293B]" htmlFor="password">
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-11 w-full rounded-md border border-[#EFF2F6] bg-[#F8F9FC] px-3 pr-16 text-sm text-[#1E293B] outline-none transition focus:border-[#185FA5] focus:bg-white"
              placeholder="Enter password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#185FA5]"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <label className="mt-5 flex items-center gap-2 text-sm font-medium text-[#5B6E8C]">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-[#EFF2F6] accent-[#185FA5]"
            />
            Remember me
          </label>

          {error ? (
            <div className="mt-5 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-md bg-[#185FA5] px-4 text-sm font-semibold text-white transition hover:bg-[#144f89] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </section>
    </main>
  );
}

export default Login;
