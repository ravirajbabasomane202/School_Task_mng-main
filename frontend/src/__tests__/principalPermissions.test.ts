import { describe, expect, it } from 'vitest';
import {
  ASSIGNEE_ONLY_ROLES,
  CHAIRMAN_LEVEL_ROLES,
  ELEVATED_ROLES,
  isChairmanLevel,
  isElevatedRole,
} from '../constants/roles';
import { getAllowedStatuses, isRestrictedAssignee, isTaskAssignee, isTaskAssigner } from '../utils/taskStatus';

const ALL = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ESCALATED'];
const CHAIRMAN_ID = 1;
const PRINCIPAL_ID = 2;
const TEACHER_ID = 3;
const DIRECTOR_ID = 4;

describe('role groups', () => {
  it('Principal is Chairman-level, Director is elevated but not Chairman-level', () => {
    expect(CHAIRMAN_LEVEL_ROLES).toEqual(['CHAIRMAN', 'PRINCIPAL']);
    expect(ELEVATED_ROLES).toEqual(['CHAIRMAN', 'PRINCIPAL', 'DIRECTOR']);
    expect(ASSIGNEE_ONLY_ROLES).toEqual(['PRINCIPAL']);
    expect(isChairmanLevel('PRINCIPAL')).toBe(true);
    expect(isChairmanLevel('DIRECTOR')).toBe(false);
    expect(isElevatedRole('DIRECTOR')).toBe(true);
    expect(isChairmanLevel('HR')).toBe(false);
    expect(isChairmanLevel(undefined)).toBe(false);
  });
});

describe('task assigner rules for the Principal', () => {
  const assignedToPrincipal = {
    assigned_by: CHAIRMAN_ID, assigned_to: PRINCIPAL_ID, status: 'PENDING' as const,
    assignedBy: { role: 'CHAIRMAN' },
  };
  const assignedToTeacher = {
    assigned_by: CHAIRMAN_ID, assigned_to: TEACHER_ID, status: 'PENDING' as const,
    assignedBy: { role: 'CHAIRMAN' },
  };

  it('on a task assigned to them the Principal is only the assignee', () => {
    expect(isTaskAssigner(assignedToPrincipal, PRINCIPAL_ID, 'PRINCIPAL')).toBe(false);
    expect(isTaskAssignee(assignedToPrincipal, PRINCIPAL_ID, 'PRINCIPAL')).toBe(true);
    expect(isRestrictedAssignee(assignedToPrincipal, PRINCIPAL_ID, 'PRINCIPAL')).toBe(true);
    expect(getAllowedStatuses(assignedToPrincipal, PRINCIPAL_ID, 'PRINCIPAL')).toEqual(['IN_PROGRESS', 'COMPLETED']);
  });

  it('a completed or escalated task is locked for the assignee Principal', () => {
    for (const status of ['COMPLETED', 'ESCALATED'] as const) {
      expect(getAllowedStatuses({ ...assignedToPrincipal, status }, PRINCIPAL_ID, 'PRINCIPAL')).toEqual([]);
    }
  });

  it("the Principal administers tasks the Chairman assigned to other people", () => {
    expect(isTaskAssigner(assignedToTeacher, PRINCIPAL_ID, 'PRINCIPAL')).toBe(true);
    expect(isRestrictedAssignee(assignedToTeacher, PRINCIPAL_ID, 'PRINCIPAL')).toBe(false);
    expect(getAllowedStatuses(assignedToTeacher, PRINCIPAL_ID, 'PRINCIPAL')).toEqual(ALL);
  });

  it('the Chairman keeps administering every task, including those assigned to the Principal', () => {
    expect(isTaskAssigner(assignedToPrincipal, CHAIRMAN_ID, 'CHAIRMAN')).toBe(true);
    expect(getAllowedStatuses(assignedToPrincipal, CHAIRMAN_ID, 'CHAIRMAN')).toEqual(ALL);
  });

  it('tasks assigned by a Director stay with the Director (not Chairman-level)', () => {
    const byDirector = { assigned_by: DIRECTOR_ID, assigned_to: TEACHER_ID, assignedBy: { role: 'DIRECTOR' } };
    expect(isTaskAssigner(byDirector, PRINCIPAL_ID, 'PRINCIPAL')).toBe(false);
    expect(isTaskAssigner(byDirector, CHAIRMAN_ID, 'CHAIRMAN')).toBe(false);
  });

  it('without a role the helper behaves exactly as before (identity only)', () => {
    expect(isTaskAssigner(assignedToTeacher, PRINCIPAL_ID)).toBe(false);
    expect(isTaskAssigner(assignedToTeacher, CHAIRMAN_ID)).toBe(true);
  });

  it('other roles are unaffected', () => {
    expect(getAllowedStatuses(assignedToTeacher, TEACHER_ID, 'HR')).toEqual(['IN_PROGRESS', 'COMPLETED']);
    expect(getAllowedStatuses(assignedToTeacher, 99, 'FINANCE')).toEqual([]);
  });
});
