import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterCalendar from '../components/registers/RegisterCalendar';
import RegisterCalendarPopup from '../components/registers/RegisterCalendarPopup';
import RegisterDetailsModal from '../components/registers/RegisterDetailsModal';
import RegistryPerformancePanel from '../components/registers/RegistryPerformancePanel';
import { RegisterLegend } from '../components/registers/RegisterMarkers';
import * as registerService from '../services/registerService';
import * as dashboardService from '../services/dashboardService';
import { checkTooltip, formatCheckedOn } from '../utils/registerUtils';
import { summarizeRegisterEvents, totalsFromSummaries } from '../utils/registerPerformance';
import type { Register, RegisterCalendarEvent } from '../types/register.types';

vi.mock('../services/registerService');
vi.mock('../services/dashboardService');
vi.mock('../services/reportService');

// Weekly register, current period Mon 5 Oct - Sun 11 Oct 2026, checked Thu 8 Oct 10:42 IST (05:12 UTC).
const CHECKED_AT = '2026-10-08T05:12:00+00:00';

function lateRegister(overrides: Partial<Register> = {}): Register {
  return {
    id: 1, name: 'Attendance Register', register_no: 'R-1', head_name: 'Head', checking_cycle: 'WEEKLY',
    cycle: 'WEEKLY', priority: 'LOW', status: 'OK', computed_status: 'COMPLETED', dot_color: 'yellow',
    start_date: '2026-01-01', next_due_date: '2026-10-12', current_due_date: '2026-10-05',
    current_checked_at: CHECKED_AT, current_check_outcome: 'LATE', current_check_timing: 'LATE',
    current_period_start: '2026-10-05', current_period_end: '2026-10-11',
    checked_in_current_period: true, can_check: false, check_block_reason: 'Already checked',
    created_at: '2026-01-01T00:00:00Z', ...overrides,
  } as Register;
}

function event(over: Partial<RegisterCalendarEvent>): RegisterCalendarEvent {
  return {
    id: `1:${over.date}`, register_id: 1, occurrence_id: null, occurrence_date: over.date as string,
    title: 'Attendance Register (R-1)', status: 'OK', computed_status: 'COMPLETED', color: 'green',
    dot_color: 'green', is_future_or_pending: false, register: lateRegister(), ...over,
  } as RegisterCalendarEvent;
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T06:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('Due Date and Checked On formatting', () => {
  it('shows the check moment in school time (IST), not UTC', () => {
    expect(formatCheckedOn(CHECKED_AT)).toBe('8 Oct 2026, 10:42 AM');
    // 19:00 UTC on the 5th is 00:30 IST on the 6th
    expect(formatCheckedOn('2026-10-05T19:00:00+00:00')).toBe('6 Oct 2026, 12:30 AM');
  });

  it('says so when a register was checked but its time was never recorded', () => {
    expect(formatCheckedOn(null, true)).toBe('Checked (Date Unknown)');
    expect(formatCheckedOn(null)).toBe('Not Checked Yet');
  });

  it('yellow tooltip names the due and the checked date', () => {
    expect(checkTooltip({ check_outcome: 'LATE', due_date: '2026-10-05', checked_at: CHECKED_AT }))
      .toBe('Checked After Due Date - Due 5 Oct 2026, Checked 8 Oct 2026');
  });
});

describe('UI shows Due Date and Checked On for a late check', () => {
  it('register details show both', () => {
    render(<RegisterDetailsModal register={lateRegister()} onClose={() => {}} />);
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('5 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Checked On')).toBeInTheDocument();
    expect(screen.getByText('8 Oct 2026, 10:42 AM')).toBeInTheDocument();
    expect(screen.getByText('Checked After Due Date')).toBeInTheDocument();
  });

  it('calendar popup shows both for the late period, and a yellow marker titled with both dates', async () => {
    vi.mocked(registerService.getRegisterCalendarFor).mockResolvedValue({
      register: lateRegister(), month: '2026-10',
      entries: [{
        date: '2026-10-05', status: 'COMPLETED', dot_color: 'yellow', occurrence_id: 3,
        period_start: '2026-10-05', period_end: '2026-10-11', is_open: true,
        due_date: '2026-10-05', checked_at: CHECKED_AT, check_outcome: 'LATE', check_timing: 'LATE',
      }],
    } as never);
    renderWithClient(<RegisterCalendarPopup register={lateRegister()} onClose={() => {}} />);
    // Clicking any day of the current period (Mon 5 Oct is the first '5' in the Oct grid) opens its details.
    await userEvent.click((await screen.findAllByText('5', { selector: 'span' }))[0]);
    expect(await screen.findByTestId('popup-due-date')).toHaveTextContent('5 Oct 2026');
    expect(screen.getByTestId('popup-checked-on')).toHaveTextContent('8 Oct 2026, 10:42 AM');
  });

  it('calendar marker for a late check is yellow with the exact tooltip', () => {
    render(
      <RegisterCalendar
        events={[event({
          date: '2026-10-05', dot_color: 'yellow', due_date: '2026-10-05', checked_at: CHECKED_AT,
          check_outcome: 'LATE', check_timing: 'LATE',
        })]}
      />
    );
    const marker = screen.getByRole('button', { name: /Checked After Due Date - Due 5 Oct 2026, Checked 8 Oct 2026/ });
    expect(marker.querySelector('span')?.className).toContain('bg-[#EAB308]');
  });
});

