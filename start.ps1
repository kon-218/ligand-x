# Ligand-X Windows PowerShell entry point
# Usage: .\start.ps1 <command> [<service>]
#
# If execution is blocked, run:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param(
    [Parameter(Position=0)] [string]$Command = "help",
    [Parameter(Position=1)] [string]$Service  = ""
)

Set-Location $PSScriptRoot

# ============================================================
# Helpers
# ============================================================

function Write-Header([string]$msg) {
    Write-Host "`n$msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host $msg -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "WARNING: $msg" -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host "ERROR: $msg" -ForegroundColor Red
}

function Has-Wsl {
    return ($null -ne (Get-Command wsl -ErrorAction SilentlyContinue))
}

function Get-GitShortSha {
    try {
        $sha = git rev-parse --short HEAD 2>$null
        if ($LASTEXITCODE -eq 0 -and $sha) { return $sha }
    } catch {}
    return "dev"
}

# ============================================================
# Internal: ensure data directories and .env baseline
# ============================================================

function Invoke-EnsureDataDirs {
    $dirs = @(
        "data/rbfe_outputs",
        "data/abfe_outputs",
        "data/docking_outputs",
        "data/md_outputs",
        "data/boltz_outputs",
        "data/qc_jobs",
        "data/qc_results_db",
        "data/msa_cache",
        "backups"
    )
    foreach ($d in $dirs) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
    }

    # Read existing .env, strip old UID/GID/Docker-user lines
    $envLines = @()
    if (Test-Path ".env") {
        $envLines = Get-Content ".env" | Where-Object {
            $_ -notmatch '^UID=' -and
            $_ -notmatch '^GID=' -and
            $_ -notmatch '^# Docker user'
        }
    }

    # Ensure QC_SECRET_KEY default
    $hasQcKey = $envLines | Where-Object { $_ -match '^QC_SECRET_KEY=' }
    if (-not $hasQcKey) {
        $envLines += "QC_SECRET_KEY=dev-secret-key-change-in-production"
    }

    # Ensure FLOWER_PASSWORD default
    $hasFlower = $envLines | Where-Object { $_ -match '^FLOWER_PASSWORD=' }
    if (-not $hasFlower) {
        $envLines += "FLOWER_PASSWORD=admin"
    }

    # Always append Windows-safe UID/GID (Docker Desktop on Windows manages
    # volume permissions via WSL2/Hyper-V; hardcoding 1000 matches appuser)
    $envLines += "# Docker user (set by start.ps1)"
    $envLines += "UID=1000"
    $envLines += "GID=1000"

    $envLines | Set-Content ".env" -Encoding UTF8
}

function Get-EnvFileArg {
    if (Test-Path ".env.production") {
        return @("--env-file", ".env.production")
    }
    return @()
}

# ============================================================
# Commands
# ============================================================

