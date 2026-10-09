import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApprovalManagement from '../pages/chairman/ApprovalManagement';
import * as approvalService from '../services/approvalService';

vi.mock('../services/approvalService');

beforeEach(() => {
  vi.mocked(approvalService.getAllApprovals).mockResolvedValue([
    { id: 1, type: 'PURCHASE', title: 'New Printer', status: 'APPROVED', requested_by: 1,
      created_at: '2026-05-28T00:00:00Z', amount: 50000, requestedBy: { id: 1, name: 'Admin Head', role: 'ADMIN' } },
  ] as never);
});

describe('Approvals page', () => {
  it('counts an approved request in its type card and has no Task Assignment Overview', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ApprovalManagement /></QueryClientProvider>);
    await screen.findByText('New Printer');
    const card = screen.getByText('Purchase Order', { selector: 'div.text-xs' }).parentElement!;
    expect(card).toHaveTextContent('1');
    expect(card).toHaveTextContent('0 pending');
    expect(screen.getByText('Budget Request', { selector: 'div.text-xs' }).parentElement).toHaveTextContent('0');
    expect(screen.queryByText('Task Assignment Overview')).toBeNull();
    expect(screen.queryByText(/Module \/ Head Wise/)).toBeNull();
  });
});
