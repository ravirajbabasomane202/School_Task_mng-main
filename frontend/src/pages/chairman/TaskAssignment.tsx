import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Button from '../../components/common/Button';
import ConfirmDeleteDialog from '../../components/common/ConfirmDeleteDialog';
import Input from '../../components/common/Input';
import TaskTable from '../../components/tables/TaskTable';
import { ROLES, ROLE_LABELS, TASK_ASSIGNABLE_ROLES } from '../../constants/roles';
import { PREDEFINED_TASK_TITLES, TASK_TITLE_GROUPS as MODULE_TASK_TITLE_GROUPS } from '../../constants/moduleTasks';
import * as taskService from '../../services/taskService';
import * as userService from '../../services/userService';
import { setUsers } from '../../store/userSlice';
import { addTask, setTasks, removeTask, updateTask } from '../../store/taskSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { SCHOOL_TIME_ZONE } from '../../constants/schoolTimeZone';
import type { CreateTaskPayload, Task, TaskCadence, TaskStatus } from '../../types/task.types';
import { getApiErrorMessage, isNotFoundError } from '../../utils/apiError';

const statusTabs: Array<{ label: string; value: TaskStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Delayed', value: 'DELAYED' },
  { label: 'Escalated', value: 'ESCALATED' }
];

/** The queue only holds work that is still open; the server filters on this list. */
const OPEN_STATUSES = 'PENDING,IN_PROGRESS,DELAYED,ESCALATED';
const PAGE_SIZE = 25;
const QUEUE_QUERY_KEY = ['tasks', 'chairman-assignment'] as const;

/** Today as YYYY-MM-DD in the school's time zone (toISOString() is UTC, which is
 * "yesterday" for the first 5.5 hours of an Indian morning). */
const getToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

