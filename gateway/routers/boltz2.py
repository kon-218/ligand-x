"""Boltz2 service router."""
import logging
import uuid
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/boltz2", tags=["Boltz2"])

BOLTZ2_URL = SERVICE_URLS['boltz2']

# Boltz2 predictions can take 30 minutes per ligand
BOLTZ2_TIMEOUT = 1800.0
# Batch predictions can take much longer (10 hours for large batches)
BOLTZ2_BATCH_TIMEOUT = 36000.0

# Lazy load job repository
_job_repo = None

async def get_job_repo():
    """Lazy load and connect job repository."""
    global _job_repo
    if _job_repo is None:
        from lib.db import get_job_repository
        _job_repo = get_job_repository()
        connected = await _job_repo.connect()
        if not connected:
            logger.error("Failed to connect to PostgreSQL database")
            raise HTTPException(
                status_code=503,
                detail="Database connection failed. Please try again."
            )
    elif not _job_repo._connected:
        logger.warning("Reconnecting to PostgreSQL database...")
        connected = await _job_repo.connect()
        if not connected:
            logger.error("Failed to reconnect to PostgreSQL database")
            raise HTTPException(
                status_code=503,
                detail="Database connection failed. Please try again."
            )
    return _job_repo


async def _proxy_request(method: str, url: str, request: Request, params: dict, timeout: float = BOLTZ2_TIMEOUT):
    """Proxy requests to Boltz2 service with configurable timeout."""
    return await proxy_request(method, url, request, params, timeout=timeout)


# Explicit routes for Boltz2 endpoints (priority over catch-all)
@router.api_route("/status", methods=["GET"])
async def boltz2_status(request: Request):
    """Get Boltz2 service status."""
    url = f"{BOLTZ2_URL}/api/boltz2/status"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/predict", methods=["POST"])
async def boltz2_predict(request: Request):
    """Run Boltz2 binding affinity prediction."""
    url = f"{BOLTZ2_URL}/api/boltz2/predict"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/stream_predict", methods=["POST"])
async def stream_predict(request: Request):
    """Streaming Boltz2 prediction workflow with Server-Sent Events."""
    url = f"{BOLTZ2_URL}/api/boltz2/stream_predict"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/validate", methods=["POST"])
async def boltz2_validate(request: Request):
    """Validate structures for Boltz2 prediction."""
    url = f"{BOLTZ2_URL}/api/boltz2/validate"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/batch_predict", methods=["POST"])
async def batch_boltz2_predict(request: Request):
    """
    Run batch Boltz2 predictions via Celery queue.

    Submits a batch job to the Celery gpu-long queue and returns immediately
    with a job_id and stream_url for SSE progress tracking.
    """
    from lib.tasks.gpu_tasks import boltz_batch

    try:
        # Parse request body
        body = await request.json()

        # Extract ligand count for metadata
        ligands = body.get('ligands', [])
        num_ligands = len(ligands)

        if num_ligands == 0:
            raise HTTPException(status_code=400, detail="No ligands provided for batch prediction")

        # Prepare job data for Celery task
        job_data = {
            'protein_pdb_data': body.get('protein_pdb_data'),
            'ligands': ligands,
            'prediction_params': body.get('prediction_params', {}),
            'accelerator': body.get('accelerator', 'gpu'),
            'msa_sequence_hash': body.get('msa_sequence_hash'),
            'alignment_options': body.get('alignment_options'),
            'protein_id': body.get('protein_id'),
        }

        # Submit to Celery queue
        task = boltz_batch.delay(job_data)
        job_id = task.id

        logger.info(f"Submitted batch Boltz2 job {job_id} with {num_ligands} ligands to Celery queue")

        # Create job record in PostgreSQL
        try:
            repo = await get_job_repo()
            await repo.create_job(
                job_id=job_id,
                job_type='boltz2',
                input_params={
                    'ligands': [{'id': l.get('id'), 'name': l.get('name'), 'format': l.get('format')} for l in ligands],
                    'is_batch': True,
                    'batch_total': num_ligands,
                    'num_ligands': num_ligands,
                    'accelerator': body.get('accelerator', 'gpu'),
                    'generate_msa': body.get('generate_msa', True),
                },
                molecule_name=f"Batch ({num_ligands} ligands)"
            )
            logger.info(f"Created PostgreSQL record for batch job {job_id}")
        except Exception as e:
            logger.warning(f"Failed to create PostgreSQL record: {e}")

        # Return job_id and stream_url for SSE tracking
        return JSONResponse(content={
            'success': True,
            'job_id': job_id,
            'stream_url': f'/api/jobs/stream/{job_id}',
            'total_ligands': num_ligands,
            'message': f'Batch job submitted with {num_ligands} ligands'
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch Boltz2 prediction submission failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_boltz2(request: Request, path: str):
    """Proxy all Boltz2 service requests with streaming support."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{BOLTZ2_URL}/api/boltz2/{path}" if path else f"{BOLTZ2_URL}/api/boltz2"
    return await _proxy_request(method, url, request, params)
