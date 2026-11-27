import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DocumentAudiencePicker from '../components/importantDocuments/DocumentAudiencePicker';
import * as userService from '../services/userService';
import type { DocumentAudienceSelection } from '../types/importantDocument.types';
import type { User } from '../types/user.types';

vi.mock('../services/userService', () => ({ getAllUsers: vi.fn() }));

const make = (id: number, name: string, active = true): User => ({
  id, name, email: `${name}@x.test`, role: 'HR', head_type: `Head ${id}`, department_id: null, is_active: active, last_login: null
});

function Harness({ onValue }: { onValue: (v: DocumentAudienceSelection) => void }) {
  const [value, setValue] = useState<DocumentAudienceSelection>({ visibleToAll: false, userIds: [] });
  return (
    <DocumentAudiencePicker
      onChange={(next) => { setValue(next); onValue(next); }}
      value={value}
    />
  );
}

function renderPicker(onValue = vi.fn()) {
  vi.mocked(userService.getAllUsers).mockResolvedValue([make(1, 'Asha'), make(2, 'Bala'), make(3, 'Chitra'), make(4, 'Gone', false)]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness onValue={onValue} /></QueryClientProvider>);
  return onValue;
}

describe('Document audience picker', () => {
  it('lists only active users as checkboxes and selects individual and multiple users', async () => {
    const onValue = renderPicker();
    expect(await screen.findByLabelText(/Asha/)).not.toBeChecked();
    expect(screen.queryByLabelText(/Gone/)).toBeNull();           // inactive users are not offered
    fireEvent.click(screen.getByLabelText(/Asha/));
    fireEvent.click(screen.getByLabelText(/Chitra/));
    expect(onValue).toHaveBeenLastCalledWith({ visibleToAll: false, userIds: [1, 3] });
    fireEvent.click(screen.getByLabelText(/Asha/));
    expect(onValue).toHaveBeenLastCalledWith({ visibleToAll: false, userIds: [3] });
  });

  it('Select All means everyone; unticking one user turns it into an explicit list of the others', async () => {
    const onValue = renderPicker();
    await screen.findByLabelText(/Asha/);
    fireEvent.click(screen.getByLabelText(/Select All/));
    expect(onValue).toHaveBeenLastCalledWith({ visibleToAll: true, userIds: [] });
    expect(screen.getByLabelText(/Bala/)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/Bala/));
    expect(onValue).toHaveBeenLastCalledWith({ visibleToAll: false, userIds: [1, 3] });
  });

  it('Deselect All clears the selection and the search narrows the list', async () => {
    const onValue = renderPicker();
    await screen.findByLabelText(/Asha/);
    fireEvent.click(screen.getByLabelText(/Select All/));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    expect(onValue).toHaveBeenLastCalledWith({ visibleToAll: false, userIds: [] });
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'bal' } });
    expect(screen.getByLabelText(/Bala/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Asha/)).toBeNull();
  });
});
