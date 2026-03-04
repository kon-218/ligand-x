# Ligand-X

A web platform for computational chemistry: molecular docking, MD simulations,
quantum chemistry, absolute and relative binding free energy calculations, ADMET
predictions, and interactive 3D visualization.

## Quick Start

### Recommended: Ligand-X Launcher (all platforms)

The easiest way to run Ligand-X on any platform.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine (Linux)
2. Clone the repository:
   ```bash
   git clone https://github.com/kon-218/ligand-x.git
   ```
3. Download the launcher for your platform from the [Releases page](https://github.com/kon-218/ligand-x/releases):
   - **Windows**: `ligandx-launcher-windows-amd64-installer.exe`
   - **macOS**: `ligandx-launcher-darwin-arm64.dmg`
   - **Linux**: `ligandx-launcher-linux-amd64.AppImage`
4. Open the launcher, point it at the cloned folder if not auto-detected, select a start mode, and click **Start**
5. Open http://localhost:3000

> For GPU acceleration (Boltz-2, ABFE/RBFE): install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) (Linux) or enable GPU in Docker Desktop settings (Windows/macOS).

See [launcher/README.md](launcher/README.md) for full launcher documentation.

### Manual / CLI (developers and headless servers)

<details>
<summary>Production (pre-built images from GHCR)</summary>

```bash
git clone https://github.com/kon-218/ligand-x.git
cd ligand-x
cp .env.production.template .env.production
# Edit .env.production - see Configuration section below
make pull
make prod
```

First pull downloads ~20 GB of images.

</details>

<details>
<summary>Development (hot reload)</summary>

```bash
git clone https://github.com/kon-218/ligand-x.git
cd ligand-x
make dev
```

</details>

## Services

Eleven FastAPI microservices and four Celery workers coordinated by an API gateway:

| Service   | Port | Description                                        |
|-----------|------|----------------------------------------------------|
| gateway   | 8000 | Routing, CORS, WebSocket job updates               |
| structure | 8001 | PDB/CIF parsing, SMILES to 3D, molecule library    |
| docking   | 8002 | AutoDock Vina molecular docking                    |
| md        | 8003 | OpenMM/OpenFF molecular dynamics                   |
| admet     | 8004 | ADMET property prediction (PyTorch)                |
| boltz2    | 8005 | Boltz-2 structure/affinity prediction (GPU)        |
| qc        | 8006 | Quantum chemistry with ORCA                        |
| alignment | 8007 | Protein sequence alignment                         |
| ketcher   | 8008 | Molecular structure editor backend                 |
| msa       | 8009 | Multiple sequence alignment                        |
| abfe      | 8010 | Absolute binding free energy (OpenFE)              |
| rbfe      | 8011 | Relative binding free energy (OpenFE/Kartograf)    |

**Workers**: `worker-qc` (QC), `worker-gpu-short` (MD, Boltz2), `worker-gpu-long` (ABFE/RBFE), `worker-cpu` (batch docking)

## Features

- **Molecular Docking** - AutoDock Vina with grid box setup, batch mode, results visualization
- **MD Simulations** - OpenMM/OpenFF with heating/NVT/NPT, preview checkpoint, trajectory analysis
- **Free Energy** - ABFE and RBFE via OpenFE; Kartograf and LOMAP atom mappers
- **Quantum Chemistry** - ORCA: geometry optimization, frequency analysis, NBO charges, Fukui indices
- **ADMET Prediction** - Drug-likeness, ADMET properties, batch SMILES screening
- **3D Visualization** - Mol* viewer with custom color themes, orbital visualization
- **Structure Editing** - Ketcher editor with SMILES import/export
- **Sequence Analysis** - Pairwise alignment and MSA with results caching
- **Real-time Updates** - WebSocket job tracking with SSE progress streaming

## Prerequisites

| Requirement    | Notes                                                          |
|----------------|----------------------------------------------------------------|
| Docker 20.10+  | Docker Desktop on Windows/macOS; Docker Engine on Linux        |
| 20 GB+ disk    | Per-service images are 1.5–6 GB each                          |
| NVIDIA GPU     | Recommended; required for Boltz-2, ABFE/RBFE                  |

For GPU on Linux: install `nvidia-container-toolkit`.
On Windows/macOS: enable GPU passthrough in Docker Desktop settings (requires WSL2 backend on Windows).

## Developer Commands

