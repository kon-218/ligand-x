"""
Jobs Router - Unified job submission and SSE streaming.

This router provides:
- Job submission to Celery queues
- Real-time progress streaming via SSE
- Job listing and status queries from PostgreSQL
- Job cancellation

Endpoints:
    POST /api/jobs/submit/{job_type} - Submit a new job
    GET  /api/jobs/stream/{job_id}   - SSE stream for job progress
    GET  /api/jobs/list              - List jobs with filters
    GET  /api/jobs/{job_id}          - Get job details
    POST /api/jobs/{job_id}/cancel   - Cancel a running job
"""

import os
import json
import asyncio
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# ============================================================
# Lazy imports to avoid circular dependencies
# ============================================================

_celery_app = None
_qc_celery_app = None
_job_repo = None


def get_celery_app():
    """Lazy load Celery app (gpu_tasks / cpu_tasks broker)."""
    global _celery_app
    if _celery_app is None:
        from lib.tasks.gpu_tasks import celery_app
        _celery_app = celery_app
    return _celery_app


def get_qc_celery_app():
    """Lazy load QC Celery app so AsyncResult lookups use the correct app."""
    global _qc_celery_app
    if _qc_celery_app is None:
        try:
            from services.qc.tasks import celery_app as qc_app
            _qc_celery_app = qc_app
        except Exception as e:
            logger.warning(f"Could not load QC celery app, falling back to gpu_tasks app: {e}")
            _qc_celery_app = get_celery_app()
    return _qc_celery_app


def get_celery_app_for_job(job_type: str):
    """Return the appropriate Celery app for a given job type."""
    if job_type == 'qc':
        return get_qc_celery_app()
    return get_celery_app()


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
        # Reconnect if connection was lost
        logger.warning("Reconnecting to PostgreSQL database...")
        connected = await _job_repo.connect()
        if not connected:
            logger.error("Failed to reconnect to PostgreSQL database")
            raise HTTPException(
                status_code=503,
                detail="Database connection failed. Please try again."
            )
    return _job_repo


# ============================================================
# Request/Response Models
# ============================================================

class JobSubmitResponse(BaseModel):
    job_id: str
    status: str
    job_type: str
    stream_url: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: int = 0
    stage: Optional[str] = None
    message: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None


class JobListResponse(BaseModel):
    jobs: list
    total: int
    limit: int
    offset: int


# ============================================================
# Job Submission
# ============================================================

@router.post("/submit/{job_type}", response_model=JobSubmitResponse)
async def submit_job(job_type: str, request: Request):
    """
    Submit a new job to the appropriate Celery queue.
    
    Args:
        job_type: Type of job ('md', 'abfe', 'rbfe', 'docking', 'boltz2', 'qc')
        request: Request body with job parameters
    
    Returns:
        Job ID and stream URL for progress tracking
    """
    # Import GPU tasks
    from lib.tasks.gpu_tasks import (
        md_optimize,
        abfe_calculate,
        rbfe_calculate,
        boltz_predict,
        boltz_batch,
        admet_predict,
    )
    # Import CPU tasks (docking)
    from lib.tasks.cpu_tasks import (
        docking_batch,
        docking_single,
    )
    
    # Parse request body
    try:
        body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {e}")
    
    # Handle QC jobs separately - submit through QC service API
    if job_type == 'qc':
        try:
            from lib.common.config import SERVICE_URLS
            qc_url = SERVICE_URLS.get('qc', 'http://qc:8006')
            
            # Determine the QC endpoint based on the job subtype
            qc_job_type = body.get('qc_job_type', 'standard')  # standard, ir, fukui, conformer
            
            # Map QC job types to endpoints
            endpoint_map = {
                'standard': '/api/qc/jobs',
                'ir': '/api/qc/jobs/ir',
                'fukui': '/api/qc/jobs/fukui',
                'conformer': '/api/qc/jobs/conformer',
            }
            
            endpoint = endpoint_map.get(qc_job_type, '/api/qc/jobs')
            logger.info(f"Routing QC job (type={qc_job_type}) to endpoint: {endpoint}")
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{qc_url}{endpoint}",
                    json=body,
                    timeout=30.0
                )
                
                if response.status_code not in [200, 202]:
                    logger.error(f"QC service returned {response.status_code}: {response.text}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"QC service error: {response.text}"
                    )
                
                result = response.json()
                job_id = result.get('job_id')
                logger.info(f"Submitted {job_type} job {job_id} to QC service (endpoint={endpoint})")
        except httpx.RequestError as e:
            logger.error(f"Failed to connect to QC service: {e}")
            raise HTTPException(status_code=503, detail=f"QC service unavailable: {e}")
        except Exception as e:
            logger.error(f"Failed to submit QC job: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to submit QC job: {e}")
    else:
        # Map job types to tasks for other services
        task_map = {
            'md': md_optimize,
            'abfe': abfe_calculate,
            'rbfe': rbfe_calculate,
            'docking': docking_single,
            'docking_batch': docking_batch,
            'boltz2': boltz_predict,
            'boltz2_batch': boltz_batch,
            'admet': admet_predict,
        }
        
        if job_type not in task_map:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown job type: {job_type}. Available: {list(task_map.keys()) + ['qc']}"
            )
        
        # Submit to Celery
        task = task_map[job_type].delay(body)
        job_id = task.id
        logger.info(f"Submitted {job_type} job {job_id}")
    
    # Create job record in PostgreSQL
    try:
        repo = await get_job_repo()
        await repo.create_job(
            job_id=job_id,
            job_type=job_type,
            input_params=body,
            molecule_name=body.get('molecule_name') or body.get('ligand_name')
        )
    except Exception as e:
        logger.warning(f"Failed to persist job to database: {e}")
    
    return JobSubmitResponse(
        job_id=job_id,
        status="submitted",
        job_type=job_type,
        stream_url=f"/api/jobs/stream/{job_id}",
        message=f"Job submitted to {job_type} queue"
    )


