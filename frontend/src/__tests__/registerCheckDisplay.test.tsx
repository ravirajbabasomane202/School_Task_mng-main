import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterCheckInfoRows from '../components/registers/RegisterCheckInfo';
import RegisterDetailsModal from '../components/registers/RegisterDetailsModal';
import { DOT_LEGEND } from '../constants/registerDots';
import type { Register } from '../types/register.types';
import { checkedOnText, dueDateText, markerTooltip } from '../utils/registerCheckUtils';

// Due on the 5th, checked on the 8th at 10:42 school time (05:12 UTC).
const lateCheck = {
  due_date: '2026-10-05',
  checked_at: '2026-10-08T05:12:00+00:00',
  check_timing: 'LATE' as const,
};

describe('register check display', () => {
  it('shows Due Date and Checked On (date + time) for a late check', () => {
    render(<RegisterCheckInfoRows info={lateCheck} />);
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('05 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Checked On')).toBeInTheDocument();
    expect(screen.getByText(/08 Oct 2026, 10:42/i)).toBeInTheDocument();
    expect(screen.getByText('Checked After Due Date')).toBeInTheDocument();
  });

  it('the register details modal shows Due Date and Checked On', () => {
    const register = {
      id: 1, name: 'Fire Register', register_no: 'R-1', head_name: 'Anita', checking_cycle: 'WEEKLY',
      priority: 'HIGH', status: 'OK', start_date: '2026-09-01', next_due_date: '2026-10-12', ...lateCheck,
    } as unknown as Register;
    render(<RegisterDetailsModal register={register} onClose={() => {}} />);
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Checked On')).toBeInTheDocument();
    expect(screen.getByText(/08 Oct 2026, 10:42/i)).toBeInTheDocument();
  });

  it('the yellow marker tooltip names the due and check dates', () => {
    expect(markerTooltip(lateCheck, 'x')).toBe('Checked After Due Date - Due 05 Oct 2026, Checked 08 Oct 2026');
    expect(markerTooltip({ due_date: '2026-10-05', checked_at: '2026-10-05T04:00:00+00:00', check_timing: 'ON_TIME' }, 'x'))
      .toBe('On Time Checked - Due 05 Oct 2026, Checked 05 Oct 2026');
    expect(markerTooltip({ due_date: '2026-10-05' }, 'Open / Future')).toBe('Open / Future');
  });

  it('shows check times in the SCHOOL time zone, not the viewer\'s', () => {
    // 19:00 UTC on the 5th is 00:30 IST on the 6th
    expect(checkedOnText({ checked_at: '2026-10-05T19:00:00+00:00' })).toMatch(/06 Oct 2026, 12:30 am/i);
    expect(dueDateText({ due_date: '2026-10-05' })).toBe('05 Oct 2026');
  });

  it('marks a checked register with no check time as date unknown (never invents one)', () => {
    expect(checkedOnText({ checked_at: null, checked_at_unknown: true })).toBe('Checked (Date Unknown)');
    expect(checkedOnText({ checked_at: null })).toBe('—');
  });

  it('every marker colour has exactly one meaning', () => {
    const colors = DOT_LEGEND.map((d) => d.color);
    const labels = DOT_LEGEND.map((d) => d.label);
    expect(new Set(colors).size).toBe(colors.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(DOT_LEGEND.find((d) => d.color === 'yellow')?.label).toBe('Checked After Due Date');
    expect(DOT_LEGEND.find((d) => d.color === 'outline')?.label).toBe('Not Checked');
  });
});