```bash
make pull             # Pull pre-built images from GHCR
make prod             # Start production stack (reads .env.production)
make dev              # Start dev environment with hot reload
make down             # Stop and remove containers
make build            # Build images locally (tagged with git SHA)
make push             # Push locally built images to GHCR
make test             # Run pytest suite
make clean            # Remove dangling images; cap build cache at 50 GB
make status           # Show disk usage and container status
make logs             # Tail all service logs
make logs-<service>   # Tail a specific service (e.g. make logs-gateway)
make shell-<service>  # Shell into a service (e.g. make shell-gateway)
make restart          # Restart all running containers
make db               # Connect to PostgreSQL
make db-backup        # Dump database to ./backups/
```

Partial dev startup:

```bash
make dev-core         # Infrastructure + structure + frontend only
make dev-docking      # Core + docking
make dev-md           # Core + MD
make dev-qc           # Core + quantum chemistry
make dev-free-energy  # Core + docking + MD + ABFE + RBFE
make dev-gpu          # All GPU services
```

### Windows (PowerShell) — developer CLI

`make` is not available on Windows without WSL2. Windows developers can use `start.ps1` instead — it covers every command above:

```powershell
.\start.ps1 pull
.\start.ps1 prod
.\start.ps1 dev
.\start.ps1 logs gateway      # service name as second argument
.\start.ps1 shell gateway
.\start.ps1 dev-core
# ...same pattern for all other targets
```

If execution is blocked: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

> **Note**: For simply running Ligand-X on Windows, use the [Launcher](launcher/README.md) instead. `start.ps1` is for developers who need dev/build/test workflow commands.

See [docs/INSTALL.md](docs/INSTALL.md) for Windows-specific prerequisites and GPU passthrough notes.

## Configuration

| File                        | Purpose                                                    |
|-----------------------------|------------------------------------------------------------|
| `.env`                      | Dev environment (auto-generated by `make dev`)             |
| `.env.production`           | Production secrets (copy from `.env.production.template`)  |
| `.env.production.template`  | Template with all available variables and defaults         |

The Makefile passes `--env-file .env.production` to all docker compose commands
automatically when that file exists.

### Required variables in `.env.production`

| Variable              | How to set                                                        |
|-----------------------|-------------------------------------------------------------------|
| `QC_SECRET_KEY`       | `python -c "import secrets; print(secrets.token_urlsafe(32))"`   |
| `FLOWER_PASSWORD`     | Any strong password                                               |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` for local, `https://your-domain.com` for remote |
| `CORS_ORIGINS`        | `http://localhost:3000` for local, `https://your-domain.com` for remote |
| `ORCA_HOST_PATH`      | Absolute path to ORCA binary (for quantum chemistry)             |

Use `http://` for localhost. `https://localhost` has no TLS certificate and will
cause CORS errors.

## Project Structure

```
ligand-x/
├── launcher/             # Cross-platform GUI launcher (Wails)
├── gateway/              # API gateway (routing, WebSocket, CORS)
├── services/             # FastAPI microservices
│   ├── structure/
│   ├── docking/
│   ├── md/
│   ├── admet/
│   ├── boltz2/
│   ├── qc/
│   ├── alignment/
│   ├── msa/
│   ├── ketcher/
│   ├── abfe/
│   └── rbfe/
├── lib/                  # Shared libraries
│   ├── chemistry/        #   Parsers, preparation
│   ├── common/           #   Config, utils, models, Redis
│   ├── db/               #   PostgreSQL job repository
│   └── tasks/            #   Celery task definitions
├── frontend/             # Next.js 15 / React 19
├── environments/         # Per-service Conda environments
├── docker/               # Dockerfiles
├── migrations/           # PostgreSQL schema
├── scripts/              # Utility scripts
├── tests/                # pytest test suite
└── docs/                 # Developer documentation
```

## Architecture

- **Gateway**: Proxy routing and Redis WebSocket pub/sub for real-time job updates
- **Async Tasks**: Celery with four specialized queues (qc, gpu-short, gpu-long, cpu)
- **Database**: PostgreSQL for job persistence; Redis for Celery broker and WebSocket
- **Frontend**: Next.js App Router, Zustand state management, React Query for server state
- **Visualization**: Mol* for 3D structures, Plotly for analysis charts, Ketcher for editing
- **Images**: Published to GHCR (`ghcr.io/kon-218/ligand-x/<service>`) on every push to `main`

## Documentation

- [Launcher Guide](launcher/README.md)
- [Installation Guide](docs/INSTALL.md)
- [Build Reference](docs/BUILD.md)
- [Services Overview](docs/services/SERVICES_OVERVIEW.md)
- [API Reference](docs/API.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Acknowledgements

RDKit · OpenMM · OpenFF · OpenFE · Molstar · Ketcher · AutoDock Vina · ORCA · Boltz-2 · BioPython
