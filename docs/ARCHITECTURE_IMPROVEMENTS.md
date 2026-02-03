# Ligand-X Architecture Improvements Plan

**Created:** January 11, 2026  
**Priority Issues:** Docker Image Bloat, Shared Volume Complexity, Workflow Concurrency

---

## Executive Summary

This document outlines a phased approach to address three critical architectural issues:

1. **Docker Image Bloat** - Single 10GB+ image contains all environments
2. **Shared Volume Complexity** - Host path mounts create production deployment issues
3. **Workflow Concurrency** - Long-running jobs (MD, ABFE, RBFE) block FastAPI workers and compete for GPU

---

## Phase 1: Multi-Stage Dockerfile (Image Bloat)

### Current Problem

```dockerfile
# Current: ALL environments built in one image
RUN for env_file in /app/environments/*.yml; do \
    mamba env create -f "$env_file"; \
done
```

**Impact:**
- Every service container is ~10GB+
- Changing `admet.yml` rebuilds ALL environments
- `ketcher` service carries `boltz2` GPU dependencies

### Solution: Targeted Build Stages

Create service-specific build targets in `Dockerfile.backend`:

```dockerfile
# ============================================================
# Stage 1: Base System (shared by all)
# ============================================================
FROM condaforge/miniforge3 AS base
WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential libgl1 curl openmpi-bin libopenmpi-dev \
    && rm -rf /var/lib/apt/lists/*

ENV LD_LIBRARY_PATH=/usr/lib/openmpi/lib:${LD_LIBRARY_PATH:-}

# Copy shared library code
COPY lib/ /app/lib/
COPY package.json /app/package.json

# ============================================================
# Stage 2: Environment-Specific Layers
# ============================================================

# --- Lightweight Services (base env only) ---
FROM base AS env-base
COPY environments/base.yml .
RUN mamba env create -f base.yml && mamba clean -afy

# --- Docking Environment ---
FROM base AS env-docking
COPY environments/docking.yml .
RUN mamba env create -f docking.yml && mamba clean -afy

# --- MD/ABFE/RBFE Environment (GPU-heavy) ---
FROM base AS env-md
COPY environments/md.yml .
RUN mamba env create -f md.yml && mamba clean -afy

# --- ADMET Environment ---
FROM base AS env-admet
COPY environments/admet.yml .
RUN mamba env create -f admet.yml && mamba clean -afy

# --- Boltz2 Environment (GPU + PyTorch) ---
FROM base AS env-boltz2
COPY environments/boltz2.yml .
RUN mamba env create -f boltz2.yml && mamba clean -afy

# --- QC Environment (Celery + ORCA) ---
FROM base AS env-qc
COPY environments/qc.yml .
RUN mamba env create -f qc.yml && mamba clean -afy

# ============================================================
# Stage 3: Final Service Images
# ============================================================

# --- Gateway ---
FROM env-base AS service-gateway
COPY gateway/ /app/gateway/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- Structure/Alignment/Ketcher/MSA (lightweight) ---
FROM env-base AS service-structure
COPY services/structure/ /app/services/structure/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

FROM env-base AS service-alignment
COPY services/alignment/ /app/services/alignment/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

FROM env-base AS service-ketcher
COPY services/ketcher/ /app/services/ketcher/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

FROM env-base AS service-msa
COPY services/msa/ /app/services/msa/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- Docking ---
FROM env-docking AS service-docking
COPY services/docking/ /app/services/docking/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- MD ---
FROM env-md AS service-md
COPY services/md/ /app/services/md/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- ABFE (uses MD environment) ---
FROM env-md AS service-abfe
COPY services/abfe/ /app/services/abfe/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- RBFE (uses MD environment) ---
FROM env-md AS service-rbfe
COPY services/rbfe/ /app/services/rbfe/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- ADMET ---
FROM env-admet AS service-admet
COPY services/admet/ /app/services/admet/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- Boltz2 ---
FROM env-boltz2 AS service-boltz2
COPY services/boltz2/ /app/services/boltz2/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- QC API ---
FROM env-qc AS service-qc
COPY services/qc/ /app/services/qc/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

# --- Celery Workers ---
FROM env-qc AS worker-qc
COPY services/qc/ /app/services/qc/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

FROM env-md AS worker-gpu
COPY services/md/ /app/services/md/
COPY services/abfe/ /app/services/abfe/
COPY services/rbfe/ /app/services/rbfe/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

FROM env-docking AS worker-docking
COPY services/docking/ /app/services/docking/
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
```

