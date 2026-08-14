import { FormEvent, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

function ChangePassword() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setIsLoading(true);

    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowToast(true);
      window.setTimeout(() => setShowToast(false), 3000);
    } catch {
      setError('Unable to change password. Please check your current password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F1F4F9] px-6 py-10 text-[#1E293B]">
      {showToast ? (
        <div className="fixed right-6 top-6 rounded-md border border-[#EFF2F6] bg-white px-4 py-3 text-sm font-semibold text-[#185FA5] shadow-sm">
          Password changed successfully.
        </div>
      ) : null}

      <section className="mx-auto max-w-xl rounded-lg border border-[#EFF2F6] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-[#185FA5]">Account Security</p>
        <h1 className="mt-3 text-2xl font-bold">Change Password</h1>
        <p className="mt-2 text-[#5B6E8C]">Update your password to keep your account secure.</p>

        <form onSubmit={handleSubmit} className="mt-7">
          <label className="block text-sm font-semibold" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-[#EFF2F6] bg-[#F8F9FC] px-3 text-sm outline-none focus:border-[#185FA5] focus:bg-white"
            required
          />

          <label className="mt-5 block text-sm font-semibold" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            className="mt-2 h-11 w-full rounded-md border border-[#EFF2F6] bg-[#F8F9FC] px-3 text-sm outline-none focus:border-[#185FA5] focus:bg-white"
            required
          />

          <label className="mt-5 block text-sm font-semibold" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            className="mt-2 h-11 w-full rounded-md border border-[#EFF2F6] bg-[#F8F9FC] px-3 text-sm outline-none focus:border-[#185FA5] focus:bg-white"
            required
          />

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
              'Change password'
            )}
          </button>
        </form>
      </section>
    </main>
  );
}

export default ChangePassword;
