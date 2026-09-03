import type { ReactNode } from 'react';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import { formatDate } from '../../utils/dateUtils';
import type { Register } from '../../types/register.types';

interface RegisterDetailsModalProps {
  register: Register | null;
  onClose: () => void;
}

const STATUS_BADGE: Record<Register['status'], 'gray' | 'green' | 'red'> = {
  IDLE: 'gray',
  OK: 'green',
  REJECTED: 'red',
};

const CYCLE_LABEL: Record<Register['checking_cycle'], string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  '15_DAYS': '15 Days',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-Yearly',
  YEARLY: 'Yearly',
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[#F1F4F9] py-2 last:border-0">
      <span className="text-xs text-[#8A99B0]">{label}</span>
      <span className="text-sm font-medium text-[#1E293B]">{value}</span>
    </div>
  );
}

function RegisterDetailsModal({ register, onClose }: RegisterDetailsModalProps) {
  return (
    <Modal isOpen={!!register} onClose={onClose} title="Register Details">
      {register ? (
        <div>
          <Row label="Register Name" value={register.name} />
          <Row label="Register No." value={register.register_no} />
          <Row label="Head Name" value={register.head_name} />
          <Row label="Checking Cycle" value={CYCLE_LABEL[register.checking_cycle]} />
          <Row label="Priority" value={register.priority} />
          <Row label="Start Date" value={formatDate(register.start_date)} />
          <Row label="Next Due Date" value={formatDate(register.next_due_date)} />
          <Row label="Status" value={<Badge variant={STATUS_BADGE[register.status]}>{register.status}</Badge>} />
        </div>
      ) : null}
    </Modal>
  );
}

export default RegisterDetailsModal;
