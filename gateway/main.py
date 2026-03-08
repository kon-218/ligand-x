"""API Gateway - Main entry point for all API requests."""
import logging
import sys
import asyncio
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from lib.common.config import CORS_ORIGINS
from lib.common.utils import convert_numpy_types
from gateway.routers import proxy, ketcher, msa, md, jobs, jobs_websocket

# Configure logging to be visible
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)
logger.info("Gateway starting up...")

# Initialize database on startup
async def init_db():
    """Initialize database tables on startup."""
    try:
        from lib.db import get_job_repository
        logger.info("Initializing database...")
        repo = get_job_repository()
        connected = await repo.connect()
        if connected:
            logger.info("[SUCCESS] Database initialized successfully")
        else:
            logger.warning("[WARNING] Database connection failed, will retry on first request")
        await repo.close()
    except Exception as e:
        logger.warning(f"[WARNING] Database initialization failed: {e}, will retry on first request")

app = FastAPI(
    title="Ligand-X API Gateway",
    description="API Gateway for Ligand-X microservices",
    version="3.0"
)

# Initialize Redis for WebSocket pub/sub
async def init_redis():
    """Initialize Redis connection for WebSocket pub/sub."""
    try:
        from lib.common.redis_client import get_redis_manager
        logger.info("Initializing Redis connection...")
        redis_mgr = get_redis_manager()
        connected = await redis_mgr.connect()
        if connected:
            logger.info("[SUCCESS] Redis connected successfully")
        else:
            logger.warning("[WARNING] Redis connection failed, WebSocket updates will be unavailable")
    except Exception as e:
        logger.warning(f"[WARNING] Redis initialization failed: {e}, WebSocket updates will be unavailable")


# Cleanup stale jobs from previous sessions
async def cleanup_stale_jobs():
    """Clean up stale jobs that were orphaned from previous sessions."""
    try:
        from datetime import datetime, timezone
        from lib.db import get_job_repository
        from lib.tasks.gpu_tasks import celery_app as gpu_celery_app

        # Lazily load QC celery app (may not be importable if QC env not active)
        qc_celery_app = None
        try:
            from services.qc.tasks import celery_app as _qc_app
            qc_celery_app = _qc_app
        except Exception:
            pass

        def get_app_for_job(job_type: str):
            if job_type == 'qc' and qc_celery_app is not None:
                return qc_celery_app
            return gpu_celery_app

        logger.info("Checking for stale jobs from previous sessions...")
        repo = get_job_repository()
        connected = await repo.connect()

        if not connected:
            logger.warning("Could not connect to database for stale job cleanup")
            return

        # Get all running/pending/submitted jobs
        running_jobs = await repo.list_jobs(status='running', limit=200)
        pending_jobs = await repo.list_jobs(status='pending', limit=200)
        submitted_jobs = await repo.list_jobs(status='submitted', limit=200)

        all_jobs = running_jobs + pending_jobs + submitted_jobs
        cleaned_count = 0

        for job in all_jobs:
            job_id = job.get('id')
            if not job_id:
                continue

            # Use job-type-specific Celery app for accurate status lookup
            app = get_app_for_job(job.get('job_type', ''))
            result = app.AsyncResult(job_id)
            celery_state = result.state

            # Only clean up if Celery doesn't know about this task
            if celery_state != 'PENDING':
                continue

            # Check job age (older than 5 minutes = definitely stale)
            created_at = job.get('created_at')
            try:
                if isinstance(created_at, str):
                    job_created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    job_created = created_at

                now = datetime.now(timezone.utc)
                age_minutes = (now - job_created.replace(tzinfo=timezone.utc)).total_seconds() / 60

                if age_minutes > 5:
                    # Mark as failed
                    logger.info(f"Cleaning up stale {job.get('job_type', 'unknown')} job {job_id} (age: {age_minutes:.1f}min, status: {job.get('status')})")
                    await repo.update_status(
                        job_id, 'failed',
                        error_message='Job lost due to system restart or worker failure'
                    )
                    cleaned_count += 1
            except Exception as e:
                logger.warning(f"Failed to process job {job_id} during cleanup: {e}")
                continue

        if cleaned_count > 0:
            logger.info(f"[SUCCESS] Cleaned up {cleaned_count} stale jobs from previous sessions")
        else:
            logger.info("No stale jobs found")

    except Exception as e:
        logger.warning(f"[WARNING] Stale job cleanup failed: {e}")


# Startup event to initialize database and Redis
@app.on_event("startup")
async def startup_event():
    """Initialize database and Redis on startup."""
    await init_db()
    await init_redis()
    # Clean up stale jobs after database is initialized
    await cleanup_stale_jobs()


# Shutdown event to cleanup connections
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    try:
        from lib.common.redis_client import close_redis
        from gateway.routers.jobs_websocket import stop_redis_listener
        
        stop_redis_listener()
        await close_redis()
        logger.info("[SUCCESS] Cleanup completed")
    except Exception as e:
        logger.warning(f"[WARNING] Cleanup error: {e}")

# Middleware to convert numpy types in responses
@app.middleware("http")
async def convert_numpy_middleware(request: Request, call_next):
    response = await call_next(request)
    if isinstance(response, JSONResponse):
        # Response body is already serialized, so we handle it at the router level
        pass
    return response

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define root and health endpoints BEFORE the proxy router
# This ensures they're matched before the catch-all proxy route
@app.get("/", response_model=dict)
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "message": "Ligand-X FastAPI Gateway is running",
        "version": "3.0",
        "frontend": "React app should be running on port 3000"
    }


@app.get("/health")
async def health():
    """Health check with service status."""
    return {
        "status": "ok",
        "gateway": "running"
    }


@app.get("/api/services/health")
async def services_health():
    """Check availability of all backend services in parallel."""
    import asyncio
    import httpx
    from gateway.config import SERVICE_URLS

    async def probe(client, name, url):
        try:
            r = await client.get(f"{url}/health", timeout=2.0)
            return name, r.status_code == 200
        except Exception:
            return name, False

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[probe(client, name, url) for name, url in SERVICE_URLS.items()]
        )

    return {"services": dict(results)}


# Include explicit service routers before the catch-all proxy
# This ensures specific routes are matched before the generic proxy
app.include_router(md.router)
app.include_router(ketcher.router)
app.include_router(msa.router)
app.include_router(jobs.router)  # Job submission and SSE streaming
app.include_router(jobs_websocket.router)  # WebSocket for real-time job updates

# Use intelligent proxy router that routes based on URL patterns
# This eliminates the need for multiple routers with conflicting catch-all routes
# The proxy router should be included last so explicit routes above take precedence
app.include_router(proxy.router)

