import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegistryPerformancePanel from '../components/registers/RegistryPerformancePanel';
import * as registerService from '../services/registerService';
import * as reportService from '../services/reportService';
import * as dashboardService from '../services/dashboardService';

vi.mock('../services/registerService');
vi.mock('../services/reportService');
vi.mock('../services/dashboardService');

const period = (n: number, over: Record<string, unknown> = {}) => ({
  date: `2026-09-${String(n).padStart(2, '0')}`, due_date: `2026-09-${String(n).padStart(2, '0')}`,
  period_end: `2026-09-${String(n + 6).padStart(2, '0')}`, outcome: 'ON_TIME', dot_color: 'green',
  check_timing: 'ON_TIME', checked_at: `2026-09-${String(n).padStart(2, '0')}T05:00:00+00:00`,
  checked_at_unknown: false, ...over,
});

beforeEach(() => {
  vi.mocked(registerService.getRegisters).mockResolvedValue([
    { id: 1, name: 'Fire Register', register_no: 'R-1', head_id: 5, head_name: 'Anita', checking_cycle: 'WEEKLY', status: 'OK' },
  ] as never);
  vi.mocked(dashboardService.getStaffPerformance).mockResolvedValue([]);
  vi.mocked(reportService.getRegisterPerformance).mockResolvedValue(({
    summaries: [{
      register_id: 1, name: 'Fire Register', register_no: 'R-1', cycle: 'WEEKLY', head_id: 5,
      head_name: 'Anita', role: 'ADMISSION', roleName: 'Admission', status: 'OK', onTimeChecked: 3, checkedAfterDueDate: 2, notChecked: 2,
      totalPeriodsDue: 7, open: 1, completionRate: 71,
      periods: [
        period(1), period(2), period(3, { outcome: 'LATE', dot_color: 'yellow', check_timing: 'LATE',
          checked_at: '2026-09-06T05:12:00+00:00' }),
        period(4), period(5), period(6, { outcome: 'DELAYED', dot_color: 'outline', check_timing: null, checked_at: null }),
        period(7, { outcome: 'LATE', dot_color: 'yellow', check_timing: 'LATE', checked_at: '2026-09-09T05:12:00+00:00' }),
      ],
    }],
    totals: { onTimeChecked: 3, checkedAfterDueDate: 2, notChecked: 2, totalPeriodsDue: 7, open: 1, totalRegisters: 1 },
  }) as never);
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RegistryPerformancePanel /></QueryClientProvider>);
}

describe('Registry performance panel', () => {
  it('shows exactly the four register cards (plus Total Registers) directly below the filters', async () => {
    renderPanel();
    await screen.findByText('Fire Register', { selector: 'td' });
    const labels = screen
      .getAllByText(/^(On Time Checked|Checked After Due Date|Not Checked|Total Registers)$/, { selector: 'p' })
      .map((p) => p.textContent);
    expect(labels).toEqual(['On Time Checked', 'Checked After Due Date', 'Not Checked', 'Total Registers']);

    // directly below the filters: the first card comes after the last filter and before the table
    const filter = screen.getByLabelText('Status');
    const firstCard = screen.getAllByText('On Time Checked', { selector: 'p' })[0];
    const table = screen.getAllByRole('table')[0];
    expect(filter.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(firstCard.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no task cards and does not load task data', async () => {
    renderPanel();
    await screen.findByText('Fire Register', { selector: 'td' });
    for (const label of ['Total Task', 'Total Tasks', 'Completed', 'Not Completed', 'Performance', 'Final Performance',
      'Total Required Due', 'Checked']) {
      expect(screen.queryAllByText(label, { selector: 'p' })).toHaveLength(0);
    }
    expect(dashboardService.getStaffPerformance).not.toHaveBeenCalled();
  });

  it('cards equal the table columns and the four buckets add up to Total Required Due', async () => {
    renderPanel();
    const row = (await screen.findByText('Fire Register', { selector: 'td' })).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    // ... On Time Checked | Checked After Due Date | Not Checked | Total Required Due
    expect(cells.slice(5, 9)).toEqual(['3', '2', '2', '7']);
    expect(3 + 2 + 2).toBe(7);

    for (const [label, value] of [['On Time Checked', '3'], ['Checked After Due Date', '2'],
      ['Not Checked', '2'], ['Total Registers', '1']]) {
      const card = screen.getAllByText(label, { selector: 'p' })[0].parentElement as HTMLElement;
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
  });

  it('Recent Activity shows only the latest 5 (newest first) with +N more', async () => {
    renderPanel();
    const row = (await screen.findByText('Fire Register', { selector: 'td' })).closest('tr') as HTMLElement;
    const strip = within(row).getByTitle('Latest 5, Newest First');
    expect(strip.querySelectorAll('span[title]')).toHaveLength(5);
    expect(within(strip).getByText('+2 more')).toBeInTheDocument();
    const first = strip.querySelector('span[title]') as HTMLElement;
    expect(first.getAttribute('title')).toMatch(/Checked After Due Date - Due 07 Sep\w* 2026, Checked 09 Sep\w* 2026/);
  });

  it('does not classify periods itself: it uses the backend report', async () => {
    renderPanel();
    await screen.findByText('Fire Register', { selector: 'td' });
    expect(reportService.getRegisterPerformance).toHaveBeenCalled();
    expect(registerService.getRegisterCalendarEvents).not.toHaveBeenCalled();
  });

  it('has no Delayed column or card for registers', async () => {
    renderPanel();
    await screen.findByText('Fire Register', { selector: 'td' });
    expect(screen.queryAllByText('Delayed')).toHaveLength(0);
  });

  it('Register Performance (per role) totals equal the cards and the Activity table, even for a head not linked to a user', async () => {
    const extra = (over: Record<string, unknown>) => ({
      register_id: 2, name: 'Book Issue Register', register_no: 'LIB-1', cycle: 'MONTHLY', head_id: null,
      head_name: 'Librarian', role: 'name:Librarian', roleName: 'Librarian', status: 'OK',
      onTimeChecked: 1, checkedAfterDueDate: 0, notChecked: 33, totalPeriodsDue: 34, open: 10,
      completionRate: 3, periods: [], ...over,
    });
    const current = await reportService.getRegisterPerformance({ dateFrom: 'a', dateTo: 'b' });
    vi.mocked(reportService.getRegisterPerformance).mockResolvedValue({
      ...current, summaries: [...current.summaries, extra({})] as never,
    });
    renderPanel();
    await screen.findByText('Book Issue Register', { selector: 'td' });

    const total = screen.getByTestId('register-performance-total');
    const cells = within(total).getAllByRole('cell').map((c) => c.textContent);
    // Total | registers | cycle | on time | after due | not checked | total due | performance %
    expect(cells).toEqual(['Total', '2', '', '4', '2', '35', '41', '15%']);
    expect(4 + 2 + 35).toBe(41);

    // the unlinked head is NOT dropped from the role table
    expect(screen.getAllByText('Librarian Head', { selector: 'td' }).length).toBeGreaterThan(0);

    // cards agree with the Total row
    for (const [label, value] of [['On Time Checked', '4'], ['Checked After Due Date', '2'],
      ['Not Checked', '35'], ['Total Registers', '2']]) {
      const card = screen.getAllByText(label, { selector: 'p' })[0].parentElement as HTMLElement;
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
  });
});