// ── Predefined task titles grouped by module/head ──────────────────────────
const TASK_TITLE_GROUPS: Array<{ group: string; titles: string[] }> = [
  {
    group: 'School Director',
    titles: [
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
    group: 'Admin Head',
    titles: [
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
    group: 'Admin Assistance',
    titles: [
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
    group: 'Finance Head',
    titles: [
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
    group: 'Admission Head / Marketing Executive',
    titles: [
      'Admission Status',
      'Admission Enquiry (Daily)',
      'School Marketing on Facebook, Instagram and LinkedIn',
      'Marketing Banner Design',
      'HOD Register',
    ],
  },
  {
    group: 'HR Head',
    titles: [
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
    group: 'Purchase Head / Jr. Accountant / Store',
    titles: [
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
    group: 'Transport Head',
    titles: [
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
    group: 'IT Head',
    titles: [
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
    group: 'Front Desk / Reception / Jr. Clerk',
    titles: [
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
    group: 'HouseKeeping Head',
    titles: [
      'Daily Cleaning Report',
      'Daily Duty Assignment Report',
      'HK Material Outword',
      'Toilet Washroom Cleaning Report',
      'School Premises (Inside and Outside) Cleaning Report',
    ],
  },
];

const makeInitialForm = (): CreateTaskPayload => ({
  title: '',
  description: '',
  assigned_to: 0,
  priority: 'MEDIUM',
  cadence: 'DAILY',
  start_date: getToday(),
  due_date: ''
});

const formatAssignableUserLabel = (user: {
  role?: string | null;
  name?: string | null;
}) => {
  const label = ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? String(user.role ?? '').trim();
  const name = String(user.name ?? '').trim();

  if (!name) {
    return label;
  }

  const normalizedLabel = label.toLowerCase();
  const normalizedName = name.toLowerCase();

  if (
    normalizedName === normalizedLabel ||
    normalizedName.includes(normalizedLabel) ||
    normalizedLabel.includes(normalizedName)
  ) {
    return name;
  }

  if (name.includes(' - ')) {
    return name.split(' - ')[0].trim();
  }

  return `${label} - ${name}`;
};

function TaskAssignment() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const users = useAppSelector((state) => state.users.users);
  const user = useAppSelector((state) => state.auth.user);
  const [activeStatus, setActiveStatus] = useState<TaskStatus | 'ALL'>('ALL');
  const [file, setFile] = useState<File | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [form, setForm] = useState<CreateTaskPayload>(makeInitialForm);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [titleMode, setTitleMode] = useState<'preset' | 'custom'>('preset');
  const [editingTask, setEditingTask] = useState<number | null>(null);

  const taskQuery = useQuery({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: () => taskService.getAllTasks({ status: OPEN_STATUSES })
  });

  // The queue renders straight from the query (not the shared Redux list, which
  // every task screen overwrites with its own data and could show stale rows here).
  const tasks = useMemo<Task[]>(() => taskQuery.data ?? [], [taskQuery.data]);

  const updateQueue = (updater: (current: Task[]) => Task[]) =>
    queryClient.setQueryData<Task[]>(QUEUE_QUERY_KEY, (current) => updater(current ?? []));

  const usersQuery = useQuery({
    queryKey: ['users', 'department-heads'],
    queryFn: () => userService.getAllUsers()
  });

  useEffect(() => {
    if (taskQuery.data) {
      dispatch(setTasks(taskQuery.data));
    }
  }, [dispatch, taskQuery.data]);

  useEffect(() => {
    if (usersQuery.data) {
      dispatch(setUsers(usersQuery.data));
    }
  }, [dispatch, usersQuery.data]);

  const normalizeRole = (role?: string | null) =>
    String(role || '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();

  const isAssignableRole = (normalizedRole: string, departmentName?: string | null) =>
    TASK_ASSIGNABLE_ROLES.includes(normalizedRole as any) ||
    ['HOUSEKEEPING', 'HOUSEKEEPING_HEAD', 'HOUSE_KEEPING', 'HOUSE_KEEPING_HEAD', 'HOUSE KEEPING', 'HOUSE KEEPING HEAD'].includes(normalizedRole) ||
    departmentName?.toLowerCase().includes('housekeep');

  const assignableUsers = Array.from(
    users
      .filter((user) => {
        if (user.is_active === false && user.id !== form.assigned_to) return false;
        const normalizedRole = normalizeRole(user.role);
        return isAssignableRole(normalizedRole, user.departmentName ?? user.department?.name);
      })
      .reduce((map, user) => {
        const label = formatAssignableUserLabel(user);
        const key = label.toLowerCase();
        if (!map.has(key)) {
          map.set(key, user);
        }
        return map;
      }, new Map<string, any>())
      .values()
  ).sort((left, right) => {
    const leftRole = normalizeRole(left.role);
    const rightRole = normalizeRole(right.role);
    const leftIndex = TASK_ASSIGNABLE_ROLES.indexOf(leftRole as any);
    const rightIndex = TASK_ASSIGNABLE_ROLES.indexOf(rightRole as any);

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.name.localeCompare(right.name);
  });

  const TITLE_GROUP_FILTER: Record<string, string[]> = {
    [ROLES.CHAIRMAN]: [
      'School Director',
      'Admin Head',
      'Admin Assistance',
      'Finance Head',
      'Admission Head',
      'HR Head',
      'Purchase Head',
      'Transport Head',
      'IT Head',
      'Front Desk',
      'HouseKeeping'
    ],
    [ROLES.DIRECTOR]: ['School Director'],
    [ROLES.PRINCIPAL]: ['School Director', 'Admin Head', 'Admin Assistance'],
    [ROLES.ADMIN]: ['Admin Head', 'Admin Assistance'],
    [ROLES.FINANCE]: ['Finance Head'],
    [ROLES.ADMISSION]: ['Admission Head'],
    [ROLES.HR]: ['HR Head'],
    [ROLES.PURCHASE]: ['Purchase Head'],
    [ROLES.IT]: ['IT Head'],
    [ROLES.TRANSPORT]: ['Transport Head'],
    [ROLES.HOUSEKEEPING]: ['HouseKeeping Head'],
    [ROLES.FRONT_DESK]: ['Front Desk'],
    [ROLES.PROPERTY]: []
  };

  const selectedAssignee = assignableUsers.find((assignee) => assignee.id === form.assigned_to);
  const selectedAssigneeRole = normalizeRole(selectedAssignee?.role);
  const selectedAssigneeName = selectedAssignee?.name?.toLowerCase() ?? '';
  const selectedAssigneeEmail = selectedAssignee?.email?.toLowerCase() ?? '';
  const selectedAssigneeDepartment = (
    selectedAssignee?.departmentName ??
    selectedAssignee?.department?.name ??
    ''
  ).toLowerCase();

  const getAssigneeTitleKeywords = () => {
    if (!selectedAssignee) {
      return user?.role ? TITLE_GROUP_FILTER[user.role] : TITLE_GROUP_FILTER[ROLES.CHAIRMAN];
    }

    if (selectedAssigneeRole === ROLES.ADMIN) {
      if (
        selectedAssigneeName.includes('assistance') ||
        selectedAssigneeName.includes('assistant') ||
        selectedAssigneeEmail.includes('assistance')
      ) {
        return ['Admin Assistance'];
      }
      return ['Admin Head'];
    }

    if (
      selectedAssigneeRole === ROLES.DIRECTOR ||
      selectedAssigneeName.includes('director') ||
      selectedAssigneeName.includes('school manager')
    ) {
      return ['School Director'];
    }

    if (
      selectedAssigneeRole === ROLES.HOUSEKEEPING ||
      selectedAssigneeDepartment.includes('housekeep')
    ) {
      return ['HouseKeeping Head'];
    }

    if (
      selectedAssigneeRole === ROLES.FRONT_DESK ||
      selectedAssigneeDepartment.includes('front desk') ||
      selectedAssigneeName.includes('front desk') ||
      selectedAssigneeName.includes('reception')
    ) {
      return ['Front Desk'];
    }

    return TITLE_GROUP_FILTER[selectedAssigneeRole] ?? [];
  };

  const roleTitleKeywords = getAssigneeTitleKeywords();
  const titleGroups = roleTitleKeywords
    ? MODULE_TASK_TITLE_GROUPS.filter((group) =>
        roleTitleKeywords.some((keyword) => group.group.includes(keyword))
      )
    : MODULE_TASK_TITLE_GROUPS;

  const visibleTaskGroups = roleTitleKeywords ? titleGroups : MODULE_TASK_TITLE_GROUPS;

  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED');
  const filteredTasks =
    activeStatus === 'ALL' ? openTasks : openTasks.filter((task) => task.status === activeStatus);
  const statusCounts = (value: TaskStatus | 'ALL') =>
    value === 'ALL' ? openTasks.length : openTasks.filter((task) => task.status === value).length;

  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedTasks = filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeStatus]);

  const handleChange = <K extends keyof CreateTaskPayload>(key: K, value: CreateTaskPayload[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleTitleSelect = (value: string) => {
    if (value === '__other__') {
      setTitleMode('custom');
      handleChange('title', '');
    } else {
      setTitleMode('preset');
      handleChange('title', value);
    }
  };

  const resetForm = () => {
    setEditingTask(null);
    setForm(makeInitialForm());
    setTitleMode('preset');
    setFile(undefined);
    setFileInputKey((current) => current + 1);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return; // Enter-key / double-click guard
    setError(null);

    if (!form.assigned_to) {
      setError('Choose the School Manager or a department head before submitting.');
      return;
    }

    if (!form.title.trim()) {
      setError('Enter or choose a task title.');
      return;
    }

    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      setError('Due date cannot be earlier than the assign date.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingTask !== null) {
        const updated = await taskService.updateTask(editingTask, form as any, file);
        dispatch(updateTask(updated));
        updateQueue((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        toast.success('Task updated.');
      } else {
        const createdTask = await taskService.createTask(form, file);
        dispatch(addTask(createdTask));
        updateQueue((current) => [createdTask, ...current.filter((item) => item.id !== createdTask.id)]);
        toast.success('Task assigned.');
        setActiveStatus('ALL');
        setPage(1);
      }
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      if (editingTask !== null && isNotFoundError(err)) {
        // Deleted by someone else while being edited: leave edit mode and re-sync.
        updateQueue((current) => current.filter((item) => item.id !== editingTask));
        dispatch(removeTask(editingTask));
        resetForm();
        setError('That task no longer exists (it was deleted). Your changes were not saved.');
        return;
      }
      // Show the server's reason (duplicate assignment, inactive user, bad date...).
      setError(getApiErrorMessage(err, 'Unable to save task right now. Please verify the form and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (task: any) => {
    setEditingTask(task.id);
    setForm({
      title: task.title,
      description: task.description ?? '',
      assigned_to: task.assigned_to,
      priority: task.priority,
      cadence: task.cadence ?? 'DAILY',
      start_date: task.start_date?.slice(0, 10) ?? getToday(),
      due_date: task.due_date?.slice(0, 10) ?? '',
      department_id: task.department_id ?? null,
    });
    // detect if title is a preset
    if (PREDEFINED_TASK_TITLES.includes(task.title)) {
      setTitleMode('preset');
    } else {
      setTitleMode('custom');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => taskService.deleteTask(id),
    onSuccess: (_data, id) => finishDelete(id, 'Task deleted.'),
    onError: (err, id) => {
      if (isNotFoundError(err)) {
        // Already gone (stale list / deleted elsewhere): drop it from the queue.
        finishDelete(id, 'Task was already deleted.');
        return;
      }
      const message = getApiErrorMessage(err, 'Failed to delete task. Please try again.');
      setDeleteError(message);
      toast.error(message);
    }
  });

  function finishDelete(id: number, message: string) {
    dispatch(removeTask(id));
    updateQueue((current) => current.filter((item) => item.id !== id));
    if (editingTask === id) resetForm();
    setDeleteTarget(null);
    setDeleteError(null);
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  const handleDelete = (taskId: number) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setDeleteError(null);
    setDeleteTarget(task);
  };

  return (
    <section className="grid gap-5 p-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
            Tasks Module
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">
            {editingTask !== null ? 'Edit Task' : 'Create New Task'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#5B6E8C]">
            Dispatch work to the School Manager and department heads with due dates, priority,
            and supporting files.
          </p>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          {/* ── 1. Assign to — MOVED TO TOP ── */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Assign to</span>
            <select
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              disabled={assignableUsers.length === 0}
              onChange={(event) => {
                const selectedUser = assignableUsers.find(
                  (user) => user.id === Number(event.target.value)
                );
                handleChange('assigned_to', Number(event.target.value));
                handleChange('department_id', selectedUser?.department_id ?? null);
                setTitleMode('preset');
                handleChange('title', '');
              }}
              required
              value={form.assigned_to || ''}
            >
              <option value="">
                {assignableUsers.length === 0
                  ? 'No School Director or department heads found'
                  : 'Select an assignee'}
              </option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {formatAssignableUserLabel(user)}
                </option>
              ))}
            </select>
            {assignableUsers.length === 0 ? (
              <p className="text-xs text-[#C13F3A]">
                Add leadership users from User Management or run the backend seed command.
              </p>
            ) : null}
          </label>

          {/* ── 2. Task title with predefined dropdown ── */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Task title</span>
            <select
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              value={titleMode === 'custom' ? '__other__' : form.title}
              onChange={(e) => handleTitleSelect(e.target.value)}
              required={titleMode !== 'custom'}
            >
              <option value="">— Select a predefined title —</option>
              {visibleTaskGroups.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.titles.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
              ))}
              <option value="__other__">Other (type manually)</option>
            </select>

            {titleMode === 'custom' && (
              <input
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                placeholder="Enter custom task title"
                required
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
              />
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Description</span>
            <textarea
              className="min-h-[104px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 py-2.5 text-sm text-[#1E293B] outline-none transition placeholder:text-[#8A99B0] focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              onChange={(event) => handleChange('description', event.target.value)}
              placeholder="Describe the task scope and expected outcome"
              value={form.description ?? ''}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Priority</span>
              <select
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                onChange={(event) =>
                  handleChange('priority', event.target.value as CreateTaskPayload['priority'])
                }
                value={form.priority}
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-[#36506C]">Task cycle</span>
              <select
                className="min-h-[38px] rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                onChange={(event) =>
                  handleChange('cadence', event.target.value as TaskCadence)
                }
                value={form.cadence ?? 'DAILY'}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* ── Renamed "Start date" → "Assign date", defaults to today ── */}
            <Input
              label="Assign Date"
              onChange={(event) => handleChange('start_date', event.target.value)}
              required
              type="date"
              value={form.start_date}
            />

            <Input
              label="Due Date"
              min={form.start_date || undefined}
              onChange={(event) => handleChange('due_date', event.target.value)}
              required
              type="date"
              value={form.due_date}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Attachment</span>
            <input
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              className="min-h-[38px] rounded-[10px] border-[0.5px] border-dashed border-[#C9D6E5] bg-[#F8F9FC] px-3 py-2 text-sm text-[#36506C] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#185FA5]"
              key={fileInputKey}
              onChange={(event) => setFile(event.target.files?.[0])}
              type="file"
            />
          </label>

          {error ? <p className="text-sm text-[#C13F3A]">{error}</p> : null}

          <div className="flex gap-2">
            <Button
              className="flex-1 justify-center"
              loading={isSubmitting}
              type="submit"
            >
              {editingTask !== null ? 'Update Task' : 'Submit Task'}
            </Button>
            {editingTask !== null && (
              <Button
                className="justify-center"
                type="button"
                variant="ghost"
                onClick={resetForm}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
                Assignment Queue
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Active Task Queue</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => (
                <button
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    activeStatus === tab.value
                      ? 'bg-[#185FA5] text-white'
                      : 'bg-[#F3F6FA] text-[#5B6E8C] hover:bg-[#E7EDF4]'
                  ].join(' ')}
                  key={tab.value}
                  onClick={() => setActiveStatus(tab.value)}
                  type="button"
                >
                  {`${tab.label} (${statusCounts(tab.value)})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {taskQuery.isLoading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-[18px] border border-[#EFF2F6] bg-white p-8 text-sm text-[#8A99B0]">
            Loading the assignment queue…
          </div>
        ) : taskQuery.isError ? (
          <div
            className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[18px] border border-[#F3C7C5] bg-[#FFF4F4] p-8 text-center"
            role="alert"
          >
            <p className="text-sm font-semibold text-[#C13F3A]">
              {getApiErrorMessage(taskQuery.error, 'Unable to load the assignment queue.')}
            </p>
            <Button onClick={() => void taskQuery.refetch()} size="sm" variant="danger">
              Retry
            </Button>
          </div>
        ) : (
          <>
            <TaskTable
              emptyMessage={
                openTasks.length === 0
                  ? 'Newly assigned tasks will appear here.'
                  : `No ${statusTabs.find((tab) => tab.value === activeStatus)?.label.toLowerCase()} tasks right now.`
              }
              onRowClick={(task) => navigate(`/task/${task.id}`)}
              tasks={pagedTasks}
              onEdit={handleEdit}
              onDelete={handleDelete}
              showActions
            />
            {filteredTasks.length > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-3 text-xs text-[#5B6E8C]">
                <span>
                  {`Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} of ${filteredTasks.length}`}
                </span>
                <div className="flex gap-2">
                  <Button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} size="sm" variant="ghost">
                    Previous
                  </Button>
                  <Button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} size="sm" variant="ghost">
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ConfirmDeleteDialog
        errorMessage={deleteError}
        isDeleting={deleteMutation.isPending}
        isOpen={deleteTarget !== null}
        itemLabel={deleteTarget ? `“${deleteTarget.title}”` : null}
        itemName="task"
        note="Its status history is deleted with it. People's notifications about it are kept."
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Task"
      />
    </section>
  );
}

export default TaskAssignment;
