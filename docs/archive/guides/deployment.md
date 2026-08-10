# Deployment Guide

## Overview

CodeYang can be deployed in multiple ways:
1. **NPM Global Install** (CLI usage)
2. **Docker Container** (isolated environment)
3. **Docker Compose** (production setup)
4. **VSCode Extension** (IDE integration)

---

## 1. NPM Global Install

### Installation

```bash
npm install -g codeyang
```

### Configuration

```bash
# Copy example config
cp .env.example .env

# Edit with your API key
nano .env
```

### Usage

```bash
# Start interactive mode
codeyang

# Run with specific model
codeyang --model claude-opus-4

# Debug mode
CODEYANG_DEBUG=true codeyang
```

### Update

```bash
npm update -g codeyang
```

---

## 2. Docker Container

### Build Image

```bash
docker build -t codeyang:latest .
```

### Run Container

```bash
docker run -it --rm \
  -e ANTHROPIC_API_KEY=sk-... \
  -v $(pwd)/workspace:/workspace \
  codeyang:latest
```

### With Custom Config

```bash
docker run -it --rm \
  --env-file .env \
  -v $(pwd)/workspace:/workspace \
  -v $(pwd)/.codeyang:/app/.codeyang \
  codeyang:latest
```

---

## 3. Docker Compose (Production)

### Setup

```bash
# Copy example env
cp .env.example .env

# Edit configuration
nano .env

# Add your API key
echo "ANTHROPIC_API_KEY=sk-..." >> .env
```

### Start Services

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Health Check

```bash
docker-compose ps
# Should show "healthy" status
```

### Scaling (Future)

```bash
# Run multiple instances
docker-compose up -d --scale codeyang=3
```

---

## 4. Environment Variables

### Required

```bash
# API Key (required)
ANTHROPIC_API_KEY=sk-ant-...

# Or DeepSeek
DEEPSEEK_API_KEY=sk-...
```

### Model Configuration

```bash
CODEYANG_MODEL=claude-opus-4
CODEYANG_MAX_TOKENS=32000
CODEYANG_TEMPERATURE=0.7
```

### Security

```bash
# Deny dangerous commands
CODEYANG_DENY_COMMANDS=rm,sudo,curl|sh

# Enable sandbox
CODEYANG_SANDBOX_ENABLED=true

# Restrict file access
CODEX_SANDBOX=/path/to/workspace
```

### Observability

```bash
# Log level
CODEYANG_LOG_LEVEL=info

# Enable tracing
CODEYANG_TRACE_ENABLED=true

# Debug mode
CODEYANG_DEBUG=true
CODEYANG_DEBUG_FILTER=tool,perf
```

### Performance

```bash
# Enable caching
CODEYANG_CACHE_ENABLED=true
CODEYANG_CACHE_SIZE=100
CODEYANG_CACHE_TTL_MS=10000

# Rate limiting
CODEYANG_RATE_LIMIT_RPM=100
```

---

## 5. Production Best Practices

### Security

**1. API Key Management**
```bash
# Use secrets manager (not .env in production)
export ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value ...)
```

**2. Network Isolation**
```yaml
# docker-compose.yml
services:
  codeyang:
    networks:
      - internal
    # No public ports
```

**3. File System Restrictions**
```bash
# Mount workspace read-only if possible
-v ./workspace:/workspace:ro
```

**4. Resource Limits**
```yaml
# docker-compose.yml
services:
  codeyang:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Monitoring

**1. Health Checks**
```bash
# Add to docker-compose.yml
healthcheck:
  test: ["CMD", "node", "-e", "console.log('healthy')"]
  interval: 30s
  timeout: 3s
  retries: 3
```

**2. Log Aggregation**
```bash
# Ship logs to centralized system
docker-compose logs -f | logstash ...
```

**3. Metrics**
```bash
# Export Prometheus metrics (future)
CODEYANG_METRICS_ENABLED=true
CODEYANG_METRICS_PORT=9090
```

### Backup

**1. Workspace Backup**
```bash
# Regular backups
rsync -av ./workspace /backup/$(date +%Y%m%d)/
```

**2. Configuration Backup**
```bash
tar -czf config-backup.tar.gz .env .codeyang/
```

---

## 6. Kubernetes Deployment (Advanced)

### Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: codeyang
spec:
  replicas: 2
  selector:
    matchLabels:
      app: codeyang
  template:
    metadata:
      labels:
        app: codeyang
    spec:
      containers:
      - name: codeyang
        image: codeyang:latest
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: codeyang-secrets
              key: api-key
        resources:
          limits:
            cpu: "2"
            memory: "2Gi"
          requests:
            cpu: "1"
            memory: "1Gi"
        volumeMounts:
        - name: workspace
          mountPath: /workspace
      volumes:
      - name: workspace
        persistentVolumeClaim:
          claimName: codeyang-pvc
```

### Secret Management

```bash
# Create secret
kubectl create secret generic codeyang-secrets \
  --from-literal=api-key=sk-...

# Deploy
kubectl apply -f deployment.yml
```

---

## 7. CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy CodeYang
on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t codeyang:${{ github.ref_name }} .
      
      - name: Push to registry
        run: |
          docker tag codeyang:${{ github.ref_name }} registry.com/codeyang:latest
          docker push registry.com/codeyang:latest
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - build
  - deploy

build:
  stage: build
  script:
    - docker build -t codeyang:$CI_COMMIT_TAG .
    - docker push codeyang:$CI_COMMIT_TAG

deploy:
  stage: deploy
  script:
    - kubectl set image deployment/codeyang codeyang=codeyang:$CI_COMMIT_TAG
```

---

## 8. Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs codeyang

# Common issues:
# 1. Missing API key → Add ANTHROPIC_API_KEY to .env
# 2. Permission denied → chown workspace directory
# 3. Port conflict → Change port in docker-compose.yml
```

### High Memory Usage

```bash
# Set memory limit
docker-compose up --memory=2g

# Or in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 2G
```

### Slow Performance

```bash
# Enable caching
CODEYANG_CACHE_ENABLED=true

# Increase cache size
CODEYANG_CACHE_SIZE=500

# Check metrics
docker stats codeyang
```

---

## 9. Upgrading

### NPM

```bash
npm update -g codeyang
```

### Docker

```bash
# Pull latest
docker pull codeyang:latest

# Restart services
docker-compose down
docker-compose up -d
```

### Kubernetes

```bash
kubectl set image deployment/codeyang codeyang=codeyang:latest
kubectl rollout status deployment/codeyang
```

---

## 10. Rollback

### Docker Compose

```bash
# Stop current
docker-compose down

# Use specific version
docker-compose -f docker-compose.yml.v0.6 up -d
```

### Kubernetes

```bash
kubectl rollout undo deployment/codeyang
```

---

## Resources

- [Architecture Documentation](./architecture.md)
- [Security Policy](../SECURITY.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [CI/CD Documentation](../.github/CI-CD.md)

---

**Need help?** Open an issue or discussion on GitHub.