### Updated docker-compose.yml (Build Targets)

```yaml
services:
  gateway:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: service-gateway  # Only builds base env
    command: [ "gateway" ]
    # ...

  structure:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: service-structure  # Only builds base env (~1.5GB)
    command: [ "structure", "8001" ]

  docking:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: service-docking  # Only builds docking env (~2GB)
    command: [ "docking", "8002" ]

  md:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: service-md  # Only builds MD env (~4GB)
    command: [ "md", "8003" ]
```

### Expected Image Sizes

| Service | Current | After Refactor |
|---------|---------|----------------|
| gateway | ~10GB | ~1.5GB |
| structure | ~10GB | ~1.5GB |
| ketcher | ~10GB | ~1.5GB |
| docking | ~10GB | ~2.5GB |
| md/abfe/rbfe | ~10GB | ~4GB |
| boltz2 | ~10GB | ~6GB |
| qc | ~10GB | ~2.5GB |

---

## Phase 2: Shared Volume Simplification

### Current Problem

```yaml
volumes:
  - ./services:/app/services  # Host mount - won't exist in production
  - ./lib:/app/lib            # Host mount - creates race conditions
  - ./data/docking_outputs:/app/data/docking_outputs  # Mixed concerns
```

**Issues:**
- Host mounts require source code on production servers
- Multiple services writing to shared paths can cause race conditions
- No isolation between service data

### Solution: Named Volumes + Object Storage Pattern

#### 1. Replace Host Mounts with Named Volumes

```yaml
volumes:
  # Persistent data volumes (named, managed by Docker)
  molecular_data:      # Shared molecular structures
  docking_outputs:     # Docking results
  md_outputs:          # MD simulation outputs
  abfe_outputs:        # ABFE calculation outputs
  rbfe_outputs:        # RBFE calculation outputs
  qc_jobs:             # QC job working directories
  qc_results:          # QC results database
  msa_cache:           # MSA cache (already exists)
  boltz_outputs:       # Boltz2 outputs
  postgres_data:       # PostgreSQL persistent storage

services:
  docking:
    volumes:
      - docking_outputs:/app/data/docking_outputs
      # Remove: - ./services:/app/services (baked into image)
      # Remove: - ./lib:/app/lib (baked into image)

  md:
    volumes:
      - md_outputs:/app/data/md_outputs
      - molecular_data:/app/data/molecular_data:ro  # Read-only shared access
```

#### 2. Implement Claim Check Pattern for Large Files

Instead of passing PDB/trajectory data through HTTP:

```python
# lib/common/blob_store.py
import os
from pathlib import Path
from typing import Optional
import hashlib
import json

class BlobStore:
    """
    Simple file-based blob storage for molecular data.
    Can be upgraded to MinIO/S3 for production.
    """
    
    def __init__(self, base_path: str = "/app/data/molecular_data"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def store(self, data: bytes, extension: str = "pdb") -> str:
        """Store blob and return blob_id."""
        blob_id = hashlib.sha256(data).hexdigest()[:16]
        blob_path = self.base_path / f"{blob_id}.{extension}"
        blob_path.write_bytes(data)
        return blob_id
    
    def retrieve(self, blob_id: str, extension: str = "pdb") -> Optional[bytes]:
        """Retrieve blob by ID."""
        blob_path = self.base_path / f"{blob_id}.{extension}"
        if blob_path.exists():
            return blob_path.read_bytes()
        return None
    
    def get_path(self, blob_id: str, extension: str = "pdb") -> Optional[Path]:
        """Get filesystem path for blob (for services that need file paths)."""
        blob_path = self.base_path / f"{blob_id}.{extension}"
        if blob_path.exists():
            return blob_path
        return None
```

