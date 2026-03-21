"""
Celery tasks for GPU-intensive computations.

This module defines asynchronous Celery tasks for:
- MD optimization (GPU, gpu-short queue)
- ABFE calculations (GPU, gpu-long queue)
- RBFE calculations (GPU, gpu-long queue)
- Boltz2 predictions (GPU, gpu-short queue)

Queue Architecture:
- gpu-short: Fast/lightweight GPU tasks (MD minimization, Boltz2)
  Consumed by worker-gpu-short with concurrency=2
- gpu-long: Long-running GPU tasks (ABFE, RBFE calculations)
  Consumed by worker-gpu-long with concurrency=1

This separation prevents GPU contention between long-running tasks.
Short tasks can run concurrently, but only one long task runs at a time.

For CPU-intensive tasks, see lib.tasks.cpu_tasks.

Usage:
    from lib.tasks.gpu_tasks import md_optimize
    
    # Submit task
    task = md_optimize.delay(job_data)
    
    # Get result
    result = task.get()  # Blocking
    # or
    result = celery_app.AsyncResult(task.id)  # Non-blocking
"""

import os
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from celery import Celery, Task
from celery.exceptions import SoftTimeLimitExceeded

logger = logging.getLogger(__name__)

# ============================================================
# Celery App Configuration
# ============================================================

celery_app = Celery(
    'ligandx_tasks',
    broker=os.getenv('CELERY_BROKER_URL', 'amqp://ligandx:ligandx@rabbitmq:5672/'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
)

# Determine if we're in development mode
IS_DEVELOPMENT = os.getenv('NODE_ENV', 'production') == 'development' or os.getenv('LOG_LEVEL', 'INFO') == 'DEBUG'

celery_app.conf.update(
    # Task tracking
    task_track_started=True,
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],

    # Timezone
    timezone='UTC',
    enable_utc=True,

    # Result expiration (keep results for 7 days)
    result_expires=604800,

    # Task routing - two GPU queues for different workload types
    # gpu-short: Fast jobs (MD, Boltz2, ADMET) - consumed by worker-gpu-short (concurrency=2)
    # gpu-long: Long jobs (ABFE, RBFE) - consumed by worker-gpu-long (concurrency=1)
    # This prevents GPU contention between long-running tasks
    task_routes={
        'ligandx_tasks.md_optimize': {'queue': 'gpu-short'},
        'ligandx_tasks.boltz_predict': {'queue': 'gpu-short'},
        'ligandx_tasks.boltz_batch': {'queue': 'gpu-long'},
        'ligandx_tasks.admet_predict': {'queue': 'gpu-short'},
        'ligandx_tasks.abfe_calculate': {'queue': 'gpu-long'},
        'ligandx_tasks.rbfe_calculate': {'queue': 'gpu-long'},
        'ligandx_tasks.rbfe_mapping_preview': {'queue': 'gpu-short'},
        'ligandx_tasks.qc_calculate': {'queue': 'qc'},
    },

    # Task time limits
    task_soft_time_limit=86400,  # 24 hours soft limit
    task_time_limit=90000,       # 25 hours hard limit

    # Worker settings - CRITICAL for message acknowledgment
    worker_prefetch_multiplier=1,  # Prefetch only 1 task at a time (prevents double receipt)
    task_acks_late=True,           # Acknowledge AFTER task completes (prevents redelivery)
    task_reject_on_worker_lost=False,  # Don't requeue if worker crashes
    task_acks_on_failure_or_timeout=True,  # Acknowledge even on failure/timeout

    # RabbitMQ-specific broker options
    broker_connection_retry_on_startup=True,  # Retry connection on startup
    broker_connection_retry=True,  # Retry on connection loss
    broker_connection_max_retries=10,  # Max retry attempts

    # Message acknowledgment settings (RabbitMQ)
    broker_transport_options={
        'visibility_timeout': 108000,  # 30 hours (RabbitMQ uses this as consumer timeout)
        'confirm_publish': True,  # Publisher confirms (ensures message delivery)
        'max_retries': 3,  # Connection retry attempts
        'interval_start': 0,  # Initial retry delay (seconds)
        'interval_step': 2,  # Retry delay increment
        'interval_max': 30,  # Max retry delay
        'client_properties': {'connection_name': 'GPU Worker Tasks'},
    },

    # Queue durability - Development: non-durable (don't persist across restarts)
    #                   Production: durable (survive broker restart)
    task_queue_durable=not IS_DEVELOPMENT,
    task_queue_auto_delete=IS_DEVELOPMENT,  # Auto-delete queues in dev after all consumers disconnect

    # Result backend settings (Redis)
    result_backend_transport_options={
        'visibility_timeout': 3600,  # 1 hour for result backend
    },
)

