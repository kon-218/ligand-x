#!/bin/bash
# ============================================================
# Push Images Script
# ============================================================
# Pushes tagged images to container registry
#
# Usage: ./push-images.sh [TAG]
# ============================================================

set -e

TAG="${1:-latest}"
DOCKER_REPO="${DOCKER_REPO:-ligandx}"

echo "Pushing images with tag: $TAG"
echo ""

# Get list of services
SERVICES=$(docker compose -f docker-compose.yml config --services | grep -v -E '^(redis|postgres|rabbitmq|flower)$')

for service in $SERVICES; do
    IMAGE_NAME="${DOCKER_REPO}/${service}:${TAG}"
    echo "Pushing ${IMAGE_NAME}..."
    docker push "${IMAGE_NAME}"
done

echo ""
echo "Push complete!"
