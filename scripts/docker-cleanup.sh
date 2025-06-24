#!/bin/bash
# Regular Docker Cleanup Script
# This script performs safe, regular cleanup of Docker resources
# Run this periodically (e.g., weekly) to prevent disk space issues

set -e

echo "=== Docker Regular Cleanup ==="
echo "Started at: $(date)"
echo ""

# Check disk usage before cleanup
echo "Disk usage before cleanup:"
df -h / | tail -1
echo ""

# Show current Docker resource usage
echo "Current Docker resource usage:"
docker system df
echo ""

# 1. Remove stopped containers (safe)
echo "Step 1: Removing stopped containers..."
STOPPED_CONTAINERS=$(docker ps -a -q -f status=exited)
if [ -n "$STOPPED_CONTAINERS" ]; then
    docker container prune -f
    echo "✓ Removed stopped containers"
else
    echo "✓ No stopped containers to remove"
fi
echo ""

# 2. Remove dangling images (safe - these are untagged)
echo "Step 2: Removing dangling images..."
docker image prune -f
echo "✓ Removed dangling images"
echo ""

# 3. Remove build cache older than 24 hours (safe)
echo "Step 3: Removing build cache older than 24 hours..."
docker builder prune --filter "until=24h" -f
echo "✓ Removed old build cache"
echo ""

# 4. Remove unused images older than 7 days (safe if not in use)
echo "Step 4: Removing unused images older than 7 days..."
docker image prune -a --filter "until=168h" -f
echo "✓ Removed old unused images"
echo ""

# 5. Remove unused volumes (be careful - only removes volumes not used by any container)
echo "Step 5: Removing unused volumes..."
docker volume prune -f
echo "✓ Removed unused volumes"
echo ""

# Show disk usage after cleanup
echo "Disk usage after cleanup:"
df -h / | tail -1
echo ""

# Show Docker resource usage after cleanup
echo "Docker resource usage after cleanup:"
docker system df
echo ""

echo "=== Cleanup Complete ==="
echo "Finished at: $(date)"
