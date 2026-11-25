# Flask Backend — Task Management System

## Setup

### 1. Create virtual environment
```bash
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

### 4. Create the database
```bash
# In PostgreSQL:
createdb taskmanager
```

### 5. Run migrations
```bash
flask db init
flask db migrate -m "initial migration"
flask db upgrade
```

### 6. Seed departments & default users
```bash
flask seed
```
Default credentials after seeding:
- **Chairman**: `chairman@school.com` / `chairman123`
- **Director**: `director@school.com` / `director123`

### 7. Start the server
```bash
python run.py
```
Server runs on **http://localhost:5000**

---

## Project Structure
```
backend/
├── app/
│   ├── models/         # SQLAlchemy models
│   ├── routes/         # Flask blueprints (one per module)
│   ├── sockets/        # Socket.IO events & emitters
│   └── utils/          # Helpers: response, decorators, file_utils
├── uploads/            # Attachment storage (served at /uploads/<path>)
├── config.py
├── run.py
└── requirements.txt
```

## API Base URL
All REST endpoints: `http://localhost:5000/api`
WebSocket URL: `http://localhost:5000` (Socket.IO)

## Key Endpoints

| Module | Endpoints |
|---|---|
| Auth | POST /api/auth/login, /logout, /refresh, GET /me |
| Users | GET/POST /api/users, PUT/DELETE /api/users/:id |
| Departments | GET /api/departments |
| Tasks | GET/POST /api/tasks, /my-tasks, /dept/:id, /:id |
| Notifications | GET /api/notifications, PUT /read-all, /:id/read, DELETE /:id (owner only) |
| Approvals | GET/POST /api/approvals, PUT /:id/process, DELETE /:id (Chairman only) |
| Announcements | GET/POST /api/announcements, GET/DELETE /:id (DELETE: Chairman/Director) |
| Dashboard | GET /api/dashboard/chairman, /dept/:id, /performance, /monthly-comparison |
| Reports | GET /api/reports/daily, /weekly, /monthly, /export, /history |
| Uploads | GET /uploads/<path> (static file serving) |

## Notes
- **Response format**: `{ success, message, data }` for most endpoints
- **Dashboard endpoints** return raw JSON (no wrapper) — consumed by raw axios calls in the frontend
- **Socket.IO** uses WebSocket-only transport; auth token sent via `auth: { token }` in client handshake
- **Attachments** stored as relative paths (`uploads/tasks/<id>/filename`) and served statically

## Imp Notification (recurring important notifications)

* API: `/api/imp-notifications` (list, create, get + cycle history, update, delete,
  `PATCH /<id>/status`, `PATCH /<id>/active`, `GET /options`, `POST /run-reminders`).
  Create / edit / assign / delete / activate are Chairman-level (Chairman, Principal);
  an assigned user can view, mark In Progress and mark Done.
* Data: one `imp_notifications` row per activity, one `imp_notification_cycles` row per
  recurrence cycle (history), one `imp_notification_reminders` row per (cycle, day) with a
  UNIQUE constraint so a cycle is reminded at most once a day.
* Reminders are sent by the in-process APScheduler job `imp_notification_reminders`
  (hourly, idempotent, catches up after downtime). If you run with `ENABLE_SCHEDULER=false`,
  schedule `flask run-imp-reminders` from cron instead.
* Migration: `flask db upgrade` (revision `v6w7x8y9z0a1`, additive only).