# ============================================================
# Resume RBFE Job (after docking validation)
# ============================================================

@router.post("/resume/rbfe/{job_id}", response_model=JobSubmitResponse)
async def resume_rbfe_job(job_id: str):
    """
    Resume an RBFE calculation after docking validation.
    
    This endpoint:
    1. Retrieves the original job parameters from the database
    2. Submits a new Celery task with docking_acknowledged=True
    3. Uses the same job_id to maintain continuity
    
    Args:
        job_id: The ID of the job to resume (must be in 'docking_ready' status)
    
    Returns:
        Job submission response
    """
    from lib.tasks.gpu_tasks import rbfe_calculate
    
    # Get job from database
    repo = await get_job_repo()
    job = await repo.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    if job.get('job_type') != 'rbfe':
        raise HTTPException(status_code=400, detail=f"Job {job_id} is not an RBFE job")
    
    # Check job status - allow resuming from docking_ready or running (in case result has docking_ready)
    job_status = job.get('status')
    result_status = job.get('result', {}).get('status') if job.get('result') else None
    
    if job_status not in ['running', 'docking_ready'] and result_status != 'docking_ready':
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} cannot be resumed. Status: {job_status}, Result status: {result_status}"
        )
    
    # Get original input parameters
    input_params = job.get('input_params', {})
    if not input_params:
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} has no stored input parameters. Cannot resume."
        )
    
    # Add docking_acknowledged flag
    input_params['docking_acknowledged'] = True
    input_params['job_id'] = job_id  # Use the same job_id
    
    logger.info(f"Resuming RBFE job {job_id} with docking_acknowledged=True")
    
    # Submit to Celery with the same job_id
    # Note: Using apply_async with task_id to preserve the job_id
    task = rbfe_calculate.apply_async(args=[input_params], task_id=job_id)
    
    # Update job status in database
    try:
        await repo.update_status(job_id, 'running', progress=20, stage='Resuming after docking validation')
    except Exception as e:
        logger.warning(f"Failed to update job status in database: {e}")
    
    return JobSubmitResponse(
        job_id=job_id,
        status="running",
        job_type="rbfe",
        stream_url=f"/api/jobs/stream/{job_id}",
        message="RBFE calculation resumed after docking validation"
    )


# ============================================================
# Resume MD Job (after preview)
# ============================================================

