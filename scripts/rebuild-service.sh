#!/bin/bash
# Rebuild a single Docker service
# Usage: ./rebuild-service.sh <service_name>
# Example: ./rebuild-service.sh gateway

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVICE_NAME=$1

if [ -z "$SERVICE_NAME" ]; then
    echo -e "${RED}Error: Service name required${NC}"
    echo ""
    echo "Usage: ./rebuild-service.sh <service_name>"
    echo ""
    echo "Available services:"
    echo "  - gateway"
    echo "  - structure"
    echo "  - docking"
    echo "  - md"
    echo "  - admet"
    echo "  - boltz2"
    echo "  - qc"
    echo "  - alignment"
    echo "  - ketcher"
    echo "  - worker-qc"
    echo "  - frontend"
    echo "  - redis"
    echo ""
    echo "Example: ./rebuild-service.sh gateway"
    exit 1
fi

# Validate service name
VALID_SERVICES=("gateway" "structure" "docking" "md" "admet" "boltz2" "qc" "alignment" "ketcher" "worker-qc" "frontend" "redis")
if [[ ! " ${VALID_SERVICES[@]} " =~ " ${SERVICE_NAME} " ]]; then
    echo -e "${RED}Error: Invalid service name '${SERVICE_NAME}'${NC}"
    echo ""
    echo "Valid services: ${VALID_SERVICES[*]}"
    exit 1
fi

echo -e "${BLUE}Rebuilding service: ${SERVICE_NAME}${NC}"

# Rebuild the specific service
if docker-compose build --no-cache "${SERVICE_NAME}"; then
    echo -e "${GREEN}✓ Successfully rebuilt ${SERVICE_NAME}${NC}"
    echo ""
    echo "To restart the service:"
    echo "  docker-compose up -d ${SERVICE_NAME}"
    echo ""
    echo "Or restart all services:"
    echo "  docker-compose up -d"
else
    echo -e "${RED}✗ Failed to rebuild ${SERVICE_NAME}${NC}"
    exit 1
fi

