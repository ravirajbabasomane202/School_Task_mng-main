# EduTask Pro Architecture

## System Overview

EduTask Pro is a multi-role React/TypeScript + Flask SPA designed for school task management. The system supports multiple user roles with role-specific dashboards and functionality.

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **React Router v6** for routing with nested layouts
- **TanStack Query** for server state management
- **Redux Toolkit** for global state
- **TailwindCSS** for styling
- **Vite** for build tooling

### Backend
- **Flask** with SQLAlchemy ORM
- **PostgreSQL** database
- **Flask-JWT-Extended** for authentication
- **Flask-SocketIO** for real-time notifications
- **Alembic** for database migrations

### DevOps
- Docker containerization
- GitHub Actions CI/CD
- Prometheus monitoring
- OpenTelemetry observability

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Router/Layout│  │   Pages      │  │   Services          │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Flask)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Routes       │  │ Services     │  │   Models            │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer (PostgreSQL)                  │
└─────────────────────────────────────────────────────────────┘
```

## Domain Modules

### Core Modules (Implemented)
- **Authentication**: JWT-based auth with refresh tokens
- **Task Management**: Full CRUD with history tracking
- **Notifications**: Real-time socket-based notifications
- **Meetings**: Scheduling and attendee management
- **Reports**: Daily/weekly/monthly export capabilities

### Extended Modules (Implemented)
- **Salary Increments**: Two-stage approval workflow
- **Leave Management**: Leave requests and resumption tracking
- **Recruitment**: Job postings and application management
- **Asset Management**: Asset tracking with categories
- **Purchase Orders**: PO workflow with line items