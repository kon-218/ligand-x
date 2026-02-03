# Flower Dashboard - Quick Reference

## Access
- **URL**: http://localhost:5555
- **Default Credentials**: admin / admin
- **Port**: 5555

## Workers

| Worker | Purpose | Queues | Concurrency |
|--------|---------|--------|-------------|
| `worker-qc` | Quantum Chemistry (ORCA) | qc | 2 |
| `worker-gpu` | GPU Acceleration | gpu-short, gpu-long | 2 |
| `worker-cpu` | Batch Docking | cpu | 4 |

## Queues

| Queue | Job Types | Worker |
|-------|-----------|--------|
| `qc` | QC calculations (HOMO/LUMO, IR, Fukui, Conformer) | worker-qc |
| `gpu-short` | Fast GPU jobs (MD, ABFE, RBFE, Boltz2) | worker-gpu |
| `gpu-long` | Long-running GPU jobs (ABFE, RBFE) | worker-gpu |
| `cpu` | Batch docking | worker-cpu |

## Dashboard Tabs

### Workers
- Shows all active workers with their names
- Displays concurrency and queue assignments
- Shows active/processed/failed task counts
- Load average per worker

### Queues
- Lists all available queues
- Shows number of tasks in each queue
- Displays worker assignments per queue

### Tasks
- Real-time task execution status
- Task arguments and results
- Execution time and status
- Filter by status (active, completed, failed)

### Pool
- Worker pool information
- Process details per worker
- Resource utilization

## Common Tasks

### Monitor a Specific Job Type
1. Go to **Queues** tab
2. Find the relevant queue (e.g., `gpu-short` for MD jobs)
3. See active and queued tasks

### Check Worker Health
1. Go to **Workers** tab
2. Look for worker status (Online/Offline)
3. Check load average and task counts

### View Task Details
1. Go to **Tasks** tab
2. Click on a task to see:
   - Task arguments
   - Execution time
   - Result/Error message
   - Worker assignment

### Debug Failed Jobs
1. Go to **Tasks** tab
2. Filter by status: Failed
3. Click on failed task to see error message
4. Check which worker handled it

## Configuration

### Change Worker Concurrency
Edit `docker-compose.yml`:
```yaml
environment:
  - GPU_WORKER_CONCURRENCY=2
  - CPU_WORKER_CONCURRENCY=4
  - CELERY_CONCURRENCY=2
```

### Change GPU Worker Queues
Edit `docker-compose.yml`:
```yaml
environment:
  - GPU_WORKER_QUEUES=gpu-short,gpu-long
```

### Rebuild After Changes
```bash
docker compose build --no-cache worker-qc worker-gpu worker-cpu
docker compose up -d
```

## Troubleshooting

### Workers Not Showing
- Check if containers are running: `docker compose ps`
- Verify Redis is accessible: `docker compose logs redis`
- Check worker logs: `docker compose logs worker-qc`

### Tasks Not Processing
- Verify correct queue is being used
- Check if worker is online in Flower
- Look for error messages in task details

### Dashboard Not Updating
- Refresh browser (F5)
- Check Flower container: `docker compose logs flower`
- Verify Redis connection

## Performance Tips

- Monitor `gpu-short` and `gpu-long` queues separately to optimize job distribution
- Use `worker-cpu` for batch docking to avoid blocking GPU workers
- Check worker load average to identify bottlenecks
- Review task execution times to optimize job parameters