#### 3. Service Communication via Blob IDs

```python
# Before: Passing full PDB data in request
@router.post("/dock")
async def dock(request: DockingRequest):
    protein_pdb = request.protein_pdb_data  # Could be 10MB+
    # ...

# After: Passing blob reference
@router.post("/dock")
async def dock(request: DockingRequest):
    blob_store = BlobStore()
    protein_path = blob_store.get_path(request.protein_blob_id, "pdb")
    if not protein_path:
        raise HTTPException(404, "Protein structure not found")
    # ...
```

---

## Phase 3: Celery-Based Workflow Concurrency

### Current Problem

```python
# services/md/routers.py - Current synchronous approach
@router.post("/optimize")
async def optimize(request: MDRequest):
    # This blocks the FastAPI worker for 20+ minutes!
    result = call_service_with_progress('md', input_data, timeout=3600)
    return result
```

**Issues:**
- FastAPI workers are blocked during long simulations
- HTTP connections timeout before jobs complete
- Multiple GPU jobs compete for same GPU memory
- No job persistence across service restarts

### Solution: Unified Celery Task Queue

#### 1. Create Unified Task Module

```python
# lib/tasks/gpu_tasks.py
"""
Celery tasks for GPU-intensive computations.
All GPU tasks run on dedicated workers with concurrency=1.
"""

from celery import Celery
from typing import Dict, Any
import os

# Shared Celery app configuration
celery_app = Celery(
    'ligandx_tasks',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/0'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
)

celery_app.conf.update(
    task_track_started=True,
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    # Route tasks to specific queues
    task_routes={
        'ligandx_tasks.md_optimize': {'queue': 'gpu'},
        'ligandx_tasks.abfe_calculate': {'queue': 'gpu'},
        'ligandx_tasks.rbfe_calculate': {'queue': 'gpu'},
        'ligandx_tasks.boltz_predict': {'queue': 'gpu'},
        'ligandx_tasks.docking_batch': {'queue': 'cpu'},
        'ligandx_tasks.qc_calculate': {'queue': 'qc'},
    }
)

@celery_app.task(bind=True, name='ligandx_tasks.md_optimize')
def md_optimize(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run MD optimization as background task.
    
    This task runs on a GPU worker with concurrency=1,
    ensuring only one MD job uses the GPU at a time.
    """
    from lib.services.runner import call_service
    
    job_id = self.request.id
    
    # Update task state for progress tracking
    self.update_state(state='RUNNING', meta={'progress': 0, 'stage': 'Starting'})
    
    try:
        result = call_service('md', job_data, timeout=7200)  # 2 hour timeout
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'result': result
        }
    except Exception as e:
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'error': str(e)
        }

@celery_app.task(bind=True, name='ligandx_tasks.abfe_calculate')
def abfe_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """Run ABFE calculation as background task."""
    from lib.services.runner import call_service
    
    job_id = self.request.id
    self.update_state(state='RUNNING', meta={'progress': 0, 'stage': 'Starting ABFE'})
    
    try:
        result = call_service('abfe', job_data, timeout=86400)  # 24 hour timeout
        return {'status': 'COMPLETED', 'job_id': job_id, 'result': result}
    except Exception as e:
        return {'status': 'FAILED', 'job_id': job_id, 'error': str(e)}

@celery_app.task(bind=True, name='ligandx_tasks.rbfe_calculate')
def rbfe_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """Run RBFE calculation as background task."""
    from lib.services.runner import call_service
    
    job_id = self.request.id
    self.update_state(state='RUNNING', meta={'progress': 0, 'stage': 'Starting RBFE'})
    
    try:
        result = call_service('rbfe', job_data, timeout=86400)
        return {'status': 'COMPLETED', 'job_id': job_id, 'result': result}
    except Exception as e:
        return {'status': 'FAILED', 'job_id': job_id, 'error': str(e)}

@celery_app.task(bind=True, name='ligandx_tasks.docking_batch')
def docking_batch(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """Run batch docking as background task (CPU-bound)."""
    from lib.services.runner import call_service
    
    job_id = self.request.id
    ligands = job_data.get('ligands', [])
    results = []
    
    for i, ligand in enumerate(ligands):
        self.update_state(
            state='RUNNING',
            meta={'progress': int((i / len(ligands)) * 100), 'current_ligand': i + 1}
        )
        single_job = {**job_data, 'ligand': ligand}
        result = call_service('docking', single_job, timeout=600)
        results.append(result)
    
    return {'status': 'COMPLETED', 'job_id': job_id, 'results': results}
```

