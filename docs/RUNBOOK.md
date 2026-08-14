# Operations Runbook

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15
- Docker (optional, for containerized deployment)

### Local Development Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
flask db upgrade
flask run
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Common Operations

### Database Migrations
```bash
# Generate migration
flask db migrate -m "description"

# Apply migrations
flask db upgrade

# Rollback last migration
flask db downgrade
```

### Running Tasks
```bash
# Run escalation job manually
curl -X POST http://localhost:5000/api/escalations/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"hours_threshold": 48}'
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| FLASK_ENV | Environment | development |
| DATABASE_URL | PostgreSQL connection | postgresql://localhost/school_mgmt |
| JWT_SECRET_KEY | JWT signing key | (required) |
| UPLOAD_FOLDER | File uploads directory | uploads |

## Troubleshooting

### Common Issues

**Database connection errors**
- Verify PostgreSQL is running
- Check DATABASE_URL in environment
- Ensure database exists and migrations are applied

**Authentication failures**
- Check JWT_SECRET_KEY is set
- Verify token expiration
- Clear browser cookies/local storage

**File uploads failing**
- Check UPLOAD_FOLDER exists and is writable
- Verify file size limits (default 5MB)
- Check allowed extensions in config