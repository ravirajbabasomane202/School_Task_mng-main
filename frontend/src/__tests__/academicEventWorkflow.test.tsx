import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcademicEventDetailsModal from '../components/academicCalendar/AcademicEventDetailsModal';
import PrintableCalendar from '../components/academicCalendar/PrintableCalendar';
import AcademicCalendarPage from '../pages/AcademicCalendarPage';
import * as service from '../services/academicEventService';
import type { AcademicEvent } from '../types/academicEvent.types';

vi.mock('../services/academicEventService', () => ({
  createAcademicEvent: vi.fn(),
  deleteAcademicEvent: vi.fn(),
  downloadAcademicEventAttachment: vi.fn(),
  getAcademicEvents: vi.fn(),
  getPendingEventUpdates: vi.fn(),
  getAcademicEventHistory: vi.fn(),
  submitEventReason: vi.fn(),
  completeAcademicEvent: vi.fn(),
  updateEventApproval: vi.fn(),
  updateAcademicEvent: vi.fn()
}));
vi.mock('../services/userService', () => ({ getAllUsers: vi.fn().mockResolvedValue([]) }));

const base: AcademicEvent = {
  id: 1, title: 'Annual Day', description: 'Programme', category: 'CELEBRATION',
  start_date: '2026-03-10', end_date: '2026-03-10', start_time: '09:00', end_time: '11:00',
  location: 'Hall', target_audience: ['ALL'], attachment_filename: null, has_attachment: false,
  created_by: 1, created_by_name: 'Chairman', created_at: null, updated_at: null,
  responsible_user_id: 7, responsible_name: 'Ravi Kumar', responsible_head_type: 'Admin Head',
  completion_status: 'PENDING', workflow_status: 'REASON_REQUIRED', workflow_label: 'Reason Required',
  is_overdue: true, non_completion_reason: null, reason_submitted_by_name: null, reason_submitted_at: null,
  completed_by: null, completed_by_name: null, actual_completion_date: null, completion_remarks: null,
  approval_status: 'PENDING', approval_remarks: null, approval_updated_by_name: null, approval_updated_at: null,
  original_start_date: '2026-03-10', original_start_time: '09:00'
};

function providers(child: ReactNode, user = { id: 7, role: 'HR', name: 'Ravi Kumar' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({ reducer: { auth: () => ({ user }) } });
  return (
    <Provider store={store}>
      <QueryClientProvider client={client}><MemoryRouter>{child}</MemoryRouter></QueryClientProvider>
    </Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.getPendingEventUpdates).mockResolvedValue([]);
  vi.mocked(service.getAcademicEvents).mockResolvedValue([]);
});

