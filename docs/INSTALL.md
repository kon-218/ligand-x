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

## Windows

**Prerequisites:** Docker Desktop 4.x+ (includes Compose v2), PowerShell 5+

All `make` commands have PowerShell equivalents via `start.ps1`. On Windows, replace
every `make <target>` in this guide with `.\start.ps1 <target>`.

**Execution policy** — if PowerShell blocks the script, run once:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**GPU passthrough** — NVIDIA GPU acceleration requires the WSL2 backend in Docker
Desktop plus the [NVIDIA Container Toolkit for WSL2](https://docs.nvidia.com/cuda/wsl-user-guide/).

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

**Windows (PowerShell):**
```powershell
.\start.ps1 pull
```

The script passes `--env-file .env.production` automatically when that file
exists, so no extra flags are needed.

### 4. Start

```bash
make prod
```

**Windows (PowerShell):**
```powershell
.\start.ps1 prod
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

**Windows (PowerShell):**
```powershell
.\start.ps1 dev
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

**Windows (PowerShell):**
```powershell
.\start.ps1 dev-core
.\start.ps1 dev-docking
.\start.ps1 dev-md
.\start.ps1 dev-qc
.\start.ps1 dev-free-energy
.\start.ps1 dev-gpu
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

**Windows (PowerShell):**
```powershell
.\start.ps1 build   # requires WSL2 for full script; falls back to docker compose build
.\start.ps1 prod
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

Then restart:

```bash
make down && make prod
```

**Windows (PowerShell):**
```powershell
.\start.ps1 down; .\start.ps1 prod
```

### Services won't start

```bash
make logs-<service>                            # e.g. make logs-gateway
docker compose ps                              # check health status
netstat -tuln | grep -E '3000|8000|6379'       # check for port conflicts
```

**Windows (PowerShell):**
```powershell
.\start.ps1 logs gateway
docker compose ps
netstat -an | findstr "3000 8000 6379"
```

### Permission issues on output files

Set `UID` and `GID` in `.env.production` to match the user that should own
output files:

```
UID=1000
GID=1000
```

The dev environment sets these automatically from your current user (Linux/macOS)
or uses `1000` on Windows (matches the container's `appuser`).

### GPU services not working

```bash
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

If this fails, install `nvidia-container-toolkit` and configure the Docker runtime.
On Windows, ensure you are using the WSL2 backend in Docker Desktop and have
installed the NVIDIA Container Toolkit for WSL2.
