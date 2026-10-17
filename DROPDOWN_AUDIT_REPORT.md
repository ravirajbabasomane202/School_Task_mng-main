# Dropdown Audit and Implementation Report

## Root cause found

`frontend/src/constants/headOrder.ts` fetched users from the API but then intersected that result with a hardcoded `HEAD_ORDER` email whitelist. Only users whose email matched one of ten baked-in addresses could appear in `useOrderedHeads()`. New users therefore remained invisible in task assignment/monitoring even when the `/users` endpoint returned them. The hardcoded list also supplied fallback display names/head types in User Management and UserTable.

## Changes made

- `frontend/src/constants/headOrder.ts`: removed the hardcoded email whitelist from live dropdown data. Active eligible users now come from `getAllUsers()`, are filtered against task-assignable roles or an explicitly configured `head_type`, de-duplicated by ID, sorted by backend `sort_order` then name, and mapped to stable ID values/readable labels. The query has `staleTime: 0` and refetches on window focus.
- `frontend/src/pages/chairman/UserManagement.tsx`: successful create/update/deactivate mutations invalidate all `['users']` queries (including the ordered-head query) and task queries. Removed email-based fallback head assignments when editing a user.
- `frontend/src/components/tables/UserTable.tsx`: removed email-based hardcoded head-type display fallback; uses the user's stored `head_type` when present.

## Assign Head / assignment findings

In the checked source, `TaskAssignment.tsx` has one database-backed `Assign to` dropdown and `TaskMonitoring.tsx` has one database-backed `Assign Head` filter. The two files contain six native `<select>` elements combined, but only two select people; the other four are fixed task title, priority, cadence, and task-status controls. No set of six distinct `Assign Head` controls was found in these two source files. The repository's `HEAD_ORDER` contains ten hardcoded email entries, not six.

## Dropdown-containing source files discovered

The source scan found dropdown/select implementations in:

- `frontend/src/components/common/SelectWithOther.tsx`
- `frontend/src/components/registers/RegisterCalendarPopup.tsx`
- `frontend/src/components/registers/RegistryPerformancePanel.tsx`
- `frontend/src/components/tables/AdmissionTaskTable.tsx`
- `frontend/src/components/tables/HRTaskTable.tsx`
- `frontend/src/components/tables/TaskTable.tsx`
- `frontend/src/pages/chairman/AddRegister.tsx`
- `frontend/src/pages/chairman/AnnouncementsPage.tsx`
- `frontend/src/pages/chairman/HousekeepingPage.tsx`
- `frontend/src/pages/chairman/PerformanceAnalytics.tsx`
- `frontend/src/pages/chairman/RegisterMonitoring.tsx`
- `frontend/src/pages/chairman/ScheduleMeeting.tsx`
- `frontend/src/pages/chairman/TaskAssignment.tsx`
- `frontend/src/pages/chairman/TaskDetail.tsx`
- `frontend/src/pages/chairman/TaskMonitoring.tsx`
- `frontend/src/pages/chairman/UserManagement.tsx`
- `frontend/src/pages/departments/AssetManagementPage.tsx`
- `frontend/src/pages/departments/DeptApprovalsPage.tsx`
- `frontend/src/pages/departments/DeptOverview.tsx`
- `frontend/src/pages/departments/LeaveRequestsPage.tsx`
- `frontend/src/pages/departments/RecruitmentPage.tsx`
- `frontend/src/pages/director/DirectorCommunicationsPage.tsx`
- `frontend/src/pages/director/DirectorMeetingsPage.tsx`
- `frontend/src/pages/director/DirectorReportsPage.tsx`
- `frontend/src/pages/director/TaskUpdates.tsx`

Most remaining dropdowns in this list represent fixed statuses, priorities, cycles, categories, or report types and should not be converted to database-backed lists without evidence that the values are managed as records. `AnnouncementsPage` derives department choices from current users' department relationships; this is backend-derived but may omit departments with no active users.

## Backend/API notes

The existing `GET /api/users` route returns active users wrapped in the standard success envelope and includes IDs, roles, head types, department IDs/names, and active state. The existing `getAllUsers()` service already parses that envelope. No backend route or schema change was needed for the core dropdown fix. User deactivation is a soft-deactivation (`is_active = false`), and the users list excludes inactive users.

## Refresh behavior

On create/update/deactivate from User Management, React Query invalidates the users query prefix, which includes `['users', 'ordered-heads']`; the dropdown query is refetched. Refetch-on-window-focus supports another session's changes when the user returns to/focuses the app. There is no claim of immediate cross-session live updates from this patch; no new polling or socket events were introduced.

## Validation results

- Frontend build: **not run successfully**; `npm run build` failed because dependencies are not installed in the provided environment (`vite: not found`).
- Backend tests: **not run successfully**; pytest collection failed because Flask is not installed (`ModuleNotFoundError: No module named 'flask'`).
- Manual source audit: completed for the dropdown/select search above and the relevant user/head API flow.

## Remaining caveats

- The task assignment API should continue to enforce eligibility server-side; this patch fixes the frontend source/options and refresh behavior, but did not change task assignment authorization logic.
- If custom roles should be assignable without a `head_type`, update the authoritative backend business rule and the frontend eligibility filter together. Current eligibility follows the existing built-in `TASK_ASSIGNABLE_ROLES` plus explicitly configured `head_type` behavior.
- Run frontend dependency installation/build and backend tests in the project's normal development environment before deploying.
