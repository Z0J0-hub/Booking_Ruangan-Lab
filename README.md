# Library Room Booking System - Universitas Telkom

Panduan development Windows: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).

A web application for managing study-room bookings at Universitas Telkom's library. It replaces manual scheduling with room availability checks, booking management, and QR check-in.

## Features

### Booking System
- Room availability and booking schedule
- Automatic approval after room and schedule checks
- Booking statuses: Pending -> Approved -> In Progress -> Completed/Cancelled
- QR check-in and automatic cancellation if the user does not arrive within 15 minutes

### Room Management
- Room details including name, location, capacity, and description
- Admin controls for adding and editing rooms
- Booking conflict checks for room schedules

### Role-Based Access Control
- **Mahasiswa/Pegawai**: View rooms, create bookings, check in, and view their bookings
- **Admin**: Manage rooms, view all bookings, approve pending bookings, and cancel sessions

### Dashboard
- Upcoming bookings and room counts
- Admin view of pending booking requests

### Security
- JWT authentication with role-based access control
- Role and ownership checks enforced by the backend API
- Input validation on all endpoints
- Prepared statements (parameterized queries) to prevent SQL injection

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| State Management | Zustand |
| Charts | Recharts |
| Icons | Lucide React |
| Backend/Database | REST API + MySQL |
| Auth | REST API (JWT, email/password) |
| CI/CD | Jenkins (Declarative Pipeline) |
| Containerization | Docker + Docker Compose |

## Project Structure

The application is organized by feature: each feature keeps its pages, UI, and
state close together, while reusable UI and shared integrations remain in
`src/components` and `src/lib`.

```text
project/
├── src/                              # React + Vite frontend source
│   ├── App.tsx                       # Authentication and app entry flow
│   ├── main.tsx                      # React bootstrap
│   ├── components/                   # Shared layout and UI components
│   │   ├── AppShell.tsx
│   │   ├── Modal.tsx
│   │   └── StatusBadge.tsx
│   ├── features/
│   │   ├── auth/
│   │   │   ├── pages/                # Sign-in and password reset screens
│   │   │   └── store/                # Authentication state (Zustand)
│   │   ├── bookings/
│   │   │   └── pages/                # Booking management screen
│   │   ├── dashboard/
│   │   │   └── pages/                # Library dashboard screen
│   │   └── rooms/
│   │       ├── components/           # Room booking UI
│   │       └── pages/                # Room management screen
│   └── lib/                          # API client, types, constants
├── backend/
│   ├── server.mjs                    # REST API, authentication and booking rules
│   ├── schema.sql                    # MySQL tables and indexes
│   ├── package.json                  # Backend dependencies and scripts
│   └── Dockerfile                    # Backend container
├── frontend/
│   ├── Dockerfile                    # Frontend container build
│   └── nginx.conf                    # Frontend web server configuration
├── package.json                      # Frontend scripts and dependencies
├── vite.config.ts                    # Frontend build configuration
├── docker-compose*.yml               # Environment container configurations
└── Jenkinsfile                       # CI/CD pipeline definition
```

### Backend and frontend responsibilities

- **Frontend:** the React application lives in `src/`. Feature-specific screens
  and state are grouped under `src/features/`; shared UI and common integrations
  stay in `src/components/` and `src/lib/`.
- **Backend services:** `backend/` provides the REST API and connects to MySQL.
  The browser only calls this API through `src/lib/api.ts`; it never receives
  database credentials.

## Getting Started

### Prerequisites
- Node.js 24
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
# Replace all example passwords and secrets with strong private values.
```

3. Start the development server:
```bash
npm run dev
```

4. In a second terminal, start MySQL and the API:
```bash
docker compose up -d db backend
```

5. Open http://localhost:5173 in your browser.

The API creates the MySQL tables on startup and creates the first administrator
from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. For a fully containerized
setup, run `docker compose up -d --build` and open http://localhost:8080.

### Docker Deployment

```bash
# Build and run all services
docker-compose up -d --build