describe('legend: each colour has exactly one meaning', () => {
  it('yellow is only Checked After Due Date; Not Checked has its own marker', () => {
    render(<RegisterLegend />);
    const legend = screen.getByTestId('register-legend');
    expect(within(legend).getByText('Checked After Due Date')).toBeInTheDocument();
    expect(within(legend).getByText('Not Checked')).toBeInTheDocument();
    expect(within(legend).queryByText(/Missed/i)).toBeNull();
    const yellowItems = Array.from(legend.querySelectorAll('span.bg-\\[\\#EAB308\\]'));
    expect(yellowItems).toHaveLength(1);
    expect(yellowItems[0].parentElement).toHaveTextContent('Checked After Due Date');
  });

  it('the calendar shows the legend, and a not-checked marker is not yellow', () => {
    render(
      <RegisterCalendar
        events={[event({ date: '2026-10-05', dot_color: 'missed', check_outcome: 'DELAYED', due_date: '2026-10-05' })]}
      />
    );
    expect(screen.getByTestId('register-legend')).toBeInTheDocument();
    const marker = screen.getByRole('button', { name: /Not Checked - Due 5 Oct 2026/ });
    expect(marker.querySelector('span')?.className).not.toContain('EAB308');
  });
});

describe('performance counts come from the backend outcome and add up', () => {
  const registers = [lateRegister()];
  const events = [
    event({ date: '2026-09-07', due_date: '2026-09-07', check_outcome: 'ON_TIME', dot_color: 'green' }),
    event({ date: '2026-09-14', due_date: '2026-09-14', check_outcome: 'LATE', dot_color: 'yellow', checked_at: CHECKED_AT }),
    event({ date: '2026-09-21', due_date: '2026-09-21', check_outcome: 'DELAYED', dot_color: 'missed' }),
    event({ date: '2026-09-28', due_date: '2026-09-28', check_outcome: 'REJECTED', dot_color: 'red' }),
    event({ date: '2026-10-05', due_date: '2026-10-05', check_outcome: 'UPCOMING', dot_color: 'gray' }),
  ];

  it('on time + after due + not checked + rejected = total, open periods excluded', () => {
    const summaries = summarizeRegisterEvents(registers, events, { from: '2026-09-01', to: '2026-10-08' }, '2026-10-08');
    const t = totalsFromSummaries(summaries);
    expect([t.onTime, t.late, t.notChecked, t.rejected]).toEqual([1, 1, 1, 1]);
    expect(t.totalChecks).toBe(4);
    expect(t.onTime + t.late + t.notChecked + t.rejected).toBe(t.totalChecks);
  });

  it('a period belongs to the range by its due date', () => {
    const t = totalsFromSummaries(
      summarizeRegisterEvents(registers, events, { from: '2026-09-14', to: '2026-09-20' }, '2026-10-08')
    );
    expect(t.totalChecks).toBe(1);
    expect(t.late).toBe(1);
  });

  it('never re-derives lateness: the backend outcome wins', () => {
    const odd = [event({
      date: '2026-09-07', due_date: '2026-09-07', check_outcome: 'ON_TIME',
      checked_at: '2026-09-30T05:00:00+00:00',   // would look late if compared locally
    })];
    const t = totalsFromSummaries(summarizeRegisterEvents(registers, odd, { from: '2026-09-01', to: '2026-10-08' }, '2026-10-08'));
    expect([t.onTime, t.late]).toEqual([1, 0]);
  });

  it('the Performance panel cards show the same numbers and labels as the table', async () => {
    vi.mocked(registerService.getRegisters).mockResolvedValue(registers);
    vi.mocked(registerService.getRegisterCalendarEvents).mockResolvedValue(events);
    vi.mocked(dashboardService.getStaffPerformance).mockResolvedValue([]);
    renderWithClient(<RegistryPerformancePanel />);

    const card = async (label: string) =>
      (await screen.findByText(label, { selector: 'p' })).nextElementSibling?.textContent;
    expect(await card('Total Estimated Check')).toBe('4');
    expect(await card('On Time Checked')).toBe('1');
    expect(await card('Checked After Due Date')).toBe('1');
    expect(await card('Not Checked')).toBe('1');
    expect(await card('Rejected')).toBe('1');

    const row = (await screen.findByText('Attendance Register', { selector: 'td, td *' })).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    for (const header of ['On Time Checked', 'Checked After Due Date', 'Not Checked', 'Rejected', 'Total Estimated Check']) {
      expect(screen.getAllByText(header, { selector: 'th' }).length).toBeGreaterThan(0);
    }
    expect(cells).toEqual(expect.arrayContaining(['1', '1', '1', '1', '4']));
  });
});
