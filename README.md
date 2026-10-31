# Lab Booking System - Universitas Telkom

A production-ready web application for managing lab equipment bookings at Universitas Telkom's Fakultas Teknik Elektro. Built to replace manual spreadsheet-based scheduling with automated conflict detection, real-time equipment status tracking, and comprehensive audit logging.

## Features

### Booking System
- Real-time availability calendar per equipment
- One-click booking with automatic conflict detection
- Booking workflow: Pending -> Approved -> In Progress -> Completed/Cancelled
- Reschedule and cancel with full audit trail
- Alternative time slot suggestions when conflicts are detected

### Equipment Management
- Equipment database with full specs (model, serial number, location)
- Status tracking: Available, In Use, Maintenance, Broken, Calibration Due
- Maintenance scheduling and history
- Usage analytics

### Role-Based Access Control
- **Student**: View available slots, create bookings, view own history
- **Lab Assistant**: Approve/reject bookings, update equipment status, log maintenance
- **Admin**: User management, system settings, view audit logs

### Analytics Dashboard
- Lab utilization rate (% booked vs available)
- Equipment usage comparison
- Peak booking hours analysis
- Booking trends over time (30-day window)
- Booking status and equipment status distributions

### Security
- JWT authentication with role-based access control
- Row-Level Security (RLS) enforced at the database level
- Immutable audit logs for all significant actions
- Input validation on all endpoints
- Rate limiting (100 requests/minute per IP)
- Prepared statements (parameterized queries) to prevent SQL injection

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| State Management | Zustand |
| Charts | Recharts |
| Icons | Lucide React |
| Backend/Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT, email/password) |
| CI/CD | Jenkins (Declarative Pipeline) |
| Containerization | Docker + Docker Compose |

## Project Structure

```
lab-booking/
├── src/                        # Frontend source (React + Vite)
│   ├── components/              # Shared UI components
│   ├── pages/                   # Main application pages
│   ├── lib/                     # Supabase client, types, constants
│   └── store/                   # Zustand state management
├── backend/                     # Backend (Express.js - CI/CD reference)
│   └── Dockerfile
├── frontend/                    # Frontend Docker build
│   ├── Dockerfile
│   └── nginx.conf
├── supabase/                    # Supabase configuration
├── Jenkinsfile                  # CI/CD pipeline definition
├── docker-compose.yml           # Local development
├── docker-compose.staging.yml   # Staging environment
├── docker-compose.prod.yml      # Production environment
├── .env.example                 # Environment variable template
├── THREAT_MODELING.md           # STRIDE threat analysis
├── SECURITY_AUDIT.md            # Security controls checklist
└── DEPLOYMENT_GUIDE.md          # Production deployment guide
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Docker & Docker Compose (for containerized deployment)
- Jenkins server (for CI/CD)

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
# Fill in your Supabase credentials
```

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:5173 in your browser.

### Docker Deployment

```bash
# Build and run all services
docker-compose up -d --build

# Access:
# Frontend: http://localhost:8080
# Backend API: http://localhost:3000
# Database: localhost:5432
```

### Database Setup

The application uses Supabase (PostgreSQL). The database schema is created via migrations including:

- `profiles` - User profiles with role assignments
- `equipment` - Lab equipment with status tracking
- `bookings` - Equipment reservations with conflict prevention
- `maintenance_logs` - Maintenance activity records
- `audit_logs` - Immutable audit trail

Key database features:
- **Exclusion constraint** on bookings prevents time overlaps for the same equipment
- **RLS policies** enforce role-based access at the database level
- **Triggers** automatically create profiles on signup and log audit events
- **Stored functions** for conflict detection and analytics

## CI/CD Pipeline

The Jenkinsfile defines a 10-stage declarative pipeline:

1. **Checkout** - Pull latest code from Git
2. **Install Dependencies** - Parallel npm ci for backend and frontend
3. **Build** - Parallel build for both services
4. **Unit Tests** - Jest with coverage reports (>70% target)
5. **Security Scan** - npm audit + OWASP Dependency Check + Trivy
6. **SonarQube Analysis** - Code quality and coverage analysis
7. **Docker Build & Push** - Build and push images to Docker Hub
8. **Deploy to Staging** - Docker Compose staging environment
9. **Integration Tests** - API tests against staging
10. **Manual Approval** - Human gate for production deployment
11. **Deploy to Production** - Docker Compose production deployment
12. **Health Check** - Verify production deployment is healthy

### Post-build actions:
- JUnit test result publishing
- Coverage report archiving
- Email notifications on success/failure/unstable
- Workspace cleanup

## API Documentation

### Authentication
| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register new user | Public |
| POST | `/api/v1/auth/login` | Login | Public |
| POST | `/api/v1/auth/logout` | Logout | Authenticated |
| GET | `/api/v1/auth/me` | Get current user | Authenticated |

### Equipment
| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/v1/equipment` | List all equipment | Authenticated |
| GET | `/api/v1/equipment/:id` | Get equipment details | Authenticated |
| POST | `/api/v1/equipment` | Create equipment | Lab Assistant/Admin |
| PUT | `/api/v1/equipment/:id` | Update equipment | Lab Assistant/Admin |
| PUT | `/api/v1/equipment/:id/status` | Update status | Lab Assistant/Admin |
| DELETE | `/api/v1/equipment/:id` | Delete equipment | Admin |

### Bookings
| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/v1/bookings` | List bookings | Student (own), Staff (all) |
| POST | `/api/v1/bookings` | Create booking | Authenticated |
| GET | `/api/v1/bookings/:id` | Get booking | Owner/Staff |
| PATCH | `/api/v1/bookings/:id` | Update booking status | Owner/Staff |
| DELETE | `/api/v1/bookings/:id` | Cancel booking | Owner/Admin |
| GET | `/api/v1/bookings/conflicts` | Check conflicts | Authenticated |

### Maintenance
| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/v1/maintenance` | List maintenance logs | Authenticated |
| POST | `/api/v1/maintenance` | Log maintenance | Lab Assistant/Admin |
| PUT | `/api/v1/maintenance/:id` | Update log | Lab Assistant/Admin |

### Analytics
| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/v1/analytics/utilization` | Utilization stats | Lab Assistant/Admin |
| GET | `/api/v1/analytics/trends` | Booking trends | Lab Assistant/Admin |
| GET | `/api/v1/analytics/peak-hours` | Peak hours | Lab Assistant/Admin |

### Audit Logs
| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET | `/api/v1/audit-logs` | List audit logs | Admin |

## Testing

```bash
# Run frontend tests
npm test -- --coverage

# Run backend tests
cd backend && npm test -- --coverage

# Run integration tests
npm run test:integration
```

Test coverage target: >70%

## License

This project is developed for Universitas Telkom - Fakultas Teknik Elektro as part of a DevOps course assignment.
