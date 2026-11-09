# Security Audit Report

> Legacy report, not evidence for the Supabase configuration. Use
> [STRIDE_MATRIX.md](STRIDE_MATRIX.md) for current scope and verification status.

## Audit Information

| Field | Value |
|-------|-------|
| System | Lab Booking System |
| Institution | Universitas Telkom - Fakultas Teknik Elektro |
| Date | 2026-09-24 |
| Auditor | DevOps Assignment Team |
| Version | 1.0 |

---

## Security Controls Checklist

### 1. Authentication

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 1.1 | JWT authentication implemented | PENDING | Verify in the MySQL-backed API |
| 1.1a | JWT expiry 15-30 minutes | PASS | Configurable, default 15 min |
| 1.2 | Password hashing with bcrypt (cost >= 12) | PENDING | Verify password hashing in the API |
| 1.3 | Session management with refresh tokens | PENDING | Verify token lifecycle in the API |
| 1.4 | Login rate limiting | PASS | 100 req/min per IP |
| 1.5 | Logout invalidates session | PASS | `signOut()` clears session |
| 1.6 | Email confirmation configurable | PASS | Disabled by default (assignment scope) |
| 1.7 | No hardcoded credentials | PASS | All secrets in env vars |

### 2. Authorization

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 2.1 | RBAC enforced server-side | PENDING | Verify authorization middleware in the API |
| 2.2 | Never trust client role | PENDING | API must load role from a trusted source |
| 2.3 | Least privilege principle | PENDING | Verify role-specific API permissions |
| 2.4 | Routes enforce method-level permissions | PENDING | Verify API route authorization |
| 2.5 | Ownership checks on user data | PENDING | Verify ownership checks in the API |
| 2.6 | Admin-only routes protected | PENDING | Verify admin authorization in the API |
| 2.7 | No client-side authorization decisions | PENDING | Verify all authorization server-side |

### 3. Data Protection

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 3.1 | HTTPS/TLS for all communications | PASS | Enforced by infrastructure |
| 3.2 | SQL injection prevention | PENDING | Verify parameterized queries in the MySQL API |
| 3.3 | XSS prevention | PASS | React auto-escaping |
| 3.4 | CSRF protection | PASS | JWT in Authorization header |
| 3.5 | No secrets in source code | PASS | Environment variables only |
| 3.6 | No sensitive data in error messages | PASS | Generic error responses |
| 3.7 | PII minimization in API responses | PASS | Only necessary fields returned |
| 3.8 | Database encryption at rest | PENDING | Verify MySQL host and storage configuration |

### 4. API Security

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 4.1 | Rate limiting (100 req/min) | PENDING | Verify rate limiting in the API |
| 4.2 | Request size limits | PENDING | Verify limits in the API server |
| 4.3 | Input validation on all endpoints | PENDING | Verify validation in the API |
| 4.4 | Proper HTTP status codes | PENDING | Verify API response handling |
| 4.5 | CORS properly configured | PENDING | Configure and verify API CORS |
| 4.6 | No stack traces to client | PENDING | Verify API error handling |
| 4.7 | API versioning | PENDING | Set and document the API version |

### 5. Audit & Monitoring

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 5.1 | Comprehensive audit logging | PENDING | Verify audit logging in the MySQL API |
| 5.2 | Audit logs are immutable | PENDING | Verify access controls for audit data |
| 5.3 | Audit logs include user, action, timestamp | PENDING | Verify structured audit data |
| 5.4 | 90+ day log retention | PENDING | Configure and verify log retention |
| 5.5 | Authentication events logged | PENDING | Verify authentication audit logging in the API |
| 5.6 | Equipment status changes logged | PENDING | Verify audit logging in the API |
| 5.7 | Booking changes logged | PENDING | Verify audit logging in the API |

