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
      head_name: 'Anita', status: 'OK', onTimeChecked: 3, checkedAfterDueDate: 2, notChecked: 1,
      totalPeriodsDue: 6, open: 0, completionRate: 83,
      periods: [
        period(1), period(2), period(3, { outcome: 'LATE', dot_color: 'yellow', check_timing: 'LATE',
          checked_at: '2026-09-06T05:12:00+00:00' }),
        period(4), period(5), period(6, { outcome: 'DELAYED', dot_color: 'outline', check_timing: null, checked_at: null }),
        period(7, { outcome: 'LATE', dot_color: 'yellow', check_timing: 'LATE', checked_at: '2026-09-09T05:12:00+00:00' }),
      ],
    }],
    totals: { onTimeChecked: 3, checkedAfterDueDate: 2, notChecked: 1, totalPeriodsDue: 6, open: 0, totalRegisters: 1 },
  }) as never);
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><RegistryPerformancePanel /></QueryClientProvider>);
}

describe('Registry performance panel', () => {
  it('cards and table columns show the backend numbers and add up', async () => {
    renderPanel();
    const row = (await screen.findByText('Fire Register', { selector: 'td' })).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    // ... On Time Checked | Checked After Due Date | Not Checked | Total Periods Due
    expect(cells.slice(5, 9)).toEqual(['3', '2', '1', '6']);
    expect(3 + 2 + 1).toBe(6);

    for (const [label, value] of [['On Time Checked', '3'], ['Checked After Due Date', '2'],
      ['Not Checked', '1'], ['Total Periods Due', '6']]) {
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
});
