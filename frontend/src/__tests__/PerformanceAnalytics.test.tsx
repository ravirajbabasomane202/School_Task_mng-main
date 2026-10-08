import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceAnalytics from '../pages/chairman/PerformanceAnalytics';
import * as dashboardService from '../services/dashboardService';
import * as roleService from '../services/roleService';
import * as registerService from '../services/registerService';

vi.mock('../services/dashboardService');
vi.mock('../services/roleService');
vi.mock('../services/registerService');
vi.mock('../services/reportService');

const base = {
  totalTasks: 0, completedTasks: 0, onTimeCompleteTasks: 0, completedAfterDueTasks: 0,
  pendingTasks: 0, inProgressTasks: 0, escalatedTasks: 0, delayedTasks: 0, performanceScore: 0,
  delayRate: 0, totalRegisters: 0, checkingCycles: [], completedRegisters: 0,
  onTimeCompleteRegisters: 0, completedAfterDueRegisters: 0, pendingRegisters: 0,
  missedRegisters: 0, rejectedRegisters: 0, registerPerformance: 0, overallPerformance: 0,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PerformanceAnalytics />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(roleService.getAllRoles).mockResolvedValue([
    { id: 7, key: 'ADMISSION', name: 'Admission Head' },
    { id: 9, key: 'Librarian', name: 'Library Head' },
  ]);
  vi.mocked(dashboardService.getStaffPerformance).mockResolvedValue([
    { ...base, userId: 1, name: 'Anita Rao', role: 'ADMISSION', roleId: 7, roleName: 'Admission Head',
      totalTasks: 1, pendingTasks: 1 },
    { ...base, userId: 2, name: 'Admission Head', role: 'ADMISSION', roleId: 7, roleName: 'Admission Head',
      totalTasks: 1, inProgressTasks: 1 },
    { ...base, userId: 3, name: 'Lena', role: 'Librarian', roleId: 9, roleName: 'Library Head',
      totalTasks: 4, completedTasks: 4, onTimeCompleteTasks: 4 },
  ]);
  vi.mocked(registerService.getRegisters).mockResolvedValue([]);
  vi.mocked(registerService.getRegisterCalendarEvents).mockResolvedValue([]);
});

describe('Performance page', () => {
  it('shows backend roles, the new column names and no Delay Rate', async () => {
    renderPage();
    expect((await screen.findAllByText('Library Head', { selector: 'td' })).length).toBeGreaterThan(0);
    for (const header of ['In Progress', 'On Time Checked', 'Checked After Due Date']) {
      expect(screen.getAllByText(header, { selector: 'th' }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/Delay Rate/i)).toBeNull();
    expect(screen.queryByText('On Time Complete')).toBeNull();
    expect(screen.queryByText('Complete After Due Date')).toBeNull();
  });

  it('groups by role so two Admission Head tasks total 2', async () => {
    renderPage();
    const cell = (await screen.findAllByText('Admission Head', { selector: 'td' }))[0];
    const cells = within(cell.closest('tr') as HTMLElement).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('2'); // Total Tasks
  });

  it('role filter lists backend roles and filters by key', async () => {
    renderPage();
    const select = await screen.findByLabelText('Role');
    await userEvent.selectOptions(select, 'Librarian');
    expect(screen.queryAllByText('Admission Head', { selector: 'td' })).toHaveLength(0);
    expect(screen.getAllByText('Library Head', { selector: 'td' }).length).toBeGreaterThan(0);
  });
});
