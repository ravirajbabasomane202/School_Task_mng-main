import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HRTaskTable from '../components/tables/HRTaskTable';
import type { Task } from '../types/task.types';

vi.mock('../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) }
}));

const tasks = [
  { id: 1, title: 'Prepare payroll', priority: 'HIGH', status: 'PENDING', due_date: '2026-05-01', start_date: '2026-04-01' },
  { id: 2, title: 'Update staff records', priority: 'LOW', status: 'COMPLETED', due_date: '2026-05-03', start_date: '2026-04-02' }
] as unknown as Task[];

const original = window.matchMedia;
const setPhone = (isPhone: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 767px') ? isPhone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn()
  })) as unknown as typeof window.matchMedia;
};

const renderTable = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <HRTaskTable tasks={tasks} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('HRTaskTable responsive layout', () => {
  afterEach(() => {
    window.matchMedia = original;
  });

  it('renders a table on larger screens', () => {
    setPhone(false);
    renderTable();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('task-card-list')).toBeNull();
  });

  it('renders cards on phones', () => {
    setPhone(true);
    renderTable();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByTestId('task-card-list').children).toHaveLength(2);
    expect(screen.getByText('Prepare payroll')).toBeInTheDocument();
  });
});
