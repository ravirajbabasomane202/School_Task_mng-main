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
| Notifications | GET /api/notifications, PUT /read-all, /:id/read |
| Approvals | GET/POST /api/approvals, PUT /:id/process |
| Announcements | GET/POST /api/announcements |
| Dashboard | GET /api/dashboard/chairman, /dept/:id, /performance, /monthly-comparison |
| Reports | GET /api/reports/daily, /weekly, /monthly, /export, /history |
| Uploads | GET /uploads/<path> (static file serving) |

## Notes
- **Response format**: `{ success, message, data }` for most endpoints
- **Dashboard endpoints** return raw JSON (no wrapper) — consumed by raw axios calls in the frontend
- **Socket.IO** uses WebSocket-only transport; auth token sent via `auth: { token }` in client handshake
- **Attachments** stored as relative paths (`uploads/tasks/<id>/filename`) and served statically