# Access:
# Frontend: http://localhost:8080
# Backend API: http://localhost:3000
# Database: localhost:3306
```

### Database Setup

The application database is MySQL, accessed by the frontend through the backend
REST API. Configure the API server with the connection details in `.env`; do
not expose MySQL credentials in frontend environment variables.

There are two login roles: administrator and regular user. Regular users select
Mahasiswa or Pegawai during registration. Administrator accounts are seeded
from server-side environment variables and cannot be created through public
registration.

The booking service automatically approves a request when its schedule is valid
and the room is available. This decision is made by explicit schedule and
conflict rules. A QR code is provided for check-in from 15 minutes before the
booking until 15 minutes after its start. The API automatically cancels an
approved booking if it has not been checked in by that deadline. The server job
runs independently of the browser. This is rule-based automation, not an
external generative-AI model.

### Frontend API contract

Set `VITE_API_URL` to the API base URL (for example, `http://localhost:3000/api`).
The frontend expects JSON responses, errors shaped as `{ "message": "..." }`,
and JWT login responses shaped as `{ "token": "...", "user": { ...profile } }`.
Authenticated requests send `Authorization: Bearer <token>`.
Booking responses include the related `room` object and may include the
requesting `profile` for admin views. A user's own booking response also
includes its private `checkin_token`. Recovery links redirect to the frontend
with `?type=recovery&token=<reset-token>`.

The frontend calls these routes:

| Method | Route | Expected response |
|--------|-------|-------------------|
| POST | `/auth/login` | `{ token, user }` |
| POST | `/auth/register` | JSON response |
| POST | `/auth/password/forgot` | JSON response |
| POST | `/auth/password/reset` | JSON response |
| GET | `/auth/me` | `{ user }` |
| POST | `/auth/logout` | JSON response |
| GET | `/rooms` | Room array |
| POST | `/rooms` | JSON response |
| PUT | `/rooms/:id` | JSON response |
| GET | `/bookings` | Booking array |
| GET | `/bookings?limit=12` | Booking array |
| GET | `/bookings?status=active` | Booking array |
| POST | `/bookings` | JSON response |
| PATCH | `/bookings/:id` | JSON response |
| POST | `/bookings/:id/check-in` | `{ message, checked_in_at }` |

## CI/CD Pipeline

For development checks on Windows or Linux, use `Jenkinsfile.dev` and follow
[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md). It installs dependencies, runs
`npm run check`, and archives the frontend build without deployment.

The Jenkinsfile defines a declarative pipeline with these stages:

1. **Checkout** - Pull latest code from Git
2. **Install Dependencies** - Parallel npm ci for backend and frontend
3. **Build** - Backend syntax check and frontend production build
4. **Unit Tests** - Backend policy tests and frontend type/lint checks
5. **Security Scan** - npm audit + OWASP Dependency Check + Trivy
6. **SonarQube Analysis** - Code quality and coverage analysis
7. **Docker Build & Push** - Build and push images to Docker Hub
8. **Deploy to Staging** - Docker Compose staging environment
9. **Integration Tests** - API health check against staging
10. **Manual Approval** - Human gate for production deployment
11. **Deploy to Production** - Docker Compose production deployment
12. **Health Check** - Verify production deployment is healthy

### Post-build actions
- Email notifications on success/failure/unstable
- Workspace cleanup

## API Documentation

The backend API is implemented in `backend/server.mjs`. The routes and response
format used by the frontend are listed in [Frontend API contract](#frontend-api-contract).

## Testing

```bash
# Check frontend types, build, and lint
npm run typecheck
npm run build
npm run lint

# Test backend booking and check-in rules
npm --prefix backend test
```

The backend tests cover schedule validation and the 15-minute check-in deadline.

## License

This project is developed for Universitas Telkom - Fakultas Teknik Elektro as part of a DevOps course assignment.
