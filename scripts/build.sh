#!/bin/bash
# ============================================================
# Ligand-X Smart Build Script
# ============================================================
# This script automatically manages disk space before builds
# to prevent "no space left on device" errors.
#
# Features:
# - Pre-build disk space check
# - Automatic cleanup if space is low
# - Build cache limiting
# - Supports selective service rebuilds
#
# Usage:
#   ./build.sh              # Build all services
#   ./build.sh gateway      # Build specific service
#   ./build.sh --clean      # Clean and build
#   ./build.sh --no-cache   # Build without cache
# ============================================================

set -e

# ============================================================
# Load Configuration
# ============================================================
# Priority: Environment Variables > .buildrc file > Defaults

# Default values
MIN_DISK_SPACE_GB=${MIN_DISK_SPACE_GB:-50}
BUILD_CACHE_LIMIT_GB=${BUILD_CACHE_LIMIT_GB:-50}
WARN_DISK_SPACE_GB=${WARN_DISK_SPACE_GB:-100}
AUTO_CLEANUP=${AUTO_CLEANUP:-true}
VERBOSE=${VERBOSE:-false}

# Load from config/.buildrc if it exists
if [ -f "$(dirname "$0")/../config/.buildrc" ]; then
    # Source only the variable assignments, ignore comments
    source <(grep -E '^\s*[A-Z_]+=.*' "$(dirname "$0")/../config/.buildrc" | grep -v '^#')
fi

# Re-apply environment variable overrides (they take precedence)
MIN_DISK_SPACE_GB=${MIN_DISK_SPACE_GB:-50}
BUILD_CACHE_LIMIT_GB=${BUILD_CACHE_LIMIT_GB:-50}
WARN_DISK_SPACE_GB=${WARN_DISK_SPACE_GB:-100}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SERVICES=""
NO_CACHE=""
CLEAN_FIRST=""
FORCE=""

for arg in "$@"; do
    case $arg in
        --no-cache)
            NO_CACHE="--no-cache"
            ;;
        --clean)
            CLEAN_FIRST=1
            ;;
        --force)
            FORCE=1
            ;;
        --help|-h)
            echo "Ligand-X Build Script"
            echo ""
            echo "Usage: ./build.sh [OPTIONS] [SERVICES...]"
            echo ""
            echo "Options:"
            echo "  --clean      Clean Docker resources before building"
            echo "  --no-cache   Build without using cache"
            echo "  --force      Force build even with low disk space"
            echo "  --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./build.sh                    # Build all services"
            echo "  ./build.sh gateway frontend   # Build specific services"
            echo "  ./build.sh --clean            # Clean and build all"
            echo "  ./build.sh --no-cache gateway # Rebuild gateway without cache"
            echo ""
            echo "Configuration:"
            echo "  Edit .buildrc to customize defaults, or use environment variables:"
            echo "  MIN_DISK_SPACE_GB=30 ./build.sh      # Require 30GB free"
            echo "  BUILD_CACHE_LIMIT_GB=100 ./build.sh  # Allow 100GB cache"
            echo "  AUTO_CLEANUP=false ./build.sh         # Disable auto-cleanup"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown option: $arg${NC}"
            exit 1
            ;;
        *)
            SERVICES="$SERVICES $arg"
            ;;
    esac
done

# Function to get free disk space in GB
get_free_space() {
    df -BG / | tail -1 | awk '{print $4}' | tr -d 'G'
}

# Function to get Docker build cache size in GB
get_build_cache_size() {
    docker system df --format '{{.Size}}' | head -4 | tail -1 | grep -oP '\d+\.?\d*' | head -1 || echo "0"
}

# Function to print status
print_status() {
    local free_space=$(get_free_space)
    local docker_df=$(docker system df 2>/dev/null || echo "Docker not running")
    
    echo -e "${BLUE}=== Disk Status ===${NC}"
    echo "Free disk space: ${free_space}GB"
    echo ""
    echo "Docker resource usage:"
    docker system df 2>/dev/null || echo "Unable to query Docker"
    echo ""
}