### 6. Deployment Security

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 6.1 | Secrets in environment variables | PASS | `.env.example` provided |
| 6.2 | `.env` in `.gitignore` | PASS | Not committed |
| 6.3 | Docker images scanned | PASS | Trivy in Jenkins pipeline |
| 6.4 | Dependency vulnerability scanning | PASS | npm audit + OWASP in pipeline |
| 6.5 | Non-root Docker user | PASS | Backend Dockerfile creates nodejs user |
| 6.6 | Docker resource limits | PASS | Configured in docker-compose |
| 6.7 | Daily database backups | PENDING | Configure and verify MySQL backups |
| 6.8 | Health checks on containers | PASS | Dockerfile HEALTHCHECK directives |

### 7. CI/CD Security

| # | Control | Status | Notes |
|---|---------|--------|-------|
| 7.1 | Credentials in Jenkins credential store | PASS | `withDockerRegistry` used |
| 7.2 | Manual approval for production | PASS | `input` step in pipeline |
| 7.3 | Pipeline timeout configured | PASS | 30 minute timeout |
| 7.4 | No concurrent builds | PASS | `disableConcurrentBuilds()` |
| 7.5 | Build artifact retention | PASS | 10 builds retained |
| 7.6 | Workspace cleanup | PASS | `cleanWs()` in post |

---

## Findings

### Finding 1: Email Confirmation Disabled (LOW)
- **Category**: Authentication
- **Description**: Email confirmation is disabled by default for assignment simplicity. In production, email confirmation should be enabled to verify user identity.
- **Risk**: Low - users can register with unverified emails
- **Recommendation**: Enable email confirmation before production deployment
- **Status**: Acknowledged - intentional for assignment scope

### Finding 2: Rate Limiting at Application Layer (MEDIUM)
- **Category**: API Security
- **Description**: Rate limiting is configured via environment variables and enforced at the application/infrastructure level. For production, consider adding a reverse proxy (e.g., Nginx) or API gateway for more robust rate limiting.
- **Risk**: Medium - application-level rate limiting may not protect against distributed attacks
- **Recommendation**: Add Nginx rate limiting or use a cloud WAF
- **Status**: Mitigated - application-level rate limiting in place

### Finding 3: No 2FA for Admin Accounts (LOW)
- **Category**: Authentication
- **Description**: Two-factor authentication is not implemented. Admin accounts with high privileges would benefit from 2FA.
- **Risk**: Low - admin accounts are still protected by password + JWT
- **Recommendation**: Implement 2FA for admin and lab assistant roles in future iterations
- **Status**: Future enhancement

### Finding 4: Socket.io Not Implemented (INFO)
- **Category**: Real-time Features
- **Description**: Real-time updates via Socket.io are marked as optional. Currently, the frontend uses polling for status updates.
- **Risk**: None - polling is a valid alternative
- **Recommendation**: Implement Socket.io for real-time equipment status updates if required
- **Status**: Optional enhancement

---

## Security Architecture Overview

```
                    [Internet]
                        |
                    [HTTPS/TLS]
                        |
                 [Load Balancer/Nginx]
                    /          \
            [Frontend]      [Backend API]
            (Static)         (Express.js)
                                |
                        [Auth Middleware]
                        [Rate Limiter]
                        [RBAC Check]
                                |
                        [MySQL DB]
                 [Backend API Authorization]
                        [Audit Triggers]
```

### Defense-in-Depth Layers

1. **Perimeter**: HTTPS termination, CORS, rate limiting
2. **Application**: JWT verification, input validation, RBAC middleware
3. **Data**: MySQL access restricted to the backend, indexed conflict checks, audit logging
4. **Infrastructure**: Docker isolation, non-root containers, network segmentation
5. **CI/CD**: Dependency scanning, container scanning, manual approval gate

---

## Compliance Notes

- **OWASP Top 10**: All top 10 vulnerabilities addressed (injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, known vulnerabilities, insufficient logging)
- **STRIDE**: Complete threat model documented in `THREAT_MODELING.md`
- **Least Privilege**: Each role must have minimum required permissions enforced by the API
- **Defense in Depth**: Multiple security layers from network to database

---

## Sign-off

This security audit was conducted as part of the DevOps course assignment for Universitas Telkom. The findings and recommendations should be reviewed and addressed before any production deployment.

**Audit Result**: PENDING (MySQL-backed API implementation has not been reviewed)

Reassess the controls marked PENDING after the backend API is implemented and deployed.
