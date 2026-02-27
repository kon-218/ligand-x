# Contributing to Ligand-X

Thank you for your interest in contributing to Ligand-X! This document provides guidelines and best practices for contributors.

## Getting Started

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 20 GB+ free disk space (Conda environments are large)
- NVIDIA GPU recommended for GPU services (MD, ABFE, RBFE, Boltz-2)

### Fork and Clone

```bash
git clone https://github.com/your-org/ligand-x.git
cd ligand-x
```

### Start the Development Environment

The recommended way to develop is via Docker with hot reload:

```bash
make dev
```

This automatically loads `docker-compose.override.yml`, which mounts your local code into containers so changes take effect immediately without rebuilding.

For faster startup, start only the services you need:

```bash
make dev-core       # Infrastructure + structure + frontend only
make dev-docking    # Core + editor + docking
make dev-md         # Core + editor + MD
make dev-qc         # Core + editor + quantum chemistry
```

### Run the Test Suite

```bash
make test
```

Or run specific tests:

```bash
pytest tests/test_orca_parser_integration.py -v
pytest tests/test_rbfe_alignment.py -v
pytest -m unit
pytest -m "not slow"
```

---

## Code Style

### Python

- Follow **PEP 8**, 4-space indentation, 88-character line length (Black formatter standard)
- Use **type hints** on all public function signatures
- Use **Google-style docstrings** for classes and non-trivial functions
- Use structured logging via `logging.getLogger(__name__)`

### Service Structure

Each service follows this pattern:

```
services/{service_name}/
├── main.py       # FastAPI app with CORS, /health endpoint
├── routers.py    # Route definitions
├── service.py    # Business logic
└── helpers.py    # Utility functions (if needed)
```

All services must expose a `/health` endpoint returning:

```json
{"status": "ok", "service": "<name>"}
```

### TypeScript / React

- Use `const` and `let`, avoid `var`
- Prefer arrow functions for components
- Use Zustand for client state, React Query for server state
- Colocate component state where possible

---

## Adding a New Service

1. Create `services/new_service/` following the structure above
2. Add a Conda environment in `environments/new_service.yml` (or reuse an existing one)
3. Add a Docker build stage in `docker/Dockerfile.backend`
4. Add the service to `docker-compose.yml` with port, health check, and resource limits
5. Add routing in `gateway/routers/proxy.py` (`ROOT_ROUTES` or `API_PREFIX_ROUTES`)
6. Add the service URL to `lib/common/config.py`
7. Update `entrypoint.sh` if using a new conda environment

---

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines above
- [ ] All existing tests pass (`make test`)
- [ ] New functionality is covered by tests where feasible
- [ ] Documentation is updated (service README, API.md if applicable)
- [ ] No hardcoded secrets or credentials

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
```

### Review Process

1. Automated checks must pass
2. Code review by a maintainer
3. Final approval and merge

---

## Bug Reports

Please use GitHub Issues with the following information:

- **Description**: What happened vs. what was expected
- **Steps to reproduce**: Minimal reproducible example
- **Environment**: OS, Docker version, GPU (if applicable)
- **Logs**: Relevant output from `make logs-<service>`

---

## Feature Requests

Open a GitHub Issue describing:

- The use case and motivation
- Proposed API or UX changes
- Any alternatives considered

---

## Security

Please do **not** open public GitHub issues for security vulnerabilities. Email the maintainers directly.

---

Thank you for contributing to Ligand-X and helping advance open computational chemistry research!
