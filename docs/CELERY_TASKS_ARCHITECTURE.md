# Celery Tasks Architecture

## Overview

Ligand-X uses Celery for asynchronous job processing with separate task modules for GPU and CPU workloads.

## Task Modules

### GPU Tasks (`lib/tasks/gpu_tasks.py`)

GPU-intensive computations with single-worker concurrency:

| Task | Queue | Timeout | Description |
|------|-------|---------|-------------|
| `md_optimize` | gpu | 2 hours | Molecular dynamics optimization |
| `abfe_calculate` | gpu | 24 hours | Absolute binding free energy |
| `rbfe_calculate` | gpu | 24 hours | Relative binding free energy |
| `boltz_predict` | gpu | 1 hour | Boltz2 structure prediction |

**Configuration:**
- Concurrency: 1 (single GPU worker)
- Prefetch: 1 task at a time
- Time limit: 24 hours soft, 25 hours hard

### CPU Tasks (`lib/tasks/cpu_tasks.py`)

CPU-intensive computations with parallel concurrency:

| Task | Queue | Timeout | Description |
|------|-------|---------|-------------|
| `docking_batch` | cpu | 1 hour | Batch docking multiple ligands |
| `docking_single` | cpu | 10 minutes | Single ligand docking |

**Configuration:**
- Concurrency: 4 (configurable, multiple CPU workers)
- Prefetch: 4 tasks per worker
- Time limit: 1 hour soft, 1.08 hours hard

## Task Submission

### From Service Routers

Each service has an async endpoint:

```python
# MD Service
POST /api/md/submit_async

# ABFE Service
POST /api/abfe/submit_async

# RBFE Service
POST /api/rbfe/submit_async

# Docking Service
POST /api/docking/submit_batch_async

# Boltz2 Service
POST /api/boltz2/submit_async
```

### From Frontend

```typescript
import { useJobStore } from '@/store/job-store'

const { submitJob } = useJobStore()

// Submit and track
const jobId = await submitJob('md', {
  protein_pdb_data: pdbData,
  ligand_smiles: 'CCO',
  nvt_steps: 25000,
})
```

## Task Routing

Tasks are automatically routed to appropriate queues:

```python
task_routes = {
    # GPU tasks
    'ligandx_tasks.md_optimize': {'queue': 'gpu'},
    'ligandx_tasks.abfe_calculate': {'queue': 'gpu'},
    'ligandx_tasks.rbfe_calculate': {'queue': 'gpu'},
    'ligandx_tasks.boltz_predict': {'queue': 'gpu'},
    # CPU tasks
    'ligandx_cpu_tasks.docking_batch': {'queue': 'cpu'},
    'ligandx_cpu_tasks.docking_single': {'queue': 'cpu'},
}
```

## Worker Configuration

### GPU Worker

```bash
celery -A lib.tasks.gpu_tasks worker \
  --queue=gpu \
  --concurrency=1 \
  --loglevel=info
```

### CPU Worker

```bash
celery -A lib.tasks.cpu_tasks worker \
  --queue=cpu \
  --concurrency=4 \
  --loglevel=info
```

### Docker Compose

```yaml
worker-gpu:
  command: celery -A lib.tasks.gpu_tasks worker --queue=gpu --concurrency=1

worker-cpu:
  command: celery -A lib.tasks.cpu_tasks worker --queue=cpu --concurrency=4
```

## Progress Tracking

Tasks update progress via `update_progress()`:

```python
self.update_progress(
    progress=50,
    stage='Equilibration',
    message='Running NPT equilibration...'
)
```

Progress is streamed to frontend via SSE:

```typescript
const eventSource = api.streamJobProgress(
  jobId,
  (data) => console.log(`${data.progress}% - ${data.message}`),
  (result) => console.log('Complete:', result),
  (error) => console.error('Failed:', error)
)
```

## Result Storage

- **In-flight**: Redis (Celery broker/backend)
- **Persistent**: PostgreSQL (jobs table)

Results are automatically persisted when jobs complete.

## Error Handling

Tasks catch exceptions and return error status:

```python
{
    'status': 'FAILED',
    'job_id': '...',
    'job_type': 'md',
    'error': 'Error message',
    'completed_at': '2026-01-11T23:48:00Z'
}
```

## Monitoring

Access Flower dashboard:

```
http://localhost:5555
```

Default credentials: `admin:admin`

Features:
- Task execution history
- Worker status and statistics
- Queue inspection
- Task filtering and search

## Backward Compatibility

Legacy synchronous endpoints are preserved:

- `POST /api/md/optimize` (blocking)
- `POST /api/md/stream_optimize` (SSE)
- `POST /api/abfe/calculate` (multiprocessing)
- `POST /api/docking/batch` (synchronous)

New async endpoints coexist with legacy endpoints.
