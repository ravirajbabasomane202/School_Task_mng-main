# Principal = Chairman-level permissions (Part 2)

Copy the files in `backend/` and `frontend/` over the matching paths in the project.
`principal-permissions.patch` (outside this folder) shows the same changes as a diff.

## How it works
* **One source of truth:** `backend/app/utils/permissions.py` defines
  `CHAIRMAN_LEVEL_ROLES = (CHAIRMAN, PRINCIPAL)`, `ELEVATED_ROLES` (+ DIRECTOR) and
  `ASSIGNEE_ONLY_ROLES = (PRINCIPAL,)`. Every route that used `'CHAIRMAN'` or
  `('CHAIRMAN','DIRECTOR')` now builds its role list from these groups. No new role was created.
  Frontend mirror: `constants/roles.ts`.
* **Task rule (tasks.py):** a Principal looking at a task assigned TO them is only the assignee.
  They can set In Progress / Completed, add a comment, upload proof. Anything that changes the
  task (description, title, priority, dates, cadence, department, assignee) returns 403 with a
  clear message; delete and escalate are 403. Re-sending an unchanged value is allowed.
  Principal's uploads on such a task always go to `proof_path`, never over the original brief.
* **Every other task:** Principal can create, assign, edit, reassign, set any status, monitor
  and delete, like the Chairman. Chairman-level users share management of tasks that a
  Chairman-level user assigned (Principal manages the Chairman's tasks and vice versa).
  Tasks assigned by a Director still belong to the Director, as before.
* **Frontend:** Principal enters the `/chairman/*` shell (Chairman menu + "My Tasks"), is redirected
  there after login, and sees edit/delete hidden on tasks assigned to them.

## Safeguards added (not in your list, but needed to share Chairman power safely)
1. Only the Chairman can modify, deactivate, or create a Chairman account.
2. A Principal cannot approve/reject their own approval request.
3. A Principal cannot assign a task to themselves (create or reassign).
4. Fixed the existing "cannot deactivate your own account" check (compared int to a string, never fired).

## Not changed (decisions for you)
* Principal stays in staff Performance and in the assignee list (so the Chairman can assign to them).
* Registers: Principal can mark registers they head as "checked" (same as Chairman today).
* The 24 backend / 36 frontend tests that already failed before this work still fail, unchanged.
* "Progress" is the task status (In Progress); the app has no separate progress-percentage field.
