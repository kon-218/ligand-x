# Ligand-X Build System Guide

## Quick Start

```bash
# Build all services (automatic disk cleanup)
make build

# Or using the script directly
./build.sh

# View all available commands
make help
```

## Features

✅ **Automatic Disk Management** - Prevents "no space left on device" errors  
✅ **Configurable** - Customize defaults without editing scripts  
✅ **Smart Cleanup** - Incremental cleanup only when needed  
✅ **CI/CD Friendly** - Environment variable support  
✅ **Easy to Use** - Simple commands with clear output  

## Configuration

### Method 1: Edit `.buildrc` (Persistent)

Edit `.buildrc` to customize defaults:

```bash
# Require only 30GB free space
MIN_DISK_SPACE_GB=30

# Allow 100GB build cache
BUILD_CACHE_LIMIT_GB=100

# Warn at 150GB threshold
WARN_DISK_SPACE_GB=150

# Disable auto-cleanup
AUTO_CLEANUP=false
```

### Method 2: Environment Variables (One-time)

Override defaults for a single build:

```bash
# Require 30GB free space
MIN_DISK_SPACE_GB=30 ./build.sh

# Via Makefile
MIN_DISK_SPACE_GB=30 make build

# Or with make build-custom
make build-custom MIN_DISK_SPACE_GB=30
```

### Method 3: Command-line Options

```bash
./build.sh --help                    # Show help
./build.sh --clean                   # Clean before build
./build.sh --no-cache                # Build without cache
./build.sh --force                   # Force build even if low on space
./build.sh gateway                   # Build specific service
./build.sh --clean --no-cache gateway # Combine options
```

## Common Tasks

### Build All Services
```bash
make build              # With auto-cleanup
make rebuild            # Full clean + rebuild
make build-nocache      # Without cache
```

### Build Specific Services
```bash
make build-gateway      # Gateway only
make build-frontend     # Frontend only
make build-services     # All backend services
make build-workers      # All Celery workers
./build.sh gateway      # Direct script usage
```

### Manage Disk Space
```bash
make status             # Show disk and Docker usage
make clean              # Safe cleanup (recommended weekly)
make prune              # Aggressive cleanup (use when low on space)
make emergency          # Emergency cleanup (use when disk full)
```

### Manage Services
```bash
make up                 # Start all services
make down               # Stop all services
make restart            # Restart all services
make logs               # Follow all logs
make logs-gateway       # Follow specific service logs
```

### Development
```bash
make shell-gateway      # Open shell in gateway
make shell-worker       # Open shell in worker
make db                 # Connect to PostgreSQL
make db-backup          # Backup database
```

## Configuration Defaults

| Setting | Default | Purpose |
|---------|---------|---------|
| `MIN_DISK_SPACE_GB` | 50 | Minimum free space required |
| `BUILD_CACHE_LIMIT_GB` | 50 | Max build cache size |
| `WARN_DISK_SPACE_GB` | 100 | Warn threshold |
| `AUTO_CLEANUP` | true | Auto-cleanup when low |
| `VERBOSE` | false | Verbose output |

## How It Works

### Build Process

1. **Check disk space** - Verify minimum free space available
2. **Auto-cleanup** (if needed) - Incrementally clean Docker resources
3. **Limit cache** - Keep build cache under limit
4. **Build** - Run docker compose build
5. **Post-cleanup** - Remove dangling images

### Cleanup Strategy

Incremental cleanup runs in this order:

1. Remove stopped containers
2. Remove dangling images
3. Remove build cache older than 24h
4. Remove unused images older than 7 days
5. Remove unused volumes
6. Aggressive cache cleanup (if still low)

## Troubleshooting

### "No space left on device" during build

```bash
# Run emergency cleanup
make emergency

# Or manually
./emergency-docker-cleanup.sh

# Then rebuild
make rebuild
```

### Build is slow

```bash
# Check disk usage
make status

# Clean up old cache
make clean

# Rebuild
make build
```

### Want to use more cache

Edit `.buildrc`:
```bash
BUILD_CACHE_LIMIT_GB=100
```

### Want stricter disk requirements

Edit `.buildrc`:
```bash
MIN_DISK_SPACE_GB=100
```

## For CI/CD

Use environment variables in your CI pipeline:

```bash
# GitHub Actions
env:
  MIN_DISK_SPACE_GB: 30
  BUILD_CACHE_LIMIT_GB: 100

# GitLab CI
variables:
  MIN_DISK_SPACE_GB: "30"
  BUILD_CACHE_LIMIT_GB: "100"

# Jenkins
withEnv(['MIN_DISK_SPACE_GB=30', 'BUILD_CACHE_LIMIT_GB=100']) {
  sh './build.sh'
}
```

## Advanced Usage

### Customize via environment

```bash
# Build with custom settings
MIN_DISK_SPACE_GB=20 \
BUILD_CACHE_LIMIT_GB=80 \
AUTO_CLEANUP=true \
./build.sh --clean gateway
```

### Monitor build progress

```bash
# Verbose output
VERBOSE=true make build

# Watch Docker resources during build
watch docker system df
```

### Rebuild without cache (nuclear option)

```bash
# Full clean + rebuild without cache
make rebuild

# Or
./build.sh --clean --no-cache
```

## Files

- `build.sh` - Main build script with auto-cleanup
- `.buildrc` - Configuration file (edit this)
- `Makefile` - Convenient commands
- `docker/buildkitd.toml` - BuildKit cache limits
- `docker-cleanup.sh` - Safe cleanup script
- `emergency-docker-cleanup.sh` - Emergency cleanup

## Tips

1. **Run `make clean` weekly** to prevent disk issues
2. **Edit `.buildrc`** to match your system's disk capacity
3. **Use `make build-custom`** for one-time overrides
4. **Check `make status`** before long builds
5. **Keep 50GB+ free** for comfortable building

## Questions?

```bash
# Show help
./build.sh --help
make help

# Check current config
grep -v '^#' .buildrc | grep '='
```
