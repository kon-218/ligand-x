# Docker Cleanup Guide

This guide explains how to prevent Docker from consuming excessive disk space.

## Quick Start

### Manual Cleanup

Run the cleanup script manually:
```bash
./docker-cleanup.sh
```

### Automated Cleanup (Recommended)

Set up a systemd timer to run cleanup automatically:

```bash
# Copy service and timer files to systemd directory
sudo cp docker-cleanup.service docker-cleanup.timer /etc/systemd/system/

# Enable and start the timer
sudo systemctl daemon-reload
sudo systemctl enable docker-cleanup.timer
sudo systemctl start docker-cleanup.timer

# Check timer status
sudo systemctl status docker-cleanup.timer

# View next run time
sudo systemctl list-timers docker-cleanup.timer
```

The timer is configured to run **every Sunday at 2 AM** with a randomized delay.

### Alternative: Cron Job

If you prefer cron, add this to your crontab:
```bash
crontab -e
```

Add this line (runs every Sunday at 2 AM):
```
0 2 * * 0 /home/konstantin-nomerotski/Documents/app/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
```

## What Gets Cleaned

The cleanup script safely removes:

1. **Stopped containers** - Containers that have exited
2. **Dangling images** - Untagged images (usually from rebuilds)
3. **Build cache older than 24 hours** - Old build layers
4. **Unused images older than 7 days** - Images not used by any container
5. **Unused volumes** - Volumes not attached to any container

**Important:** Named volumes (like `qc_data`, `qc_results_db`, `msa_cache`) are preserved as long as they're defined in `docker-compose.yml`.

## Docker Build Cache Management

### Limit Build Cache Size

To prevent build cache from growing too large, configure Docker daemon:

1. Edit Docker daemon configuration:
```bash
sudo nano /etc/docker/daemon.json
```

2. Add these settings:
```json
{
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "20GB"
    }
  }
}
```

3. Restart Docker:
```bash
sudo systemctl restart docker
```

This limits build cache to 20GB and automatically prunes when exceeded.

### Manual Build Cache Pruning

If you need to free space immediately:

```bash
# Remove all build cache
docker builder prune -a -f

# Remove build cache older than 24 hours
docker builder prune --filter "until=24h" -f
```

## Best Practices

### 1. Use Multi-Stage Builds
Your Dockerfiles already use multi-stage builds, which helps reduce image size.

### 2. Use .dockerignore
The `.dockerignore` file reduces build context size, which reduces build cache.

### 3. Regular Cleanup
- Run cleanup weekly (automated via timer)
- Run cleanup after major rebuilds
- Monitor disk usage: `df -h /`

### 4. Monitor Docker Usage
Check Docker resource usage regularly:
```bash
docker system df
```

### 5. Clean Up After Rebuilds
After rebuilding all images:
```bash
# Remove old images (keeps current ones)
docker image prune -a --filter "until=24h" -f

# Remove all build cache
docker builder prune -a -f
```

## Emergency Cleanup

If you run out of space and need aggressive cleanup:

```bash
# WARNING: This removes ALL unused resources, including images
docker system prune -a --volumes -f
```

Or use the emergency script:
```bash
./emergency-docker-cleanup.sh
```

## Monitoring Disk Usage

Set up disk usage monitoring:

```bash
# Check disk usage
df -h /

# Check Docker usage
docker system df

# Check largest Docker images
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | sort -k3 -h -r | head -10
```

## Troubleshooting

### Build Cache Still Too Large

1. Check current build cache size:
```bash
docker system df
```

2. Manually prune:
```bash
docker builder prune -a -f
```

3. Configure build cache limit (see above).

### Cleanup Script Not Running

1. Check timer status:
```bash
sudo systemctl status docker-cleanup.timer
```

2. Check service logs:
```bash
sudo journalctl -u docker-cleanup.service
```

3. Test script manually:
```bash
./docker-cleanup.sh
```

## Additional Resources

- [Docker System Prune Documentation](https://docs.docker.com/engine/reference/commandline/system_prune/)
- [Docker Build Cache](https://docs.docker.com/build/cache/)
- [Docker Daemon Configuration](https://docs.docker.com/engine/reference/commandline/dockerd/#daemon-configuration-file)

