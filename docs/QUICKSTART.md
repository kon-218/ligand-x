# Quick Start Guide (Docker)

This application now uses Docker exclusively. For the fastest way to get started, see [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md).

## Quick Start with Docker

### 1. Build and Start

```bash
# Build all Docker images (first time only)
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

When you make changes to a service, rebuild only that service:

```bash
./rebuild-service.sh <service_name>
docker-compose up -d <service_name>
```

For more details, see [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md).
