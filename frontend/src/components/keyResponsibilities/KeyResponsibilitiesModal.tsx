import type { User } from '../../types/user.types';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { getRoleLabel } from '../../utils/roleUtils';

interface KeyResponsibilitiesModalProps {
  user: User | null;
  onClose: () => void;
}

/** Read-only profile + responsibilities of ONE selected user (admin view). */
function KeyResponsibilitiesModal({ user, onClose }: KeyResponsibilitiesModalProps) {
  const items = user?.key_responsibilities ?? [];

  return (
    <Modal
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
      }
      isOpen={Boolean(user)}
      onClose={onClose}
      title="Key Responsibilities"
    >
      {user ? (
        <div className="space-y-5" data-testid="key-responsibilities-modal">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A99B0]">User Profile</h3>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#8A99B0]">Name</dt>
                <dd className="font-medium text-[#1E293B]">{user.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8A99B0]">Designation / Head Type</dt>
                <dd className="font-medium text-[#1E293B]">{user.head_type?.trim() || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8A99B0]">Role</dt>
                <dd className="text-[#36506C]">{getRoleLabel(user.role)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8A99B0]">Email</dt>
                <dd className="break-all text-[#36506C]">{user.email}</dd>
              </div>
              {user.department?.name ? (
                <div>
                  <dt className="text-xs text-[#8A99B0]">Department</dt>
                  <dd className="text-[#36506C]">{user.department.name}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-[#8A99B0]">Status</dt>
                <dd className="text-[#36506C]">{user.is_active ? 'Active' : 'Inactive'}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A99B0]">Key Responsibilities</h3>
            {user.responsibility_summary ? (
              <p className="mt-2 rounded-lg bg-[#F4F8FC] px-3 py-2 text-sm text-[#36506C]">
                {user.responsibility_summary}
              </p>
            ) : null}
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-[#8A99B0]">No key responsibilities have been assigned to this user.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <li className="flex gap-3 rounded-lg border border-[#EFF2F6] px-3 py-2 text-sm text-[#1E293B]" key={item.id}>
                    <span className="font-semibold text-[#0C447C]">{index + 1}.</span>
                    <span className="whitespace-pre-line">{item.description}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

export default KeyResponsibilitiesModal;
