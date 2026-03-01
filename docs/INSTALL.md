# Installation Guide

Ligand-X runs entirely in Docker. All dependencies (Conda environments, scientific
libraries, and the Next.js frontend) are managed inside containers.

## Prerequisites

| Requirement        | Minimum     | Notes                                               |
|--------------------|-------------|-----------------------------------------------------|
| Docker             | 20.10+      |                                                     |
| Docker Compose     | 2.0+        | Bundled with Docker Desktop                         |
| Free disk space    | 20 GB+      | Per-service Conda environments are 1.5-6 GB each   |
| RAM                | 16 GB+      | 32 GB+ recommended for GPU services (MD, ABFE, RBFE)|
| NVIDIA GPU         | Recommended | Required for Boltz-2, ABFE/RBFE GPU acceleration   |

---

## Option A - Production (pre-built GHCR images)

Pull and run pre-built images directly from GitHub Container Registry. No build
step required.

### 1. Clone the repository

```bash
git clone https://github.com/kon-218/ligand-x.git
cd ligand-x
```

### 2. Configure environment

```bash
cp .env.production.template .env.production
nano .env.production
```

Key variables to fill in:

| Variable              | Notes                                                               |
|-----------------------|---------------------------------------------------------------------|
| `POSTGRES_PASSWORD`   | Any strong password                                                 |
| `RABBITMQ_PASSWORD`   | Any strong password                                                 |
| `FLOWER_PASSWORD`     | Any strong password                                                 |
| `QC_SECRET_KEY`       | Run: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` for local use, `https://your-domain.com` for remote |
| `CORS_ORIGINS`        | `http://localhost:3000` for local use, `https://your-domain.com` for remote |
| `ORCA_HOST_PATH`      | Absolute path to your ORCA binary, e.g. `/home/user/orca_6_1_0/orca` |

**Note:** Use `http://` for localhost. `https://localhost` has no TLS certificate
and will cause CORS failures in the browser.

**Note:** `QC_SECRET_KEY` and `FLOWER_PASSWORD` must be non-empty. Docker Compose
will refuse to start if either is missing or blank.

### 3. Pull images from GHCR

```bash
make pull
```

The Makefile passes `--env-file .env.production` automatically when that file
exists, so no extra flags are needed.

### 4. Start

```bash
make prod
```

### 5. Verify

```bash
docker compose ps
curl http://localhost:8000/health
curl http://localhost:8000/api/services/health
```

Frontend: http://localhost:3000
API: http://localhost:8000

---

## Option B - Development (hot reload)

For contributors or anyone modifying the source code.

### 1. Clone the repository

```bash
git clone https://github.com/kon-218/ligand-x.git
cd ligand-x
```

### 2. Start

```bash
make dev
```

This auto-generates a `.env` file with your user ID, volume-mounts the source
code into each container, and starts the full stack with hot reload.

### 3. Verify

```bash
docker compose ps
curl http://localhost:8000/health
curl http://localhost:8000/api/services/health
```

### Partial startup

Start only the services you need:

```bash
make dev-core         # Infrastructure + structure + frontend
make dev-docking      # Core + editor + docking
make dev-md           # Core + editor + MD simulations
make dev-qc           # Core + editor + quantum chemistry
make dev-free-energy  # Core + docking + MD + ABFE + RBFE
make dev-gpu          # All GPU services (full stack minus QC)
```

---

## Option C - Build from source

For building custom images after local code changes.

```bash
git clone https://github.com/kon-218/ligand-x.git
cd ligand-x
make build       # tags images with the current git SHA; first build takes 15-30 min
make prod        # configure .env.production first
```

---

## Rebuilding a single service

```bash
docker compose build <service>
docker compose up -d <service>
```

Example:
```bash
docker compose build structure
docker compose up -d structure
```

---

## Troubleshooting

### `QC_SECRET_KEY is missing a value`

The variable is unset or blank in `.env.production`. Generate a value and add it:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Set the output as `QC_SECRET_KEY=<value>` in `.env.production`.

### `make down` or `make prod` fails with a missing variable

The Makefile reads `.env.production` automatically. If you are running `docker compose`
directly, pass the env file yourself:

```bash
docker compose --env-file .env.production down
docker compose --env-file .env.production -f docker-compose.yml up -d
```

### CORS errors in the browser

Check that `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS` match the addresses you are
actually using. For local installs:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Then restart: `make down && make prod`.

### Services won't start

```bash
make logs-<service>                            # e.g. make logs-gateway
docker compose ps                              # check health status
netstat -tuln | grep -E '3000|8000|6379'       # check for port conflicts
```

### Permission issues on output files

Set `UID` and `GID` in `.env.production` to match the user that should own
output files:

```
UID=1000
GID=1000
```

The dev environment sets these automatically from your current user.

### GPU services not working

```bash
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

If this fails, install `nvidia-container-toolkit` and configure the Docker runtime.
