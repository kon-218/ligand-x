# Services Overview

Ligand-X is a collection of specialized FastAPI microservices coordinated by a central
gateway. Each service owns a distinct scientific domain; all share the same job submission,
progress streaming, and database infrastructure.

---

## Services at a Glance

| Service | Port | Domain | Worker queue |
|---------|------|--------|--------------|
| **gateway** | 8000 | Routing, CORS, WebSocket pub/sub | — |
| **structure** | 8001 | PDB/CIF parsing, SMILES → 3D, molecule library | — |
| **docking** | 8002 | AutoDock Vina molecular docking | `cpu` |
| **md** | 8003 | Molecular dynamics (OpenMM/OpenFF) | `gpu-short` |
| **admet** | 8004 | ADMET property prediction (PyTorch) | `gpu-short` |
| **boltz2** | 8005 | Boltz-2 structure/affinity prediction | `gpu-short` |
| **qc** | 8006 | Quantum chemistry (ORCA) | `qc` |
| **alignment** | 8007 | Pairwise protein sequence alignment | — |
| **ketcher** | 8008 | Structure editor backend | — |
| **msa** | 8009 | Multiple sequence alignment | — |
| **abfe** | 8010 | Absolute binding free energy (OpenFE) | `gpu-long` |
| **rbfe** | 8011 | Relative binding free energy (OpenFE/Kartograf) | `gpu-long` |

---

## Celery Workers

Long-running calculations are dispatched to specialized Celery workers to prevent GPU
contention and ensure fair resource allocation.

| Worker | Queue | Concurrency | Conda env | Handles |
|--------|-------|-------------|-----------|---------|
| `worker-gpu-long` | `gpu-long` | 1 | `biochem-md` | ABFE, RBFE (multi-hour runs) |
| `worker-gpu-short` | `gpu-short` | 2 | `biochem-md` | MD, Boltz-2, ADMET |
| `worker-cpu` | `cpu` | 4 | `biochem-docking` | Docking (single & batch) |
| `worker-qc` | `qc` | 2 | `biochem-qc` | Quantum chemistry (ORCA) |

`gpu-long` runs with concurrency=1 so long ABFE/RBFE jobs do not compete for the GPU.
`gpu-short` allows two concurrent tasks for faster throughput on shorter jobs.

---

## Architecture

Jobs flow through a consistent pipeline regardless of service type:

```
Frontend  →  Gateway  →  Queue  →  Celery Worker  →  Service Python script
(React)      (FastAPI)   (RabbitMQ)                   (conda env)
```

1. **Submit** — frontend POSTs to `/api/jobs/submit/{job_type}`; gateway writes a job
   record to PostgreSQL and enqueues a Celery task
2. **Execute** — worker picks up the task and runs the service script inside the
   appropriate conda environment; progress is emitted to stderr
3. **Stream** — frontend connects to `/api/jobs/stream/{job_id}` (SSE); gateway polls
   Celery every 2 s and forwards progress events
4. **Complete** — result is stored in PostgreSQL; frontend receives a `complete` event

---

## Key Source Files

| File | Role |
|------|------|
| `gateway/routers/jobs.py` | Job submission, SSE streaming, PostgreSQL writes |
| `gateway/routers/jobs_websocket.py` | WebSocket alternative to SSE |
| `lib/tasks/gpu_tasks.py` | Celery task definitions for GPU queues |
| `lib/tasks/cpu_tasks.py` | Celery task definitions for CPU queue |
| `lib/services/runner.py` | Runs service scripts in conda envs, parses progress |
| `lib/db/job_repository.py` | Async PostgreSQL CRUD for job records |
| `lib/chemistry/` | Shared parsers, structure preparation utilities |

---

## Service Script Pattern

Every computational service exposes a `run_{service}_job.py` entrypoint:

```
services/{service}/
├── main.py              # FastAPI app — health endpoint, internal API
├── routers.py           # Route definitions
├── service.py           # Core scientific logic
└── run_{service}_job.py # Called by Celery worker; reads JSON from stdin, writes to stdout
```

Progress is reported on stderr as JSON lines:
```json
{"progress": 45, "message": "Running NVT equilibration"}
```

---

## Shared Chemistry Utilities (`lib/chemistry/`)

| Module | Purpose |
|--------|---------|
| `PDBParserUtils` | Parse PDB format, extract atoms/residues/chains |
| `MMCIFParserUtils` | Parse mmCIF/CIF format |
| `ComponentAnalyzer` | Identify ligands, waters, ions, metals in a structure |
| `ProteinPreparer` | Remove heteroatoms, add missing hydrogens, fix missing residues |
| `LigandPreparer` | Add hydrogens, generate 3D coordinates, optimize geometry |
| `smiles_lookup` | SMILES validation and structure lookup |

---

## Gateway API Reference

### Job management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/submit/{job_type}` | Submit a new job |
| `GET` | `/api/jobs/stream/{job_id}` | SSE progress stream |
| `GET` | `/api/jobs/list` | List all jobs |
| `GET` | `/api/jobs/{job_id}` | Get job details |
| `POST` | `/api/jobs/{job_id}/cancel` | Cancel a running job |
| `DELETE` | `/api/jobs/{job_id}` | Delete a job record |
| `POST` | `/api/jobs/resume/md/{job_id}` | Resume MD job from preview checkpoint |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Gateway health |
| `GET` | `/api/services/health` | Health of all downstream services |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CELERY_BROKER_URL` | `amqp://ligandx:ligandx@rabbitmq:5672/` | RabbitMQ broker |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/0` | Redis result store |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

---

## Service-Specific Documentation

- [ABFE_SERVICE.md](./ABFE_SERVICE.md) — Absolute Binding Free Energy
- [RBFE_SERVICE.md](./RBFE_SERVICE.md) — Relative Binding Free Energy
- [DOCKING_SERVICE.md](./DOCKING_SERVICE.md) — Molecular Docking
- [MD_SERVICE.md](./MD_SERVICE.md) — MD Optimization
