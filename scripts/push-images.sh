#!/bin/bash
# ============================================================
# Push Images Script
# ============================================================
# Pushes tagged images to container registry.
#
# Usage: ./push-images.sh [TAG]
#
# Environment variables:
#   IMAGE_PREFIX  - Image name prefix (default: ligandx)
#                   For GHCR: ghcr.io/your-org/ligand-x
#
# For GHCR, authenticate first:
#   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
# ============================================================

set -e

TAG="${1:-latest}"
IMAGE_PREFIX="${IMAGE_PREFIX:-${DOCKER_REPO:-ligandx}}"
# Max concurrent pushes — GHCR handles ~8 parallel streams well
PARALLEL="${PUSH_PARALLEL:-8}"

echo "Pushing images to ${IMAGE_PREFIX}/... (parallel=$PARALLEL)"
echo "Tag: $TAG"
echo ""

# Get list of services (exclude infra that we don't build)
SERVICES=$(docker compose -f docker-compose.yml config --services | grep -v -E '^(redis|postgres|rabbitmq|flower)$')

push_service() {
    local service="$1"
    local image="${IMAGE_PREFIX}/${service}"
    # pipefail so docker's exit code isn't masked by awk
    set -o pipefail
    # awk prefixes every line with [service] and flushes immediately
    docker push "${image}:${TAG}" 2>&1 \
        | awk -v svc="[${service}]" '{ print svc, $0; fflush() }' \
        || { echo "[${service}] FAILED :${TAG}"; return 1; }
    if [ "$TAG" != "latest" ]; then
        docker push "${image}:latest" 2>&1 \
            | awk -v svc="[${service}]" '{ print svc, $0; fflush() }' \
            || { echo "[${service}] FAILED :latest"; return 1; }
    fi
    echo "[${service}] done"
}

export -f push_service
export IMAGE_PREFIX TAG

# Run up to $PARALLEL pushes at once; collect exit codes
FAILED=0
echo "$SERVICES" | xargs -P "$PARALLEL" -I{} bash -c 'push_service "$@"' _ {} || FAILED=$?

echo ""
if [ "$FAILED" -ne 0 ]; then
    echo "One or more pushes failed. Check /tmp/push-<service>.log for details."
    exit 1
fi
echo "Push complete! Images available at ${IMAGE_PREFIX}/<service>:${TAG}"
