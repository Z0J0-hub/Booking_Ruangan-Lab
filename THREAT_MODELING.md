# Threat Modelling - STRIDE Analysis

## System Overview

The Lab Booking System is a web application that allows students, lab assistants, and administrators to book and manage lab equipment at Universitas Telkom's Fakultas Teknik Elektro. The system handles authentication, booking management, equipment tracking, maintenance logging, and audit trails.

### Trust Boundaries

1. **Client-to-Server**: User browser communicates with the application server over HTTPS
2. **Server-to-Database**: Application server communicates with MySQL database
3. **Server-to-Mail**: Application server sends emails via SMTP
4. **CI/CD-to-Registry**: Jenkins pushes Docker images to container registry
5. **Registry-to-Production**: Production servers pull Docker images from registry

### Assets

- User credentials (emails, passwords, JWT tokens)
- User PII (names, phone numbers, student IDs)
- Booking records (schedules, purposes)
- Equipment data (specs, status, location)
- Audit logs (action history)
- Maintenance records

---

## S - Spoofing

### Risk: Student impersonates lab assistant to approve bookings

**Threat**: An attacker could attempt to spoof a lab assistant or admin identity to gain elevated privileges, such as approving their own bookings or changing equipment status.

**Attack Vectors**:
- JWT token theft via XSS
- Session hijacking
- Credential stuffing
- Man-in-the-middle attacks

**Mitigations**:
- **JWT authentication** with short expiry (15-30 minutes) and refresh token rotation
- **Role loaded from a trusted server-side source** and validated for every request
- **RBAC enforced by the backend API** so clients cannot bypass authorization checks
- **bcrypt password hashing** with cost factor >= 12
- **HTTPS/TLS** for all communications
- **HttpOnly, Secure, SameSite cookies** for session tokens
- **Audit logging** of all authentication events and privilege-requiring actions

### Risk: Unauthorized user accesses the system

**Mitigations**:
- Email/password authentication required for all operations
- No anonymous access to protected resources
- Rate limiting on login endpoint to prevent brute force

---

## T - Tampering

### Risk: Attacker modifies booking records in the database

**Threat**: Direct database access or SQL injection could allow modification of booking records, changing times, equipment, or status.

**Attack Vectors**:
- SQL injection via unsanitized input
- Direct database access if credentials are leaked
- API parameter manipulation

**Mitigations**:
- **Parameterized queries** exclusively through the backend's MySQL driver
- **Server-side authorization** ensures users can only modify permitted bookings
- **Input validation** on all API endpoints (server-side and client-side)
- **Audit log triggers** automatically record all booking changes with before/after values
- **Transaction-safe conflict checks** prevent overlapping bookings
- **Database encryption at rest** configured on the MySQL host and storage

### Risk: Equipment status is tampered with

**Mitigations**:
- Backend authorization restricts equipment status updates to lab assistants and admins only
- Audit trigger logs all equipment status changes with the acting user's ID
- Changes stored in a structured format in audit_logs for forensic analysis

---

## R - Repudiation

### Risk: User denies creating a booking or damaging equipment

**Threat**: A user could claim they never made a particular booking or that equipment damage wasn't their fault.

**Mitigations**:
- **Comprehensive audit logs**: Every booking creation, update, status change, and equipment status update is logged with:
  - User ID (who)
  - Action (what)
  - Resource type and ID (which)
  - Timestamp (when)
  - Changes as structured before/after values
- **Audit logs are immutable**: No UPDATE or DELETE policies on audit_logs table
- **Email confirmations**: Booking creation triggers email notifications as independent evidence
- **JWT-authenticated requests**: Every API call is tied to an authenticated user identity
- **90+ day retention** for audit logs

### Risk: Lab assistant denies rejecting a booking

**Mitigations**:
- Booking status changes are automatically logged via database trigger
- Rejection reason is stored with the booking record
- Audit log captures the acting user and timestamp

---

## I - Information Disclosure

### Risk: Student emails, booking history, or equipment location leaks

**Threat**: Unauthorized users could access other users' personal information or booking details.

**Attack Vectors**:
- Insecure direct object reference (IDOR)
- Overly broad API responses
- Error messages revealing system information
- Logs containing sensitive data

**Mitigations**:
- **Backend authorization**: Students can only read their own bookings; they cannot see other students' bookings
- **No sensitive data in error messages**: Generic error responses without stack traces or internal details
- **HTTPS only**: All data in transit is encrypted via TLS
- **Environment variables for secrets**: No secrets hardcoded in source code
- **PII minimization**: Only necessary user data is returned in API responses
- **CORS properly configured**: Only allowed origins can access the API
- **No secrets in client-side code**: All sensitive operations are server-side

