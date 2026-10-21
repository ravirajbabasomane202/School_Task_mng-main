import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Check, ChevronDown, Plus } from 'lucide-react';
import Button from '../../components/common/Button';
import ConfirmDeleteDialog from '../../components/common/ConfirmDeleteDialog';
import Input from '../../components/common/Input';
import TaskTable from '../../components/tables/TaskTable';
import { ROLES } from '../../constants/roles';
import { useOrderedHeads } from '../../constants/headOrder';
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

const makeInitialForm = (): CreateTaskPayload => ({
  task_headline: '',
  sub_task: '',
  description: '',
  assigned_to: 0,
  priority: 'MEDIUM',
  cadence: 'DAILY',
  start_date: getToday(),
  due_date: ''
});

function TaskAssignment() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const users = useAppSelector((state) => state.users.users);
  const { data: orderedHeads = [] } = useOrderedHeads();
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
  const [editingTask, setEditingTask] = useState<number | null>(null);
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);
  const [addingHeadline, setAddingHeadline] = useState(false);
  const [addingSubtaskHeadlineId, setAddingSubtaskHeadlineId] = useState<number | null>(null);
  const [catalogDraft, setCatalogDraft] = useState('');
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

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

  const catalogQuery = useQuery({
    queryKey: ['tasks', 'catalog'],
    queryFn: taskService.getTaskCatalog
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

  const assignableUsers = orderedHeads.flatMap((head) => {
    const source = users.find((candidate) => candidate.id === head.id);
    return source ? [{ ...source, label: head.label }] : [];
  });

  const taskCatalog = catalogQuery.data ?? [];
  const visibleTaskGroups = taskCatalog;
  const isChairman = user?.role === ROLES.CHAIRMAN;

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

  const resetForm = () => {
    setEditingTask(null);
    setForm(makeInitialForm());
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

    if (!form.task_headline || !form.sub_task) {
      setError('Choose a Sub Task from a Task Headline.');
      return;
    }

    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      setError('Due date cannot be earlier than the assign date.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingTask !== null) {
        const updated = await taskService.updateTask(editingTask, form, file);
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
      task_headline: task.task_headline ?? '',
      sub_task: task.sub_task ?? task.title,
      description: task.description ?? '',
      assigned_to: task.assigned_to,
      priority: task.priority,
      cadence: task.cadence ?? 'DAILY',
      start_date: task.start_date?.slice(0, 10) ?? getToday(),
      due_date: task.due_date?.slice(0, 10) ?? '',
      department_id: task.department_id ?? null,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelCatalogEntry = () => {
    setAddingHeadline(false);
    setAddingSubtaskHeadlineId(null);
    setCatalogDraft('');
    setCatalogError(null);
  };

  const handleSaveHeadline = async () => {
    setCatalogError(null);
    setCatalogSaving(true);
    try {
      const headline = await taskService.createTaskHeadline(catalogDraft);
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'catalog'] });
      setAddingHeadline(false);
      setAddingSubtaskHeadlineId(headline.id);
      setCatalogDraft('');
    } catch (err) {
      setCatalogError(getApiErrorMessage(err, 'Unable to save Task Headline.'));
    } finally {
      setCatalogSaving(false);
    }
  };

  const handleSaveSubtask = async (headlineId: number) => {
    const headline = taskCatalog.find((group) => group.id === headlineId);
    if (!headline) {
      setCatalogError('Task Headline not found. Refresh the list and try again.');
      return;
    }

    setCatalogError(null);
    setCatalogSaving(true);
    try {
      const subtask = await taskService.createTaskSubTask(headlineId, catalogDraft);
      setForm((current) => ({
        ...current,
        task_headline: headline.name,
        sub_task: subtask.name
      }));
      await queryClient.invalidateQueries({ queryKey: ['tasks', 'catalog'] });
      setAddingSubtaskHeadlineId(null);
      setCatalogDraft('');
    } catch (err) {
      setCatalogError(getApiErrorMessage(err, 'Unable to save Sub Task.'));
    } finally {
      setCatalogSaving(false);
    }
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
    <section className="mx-auto grid w-full max-w-[1600px] min-w-0 gap-4 p-3 xs:p-4 md:gap-5 md:p-5 lg:p-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      {/* Phones/tablets: form comes first, so offer a quick jump to the queue. */}
      <div className="sticky top-[68px] z-[5] -mb-1 flex justify-end xl:hidden">
        <button
          className="rounded-full border border-[#D7E7F7] bg-white/95 px-4 py-2 text-xs font-semibold text-[#185FA5] shadow-sm backdrop-blur"
          onClick={() =>
            document.getElementById('task-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          type="button"
        >
          Jump to queue ↓
        </button>
      </div>
      <div className="min-w-0 rounded-[20px] border border-[#EFF2F6] bg-white p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
            Tasks Module
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[#1E293B] sm:text-xl">
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
                handleChange('task_headline', '');
                handleChange('sub_task', '');
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
                  {user.label}
                </option>
              ))}
            </select>
            {assignableUsers.length === 0 ? (
              <p className="text-xs text-[#C13F3A]">
                Add leadership users from User Management or run the backend seed command.
              </p>
            ) : null}
          </label>

          {/* ── 2. Hierarchical task selection ── */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[#36506C]">Task Headline / Sub Task</span>
            <div className="relative">
              <button
                aria-expanded={taskDropdownOpen}
                aria-haspopup="dialog"
                className="flex min-h-[42px] w-full items-center justify-between rounded-[10px] border-[0.5px] border-[#DCE2EA] bg-[#F8F9FC] px-3 py-2 text-left text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                onClick={() => setTaskDropdownOpen((open) => !open)}
                type="button"
              >
                <span className={form.sub_task ? '' : 'text-[#8A99B0]'}>
                  {form.task_headline && form.sub_task
                    ? `${form.task_headline}  /  ${form.sub_task}`
                    : catalogQuery.isLoading
                      ? 'Loading task headlines…'
                      : 'Select a Task Headline and Sub Task'}
                </span>
                <ChevronDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-[#5B6E8C]" />
              </button>

              {taskDropdownOpen && (
                <div
                  aria-label="Task Headline and Sub Task options"
                  className="absolute z-20 mt-2 max-h-[420px] w-full overflow-y-auto rounded-[12px] border border-[#DCE2EA] bg-white p-2 shadow-xl"
                  role="dialog"
                >
                  {catalogQuery.isError ? (
                    <div className="p-3 text-sm text-[#C13F3A]" role="alert">
                      <p>{getApiErrorMessage(catalogQuery.error, 'Unable to load task headlines.')}</p>
                      <button
                        className="mt-2 font-semibold text-[#185FA5]"
                        onClick={() => void catalogQuery.refetch()}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {visibleTaskGroups.map((headline) => (
                    <div className="mb-1" key={headline.id}>
                      <div className="rounded-[8px] bg-[#F3F6FA] px-3 py-2">
                        <span className="text-xs font-bold text-[#36506C]">{headline.name}</span>
                      </div>

                      <div className="ml-3 border-l border-[#DCE2EA] pl-2">
                        {headline.subtasks.map((subtask) => {
                          const selected =
                            form.task_headline === headline.name && form.sub_task === subtask.name;
                          return (
                            <button
                              aria-pressed={selected}
                              className={[
                                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[#F3F6FA]',
                                selected ? 'bg-[#EAF3FC] font-semibold text-[#185FA5]' : 'text-[#1E293B]'
                              ].join(' ')}
                              key={subtask.id}
                              onClick={() => {
                                setForm((current) => ({
                                  ...current,
                                  task_headline: headline.name,
                                  sub_task: subtask.name
                                }));
                                setTaskDropdownOpen(false);
                                cancelCatalogEntry();
                              }}
                              type="button"
                            >
                              <span>{subtask.name}</span>
                              {selected && <Check aria-hidden="true" className="h-4 w-4" />}
                            </button>
                          );
                        })}

                        {isChairman && addingSubtaskHeadlineId !== headline.id && (
                          <button
                            aria-label={`Add Sub Task to ${headline.name}`}
                            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-semibold text-[#185FA5] hover:bg-[#F3F6FA]"
                            onClick={() => {
                              setCatalogError(null);
                              setCatalogDraft('');
                              setAddingHeadline(false);
                              setAddingSubtaskHeadlineId(headline.id);
                            }}
                            type="button"
                          >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            Add Sub Task
                          </button>
                        )}

                        {addingSubtaskHeadlineId === headline.id && (
                          <div className="space-y-2 p-2">
                            <input
                              aria-label={`New Sub Task for ${headline.name}`}
                              autoFocus
                              className="min-h-[36px] w-full rounded-[8px] border border-[#DCE2EA] bg-white px-3 text-sm outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                              maxLength={255}
                              onChange={(event) => setCatalogDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') event.preventDefault();
                              }}
                              placeholder="Enter Sub Task"
                              value={catalogDraft}
                            />
                            <div className="flex gap-2">
                              <button
                                className="rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                disabled={catalogSaving || !catalogDraft.trim()}
                                onClick={() => void handleSaveSubtask(headline.id)}
                                type="button"
                              >
                                {catalogSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#5B6E8C] hover:bg-[#F3F6FA]"
                                disabled={catalogSaving}
                                onClick={cancelCatalogEntry}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isChairman && (
                    <div className="border-t border-[#EFF2F6] pt-2">
                      {addingHeadline ? (
                        <div className="space-y-2 p-2">
                          <input
                            aria-label="New Task Headline"
                            autoFocus
                            className="min-h-[36px] w-full rounded-[8px] border border-[#DCE2EA] bg-white px-3 text-sm outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
                            maxLength={255}
                            onChange={(event) => setCatalogDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.preventDefault();
                            }}
                            placeholder="Enter Task Headline"
                            value={catalogDraft}
                          />
                          <div className="flex gap-2">
                            <button
                              className="rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              disabled={catalogSaving || !catalogDraft.trim()}
                              onClick={() => void handleSaveHeadline()}
                              type="button"
                            >
                              {catalogSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#5B6E8C] hover:bg-[#F3F6FA]"
                              disabled={catalogSaving}
                              onClick={cancelCatalogEntry}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#185FA5] hover:bg-[#F3F6FA]"
                          onClick={() => {
                            setCatalogError(null);
                            setCatalogDraft('');
                            setAddingSubtaskHeadlineId(null);
                            setAddingHeadline(true);
                          }}
                          type="button"
                        >
                          <Plus aria-hidden="true" className="h-4 w-4" />
                          Add Task Headline
                        </button>
                      )}
                    </div>
                  )}

                  {catalogError && <p className="px-3 py-2 text-xs text-[#C13F3A]" role="alert">{catalogError}</p>}
                </div>
              )}
            </div>
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

      <div className="min-w-0 scroll-mt-20 space-y-4" id="task-queue">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">
                Assignment Queue
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#1E293B]">Active Task Queue</h2>
            </div>

            <div className="-mx-1 flex w-full flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {statusTabs.map((tab) => (
                <button
                  className={[
                    'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition',
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
              <div className="flex flex-col gap-2 text-xs text-[#5B6E8C] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span>
                  {`Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} of ${filteredTasks.length}`}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:flex">
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
