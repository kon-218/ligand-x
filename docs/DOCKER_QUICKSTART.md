# Docker Quick Start Guide

This guide provides quick instructions for running the application using Docker.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 8GB+ RAM recommended
- 10GB+ free disk space

## Quick Start

### 1. Build and Start All Services

```bash
# Build all Docker images (first time only, takes 15-30 minutes)
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 2. Access the Application

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### 3. Stop Services

```bash
docker-compose down
```

## Rebuilding Individual Services

When you make changes to a specific service, rebuild only that service:

```bash
# Rebuild a specific service
./rebuild-service.sh <service_name>

# Restart the service
docker-compose up -d <service_name>
```

### Available Services

- `gateway` - API Gateway
- `structure` - Structure processing
- `docking` - Molecular docking
- `md` - MD optimization
- `admet` - ADMET prediction
- `boltz2` - Boltz2 binding affinity
- `qc` - Quantum chemistry
- `alignment` - Protein alignment
- `ketcher` - Ketcher molecular editor
- `worker-qc` - Celery worker for quantum chemistry
- `frontend` - Next.js frontend

### Examples

```bash
# Rebuild gateway after making changes
./rebuild-service.sh gateway
docker-compose up -d gateway

# Rebuild docking service
./rebuild-service.sh docking
docker-compose up -d docking

# Rebuild frontend
./rebuild-service.sh frontend
docker-compose up -d frontend
```

## Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f gateway
docker-compose logs -f qc
```

### Check Service Status

```bash
docker-compose ps
```

### Restart a Service

```bash
docker-compose restart <service_name>
```

### Rebuild All Services

```bash
docker-compose build
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove containers, networks, and volumes
docker-compose down -v

# Remove images (use with caution)
docker-compose down --rmi all
```

## Troubleshooting

### Build Fails

- Check disk space: `df -h`
- Check Docker memory: Docker Desktop → Settings → Resources
- Try rebuilding with: `docker-compose build --no-cache`

### Services Won't Start

- Check logs: `docker-compose logs <service_name>`
- Verify ports aren't in use: `netstat -an | grep <port>`
- Check service status: `docker-compose ps`

### Port Conflicts

If ports 3000, 8000, or 6380 are already in use, modify `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Change external port
```

### Out of Memory

- Increase Docker memory allocation (Docker Desktop → Settings → Resources)
- Close other applications
- Consider running fewer services at once

## Development Workflow

1. Make changes to service code
2. Rebuild the service: `./rebuild-service.sh <service_name>`
3. Restart the service: `docker-compose up -d <service_name>`
4. Check logs: `docker-compose logs -f <service_name>`

## Performance Tips

- Docker layer caching is optimized in the Dockerfile
- Only rebuild services that have changed
- Use `docker stats` to monitor resource usage
- Consider using Docker BuildKit for faster builds: `DOCKER_BUILDKIT=1 docker-compose build`

