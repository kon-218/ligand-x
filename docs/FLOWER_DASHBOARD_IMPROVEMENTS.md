# Flower Dashboard Improvements

## Overview
Enhanced the Celery Flower monitoring dashboard with better worker names and queue visualization.

## Changes Made

### 1. Worker Naming (entrypoint.sh)
Added meaningful hostnames to all Celery workers so they display clearly in Flower:

- **worker-qc**: QC calculations (Quantum Chemistry with ORCA)
  - Queues: `qc`
  - Concurrency: 2 (configurable via `CELERY_CONCURRENCY`)

- **worker-gpu**: GPU-accelerated calculations (MD, ABFE, RBFE, Boltz2)
  - Queues: `gpu-short`, `gpu-long`
  - Concurrency: 2 (configurable via `GPU_WORKER_CONCURRENCY`)

- **worker-cpu**: CPU batch docking
  - Queues: `cpu`
  - Concurrency: 4 (configurable via `CPU_WORKER_CONCURRENCY`)

### 2. Flower Configuration (flower_config.py)
Created a new configuration file with:

- **Queue definitions**: Explicit list of all queues for dashboard visualization
- **Persistent storage**: Task history retained across restarts
- **Worker pool info**: Shows detailed worker status and capabilities
- **Task tracking**: Displays task arguments and results
- **Real-time updates**: 5-second refresh interval

### 3. Docker Compose Updates (docker-compose.yml)
Enhanced Flower service with:

- Environment variables for persistent storage and UI settings
- Volume mount for flower_config.py
- URL prefix for better integration
- Improved healthcheck

## How to Use

### Accessing Flower Dashboard
1. Navigate to `http://localhost:5555`
2. Login with credentials (default: admin/admin)
3. You'll now see:
   - **Workers tab**: Lists all workers with clear names (worker-qc, worker-gpu, worker-cpu)
   - **Queues tab**: Shows all available queues with task counts
   - **Tasks tab**: Real-time task execution with status updates
   - **Pool tab**: Worker pool information and capabilities

### Worker Display
Instead of cryptic IDs like `c8a1c9f0d3c2c2a2`, you'll see:
- `worker-qc@<hostname>`
- `worker-gpu@<hostname>`
- `worker-cpu@<hostname>`

### Queue Monitoring
The dashboard now displays:
- **qc**: Quantum chemistry tasks
- **gpu-short**: Fast GPU tasks (MD, ABFE, RBFE, Boltz2)
- **gpu-long**: Long-running GPU tasks
- **cpu**: Batch docking tasks

Each queue shows:
- Number of active tasks
- Number of queued tasks
- Worker assignments

## Deployment

### Rebuild and Restart
```bash
# Rebuild containers with new entrypoint
docker compose build --no-cache gateway worker-qc worker-gpu worker-cpu

# Restart services
docker compose up -d
```

### Verify Changes
1. Check Flower dashboard at http://localhost:5555
2. Workers should now display as `worker-qc`, `worker-gpu`, `worker-cpu`
3. Queues tab should show all 4 queues with task counts
4. Task history should persist across restarts

## Configuration

### Adjust Worker Concurrency
Edit `docker-compose.yml` environment variables:

```yaml
# GPU worker concurrency (default: 2)
GPU_WORKER_CONCURRENCY: 2

# CPU worker concurrency (default: 4)
CPU_WORKER_CONCURRENCY: 4

# QC worker concurrency (default: 2)
CELERY_CONCURRENCY: 2
```

### Adjust GPU Worker Queues
To run only short jobs on GPU worker:
```yaml
GPU_WORKER_QUEUES: gpu-short
```

To run only long jobs:
```yaml
GPU_WORKER_QUEUES: gpu-long
```

## Benefits

✅ **Clear Worker Identification**: Easy to identify which worker is handling which job type
✅ **Queue Visibility**: See all queues and their task counts at a glance
✅ **Task History**: Persistent storage of completed tasks for analysis
✅ **Real-time Monitoring**: 5-second refresh rate for live updates
✅ **Better Debugging**: Easier to troubleshoot job routing and worker issues

## Notes

- Worker names use `@%h` format which includes the container hostname
- Queue names are automatically discovered from worker configuration
- Flower 2.0 provides a modern UI with better performance
- Task history is stored in memory (persists until Flower restart)
- For production, consider using a persistent backend for task history
