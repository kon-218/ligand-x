#!/bin/bash
# ============================================================
# Production Build Script
# ============================================================
# Builds all services with production configuration and tags
# them with version numbers for deployment.
#
# Usage: ./build-production.sh [TAG]
# ============================================================

set -e

TAG="${1:-latest}"
DOCKER_REPO="${DOCKER_REPO:-ligandx}"

echo "Building production images with tag: $TAG"
echo ""

# Build using base docker-compose.yml (no override file)
docker compose -f docker-compose.yml build

# Tag images with version
echo ""
echo "Tagging images..."

# Get list of services from docker-compose.yml
SERVICES=$(docker compose -f docker-compose.yml config --services | grep -v -E '^(redis|postgres|rabbitmq|flower)$')

for service in $SERVICES; do
    IMAGE_NAME="${DOCKER_REPO}/${service}"
    echo "Tagging ${service} as ${IMAGE_NAME}:${TAG}"

    # Get the actual built image name (Docker Compose names it as ligand-x-<service>)
    BUILT_IMAGE="ligand-x-${service}:latest"

    # Check if the image exists
    if docker image inspect "$BUILT_IMAGE" >/dev/null 2>&1; then
        docker tag "$BUILT_IMAGE" "${IMAGE_NAME}:${TAG}"
        docker tag "$BUILT_IMAGE" "${IMAGE_NAME}:latest"
    else
        echo "Warning: Could not find image $BUILT_IMAGE for service $service"
    fi
done

echo ""
echo "Build and tagging complete!"
echo "Images are tagged as: ${DOCKER_REPO}/<service>:${TAG}"
