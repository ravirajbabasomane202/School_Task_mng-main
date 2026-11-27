import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserManagement from '../pages/chairman/UserManagement';
import api from '../services/api';
import type { User } from '../types/user.types';

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../services/roleService', () => ({ getAllRoles: vi.fn().mockResolvedValue([]), createRole: vi.fn() }));
vi.mock('../services/keyResponsibilityService', () => ({
  getKeyResponsibilityTemplates: vi.fn().mockResolvedValue({}),
  getMyKeyResponsibilities: vi.fn()
}));

const users: User[] = [
  {
    id: 2, name: 'Prachi Pande', email: 'p@x.test', role: 'PRINCIPAL', head_type: 'Principal', department_id: null,
    is_active: true, last_login: null, sort_order: 1, responsibility_summary: 'Head of office',
    key_responsibilities: [{ id: 1, description: 'Admission planning.', sort_order: 1 }]
  },
  {
    id: 3, name: 'Hema', email: 'h@x.test', role: 'HR', head_type: 'HR Head', department_id: null,
    is_active: true, last_login: null, sort_order: 2, key_responsibilities: []
  }
];

function renderPage() {
  vi.mocked(api.get).mockResolvedValue({ data: { data: users } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><UserManagement /></MemoryRouter></QueryClientProvider>);
}

describe('User Management key responsibilities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens a popup with the responsibilities of the chosen user only', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'View key responsibilities of Prachi Pande' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Admission planning.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'View key responsibilities of Hema' }));
    const second = await screen.findByRole('dialog');
    expect(within(second).queryByText('Admission planning.')).toBeNull();
    expect(within(second).getByText(/No key responsibilities have been assigned/)).toBeInTheDocument();
  });

  it('sends the responsibilities typed in the Add New User popup', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 9 } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add New User' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Key Responsibilities')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Add responsibility' }));
    fireEvent.change(within(dialog).getByLabelText('Key responsibility 1'), { target: { value: 'Run the office' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Add responsibility' }));
    fireEvent.change(within(dialog).getByLabelText('Key responsibility 2'), { target: { value: 'File reports' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add User' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/users');
    expect(body.key_responsibilities).toEqual(['Run the office', 'File reports']);
  });

  it('pre-fills existing responsibilities when editing and saves the updated list', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} });
    renderPage();
    const row = (await screen.findByText('Prachi Pande')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Key responsibility 1') as HTMLTextAreaElement;
    expect(field.value).toBe('Admission planning.');
    fireEvent.change(field, { target: { value: 'Admission planning and review.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update User' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.put).mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/users/2');
    expect(body.key_responsibilities).toEqual(['Admission planning and review.']);
    expect(body.responsibility_summary).toBe('Head of office');
  });
});
