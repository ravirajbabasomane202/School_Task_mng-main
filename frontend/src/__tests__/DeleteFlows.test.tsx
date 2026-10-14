import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../store';
import { setNotifications } from '../store/notificationSlice';
import AnnouncementsPage from '../pages/chairman/AnnouncementsPage';
import ApprovalManagement from '../pages/chairman/ApprovalManagement';
import NotificationsPage from '../pages/NotificationsPage';
import * as announcementService from '../services/announcementService';
import * as approvalService from '../services/approvalService';
import * as notificationService from '../services/notificationService';
import * as userService from '../services/userService';

vi.mock('../services/announcementService');
vi.mock('../services/approvalService');
vi.mock('../services/notificationService');
vi.mock('../services/userService');
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() }
}));

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

const apiError = (status: number, message: string) => ({ response: { status, data: { message } } });

async function openDialogFor(buttonName: string) {
  await userEvent.click(screen.getAllByRole('button', { name: buttonName })[0]);
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Recent Announcements delete', () => {
  const announcements = [
    { id: 1, created_by: 1, target: 'ALL', message: 'Holiday on Friday', department_id: null, created_at: '2026-10-01T00:00:00Z' },
    { id: 2, created_by: 1, target: 'ALL', message: 'Exam schedule out', department_id: null, created_at: '2026-10-02T00:00:00Z' }
  ];

  beforeEach(() => {
    vi.mocked(announcementService.getAnnouncements).mockResolvedValue(announcements as never);
    vi.mocked(userService.getAllUsers).mockResolvedValue([]);
  });

  it('asks for confirmation and does not call the API when cancelled', async () => {
    renderWith(<AnnouncementsPage />);
    await screen.findByText('Exam schedule out', { selector: 'p.text-sm.leading-6' });
    const dialog = await openDialogFor('Delete announcement');
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(announcementService.deleteAnnouncement).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes the item from the list immediately on success', async () => {
    vi.mocked(announcementService.deleteAnnouncement).mockImplementation(async () => {
      // like the real server: the next fetch no longer returns the deleted row
      vi.mocked(announcementService.getAnnouncements).mockResolvedValue(announcements.slice(1) as never);
    });
    renderWith(<AnnouncementsPage />);
    await screen.findByText('Holiday on Friday', { selector: 'p.text-sm.leading-6' });
    const dialog = await openDialogFor('Delete announcement');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(announcementService.deleteAnnouncement).toHaveBeenCalled());
    expect(vi.mocked(announcementService.deleteAnnouncement).mock.calls[0][0]).toBe(1);
    await waitFor(() => expect(screen.queryByText('Holiday on Friday', { selector: 'p.text-sm.leading-6' })).toBeNull());
    expect(screen.getByText('Exam schedule out', { selector: 'p.text-sm.leading-6' })).toBeInTheDocument();
  });

  it('keeps the item and shows the error when the API fails', async () => {
    vi.mocked(announcementService.deleteAnnouncement).mockRejectedValue(apiError(403, 'Forbidden: insufficient role'));
    renderWith(<AnnouncementsPage />);
    await screen.findByText('Holiday on Friday', { selector: 'p.text-sm.leading-6' });
    const dialog = await openDialogFor('Delete announcement');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Forbidden: insufficient role');
    expect(screen.getByText('Holiday on Friday', { selector: 'p.text-sm.leading-6' })).toBeInTheDocument();
  });
});

