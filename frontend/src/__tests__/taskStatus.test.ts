import { describe, it, expect } from 'vitest';
import { getAllowedStatuses, getStatusErrorMessage } from '../utils/taskStatus';
import type { TaskStatus } from '../types/task.types';

const task = (status: TaskStatus) => ({ assigned_by: 10, assigned_to: 20, status });
const ALL = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];

describe('getAllowedStatuses', () => {
  it.each(ALL as TaskStatus[])('assigner gets all 5 statuses when task is %s', (status) => {
    expect(getAllowedStatuses(task(status), 10)).toEqual(ALL);
  });

  it.each(['PENDING', 'IN_PROGRESS', 'DELAYED'] as TaskStatus[])(
    'assignee gets IN_PROGRESS/COMPLETED when task is %s',
    (status) => {
      expect(getAllowedStatuses(task(status), 20)).toEqual(['IN_PROGRESS', 'COMPLETED']);
    }
  );

  it.each(['COMPLETED', 'ESCALATED'] as TaskStatus[])('assignee gets nothing when task is %s', (status) => {
    expect(getAllowedStatuses(task(status), 20)).toEqual([]);
  });

  it('everyone else (including a director) gets nothing', () => {
    expect(getAllowedStatuses(task('PENDING'), 30)).toEqual([]);
    expect(getAllowedStatuses(task('PENDING'), undefined)).toEqual([]);
    expect(getAllowedStatuses(task('PENDING'), null)).toEqual([]);
  });

  it('assigner rights win when the same user is assigner and assignee', () => {
    expect(getAllowedStatuses({ assigned_by: 5, assigned_to: 5, status: 'COMPLETED' }, 5)).toEqual(ALL);
  });

  it('compares ids numerically so string ids from storage still match', () => {
    expect(getAllowedStatuses(task('PENDING'), '10')).toEqual(ALL);
  });
});

describe('getStatusErrorMessage', () => {
  it('returns the backend message', () => {
    expect(getStatusErrorMessage({ response: { data: { message: 'Nope' } } })).toBe('Nope');
  });
  it('falls back for unknown errors', () => {
    expect(getStatusErrorMessage(new Error('x'))).toMatch(/Failed to update/);
    expect(getStatusErrorMessage({ response: { data: {} } }, 'custom')).toBe('custom');
  });
});
