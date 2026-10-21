import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../store';
import TaskAssignment from '../pages/chairman/TaskAssignment';
import * as taskService from '../services/taskService';
import * as userService from '../services/userService';

vi.mock('../services/taskService');
vi.mock('../services/userService');
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() }
}));

const makeTask = (id: number, over: Record<string, unknown> = {}) => ({
  id, title: `Task ${id}`, description: null, assigned_by: 1, assigned_to: 2, department_id: null,
  priority: 'MEDIUM', status: 'PENDING', cadence: 'DAILY',
  start_date: '2026-10-01T00:00:00Z', due_date: '2026-10-20T00:00:00Z',
  attachment_path: null, proof_path: null, completed_at: null,
  assignedTo: { id: 2, name: 'Anita' }, ...over
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TaskAssignment />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userService.getAllUsers).mockResolvedValue([]);
});

describe('Assignment Queue', () => {
  it('asks the server only for open tasks', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(taskService.getAllTasks).toHaveBeenCalled());
    expect(vi.mocked(taskService.getAllTasks).mock.calls[0][0]).toEqual({
      status: 'PENDING,IN_PROGRESS,DELAYED,ESCALATED'
    });
  });

  it('shows a loading state, not the empty state, while fetching', async () => {
    vi.mocked(taskService.getAllTasks).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(await screen.findByText(/Loading the assignment queue/)).toBeInTheDocument();
    expect(screen.queryByText('Newly assigned tasks will appear here.')).toBeNull();
  });

  it('shows an error with Retry instead of a misleading empty queue', async () => {
    vi.mocked(taskService.getAllTasks).mockRejectedValueOnce({ response: { status: 500, data: { message: 'DB down' } } });
    vi.mocked(taskService.getAllTasks).mockResolvedValue([makeTask(1)]);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('DB down');
    expect(screen.queryByText('Newly assigned tasks will appear here.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Task 1')).toBeInTheDocument();
  });

  it('shows the empty message when the queue is empty', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Newly assigned tasks will appear here.')).toBeInTheDocument();
  });

  it('filters Sub Task choices by the selected Task Headline', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue([]);
    vi.mocked(userService.getAllUsers).mockResolvedValue([{
      id: 2,
      name: 'Anita',
      email: 'anita@school.test',
      role: 'HR',
      is_active: true,
      head_type: 'HR Head',
      sort_order: 1,
      department_id: null
    }] as never);
    renderPage();

    const assignee = await screen.findByLabelText('Assign to');
    await userEvent.selectOptions(assignee, '2');
    const headline = screen.getByLabelText('Task Headline');
    const subTask = screen.getByLabelText('Sub Task');

    expect(subTask).toBeDisabled();
    await userEvent.selectOptions(headline, 'HR Head');
    expect(subTask).toBeEnabled();
    expect(within(subTask).getByRole('option', { name: 'Training' })).toBeInTheDocument();
    expect(within(subTask).queryByRole('option', { name: 'Fees Collection Status' })).toBeNull();
    expect(screen.queryByPlaceholderText('Enter custom task title')).toBeNull();

    await userEvent.selectOptions(subTask, 'Training');
    const assignDate = screen.getByLabelText('Assign Date');
    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: assignDate.value } });
    vi.mocked(taskService.createTask).mockResolvedValue(makeTask(99, {
      title: 'Training',
      task_headline: 'HR Head',
      sub_task: 'Training'
    }) as never);
    await userEvent.click(screen.getByRole('button', { name: 'Submit Task' }));

    await waitFor(() => expect(taskService.createTask).toHaveBeenCalled());
    const payload = vi.mocked(taskService.createTask).mock.calls[0][0];
    expect(payload).toMatchObject({ task_headline: 'HR Head', sub_task: 'Training' });
    expect(payload).not.toHaveProperty('title');
  });

  it('shows per-status counts, an Escalated tab, and a tab-specific empty message', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue([
      makeTask(1), makeTask(2, { status: 'ESCALATED' }), makeTask(3, { status: 'COMPLETED' })
    ] as never);
    renderPage();
    await screen.findByText('Task 1');
    expect(screen.getByRole('button', { name: 'All (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escalated (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Task 3')).toBeNull(); // completed work is not in the queue
    await userEvent.click(screen.getByRole('button', { name: 'Delayed (0)' }));
    expect(screen.getByText('No delayed tasks right now.')).toBeInTheDocument();
  });

  it('paginates long lists', async () => {
    const many = Array.from({ length: 60 }, (_, i) => makeTask(i + 1));
    vi.mocked(taskService.getAllTasks).mockResolvedValue(many as never);
    renderPage();
    await screen.findByText('Task 1');
    expect(screen.queryByText('Task 26')).toBeNull();
    expect(screen.getByText('Showing 1–25 of 60')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Task 26')).toBeInTheDocument();
    expect(screen.getByText('Showing 26–50 of 60')).toBeInTheDocument();
  });

  it('delete uses the shared confirmation dialog and removes the row', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue([makeTask(1), makeTask(2)] as never);
    vi.mocked(taskService.deleteTask).mockImplementation(async () => {
      vi.mocked(taskService.getAllTasks).mockResolvedValue([makeTask(2)] as never);
    });
    renderPage();
    await screen.findByText('Task 1');
    await userEvent.click(screen.getAllByTitle('Delete task')[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Task 1')).toBeNull());
    expect(vi.mocked(taskService.deleteTask).mock.calls[0][0]).toBe(1);
    expect(screen.getByText('Task 2')).toBeInTheDocument();
  });

  it('a 404 on delete (already gone) removes the stale row', async () => {
    vi.mocked(taskService.getAllTasks).mockResolvedValue([makeTask(1)] as never);
    vi.mocked(taskService.deleteTask).mockImplementation(async () => {
      vi.mocked(taskService.getAllTasks).mockResolvedValue([] as never);
      throw { response: { status: 404, data: { message: 'Not found' } } };
    });
    renderPage();
    await screen.findByText('Task 1');
    await userEvent.click(screen.getAllByTitle('Delete task')[0]);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Task 1')).toBeNull());
  });
});
