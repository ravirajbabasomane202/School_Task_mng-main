import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnimatedLogo from '../components/brand/AnimatedLogo';

describe('AnimatedLogo', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders a static logo when reduced motion is preferred', () => {
    render(<AnimatedLogo />);
    const logo = screen.getByRole('img', { name: 'Adhira International School' });
    expect(logo).not.toHaveClass('is-playing');
  });

  it('does not replay when session storage is blocked after the first mount', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = render(<AnimatedLogo />);
    expect(screen.getByRole('img', { name: 'Adhira International School' })).toHaveClass('is-playing');
    first.unmount();
    render(<AnimatedLogo />);
    expect(screen.getByRole('img', { name: 'Adhira International School' })).not.toHaveClass('is-playing');
  });

  it('lets replayOnMount override the session flag', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    sessionStorage.setItem('adhira_logo_intro_played', '1');
    render(<AnimatedLogo replayOnMount />);
    expect(screen.getByRole('img', { name: 'Adhira International School' })).toHaveClass('is-playing');
  });
});