#### 2. Update Service Routers to Submit Tasks

```python
# services/md/routers.py - Updated async approach
from lib.tasks.gpu_tasks import md_optimize

@router.post("/optimize")
async def optimize(request: MDRequest):
    """Submit MD optimization job (returns immediately)."""
    job_data = {
        'protein_pdb_data': request.protein_pdb_data,
        'ligand_smiles': request.ligand_smiles,
        'system_id': request.system_id,
        # ...
    }
    
    # Submit to Celery (returns immediately)
    task = md_optimize.delay(job_data)
    
    return {
        'job_id': task.id,
        'status': 'SUBMITTED',
        'message': 'Job submitted to queue'
    }

@router.get("/status/{job_id}")
async def get_status(job_id: str):
    """Get job status and progress."""
    from lib.tasks.gpu_tasks import celery_app
    
    result = celery_app.AsyncResult(job_id)
    
    if result.state == 'PENDING':
        return {'status': 'PENDING', 'progress': 0}
    elif result.state == 'RUNNING':
        return {'status': 'RUNNING', **result.info}
    elif result.state == 'SUCCESS':
        return {'status': 'COMPLETED', 'result': result.result}
    else:
        return {'status': 'FAILED', 'error': str(result.result)}
```

#### 3. Add Dedicated Workers to docker-compose.yml

```yaml
services:
  # ... existing services ...

  # GPU Worker (concurrency=1 to prevent GPU memory conflicts)
  worker-gpu:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: worker-gpu
    command: >
      celery -A lib.tasks.gpu_tasks worker
      --queues=gpu
      --concurrency=1
      --loglevel=info
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - DATABASE_URL=postgresql://ligandx:ligandx@postgres:5432/ligandx
    volumes:
      - md_outputs:/app/data/md_outputs
      - abfe_outputs:/app/data/abfe_outputs
      - rbfe_outputs:/app/data/rbfe_outputs
      - molecular_data:/app/data/molecular_data:ro
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all  # Use all available GPUs (typically 1)
              capabilities: [gpu]
    depends_on:
      - redis
      - postgres

  # CPU Worker (use all available cores minus 2 for system)
  worker-cpu:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: worker-docking
    command: >
      celery -A lib.tasks.gpu_tasks worker
      --queues=cpu
      --concurrency=${CPU_WORKER_CONCURRENCY:-4}
      --loglevel=info
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - DATABASE_URL=postgresql://ligandx:ligandx@postgres:5432/ligandx
    volumes:
      - docking_outputs:/app/data/docking_outputs
      - molecular_data:/app/data/molecular_data:ro
    depends_on:
      - redis
      - postgres

  # QC Worker
  worker-qc:
    build:
      context: .
      dockerfile: Dockerfile.backend
      target: worker-qc
    command: >
      celery -A lib.tasks.gpu_tasks worker
      --queues=qc
      --concurrency=2
      --loglevel=info
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CELERY_RESULT_BACKEND=redis://redis:6379/0
      - DATABASE_URL=postgresql://ligandx:ligandx@postgres:5432/ligandx
      - ORCA_PATH=/opt/orca/orca
    volumes:
      - qc_jobs:/app/data/qc_jobs
      - qc_results:/app/data/qc_results
      - ${ORCA_HOST_PATH:-/home/konstantin-nomerotski/orca_6_1_0}:/opt/orca
    depends_on:
      - redis
      - postgres

  # PostgreSQL for persistent job results
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=ligandx
      - POSTGRES_PASSWORD=ligandx
      - POSTGRES_DB=ligandx
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ligandx"]
      interval: 5s
      timeout: 5s
      retries: 5
```