@router.post("/resume/md/{job_id}", response_model=JobSubmitResponse)
async def resume_md_job(job_id: str):
    """
    Resume an MD job after preview checkpoint.

    This endpoint:
    1. Retrieves the original job parameters from the database
    2. Submits a new Celery task with preview_acknowledged=True
    3. Uses the same job_id to maintain continuity

    Args:
        job_id: The ID of the job to resume (must be in 'preview_ready' status)

    Returns:
        Job submission response
    """
    from lib.tasks.gpu_tasks import md_optimize

    # Get job from database
    repo = await get_job_repo()
    job = await repo.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.get('job_type') != 'md':
        raise HTTPException(status_code=400, detail=f"Job {job_id} is not an MD job")

    # Check job status - allow resuming from preview_ready or running
    job_status = job.get('status')
    job_stage = job.get('stage')

    if job_stage != 'preview_ready':
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} cannot be resumed. Stage: {job_stage}, Status: {job_status}. Expected stage: preview_ready"
        )

    # Get original input parameters
    input_params = job.get('input_params', {})
    if not input_params:
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} has no stored input parameters. Cannot resume."
        )

    # Add preview_acknowledged flag
    input_params['preview_acknowledged'] = True
    input_params['preview_before_equilibration'] = False  # Don't pause again
    input_params['job_id'] = job_id  # Ensure job_id is preserved

    logger.info(f"Resuming MD job {job_id} with preview_acknowledged=True")

    # Submit to Celery with the same job_id
    # Note: Using apply_async with task_id to preserve the job_id
    task = md_optimize.apply_async(args=[input_params], task_id=job_id)

    # Update job status in database
    try:
        await repo.update_status(job_id, 'running', progress=30, stage='resuming_from_preview')
    except Exception as e:
        logger.warning(f"Failed to update job status in database: {e}")

    return JobSubmitResponse(
        job_id=job_id,
        status="running",
        job_type="md",
        stream_url=f"/api/jobs/stream/{job_id}",
        message="MD job resumed from preview checkpoint"
    )


# ============================================================
# SSE Progress Streaming
# ============================================================