function Invoke-Help {
    Write-Host ""
    Write-Host "Ligand-X Development Commands (PowerShell)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Core Commands:" -ForegroundColor Green
    Write-Host "  .\start.ps1 dev              - Start development environment"
    Write-Host "  .\start.ps1 prod             - Start production environment (local testing)"
    Write-Host "  .\start.ps1 down             - Shut down containers"
    Write-Host "  .\start.ps1 build            - Build production images"
    Write-Host "  .\start.ps1 test             - Run test suite"
    Write-Host ""
    Write-Host "Utility Commands:" -ForegroundColor Green
    Write-Host "  .\start.ps1 logs             - View all service logs"
    Write-Host "  .\start.ps1 logs <service>   - View specific service logs"
    Write-Host "  .\start.ps1 restart          - Restart all running services"
    Write-Host "  .\start.ps1 restart <service>- Restart a specific service"
    Write-Host "  .\start.ps1 shell <service>  - Open shell in service"
    Write-Host "  .\start.ps1 status           - Show system status"
    Write-Host "  .\start.ps1 clean            - Clean Docker resources"
    Write-Host "  .\start.ps1 purge-queues     - Clear all task queues (dev only, requires WSL)"
    Write-Host ""
    Write-Host "Database:" -ForegroundColor Green
    Write-Host "  .\start.ps1 db               - Connect to PostgreSQL"
    Write-Host "  .\start.ps1 db-backup        - Backup database"
    Write-Host "  .\start.ps1 purge-jobs       - Delete all jobs from the database"
    Write-Host ""
    Write-Host "Selective Dev Startup:" -ForegroundColor Green
    Write-Host "  .\start.ps1 dev-core         - Infrastructure + structure + frontend"
    Write-Host "  .\start.ps1 dev-docking      - Core + editor + docking"
    Write-Host "  .\start.ps1 dev-md           - Core + editor + MD"
    Write-Host "  .\start.ps1 dev-qc           - Core + editor + quantum chemistry"
    Write-Host "  .\start.ps1 dev-free-energy  - Core + docking + MD + ABFE + RBFE"
    Write-Host "  .\start.ps1 dev-gpu          - All GPU services (full stack minus QC)"
    Write-Host ""
    Write-Host "Selective Prod Startup (production mode):" -ForegroundColor Green
    Write-Host "  .\start.ps1 prod-core        - Infrastructure + structure + frontend"
    Write-Host "  .\start.ps1 prod-docking     - Core + editor + docking"
    Write-Host "  .\start.ps1 prod-md          - Core + editor + MD"
    Write-Host "  .\start.ps1 prod-qc          - Core + editor + quantum chemistry"
    Write-Host "  .\start.ps1 prod-free-energy - Core + docking + MD + ABFE + RBFE"
    Write-Host "  .\start.ps1 prod-gpu         - All GPU services (full stack minus QC)"
    Write-Host ""
    Write-Host "Registry:" -ForegroundColor Green
    Write-Host "  .\start.ps1 pull             - Pull pre-built images from GHCR"
    Write-Host "  .\start.ps1 push             - Push images to GHCR"
    Write-Host ""
    Write-Host "Configuration:" -ForegroundColor Green
    Write-Host "  Set `$env:VERSION=v1.0 before calling build to use a custom version tag"
    Write-Host ""
}

function Invoke-Dev {
    Invoke-EnsureDataDirs
    $ver = if ($env:VERSION) { $env:VERSION } else { Get-GitShortSha }
    Write-Header "Starting development environment..."
    Write-Host "Version: $ver"
    docker compose up -d
    if ($LASTEXITCODE -eq 0) {
        Write-Success "`nServices started! Access at:"
        Write-Host "  Frontend:  http://localhost:3000"
        Write-Host "  API:       http://localhost:8000"
        Write-Host "  Flower:    http://localhost:5555/flower"
        Write-Host "  RabbitMQ:  http://localhost:15672 (ligandx/ligandx)"
        Write-Host ""
        Write-Host "View logs: .\start.ps1 logs"
        Write-Host "Stop:      .\start.ps1 down"
    }
}

$CORE_SERVICES = @("postgres", "redis", "rabbitmq", "gateway", "frontend", "structure")

function Invoke-DevCore {
    Invoke-EnsureDataDirs
    Write-Header "Starting core services (infrastructure + structure + frontend)..."
    docker compose up -d @CORE_SERVICES
}

function Invoke-DevDocking {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + docking..."
    docker compose up -d @CORE_SERVICES ketcher docking worker-cpu
}

function Invoke-DevMd {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + MD..."
    docker compose up -d @CORE_SERVICES ketcher md worker-gpu-short
}

function Invoke-DevQc {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + quantum chemistry..."
    docker compose up -d @CORE_SERVICES ketcher qc worker-qc
}

function Invoke-DevFreeEnergy {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + docking + MD + ABFE + RBFE..."
    docker compose up -d @CORE_SERVICES ketcher docking md abfe rbfe worker-cpu worker-gpu-short worker-gpu-long
}