---

## Implementation Roadmap

### Week 1: Multi-Stage Dockerfile

| Day | Task |
|-----|------|
| 1 | Create new `Dockerfile.backend.staged` with all stages |
| 2 | Test building individual targets locally |
| 3 | Update `docker-compose.yml` to use build targets |
| 4 | Verify all services start correctly |
| 5 | Measure image sizes, document improvements |

### Week 2: Volume Simplification

| Day | Task |
|-----|------|
| 1 | Create `BlobStore` class in `lib/common/` |
| 2 | Add `molecular_data` volume to compose |
| 3 | Update structure service to use BlobStore |
| 4 | Update docking/MD services to accept blob_ids |
| 5 | Remove host mounts from compose, test |

### Week 3: Celery Integration

| Day | Task |
|-----|------|
| 1 | Create `lib/tasks/gpu_tasks.py` with task definitions |
| 2 | Update MD router to submit tasks |
| 3 | Update ABFE/RBFE routers to submit tasks |
| 4 | Add worker containers to compose |
| 5 | Update frontend to poll job status |

### Week 4: Testing & Documentation

| Day | Task |
|-----|------|
| 1-2 | End-to-end testing of all workflows |
| 3 | Performance benchmarking |
| 4 | Update deployment documentation |
| 5 | Create rollback plan |

---

## Rollback Strategy

Each phase can be rolled back independently:

1. **Dockerfile**: Keep original `Dockerfile.backend` as backup
2. **Volumes**: Host mounts can be re-added to compose
3. **Celery**: Services can fall back to synchronous mode

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Total image size (all services) | ~120GB | ~25GB |
| Build time (single service change) | 45 min | 5 min |
| MD job startup latency | 0s (blocking) | <1s (async) |
| GPU utilization conflicts | Frequent | None |
| Production deployment complexity | High (host mounts) | Low (named volumes) |

---

## Files to Create/Modify

### New Files
- `Dockerfile.backend.staged` → Replace `Dockerfile.backend`
- `lib/common/blob_store.py`
- `lib/tasks/gpu_tasks.py`
- `lib/tasks/__init__.py`
- `lib/db/__init__.py`
- `lib/db/job_repository.py`
- `gateway/routers/jobs.py`
- `migrations/001_create_jobs.sql`
- `docker-compose.override.yml`

### Modified Files
- `docker-compose.yml` (build targets, volumes, workers, postgres)
- `services/md/routers.py` (async task submission)
- `services/abfe/routers.py` (async task submission)
- `services/rbfe/routers.py` (async task submission)
- `services/docking/routers.py` (batch task submission)
- `entrypoint.sh` (add celery worker modes)
- `gateway/main.py` (include jobs router)
- `requirements.txt` (add asyncpg)

---

## Configuration Decisions

| Decision | Choice |
|----------|--------|
| GPU Allocation | Single GPU, detect multiple if available |
| In-flight Job Data | Redis (Celery backend) |
| Completed Results | PostgreSQL (persistent) |
| Real-time Updates | SSE (keep existing pattern) |
| Development Mode | `docker-compose.override.yml` with host mounts |

---

## PostgreSQL Job Storage

### Database Schema

```sql
-- migrations/001_create_jobs.sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,  -- 'md', 'abfe', 'rbfe', 'docking', 'qc'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Input parameters (JSONB for flexibility)
    input_params JSONB NOT NULL,
    
    -- Results (populated on completion)
    result JSONB,
    error_message TEXT,
    
    -- Metadata
    user_id VARCHAR(255),  -- For future multi-user support
    molecule_name VARCHAR(255),
    
    -- Indexes for common queries
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_job_type ON jobs(job_type);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_user_id ON jobs(user_id) WHERE user_id IS NOT NULL;
```