describe('Notifications delete', () => {
  const notifications = [
    { id: 11, user_id: 1, type: 'ANNOUNCEMENT', message: 'Fees reminder', task_id: null, is_read: false, created_at: '2026-10-01T00:00:00Z' },
    { id: 12, user_id: 1, type: 'TASK_ASSIGNED', message: 'New task for you', task_id: 3, is_read: true, created_at: '2026-10-02T00:00:00Z' }
  ];

  beforeEach(() => {
    vi.mocked(notificationService.getNotifications).mockResolvedValue(notifications as never);
    store.dispatch(setNotifications(notifications as never));
  });

  it('confirms, calls the API, and removes the row and the unread count', async () => {
    vi.mocked(notificationService.deleteNotification).mockResolvedValue(undefined);
    renderWith(<NotificationsPage />);
    await screen.findByText('Fees reminder');
    const dialog = await openDialogFor('Delete notification');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Fees reminder')).toBeNull());
    expect(vi.mocked(notificationService.deleteNotification).mock.calls[0][0]).toBe(11);
    expect(screen.getByText('New task for you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mark All Read \(0\)/ })).toBeInTheDocument();
  });

  it('treats 404 (already deleted) as success', async () => {
    vi.mocked(notificationService.deleteNotification).mockRejectedValue(apiError(404, 'Notification not found'));
    renderWith(<NotificationsPage />);
    await screen.findByText('Fees reminder');
    const dialog = await openDialogFor('Delete notification');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Fees reminder')).toBeNull());
  });

  it('keeps the row and shows the error on failure', async () => {
    vi.mocked(notificationService.deleteNotification).mockRejectedValue(apiError(500, 'Server exploded'));
    renderWith(<NotificationsPage />);
    await screen.findByText('Fees reminder');
    const dialog = await openDialogFor('Delete notification');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server exploded');
    expect(screen.getByText('Fees reminder')).toBeInTheDocument();
  });

  it('does not mark the notification read when Delete is clicked', async () => {
    renderWith(<NotificationsPage />);
    await screen.findByText('Fees reminder');
    await openDialogFor('Delete notification');
    expect(notificationService.markAsRead).not.toHaveBeenCalled();
  });
});

describe('Approval Requests delete', () => {
  const approvals = [
    { id: 21, type: 'PURCHASE', title: 'Projector purchase', details: null, amount: 1000, status: 'PENDING', requested_by: 2, approved_by: null, created_at: '2026-10-01T00:00:00Z', processed_at: null, requestedBy: { id: 2, name: 'Anita Rao' } },
    { id: 22, type: 'EVENT', title: 'Sports day', details: null, amount: null, status: 'APPROVED', requested_by: 2, approved_by: 1, created_at: '2026-10-02T00:00:00Z', processed_at: null, requestedBy: { id: 2, name: 'Anita Rao' } }
  ];

  beforeEach(() => {
    vi.mocked(approvalService.getAllApprovals).mockResolvedValue(approvals as never);
  });

  it('confirms, deletes, and updates the list and tab counts immediately', async () => {
    vi.mocked(approvalService.deleteApproval).mockImplementation(async () => {
      vi.mocked(approvalService.getAllApprovals).mockResolvedValue(approvals.slice(1) as never);
    });
    renderWith(<ApprovalManagement />);
    await screen.findByText('Projector purchase');
    expect(screen.getByRole('button', { name: 'All (2)' })).toBeInTheDocument();
    const dialog = await openDialogFor('Delete approval request');
    expect(within(dialog).getByText(/Projector purchase/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Projector purchase')).toBeNull());
    expect(vi.mocked(approvalService.deleteApproval).mock.calls[0][0]).toBe(21);
    expect(screen.getByRole('button', { name: 'All (1)' })).toBeInTheDocument();
    expect(screen.getByText('Sports day')).toBeInTheDocument();
  });

  it('does nothing when cancelled', async () => {
    renderWith(<ApprovalManagement />);
    await screen.findByText('Projector purchase');
    const dialog = await openDialogFor('Delete approval request');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(approvalService.deleteApproval).not.toHaveBeenCalled();
    expect(screen.getByText('Projector purchase')).toBeInTheDocument();
  });

  it('shows the backend error and keeps the request on failure', async () => {
    vi.mocked(approvalService.deleteApproval).mockRejectedValue(apiError(403, 'Forbidden: insufficient role'));
    renderWith(<ApprovalManagement />);
    await screen.findByText('Projector purchase');
    const dialog = await openDialogFor('Delete approval request');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Forbidden: insufficient role');
    expect(screen.getByText('Projector purchase')).toBeInTheDocument();
  });
});