function Invoke-DevGpu {
    Invoke-EnsureDataDirs
    Write-Header "Starting all GPU services (full stack minus QC)..."
    docker compose up -d @CORE_SERVICES ketcher docking md abfe rbfe boltz2 admet worker-cpu worker-gpu-short worker-gpu-long
}

function Invoke-ProdCore {
    Invoke-EnsureDataDirs
    Write-Header "Starting core services (production mode)..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d @CORE_SERVICES
    } else {
        docker compose -f docker-compose.yml up -d @CORE_SERVICES
    }
}

function Invoke-ProdDocking {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + docking (production mode)..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d @CORE_SERVICES ketcher docking worker-cpu
    } else {
        docker compose -f docker-compose.yml up -d @CORE_SERVICES ketcher docking worker-cpu
    }
}

function Invoke-ProdMd {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + MD (production mode)..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d @CORE_SERVICES ketcher md worker-gpu-short
    } else {
        docker compose -f docker-compose.yml up -d @CORE_SERVICES ketcher md worker-gpu-short
    }
}

function Invoke-ProdQc {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + quantum chemistry (production mode)..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d @CORE_SERVICES ketcher qc worker-qc
    } else {
        docker compose -f docker-compose.yml up -d @CORE_SERVICES ketcher qc worker-qc
    }
}

function Invoke-ProdFreeEnergy {
    Invoke-EnsureDataDirs
    Write-Header "Starting core + editor + docking + MD + ABFE + RBFE (production mode)..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d @CORE_SERVICES ketcher docking md abfe rbfe worker-cpu worker-gpu-short worker-gpu-long
    } else {
        docker compose -f docker-compose.yml up -d @CORE_SERVICES ketcher docking md abfe rbfe worker-cpu worker-gpu-short worker-gpu-long
    }
}

function Invoke-ProdGpu {
    Invoke-EnsureDataDirs
    Write-Header "Starting all GPU services (production mode, full stack minus QC)..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d @CORE_SERVICES ketcher docking md abfe rbfe boltz2 admet worker-cpu worker-gpu-short worker-gpu-long
    } else {
        docker compose -f docker-compose.yml up -d @CORE_SERVICES ketcher docking md abfe rbfe boltz2 admet worker-cpu worker-gpu-short worker-gpu-long
    }
}

function Invoke-Prod {
    Invoke-EnsureDataDirs
    $ver = if ($env:VERSION) { $env:VERSION } else { Get-GitShortSha }
    Write-Header "Starting PRODUCTION environment (no hot reload)..."
    Write-Host "Version: $ver"
    Write-Warn "This uses production config without docker-compose.override.yml"
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml up -d
    } else {
        docker compose -f docker-compose.yml up -d
    }
    if ($LASTEXITCODE -eq 0) {
        Write-Success "`nServices started in PRODUCTION mode!"
        Write-Host "  Frontend:  http://localhost:3000"
        Write-Host "  API:       http://localhost:8000"
        Write-Host "  Flower:    http://localhost:5555/flower"
        Write-Host ""
        Write-Host "Differences from dev:"
        Write-Host "  - Code baked into images (no hot reload)"
        Write-Host "  - Resource limits enforced (CPU/memory)"
        Write-Host "  - Production logging levels"
        Write-Host ""
        Write-Host "Stop: .\start.ps1 down"
    }
}

function Invoke-Down {
    Write-Header "Shutting down containers..."
    $envArg = Get-EnvFileArg
    if ($envArg.Count -gt 0) {
        docker compose @envArg down
    } else {
        docker compose down
    }
    Write-Success "Containers stopped and cleaned up!"
}