describe('Event details workflow', () => {
  it('lets the responsible person submit a reason for an overdue event', async () => {
    vi.mocked(service.submitEventReason).mockResolvedValue({ ...base, non_completion_reason: 'Rain', workflow_status: 'PENDING_COMPLETION' });
    render(providers(<AcademicEventDetailsModal currentUserId={7} event={base} onClose={() => undefined} />));
    expect(screen.getByTestId('event-workflow-status')).toHaveTextContent('Reason Required');
    expect(screen.getByText('Ravi Kumar (Admin Head)')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/has not been completed/);

    fireEvent.click(screen.getByRole('button', { name: 'Submit Reason' }));
    const submit = screen.getAllByRole('button', { name: 'Submit Reason' }).at(-1)!;
    expect(submit).toBeDisabled();                                    // blank reasons are not submittable
    fireEvent.change(screen.getByLabelText(/Why was the event not completed/), { target: { value: 'Rain' } });
    fireEvent.click(submit);
    await waitFor(() => expect(service.submitEventReason).toHaveBeenCalledWith(1, 'Rain'));
  });

  it('hides all update controls from people who are neither responsible nor managers', () => {
    render(providers(<AcademicEventDetailsModal currentUserId={99} event={base} onClose={() => undefined} />));
    expect(screen.queryByRole('button', { name: /Submit Reason/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark as Completed/ })).toBeNull();
    expect(screen.getByText('Ravi Kumar (Admin Head)')).toBeInTheDocument();      // still informed
  });

  it('managers can update any event', () => {
    render(providers(<AcademicEventDetailsModal currentUserId={99} event={base} isManager onClose={() => undefined} />));
    expect(screen.getByRole('button', { name: /Mark as Completed/ })).toBeInTheDocument();
  });

  it('completion defaults management approval to Pending and requires a reason when late', async () => {
    vi.mocked(service.completeAcademicEvent).mockResolvedValue({ ...base, completion_status: 'COMPLETED', workflow_status: 'AWAITING_APPROVAL' });
    render(providers(<AcademicEventDetailsModal currentUserId={7} event={base} onClose={() => undefined} />));
    fireEvent.click(screen.getByRole('button', { name: /Mark as Completed/ }));
    const approval = screen.getByLabelText('Management Approval') as HTMLSelectElement;
    expect(approval.value).toBe('PENDING');
    expect(screen.getByLabelText(/Reason it was not completed on schedule/)).toBeRequired();
    fireEvent.change(screen.getByLabelText(/Reason it was not completed on schedule/), { target: { value: 'Venue clash' } });
    fireEvent.change(screen.getByLabelText('Event Completion Remarks'), { target: { value: 'All good' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Completion' }));
    await waitFor(() => expect(service.completeAcademicEvent).toHaveBeenCalled());
    const [id, payload] = vi.mocked(service.completeAcademicEvent).mock.calls[0];
    expect(id).toBe(1);
    expect(payload).toMatchObject({ remarks: 'All good', reason: 'Venue clash', approval_status: 'PENDING' });
  });

  it('shows completion details and approval separately for a completed event', () => {
    const done: AcademicEvent = {
      ...base, completion_status: 'COMPLETED', workflow_status: 'AWAITING_APPROVAL', workflow_label: 'Awaiting Management Approval',
      is_overdue: false, completed_by_name: 'Ravi Kumar', actual_completion_date: '2026-03-10',
      completion_remarks: 'Great turnout', approval_status: 'PENDING'
    };
    render(providers(<AcademicEventDetailsModal currentUserId={7} event={done} onClose={() => undefined} />));
    const details = screen.getByTestId('event-workflow-details');
    expect(within(details).getByText('Great turnout')).toBeInTheDocument();
    expect(within(details).getByText('Pending')).toBeInTheDocument();
    expect(screen.getByTestId('event-workflow-status')).toHaveTextContent('Awaiting Management Approval');
    expect(screen.getByRole('button', { name: 'Update Management Approval' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark as Completed/ })).toBeNull();
  });

  it('loads the audit trail on demand', async () => {
    vi.mocked(service.getAcademicEventHistory).mockResolvedValue([
      { id: 1, event_id: 1, action: 'CREATED', summary: 'Event created', user_id: 1, user_name: 'Chairman', created_at: '2026-03-01T10:00:00Z' }
    ]);
    render(providers(<AcademicEventDetailsModal currentUserId={7} event={base} onClose={() => undefined} />));
    expect(service.getAcademicEventHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show event history' }));
    expect(await screen.findByText('Event created')).toBeInTheDocument();
  });
});

describe('Calendar printing', () => {
  const many = Array.from({ length: 6 }, (_, index): AcademicEvent => ({
    ...base, id: 100 + index, title: `Event number ${index + 1}`, start_time: `0${index + 1}:00`, end_time: `0${index + 1}:30`
  }));
  const completed: AcademicEvent = {
    ...base, id: 200, title: 'Finished event', completion_status: 'COMPLETED', workflow_status: 'APPROVED', workflow_label: 'Approved',
    is_overdue: false, completed_by_name: 'Ravi Kumar', actual_completion_date: '2026-03-11', completion_remarks: 'Went well',
    approval_status: 'YES', approval_remarks: 'Signed off', non_completion_reason: 'Rain delay'
  };

  it('prints every event of a month (none truncated) with all workflow information', () => {
    render(<PrintableCalendar job={{ mode: 'month', start: '2026-03-01', end: '2026-03-31', events: [...many, completed], printedBy: 'Admin' }} />);
    const root = screen.getByTestId('calendar-print-root');
    expect(within(root).getByText(/Academic Calendar — March 2026/)).toBeInTheDocument();
    for (let i = 1; i <= 6; i += 1) {
      expect(within(root).getAllByText(`Event number ${i}`).length).toBeGreaterThan(0);   // grid + detail table, all 6 shown
    }
    expect(within(root).getAllByText('Sunday').length).toBeGreaterThan(0);
    const table = root.querySelector('table.print-table') as HTMLElement;
    expect(within(table).getAllByText(/Ravi Kumar/).length).toBeGreaterThan(0);
    expect(within(table).getByText('Rain delay')).toBeInTheDocument();
    expect(within(table).getByText('Signed off')).toBeInTheDocument();
    expect(within(table).getByText(/Remarks: Went well/)).toBeInTheDocument();
    expect(within(table).getByText('Yes')).toBeInTheDocument();
    for (const heading of ['Responsible Person', 'Status', 'Completion', 'Management Approval', 'Time']) {
      expect(within(table).getByText(heading)).toBeInTheDocument();
    }
    expect(root).toHaveTextContent('Printed on');
  });

  it('prints a range or a single date as detail tables limited to that period, with an empty message', () => {
    const outside = { ...base, id: 300, title: 'Outside the range', start_date: '2026-05-01', end_date: '2026-05-01' };
    const { unmount } = render(<PrintableCalendar job={{ mode: 'range', start: '2026-03-01', end: '2026-03-15', events: [base, outside] }} />);
    expect(screen.getAllByText('Annual Day').length).toBe(1);
    expect(screen.queryByText('Outside the range')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Monday' })).toBeNull();          // no month grid for ranges
    unmount();
    render(<PrintableCalendar job={{ mode: 'date', start: '2026-04-01', end: '2026-04-01', events: [base] }} />);
    expect(screen.getByText('No events are scheduled on this date.')).toBeInTheDocument();
  });
});

describe('Calendar page filters and print', () => {
  it('filters by a selected date and clears back to the full calendar', async () => {
    vi.mocked(service.getAcademicEvents).mockResolvedValue([base]);
    render(providers(<AcademicCalendarPage />));
    await screen.findByRole('button', { name: 'Current Month' });
    expect(screen.queryByTestId('filtered-events')).toBeNull();

    fireEvent.change(screen.getByLabelText('Select Date'), { target: { value: '2026-03-10' } });
    expect(await screen.findByTestId('filtered-events')).toBeInTheDocument();
    expect(screen.getByTestId('filter-summary')).toHaveTextContent(/on 10 Mar 2026/);
    await waitFor(() => expect(service.getAcademicEvents).toHaveBeenCalledWith({ start: '2026-03-10', end: '2026-03-10' }));

    fireEvent.click(screen.getByRole('button', { name: /Clear Filters/ }));
    await waitFor(() => expect(screen.queryByTestId('filtered-events')).toBeNull());
    expect((screen.getByLabelText('Select Date') as HTMLInputElement).value).toBe('');
  });

  it('filters by start and end date, and flags an inverted range', async () => {
    vi.mocked(service.getAcademicEvents).mockResolvedValue([base]);
    render(providers(<AcademicCalendarPage />));
    await screen.findByRole('button', { name: 'Current Month' });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-03-20' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-03-05' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Start date must be on or before the end date/);
    expect(screen.queryByTestId('filtered-events')).toBeNull();
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-03-31' } });
    expect(await screen.findByTestId('filtered-events')).toBeInTheDocument();
    await waitFor(() => expect(service.getAcademicEvents).toHaveBeenCalledWith({ start: '2026-03-20', end: '2026-03-31' }));
  });

  it('supports month navigation (previous, next, current month)', async () => {
    render(providers(<AcademicCalendarPage />));
    const heading = await screen.findByRole('heading', { level: 2, name: /\d{4}/ });
    const original = heading.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Next period' }));
    expect(screen.getByRole('heading', { level: 2, name: /\d{4}/ }).textContent).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(screen.getByRole('heading', { level: 2, name: /\d{4}/ }).textContent).not.toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Current Month' }));
    expect(screen.getByRole('heading', { level: 2, name: /\d{4}/ }).textContent).toBe(original);
  });

  it('fetches the printed period fresh and opens the print dialog', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    vi.mocked(service.getAcademicEvents).mockResolvedValue([base]);
    render(providers(<AcademicCalendarPage />));
    await screen.findByRole('button', { name: 'Current Month' });
    fireEvent.click(screen.getByRole('button', { name: /Print Calendar/ }));
    fireEvent.click(screen.getByLabelText(/Selected date range/));
    fireEvent.change(screen.getByLabelText('Start Date', { selector: '#print-start' }), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('End Date', { selector: '#print-end' }), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(await screen.findByTestId('calendar-print-root')).toBeInTheDocument();
    expect(service.getAcademicEvents).toHaveBeenCalledWith({ start: '2026-03-01', end: '2026-03-31' });
    await waitFor(() => expect(printSpy).toHaveBeenCalled(), { timeout: 2000 });
    printSpy.mockRestore();
  });

  it('shows the update-required banner for overdue events assigned to the user', async () => {
    vi.mocked(service.getPendingEventUpdates).mockResolvedValue([base]);
    render(providers(<AcademicCalendarPage />));
    const banner = await screen.findByTestId('pending-event-updates');
    expect(banner).toHaveTextContent('1 event needs your update');
    fireEvent.click(within(banner).getByRole('button', { name: /Annual Day/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