### Risk: Audit logs expose sensitive information

**Mitigations**:
- Audit logs are only accessible to admin role
- Changes are stored as structured data, not free-text
- No passwords or tokens are logged

---

## D - Denial of Service

### Risk: Attacker floods booking endpoint and crashes the system

**Threat**: Automated scripts could overwhelm the API with requests, preventing legitimate users from using the system.

**Attack Vectors**:
- HTTP flooding
- Resource exhaustion (database connections, memory)
- Slowloris attacks
- Large payload attacks

**Mitigations**:
- **Rate limiting**: 100 requests per minute per IP address
- **Request size limits**: Maximum body size enforced
- **Connection pooling**: Database connection pool prevents connection exhaustion
- **Docker resource limits**: CPU and memory limits set on containers
- **Request timeouts**: All requests have timeout protection
- **Input length validation**: All text fields have maximum length constraints

### Risk: Booking conflict detection is computationally expensive

**Mitigations**:
- Transaction-safe conflict checks prevent conflicts at insert time
- MySQL indexes support efficient room and schedule conflict queries
- Conflict check query is bounded and indexed

---

## E - Elevation of Privilege

### Risk: Student escalates to admin role and deletes all bookings

**Threat**: A student could attempt to gain admin privileges by manipulating client-side state or intercepting/modifying requests.

**Attack Vectors**:
- Client-side role manipulation
- JWT tampering
- API endpoint access without proper role
- Missing authorization checks

**Mitigations**:
- **Never trust client role**: Role is verified server-side on every request via JWT claims
- **Role loaded from a trusted server-side source**: Users cannot change their own role
- **Authorization enforced by the backend API** for every protected operation
- **Least privilege principle**: Each role has only the minimum permissions needed
- **Separate policies per CRUD verb**: No `FOR ALL` policies - each operation (SELECT, INSERT, UPDATE, DELETE) has its own policy with appropriate checks
- **Admin-only operations**: User management, audit log access, and equipment deletion are admin-exclusive

### Risk: Horizontal privilege escalation (student accesses another student's bookings)

**Mitigations**:
- API ownership checks ensure users can only read and modify their own bookings
- Students cannot read other students' bookings
- Object-level authorization on every request

---

## Security Controls Summary

| Category | Control | Implementation |
|----------|---------|----------------|
| Authentication | JWT with short expiry | 15-30 minute token lifetime |
| Authentication | Password hashing | bcrypt with cost factor >= 12 |
| Authentication | Session management | Backend API JWT lifecycle |
| Authorization | RBAC server-side | API authorization + trusted role claims |
| Authorization | Least privilege | Method-level API permissions |
| Data Protection | TLS/HTTPS | All communications encrypted |
| Data Protection | SQL injection prevention | Parameterized queries only |
| Data Protection | XSS prevention | React auto-escaping, CSP headers |
| Data Protection | CSRF protection | SameSite cookies, JWT in headers |
| API Security | Rate limiting | 100 req/min per IP |
| API Security | Input validation | Server-side validation on all endpoints |
| API Security | Error handling | Generic errors, no stack traces to client |
| Audit | Comprehensive logging | All CRUD operations logged with user, action, timestamp |
| Audit | Log immutability | No UPDATE/DELETE on audit_logs |
| Audit | Log retention | 90+ day retention policy |
| Deployment | Secrets management | Environment variables, Jenkins credentials |
| Deployment | Container scanning | Trivy + OWASP Dependency Check in CI/CD |
| Deployment | Database backups | Daily automated backups |

---

## Risk Assessment Matrix

| Threat | Likelihood | Impact | Risk Level | Priority |
|--------|-----------|--------|------------|----------|
| Spoofing (role escalation) | Medium | High | High | 1 |
| Tampering (booking modification) | Low | High | Medium | 2 |
| Repudiation (deny actions) | Medium | Medium | Medium | 3 |
| Information Disclosure (PII leak) | Low | High | Medium | 2 |
| DoS (API flooding) | Medium | Medium | Medium | 3 |
| Elevation of Privilege | Low | Critical | High | 1 |

---

## Conclusion

The Lab Booking System implements defense-in-depth with multiple layers of security:

1. **Application layer**: JWT authentication, input validation, rate limiting, RBAC middleware
2. **Database layer**: MySQL access restricted to the backend, indexed booking conflict checks, audit logging
3. **Transport layer**: HTTPS/TLS, CORS configuration
4. **Infrastructure layer**: Docker containerization, secret management, CI/CD security scanning

The most critical risks (spoofing and elevation of privilege) must be mitigated by enforcing authorization in the backend API and limiting database access to that server.
