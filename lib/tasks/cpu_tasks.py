"""
Celery tasks for CPU-intensive computations.

This module defines asynchronous Celery tasks for:
- Batch docking (multiple ligands)
- Single ligand docking

Tasks are routed to the 'cpu' queue for parallel execution with configurable concurrency.

Usage:
    from lib.tasks.cpu_tasks import docking_batch
    
    # Submit task
    task = docking_batch.delay(job_data)
    
    # Get result
    result = task.get()  # Blocking
    # or
    result = celery_app.AsyncResult(task.id)  # Non-blocking
"""

import os
import logging
from typing import Dict, Any

from celery import Celery, Task
from celery.exceptions import SoftTimeLimitExceeded
from datetime import datetime

logger = logging.getLogger(__name__)

# ============================================================
# Celery App Configuration
# ============================================================

celery_app = Celery(
    'ligandx_cpu_tasks',
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

    # Task routing
    task_routes={
        'ligandx_cpu_tasks.docking_batch': {'queue': 'cpu'},
        'ligandx_cpu_tasks.docking_single': {'queue': 'cpu'},
    },

    # Task time limits
    task_soft_time_limit=3600,   # 1 hour soft limit
    task_time_limit=3900,        # 1.08 hours hard limit

    # Worker settings - CPU workers can prefetch more tasks
    worker_prefetch_multiplier=4,  # Prefetch 4 tasks per worker (CPU can handle more)
    task_acks_late=True,           # Acknowledge after completion
    task_reject_on_worker_lost=False,  # Don't requeue on worker crash

    # RabbitMQ-specific broker options
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,

    # Message acknowledgment settings
    broker_transport_options={
        'visibility_timeout': 4500,  # 1.25 hours
        'confirm_publish': True,
        'max_retries': 3,
        'interval_start': 0,
        'interval_step': 2,
        'interval_max': 30,
        'client_properties': {'connection_name': 'CPU Worker Tasks'},
    },

    # Queue durability - Development: non-durable (don't persist across restarts)
    #                   Production: durable (survive broker restart)
    task_queue_durable=not IS_DEVELOPMENT,
    task_queue_auto_delete=IS_DEVELOPMENT,  # Auto-delete queues in dev after all consumers disconnect
)

# Export as 'celery' for CLI compatibility
celery = celery_app


# ============================================================
# Base Task Class
# ============================================================

class LigandXCPUTask(Task):
    """Base task class for CPU tasks with error handling and progress updates."""
    
    abstract = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log task failures."""
        logger.error(f"CPU Task {task_id} failed: {exc}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Log task successes."""
        logger.info(f"CPU Task {task_id} completed successfully")
    
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
# Batch Docking Task
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXCPUTask,
    name='ligandx_cpu_tasks.docking_batch',
    soft_time_limit=3600,  # 1 hour per batch
    time_limit=3900
)
def docking_batch(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run batch docking for multiple ligands.
    
    This task runs on CPU workers with higher concurrency,
    allowing multiple docking jobs to run in parallel.
    
    Args:
        job_data: Dictionary containing:
            - protein_pdb_data: PDB structure
            - ligands: List of ligand data (SMILES or SDF)
            - box_center: Docking box center [x, y, z]
            - box_size: Docking box size [x, y, z]
            - exhaustiveness: Search exhaustiveness
    
    Returns:
        Dictionary with docking results for all ligands
    """
    job_id = self.request.id
    logger.info(f"Starting batch docking job {job_id}")
    
    ligands = job_data.get('ligands', [])
    total_ligands = len(ligands)
    
    if total_ligands == 0:
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'docking',
            'error': 'No ligands provided'
        }
    
    self.update_progress(0, 'Starting', f'Docking {total_ligands} ligands')
    
    results = []
    failed = []
    
    try:
        from lib.services.runner import call_service
        
        for i, ligand in enumerate(ligands):
            ligand_name = ligand.get('name', f'ligand_{i+1}')
            
            progress = int((i / total_ligands) * 100)
            self.update_progress(
                progress, 
                'Docking', 
                f'Processing {ligand_name} ({i+1}/{total_ligands})'
            )
            
            # Prepare single docking job
            single_job = {
                'protein_pdb_data': job_data.get('protein_pdb_data'),
                'ligand_smiles': ligand.get('smiles'),
                'ligand_sdf_data': ligand.get('sdf_data'),
                'ligand_name': ligand_name,
                'box_center': job_data.get('box_center'),
                'box_size': job_data.get('box_size'),
                'exhaustiveness': job_data.get('exhaustiveness', 8),
            }
            
            try:
                result = call_service('docking', single_job, timeout=600)
                results.append({
                    'ligand_name': ligand_name,
                    'status': 'success',
                    'result': result
                })
            except Exception as e:
                logger.warning(f"Docking failed for {ligand_name}: {e}")
                failed.append({
                    'ligand_name': ligand_name,
                    'status': 'failed',
                    'error': str(e)
                })
        
        self.update_progress(100, 'Completed', f'Docked {len(results)}/{total_ligands} ligands')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'docking',
            'results': results,
            'failed': failed,
            'summary': {
                'total': total_ligands,
                'successful': len(results),
                'failed': len(failed)
            },
            'completed_at': datetime.now().isoformat()
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"Batch docking job {job_id} exceeded time limit")
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'docking',
            'error': 'Job exceeded time limit',
            'partial_results': results,
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Batch docking job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'docking',
            'error': str(e),
            'partial_results': results,
            'completed_at': datetime.now().isoformat()
        }


# ============================================================
# Single Docking Task (for async single ligand docking)
# ============================================================

@celery_app.task(
    bind=True,
    base=LigandXCPUTask,
    name='ligandx_cpu_tasks.docking_single',
    soft_time_limit=600,  # 10 minutes
    time_limit=660
)
def docking_single(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run single ligand docking as async task.
    
    Args:
        job_data: Docking parameters for single ligand
    
    Returns:
        Docking result
    """
    job_id = self.request.id
    logger.info(f"Starting single docking job {job_id}")
    
    self.update_progress(0, 'Starting', 'Preparing docking')
    
    try:
        from lib.services.runner import call_service
        
        self.update_progress(10, 'Docking', 'Running AutoDock Vina')
        
        result = call_service('docking', job_data, timeout=600)
        
        self.update_progress(100, 'Completed', 'Docking finished')
        
        return {
            'status': 'COMPLETED',
            'job_id': job_id,
            'job_type': 'docking',
            'result': result,
            'completed_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Docking job {job_id} failed: {e}", exc_info=True)
        return {
            'status': 'FAILED',
            'job_id': job_id,
            'job_type': 'docking',
            'error': str(e),
            'completed_at': datetime.now().isoformat()
        }

