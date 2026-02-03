# Development Hot Reload Guide

## Overview

The development environment (`make dev`) is configured for hot reload on code changes. This allows you to edit code and see changes without rebuilding Docker images or restarting containers.

## What's Configured

### ✅ Backend Services (FastAPI) - Full Hot Reload

**Services**: `gateway`, `structure`, `alignment`, `ketcher`, `msa`, `docking`, `md`, `admet`, `boltz2`, `qc`, `abfe`, `rbfe`

**How it works**:
1. **Volume mounts** (docker-compose.override.yml):
   ```yaml
   md:
     volumes:
       - ./services/md:/app/services/md
       - ./lib:/app/lib
   ```

2. **Uvicorn --reload flag** (entrypoint.sh):
   - Automatically enabled when `LOG_LEVEL=DEBUG` (set in docker-compose.override.yml)
   - Watches for Python file changes and auto-restarts the service

**Usage**:
- Edit any `.py` file in `services/md/` or `lib/`
- Service detects change and restarts automatically (~1-2 seconds)
- No manual restart needed!

**Logs**:
```bash
make logs-md
# You'll see: "INFO:     Detected file change in 'services/md/service.py'. Reloading..."
```

### ✅ Frontend (Next.js) - Full Hot Reload

**Service**: `frontend`

**How it works**:
1. **Volume mount** (docker-compose.override.yml):
   ```yaml
   frontend:
     volumes:
       - ./frontend:/app
       - /app/node_modules  # Excluded (performance)
       - /app/.next         # Excluded (performance)
     environment:
       - WATCHPACK_POLLING=true  # Enable file watching
       - NODE_ENV=development
   ```

2. **Next.js dev server**:
   - Automatically watches for changes in `frontend/src/`
   - Hot Module Replacement (HMR) updates browser without refresh
   - Fast Refresh preserves component state

**Usage**:
- Edit any `.tsx`, `.ts`, `.css` file in `frontend/src/`
- Browser updates automatically (< 1 second)
- Component state preserved in most cases

### ⚠️ Celery Workers - Manual Restart Required

**Services**: `worker-qc`, `worker-gpu-short`, `worker-gpu-long`, `worker-cpu`

**How it works**:
1. **Volume mounts** (docker-compose.override.yml):
   ```yaml
   worker-gpu-short:
     volumes:
       - ./services/md:/app/services/md
       - ./lib:/app/lib
   ```

2. **No auto-reload**:
   - Celery workers don't support `--reload` flag
   - Workers must be restarted manually after code changes

**Usage**:
- Edit task code in `lib/tasks/` or service code
- Manually restart the worker:
  ```bash
  docker compose restart worker-gpu-short
  ```

**Alternative - Auto-restart (optional)**:
Install watchdog for automatic worker restarts:
```bash
# In docker-compose.override.yml, add to worker services:
worker-gpu-short:
  command: watchmedo auto-restart --directory=/app --pattern=*.py --recursive -- celery -A lib.tasks.gpu_tasks worker ...
```

## Testing Hot Reload

### Test Backend Hot Reload

1. Start development environment:
   ```bash
   make dev
   ```

2. Edit a service file:
   ```bash
   # Edit services/md/service.py and add a print statement
   echo 'print("HOT RELOAD TEST")' >> services/md/service.py
   ```

3. Watch logs:
   ```bash
   make logs-md
   # Should see: "INFO:     Detected file change... Reloading..."
   # Then see: "HOT RELOAD TEST"
   ```

4. Verify service is running:
   ```bash
   curl http://localhost:8003/health
   # Should return: {"status": "ok", "service": "md"}
   ```

### Test Frontend Hot Reload

1. Edit a React component:
   ```tsx
   // frontend/src/components/Tools/MDOptimizationTool.tsx
   // Change a text string or add console.log
   console.log("HOT RELOAD TEST")
   ```

2. Check browser console:
   - Should see new log message within 1 second
   - Page should update without full refresh

### Test Shared Library Changes

