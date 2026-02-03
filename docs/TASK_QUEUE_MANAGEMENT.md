# Task Queue Management

## Problem

When you restart your computer and rebuild containers with `make dev`, interrupted workflows were restarting automatically without user approval. This happened because:

1. **Durable Queues**: RabbitMQ queues persisted across restarts (`task_queue_durable=True`)
2. **Persistent Messages**: Messages were saved to disk and redelivered on restart
3. **Persistent Volumes**: Docker volumes (`rabbitmq_data`, `redis_data`) preserved state

## Solution

We've implemented **environment-aware queue configuration** that separates development and production behavior:

### Development Mode (LOG_LEVEL=DEBUG or NODE_ENV=development)
- **Non-durable queues**: Don't survive broker restart
- **Auto-delete queues**: Removed when last consumer disconnects
- **No Redis persistence**: Disabled RDB/AOF snapshots
- **Result**: Clean slate on every restart - no task redelivery

### Production Mode (default)
- **Durable queues**: Survive broker restart
- **Persistent queues**: Don't auto-delete
- **Redis persistence**: Enabled for fault tolerance
- **Result**: Fault-tolerant task processing

## How It Works

The configuration detects environment using:
```python
IS_DEVELOPMENT = os.getenv('NODE_ENV', 'production') == 'development' or os.getenv('LOG_LEVEL', 'INFO') == 'DEBUG'
```

In `docker-compose.override.yml`, development services have `LOG_LEVEL=DEBUG`, which triggers non-durable queue behavior.

## Changes Made

### 1. Celery Configuration (lib/tasks/gpu_tasks.py, cpu_tasks.py, services/qc/tasks.py)
```python
# Queue durability - Development: non-durable (don't persist across restarts)
#                   Production: durable (survive broker restart)
task_queue_durable=not IS_DEVELOPMENT,
task_queue_auto_delete=IS_DEVELOPMENT,  # Auto-delete queues in dev
```

### 2. Redis Persistence Disabled (docker-compose.override.yml)
```yaml
redis:
  # Development: Disable Redis persistence
  command: redis-server --save "" --appendonly no
```

### 3. Queue Purge Script (scripts/purge-dev-queues.sh)
Manual queue cleanup utility for edge cases.

### 4. Makefile Target
```bash
make purge-queues  # Manually clear all task queues
```

## Usage

### Normal Development Workflow
```bash
# Start development environment
make dev

# ... work on tasks ...

# Restart after system reboot
make dev  # No tasks will auto-resume
```

### Manual Queue Cleanup (if needed)
```bash
# If you see old tasks running after restart:
make purge-queues

# Or use the script directly:
bash scripts/purge-dev-queues.sh
```

### Production Deployment
No changes needed - production mode uses durable queues by default:
```bash
docker-compose -f docker-compose.yml --env-file .env.production up -d
```

## Verification

### Check Queue Configuration
```bash
# Connect to RabbitMQ container
docker-compose exec rabbitmq bash

# List queues and their properties
rabbitmqadmin list queues name durable auto_delete

# Expected in development:
# name       | durable | auto_delete
# -----------|---------|-----------
# gpu-short  | False   | True
# gpu-long   | False   | True
# cpu        | False   | True
# qc         | False   | True
```

### Check Redis Persistence
```bash
# Connect to Redis container
docker-compose exec redis redis-cli

# Check configuration
CONFIG GET save
CONFIG GET appendonly

# Expected in development:
# 1) "save"
# 2) ""
# 1) "appendonly"
# 2) "no"
```

## Troubleshooting

### Old Tasks Still Running After Restart

1. **Check environment variables**:
   ```bash
   docker-compose exec worker-gpu-short printenv | grep -E 'LOG_LEVEL|NODE_ENV'
   # Should show: LOG_LEVEL=DEBUG
   ```

2. **Purge queues manually**:
   ```bash
   make purge-queues
   ```

3. **Restart services**:
   ```bash
   make down
   make dev
   ```

### Verify Queue Durability
```bash
# Check if queues are non-durable in dev
docker-compose exec rabbitmq rabbitmqadmin list queues name durable auto_delete

# All queues should show:
# durable: False
# auto_delete: True
```

## Architecture Notes

### Queue Lifecycle

**Development Mode**:
```
make dev
  ↓
Workers start → Declare non-durable queues
  ↓
Submit tasks → Tasks stored in memory only
  ↓
make down → RabbitMQ stops → Queues deleted
  ↓
make dev → Clean slate, no queues exist
```

**Production Mode**:
```
docker-compose up
  ↓
Workers start → Declare durable queues
  ↓
Submit tasks → Tasks persisted to disk
  ↓
Container restart → RabbitMQ recovers → Queues + messages restored
  ↓
Workers reconnect → Resume processing
```

### Why Not Use task_reject_on_worker_lost=True?

Setting `task_reject_on_worker_lost=True` would requeue tasks if a worker crashes, which is **not desirable** for long-running tasks:
- MD simulations (2 hours)
- RBFE calculations (24 hours)
- QC calculations (30 minutes)

If a worker crashes midway, we **don't want** to restart from scratch. Instead:
1. Task fails gracefully
2. User sees failure in UI
3. User can investigate and resubmit if needed

This gives users control rather than automatic retries that waste compute time.

## Testing Checklist

- [x] Development: Non-durable queues
- [x] Development: Auto-delete queues
- [x] Development: Redis persistence disabled
- [x] Production: Durable queues (unchanged)
- [x] Production: Redis persistence enabled (unchanged)
- [x] `make purge-queues` works
- [ ] Tasks don't restart after `make down && make dev`
- [ ] Tasks DO restart in production after container restart

## References

- Celery Documentation: https://docs.celeryproject.org/en/stable/userguide/configuration.html#broker-transport-options
- RabbitMQ Queue Properties: https://www.rabbitmq.com/queues.html
- Redis Persistence: https://redis.io/docs/management/persistence/