function Invoke-Build {
    $ver = if ($env:VERSION) { $env:VERSION } else { Get-GitShortSha }

    # Determine image prefix
    $registryOwner = $env:REGISTRY_OWNER
    if (-not $registryOwner) {
        try {
            $remote = git remote get-url origin 2>$null
            if ($remote -match 'github\.com[:/]([^/]+)/') {
                $registryOwner = $Matches[1]
            }
        } catch {}
    }
    $registry = if ($env:REGISTRY) { $env:REGISTRY } else { "ghcr.io" }
    $imagePrefix = if ($registryOwner) {
        "$registry/$registryOwner/ligand-x"
    } else {
        if ($env:IMAGE_PREFIX) { $env:IMAGE_PREFIX } else { "ligandx" }
    }

    Write-Header "Building production images..."
    Write-Host "Version:      $ver"
    Write-Host "Image prefix: $imagePrefix"

    if (Has-Wsl) {
        Write-Host "(Using WSL to run build-production.sh)"
        $env:IMAGE_PREFIX = $imagePrefix
        wsl bash ./scripts/build-production.sh $ver
    } else {
        Write-Warn "WSL not available - falling back to plain 'docker compose build'"
        Write-Warn "Images will use default compose names; manual tagging may be required."
        $env:IMAGE_PREFIX = $imagePrefix
        $env:IMAGE_TAG    = $ver
        docker compose -f docker-compose.yml build
    }
}

function Invoke-Push {
    $ver = if ($env:VERSION) { $env:VERSION } else { Get-GitShortSha }
    $registryOwner = $env:REGISTRY_OWNER
    if (-not $registryOwner) {
        try {
            $remote = git remote get-url origin 2>$null
            if ($remote -match 'github\.com[:/]([^/]+)/') {
                $registryOwner = $Matches[1]
            }
        } catch {}
    }
    $registry = if ($env:REGISTRY) { $env:REGISTRY } else { "ghcr.io" }
    $imagePrefix = if ($registryOwner) {
        "$registry/$registryOwner/ligand-x"
    } else {
        if ($env:IMAGE_PREFIX) { $env:IMAGE_PREFIX } else { "ligandx" }
    }

    Write-Header "Pushing images to $imagePrefix/..."
    Write-Host "Tag: $ver"

    if (Has-Wsl) {
        $env:IMAGE_PREFIX = $imagePrefix
        wsl bash ./scripts/push-images.sh $ver
    } else {
        Write-Warn "WSL not available - falling back to 'docker compose push'"
        $env:IMAGE_PREFIX = $imagePrefix
        docker compose -f docker-compose.yml push
    }
}

function Invoke-Pull {
    $ver = if ($env:VERSION) { $env:VERSION } else { "latest" }
    Write-Header "Pulling images from GHCR..."
    Write-Host "Version: $ver"
    $envArg = Get-EnvFileArg
    $env:VERSION = $ver
    if ($envArg.Count -gt 0) {
        docker compose @envArg -f docker-compose.yml pull
    } else {
        docker compose -f docker-compose.yml pull
    }
    Write-Success "`nAll images pulled. Start with: .\start.ps1 prod"
}

function Invoke-Test {
    Write-Header "Running test suite..."
    pytest tests/ -v --tb=short
    Write-Success "`nTests complete!"
}

function Invoke-Logs {
    if ($Service) {
        docker compose logs -f $Service
    } else {
        docker compose logs -f
    }
}

function Invoke-Shell {
    if (-not $Service) {
        Write-Err "Usage: .\start.ps1 shell <service>"
        exit 1
    }
    Write-Header "Opening shell in $Service..."
    docker compose exec $Service bash 2>$null
    if ($LASTEXITCODE -ne 0) {
        docker compose exec $Service sh
    }
}

function Invoke-Restart {
    if ($Service) {
        Write-Header "Restarting $Service..."
        docker compose restart $Service
        Write-Success "$Service restarted!"
    } else {
        Write-Header "Restarting all services..."
        docker compose restart
        Write-Success "All services restarted!"
    }
}