1. Edit a shared library file:
   ```bash
   # Edit lib/common/config.py
   echo '# Hot reload test' >> lib/common/config.py
   ```

2. Check logs for ALL services that mount lib:
   ```bash
   make logs-md
   make logs-gateway
   # Both should reload automatically
   ```

## What Triggers Hot Reload

### Backend (FastAPI/Uvicorn)
- ✅ Python files (`.py`) in mounted directories
- ✅ Changes in `services/*/` directories
- ✅ Changes in `lib/` directory
- ❌ Changes to `pyproject.toml` or dependencies (requires rebuild)
- ❌ Changes to environment variables (requires restart)

### Frontend (Next.js)
- ✅ TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`)
- ✅ CSS files (`.css`)
- ✅ JSON files (e.g., `package.json`)
- ❌ Changes to `next.config.js` (requires restart)
- ❌ Changes to dependencies in `package.json` (requires `bun install` + restart)

### Workers (Celery)
- ❌ No automatic reload (manual restart required)

## Performance Notes

### Backend Reload Speed
- **Typical**: 1-2 seconds for small changes
- **Large files**: 2-5 seconds
- **Shared lib changes**: Affects multiple services (3-5 seconds total)

### Frontend Reload Speed
- **HMR (component changes)**: < 1 second
- **Full page reload**: 2-3 seconds
- **First build**: 10-30 seconds (only on startup)

## Troubleshooting

### Backend Not Reloading

**Check if LOG_LEVEL=DEBUG is set**:
```bash
docker compose exec md env | grep LOG_LEVEL
# Should show: LOG_LEVEL=DEBUG
```

**Check uvicorn logs**:
```bash
make logs-md | grep reload
# Should see: "INFO:     Uvicorn running with reload enabled"
```

**Check volume mounts**:
```bash
docker compose exec md ls -la /app/services/md
# Should show your files with recent timestamps
```

**Restart service**:
```bash
docker compose restart md
```

### Frontend Not Reloading

**Check WATCHPACK_POLLING**:
```bash
docker compose exec frontend env | grep WATCHPACK
# Should show: WATCHPACK_POLLING=true
```

**Check Next.js logs**:
```bash
make logs-frontend | grep -i "fast refresh"
# Should see Fast Refresh messages
```

**Clear Next.js cache**:
```bash
docker compose exec frontend rm -rf .next
docker compose restart frontend
```

### Changes Not Reflected

**File permissions issue**:
```bash
# Check file ownership in container
docker compose exec md ls -ln /app/services/md

# Should match your UID/GID (set in .env by make dev)
cat .env | grep -E "UID|GID"
```

**Hard restart**:
```bash
make down
make dev
```

## Best Practices

1. **Small, focused changes**: Hot reload works best with incremental changes
2. **Watch logs**: Always have logs open when developing to see reload confirmations
3. **Test immediately**: Verify changes work before making more edits
4. **Restart workers**: Remember to manually restart Celery workers after task changes
5. **Use dev mode**: Never edit code in production containers (they don't have volume mounts)

## Production vs Development

| Aspect | Development (`make dev`) | Production (`make prod`) |
|--------|-------------------------|-------------------------|
| Volume mounts | ✅ Code mounted | ❌ Code baked into image |
| Hot reload | ✅ Enabled | ❌ Disabled |
| Uvicorn --reload | ✅ Yes (when LOG_LEVEL=DEBUG) | ❌ No |
| Next.js | Dev server with HMR | Optimized build |
| Resource limits | Relaxed (32GB) | Strict (2-4GB) |
| Startup time | Fast (reuses images) | Slow (needs rebuild) |

## Environment Variables

Development mode uses `docker-compose.override.yml` which sets:
- `LOG_LEVEL=DEBUG` → Enables uvicorn --reload
- `NODE_ENV=development` → Enables Next.js dev mode
- `WATCHPACK_POLLING=true` → Enables frontend file watching

These are **automatically set** by `docker-compose.override.yml` - no manual configuration needed!
