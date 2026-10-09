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
    { id: 7, key: 'ADMISSION', name: 'Admission' },
    { id: 9, key: 'Librarian', name: 'Library Head' },
    { id: 11, key: 'TRANSPORT', name: 'Transport' }, // no performance rows yet
  ]);
  vi.mocked(dashboardService.getStaffPerformance).mockResolvedValue([
    { ...base, userId: 1, name: 'Anita Rao', role: 'ADMISSION', roleId: 7, roleName: 'Admission',
      totalTasks: 1, pendingTasks: 1 },
    { ...base, userId: 2, name: 'Admission Head', role: 'ADMISSION', roleId: 7, roleName: 'Admission',
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
    // Task table says Complete..., Register table keeps Checked...
    for (const header of ['In Progress', 'On Time Complete', 'Completed After Due Date',
      'On Time Checked', 'Checked After Due Date']) {
      expect(screen.getAllByText(header, { selector: 'th' }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/Delay Rate/i)).toBeNull();
    expect(screen.queryByText('On Time Checked Tasks')).toBeNull();
  });

  it('role dropdown lists ALL backend roles with " Head" added once', async () => {
    renderPage();
    const select = await screen.findByLabelText('Filter Tasks and Registers by Role');
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['All Roles', 'Admission Head', 'Library Head', 'Transport Head']);
    // the value is the role key, not the name
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['ALL', 'ADMISSION', 'Librarian', 'TRANSPORT']);
  });

  it('shows the same Head label in the table Role column as in the dropdown', async () => {
    renderPage();
    const cells = await screen.findAllByText('Admission Head', { selector: 'td' });
    expect(cells.length).toBeGreaterThan(0);               // both tables
    expect(screen.queryByText('Admission', { selector: 'td' })).toBeNull();
  });

  it('no longer shows the Register Checks and Task Status card groups', async () => {
    renderPage();
    await screen.findAllByText('Library Head', { selector: 'td' });
    expect(screen.queryByText('Register Checks')).toBeNull();
    expect(screen.queryByText('Task Status')).toBeNull();
    // none of their cards: the labels now only appear as table headers
    for (const label of ['On Time Checked', 'Checked After Due Date', 'Not Checked', 'Total Required Due',
      'Pending', 'In Progress', 'Delayed', 'Escalated']) {
      expect(screen.queryAllByText(label, { selector: 'h3' })).toHaveLength(0);
    }
  });

  it('keeps both tables with their columns', async () => {
    renderPage();
    await screen.findAllByText('Library Head', { selector: 'td' });
    for (const header of ['Total Tasks', 'Task Performance', 'Pending', 'In Progress', 'Delayed', 'Escalated',
      'Total Registers', 'Checking Cycle', 'Not Checked', 'Total Required Due', 'Register Performance']) {
      expect(screen.getAllByText(header, { selector: 'th' }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Overall Performance')).toBeNull();
    expect(screen.queryByText('Total Periods Due')).toBeNull();
  });

  it('task table never says Checked and the role filter label is tied to its select', async () => {
    renderPage();
    await screen.findAllByText('Library Head', { selector: 'td' });
    const taskTable = screen.getByRole('heading', { name: 'Task Performance' }).closest('div')!.parentElement!;
    expect(within(taskTable).queryByText(/Check/)).toBeNull();
    const label = screen.getByText('Filter Tasks and Registers by Role');
    expect(label.getAttribute('for')).toBe('performance-role-filter');
    expect(document.getElementById('performance-role-filter')?.tagName).toBe('SELECT');
  });

  it('groups by role so two Admission Head tasks total 2', async () => {
    renderPage();
    const cell = (await screen.findAllByText('Admission Head', { selector: 'td' }))[0];
    const cells = within(cell.closest('tr') as HTMLElement).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('2'); // Total Tasks
  });

  it('role filter filters by key', async () => {
    renderPage();
    const select = await screen.findByLabelText('Filter Tasks and Registers by Role');
    await userEvent.selectOptions(select, 'Librarian');
    expect(screen.queryAllByText('Admission Head', { selector: 'td' })).toHaveLength(0);
    expect(screen.getAllByText('Library Head', { selector: 'td' }).length).toBeGreaterThan(0);
  });
});