### Job Repository

```python
# lib/db/job_repository.py
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
import asyncpg
import json

class JobRepository:
    """PostgreSQL repository for job persistence."""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool: Optional[asyncpg.Pool] = None
    
    async def connect(self):
        self.pool = await asyncpg.create_pool(self.database_url)
    
    async def close(self):
        if self.pool:
            await self.pool.close()
    
    async def create_job(
        self,
        job_id: str,
        job_type: str,
        input_params: Dict[str, Any],
        molecule_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new job record."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO jobs (id, job_type, input_params, molecule_name, status)
                VALUES ($1, $2, $3, $4, 'pending')
                RETURNING id, job_type, status, created_at
                """,
                uuid.UUID(job_id),
                job_type,
                json.dumps(input_params),
                molecule_name
            )
            return dict(row)
    
    async def update_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict] = None,
        error_message: Optional[str] = None
    ):
        """Update job status and optionally store result."""
        async with self.pool.acquire() as conn:
            if status == 'running':
                await conn.execute(
                    "UPDATE jobs SET status = $1, started_at = NOW() WHERE id = $2",
                    status, uuid.UUID(job_id)
                )
            elif status in ('completed', 'failed'):
                await conn.execute(
                    """
                    UPDATE jobs 
                    SET status = $1, completed_at = NOW(), result = $2, error_message = $3
                    WHERE id = $4
                    """,
                    status,
                    json.dumps(result) if result else None,
                    error_message,
                    uuid.UUID(job_id)
                )
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM jobs WHERE id = $1",
                uuid.UUID(job_id)
            )
            if row:
                return dict(row)
            return None
    
    async def list_jobs(
        self,
        job_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """List jobs with optional filters."""
        query = "SELECT * FROM jobs WHERE 1=1"
        params = []
        
        if job_type:
            params.append(job_type)
            query += f" AND job_type = ${len(params)}"
        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"
        
        query += f" ORDER BY created_at DESC LIMIT {limit}"
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
```

---

## SSE Integration with Celery

### SSE Endpoint for Job Progress

```python
# gateway/routers/jobs.py
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from lib.tasks.gpu_tasks import celery_app
from lib.db.job_repository import JobRepository
import asyncio
import json
import os

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# Initialize repository
job_repo = JobRepository(os.getenv('DATABASE_URL'))

@router.on_event("startup")
async def startup():
    await job_repo.connect()

@router.on_event("shutdown")
async def shutdown():
    await job_repo.close()

@router.get("/stream/{job_id}")
async def stream_job_progress(job_id: str, request: Request):
    """
    SSE endpoint for real-time job progress updates.
    
    Polls Celery task state and streams updates to frontend.
    On completion, saves result to PostgreSQL.
    """
    async def event_generator():
        last_state = None
        last_progress = -1
        
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            
            # Get task state from Celery/Redis
            result = celery_app.AsyncResult(job_id)
            
            state = result.state
            info = result.info or {}
            
            # Only send update if state changed
            if state != last_state or info.get('progress', 0) != last_progress:
                last_state = state
                last_progress = info.get('progress', 0)
                
                if state == 'PENDING':
                    data = {'status': 'pending', 'progress': 0}
                elif state == 'RUNNING':
                    data = {
                        'status': 'running',
                        'progress': info.get('progress', 0),
                        'stage': info.get('stage', ''),
                        'message': info.get('message', '')
                    }
                elif state == 'SUCCESS':
                    # Save to PostgreSQL on completion
                    await job_repo.update_status(
                        job_id, 'completed', result=result.result
                    )
                    data = {
                        'status': 'completed',
                        'progress': 100,
                        'result': result.result
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    break  # End stream on completion
                elif state == 'FAILURE':
                    error_msg = str(result.result) if result.result else 'Unknown error'
                    await job_repo.update_status(
                        job_id, 'failed', error_message=error_msg
                    )
                    data = {
                        'status': 'failed',
                        'error': error_msg
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    break  # End stream on failure
                else:
                    data = {'status': state.lower(), 'progress': 0}
                
                yield f"data: {json.dumps(data)}\n\n"
            
            await asyncio.sleep(0.5)  # Poll every 500ms
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )

@router.post("/submit/{job_type}")
async def submit_job(job_type: str, request: Request):
    """Submit a new job to the appropriate queue."""
    from lib.tasks.gpu_tasks import md_optimize, abfe_calculate, rbfe_calculate, docking_batch
    
    body = await request.json()
    
    # Map job types to tasks
    task_map = {
        'md': md_optimize,
        'abfe': abfe_calculate,
        'rbfe': rbfe_calculate,
        'docking': docking_batch,
    }
    
    if job_type not in task_map:
        return {"error": f"Unknown job type: {job_type}"}, 400
    
    # Submit to Celery
    task = task_map[job_type].delay(body)
    
    # Create job record in PostgreSQL
    await job_repo.create_job(
        job_id=task.id,
        job_type=job_type,
        input_params=body,
        molecule_name=body.get('molecule_name')
    )
    
    return {
        "job_id": task.id,
        "status": "submitted",
        "stream_url": f"/api/jobs/stream/{task.id}"
    }

@router.get("/list")
async def list_jobs(job_type: Optional[str] = None, status: Optional[str] = None):
    """List jobs from PostgreSQL."""
    jobs = await job_repo.list_jobs(job_type=job_type, status=status)
    return {"jobs": jobs}

@router.get("/{job_id}")
async def get_job(job_id: str):
    """Get job details from PostgreSQL."""
    job = await job_repo.get_job(job_id)
    if not job:
        return {"error": "Job not found"}, 404
    return job
```

