#!/bin/bash
# Emergency Docker Container Cleanup Script
# Use this when docker compose down fails with "permission denied"

set -e

echo "=== Emergency Docker Cleanup ==="
echo ""

echo "Step 1: Stopping Docker services..."
sudo systemctl stop docker.socket
sudo systemctl stop docker

echo ""
echo "Step 2: Killing orphaned containerd-shim processes..."
sudo killall docker-containerd-shim 2>/dev/null || echo "No shim processes found"

echo ""
echo "Step 3: Restarting Docker daemon..."
sudo systemctl restart docker

echo ""
echo "Step 4: Checking for stuck containers..."
docker ps -a

echo ""
echo "Step 5: Force removing any stuck containers..."
docker container prune -f

echo ""
echo "Step 6: Cleaning up Docker resources..."
docker system prune --all --volumes -f

echo ""
echo "=== Cleanup Complete ==="
echo "You can now try 'docker compose up -d' again"
