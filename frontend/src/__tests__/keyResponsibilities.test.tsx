import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import KeyResponsibilitiesModal from '../components/keyResponsibilities/KeyResponsibilitiesModal';
import KeyResponsibilitiesEditor from '../components/keyResponsibilities/KeyResponsibilitiesEditor';
import MyKeyResponsibilities from '../components/keyResponsibilities/MyKeyResponsibilities';
import UserTable from '../components/tables/UserTable';
import * as service from '../services/keyResponsibilityService';
import type { User } from '../types/user.types';

vi.mock('../services/keyResponsibilityService', () => ({
  getMyKeyResponsibilities: vi.fn(),
  getKeyResponsibilityTemplates: vi.fn()
}));

const principal: User = {
  id: 2,
  name: 'Prachi Pande',
  email: 'prachi@school.test',
  role: 'PRINCIPAL',
  head_type: 'Principal',
  department_id: null,
  is_active: true,
  last_login: null,
  responsibility_summary: 'Head of the office',
  key_responsibilities: [
    { id: 1, description: 'Admission planning.', sort_order: 1 },
    { id: 2, description: 'Health and safety of the students.', sort_order: 2 }
  ]
};
const hrUser: User = {
  ...principal,
  id: 3,
  name: 'Hema HR',
  role: 'HR',
  head_type: 'HR Head',
  responsibility_summary: null,
  key_responsibilities: []
};

function withClient(child: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{child}</QueryClientProvider>;
}

describe('User Management table', () => {
  it('shows Name and Head Type in separate columns, a Key Responsibility column, and no Role column', () => {
    render(<UserTable users={[principal]} />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Name', 'Head Type', 'Key Responsibility', 'Email', 'Status', 'Actions']);
    expect(headers).not.toContain('Role');

    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Prachi Pande');
    expect(cells[0]).not.toHaveTextContent('Principal');
    expect(cells[1]).toHaveTextContent('Principal');
    expect(cells[1]).not.toHaveTextContent('Prachi');
  });

  it('opens the responsibilities of the clicked user only', () => {
    const onView = vi.fn();
    render(<UserTable onViewResponsibilities={onView} users={[principal, hrUser]} />);
    fireEvent.click(screen.getByRole('button', { name: 'View key responsibilities of Hema HR' }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(hrUser);
  });
});

describe('Key responsibilities popup', () => {
  it('shows profile and only the selected user\'s responsibilities', () => {
    render(<KeyResponsibilitiesModal onClose={() => undefined} user={principal} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Prachi Pande')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Principal').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Head of the office')).toBeInTheDocument();
    expect(within(dialog).getByText('Admission planning.')).toBeInTheDocument();
    expect(within(dialog).getByText('Health and safety of the students.')).toBeInTheDocument();
  });

  it('shows an empty state when none are assigned', () => {
    render(<KeyResponsibilitiesModal onClose={() => undefined} user={hrUser} />);
    expect(screen.getByText(/No key responsibilities have been assigned/)).toBeInTheDocument();
  });
});

describe('Dashboard key responsibilities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the signed-in user\'s responsibilities without sending any user id', async () => {
    vi.mocked(service.getMyKeyResponsibilities).mockResolvedValue({
      user_id: 2, name: 'Prachi Pande', head_type: 'Principal', role: 'PRINCIPAL',
      summary: 'Head of the office',
      items: principal.key_responsibilities!
    });
    render(withClient(<MyKeyResponsibilities />));
    expect(await screen.findByText('Admission planning.')).toBeInTheDocument();
    expect(screen.getByText('Head of the office')).toBeInTheDocument();
    expect(service.getMyKeyResponsibilities).toHaveBeenCalledWith(); // no id argument
    expect(screen.queryByRole('button')).toBeNull();                 // no extra View/navigation button
  });

  it('shows an empty-state message', async () => {
    vi.mocked(service.getMyKeyResponsibilities).mockResolvedValue({
      user_id: 3, name: 'Hema HR', head_type: null, role: 'HR', summary: null, items: []
    });
    render(withClient(<MyKeyResponsibilities />));
    expect(await screen.findByText(/No key responsibilities have been assigned to you yet/)).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.mocked(service.getMyKeyResponsibilities).mockRejectedValue(new Error('boom'));
    render(withClient(<MyKeyResponsibilities />));
    expect(await screen.findByText(/Unable to load your key responsibilities/)).toBeInTheDocument();
  });
});

describe('Key responsibilities editor', () => {
  it('adds, edits, reorders and removes rows', () => {
    vi.mocked(service.getKeyResponsibilityTemplates).mockResolvedValue({});
    const onChange = vi.fn();
    const { rerender } = render(withClient(
      <KeyResponsibilitiesEditor items={['One', 'Two']} onChange={onChange} role="HR" summary="" />
    ));
    fireEvent.change(screen.getByLabelText('Key responsibility 1'), { target: { value: 'Uno' } });
    expect(onChange).toHaveBeenLastCalledWith({ summary: '', items: ['Uno', 'Two'] });
    fireEvent.click(screen.getByRole('button', { name: 'Move responsibility 2 up' }));
    expect(onChange).toHaveBeenLastCalledWith({ summary: '', items: ['Two', 'One'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove responsibility 1' }));
    expect(onChange).toHaveBeenLastCalledWith({ summary: '', items: ['Two'] });
    fireEvent.click(screen.getByRole('button', { name: '+ Add responsibility' }));
    expect(onChange).toHaveBeenLastCalledWith({ summary: '', items: ['One', 'Two', ''] });
    rerender(withClient(<KeyResponsibilitiesEditor items={[]} onChange={onChange} role="HR" summary="" />));
    expect(screen.getByText('No key responsibilities added yet.')).toBeInTheDocument();
  });

  it('offers the standard list for the chosen role', async () => {
    vi.mocked(service.getKeyResponsibilityTemplates).mockResolvedValue({
      FINANCE: { title: 'Accounts Officer', summary: 'Finance records', items: ['A', 'B'] }
    });
    const onChange = vi.fn();
    render(withClient(<KeyResponsibilitiesEditor items={[]} onChange={onChange} role="FINANCE" summary="" />));
    fireEvent.click(await screen.findByRole('button', { name: /Use standard list for Accounts Officer/ }));
    expect(onChange).toHaveBeenCalledWith({ summary: 'Finance records', items: ['A', 'B'] });
  });
});
