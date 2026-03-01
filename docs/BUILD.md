# Ligand-X Build Guide

## How images are built

Ligand-X uses a multi-stage Dockerfile (`docker/Dockerfile.backend`) built around
shared Conda environment layers:

```
env-base    -> service-gateway, service-structure, service-alignment, ...
env-docking -> service-docking, worker-docking
env-md      -> service-md, service-abfe, service-rbfe, worker-gpu
env-admet   -> service-admet
env-boltz2  -> service-boltz2
env-qc      -> service-qc, worker-qc
```

The frontend uses a separate `docker/Dockerfile.frontend` with a standard
Node.js multi-stage build.

---

## Building locally

### Build all images

```bash
make build
```

Images are tagged with the short git SHA of HEAD (e.g. `sha-1e38ff3`).
The first build takes 15-30 minutes because each Conda environment is downloaded
and installed from scratch. Subsequent builds are fast due to Docker layer caching.

### Start the stack after building

Configure `.env.production` first (see [INSTALL.md](INSTALL.md)), then:

```bash
make prod
```

### Rebuild a single service

```bash
docker compose build <service>
docker compose up -d <service>
```

Example:

```bash
docker compose build gateway
docker compose up -d gateway
```

---

## CI/CD - GitHub Actions

Pushes to `main` (and `v*` tags) trigger `.github/workflows/build.yml`, which
builds and pushes all images to GHCR.

### Job 1 - Cache conda environment stages (`build-envs`)

Builds each heavy environment stage (`env-base`, `env-docking`, `env-md`,
`env-admet`, `env-boltz2`, `env-qc`) and stores their Docker layer cache in
GHCR under:

```
ghcr.io/<owner>/ligand-x/buildcache:env-<name>
```

These are not runnable images. They are layer cache blobs that let subsequent
builds skip re-installing Conda environments. The `boltz2` and `md` jobs clear
~10 GB of runner disk space first because their CUDA environments would otherwise
exceed the GitHub-hosted runner limit.

### Job 2 - Build and push service images (`build-services`)

Builds each service image in parallel, pulling cache from the env stages in
Job 1. Images are pushed with these tags:

| Event             | Tags applied                                        |
|-------------------|-----------------------------------------------------|
| Push to main      | `latest`, `sha-<short-sha>`                         |
| Push of `v*` tag  | `<semver>`, `<major>.<minor>`, `sha-<short-sha>`    |

### Job 3 - Build and push frontend (`build-frontend`)

Same process for the Next.js frontend image.

---

## GHCR setup (first push)

On the first push, each package is created in GHCR automatically but may be
private and without Actions write access. If you see a `403 Forbidden` error
during the push step:

1. Go to `github.com/<you>` -> **Packages**
2. Click the failing package (e.g. `ligand-x/frontend`)
3. **Package settings** -> **Manage Actions access**
4. Add your repository, set role to **Write**
5. Repeat for any other packages that fail

You can also make the packages public from the same settings panel.

---

## Pulling pre-built images

```bash
make pull    # pulls all images tagged :latest from GHCR
```

To pin to a specific build:

```bash
VERSION=sha-1e38ff3 make pull
```

---

## Disk space

| Environment | Approximate size |
|-------------|-----------------|
| base        | ~1.5 GB         |
| docking     | ~2.5 GB         |
| md          | ~4 GB           |
| admet       | ~3 GB           |
| boltz2      | ~6 GB           |
| qc          | ~2.5 GB         |
| frontend    | ~0.5 GB         |

A full local build needs ~50 GB of free space for intermediate layers and
final images.

```bash
make clean    # remove dangling images, cap build cache at 50 GB
```

---

## Makefile reference

| Command                   | Description                                         |
|---------------------------|-----------------------------------------------------|
| `make build`              | Build all images (tagged with git SHA)              |
| `make pull`               | Pull `:latest` images from GHCR                     |
| `make prod`               | Start production stack (requires `.env.production`) |
| `make dev`                | Start dev stack with hot reload                     |
| `make down`               | Stop and remove containers                          |
| `make clean`              | Remove dangling images; cap build cache at 50 GB    |
| `make logs`               | Tail all container logs                             |
| `make logs-<service>`     | Tail a specific service's logs                      |
| `make shell-<service>`    | Open a shell inside a container                     |
| `make restart`            | Restart all running containers                      |
| `make restart-<service>`  | Restart a specific container                        |
| `make status`             | Show disk usage and container status                |
| `make db`                 | Connect to PostgreSQL                               |
| `make db-backup`          | Dump the database to `./backups/`                   |
| `make test`               | Run the pytest suite                                |
| `make push`               | Push locally built images to GHCR                   |
