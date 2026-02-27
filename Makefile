# ============================================================
# Ligand-X Makefile
# ============================================================
# Simple, consistent interface for building and running the application.
#
# Core Commands:
#   make dev     - Start development environment
#   make prod    - Start production environment (local testing)
#   make down    - Shut down containers
#   make build   - Build production-ready images
#   make test    - Run test suite
#
# Utility Commands:
#   make clean   - Clean up Docker resources
#   make logs    - View service logs
#   make shell   - Access service shell
# ============================================================

.PHONY: help dev prod down build test clean logs shell shell-% logs-% restart restart-% status db db-backup purge-queues dev-core dev-docking dev-md dev-qc dev-free-energy dev-gpu

# ============================================================
# Configuration
# ============================================================

# Version tagging (uses git commit SHA)
VERSION ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
IMAGE_TAG ?= $(VERSION)

# Build configuration
COMPOSE_PROJECT_NAME ?= ligandx
DOCKER_REPO ?= ligandx

# ============================================================
# Help
# ============================================================

help:
	@echo "Ligand-X Development Commands"
	@echo ""
	@echo "Core Commands:"
	@echo "  make dev              - Start development environment"
	@echo "  make prod             - Start production environment (local testing)"
	@echo "  make down             - Shut down containers"
	@echo "  make build            - Build production images"
	@echo "  make test             - Run test suite"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make logs             - View all service logs"
	@echo "  make logs-<service>   - View specific service logs"
	@echo "  make restart          - Restart all running services"
	@echo "  make restart-<service>- Restart a specific service"
	@echo "  make shell-<service>  - Open shell in service"
	@echo "  make status           - Show system status"
	@echo "  make clean            - Clean Docker resources"
	@echo "  make purge-queues     - Clear all task queues (dev only)"
	@echo ""
	@echo "Database:"
	@echo "  make db               - Connect to PostgreSQL"
	@echo "  make db-backup        - Backup database"
	@echo ""
	@echo "Selective Dev Startup (partial service sets):"
	@echo "  make dev-core         - Infrastructure + structure + frontend only"
	@echo "  make dev-docking      - Core + editor + docking"
	@echo "  make dev-md           - Core + editor + MD"
	@echo "  make dev-qc           - Core + editor + quantum chemistry"
	@echo "  make dev-free-energy  - Core + docking + MD + ABFE + RBFE"
	@echo "  make dev-gpu          - All GPU services (full stack minus QC)"
	@echo ""
	@echo "Configuration:"
	@echo "  VERSION=v1.0 make build    - Build with custom version tag"
	@echo "  make build push=true       - Build and push to registry"

# ============================================================
# Core Targets
# ============================================================

# Development: Start all services with hot reload
dev: ensure-data-dirs
	@echo "Starting development environment..."
	@echo "Version: $(VERSION)"
	@echo ""
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d
	@echo ""
	@echo "Services started! Access at:"
	@echo "  Frontend:  http://localhost:3000"
	@echo "  API:       http://localhost:8000"
	@echo "  Flower:    http://localhost:5555/flower"
	@echo "  RabbitMQ:  http://localhost:15672 (ligandx/ligandx)"
	@echo ""
	@echo "View logs: make logs"
	@echo "Stop:      make down"

# Base set of services always needed (infrastructure + lightweight core)
_CORE = postgres redis rabbitmq gateway frontend structure

# Selective dev startup targets
dev-core: ensure-data-dirs
	@echo "Starting core services (infrastructure + structure + frontend)..."
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d $(_CORE)

dev-docking: ensure-data-dirs
	@echo "Starting core + editor + docking..."
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d $(_CORE) ketcher docking worker-cpu

dev-md: ensure-data-dirs
	@echo "Starting core + editor + MD..."
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d $(_CORE) ketcher md worker-gpu-short

dev-qc: ensure-data-dirs
	@echo "Starting core + editor + quantum chemistry..."
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d $(_CORE) ketcher qc worker-qc

dev-free-energy: ensure-data-dirs
	@echo "Starting core + editor + docking + MD + ABFE + RBFE..."
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d $(_CORE) ketcher docking md abfe rbfe worker-cpu worker-gpu-short worker-gpu-long

