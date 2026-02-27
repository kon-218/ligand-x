# Ligand-X Services Overview

Comprehensive documentation of the computational chemistry services: ABFE, RBFE, Docking, and MD Optimization.

## Architecture

All services follow a unified execution pattern:

```
┌──────────┐    ┌─────────┐    ┌────────────┐    ┌────────────────┐    ┌──────────────┐
│ Frontend │───▶│ Gateway │───▶│   Celery   │───▶│ Service Runner │───▶│   Service    │
│ (React)  │    │(FastAPI)│    │   Worker   │    │  (conda run)   │    │  (Python)    │
└──────────┘    └─────────┘    └────────────┘    └────────────────┘    └──────────────┘
     │               │               │                   │                    │
     │  POST /api/   │   Submit to   │   Execute in      │   JSON stdin/     │
     │  jobs/submit  │   queue       │   conda env       │   stdout          │
     │               │               │                   │                    │
     ▼               ▼               ▼                   ▼                    ▼
  Job ID +      PostgreSQL      Task State         Progress to           Result
  Stream URL    + Celery        Updates            stderr                 JSON
```

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Gateway** | `gateway/routers/jobs.py` | Unified job submission, SSE streaming, PostgreSQL storage |
| **GPU Tasks** | `lib/tasks/gpu_tasks.py` | Celery tasks for MD, ABFE, RBFE, Boltz2 |
| **CPU Tasks** | `lib/tasks/cpu_tasks.py` | Celery tasks for Docking |
| **Service Runner** | `lib/services/runner.py` | Executes services in conda environments |
| **Chemistry Utils** | `lib/chemistry/` | Shared PDB parsing, structure preparation |

## Queue Architecture

| Queue | Worker | Concurrency | Conda Env | Services |
|-------|--------|-------------|-----------|----------|
| `gpu-long` | worker-gpu-long | 1 | biochem-md | ABFE, RBFE |
| `gpu-short` | worker-gpu-short | 2 | biochem-md | MD, Boltz2, ADMET |
| `cpu` | worker-cpu | 4 | biochem-docking | Docking (single/batch) |
| `qc` | worker-qc | 2 | biochem-qc | Quantum Chemistry |

## Services Summary

| Service | Scientific Purpose | Key Output |
|---------|-------------------|------------|
| **ABFE** | Absolute Binding Free Energy | ΔG (kcal/mol) for single ligand |
| **RBFE** | Relative Binding Free Energy | ΔΔG network for ligand series |
| **Docking** | Molecular Docking | Binding poses with affinity scores |
| **MD** | MD Optimization | Equilibrated complex structures |

## Data Flow

### 1. Job Submission
```
Frontend POST /api/jobs/submit/{job_type}
    ↓
Gateway creates job in PostgreSQL (status: 'submitted')
    ↓
Gateway submits Celery task to appropriate queue
    ↓
Gateway returns { job_id, stream_url } to frontend
```

### 2. Task Execution
```
Celery worker picks up task from queue
    ↓
Task calls call_service_with_progress(service_name, job_data)
    ↓
Runner executes: conda run -n {env} python services/{service}/run_{service}_job.py
    ↓
Service reads JSON from stdin, processes, writes JSON to stdout
    ↓
Progress updates written to stderr (parsed by runner)
    ↓
Result returned through Celery, stored in PostgreSQL
```

### 3. Progress Streaming (SSE)
```
Frontend connects to GET /api/jobs/stream/{job_id}
    ↓
Gateway polls Celery task state every 2 seconds
    ↓
Progress updates sent as Server-Sent Events
    ↓
On completion, result stored in PostgreSQL
    ↓
Frontend receives 'complete' event with result
```

## Shared Chemistry Utilities

Located in `lib/chemistry/`:

| Module | Purpose |
|--------|---------|
| `PDBParserUtils` | Parse PDB format, extract atoms/residues |
| `MMCIFParserUtils` | Parse mmCIF format |
| `ComponentAnalyzer` | Identify ligands, waters, ions, metals in structures |
| `ProteinPreparer` | Clean protein (remove heteroatoms, add hydrogens) |
| `LigandPreparer` | Prepare ligand (add hydrogens, generate 3D, optimize) |
| `smiles_lookup` | SMILES validation and lookup |

## Service Files Structure

Each service follows a consistent structure:

```
services/{service}/
├── __init__.py          # Package initialization
├── main.py              # FastAPI application entry point
├── routers.py           # API endpoints
├── service.py           # Core service logic
├── run_{service}_job.py # Celery task entrypoint (JSON stdin/stdout)
└── [additional modules] # Service-specific modules
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CELERY_BROKER_URL` | `amqp://ligandx:ligandx@rabbitmq:5672/` | RabbitMQ connection |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/0` | Redis for task results |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

## API Endpoints

### Gateway (Unified)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/jobs/submit/{job_type}` | Submit new job |
| `GET` | `/api/jobs/stream/{job_id}` | SSE progress stream |
| `GET` | `/api/jobs/list` | List all jobs |
| `GET` | `/api/jobs/{job_id}` | Get job details |
| `POST` | `/api/jobs/{job_id}/cancel` | Cancel running job |
| `DELETE` | `/api/jobs/{job_id}` | Delete job |

### Service-Specific
Each service also exposes direct endpoints (primarily for internal use):
- ABFE: `http://abfe:8007/api/abfe/`
- RBFE: `http://rbfe:8008/api/rbfe/`
- Docking: `http://docking:8002/api/docking/`
- MD: `http://md:8003/api/md/`

## Related Documentation

- [ABFE_SERVICE.md](./ABFE_SERVICE.md) - Absolute Binding Free Energy
- [RBFE_SERVICE.md](./RBFE_SERVICE.md) - Relative Binding Free Energy
- [DOCKING_SERVICE.md](./DOCKING_SERVICE.md) - Molecular Docking
- [MD_SERVICE.md](./MD_SERVICE.md) - MD Optimization