@router.get("/stream/{job_id}")
async def stream_job_progress(job_id: str, request: Request):
    """
    SSE endpoint for real-time job progress updates.
    
    Polls Celery task state and streams updates to frontend.
    On completion, saves result to PostgreSQL.
    
    Args:
        job_id: Celery task ID
    
    Returns:
        Server-Sent Events stream
    """
    async def event_generator():
        celery_app = get_celery_app()
        repo = await get_job_repo()
        
        last_state = None
        last_progress = -1
        poll_count = 0
        max_polls = 86400  # Max 24 hours at 1 poll/sec
        
        while poll_count < max_polls:
            # Check if client disconnected
            if await request.is_disconnected():
                logger.debug(f"Client disconnected from job {job_id} stream")
                break
            
            # Get task state from Celery/Redis
            result = celery_app.AsyncResult(job_id)
            state = result.state
            info = result.info or {}
            
            # Determine current progress
            current_progress = info.get('progress', 0) if isinstance(info, dict) else 0
            
            # Only send update if state or progress changed
            if state != last_state or current_progress != last_progress:
                last_state = state
                last_progress = current_progress
                
                if state == 'PENDING':
                    data = {
                        'status': 'pending',
                        'progress': 0,
                        'message': 'Job queued, waiting for worker'
                    }
                    
                elif state == 'STARTED' or state == 'RUNNING':
                    # Update database with progress
                    raw_stage = info.get('stage', '') if isinstance(info, dict) else ''
                    try:
                        await repo.update_status(
                            job_id, 'running',
                            progress=current_progress,
                            stage=raw_stage
                        )
                    except Exception as e:
                        logger.debug(f"Failed to update progress in DB: {e}")

                    # The MD task stores completed_stages as a comma-joined string in
                    # the stage field (e.g. "preparation,minimization"). Reconstruct the
                    # array so the frontend can tick off stage checkboxes in real time.
                    completed_stages = [s for s in raw_stage.split(',') if s] if raw_stage else []

                    data = {
                        'status': 'running',
                        'progress': current_progress,
                        'stage': raw_stage,
                        'message': info.get('message', '') if isinstance(info, dict) else '',
                        'completed_stages': completed_stages,
                    }
                    
                elif state == 'SUCCESS':
                    # Check if the task actually succeeded or if it returned a failure dict
                    task_result = result.result
                    
                    # Tasks return: {'status': 'COMPLETED'|'FAILED', 'job_id': '...', 'job_type': '...', 'result': {...}, 'error': '...'}
                    # Check the 'status' field in the returned dict
                    # Also check if inner result has success=False (computation failed but task completed)
                    inner_result = task_result.get('result', {}) if isinstance(task_result, dict) else {}
                    inner_success = inner_result.get('success', True) if isinstance(inner_result, dict) else True
                    # Check for error status in the result (preview_ready, minimized_ready are not errors)
                    inner_status = inner_result.get('status') if isinstance(inner_result, dict) else None
                    
                    # Special handling for docking_ready (checkpoint)
                    if inner_status == 'docking_ready':
                        # This is a checkpoint, not a failure
                        # Update DB as 'running' (since docking_ready isn't in DB enum) but with specific stage
                        try:
                            actual_result = task_result.get('result') if isinstance(task_result, dict) else task_result
                            if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                                actual_result = actual_result.get('result')

                            await repo.update_status(
                                job_id, 'running',
                                result=actual_result,
                                stage='docking_ready',
                                progress=inner_result.get('progress', 15) if isinstance(inner_result, dict) else 15
                            )
                        except Exception as e:
                            logger.warning(f"Failed to save docking_ready result to DB: {e}")

                        data = {
                            'status': 'docking_ready',
                            'progress': inner_result.get('progress', 15) if isinstance(inner_result, dict) else 15,
                            'result': actual_result,
                            'message': inner_result.get('message', 'Ready for validation') if isinstance(inner_result, dict) else 'Ready'
                        }

                        yield f"data: {json.dumps(data)}\n\n"
                        break

                    # Special handling for preview_ready (MD checkpoint)
                    if inner_status == 'preview_ready':
                        # This is a checkpoint, not a failure
                        # Update DB as 'running' (since preview_ready isn't in DB enum) but with specific stage
                        try:
                            actual_result = task_result.get('result') if isinstance(task_result, dict) else task_result
                            if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                                actual_result = actual_result.get('result')

                            await repo.update_status(
                                job_id, 'running',
                                result=actual_result,
                                stage='preview_ready',
                                progress=inner_result.get('progress', 30) if isinstance(inner_result, dict) else 30
                            )
                        except Exception as e:
                            logger.warning(f"Failed to save preview_ready result to DB: {e}")

                        data = {
                            'status': 'preview_ready',
                            'progress': inner_result.get('progress', 30) if isinstance(inner_result, dict) else 30,
                            'result': actual_result,
                            'message': inner_result.get('message', 'System ready for preview') if isinstance(inner_result, dict) else 'System ready for preview'
                        }

                        yield f"data: {json.dumps(data)}\n\n"
                        break
                    
                    is_failed = (
                        (isinstance(task_result, dict) and task_result.get('status') == 'FAILED') or
                        (inner_success is False and inner_status != 'docking_ready') or
                        (inner_status == 'error')
                    )
                    
                    if is_failed:
                        # Task returned a failure dict instead of raising an exception
                        # Extract error from various possible locations
                        error_msg = (
                            task_result.get('error') or
                            inner_result.get('error') or
                            (inner_result.get('result', {}).get('error') if isinstance(inner_result.get('result'), dict) else None) or
                            'Task failed without error message'
                        )
                        
                        try:
                            await repo.update_status(
                                job_id, 'failed',
                                error_message=error_msg
                            )
                        except Exception as e:
                            logger.warning(f"Failed to save failure to DB: {e}")
                        
                        data = {
                            'status': 'failed',
                            'progress': 0,
                            'error': error_msg
                        }
                        
                        yield f"data: {json.dumps(data)}\n\n"
                        break  # End stream on failure
                    
                    # Task actually succeeded - extract the result
                    # Extract the actual result from the task wrapper
                    actual_result = task_result.get('result') if isinstance(task_result, dict) else task_result
                    
                    # Service scripts wrap their output as {'success': bool, 'result': {...}}
                    # We need to extract the inner 'result' to avoid double nesting
                    if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                        actual_result = actual_result.get('result')
                    
                    try:
                        await repo.update_status(
                            job_id, 'completed',
                            result=actual_result
                        )
                    except Exception as e:
                        logger.warning(f"Failed to save result to DB: {e}")
                    
                    data = {
                        'status': 'completed',
                        'progress': 100,
                        'result': actual_result
                    }
                    
                    yield f"data: {json.dumps(data)}\n\n"
                    break  # End stream on completion
                    
                elif state == 'FAILURE':
                    error_msg = str(result.result) if result.result else 'Unknown error'
                    
                    # Save failure to PostgreSQL
                    try:
                        await repo.update_status(
                            job_id, 'failed',
                            error_message=error_msg
                        )
                    except Exception as e:
                        logger.warning(f"Failed to save failure to DB: {e}")
                    
                    data = {
                        'status': 'failed',
                        'progress': 0,
                        'error': error_msg
                    }
                    
                    yield f"data: {json.dumps(data)}\n\n"
                    break  # End stream on failure
                    
                elif state == 'REVOKED':
                    try:
                        await repo.update_status(job_id, 'cancelled')
                    except Exception:
                        pass
                    
                    data = {
                        'status': 'cancelled',
                        'progress': 0,
                        'message': 'Job was cancelled'
                    }
                    
                    yield f"data: {json.dumps(data)}\n\n"
                    break
                    
                else:
                    data = {
                        'status': state.lower(),
                        'progress': current_progress
                    }
                
                yield f"data: {json.dumps(data)}\n\n"
            
            poll_count += 1
            await asyncio.sleep(0.5)  # Poll every 500ms
        
        # Send final message if we hit max polls
        if poll_count >= max_polls:
            yield f"data: {json.dumps({'status': 'timeout', 'message': 'Stream timeout'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Access-Control-Allow-Origin": "*",
        }
    )


