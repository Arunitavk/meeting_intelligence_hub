# Deployment Guide

Production deployment instructions for Meeting Intelligence Hub.

## Pre-Deployment Checklist

- [ ] All tests passing: `pytest tests/ -v`
- [ ] No console errors in frontend: `npm run build`
- [ ] Environment variables configured
- [ ] API keys verified (Claude, Gemini)
- [ ] Database backups planned
- [ ] Logs configured
- [ ] CORS origins whitelisted
- [ ] SSL/TLS certificates ready

## Deployment Options

### Option 1: Local Server (Development)

For testing and development:

```bash
# Backend
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend
npm run dev
```

**Access**: `http://localhost:5173`

### Option 2: Docker & Docker Compose

For isolated, reproducible deployments:

**Dockerfile (backend)**
```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/.env .env

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Deploy**:
```bash
docker build -t meeting-hub-backend:latest -f backend/Dockerfile .
docker run -d \
  --name meeting-hub \
  -p 8000:8000 \
  --env-file backend/.env \
  -v ./data:/app/data \
  meeting-hub-backend:latest
```

### Option 3: Cloud Platforms

#### Azure App Service

```bash
# Login to Azure
az login

# Create resource group
az group create --name meetingHub-rg --location eastus

# Create App Service Plan
az appservice plan create \
  --name meetingHub-plan \
  --resource-group meetingHub-rg \
  --sku B2 --is-linux

# Deploy
az webapp create \
  --resource-group meetingHub-rg \
  --plan meetingHub-plan \
  --name meeting-hub-app \
  --runtime "PYTHON:3.13"
```

#### AWS EC2

```bash
# SSH into instance
ssh -i key.pem ubuntu@your-instance.compute.amazonaws.com

# Install dependencies
sudo apt-get update
sudo apt-get install python3.13 python3-pip nodejs npm -y

# Clone repo & deploy
git clone https://github.com/Arunitavk/meeting_intelligence_hub.git
cd meeting_intelligence_hub

# Setup backend
cd backend
python3.13 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup frontend
cd ../frontend
npm install
npm run build

# Start backend (use PM2 or systemd)
sudo npm install -g pm2
pm2 start "python3.13 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

#### Heroku

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login

# Create app
heroku create meeting-hub-app

# Set environment variables
heroku config:set -a meeting-hub-app ANTHROPIC_API_KEY=sk-ant-...
heroku config:set -a meeting-hub-app GEMINI_API_KEY=AIza...

# Deploy
git push heroku main
```

### Option 4: Kubernetes

For large-scale deployments:

**deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: meeting-hub-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: meeting-hub
  template:
    metadata:
      labels:
        app: meeting-hub
    spec:
      containers:
      - name: backend
        image: meeting-hub-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: anthropic-key
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: gemini-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

Deploy:
```bash
kubectl apply -f deployment.yaml
```

## Environment Configuration

### Production .env

```bash
ENVIRONMENT=production

# API Keys (keep secure, use secrets management)
ANTHROPIC_API_KEY=sk-ant-xxxxx
GEMINI_API_KEY=AIza...

# Database
DATABASE_URL=sqlite+aiosqlite:///./meeting_hub.db
# OR for PostgreSQL:
# DATABASE_URL=postgresql+asyncpg://user:pass@db-host:5432/meeting_hub

# Security
CORS_ORIGINS=["https://yourdomain.com"]
SECRET_KEY=your-secret-key-here

# Logging
LOG_LEVEL=WARNING
SENTRY_DSN=https://key@sentry.io/project  # Optional

# Performance
MAX_WORKERS=4
POOL_SIZE=10
```

## Security Best Practices

### 1. Secrets Management

```bash
# Option A: Environment variables (Docker, Kubernetes, etc)
docker run --env-file .env.production ...

# Option B: AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id meeting-hub/prod

# Option C: Azure Key Vault
az keyvault secret show --name anthropic-key --vault-name secure-vault

# Option D: Vault
vault kv get secret/meeting_hub
```

### 2. Database Security

```bash
# Backup database
cp meeting_hub.db meeting_hub.db.backup.$(date +%Y%m%d)

# Encrypt backups
openssl enc -aes-256-cbc -salt -in meeting_hub.db.backup -out meeting_hub.db.backup.enc

# Upload encrypted backup to S3/Azure Blob
aws s3 cp meeting_hub.db.backup.enc s3://backup-bucket/
```

### 3. API Security

```python
# In app/core/config.py
CORS_ORIGINS = [
    "https://yourdomain.com",
    "https://www.yourdomain.com"
]
ALLOWED_HOSTS = ["yourdomain.com"]
SECURE_TOKEN_EXPIRY = 3600  # 1 hour
```

### 4. HTTPS/SSL

```bash
# Using Certbot with Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d yourdomain.com

# Configure Nginx
server {
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

## Performance Optimization

### Database
```python
# Connection pooling
pool_size = 20
max_overflow = 0
pool_pre_ping = True
```

### Caching
```python
# Redis caching (optional)
REDIS_URL = "redis://cache-host:6379/0"
CACHE_TTL = 3600  # 1 hour
```

### CDN
- Use CloudFront/CDN for static assets
- Cache frontend assets (CSS, JS, images)
- Separate domain for API

### Monitoring & Logging
```python
# Sentry for error tracking
import sentry_sdk
sentry_sdk.init(
    dsn="https://key@sentry.io/project",
    environment="production"
)

# Structured logging
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
```

## Monitoring

### Health Checks

```bash
# Automated health check
curl https://yourdomain.com/health

# Response:
# {"status": "ok", "timestamp": "2024-01-15T10:30:00Z"}
```

### Metrics to Monitor

- API response times (target: <200ms)
- Error rates (target: <0.1%)
- Database query times
- Frontend load time
- User sessions
- API rate limiting

### Alerting

Set up alerts for:
- API downtime (5+ consecutive failed health checks)
- High error rates (>1% errors)
- Slow responses (>5s)
- Database lock issues
- High CPU/memory usage

## Rollback Plan

```bash
# Keep previous versions
v1.0.0/ (current production)
v0.9.9/ (previous)
v0.9.8/ (backup)

# Quick rollback
docker ps  # Get container ID
docker stop container-id
docker run -d ... image:v0.9.9
```

## Post-Deployment

- ✅ Verify all endpoints working
- ✅ Test chat functionality
- ✅ Check database connectivity
- ✅ Verify file uploads working
- ✅ Monitor logs for errors
- ✅ Performance test (load testing)
- ✅ Security testing

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 8000
lsof -i :8000
# Kill process
kill -9 PID
```

### Database Connection Issues
```bash
# Check database file
ls -la meeting_hub.db

# Verify database
sqlite3 meeting_hub.db ".tables"
```

### Out of Memory
```bash
# Check memory usage
free -h
# Increase swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

## Maintenance

### Daily
- Monitor error logs
- Check API health
- Verify backups

### Weekly
- Review performance metrics
- Update dependencies
- Security patches

### Monthly
- Database optimization
- Capacity planning
- User feedback review

## Support

For deployment questions:
1. Check logs: `docker logs container-name`
2. Review documentation
3. Create GitHub issue with details
4. Contact: Arunita VK

---

**Last Updated**: 2024-01-15
**Version**: 1.0
