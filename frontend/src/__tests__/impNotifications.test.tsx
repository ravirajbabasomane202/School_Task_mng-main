import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImpNotificationsPage from '../pages/ImpNotificationsPage';
import Sidebar from '../components/common/Sidebar';
import * as service from '../services/impNotificationService';
import type { ImpNotification } from '../types/impNotification.types';

vi.mock('../services/impNotificationService', () => ({
  createImpNotification: vi.fn(),
  deleteImpNotification: vi.fn(),
  getImpAssignmentOptions: vi.fn(),
  getImpNotification: vi.fn(),
  getImpNotifications: vi.fn(),
  setImpNotificationActive: vi.fn(),
  updateImpNotification: vi.fn(),
  updateImpNotificationStatus: vi.fn(),
}));
vi.mock('../services/approvalService', () => ({ getAllApprovals: vi.fn().mockResolvedValue([]) }));

const sample: ImpNotification = {
  id: 7,
  title: 'Academic Calendar Creation',
  description: 'Prepare and finalize the academic calendar.',
  due_date: '2027-06-25',
  start_date: '2027-06-20',
  recurrence: 'YEARLY',
  priority: 'HIGH',
  assigned_roles: [],
  assigned_user_ids: [3],
  assignees: [{ id: 3, name: 'Ekta Madam', role: 'IT' }],
  is_active: true,
  created_by: 1,
  created_by_name: 'Chairman',
  created_at: null,
  cycle: {
    id: 1, cycle_number: 1, due_date: '2027-06-25', status: 'PENDING',
    completed_at: null, completed_by: null, completed_by_name: null, is_overdue: true,
  },
  current_due_date: '2027-06-25',
  status: 'PENDING',
  next_reminder: '2027-06-26',
  history: [
    { id: 1, cycle_number: 1, due_date: '2027-06-25', status: 'DONE', completed_at: '2027-06-27T05:00:00Z', completed_by: 3, completed_by_name: 'Ekta Madam', is_overdue: false },
    { id: 2, cycle_number: 2, due_date: '2028-06-25', status: 'PENDING', completed_at: null, completed_by: null, completed_by_name: null, is_overdue: false },
    { id: null, cycle_number: 3, due_date: '2029-06-25', status: 'UPCOMING', completed_at: null, completed_by: null, completed_by_name: null, is_overdue: false },
  ],
};

function renderAs(role: string, child: ReactNode, url = '/imp-notifications') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({
    reducer: {
      auth: () => ({ user: { id: 1, role, name: 'T' }, token: 't', isAuthenticated: true }),
      notifications: () => ({ notifications: [], unreadCount: 0 }),
    },
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>{child}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe('Imp Notification page', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // keep the global matchMedia mock from test/setup.ts
    vi.mocked(service.getImpNotifications).mockResolvedValue([sample]);
    vi.mocked(service.getImpNotification).mockResolvedValue(sample);
    vi.mocked(service.getImpAssignmentOptions).mockResolvedValue({ users: [], roles: [] });
  });

  it('shows the dashboard columns and manager actions for the Chairman', async () => {
    renderAs('CHAIRMAN', <ImpNotificationsPage />);
    expect(await screen.findByText('Academic Calendar Creation')).toBeInTheDocument();
    for (const header of ['Due Date', 'Assigned To', 'Recurrence', 'Priority', 'Status', 'Next Reminder', 'Actions']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const table = screen.getByRole('table');
    expect(within(table).getByText('Yearly')).toBeInTheDocument();
    expect(within(table).getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Notification/ })).toBeInTheDocument();
    for (const action of ['View', 'Edit', 'Mark Done', 'Deactivate', 'Delete']) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
    }
  });

  it('hides create/edit/delete/activate from an assigned non-manager but keeps progress actions', async () => {
    renderAs('HR', <ImpNotificationsPage />);
    expect(await screen.findByText('Academic Calendar Creation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Notification/ })).toBeNull();
    for (const action of ['Edit', 'Delete', 'Deactivate']) {
      expect(screen.queryByRole('button', { name: action })).toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Mark Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In Progress' })).toBeInTheDocument();
    expect(service.getImpAssignmentOptions).not.toHaveBeenCalled();
  });

  it('Mark Done asks for confirmation, then calls the API', async () => {
    vi.mocked(service.updateImpNotificationStatus).mockResolvedValue({ ...sample, status: 'PENDING', current_due_date: '2028-06-25' });
    renderAs('CHAIRMAN', <ImpNotificationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Done' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/next cycle will be scheduled automatically/)).toBeInTheDocument();
    expect(service.updateImpNotificationStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Done' }));
    await waitFor(() => expect(service.updateImpNotificationStatus).toHaveBeenCalledWith(7, 'DONE'));
  });

  it('opens the notification and its cycle history from a reminder deep link', async () => {
    renderAs('HR', <ImpNotificationsPage />, '/imp-notifications?open=7');
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Cycle History')).toBeInTheDocument());
    expect(service.getImpNotification).toHaveBeenCalledWith(7);
    expect(within(dialog).getByText('Not generated yet')).toBeInTheDocument();
    expect(within(dialog).getByText('Upcoming')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ekta Madam/, { selector: 'td' })).toBeInTheDocument();
  });

  it('validates the create form before calling the API', async () => {
    renderAs('CHAIRMAN', <ImpNotificationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /New Notification/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Notification' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Notification title is required');
    expect(service.createImpNotification).not.toHaveBeenCalled();
  });
});

describe('Sidebar labels', () => {
  it.each(['CHAIRMAN', 'PRINCIPAL', 'DIRECTOR', 'HR'])('%s sees Imp Documents and Imp Notification', (role) => {
    renderAs(role, <Sidebar isOpen onClose={() => undefined} />, '/');
    expect(screen.getByRole('link', { name: /Imp Documents/ })).toHaveAttribute('href', '/documents');
    expect(screen.getByRole('link', { name: /Imp Notification/ })).toHaveAttribute('href', '/imp-notifications');
    expect(screen.queryByText('Important Documents')).toBeNull();
  });
});