# Function to perform incremental cleanup
incremental_cleanup() {
    echo -e "${YELLOW}=== Performing Incremental Cleanup ===${NC}"
    
    local freed=0
    local free_space=$(get_free_space)
    
    # Step 1: Remove stopped containers
    echo "Step 1: Removing stopped containers..."
    docker container prune -f > /dev/null 2>&1 || true
    
    # Step 2: Remove dangling images
    echo "Step 2: Removing dangling images..."
    docker image prune -f > /dev/null 2>&1 || true
    
    free_space=$(get_free_space)
    if [ "$free_space" -lt "$MIN_DISK_SPACE_GB" ]; then
        # Step 3: Remove build cache older than 24h
        echo "Step 3: Removing build cache older than 24 hours..."
        docker builder prune --filter "until=24h" -f > /dev/null 2>&1 || true
    fi
    
    free_space=$(get_free_space)
    if [ "$free_space" -lt "$MIN_DISK_SPACE_GB" ]; then
        # Step 4: Remove unused images older than 7 days
        echo "Step 4: Removing unused images older than 7 days..."
        docker image prune -a --filter "until=168h" -f > /dev/null 2>&1 || true
    fi
    
    free_space=$(get_free_space)
    if [ "$free_space" -lt "$MIN_DISK_SPACE_GB" ]; then
        # Step 5: Remove unused volumes
        echo "Step 5: Removing unused volumes..."
        docker volume prune -f > /dev/null 2>&1 || true
    fi
    
    free_space=$(get_free_space)
    if [ "$free_space" -lt "$MIN_DISK_SPACE_GB" ]; then
        # Step 6: Aggressive cache cleanup
        echo "Step 6: Aggressive build cache cleanup..."
        docker builder prune -f > /dev/null 2>&1 || true
    fi
    
    echo -e "${GREEN}Cleanup complete. Free space: ${free_space}GB${NC}"
    echo ""
}

# Function to limit build cache
limit_build_cache() {
    echo "Limiting build cache to ${BUILD_CACHE_LIMIT_GB}GB..."
    docker builder prune --keep-storage="${BUILD_CACHE_LIMIT_GB}gb" -f > /dev/null 2>&1 || true
}

# Main script
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Ligand-X Smart Build System        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Print initial status
print_status

# Get current free space
FREE_SPACE=$(get_free_space)

# Check if cleanup is requested
if [ -n "$CLEAN_FIRST" ]; then
    echo -e "${YELLOW}Clean requested - performing full cleanup...${NC}"
    incremental_cleanup
    limit_build_cache
    FREE_SPACE=$(get_free_space)
fi

# Check disk space and clean if necessary
if [ "$FREE_SPACE" -lt "$MIN_DISK_SPACE_GB" ]; then
    if [ -n "$FORCE" ]; then
        echo -e "${YELLOW}Warning: Low disk space (${FREE_SPACE}GB) but --force specified${NC}"
    else
        echo -e "${YELLOW}Low disk space detected (${FREE_SPACE}GB < ${MIN_DISK_SPACE_GB}GB required)${NC}"
        echo "Performing automatic cleanup..."
        incremental_cleanup
        
        FREE_SPACE=$(get_free_space)
        if [ "$FREE_SPACE" -lt "$MIN_DISK_SPACE_GB" ]; then
            echo -e "${RED}Error: Still insufficient disk space (${FREE_SPACE}GB) after cleanup${NC}"
            echo "Please manually free up space or use --force to proceed anyway"
            exit 1
        fi
    fi
elif [ "$FREE_SPACE" -lt "$WARN_DISK_SPACE_GB" ]; then
    echo -e "${YELLOW}Warning: Disk space is getting low (${FREE_SPACE}GB)${NC}"
    echo "Consider running './build.sh --clean' soon"
    echo ""
fi

# Limit build cache before building to prevent accumulation
limit_build_cache

# Build services
echo -e "${BLUE}=== Building Services ===${NC}"

# Set BuildKit environment
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Build command
BUILD_CMD="docker compose build"

if [ -n "$NO_CACHE" ]; then
    BUILD_CMD="$BUILD_CMD --no-cache"
fi

if [ -n "$SERVICES" ]; then
    BUILD_CMD="$BUILD_CMD $SERVICES"
fi

echo "Running: $BUILD_CMD"
echo ""

# Execute build
if $BUILD_CMD; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Build Successful!              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    
    # Post-build cleanup of dangling images
    echo ""
    echo "Post-build cleanup..."
    docker image prune -f > /dev/null 2>&1 || true
    
    # Print final status
    echo ""
    print_status
else
    echo ""
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║           Build Failed!                ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    
    # Check if it was a disk space issue
    FREE_SPACE=$(get_free_space)
    if [ "$FREE_SPACE" -lt 10 ]; then
        echo ""
        echo -e "${YELLOW}Disk space critically low (${FREE_SPACE}GB)${NC}"
        echo "Running emergency cleanup..."
        incremental_cleanup
        echo ""
        echo "Try running the build again with: ./build.sh --clean"
    fi
    
    exit 1
fi