dev-gpu: ensure-data-dirs
	@echo "Starting all GPU services (full stack minus QC)..."
	@UID=$$(id -u) GID=$$(id -g) docker compose up -d $(_CORE) ketcher docking md abfe rbfe boltz2 admet worker-cpu worker-gpu-short worker-gpu-long

# Production: Run production configuration locally for testing
prod: ensure-data-dirs
	@echo "Starting PRODUCTION environment (no hot reload)..."
	@echo "Version: $(VERSION)"
	@echo ""
	@echo "NOTE: This uses production config without docker-compose.override.yml"
	@echo ""
	@docker compose -f docker-compose.yml up -d
	@echo ""
	@echo "Services started in PRODUCTION mode!"
	@echo "  Frontend:  http://localhost:3000"
	@echo "  API:       http://localhost:8000"
	@echo "  Flower:    http://localhost:5555/flower"
	@echo ""
	@echo "Differences from dev:"
	@echo "  - Code baked into images (no hot reload)"
	@echo "  - Resource limits enforced (CPU/memory)"
	@echo "  - Production logging levels"
	@echo ""
	@echo "View logs: docker compose -f docker-compose.yml logs -f"
	@echo "Stop:      make down"

# Shutdown: Stop containers and remove networks
down:
	@echo "Shutting down containers..."
	@docker compose down
	@echo "Containers stopped and cleaned up!"

# Build: Create production-ready images
build:
	@echo "Building production images..."
	@echo "Version: $(VERSION)"
	@echo "Tag: $(IMAGE_TAG)"
	@echo ""
	@./scripts/build-production.sh $(IMAGE_TAG)
ifdef push
	@echo ""
	@echo "Pushing images to registry..."
	@./scripts/push-images.sh $(IMAGE_TAG)
endif

# Test: Run test suite against built images
test:
	@echo "Running test suite..."
	@echo ""
	@pytest tests/ -v --tb=short
	@echo ""
	@echo "Tests complete!"

# ============================================================
# Utility Targets
# ============================================================

# Create data directories with correct permissions
ensure-data-dirs:
	@mkdir -p data/rbfe_outputs data/abfe_outputs data/docking_outputs \
	         data/md_outputs data/boltz_outputs data/qc_jobs \
	         data/qc_results_db data/msa_cache
	@if [ -f .env ]; then \
		(grep -v '^UID=' .env 2>/dev/null | grep -v '^GID=' | grep -v '^# Docker user') > .env.tmp 2>/dev/null || touch .env.tmp; \
		mv .env.tmp .env; \
	fi
	@echo "# Docker user (set by make)" >> .env
	@echo "UID=$$(id -u)" >> .env
	@echo "GID=$$(id -g)" >> .env

# Show system status
status:
	@echo "=== Disk Usage ==="
	@df -h / | tail -1
	@echo ""
	@echo "=== Docker Resource Usage ==="
	@docker system df
	@echo ""
	@echo "=== Running Containers ==="
	@docker compose ps

# View logs
logs:
	@docker compose logs -f

# View logs for specific service (pattern target)
logs-%:
	@docker compose logs -f $*

# Open shell in service (pattern target)
shell-%:
	@docker compose exec $* bash || docker compose exec $* sh

# Restart all running services
restart:
	@echo "Restarting all services..."
	@docker compose restart
	@echo "All services restarted!"

# Restart a specific service (pattern target)
restart-%:
	@echo "Restarting $*..."
	@docker compose restart $*
	@echo "$* restarted!"

# Cleanup
clean:
	@echo "=== Docker Cleanup ==="
	@echo ""
	@echo "Before cleanup:"
	@df -h / | tail -1
	@echo ""
	@echo "Removing stopped containers..."
	@docker container prune -f
	@echo ""
	@echo "Removing dangling images..."
	@docker image prune -f
	@echo ""
	@echo "Limiting build cache to 50GB..."
	@docker builder prune --keep-storage=50gb -f
	@echo ""
	@echo "After cleanup:"
	@df -h / | tail -1

# ============================================================
# Database Commands
# ============================================================

db:
	@docker compose exec postgres psql -U ligandx -d ligandx

db-backup:
	@mkdir -p ./backups
	@docker compose exec -T postgres pg_dump -U ligandx ligandx > ./backups/ligandx_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Database backed up to ./backups/"

# ============================================================
# Development Task Queue Management
# ============================================================

purge-queues:
	@echo "Purging all Celery task queues..."
	@bash scripts/purge-dev-queues.sh
