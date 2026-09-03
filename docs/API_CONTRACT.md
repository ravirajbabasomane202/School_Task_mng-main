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