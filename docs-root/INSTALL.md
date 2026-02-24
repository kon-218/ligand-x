# Installation Guide (Docker)

This application now uses Docker exclusively. All dependencies are managed through Docker containers.

## Prerequisites

- **Docker** 20.10+ and **Docker Compose** 2.0+
- 8GB+ RAM recommended
- 10GB+ free disk space

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd app
```

### 2. Build Docker Images

```bash
docker-compose build
```

This will:
- Create all required Conda environments
- Install all Python dependencies
- Build the frontend application
- Set up all microservices

**Note:** The first build may take 15-30 minutes depending on your internet connection and system performance.

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Verify Installation

```bash
# Check all services are running
docker-compose ps

# View logs
docker-compose logs -f
```

## Rebuilding Services

### Rebuild a Single Service

If you've made changes to a specific service:

```bash
./rebuild-service.sh <service_name>
docker-compose up -d <service_name>
```

### Rebuild All Services

```bash
docker-compose build
```

## Troubleshooting

### Build Fails

- Check disk space: `df -h`
- Check Docker memory allocation (Docker Desktop → Settings → Resources)
- Try: `docker-compose build --no-cache`

### Services Won't Start

- Check logs: `docker-compose logs <service_name>`
- Verify ports aren't in use
- Check service status: `docker-compose ps`

### Port Conflicts

Modify ports in `docker-compose.yml` if needed.

## For More Information

- [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) - Detailed Docker guide
- [README.md](README.md) - Main documentation
