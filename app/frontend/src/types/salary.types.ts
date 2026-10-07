export type SalaryStatus = 'PENDING_HR' | 'PENDING_FINANCE' | 'APPROVED' | 'REJECTED';

export interface SalaryIncrement {
  id: number;
  employee_id: number;
  current_salary: number;
  proposed_salary: number;
  increment_pct: number;
  reason?: string;
  status: SalaryStatus;
  requested_by: number;
  hr_approved_by?: number;
  finance_approved_by?: number;
  created_at: string;
  processed_at?: string;
  employee?: { id: number; name: string; role: string; department?: string };
  requester?: { id: number; name: string };
  hr_approver?: { id: number; name: string };
  finance_approver?: { id: number; name: string };
}

export interface CreateSalaryIncrementPayload {
  employee_id: number;
  current_salary: number;
  proposed_salary: number;
  reason?: string;
}

export interface HRApproveSalaryPayload {
  comment?: string;
}

export interface FinanceProcessSalaryPayload {
  status: 'APPROVED' | 'REJECTED';
  comment?: string;
}
