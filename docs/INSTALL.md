# Installation Guide

Ligand-X runs entirely in Docker. All dependencies — Conda environments, scientific libraries, and the Next.js frontend — are managed inside containers.

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Docker | 20.10+ | |
| Docker Compose | 2.0+ | Bundled with Docker Desktop |
| Free disk space | 20 GB+ | Per-service Conda environments are 1.5–6 GB each |
| RAM | 16 GB+ | 32 GB+ recommended for GPU services (MD, ABFE, RBFE) |
| NVIDIA GPU | Recommended | Required for Boltz-2, ABFE/RBFE GPU acceleration |


## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/ligand-x.git
cd ligand-x
```

### 2. Start Development Environment

```bash
make dev
```

This command:
- Auto-generates a `.env` file with your user ID for correct file permissions
- Starts all services with hot reload (code is volume-mounted)
- Exposes the frontend at http://localhost:3000 and the API at http://localhost:8000

### 3. Verify Installation

```bash
# Check all containers are running
docker compose ps

# Check service health
curl http://localhost:8000/health
curl http://localhost:8000/api/services/health
```

## Partial Startup (Faster)

Start only the services you need:

```bash
make dev-core         # Infrastructure + structure + frontend
make dev-docking      # Core + editor + docking
make dev-md           # Core + editor + MD simulations
make dev-qc           # Core + editor + quantum chemistry
make dev-free-energy  # Core + docking + MD + ABFE + RBFE
make dev-gpu          # All GPU services (full stack minus QC)
```

## Production Deployment

### 1. Configure Environment

```bash
cp .env.production.template .env.production
# Edit .env.production and fill in all CHANGE_ME values
```

Key settings to update:
- `POSTGRES_PASSWORD` — strong random password
- `RABBITMQ_PASSWORD` — strong random password
- `FLOWER_PASSWORD` — strong random password
- `QC_SECRET_KEY` — generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `NEXT_PUBLIC_API_URL` — your public domain (e.g. `https://ligandx.example.com`)
- `CORS_ORIGINS` — your frontend domain (e.g. `https://ligandx.example.com`)
- `ORCA_HOST_PATH` — path to your ORCA binary directory (for quantum chemistry)

### 2. Build Production Images

```bash
make build
```

Images are tagged with the current git commit SHA.

### 3. Start Production Services

```bash
docker compose -f docker-compose.yml --env-file .env.production up -d
```

### 4. Verify

```bash
docker compose ps
curl https://your-domain.com/health
```

## Rebuilding a Single Service

After code changes to a specific service:

```bash
docker compose build <service>
docker compose up -d <service>
```

For example:
```bash
docker compose build structure
docker compose up -d structure
```

## Troubleshooting

### Build Fails

- Check disk space: `make status`
- Clean up: `make clean`
- Retry without cache: `docker compose build --no-cache <service>`

### Services Won't Start

- Check logs: `make logs-<service>` (e.g. `make logs-gateway`)
- Verify ports aren't in use: `netstat -tuln | grep -E '3000|8000|6379'`
- Check health: `docker compose ps`

### Permission Issues on Output Files

The dev environment sets `UID`/`GID` automatically from your current user. For production, set them explicitly in `.env.production`:

```bash
UID=1000
GID=1000
```

### GPU Services Not Working

- Verify NVIDIA runtime: `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`
- Ensure `nvidia-container-toolkit` is installed and Docker is configured to use it