# ============================================================
# Job Status and Listing
# ============================================================

@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Get current job status.
    
    Checks both Celery (for running jobs) and PostgreSQL (for completed jobs).
    """
    celery_app = get_celery_app()
    
    # First check Celery for live status
    result = celery_app.AsyncResult(job_id)
    state = result.state
    info = result.info or {}
    
    if state == 'SUCCESS':
        # Check if the task actually succeeded or if it returned a failure dict
        task_result = result.result
        
        # Tasks return: {'status': 'COMPLETED'|'FAILED', 'job_id': '...', 'job_type': '...', 'result': {...}, 'error': '...'}
        if isinstance(task_result, dict) and task_result.get('status') == 'FAILED':
            # Task returned a failure dict instead of raising an exception
            error_msg = task_result.get('error', 'Task failed without error message')
            return JobStatusResponse(
                job_id=job_id,
                status='failed',
                progress=0,
                error=error_msg
            )
        
        return JobStatusResponse(
            job_id=job_id,
            status='completed',
            progress=100,
            result=task_result
        )
    elif state == 'FAILURE':
        return JobStatusResponse(
            job_id=job_id,
            status='failed',
            progress=0,
            error=str(result.result) if result.result else 'Unknown error'
        )
    elif state in ('STARTED', 'RUNNING'):
        return JobStatusResponse(
            job_id=job_id,
            status='running',
            progress=info.get('progress', 0) if isinstance(info, dict) else 0,
            stage=info.get('stage', '') if isinstance(info, dict) else None,
            message=info.get('message', '') if isinstance(info, dict) else None
        )
    elif state == 'PENDING':
        # Check if job exists in database (might be old completed job)
        try:
            repo = await get_job_repo()
            job = await repo.get_job(job_id)
            if job:
                return JobStatusResponse(
                    job_id=job_id,
                    status=job.get('status', 'pending'),
                    progress=job.get('progress', 0),
                    stage=job.get('stage'),
                    result=job.get('result'),
                    error=job.get('error_message')
                )
        except Exception:
            pass
        
        return JobStatusResponse(
            job_id=job_id,
            status='pending',
            progress=0
        )
    else:
        return JobStatusResponse(
            job_id=job_id,
            status=state.lower(),
            progress=0
        )


@router.get("/list", response_model=JobListResponse)
async def list_jobs(
    job_type: Optional[str] = Query(None, description="Filter by job type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """
    List jobs with optional filters.

    For each job, checks Celery for live status updates (running, pending)
    and updates the database if the status has changed.

    Also detects and cleans up stale jobs from previous sessions.
    """
    try:
        repo = await get_job_repo()

        jobs = await repo.list_jobs(
            job_type=job_type,
            status=status,
            limit=limit,
            offset=offset
        )

        # Check Celery for live status updates on each job
        for job in jobs:
            job_id = job.get('id')
            if not job_id:
                continue

            # Use job-type-specific Celery app for accurate status lookup
            job_celery_app = get_celery_app_for_job(job.get('job_type', ''))

            # Get live Celery status
            result = job_celery_app.AsyncResult(job_id)
            celery_state = result.state

            # Detect stale jobs: DB shows running/pending/submitted but Celery has no record and job is old
            db_status = job.get('status')
            created_at = job.get('created_at')

            # Check if this might be a stale job
            if celery_state == 'PENDING' and db_status in ('running', 'pending', 'submitted'):
                # Parse created_at timestamp
                try:
                    from datetime import datetime, timezone
                    if isinstance(created_at, str):
                        job_created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    else:
                        job_created = created_at

                    # If job is older than 5 minutes and Celery doesn't know about it, it's stale
                    now = datetime.now(timezone.utc)
                    age_minutes = (now - job_created.replace(tzinfo=timezone.utc)).total_seconds() / 60

                    if age_minutes > 5:
                        # This is a stale job - mark as failed
                        logger.warning(f"Detected stale {job.get('job_type', 'unknown')} job {job_id} (age: {age_minutes:.1f}min, status: {db_status})")
                        await repo.update_status(
                            job_id, 'failed',
                            error_message='Job lost due to system restart or worker failure'
                        )
                        job['status'] = 'failed'
                        job['error_message'] = 'Job lost due to system restart or worker failure'
                        continue
                except Exception as e:
                    logger.debug(f"Failed to check job age for {job_id}: {e}")

            # Map Celery state to our status
            live_status = None
            if celery_state == 'PENDING':
                live_status = 'pending'
            elif celery_state in ('STARTED', 'RUNNING'):
                live_status = 'running'
            elif celery_state == 'SUCCESS':
                # Check result content for special states like docking_ready
                try:
                    task_result = result.result
                    inner_result = task_result.get('result', {}) if isinstance(task_result, dict) else {}
                    inner_status = inner_result.get('status') if isinstance(inner_result, dict) else None
                    
                    # Check deeper for nested status in result (common in RBFE docking_ready)
                    if not inner_status and isinstance(inner_result, dict) and 'result' in inner_result:
                         inner_status = inner_result['result'].get('status') if isinstance(inner_result['result'], dict) else None
                    
                    if inner_status == 'docking_ready':
                        live_status = 'running'  # Map to running in DB
                        # Note: We rely on the stage='docking_ready' update to distinguish
                    else:
                        live_status = 'completed'
                except Exception:
                    live_status = 'completed'
            elif celery_state in ('FAILURE', 'REVOKED'):
                live_status = 'failed'
            
            # Update job status if Celery has newer info
            if live_status and job.get('status') != live_status:
                # Special handling: if job is 'running' with stage 'docking_ready' in DB, 
                # and live_status is 'running' (because of above check), don't overwrite if unnecessary
                
                # Update database with live status
                try:
                    if live_status == 'running':
                        info = result.info or {}
                        # If it's SUCCESS (docking_ready), info might be empty, use result
                        if celery_state == 'SUCCESS' and inner_status == 'docking_ready':
                             # Extract actual result, handling potential double nesting
                             actual_result = task_result.get('result') if isinstance(task_result, dict) else None
                             if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                                 actual_result = actual_result.get('result')

                             await repo.update_status(
                                job_id, 'running',
                                stage='docking_ready',
                                result=actual_result
                            )
                        else:
                            await repo.update_status(
                                job_id, 'running',
                                progress=info.get('progress', 0) if isinstance(info, dict) else 0,
                                stage=info.get('stage', '') if isinstance(info, dict) else ''
                            )
                    elif live_status == 'completed':
                        await repo.update_status(job_id, 'completed')
                    elif live_status == 'failed':
                        await repo.update_status(job_id, 'failed')
                except Exception as e:
                    logger.debug(f"Failed to update job {job_id} status in DB: {e}")
                
                # Update the returned job object with live status
                job['status'] = live_status
        
        total = await repo.get_job_count(job_type=job_type, status=status)
        
        return JobListResponse(
            jobs=jobs,
            total=total,
            limit=limit,
            offset=offset
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Failed to get job list: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}")
async def get_job(job_id: str):
    """
    Get full job details from PostgreSQL with live Celery progress updates.
    
    For running jobs, this endpoint checks Celery for the latest progress,
    stage, and message information and merges it with the PostgreSQL data.
    
    For completed jobs with missing results, syncs from Celery/Redis to PostgreSQL.
    """
    try:
        repo = await get_job_repo()
        job = await repo.get_job(job_id)
        
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        celery_app = get_celery_app_for_job(job.get('job_type', ''))
        result = celery_app.AsyncResult(job_id)
        
        # If job is running, check Celery for live progress updates
        if job.get('status') in ['running', 'submitted', 'preparing', 'pending']:
            # Get Celery task state and info
            if result.state in ['STARTED', 'RUNNING']:
                info = result.info or {}
                if isinstance(info, dict):
                    # Merge Celery progress info into job data
                    job['progress'] = info.get('progress', job.get('progress', 0))
                    job['stage'] = info.get('stage', job.get('stage', ''))
                    job['message'] = info.get('message', job.get('message', ''))
                    job['updated_at'] = info.get('updated_at', job.get('updated_at'))
            
            # Check if job completed in Celery but PostgreSQL wasn't updated
            elif result.state == 'SUCCESS':
                task_result = result.result
                if isinstance(task_result, dict):
                    # Check if it's a failure wrapped as success
                    # Also check if inner result has success=False (computation failed but task completed)
                    inner_result = task_result.get('result', {}) if isinstance(task_result, dict) else {}
                    inner_success = inner_result.get('success', True) if isinstance(inner_result, dict) else True
                    inner_status = inner_result.get('result', {}).get('status') if isinstance(inner_result, dict) else None
                    if not inner_status:
                        inner_status = inner_result.get('status')
                    
                    # Special handling for docking_ready
                    if inner_status == 'docking_ready':
                         actual_result = task_result.get('result') if 'result' in task_result else task_result
                         if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                            actual_result = actual_result.get('result')
                         
                         # Update DB
                         await repo.update_status(job_id, 'running', stage='docking_ready', result=actual_result)
                         
                         # Return as docking_ready
                         job['status'] = 'docking_ready'
                         job['stage'] = 'docking_ready'
                         job['result'] = actual_result
                         job['progress'] = inner_result.get('progress', 15)
                         return job

                    is_failed = (
                        task_result.get('status') == 'FAILED' or
                        (inner_success is False and inner_status != 'docking_ready') or
                        inner_status == 'failed'
                    )
                    
                    if is_failed:
                        # Extract error from various possible locations
                        error_msg = (
                            task_result.get('error') or
                            inner_result.get('error') or
                            (inner_result.get('result', {}).get('error') if isinstance(inner_result.get('result'), dict) else None) or
                            'Task failed'
                        )
                        await repo.update_status(job_id, 'failed', error_message=error_msg)
                        job['status'] = 'failed'
                        job['error_message'] = error_msg
                    else:
                        # Extract actual result from wrapper
                        actual_result = task_result.get('result') if 'result' in task_result else task_result
                        if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                            actual_result = actual_result.get('result')
                        
                        # Save to PostgreSQL
                        await repo.update_status(job_id, 'completed', result=actual_result)
                        job['status'] = 'completed'
                        job['result'] = actual_result
                        job['progress'] = 100
                        logger.info(f"Synced completed result for job {job_id} from Celery to PostgreSQL")
        
        # If job shows as completed but has no result, try to sync from Celery
        elif job.get('status') == 'completed' and not job.get('result'):
            if result.state == 'SUCCESS':
                task_result = result.result
                if isinstance(task_result, dict):
                    # Extract actual result from wrapper
                    actual_result = task_result.get('result') if 'result' in task_result else task_result
                    if isinstance(actual_result, dict) and 'result' in actual_result and 'success' in actual_result:
                        actual_result = actual_result.get('result')
                    
                    if actual_result:
                        # Check if it's actually docking_ready
                        res_status = actual_result.get('status') if isinstance(actual_result, dict) else None
                        
                        if res_status == 'docking_ready':
                             await repo.update_status(job_id, 'running', stage='docking_ready', result=actual_result)
                             job['status'] = 'docking_ready'
                             job['stage'] = 'docking_ready'
                        else:
                            # Save to PostgreSQL
                            await repo.update_status(job_id, 'completed', result=actual_result)
                        
                        job['result'] = actual_result
                        logger.info(f"Backfilled result for job {job_id} from Celery to PostgreSQL")
        
        # Final check: if job is marked as completed but result indicates failure, fix the status
        if job.get('status') == 'completed' and job.get('result'):
            result_data = job.get('result')
            if isinstance(result_data, dict):
                # Check for failure indicators in the result
                inner_success = result_data.get('success', True)
                inner_status = result_data.get('status')
                inner_result = result_data.get('result', {})
                nested_status = inner_result.get('status') if isinstance(inner_result, dict) else None
                
                # Check for docking_ready (should be running, not completed, but if it is completed, allow it)
                if inner_status == 'docking_ready' or nested_status == 'docking_ready':
                    job['status'] = 'docking_ready'
                    return job
                
                if inner_success is False or inner_status == 'failed' or nested_status == 'failed':
                    # Extract error message
                    error_msg = (
                        result_data.get('error') or
                        (inner_result.get('error') if isinstance(inner_result, dict) else None) or
                        'Computation failed'
                    )
                    await repo.update_status(job_id, 'failed', error_message=error_msg)
                    job['status'] = 'failed'
                    job['error_message'] = error_msg
                    logger.info(f"Fixed incorrect 'completed' status for job {job_id} - actually failed")
        
        return job
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Job Cancellation
# ============================================================

@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str):
    """
    Cancel a running job or mark a stuck job as cancelled.
    
    For running jobs: revokes the Celery task and updates DB.
    For stuck jobs (already completed in Celery but pending in DB): just updates DB.
    """
    # Look up job type to use the correct Celery app for revocation
    try:
        repo = await get_job_repo()
        job = await repo.get_job(job_id)
        job_type = job.get('job_type', '') if job else ''
    except Exception:
        job_type = ''

    celery_app = get_celery_app_for_job(job_type)
    
    # Check if job exists and is running
    result = celery_app.AsyncResult(job_id)
    
    # Only revoke if the task is still pending/running
    if result.state not in ('SUCCESS', 'FAILURE'):
        # Revoke the task
        celery_app.control.revoke(job_id, terminate=True)
    
    # Always update database to mark as cancelled
    try:
        cancel_repo = await get_job_repo()
        await cancel_repo.update_status(job_id, 'cancelled')
    except Exception as e:
        logger.warning(f"Failed to update cancelled status in DB: {e}")
    
    logger.info(f"Cancelled job {job_id}")
    
    return {"job_id": job_id, "status": "cancelled", "message": "Cancellation requested"}


# ============================================================
# Job Deletion
# ============================================================

@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """
    Delete a job record from the database.

    Note: This only deletes the database record, not any output files.
    """
    try:
        repo = await get_job_repo()
        deleted = await repo.delete_job(job_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Job not found")

        return {"job_id": job_id, "status": "deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Stale Job Cleanup
# ============================================================

@router.post("/cleanup-stale")
async def cleanup_stale_jobs(
    age_minutes: int = Query(5, ge=1, description="Minimum age in minutes for a job to be considered stale")
):
    """
    Clean up stale jobs from previous sessions.

    A job is considered stale if:
    - Its status is 'running' or 'pending' in the database
    - The Celery task no longer exists (state='PENDING')
    - The job was created more than `age_minutes` ago

    This endpoint is useful after system restarts to clean up zombie jobs.

    Args:
        age_minutes: Minimum age in minutes (default: 5)

    Returns:
        Count of jobs cleaned up
    """
    try:
        from datetime import datetime, timezone

        repo = await get_job_repo()

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

            # Use the job-type-specific Celery app for accurate status lookup
            job_celery_app = get_celery_app_for_job(job.get('job_type', ''))
            result = job_celery_app.AsyncResult(job_id)
            celery_state = result.state

            # Only clean up if Celery doesn't know about this task
            if celery_state != 'PENDING':
                continue

            # Check job age
            created_at = job.get('created_at')
            try:
                if isinstance(created_at, str):
                    job_created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    job_created = created_at

                now = datetime.now(timezone.utc)
                age = (now - job_created.replace(tzinfo=timezone.utc)).total_seconds() / 60

                if age > age_minutes:
                    # Mark as failed
                    logger.info(f"Cleaning up stale {job.get('job_type', 'unknown')} job {job_id} (age: {age:.1f}min, status: {job.get('status')})")
                    await repo.update_status(
                        job_id, 'failed',
                        error_message='Job lost due to system restart or worker failure'
                    )
                    cleaned_count += 1
            except Exception as e:
                logger.warning(f"Failed to process job {job_id} during cleanup: {e}")
                continue

        logger.info(f"Stale job cleanup complete: {cleaned_count} jobs marked as failed")
        return {
            "cleaned": cleaned_count,
            "message": f"Marked {cleaned_count} stale jobs as failed"
        }

    except Exception as e:
        logger.error(f"Failed to cleanup stale jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