# Export as 'celery' for CLI compatibility
celery = celery_app


# ============================================================
# Base Task Class
# ============================================================

class LigandXTask(Task):
    """Base task class with error handling and progress updates."""
    
    abstract = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log task failures."""
        logger.error(f"Task {task_id} failed: {exc}")
        # Could add notification here (email, Slack, etc.)
    
    def on_success(self, retval, task_id, args, kwargs):
        """Log task successes."""
        logger.info(f"Task {task_id} completed successfully")
    
    def update_progress(self, progress: int, stage: str = '', message: str = ''):
        """
        Update task progress state.
        
        Args:
            progress: Progress percentage (0-100)
            stage: Current execution stage
            message: Progress message
        """
        self.update_state(
            state='RUNNING',
            meta={
                'progress': progress,
                'stage': stage,
                'message': message,
                'updated_at': datetime.now().isoformat()
            }
        )


# ============================================================
# MD Optimization Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.md_optimize',
    soft_time_limit=7200,  # 2 hours
    time_limit=7500
)
def md_optimize(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run MD optimization as background task.
    
    This task runs on a GPU worker with concurrency=1,
    ensuring only one MD job uses the GPU at a time.
    
    Streams progress updates from the MD service to Celery state,
    which are then polled by the SSE endpoint.
    
    Args:
        job_data: Dictionary containing:
            - protein_pdb_data: PDB structure data
            - ligand_smiles: Ligand SMILES string
            - ligand_sdf_data: Optional SDF data
            - system_id: System identifier
            - n_steps: Number of MD steps
            - temperature: Simulation temperature
    
    Returns:
        Dictionary with optimization results
    """
    job_id = self.request.id
    logger.info(f"Starting MD optimization job {job_id}")
    
    self.update_progress(0, 'Starting', 'Initializing MD optimization')
    
    try:
        # Import here to avoid loading heavy dependencies at module level
        from lib.services.runner import call_service_with_progress
        
        self.update_progress(5, 'Preparing', 'Setting up simulation')
        
        # Add job_id to job_data so service creates unique output directory
        job_data_with_id = {**job_data, 'job_id': job_id}
        
        # Call the MD service with progress streaming
        result = None
        for update in call_service_with_progress('md', job_data_with_id, timeout=7200):
            if update['type'] == 'progress':
                # Parse progress data and update Celery state
                progress_data = update['data']
                progress = progress_data.get('progress', 0)
                status = progress_data.get('status', 'Running')
                completed_stages = progress_data.get('completed_stages', [])
                
                # Update Celery task state with progress
                self.update_progress(
                    progress,
                    stage=','.join(completed_stages) if completed_stages else 'running',
                    message=status
                )
                logger.info(f"[MD {job_id}] Progress: {progress}% - {status}")
                
            elif update['type'] == 'result':
                result = update['data']
                logger.info(f"[MD {job_id}] Service returned result")
                
            elif update['type'] == 'error':
                error_data = update['data']
                error_msg = error_data.get('error', 'Unknown error')
                logger.error(f"[MD {job_id}] Service error: {error_msg}")
                raise Exception(error_msg)
        
        self.update_progress(100, 'Completed', 'MD optimization finished')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'md',
            'result': result,
            'completed_at': datetime.now().isoformat()
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"MD job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'md',
            'error': 'Job exceeded time limit (2 hours)',
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"MD job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'md',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# ABFE Calculation Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.abfe_calculate',
    soft_time_limit=86400,  # 24 hours
    time_limit=90000
)
def abfe_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run ABFE (Absolute Binding Free Energy) calculation.
    
    ABFE calculations can take many hours. Progress is tracked
    through the Celery state mechanism and streamed to frontend via SSE.
    
    Args:
        job_data: Dictionary containing:
            - protein_pdb_data: PDB structure
            - ligand_sdf_data: Ligand SDF
            - ligand_name: Ligand identifier
            - protocol_settings: ABFE protocol parameters
    
    Returns:
        Dictionary with ABFE results including binding free energy
    """
    job_id = self.request.id
    logger.info(f"Starting ABFE calculation job {job_id}")
    
    # Idempotency check: Prevent duplicate execution if task is redelivered
    # Check if this job already completed by looking for result files
    from pathlib import Path
    job_output_dir = Path(f"data/abfe_outputs/{job_id}")
    result_file = job_output_dir / "protocol_result.json"
    if result_file.exists():
        logger.warning(f"ABFE job {job_id} already completed - result file exists. Skipping duplicate execution.")
        # Return cached result
        try:
            import json
            with open(result_file, 'r') as f:
                cached_result = json.load(f)
            return {
                'status': 'COMPLETED',
                'job_id': job_id,
                'job_type': 'abfe',
                'result': {
                    'success': True,
                    'result': {
                        'status': 'completed',
                        'binding_free_energy_kcal_mol': cached_result.get('binding_free_energy_kcal_mol'),
                        'job_dir': str(job_output_dir),
                        'from_cache': True
                    }
                },
                'completed_at': datetime.now().isoformat(),
                'note': 'Result loaded from cache - task was previously completed'
            }
        except Exception as cache_err:
            logger.warning(f"Failed to load cached result: {cache_err}. Will re-run calculation.")
    
    self.update_progress(0, 'Starting', 'Initializing ABFE calculation')
    
    try:
        from lib.services.runner import call_service_with_progress
        
        self.update_progress(5, 'Setup', 'Preparing system')
        
        # CRITICAL: Inject job_id into job_data so the service uses the correct output directory
        # Without this, all jobs would use the default 'abfe_job' directory and overwrite each other
        job_data_with_id = {**job_data, 'job_id': job_id}
        
        # ABFE calculations are long-running
        result = None
        for update in call_service_with_progress('abfe', job_data_with_id, timeout=86400):
            if update['type'] == 'progress':
                progress_data = update['data']
                progress = progress_data.get('progress', 0)
                status = progress_data.get('status', 'Running')
                
                self.update_progress(progress, 'running', status)
                logger.info(f"[ABFE {job_id}] Progress: {progress}% - {status}")
                
            elif update['type'] == 'result':
                result = update['data']
                logger.info(f"[ABFE {job_id}] Service returned result")
                
            elif update['type'] == 'error':
                error_data = update['data']
                error_msg = error_data.get('error', 'Unknown error')
                logger.error(f"[ABFE {job_id}] Service error: {error_msg}")
                raise Exception(error_msg)
        
        self.update_progress(100, 'Completed', 'ABFE calculation finished')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'abfe',
            'result': result,
            'completed_at': datetime.now().isoformat()
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"ABFE job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'abfe',
            'error': 'Job exceeded time limit (24 hours)',
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"ABFE job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'abfe',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# RBFE Calculation Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.rbfe_calculate',
    soft_time_limit=86400,  # 24 hours
    time_limit=90000
)
def rbfe_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run RBFE (Relative Binding Free Energy) calculation.
    
    RBFE calculates relative binding free energies between
    pairs of ligands, useful for lead optimization.
    Progress is streamed to frontend via SSE.
    
    Args:
        job_data: Dictionary containing:
            - protein_pdb_data: PDB structure
            - ligands: List of ligand data
            - network: Transformation network
            - protocol_settings: RBFE protocol parameters
    
    Returns:
        Dictionary with RBFE results and network analysis
    """
    job_id = self.request.id
    logger.info(f"Starting RBFE calculation job {job_id}")
    
    # Idempotency check: Prevent duplicate execution if task is redelivered
    from pathlib import Path
    job_output_dir = Path(f"data/rbfe_outputs/{job_id}")
    result_file = job_output_dir / "results.json"
    if result_file.exists():
        logger.warning(f"RBFE job {job_id} already completed - result file exists. Skipping duplicate execution.")
        try:
            import json
            with open(result_file, 'r') as f:
                cached_result = json.load(f)
            return {
                'status': 'COMPLETED',
                'job_id': job_id,
                'job_type': 'rbfe',
                'result': {
                    'success': True,
                    'result': cached_result,
                    'from_cache': True
                },
                'completed_at': datetime.now().isoformat(),
                'note': 'Result loaded from cache - task was previously completed'
            }
        except Exception as cache_err:
            logger.warning(f"Failed to load cached result: {cache_err}. Will re-run calculation.")
    
    self.update_progress(0, 'Starting', 'Initializing RBFE calculation')
    
    try:
        from lib.services.runner import call_service_with_progress
        
        self.update_progress(5, 'Setup', 'Building transformation network')
        
        # CRITICAL: Inject job_id into job_data so the service uses the correct output directory
        job_data_with_id = {**job_data, 'job_id': job_id}
        
        result = None
        for update in call_service_with_progress('rbfe', job_data_with_id, timeout=86400):
            if update['type'] == 'progress':
                progress_data = update['data']
                progress = progress_data.get('progress', 0)
                status = progress_data.get('status', 'Running')
                
                self.update_progress(progress, 'running', status)
                logger.info(f"[RBFE {job_id}] Progress: {progress}% - {status}")
                
            elif update['type'] == 'result':
                result = update['data']
                logger.info(f"[RBFE {job_id}] Service returned result")
                
            elif update['type'] == 'error':
                error_data = update['data']
                error_msg = error_data.get('error', 'Unknown error')
                logger.error(f"[RBFE {job_id}] Service error: {error_msg}")
                raise Exception(error_msg)
        
        self.update_progress(100, 'Completed', 'RBFE calculation finished')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'rbfe',
            'result': result,
            'completed_at': datetime.now().isoformat()
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"RBFE job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'rbfe',
            'error': 'Job exceeded time limit (24 hours)',
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"RBFE job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'rbfe',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# RBFE Atom Mapping Preview Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.rbfe_mapping_preview',
    soft_time_limit=600,   # 10 minutes
    time_limit=660,
)
def rbfe_mapping_preview(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run RBFE atom mapping preview (CPU-only, no simulation).

    Computes all pairwise atom mappings for the supplied ligands using the
    selected atom mapper and returns per-pair highlight SVGs and quality scores.
    No protein structure or simulation is required.

    Runs on gpu-short queue so the biochem-md conda environment (which includes
    OpenFE and RDKit) is available.

    Args:
        job_data: Dictionary containing:
            - ligands: List of ligand data dicts (id, data, format)
            - atom_mapper: 'kartograf', 'lomap', or 'lomap_relaxed'
            - atom_map_hydrogens: bool (Kartograf)
            - lomap_max3d: float (LOMAP)
            - charge_method: ignored (no charges needed for mapping)

    Returns:
        Dictionary with pairwise mapping results and SVGs.
    """
    job_id = self.request.id
    logger.info(f"Starting RBFE mapping preview job {job_id}")

    self.update_progress(0, 'Starting', 'Initializing atom mapping preview')

    try:
        from lib.services.runner import call_service_with_progress

        job_data_with_id = {**job_data, 'job_id': job_id}

        self.update_progress(10, 'Mapping', 'Running atom mapper')

        result = None
        for update in call_service_with_progress('rbfe_mapping_preview', job_data_with_id, timeout=600):
            if update['type'] == 'progress':
                progress_data = update['data']
                self.update_progress(
                    progress_data.get('progress', 10),
                    'mapping',
                    progress_data.get('status', 'Running'),
                )
            elif update['type'] == 'result':
                result = update['data']
            elif update['type'] == 'error':
                raise Exception(update['data'].get('error', 'Unknown error'))

        self.update_progress(100, 'Completed', 'Mapping preview finished')

        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'rbfe_mapping_preview',
            'result': result,
            'completed_at': datetime.now().isoformat(),
        }

    except SoftTimeLimitExceeded:
        logger.error(f"RBFE mapping preview job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'rbfe_mapping_preview',
            'error': 'Job exceeded time limit (10 minutes)',
            'completed_at': datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"RBFE mapping preview job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'rbfe_mapping_preview',
            'error': str(e),
            'completed_at': datetime.now().isoformat(),
        }


# ============================================================
# Boltz2 Prediction Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.boltz_batch',
    soft_time_limit=36000,  # 10 hours for large batches
    time_limit=39600
)
def boltz_batch(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run batch Boltz2 predictions for multiple ligands.

    Processes ligands sequentially, updating progress after each completion.
    Results are accumulated and returned as a structured batch result.

    Args:
        job_data: Dictionary containing:
            - protein_pdb_data: Protein PDB data
            - ligands: List of ligand dicts with {id, name, data, format}
            - prediction_params: Boltz2 prediction parameters
            - accelerator: 'gpu' or 'cpu'
            - msa_sequence_hash: Optional MSA hash
            - alignment_options: Optional alignment settings

    Returns:
        Dictionary with batch results including results[], failed[], summary
    """
    job_id = self.request.id
    logger.info(f"Starting Boltz2 batch prediction job {job_id}")

    self.update_progress(0, 'Starting', 'Initializing batch prediction')

    try:
        import requests
        from lib.common.config import SERVICE_URLS

        boltz2_url = SERVICE_URLS.get('boltz2', 'http://boltz2:8005')

        ligands = job_data.get('ligands', [])
        total_ligands = len(ligands)

        if total_ligands == 0:
            raise Exception('No ligands provided for batch prediction')

        protein_pdb_data = job_data.get('protein_pdb_data')
        if not protein_pdb_data:
            raise Exception('No protein PDB data provided')

        prediction_params = job_data.get('prediction_params', {})
        accelerator = job_data.get('accelerator', 'gpu')
        msa_sequence_hash = job_data.get('msa_sequence_hash')
        alignment_options = job_data.get('alignment_options')

        results = []
        failed = []

        logger.info(f"[Boltz2 Batch {job_id}] Processing {total_ligands} ligands")

        for idx, ligand in enumerate(ligands):
            ligand_id = ligand.get('id', f'ligand_{idx}')
            ligand_name = ligand.get('name', ligand_id)
            ligand_data = ligand.get('data', '')
            ligand_format = ligand.get('format', 'sdf')

            progress_percent = int((idx / total_ligands) * 90) + 5  # 5-95% range
            self.update_progress(
                progress_percent,
                'Processing',
                f'Processing ligand {idx + 1}/{total_ligands}: {ligand_name}'
            )

            logger.info(f"[Boltz2 Batch {job_id}] Processing ligand {idx + 1}/{total_ligands}: {ligand_name}")

            try:
                # Prepare request data for single prediction
                request_data = {
                    'protein_pdb_data': protein_pdb_data,
                    'ligand_data': ligand_data,
                    'num_poses': prediction_params.get('num_poses', 5),
                    'accelerator': accelerator,
                    'prediction_params': prediction_params,
                }

                if msa_sequence_hash:
                    request_data['msa_sequence_hash'] = msa_sequence_hash
                if alignment_options:
                    request_data['alignment_options'] = alignment_options

                # Call Boltz2 service for single prediction
                response = requests.post(
                    f"{boltz2_url}/api/boltz2/predict",
                    json=request_data,
                    timeout=1800  # 30 minutes per ligand
                )

                if response.status_code != 200:
                    error_msg = f"Boltz2 service returned {response.status_code}"
                    logger.warning(f"[Boltz2 Batch {job_id}] Ligand {ligand_name} failed: {error_msg}")
                    failed.append({
                        'ligand_id': ligand_id,
                        'ligand_name': ligand_name,
                        'error': error_msg,
                        'success': False
                    })
                    continue

                result = response.json()

                if not result.get('success'):
                    error_msg = result.get('error', 'Prediction failed')
                    logger.warning(f"[Boltz2 Batch {job_id}] Ligand {ligand_name} failed: {error_msg}")
                    failed.append({
                        'ligand_id': ligand_id,
                        'ligand_name': ligand_name,
                        'error': error_msg,
                        'success': False
                    })
                    continue

                # Extract result data
                result_data = result.get('results', {})
                # Per-pose metrics (confidence_score, ptm, etc.) live inside poses,
                # not at the top level of result_data. Pull them from the first pose.
                poses = result_data.get('poses', [])
                first_pose = poses[0] if poses else {}
                ligand_result = {
                    'ligand_id': ligand_id,
                    'ligand_name': ligand_name,
                    'success': True,
                    'affinity_pred_value': result_data.get('affinity_pred_value'),
                    'binding_free_energy': result_data.get('binding_free_energy'),
                    'affinity_probability_binary': result_data.get('affinity_probability_binary'),
                    'prediction_confidence': result_data.get('prediction_confidence'),
                    'aggregate_score': result_data.get('aggregate_score') or first_pose.get('aggregate_score'),
                    'confidence_score': result_data.get('confidence_score') or first_pose.get('confidence_score'),
                    'ptm': result_data.get('ptm') or first_pose.get('ptm'),
                    'iptm': result_data.get('iptm') or first_pose.get('iptm'),
                    'complex_plddt': result_data.get('complex_plddt') or first_pose.get('complex_plddt'),
                    'poses': poses,
                }
                results.append(ligand_result)
                logger.info(f"[Boltz2 Batch {job_id}] Ligand {ligand_name} completed successfully")

            except Exception as e:
                logger.warning(f"[Boltz2 Batch {job_id}] Ligand {ligand_name} exception: {e}")
                failed.append({
                    'ligand_id': ligand_id,
                    'ligand_name': ligand_name,
                    'error': str(e),
                    'success': False
                })

        # Calculate summary
        successful_count = len(results)
        failed_count = len(failed)

        # Find best affinity
        affinities = [r.get('affinity_pred_value') for r in results if r.get('affinity_pred_value') is not None]
        best_affinity = min(affinities) if affinities else None

        self.update_progress(100, 'Completed', f'Batch complete: {successful_count} successful, {failed_count} failed')

        logger.info(f"[Boltz2 Batch {job_id}] Completed: {successful_count} successful, {failed_count} failed")

        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'boltz2_batch',
            'result': {
                'success': True,
                'batch_id': job_id,
                'total_ligands': total_ligands,
                'completed': successful_count,
                'failed': failed_count,
                'results': results,
                'failed_ligands': failed,
                'best_affinity': best_affinity,
                'summary': {
                    'total': total_ligands,
                    'successful': successful_count,
                    'failed': failed_count,
                    'best_affinity': best_affinity,
                }
            },
            'completed_at': datetime.now().isoformat()
        }

    except SoftTimeLimitExceeded:
        logger.error(f"Boltz2 batch job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'boltz2_batch',
            'error': 'Batch job exceeded time limit (10 hours)',
            'completed_at': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Boltz2 batch job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'boltz2_batch',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.boltz_predict',
    soft_time_limit=3600,  # 1 hour
    time_limit=3900
)
def boltz_predict(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run Boltz2 structure prediction via HTTP API.
    
    Progress is streamed to frontend via SSE.
    
    Args:
        job_data: Dictionary containing:
            - protein_pdb_data: Protein PDB data
            - ligand_smiles: Ligand SMILES
            - num_poses: Number of poses to generate
            - accelerator: 'gpu' or 'cpu'
            - msa_data: Optional MSA sequence hash
    
    Returns:
        Dictionary with predicted structure
    """
    job_id = self.request.id
    logger.info(f"Starting Boltz2 prediction job {job_id}")
    
    self.update_progress(0, 'Starting', 'Initializing Boltz2')
    
    try:
        import requests
        from lib.common.config import SERVICE_URLS
        
        boltz2_url = SERVICE_URLS.get('boltz2', 'http://boltz2:8005')
        
        # Prepare request data for Boltz2 service
        # Handle both field names (ligand_data from frontend, ligand_smiles from legacy)
        ligand_data = job_data.get('ligand_data') or job_data.get('ligand_smiles')
        msa_hash = job_data.get('msa_sequence_hash') or job_data.get('msa_data')
        
        request_data = {
            'protein_pdb_data': job_data.get('protein_pdb_data'),
            'ligand_data': ligand_data,
            'num_poses': job_data.get('num_poses', 5),
            'accelerator': job_data.get('accelerator', 'gpu'),
            'prediction_params': {},
        }
        
        if msa_hash:
            request_data['msa_sequence_hash'] = msa_hash
        
        self.update_progress(10, 'Predicting', 'Calling Boltz2 service')
        logger.info(f"[Boltz2 {job_id}] Calling Boltz2 service at {boltz2_url}/api/boltz2/predict")
        
        # Call Boltz2 service synchronously
        response = requests.post(
            f"{boltz2_url}/api/boltz2/predict",
            json=request_data,
            timeout=3600  # 1 hour timeout
        )
        
        if response.status_code != 200:
            error_msg = f"Boltz2 service returned {response.status_code}: {response.text}"
            logger.error(f"[Boltz2 {job_id}] {error_msg}")
            raise Exception(error_msg)
        
        result = response.json()
        
        if not result.get('success'):
            error_msg = result.get('error', 'Boltz2 prediction failed')
            logger.error(f"[Boltz2 {job_id}] Service error: {error_msg}")
            raise Exception(error_msg)
        
        logger.info(f"[Boltz2 {job_id}] Prediction completed successfully")
        self.update_progress(100, 'Completed', 'Prediction finished')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'boltz2',
            'result': result.get('results', {}),
            'completed_at': datetime.now().isoformat()
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"Boltz2 job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'boltz2',
            'error': 'Job exceeded time limit (1 hour)',
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Boltz2 job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'boltz2',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# ADMET Prediction Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.admet_predict',
    soft_time_limit=300,  # 5 minutes
    time_limit=360
)
def admet_predict(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run ADMET prediction via HTTP API.
    
    This task calls the ADMET service to predict ADMET properties.
    Results are cached in PostgreSQL to avoid duplicate calculations.
    
    Args:
        job_data: Dictionary containing:
            - smiles: SMILES string of the molecule
            - pdb_data: Optional PDB data (alternative to SMILES)
            - molecule_name: Optional molecule name
    
    Returns:
        Dictionary with ADMET predictions
    """
    job_id = self.request.id
    logger.info(f"Starting ADMET prediction job {job_id}")
    
    self.update_progress(0, 'Starting', 'Initializing ADMET prediction')
    
    try:
        import requests
        from lib.common.config import SERVICE_URLS
        
        admet_url = SERVICE_URLS.get('admet', 'http://admet:8004')
        
        # Prepare request data
        request_data = {}
        if job_data.get('smiles'):
            request_data['smiles'] = job_data['smiles']
        if job_data.get('pdb_data'):
            request_data['pdb_data'] = job_data['pdb_data']
        
        self.update_progress(20, 'Predicting', 'Calling ADMET service')
        logger.info(f"[ADMET {job_id}] Calling ADMET service at {admet_url}/predict_admet")
        
        # Call ADMET service synchronously
        response = requests.post(
            f"{admet_url}/predict_admet",
            json=request_data,
            timeout=300  # 5 minute timeout
        )
        
        if response.status_code != 200:
            error_msg = f"ADMET service returned {response.status_code}: {response.text}"
            logger.error(f"[ADMET {job_id}] {error_msg}")
            raise Exception(error_msg)
        
        result = response.json()
        
        logger.info(f"[ADMET {job_id}] Prediction completed successfully")
        self.update_progress(100, 'Completed', 'ADMET prediction finished')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'admet',
            'result': result,
            'completed_at': datetime.now().isoformat()
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"ADMET job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'admet',
            'error': 'Job exceeded time limit (5 minutes)',
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"ADMET job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'admet',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# QC Calculation Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXTask,
    name='ligandx_tasks.qc_calculate',
    soft_time_limit=1800,  # 30 minutes
    time_limit=1950
)
def qc_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run QC (Quantum Chemistry) calculation using ORCA.
    
    This task directly calls the QC service's Celery tasks and polls them
    until completion, then returns the results.
    
    Args:
        job_data: Dictionary containing:
            - molecule_xyz: XYZ coordinate string
            - molecule_name: Name of the molecule
            - charge: Molecular charge
            - multiplicity: Spin multiplicity
            - method: QC method (e.g., 'B3LYP')
            - basis_set: Basis set (e.g., 'def2-SVP')
            - job_type: 'SP', 'OPT', 'FREQ', 'OPT_FREQ'
            - n_procs: Number of CPU cores
            - memory_mb: Memory limit in MB
            - preset: Method preset name
            - calculate_properties: Whether to calculate properties
    
    Returns:
        Dictionary with calculation results
    """
    job_id = self.request.id
    logger.info(f"Starting QC calculation job {job_id}")
    
    self.update_progress(0, 'Starting', 'Initializing QC calculation')
    
    try:
        from celery.result import AsyncResult
        from time import sleep
        
        # Import QC Celery tasks directly
        from services.qc.tasks import run_orca_job_opi, calculate_fukui_indices, perform_conformer_search
        
        self.update_progress(10, 'Submitting', 'Submitting job to QC worker')
        
        # Determine which QC task to submit based on job type
        job_type = job_data.get('job_type', 'SP').upper()
        
        if job_type == 'FUKUI':
            # Submit Fukui calculation
            qc_task = calculate_fukui_indices.delay(job_data)
            logger.info(f"[QC {job_id}] Submitted Fukui calculation as {qc_task.id}")
        elif job_type == 'CONFORMER':
            # Submit conformer search
            qc_task = perform_conformer_search.delay(job_data)
            logger.info(f"[QC {job_id}] Submitted conformer search as {qc_task.id}")
        else:
            # Submit standard ORCA job (SP, OPT, FREQ, OPT_FREQ, etc.)
            qc_task = run_orca_job_opi.delay(job_data)
            logger.info(f"[QC {job_id}] Submitted ORCA calculation as {qc_task.id}")
        
        self.update_progress(20, 'Queued', 'Job queued in QC worker')
        
        # Poll the QC task until completion
        poll_count = 0
        max_polls = 180  # 30 minutes at 10-second intervals
        
        while poll_count < max_polls:
            sleep(10)  # Poll every 10 seconds
            poll_count += 1
            
            # Check task status
            task_status = qc_task.status
            
            if task_status == 'PENDING':
                self.update_progress(
                    20,
                    'Queued',
                    f'Waiting for QC worker ({poll_count * 10}s elapsed)'
                )
                logger.info(f"[QC {job_id}] Task still pending...")
                
            elif task_status == 'STARTED':
                progress = 20 + (poll_count / max_polls) * 70  # 20-90% while running
                self.update_progress(
                    int(progress),
                    'Running',
                    f'QC calculation in progress ({poll_count * 10}s elapsed)'
                )
                logger.info(f"[QC {job_id}] Task running...")
                
            elif task_status == 'SUCCESS':
                logger.info(f"[QC {job_id}] Calculation completed")
                
                # Get final results from the QC task
                final_result = qc_task.get()
                
                self.update_progress(100, 'Completed', 'QC calculation finished')
                
                return {
                    'status': 'COMPLETED',
                    'job_id': job_id,
                    'job_type': 'qc',
                    'result': final_result,
                    'completed_at': datetime.now().isoformat()
                }
                
            elif task_status == 'FAILURE':
                error_msg = str(qc_task.info) if qc_task.info else 'QC calculation failed'
                logger.error(f"[QC {job_id}] QC task failed: {error_msg}")
                raise Exception(f"QC calculation failed: {error_msg}")
            
            elif task_status == 'REVOKED':
                logger.error(f"[QC {job_id}] QC task was revoked")
                raise Exception("QC calculation was cancelled")
            
            else:
                logger.debug(f"[QC {job_id}] Task status: {task_status}")
        
        # Timeout
        logger.error(f"[QC {job_id}] Polling timeout after {max_polls * 10} seconds")
        raise Exception("QC calculation polling timeout (30 minutes)")
        
    except SoftTimeLimitExceeded:
        logger.error(f"QC job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'qc',
            'error': 'Job exceeded time limit (30 minutes)',
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"QC job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'qc',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# Utility Functions
# ============================================================

def get_task_status(task_id: str) -> Dict[str, Any]:
    """
    Get the status of a Celery task.
    
    Args:
        task_id: Celery task ID
    
    Returns:
        Dictionary with task status and metadata
    """
    result = celery_app.AsyncResult(task_id)
    
    response = {
        'task_id': task_id,
        'state': result.state,
    }
    
    if result.state == 'PENDING':
        response['status'] = 'pending'
        response['progress'] = 0
    elif result.state == 'RUNNING':
        info = result.info or {}
        response['status'] = 'running'
        response['progress'] = info.get('progress', 0)
        response['stage'] = info.get('stage', '')
        response['message'] = info.get('message', '')
    elif result.state == 'SUCCESS':
        response['status'] = 'completed'
        response['progress'] = 100
        response['result'] = result.result
    elif result.state == 'FAILURE':
        response['status'] = 'failed'
        response['error'] = str(result.result) if result.result else 'Unknown error'
    else:
        response['status'] = result.state.lower()
    
    return response


def cancel_task(task_id: str) -> bool:
    """
    Cancel a running task.
    
    Args:
        task_id: Celery task ID
    
    Returns:
        True if cancellation was sent
    """
    celery_app.control.revoke(task_id, terminate=True)
    logger.info(f"Sent cancellation for task {task_id}")
    return True
