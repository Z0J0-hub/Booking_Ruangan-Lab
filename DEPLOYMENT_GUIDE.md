# Deployment Guide

This guide covers deploying the Lab Booking System to production using Docker and Jenkins.

## Prerequisites

### Infrastructure
- Linux server (Ubuntu 22.04 LTS recommended)
- Docker Engine 24+
- Docker Compose 2.20+
- Jenkins server (for CI/CD)
- Domain name with DNS configured
- SSL certificate (Let's Encrypt or commercial)

### External Services
- SMTP server (for email notifications)
- Docker Hub account or private container registry
- SonarQube server (optional, for code quality)
- Backup storage (S3, GCS, or local disk)

### Server Specifications (Minimum)
- **CPU**: 2 cores
- **RAM**: 4 GB
- **Storage**: 20 GB SSD
- **Network**: 100 Mbps

---

## Step 1: Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

## Step 2: Configure Environment Variables

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/lab-booking.git
cd lab-booking

# Copy environment template
cp .env.example .env

# Edit .env with production values
nano .env
```

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_PASSWORD` | Database password (strong, random) | Use a 32+ char random string |
| `JWT_SECRET` | JWT signing secret | Use a 32+ char random string |
| `CORS_ORIGIN` | Allowed origin for CORS | `https://lab-booking.telkom.ac.id` |
| `SMTP_HOST` | SMTP server host | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | `noreply@telkom.ac.id` |
| `SMTP_PASS` | SMTP password | Your app password |
| `SMTP_FROM` | From email address | `Lab Booking <noreply@telkom.ac.id>` |
| `REDIS_PASSWORD` | Redis password | Use a random string |
| `DOCKER_USERNAME` | Docker Hub username | `your_username` |

### Generate Secure Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate database password
openssl rand -base64 24

# Generate Redis password
openssl rand -base64 20
```

## Step 3: Configure SSL

### Using Let's Encrypt

```bash
# Install certbot
sudo apt install certbot -y

# Obtain SSL certificate
sudo certbot certonly --standalone -d lab-booking.telkom.ac.id

# Copy certificates for Docker
sudo mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/lab-booking.telkom.ac.id/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/lab-booking.telkom.ac.id/privkey.pem nginx/ssl/
```

### Create Production Nginx Config

Create `nginx/prod.conf` with SSL:

```nginx
server {
    listen 80;
    server_name lab-booking.telkom.ac.id;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name lab-booking.telkom.ac.id;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Step 4: Configure Jenkins Credentials

In Jenkins, go to **Manage Jenkins > Credentials > System > Global credentials**:

1. **Docker Hub credentials**:
   - Kind: Username with password
   - ID: `docker-hub-credentials`
   - Username: Your Docker Hub username
   - Password: Your Docker Hub password/token

2. **SonarQube token** (if using):
   - Kind: Secret text
   - ID: `sonarqube-token`
   - Secret: Your SonarQube analysis token

3. Configure SonarQube server:
   - Go to **Manage Jenkins > System > SonarQube servers**
   - Add server URL and authentication token

## Step 5: Deploy via Jenkins

1. Create a new Jenkins Pipeline job:
   - **Pipeline > Definition**: Pipeline script from SCM
   - **SCM**: Git
   - **Repository URL**: Your Git repository
   - **Branch**: `main`
   - **Script Path**: `Jenkinsfile`

2. Click **Build Now**

3. The pipeline will:
   - Build and test the application
   - Run security scans
   - Build and push Docker images
   - Deploy to staging
   - Run integration tests
   - **Pause for manual approval**
   - Deploy to production after approval

## Step 6: Verify Deployment

```bash
# Check container status
docker-compose -f docker-compose.prod.yml ps

# Check backend health
curl http://localhost:3000/health

# Check frontend
curl -I https://lab-booking.telkom.ac.id

# View logs
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
```

## Step 7: Configure Database Backups

### Automated Daily Backups (Cron)

```bash
# Create backup script
cat > /opt/lab-booking/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
mkdir -p $BACKUP_DIR
docker exec lab-booking-prod-db pg_dump -U $DB_USER lab_booking_prod | gzip > $BACKUP_DB.sql.gz
# Retain 30 days of backups
find /backups -type d -mtime +30 -exec rm -rf {} +
EOF

chmod +x /opt/lab-booking/backup.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /opt/lab-booking/backup.sh
```

## Step 8: Set Up Monitoring (Optional)

### Using Docker Health Checks

The Docker Compose files include health checks. Monitor with:

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' lab-booking-prod-backend
docker inspect --format='{{.State.Health.Status}}' lab-booking-prod-frontend
```

### Log Aggregation

```bash
# View aggregated logs
docker-compose -f docker-compose.prod.yml logs --tail=100 -f

# Export logs to file
docker-compose -f docker-compose.prod.yml logs > /var/log/lab-booking-$(date +%Y%m%d).log
```

## Maintenance

### Updating the Application

1. Push code to the `main` branch
2. Jenkins will automatically trigger the pipeline
3. Approve the production deployment when prompted
4. Verify the deployment after completion

### Rolling Back

```bash
# List available images
docker images | grep lab-booking

# Deploy specific version
DOCKER_IMAGE_BACKEND=docker.io/YOUR_USERNAME/lab-booking-backend:123 \
DOCKER_IMAGE_FRONTEND=docker.io/YOUR_USERNAME/lab-booking-frontend:123 \
docker-compose -f docker-compose.prod.yml up -d
```

### Database Migration

```bash
# Run migrations on production database
docker-compose -f docker-compose.prod.yml exec backend npm run db:migrate:prod
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs <service-name>

# Check environment variables
docker-compose -f docker-compose.prod.yml config
```

### Database connection issues
```bash
# Check database health
docker-compose -f docker-compose.prod.yml exec db pg_isready -U $DB_USER

# Check database logs
docker-compose -f docker-compose.prod.yml logs db
```

### Frontend not loading
```bash
# Check nginx config
docker-compose -f docker-compose.prod.yml exec frontend nginx -t

# Check if backend is reachable from frontend
docker-compose -f docker-compose.prod.yml exec frontend curl http://backend:3000/health
```

## Security Checklist (Pre-Production)

- [ ] `.env` file is not committed to Git
- [ ] All secrets are strong, randomly generated values
- [ ] SSL certificate is valid and not expired
- [ ] CORS origin is set to the production domain only
- [ ] Rate limiting is configured
- [ ] Database backups are scheduled
- [ ] Docker images are scanned (Trivy/OWASP)
- [ ] Jenkins credentials are configured
- [ ] Manual approval gate is enabled
- [ ] Health checks are passing
- [ ] Log rotation is configured
- [ ] Firewall rules are set (only ports 80/443 open)
- [ ] SSH access is restricted to admin IPs
- [ ] Automatic security updates are enabled