function Invoke-Status {
    Write-Header "=== Docker Resource Usage ==="
    docker system df
    Write-Host ""
    Write-Header "=== Running Containers ==="
    docker compose ps
}

function Invoke-Clean {
    Write-Header "=== Docker Cleanup ==="
    Write-Host ""
    Write-Host "Removing stopped containers..."
    docker container prune -f
    Write-Host ""
    Write-Host "Removing dangling images..."
    docker image prune -f
    Write-Host ""
    Write-Host "Limiting build cache to 50GB..."
    docker builder prune --keep-storage=50gb -f
    Write-Success "`nCleanup complete!"
}

function Invoke-Db {
    docker compose exec postgres psql -U ligandx -d ligandx
}

function Invoke-DbBackup {
    New-Item -ItemType Directory -Force -Path "./backups" | Out-Null
    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    $outFile = "./backups/ligandx_$ts.sql"
    Write-Header "Backing up database to $outFile ..."
    docker compose exec -T postgres pg_dump -U ligandx ligandx | Set-Content $outFile -Encoding UTF8
    Write-Success "Database backed up to $outFile"
}

function Invoke-PurgeJobs {
    Write-Header "Deleting all jobs from the database..."
    docker compose exec postgres psql -U ligandx -d ligandx -c "DELETE FROM jobs;"
    Write-Success "Done."
}

function Invoke-PurgeQueues {
    Write-Header "Purging all Celery task queues..."
    if (Has-Wsl) {
        wsl bash ./scripts/purge-dev-queues.sh
    } else {
        Write-Warn "WSL is not available. To purge queues manually, run:"
        Write-Host ""
        Write-Host "  docker compose exec rabbitmq rabbitmqctl purge_queue celery"
        Write-Host "  docker compose exec rabbitmq rabbitmqctl purge_queue gpu-short"
        Write-Host "  docker compose exec rabbitmq rabbitmqctl purge_queue gpu-long"
        Write-Host "  docker compose exec rabbitmq rabbitmqctl purge_queue qc"
        Write-Host "  docker compose exec rabbitmq rabbitmqctl purge_queue cpu"
        Write-Host ""
        Write-Host "Or install WSL2 and re-run: .\start.ps1 purge-queues"
    }
}

# ============================================================
# Dispatch
# ============================================================

switch ($Command.ToLower()) {
    "help"            { Invoke-Help }
    "dev"             { Invoke-Dev }
    "dev-core"        { Invoke-DevCore }
    "dev-docking"     { Invoke-DevDocking }
    "dev-md"          { Invoke-DevMd }
    "dev-qc"          { Invoke-DevQc }
    "dev-free-energy" { Invoke-DevFreeEnergy }
    "dev-gpu"         { Invoke-DevGpu }
    "prod-core"       { Invoke-ProdCore }
    "prod-docking"    { Invoke-ProdDocking }
    "prod-md"         { Invoke-ProdMd }
    "prod-qc"         { Invoke-ProdQc }
    "prod-free-energy" { Invoke-ProdFreeEnergy }
    "prod-gpu"        { Invoke-ProdGpu }
    "prod"            { Invoke-Prod }
    "down"            { Invoke-Down }
    "build"           { Invoke-Build }
    "push"            { Invoke-Push }
    "pull"            { Invoke-Pull }
    "test"            { Invoke-Test }
    "logs"            { Invoke-Logs }
    "shell"           { Invoke-Shell }
    "restart"         { Invoke-Restart }
    "status"          { Invoke-Status }
    "clean"           { Invoke-Clean }
    "db"              { Invoke-Db }
    "db-backup"       { Invoke-DbBackup }
    "purge-jobs"      { Invoke-PurgeJobs }
    "purge-queues"    { Invoke-PurgeQueues }
    default {
        Write-Err "Unknown command: '$Command'"
        Write-Host "Run .\start.ps1 (no arguments) to see available commands."
        exit 1
    }
}
