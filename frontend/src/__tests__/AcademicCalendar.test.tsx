import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcademicCalendarPage from '../pages/AcademicCalendarPage';
import UpcomingAcademicEvents from '../components/academicCalendar/UpcomingAcademicEvents';
import * as academicEventService from '../services/academicEventService';
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

const today = new Date();
const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const sampleEvent: AcademicEvent = {
  id: 21,
  title: 'First Unit Test',
  description: 'Assessment for all classes',
  category: 'EXAMINATION',
  start_date: dateKey,
  end_date: dateKey,
  start_time: '09:00',
  end_time: '11:00',
  location: 'School Hall',
  target_audience: ['ALL'],
  attachment_filename: null,
  has_attachment: false,
  created_by: 1,
  created_by_name: 'Chairman',
  created_at: null,
  updated_at: null,
  responsible_user_id: null,
  responsible_name: null,
  responsible_head_type: null,
  completion_status: 'PENDING',
  workflow_status: 'PLANNED',
  workflow_label: 'Planned',
  is_overdue: false,
  non_completion_reason: null,
  reason_submitted_by_name: null,
  reason_submitted_at: null,
  completed_by: null,
  completed_by_name: null,
  actual_completion_date: null,
  completion_remarks: null,
  approval_status: 'PENDING',
  approval_remarks: null,
  approval_updated_by_name: null,
  approval_updated_at: null,
  original_start_date: dateKey,
  original_start_time: '09:00'
};

function renderWithProviders(child: ReactNode, role = 'HR') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({
    reducer: { auth: () => ({ user: { id: 1, role } }) }
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{child}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe('Academic calendar and dashboard events', () => {
  beforeEach(() => {
    vi.mocked(academicEventService.getAcademicEvents).mockResolvedValue([sampleEvent]);
    vi.mocked(academicEventService.getPendingEventUpdates).mockResolvedValue([]);
  });

  it('renders events in the calendar and opens read-only details for other users', async () => {
    renderWithProviders(<AcademicCalendarPage />);

    const eventButton = await screen.findByRole('button', {
      name: /First Unit Test, EXAMINATION, 09:00/
    });
    expect(screen.queryByRole('button', { name: /Add Event/ })).toBeNull();
    fireEvent.click(eventButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Assessment for all classes')).toBeInTheDocument();
    expect(within(dialog).getByText('All users')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Edit Event' })).toBeNull();
  });

  it('shows event-management controls for a Chairman and supports calendar views', async () => {
    renderWithProviders(<AcademicCalendarPage />, 'CHAIRMAN');

    expect(await screen.findByRole('button', { name: /Add Event/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'week' }));
    expect(screen.getByRole('button', { name: 'week' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    expect(screen.getByRole('button', { name: 'day' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows upcoming dashboard events with date, time, and details', async () => {
    renderWithProviders(<UpcomingAcademicEvents />);

    const eventButton = await screen.findByRole('button', { name: /First Unit Test/ });
    expect(eventButton).toHaveTextContent('09:00–11:00');
    fireEvent.click(eventButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Assessment for all classes')).toBeInTheDocument();
  });
});
