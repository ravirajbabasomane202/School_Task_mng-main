import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChairmanOverview from '../pages/chairman/ChairmanOverview';
import * as dashboardService from '../services/dashboardService';
import * as reportService from '../services/reportService';
import api from '../services/api';
import { summarizeRegisterTotals, summarizeTaskTotals } from '../utils/performanceUtils';

vi.mock('../services/dashboardService');
vi.mock('../services/reportService');
vi.mock('../services/api');
vi.mock('../components/charts/TaskStatusPieChart', () => ({ default: () => <div data-testid="pie" /> }));

const base = {
  userId: 0, name: '', role: 'HR', totalTasks: 0, completedTasks: 0, onTimeCompleteTasks: 0,
  completedAfterDueTasks: 0, pendingTasks: 0, inProgressTasks: 0, escalatedTasks: 0, delayedTasks: 0,
  performanceScore: 0, delayRate: 0, totalRegisters: 0, checkingCycles: [], completedRegisters: 0,
  onTimeCompleteRegisters: 0, completedAfterDueRegisters: 0, pendingRegisters: 0, missedRegisters: 0,
  rejectedRegisters: 0, registerPerformance: 0, overallPerformance: 0,
};

const rows = [
  { ...base, userId: 1, name: 'Anita', role: 'HR', totalTasks: 5, completedTasks: 3, onTimeCompleteTasks: 2,
    completedAfterDueTasks: 1, pendingTasks: 1, delayedTasks: 1, performanceScore: 48,
    totalRegisters: 2, registerPerformance: 90 },
  { ...base, userId: 2, name: 'Ravi', role: 'IT', totalTasks: 3, completedTasks: 3, onTimeCompleteTasks: 3,
    performanceScore: 100, totalRegisters: 1, registerPerformance: 40 },
];
const registerSummaries = [
  { onTimeChecked: 3, checkedAfterDueDate: 2, notChecked: 1, delayed: 1 },
  { onTimeChecked: 1, checkedAfterDueDate: 0, notChecked: 2, delayed: 0 },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = configureStore({ reducer: { auth: () => ({ user: { id: 1 } }) } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter><ChairmanOverview /></MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { alerts: [], recentTasks: [], pendingApprovalsList: [] } } });
  vi.mocked(dashboardService.getStaffPerformance).mockResolvedValue(rows as never);
  vi.mocked(reportService.getRegisterPerformance).mockResolvedValue(
    { summaries: registerSummaries, totals: {} } as never
  );
});

const cardValue = (group: HTMLElement, label: string) =>
  within(group).getByText(label, { selector: 'h3' }).nextElementSibling?.textContent;

describe('Chairman dashboard', () => {
  it('shows a Tasks group and a Registers group with the Performance labels and totals', async () => {
    renderPage();
    const tasks = (await screen.findByRole('region', { name: 'Tasks' }));
    const registers = screen.getByRole('region', { name: 'Registers' });

    expect(within(tasks).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(
      ['Total Tasks', 'On Time Complete', 'Completed After Due Date', 'Not Completed', 'Delayed']);
    expect(within(registers).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(
      ['Total Registers', 'On Time Checked', 'Checked After Due Date', 'Not Checked', 'Delayed']);

    // numbers come from the same helpers the Performance screen uses
    const t = summarizeTaskTotals(rows as never);
    expect(cardValue(tasks, 'Total Tasks')).toBe(String(t.totalTasks));
    expect(cardValue(tasks, 'On Time Complete')).toBe('5');
    expect(cardValue(tasks, 'Completed After Due Date')).toBe('1');
    expect(cardValue(tasks, 'Not Completed')).toBe('2');
    expect(cardValue(tasks, 'Delayed')).toBe('1');
    const r = summarizeRegisterTotals(registerSummaries);
    expect(cardValue(registers, 'Total Registers')).toBe(String(r.totalRegisters));
    expect(cardValue(registers, 'On Time Checked')).toBe('4');
    expect(cardValue(registers, 'Not Checked')).toBe('3');

    // the old Completed / Pending Approvals stat cards are gone (the Pending Approvals LIST remains)
    for (const old of ['Completed', 'Pending Approvals']) {
      expect(within(tasks).queryByText(old, { selector: 'h3' })).toBeNull();
    }
  });

  it('orders Top Performers (Tasks), the pie chart, then Top Performers (Registers); no Leadership panel', async () => {
    renderPage();
    const a = await screen.findByText('Top Performers (Tasks)');
    await screen.findAllByTestId('pie');
    // two pie charts: Tasks and Registers
    const pies = screen.getAllByTestId('pie');
    expect(pies).toHaveLength(2);
    expect(screen.getByText('Task Status Distribution')).toBeInTheDocument();
    expect(screen.getByText('Register Status Distribution')).toBeInTheDocument();
    const b = screen.getByText('Top Performers (Registers)');
    const follows = (x: Node, y: Node) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(a, pies[0])).toBe(true);
    expect(follows(pies[1], b)).toBe(true);
    expect(screen.queryByText(/Leadership Performance/)).toBeNull();
  });
});
