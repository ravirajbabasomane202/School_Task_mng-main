# API Contract

## Standard Response Format

All API responses follow a consistent envelope structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints by Domain

### Auth Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/change-password` | Change password |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | List tasks |
| GET | `/api/tasks/:id` | Get task by ID |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| PUT | `/api/tasks/:id/status` | Update task status |
| GET | `/api/tasks/:id/history` | Task history |
| POST | `/api/tasks/:id/attachment` | Upload attachment |

#### Task status rules

Rights depend on the user's **relationship to the task**, never on role alone.

| Who | Allowed status changes |
|-----|------------------------|
| **Assigner** (`task.assigned_by`) | Any of `PENDING`, `IN_PROGRESS`, `COMPLETED`, `DELAYED`, `ESCALATED`, from any current status. Only the assigner can set `ESCALATED`. Also the only user who can edit title, assignee, department, priority, dates and cadence. |
| **Assignee** (`task.assigned_to`) | Only `IN_PROGRESS` or `COMPLETED`. May move a `DELAYED` task on. Cannot change a task that is already `COMPLETED` or `ESCALATED`. Can still edit the description. |
| Anyone else (including a Director/Chairman who is not the assigner) | No status change (view only). |

- `PENDING` is set automatically on creation. `DELAYED` is set automatically when `due_date` has passed and the status is `PENDING`/`IN_PROGRESS` (system change: a `task_history` row with comment "Auto-marked delayed: due date passed" and a `TASK_DELAYED` notification to assignee and assigner). The assignee can never set either manually.
- `COMPLETED` requires proof (an existing attachment/proof, or a file sent with the request). Missing proof returns `400`.
- Both `PUT /api/tasks/:id` and `PUT /api/tasks/:id/status` use the same validation.

| Endpoint | Status handling |
|----------|-----------------|
| `PUT /api/tasks/:id` | Requires assigner or assignee (else `403`). Status is validated only when it differs from the current one, so editing other fields while echoing the current status is fine. Non-assigners cannot change assigner-only fields (silently ignored). Accepts multipart with an `attachment` file used as completion proof. |
| `PUT /api/tasks/:id/status` | Body `{ "status": "...", "comment": "..." }`. Requires assigner or assignee. Same status as current returns `400`. |

Errors (identical for both endpoints, message is safe to show to users):

| Code | When |
|------|------|
| `400` | Unknown status; status already set (no-op, `/status` only); `COMPLETED` without proof |
| `403` | Assignee choosing `PENDING`/`DELAYED`/`ESCALATED`; assignee changing a `COMPLETED`/`ESCALATED` task; user who is neither assigner nor assignee |

Notifications on a manual status change: assigner changes it -> assignee only is notified; assignee changes it -> assigner only is notified. Nobody is notified of their own change.

### Escalations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/escalations/run` | Chairman/Director. Body `{ "hours_threshold": 48 }` (optional). Runs the same job as the hourly scheduler. |

The job **never changes task status** (`ESCALATED` is the assigner's decision). For each `PENDING`/`IN_PROGRESS`/`DELAYED` task overdue by more than the threshold it sends the assigner one `TASK_OVERDUE` notification ("overdue by N hours, consider escalating"); re-runs do not duplicate it. Response: `{ "notified_count": N, "escalated_count": 0 }`. Threshold for the scheduler comes from the `ESCALATION_HOURS` env var (default 48). The scheduler also runs the auto-`DELAYED` sweep each hour.

### Salary Increments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/salary-increments` | List increments |
| POST | `/api/salary-increments` | Create increment (HR/Chairman) |
| GET | `/api/salary-increments/:id` | Get by ID |
| PUT | `/api/salary-increments/:id/hr-approve` | HR approval |
| PUT | `/api/salary-increments/:id/finance-process` | Finance decision |

### Recruitment
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recruitment` | List openings |
| POST | `/api/recruitment` | Create opening (HR) |
| GET | `/api/recruitment/:id` | Get opening |
| PUT | `/api/recruitment/:id` | Update opening |
| GET | `/api/recruitment/:id/applications` | List applications |
| POST | `/api/recruitment/:id/applications` | Submit application |

### Assets
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/assets` | List assets |
| GET | `/api/assets/stats` | Asset statistics |
| POST | `/api/assets` | Create asset (IT) |
| PUT | `/api/assets/:id` | Update asset |
| DELETE | `/api/assets/:id` | Delete asset |

### Purchase Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/purchase-orders` | List POs |
| GET | `/api/purchase-orders/stats` | PO statistics |
| POST | `/api/purchase-orders` | Create PO |
| GET | `/api/purchase-orders/:id` | Get PO |
| PUT | `/api/purchase-orders/:id/submit` | Submit for approval |
| PUT | `/api/purchase-orders/:id/finance-process` | Finance decision |
| PUT | `/api/purchase-orders/:id/mark-ordered` | Mark as ordered |