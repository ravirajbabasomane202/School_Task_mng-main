import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { ROLE_LABELS } from '../../constants/roles';
import { getRoleLabel } from '../../utils/roleUtils';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const home =
    user?.role === 'CHAIRMAN'
      ? '/chairman'
      : user?.role === 'DIRECTOR'
      ? '/director'
      : '/department';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F4F9]">
      <div className="w-full max-w-md rounded-2xl border border-[#EFF2F6] bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">
          🔒
        </div>
        <h1 className="mb-2 text-xl font-semibold text-[#1E293B]">Access denied</h1>
        <p className="mb-1 text-sm text-[#5B6E8C]">
          You don't have permission to view this page.
        </p>
        {user && (
          <p className="mb-6 text-xs text-[#8A99B0]">
            Signed in as <span className="font-medium">{getRoleLabel(user.role)}</span>
          </p>
        )}
        <button
          onClick={() => navigate(home, { replace: true })}
          className="rounded-xl bg-[#185FA5] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#0C447C] transition"
        >
          Go to my dashboard
        </button>
      </div>
    </div>
  );
}
