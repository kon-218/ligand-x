# Changelog

All notable changes to Ligand-X will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] - 2026-02-27

Initial public release.

### Features

- **API Gateway**: FastAPI-based intelligent proxy with WebSocket pub/sub for real-time job updates
- **Molecular Docking**:AutoDock Vina integration with single and batch docking modes, grid box setup, and results visualization
- **MD Simulations**: OpenMM/OpenFF molecular dynamics with heating/NVT/NPT phases, checkpoint preview, and trajectory analysis
- **Absolute Binding Free Energy (ABFE)** — OpenFE-based ABFE calculations via Celery GPU worker
- **Relative Binding Free Energy (RBFE)**: OpenFE with Kartograf and LOMAP atom mappers; MCS-based ligand alignment; network graph visualization
- **Quantum Chemistry**: ORCA integration for geometry optimization, frequency analysis, charges, and Fukui indices
- **ADMET Prediction**: Drug-likeness and ADMET property prediction with batch SMILES screening (PyTorch)
- **Boltz-2**: GPU-accelerated binding affinity predictions using Boltz-2
- **3D Visualization**: Mol* viewer with custom color themes and molecular orbital visualization
- **Structure Editing**: Ketcher editor with SMILES import/export
- **Sequence Analysis**: Pairwise alignment (EMBOSS Needle/Water) and MSA with results caching
- **Molecule Library**: Persistent in-app molecule library with SMILES, SDF, and PDB support

### Architecture

- 11 FastAPI microservices + 4 Celery workers
- Per-service Conda environments (1.5–6 GB each), with some overlap
- PostgreSQL job persistence with blob storage; Redis WebSocket pub/sub
- Docker Compose with production resource limits, health checks, log rotation, and restart policies
- Next.js 15 / React 19 with Zustand State Management//


- No built-in authentication layer; intended for trusted/internal deployments; add a reverse proxy with auth for public exposure
