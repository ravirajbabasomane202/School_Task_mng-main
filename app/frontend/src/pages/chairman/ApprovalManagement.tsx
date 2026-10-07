import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Button from '../../components/common/Button';
import { MODULE_TASK_GROUPS } from '../../constants/moduleTasks';
import { getAllApprovals, approveApproval, rejectApproval } from '../../services/approvalService';
import * as taskService from '../../services/taskService';
import { APPROVAL_TYPE_META } from '../../types/approval.types';
import type { Approval, ApprovalStatus } from '../../types/approval.types';

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

// ── Module / Head Wise predefined task list ─────────────────────────────────
const MODULE_TASK_MAP: Array<{ head: string; tasks: string[] }> = [
  {
    head: 'School Director',
    tasks: [
      'Academic PPT Submission (Every Month 1st Tuesday)',
      'Checking all Academic Registers',
      'Academic Syllabus Status Reporting (Monthly)',
      'Create Yearly Academic Plan',
      'Create Academic Time Table',
      'Teachers Workload Status',
      'Event Calendar',
      'Admission Status',
      'LC Report',
      'Parent Grievance Mgt',
      'Class Observation',
      'Teachers Recruitment Chart',
      'Teachers Appraisal',
      'Exam Mgt',
      'Competition Mgt',
      'Campus Visit Status',
      'MCB (MyClassBoard) Notification Status',
      'Inspection Status',
      'Extra Curriculum',
      'All Committee Status',
    ],
  },
  {
    head: 'Admin Head',
    tasks: [
      'CBSC Affiliation File Status (Yearly)',
      'School Documents Files Mgt',
      'Govt Permission Renewal',
      'Master Policy File Mgt',
      'Central Register Completion Status (Monthly)',
      'Vendor Management',
      'ID Card Distribution Status',
      'Uniform Distribution Status',
      'Books Distribution Status',
      'Fire Safety Report Status',
      'Lift Safety Report Status',
    ],
  },
  {
    head: 'Admin Assistance',
    tasks: [
      'GR Records Maintenance',
      'LC Records Maintenance',
      'UDIS (Student) Records',
      'Teachers Training Status',
      'Outword & Inword Mgt',
      'Bonafide Application File',
      'Original Docs Return Register',
      'Service Book Status',
      'All Staff File Record Keeping',
    ],
  },
  {
    head: 'Finance Head',
    tasks: [
      'Fees Collection Status',
      'Salary Mgt',
      'Vendor Payment Mgt',
      'Vendor Payment Approval',
      'ITR File (Yearly)',
      'Professional TAX and TDS Filling Status (Monthly)',
      'Yearly Budget',
      'Monthly Income and Expenses Status',
      'Event & Celebration Expenses',
      'Property Tax, Light Bill and Water Bill Payment Status',
      'HOD Register',
    ],
  },
  {
    head: 'Admission Head / Marketing Executive',
    tasks: [
      'Admission Status',
      'Admission Enquiry (Daily)',
      'School Marketing on Facebook, Instagram and LinkedIn',
      'Marketing Banner Design',
      'HOD Register',
    ],
  },
  {
    head: 'HR Head',
    tasks: [
      'New Appointment Status',
      'Training',
      'PR',
      'Staff Grievance',
      'Leave Application Status',
      'Employee Engagement Program',
      'HOD Register',
    ],
  },
  {
    head: 'Purchase Head / Jr. Accountant / Store',
    tasks: [
      'Student Academic Fee Collection',
      'Student Transport Fee Collection',
      'Store Stock Status',
      'Cheque Deposit Status',
      'Petty Cash Status',
      'Stock Issue',
      'Fees Followup Status',
      'Petrol / Diesel Expenses',
      'Purchase Order Status',
      'Purchase Approval / Requisition Request',
      'Inventory Mgt',
      'HOD Register',
    ],
  },
  {
    head: 'Transport Head',
    tasks: [
      'Transport Admission Status',
      'Bus Route Finalisation',
      'Daily Transport Summary Submission',
      'Transport Compliance Status',
      'Individual Vehicle Record',
      'Vehicle Maintenance',
      'Vehicle Petrol / Diesel Expenses Demand',
      'Bus Cleaning Status',
      'School Bus Record File (With Driver and Mavshi Details)',
      'Driver and Mavshi Safety Training Status',
    ],
  },
  {
    head: 'IT Head',
    tasks: [
      'Website Maintenance',
      'MCB (MyClassBoard) Monitoring',
      'Firewall (Internet) Service Mgt',
      'School Mail_ID Creation',
      'All Gadget Mgt (Computer / Desktop, CCTV, Intercom and Mobile)',
      'Gadget Issue',
      'IT Related Grievance Records',
      'HOD Register',
    ],
  },
  {
    head: 'Front Desk / Reception / Jr. Clerk',
    tasks: [
      'Guest Welcome',
      'Visitor Register Mgt',
      'Student Halfday Register Mgt',
      'Inword',
      'Staff Movement Register',
      'Permission for Child in School Campus',
      'Early Pickup',
      'HOD Register',
    ],
  },
  {
    head: 'HouseKeeping Head',
    tasks: [
      'Daily Cleaning Report',
      'Daily Duty Assignment Report',
      'HK Material Outword',
      'Toilet Washroom Cleaning Report',
      'School Premises (Inside and Outside) Cleaning Report',
    ],
  },
];

