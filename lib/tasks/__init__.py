"""
Celery tasks module for Ligand-X background job processing.

Provides task definitions for:
- GPU-intensive computations (MD, ABFE, RBFE, Boltz2)
- CPU-intensive computations (batch docking)
"""

from lib.tasks.gpu_tasks import (
    celery_app as gpu_celery_app,
    md_optimize,
    abfe_calculate,
    rbfe_calculate,
    boltz_predict,
    admet_predict,
)

from lib.tasks.cpu_tasks import (
    celery_app as cpu_celery_app,
    docking_batch,
    docking_single,
)

# Export primary celery app (GPU)
celery_app = gpu_celery_app

__all__ = [
    # Celery apps
    'celery_app',
    'gpu_celery_app',
    'cpu_celery_app',
    # GPU tasks
    'md_optimize',
    'abfe_calculate',
    'rbfe_calculate',
    'boltz_predict',
    'admet_predict',
    # CPU tasks
    'docking_batch',
    'docking_single',
]
