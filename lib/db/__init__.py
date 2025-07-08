"""
Database module for Ligand-X job persistence.

Provides PostgreSQL-based storage for job metadata and results,
with Redis used for in-flight Celery task state.
"""

from lib.db.job_repository import JobRepository, get_job_repository

__all__ = ['JobRepository', 'get_job_repository']