---

## Development Override File

### docker-compose.override.yml

```yaml
# docker-compose.override.yml
# This file is automatically loaded by docker-compose in development
# It adds host mounts for hot-reloading during development

version: '3.8'

services:
  gateway:
    volumes:
      - ./gateway:/app/gateway
      - ./lib:/app/lib

  structure:
    volumes:
      - ./services/structure:/app/services/structure
      - ./lib:/app/lib

  docking:
    volumes:
      - ./services/docking:/app/services/docking
      - ./lib:/app/lib

  md:
    volumes:
      - ./services/md:/app/services/md
      - ./lib:/app/lib

  admet:
    volumes:
      - ./services/admet:/app/services/admet
      - ./lib:/app/lib

  boltz2:
    volumes:
      - ./services/boltz2:/app/services/boltz2
      - ./lib:/app/lib

  qc:
    volumes:
      - ./services/qc:/app/services/qc
      - ./lib:/app/lib

  alignment:
    volumes:
      - ./services/alignment:/app/services/alignment
      - ./lib:/app/lib

  ketcher:
    volumes:
      - ./services/ketcher:/app/services/ketcher
      - ./lib:/app/lib

  msa:
    volumes:
      - ./services/msa:/app/services/msa
      - ./lib:/app/lib

  abfe:
    volumes:
      - ./services/abfe:/app/services/abfe
      - ./lib:/app/lib

  rbfe:
    volumes:
      - ./services/rbfe:/app/services/rbfe
      - ./lib:/app/lib

  worker-gpu:
    volumes:
      - ./services:/app/services
      - ./lib:/app/lib

  worker-cpu:
    volumes:
      - ./services:/app/services
      - ./lib:/app/lib

  worker-qc:
    volumes:
      - ./services:/app/services
      - ./lib:/app/lib

  # Expose PostgreSQL for local debugging
  postgres:
    ports:
      - "5432:5432"

  # Expose Redis for local debugging
  redis:
    ports:
      - "6379:6379"
```

### Production Compose (No Override)

```bash
# Development (auto-loads override)
docker-compose up

# Production (explicitly skip override)
docker-compose -f docker-compose.yml up

# Or rename override file when deploying
mv docker-compose.override.yml docker-compose.override.yml.dev
```