function ApprovalManagement() {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [expandedHead, setExpandedHead] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const approvalsQuery = useQuery({
    queryKey: ['approvals'],
    queryFn: () => getAllApprovals()
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'all-for-approvals'],
    queryFn: () => taskService.getAllTasks()
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveApproval(id),
    onSuccess: async () => {
      toast.success('Approval granted successfully.');
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to approve request.')
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectApproval(id),
    onSuccess: async () => {
      toast.success('Approval rejected.');
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to reject request.')
  });

  const allApprovals = approvalsQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];

  const filteredApprovals =
    activeTab === 'ALL'
      ? allApprovals
      : allApprovals.filter((approval) => approval.status === activeTab);

  // Accurate counts derived directly from data
  const counts = {
    total:    allApprovals.length,
    pending:  allApprovals.filter((a) => a.status === 'PENDING').length,
    approved: allApprovals.filter((a) => a.status === 'APPROVED').length,
    rejected: allApprovals.filter((a) => a.status === 'REJECTED').length,
  };

  // Per-type pending counts
  const perTypeCounts: Record<string, number> = {};
  for (const key of Object.keys(APPROVAL_TYPE_META) as Approval['type'][]) {
    perTypeCounts[key] = allApprovals.filter(
      (a) => a.type === key && a.status === 'PENDING'
    ).length;
  }

  // Task counts per module/head (matched by title)
  const getTaskCountForHead = (headTasks: string[]) => {
    const assigned = allTasks.filter((t) => headTasks.includes(t.title)).length;
    const completed = allTasks.filter(
      (t) => headTasks.includes(t.title) && t.status === 'COMPLETED'
    ).length;
    const pending = allTasks.filter(
      (t) => headTasks.includes(t.title) && t.status === 'PENDING'
    ).length;
    return { assigned, completed, pending };
  };

  const formatAmount = (amount?: string | number) => {
    if (amount == null) return '—';
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-IN');

  return (
    <div className="space-y-6 p-6">
      {/* ── Approval type summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Object.entries(APPROVAL_TYPE_META).map(([key, meta]) => {
          const k = key as Approval['type'];
          const pendingCount = perTypeCounts[k] ?? 0;
          const textColor = meta.bg.split(' ').find((c: string) => c.startsWith('text-'));
          return (
            <div key={k} className="rounded-[20px] border border-[#EFF2F6] bg-white p-4 text-center">
              <div className={`text-2xl font-bold ${textColor}`}>{pendingCount}</div>
              <div className="text-xs text-[#5B6E8C] mt-1">{meta.label}</div>
              <div className="text-[10px] text-[#A2AEC1] mt-0.5 uppercase tracking-wide">pending</div>
            </div>
          );
        })}
      </div>

      {/* ── Approval requests list ── */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#1E293B]">Approval Requests</h2>
        <div className="mb-6 flex flex-wrap gap-3">
          {[
            { key: 'ALL',      label: 'All',      count: counts.total },
            { key: 'PENDING',  label: 'Pending',  count: counts.pending },
            { key: 'APPROVED', label: 'Approved', count: counts.approved },
            { key: 'REJECTED', label: 'Rejected', count: counts.rejected }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-[#185FA5] text-white'
                  : 'bg-[#F3F6FA] text-[#5B6E8C] hover:bg-[#E7EDF4]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {approvalsQuery.isLoading ? (
            <div className="py-8 text-center text-[#8A99B0]">Loading approvals…</div>
          ) : filteredApprovals.length === 0 ? (
            <div className="py-8 text-center text-[#5B6E8C]">
              No {activeTab === 'ALL' ? '' : activeTab.toLowerCase()} approvals found.
            </div>
          ) : (
            filteredApprovals.map((approval: Approval) => (
              <div
                key={approval.id}
                className="flex flex-col gap-4 rounded-lg border border-[#EFF2F6] p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${APPROVAL_TYPE_META[approval.type]?.bg ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {(approval.requestedBy?.name
                      ?.split(' ')
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2) ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#1E293B]">{approval.title}</div>
                    <div className="text-sm text-[#5B6E8C]">
                      {approval.requestedBy?.name} · {formatAmount(approval.amount)} ·{' '}
                      {APPROVAL_TYPE_META[approval.type]?.label ?? approval.type}
                    </div>
                    {approval.details ? (
                      <div className="mt-1 text-sm text-[#5B6E8C]">{approval.details}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-[#8A99B0]">
                      Submitted: {formatDate(approval.created_at)}
                    </div>
                  </div>
                </div>

                {approval.status === 'PENDING' ? (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => approveMutation.mutate(approval.id)}
                      disabled={approveMutation.isPending}
                      className="!bg-green-500 !text-white hover:!bg-green-600"
                    >
                      {approveMutation.isPending ? 'Approving…' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => rejectMutation.mutate(approval.id)}
                      disabled={rejectMutation.isPending}
                    >
                      {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                    </Button>
                  </div>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[approval.status]}`}
                  >
                    {approval.status}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Module / Head Wise Task Assigned by Chairman ── */}
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
            Task Assignment Overview
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[#1E293B]">
            Module / Head Wise Task Assigned by Chairman
          </h2>
          <p className="mt-1 text-sm text-[#5B6E8C]">
            Click a department head to expand task-level completion status.
          </p>
        </div>

        <div className="space-y-3">
          {MODULE_TASK_GROUPS.map((module, idx) => {
            const { assigned, completed, pending } = getTaskCountForHead(module.tasks);
            const isOpen = expandedHead === module.head;
            const completionPct = module.tasks.length > 0
              ? Math.round((completed / module.tasks.length) * 100)
              : 0;

            return (
              <div key={module.head} className="rounded-[14px] border border-[#EFF2F6] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedHead(isOpen ? null : module.head)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left bg-[#F8F9FC] hover:bg-[#EFF2F6] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#185FA5] text-[11px] font-bold text-white">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-sm text-[#1E293B]">{module.head}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-[#8A99B0]">{module.tasks.length} tasks</span>
                    <span className="text-xs font-semibold text-green-600">{completed} done</span>
                    <span className="text-xs font-semibold text-amber-600">{pending} pending</span>
                    <div className="hidden sm:flex items-center gap-2 w-24">
                      <div className="flex-1 h-1.5 rounded-full bg-[#E4EAF2]">
                        <div
                          className="h-1.5 rounded-full bg-green-500 transition-all"
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#8A99B0] w-8 text-right">{completionPct}%</span>
                    </div>
                    <svg
                      className={`h-4 w-4 text-[#8A99B0] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="divide-y divide-[#EFF2F6]">
                    {module.tasks.map((taskTitle, tIdx) => {
                      const matchedTask = allTasks.find((t) => t.title === taskTitle);
                      const status = matchedTask?.status ?? null;

                      return (
                        <div
                          key={taskTitle}
                          className="flex items-center justify-between px-5 py-3 bg-white hover:bg-[#FBFCFE] transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="shrink-0 text-[11px] text-[#8A99B0] w-5 text-right">
                              {String.fromCharCode(96 + tIdx + 1)}.
                            </span>
                            <span className="text-sm text-[#36506C] truncate">{taskTitle}</span>
                          </div>
                          <div className="shrink-0 ml-3">
                            {status === null ? (
                              <span className="rounded-full bg-[#F3F6FA] px-2.5 py-1 text-[10px] font-medium text-[#8A99B0]">
                                Not assigned
                              </span>
                            ) : status === 'COMPLETED' ? (
                              <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-semibold text-green-700">
                                ✓ Completed
                              </span>
                            ) : status === 'IN_PROGRESS' ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                                In Progress
                              </span>
                            ) : status === 'DELAYED' ? (
                              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-700">
                                Delayed
                              </span>
                            ) : (
                              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ApprovalManagement;
