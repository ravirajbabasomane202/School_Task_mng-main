import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import AppShell from '../components/common/AppShell';

// Sidebar/Navbar need Redux + React Query; AppShell's job is only the drawer state, so stub them.
vi.mock('../components/common/Sidebar', () => ({
  default: ({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) => (
    <aside data-open={String(Boolean(isOpen))} data-testid="sidebar">
      <button onClick={onClose} type="button">
        close-sidebar
      </button>
    </aside>
  )
}));

vi.mock('../components/common/Navbar', () => ({
  default: ({ onMenuClick }: { onMenuClick?: () => void }) => (
    <button aria-label="Open navigation menu" onClick={onMenuClick} type="button">
      hamburger
    </button>
  )
}));

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/a']}>
      <AppShell>
        <Link to="/b">go-b</Link>
      </AppShell>
    </MemoryRouter>
  );

const isOpen = () => screen.getByTestId('sidebar').getAttribute('data-open') === 'true';

describe('AppShell responsive drawer', () => {
  it('is closed by default with no backdrop', () => {
    renderShell();
    expect(isOpen()).toBe(false);
    expect(screen.queryByTestId('sidebar-backdrop')).toBeNull();
  });

  it('hamburger opens the drawer, shows the backdrop and locks body scroll', () => {
    renderShell();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    expect(isOpen()).toBe(true);
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('backdrop click closes the drawer and restores body scroll', () => {
    renderShell();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.click(screen.getByTestId('sidebar-backdrop'));
    expect(isOpen()).toBe(false);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('Escape closes the drawer', () => {
    renderShell();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });

  it('route change closes the drawer', () => {
    renderShell();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    expect(isOpen()).toBe(true);
    fireEvent.click(screen.getByText('go-b'));
    expect(isOpen()).toBe(false);
  });

  it('sidebar onClose closes the drawer', () => {
    renderShell();
    fireEvent.click(screen.getByLabelText('Open navigation menu'));
    fireEvent.click(screen.getByText('close-sidebar'));
    expect(isOpen()).toBe(false);
  });
});
