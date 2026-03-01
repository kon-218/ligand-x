#!/bin/bash
# ============================================================
# Production Build Script
# ============================================================
# Builds all services with production configuration and tags
# them with version numbers for deployment.
#
# Usage: ./build-production.sh [TAG]
#
# Environment variables:
#   IMAGE_PREFIX  - Image name prefix (default: ligandx)
#                   Set to ghcr.io/org/ligand-x for GHCR
# ============================================================

set -e

TAG="${1:-latest}"
IMAGE_PREFIX="${IMAGE_PREFIX:-${DOCKER_REPO:-ligandx}}"

echo "Building production images with tag: $TAG"
echo "Image prefix: $IMAGE_PREFIX"
echo ""

# Build using base docker-compose.yml (no override file)
docker compose -f docker-compose.yml build

# Tag images with version and registry prefix
echo ""
echo "Tagging images..."

# Get list of services from docker-compose.yml (exclude infra)
SERVICES=$(docker compose -f docker-compose.yml config --services | grep -v -E '^(redis|postgres|rabbitmq|flower)$')

for service in $SERVICES; do
    IMAGE_NAME="${IMAGE_PREFIX}/${service}"
    echo "Tagging ${service} as ${IMAGE_NAME}:${TAG}"

    # Docker Compose names images as <project>-<service>:latest
    BUILT_IMAGE="ligand-x-${service}:latest"

    if docker image inspect "$BUILT_IMAGE" >/dev/null 2>&1; then
        docker tag "$BUILT_IMAGE" "${IMAGE_NAME}:${TAG}"
        docker tag "$BUILT_IMAGE" "${IMAGE_NAME}:latest"
    else
        echo "Warning: Could not find image $BUILT_IMAGE for service $service"
    fi
done

echo ""
echo "Build and tagging complete!"
echo "Images tagged as: ${IMAGE_PREFIX}/<service>:${TAG}"
