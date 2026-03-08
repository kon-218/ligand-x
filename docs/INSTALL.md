# Installation Guide

Ligand-X runs entirely in Docker. All dependencies (Conda environments, scientific
libraries, and the Next.js frontend) are managed inside containers.

---

## Option A — Launcher (Recommended)

The simplest way to run Ligand-X on any desktop platform. No terminal required.

### Prerequisites

| Requirement       | Notes                                                                                  |
|-------------------|----------------------------------------------------------------------------------------|
| Docker            | [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows/macOS; [Docker Engine](https://docs.docker.com/engine/install/) on Linux |
| Free disk space   | 20 GB+ (per-service images are 1.5–6 GB each)                                         |
| RAM               | 16 GB+; 32 GB+ for GPU services (MD, ABFE/RBFE)                                       |
| NVIDIA GPU        | Recommended; required for Boltz-2, ABFE/RBFE GPU acceleration                         |

**GPU setup:**
- **Linux**: Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- **Windows/macOS**: Enable GPU passthrough in Docker Desktop settings (requires WSL2 backend on Windows + [NVIDIA Container Toolkit for WSL2](https://docs.nvidia.com/cuda/wsl-user-guide/))

### Steps

1. Download the launcher for your platform from the [Releases page](https://github.com/kon-218/ligand-x/releases):

   | Platform | File |
   |----------|------|
   | Windows | `ligandx-launcher-windows-amd64-installer.exe` |
   | macOS | `ligandx-launcher-darwin-arm64.dmg` |
   | Linux | `ligandx-launcher-linux-amd64.AppImage` |

2. Install and launch:
   - **Windows**: Run the installer, then launch from the Start Menu
   - **macOS**: Open the DMG, drag to Applications, launch from there
   - **Linux**: `chmod +x ligandx-launcher-linux-amd64.AppImage` then run it

3. In the launcher, select a start mode and click **Start**

4. Click **Open App** or navigate to http://localhost:3000

See [launcher/README.md](../launcher/README.md) for full launcher documentation and troubleshooting.

---

## Option B — Production / Headless (CLI)

For server deployments or environments without a desktop. Requires git and a terminal.

### Prerequisites

| Requirement        | Minimum     | Notes                                               |
|--------------------|-------------|-----------------------------------------------------|
| Docker             | 20.10+      |                                                     |
| Docker Compose     | 2.0+        | Bundled with Docker Desktop                         |
| Free disk space    | 20 GB+      | Per-service Conda environments are 1.5-6 GB each   |
| RAM                | 16 GB+      | 32 GB+ recommended for GPU services (MD, ABFE, RBFE)|
| NVIDIA GPU         | Recommended | Required for Boltz-2, ABFE/RBFE GPU acceleration   |

**Windows developers** — `make` requires WSL2. Without WSL2, use `.\start.ps1 <target>` as a drop-in replacement for every `make <target>` in this guide. See the [Windows note](#windows-developer-cli) below.

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

The script passes `--env-file .env.production` automatically when that file
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

## Option C — Development (hot reload)

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

## Option D — Build from source

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

## Windows developer CLI

If you are developing on Windows without WSL2, replace all `make <target>` commands
with `.\start.ps1 <target>`:

```powershell
.\start.ps1 pull
.\start.ps1 prod
.\start.ps1 dev
.\start.ps1 dev-core
.\start.ps1 dev-docking
.\start.ps1 dev-md
.\start.ps1 dev-qc
.\start.ps1 dev-free-energy
.\start.ps1 dev-gpu
.\start.ps1 logs gateway      # service name as second argument
.\start.ps1 shell gateway
.\start.ps1 test
.\start.ps1 down
```

If execution is blocked, run once:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**GPU passthrough** — NVIDIA GPU acceleration requires the WSL2 backend in Docker
Desktop plus the [NVIDIA Container Toolkit for WSL2](https://docs.nvidia.com/cuda/wsl-user-guide/).

> **Just want to run Ligand-X on Windows?** Use [Option A (Launcher)](#option-a--launcher-recommended) — no terminal or PowerShell needed.

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

The dev environment sets these automatically from your current user (Linux/macOS)
or uses `1000` on Windows (matches the container's `appuser`).

### GPU services not working

```bash
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

If this fails, install `nvidia-container-toolkit` and configure the Docker runtime.
On Windows, ensure you are using the WSL2 backend in Docker Desktop and have
installed the NVIDIA Container Toolkit for WSL2.
