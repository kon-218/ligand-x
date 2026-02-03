# Directory Organization

This document describes the reorganized directory structure of Ligand-X.

## Root Directory Structure

The root directory now contains only essential files for building and running the application:

```
ligand-x/
├── .github/              # GitHub workflows
├── .env                  # Environment variables
├── .env.local            # Local environment overrides
├── .gitignore            # Git ignore rules
├── .dockerignore         # Docker ignore rules
├── docker-compose.yml    # Main Docker Compose configuration
├── docker-compose.override.yml  # Development overrides
├── entrypoint.sh         # Docker entrypoint script
├── Makefile              # Build automation
├── README.md             # Project overview
├── requirements.txt      # Python dependencies
├── package.json          # Node dependencies
│
├── config/               # Configuration files
├── docker/               # Docker build files
├── docs/                 # Technical documentation
├── docs-root/            # Root-level documentation
├── scripts/              # Utility scripts
│
├── data/                 # Runtime data and outputs
├── environments/         # Conda environment files
├── frontend/             # React frontend
├── gateway/              # API Gateway
├── lib/                  # Shared libraries
├── migrations/           # Database migrations
├── services/             # Microservices
├── tests/                # Test suite
└── .windsurf/            # IDE configuration
```

## Subdirectories

### `config/` - Configuration Files
Contains all configuration files needed for the application:
- `.buildrc` - Build script configuration
- `flower_config.py` - Celery Flower dashboard configuration
- `pytest.ini` - Pytest configuration
- `docker-cleanup.service` - Systemd service file
- `docker-cleanup.timer` - Systemd timer file

**Usage:** Referenced by build scripts and Docker Compose

### `docker/` - Docker Build Files
Contains all Dockerfile definitions:
- `Dockerfile.backend` - Backend services (multi-stage)
- `Dockerfile.backend.original` - Original backend Dockerfile (backup)
- `Dockerfile.frontend` - Production frontend build
- `Dockerfile.frontend.dev` - Development frontend build
- `buildkitd.toml` - BuildKit configuration

**Usage:** Referenced in `docker-compose.yml` via `dockerfile: docker/Dockerfile.backend`

### `docs-root/` - Root Documentation
Contains project-level documentation files:
- `BUILD.md` - Build system documentation
- `BUILD_QUICK_REFERENCE.txt` - Quick build reference
- `INSTALL.md` - Installation guide
- `CONTRIBUTING.md` - Contribution guidelines

**Usage:** Referenced in README.md and project documentation

### `scripts/` - Utility Scripts
Contains executable scripts for development and maintenance:
- `build.sh` - Smart build script with disk space management
- `rebuild-service.sh` - Rebuild individual services
- `docker-cleanup.sh` - Docker cleanup utility
- `emergency-docker-cleanup.sh` - Emergency cleanup script
- `generate-history.sh` - Git history generation
- `generate-history-new.sh` - New git history generation
- `verify_fix.py` - Verification script
- `verify_hmr.py` - HMR verification script
- `verify_removal.py` - Removal verification script

**Usage:** Called from Makefile and manually for development tasks

### `docs/` - Technical Documentation
Contains detailed technical documentation:
- Architecture guides
- Implementation details
- API documentation
- Troubleshooting guides
- Performance optimization notes

## Updated References

All paths have been updated in the following files:

### Makefile
- `./build.sh` → `./scripts/build.sh`
- `./emergency-docker-cleanup.sh` → `./scripts/emergency-docker-cleanup.sh`
- `.buildrc` → `config/.buildrc`

### docker-compose.yml
- `Dockerfile.backend` → `docker/Dockerfile.backend`
- `Dockerfile.frontend.dev` → `docker/Dockerfile.frontend.dev`
- `./flower_config.py` → `./config/flower_config.py`

### scripts/build.sh
- `.buildrc` → `../config/.buildrc`

### README.md
- `CONTRIBUTING.md` → `docs-root/CONTRIBUTING.md`
- `./rebuild-service.sh` → `./scripts/rebuild-service.sh`

## Benefits

1. **Cleaner Root Directory** - Only essential files and directories at the root level
2. **Better Organization** - Related files grouped by purpose
3. **Easier Navigation** - Clear separation of concerns
4. **Scalability** - Easier to add new scripts, configs, or documentation
5. **Maintenance** - Simpler to understand project structure

## Migration Notes

- All file moves were completed on Jan 14, 2026
- All path references have been updated
- No functionality has been changed
- All scripts and configurations work exactly as before
- The application can be built and run normally with `make build` and `make up`

## Quick Reference

| Task | Command |
|------|---------|
| Build all services | `make build` |
| Rebuild specific service | `./scripts/rebuild-service.sh <service>` |
| View build config | `cat config/.buildrc` |
| View Flower config | `cat config/flower_config.py` |
| View Dockerfiles | `ls docker/` |
| View documentation | `ls docs-root/` |
