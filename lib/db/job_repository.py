"""
PostgreSQL Job Repository for persistent job storage.

This module provides async database operations for job management.
Jobs are created when submitted to Celery, updated during execution,
and results are stored on completion.

Usage:
    from lib.db import get_job_repository
    
    repo = get_job_repository()
    await repo.connect()
    
    # Create job
    job = await repo.create_job(job_id, 'md', {'protein': '...'})
    
    # Update status
    await repo.update_status(job_id, 'running')
    
    # Store result
    await repo.update_status(job_id, 'completed', result={'energy': -10.5})
"""

import os
import uuid
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# Try to import asyncpg, fall back to sync mode if not available
try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    ASYNCPG_AVAILABLE = False
    logger.warning("asyncpg not installed. Database operations will be disabled.")


class JobRepository:
    """
    PostgreSQL repository for job persistence.
    
    Stores job metadata, input parameters, and results in PostgreSQL.
    Designed for async FastAPI operations.
    """
    
    def __init__(self, database_url: Optional[str] = None):
        """
        Initialize repository with database URL.
        
        Args:
            database_url: PostgreSQL connection string.
                         Defaults to DATABASE_URL environment variable.
        """
        self.database_url = database_url or os.getenv(
            'DATABASE_URL', 
            'postgresql://ligandx:ligandx@localhost:5432/ligandx'
        )
        self.pool: Optional['asyncpg.Pool'] = None
        self._connected = False
    
    async def connect(self) -> bool:
        """
        Establish connection pool to PostgreSQL.
        
        Returns:
            True if connected successfully, False otherwise.
        """
        if not ASYNCPG_AVAILABLE:
            logger.error("Cannot connect: asyncpg not installed")
            return False
        
        if self._connected and self.pool:
            return True
        
        try:
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=2,
                max_size=10,
                command_timeout=60
            )
            self._connected = True
            logger.info("Connected to PostgreSQL")
            
            # Ensure tables exist
            await self._ensure_tables()
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            self._connected = False
            return False
    
    async def close(self):
        """Close the connection pool."""
        if self.pool:
            await self.pool.close()
            self._connected = False
            logger.info("Disconnected from PostgreSQL")
    
    async def _ensure_tables(self):
        """Create tables if they don't exist."""
        if not self.pool:
            return
        
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id UUID PRIMARY KEY,
                    job_type VARCHAR(50) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    started_at TIMESTAMP WITH TIME ZONE,
                    completed_at TIMESTAMP WITH TIME ZONE,
                    input_params JSONB NOT NULL,
                    result JSONB,
                    error_message TEXT,
                    user_id VARCHAR(255),
                    molecule_name VARCHAR(255),
                    progress INTEGER DEFAULT 0,
                    stage VARCHAR(255),
                    CONSTRAINT valid_status CHECK (
                        status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
                    )
                )
            """)
            
            # Create indexes
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id) 
                WHERE user_id IS NOT NULL
            """)
            
            logger.info("Database tables ensured")
    
    async def _publish_job_update(
        self,
        job_id: str,
        status: str,
        progress: Optional[int] = None,
        stage: Optional[str] = None,
        job_type: Optional[str] = None,
        error_message: Optional[str] = None,
        result: Optional[Dict] = None
    ):
        """
        Publish job update to Redis for WebSocket broadcast.
        
        This is called after database updates to notify connected clients
        in real-time. Failures are logged but don't affect the main operation.
        """
        try:
            from lib.common.redis_client import get_redis_manager
            
            redis_mgr = get_redis_manager()
            if not redis_mgr.is_connected:
                await redis_mgr.connect()
            
            if redis_mgr.is_connected:
                await redis_mgr.publish_job_update(
                    job_id=job_id,
                    status=status,
                    progress=progress,
                    stage=stage,
                    job_type=job_type,
                    error_message=error_message,
                    result=result
                )
        except Exception as e:
            # Don't fail the main operation if Redis publish fails
            logger.debug(f"Failed to publish job update to Redis: {e}")
    
    async def create_job(
        self,
        job_id: str,
        job_type: str,
        input_params: Dict[str, Any],
        molecule_name: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new job record.
        
        Args:
            job_id: Unique job identifier (usually Celery task ID)
            job_type: Type of job ('md', 'abfe', 'rbfe', 'docking', 'qc')
            input_params: Job input parameters
            molecule_name: Optional molecule name for display
            user_id: Optional user identifier
        
        Returns:
            Created job record as dictionary
        """
        if not self.pool:
            logger.warning("Database not connected, job not persisted")
            return {
                'id': job_id,
                'job_type': job_type,
                'status': 'pending',
                'created_at': datetime.now().isoformat()
            }
        
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO jobs (id, job_type, input_params, molecule_name, user_id, status)
                VALUES ($1, $2, $3, $4, $5, 'pending')
                RETURNING id, job_type, status, created_at, molecule_name
                """,
                uuid.UUID(job_id),
                job_type,
                json.dumps(input_params),
                molecule_name,
                user_id
            )
            
            result = dict(row)
            result['id'] = str(result['id'])
            result['created_at'] = result['created_at'].isoformat()
            
            logger.info(f"Created job {job_id} of type {job_type}")
            return result
    
    async def update_status(
        self,
        job_id: str,
        status: str,
        result: Optional[Dict] = None,
        error_message: Optional[str] = None,
        progress: Optional[int] = None,
        stage: Optional[str] = None
    ):
        """
        Update job status and optionally store result.
        
        Also publishes the update to Redis pub/sub for real-time WebSocket notifications.
        
        Args:
            job_id: Job identifier
            status: New status ('pending', 'running', 'completed', 'failed', 'cancelled')
            result: Job result data (for completed jobs)
            error_message: Error message (for failed jobs)
            progress: Progress percentage (0-100)
            stage: Current execution stage description
        """
        job_type = None
        
        if not self.pool:
            logger.warning(f"Database not connected, status update for {job_id} not persisted")
        else:
            async with self.pool.acquire() as conn:
                if status == 'running':
                    row = await conn.fetchrow(
                        """
                        UPDATE jobs 
                        SET status = $1, started_at = NOW(), progress = COALESCE($3, progress), stage = COALESCE($4, stage)
                        WHERE id = $2
                        RETURNING job_type
                        """,
                        status, uuid.UUID(job_id), progress, stage
                    )
                    if row:
                        job_type = row['job_type']
                elif status in ('completed', 'failed', 'cancelled'):
                    row = await conn.fetchrow(
                        """
                        UPDATE jobs 
                        SET status = $1, completed_at = NOW(), result = $2, error_message = $3, progress = 100
                        WHERE id = $4
                        RETURNING job_type
                        """,
                        status,
                        json.dumps(result) if result else None,
                        error_message,
                        uuid.UUID(job_id)
                    )
                    if row:
                        job_type = row['job_type']
                    # Set progress to 100 for terminal states
                    progress = 100
                else:
                    # Just update progress/stage
                    row = await conn.fetchrow(
                        """
                        UPDATE jobs 
                        SET progress = COALESCE($2, progress), stage = COALESCE($3, stage)
                        WHERE id = $1
                        RETURNING job_type
                        """,
                        uuid.UUID(job_id), progress, stage
                    )
                    if row:
                        job_type = row['job_type']
            
            logger.debug(f"Updated job {job_id} status to {status}")
        
        # Publish update to Redis for WebSocket broadcast
        await self._publish_job_update(
            job_id=job_id,
            status=status,
            progress=progress,
            stage=stage,
            job_type=job_type,
            error_message=error_message,
            result=result
        )
    
    async def update_progress(
        self,
        job_id: str,
        progress: int,
        stage: Optional[str] = None,
        message: Optional[str] = None
    ):
        """
        Update job progress without changing status.
        
        Also publishes the update to Redis pub/sub for real-time WebSocket notifications.
        
        Args:
            job_id: Job identifier
            progress: Progress percentage (0-100)
            stage: Current execution stage
            message: Progress message
        """
        job_type = None
        
        if not self.pool:
            return
        
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE jobs 
                SET progress = $2, stage = COALESCE($3, stage)
                WHERE id = $1
                RETURNING job_type, status
                """,
                uuid.UUID(job_id), progress, stage
            )
            if row:
                job_type = row['job_type']
                status = row['status']
        
        # Publish progress update to Redis for WebSocket broadcast
        await self._publish_job_update(
            job_id=job_id,
            status=status if 'status' in dir() else 'running',
            progress=progress,
            stage=stage,
            job_type=job_type
        )
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get job by ID.
        
        Args:
            job_id: Job identifier
        
        Returns:
            Job record as dictionary, or None if not found
        """
        if not self.pool:
            logger.warning("Database not connected")
            return None
        
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM jobs WHERE id = $1",
                uuid.UUID(job_id)
            )
            
            if row:
                result = dict(row)
                result['id'] = str(result['id'])
                
                # Convert timestamps to ISO format
                for field in ['created_at', 'started_at', 'completed_at']:
                    if result.get(field):
                        result[field] = result[field].isoformat()
                
                # Parse JSONB fields
                if result.get('input_params'):
                    result['input_params'] = json.loads(result['input_params']) if isinstance(result['input_params'], str) else result['input_params']
                if result.get('result'):
                    result['result'] = json.loads(result['result']) if isinstance(result['result'], str) else result['result']
                
                return result
            
            return None
    
    async def list_jobs(
        self,
        job_type: Optional[str] = None,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List jobs with optional filters.
        
        Args:
            job_type: Filter by job type
            status: Filter by status
            user_id: Filter by user
            limit: Maximum number of results
            offset: Pagination offset
        
        Returns:
            List of job records
        """
        if not self.pool:
            logger.warning("Database not connected")
            return []
        
        # Build query dynamically
        conditions = []
        params = []
        param_idx = 1
        
        if job_type:
            conditions.append(f"job_type = ${param_idx}")
            params.append(job_type)
            param_idx += 1
        
        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1
        
        if user_id:
            conditions.append(f"user_id = ${param_idx}")
            params.append(user_id)
            param_idx += 1
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        query = f"""
            SELECT id, job_type, status, created_at, started_at, completed_at, 
                   molecule_name, progress, stage, error_message, input_params, result
            FROM jobs 
            WHERE {where_clause}
            ORDER BY created_at DESC 
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([limit, offset])
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            
            results = []
            for row in rows:
                job = dict(row)
                job['id'] = str(job['id'])
                
                for field in ['created_at', 'started_at', 'completed_at']:
                    if job.get(field):
                        job[field] = job[field].isoformat()
                
                # Parse JSONB fields
                if job.get('input_params'):
                    job['input_params'] = json.loads(job['input_params']) if isinstance(job['input_params'], str) else job['input_params']
                if job.get('result'):
                    job['result'] = json.loads(job['result']) if isinstance(job['result'], str) else job['result']
                
                results.append(job)
            
            return results
    
    async def delete_job(self, job_id: str) -> bool:
        """
        Delete a job record.
        
        Args:
            job_id: Job identifier
        
        Returns:
            True if deleted, False if not found
        """
        if not self.pool:
            return False
        
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM jobs WHERE id = $1",
                uuid.UUID(job_id)
            )
            return result == "DELETE 1"
    
    async def get_job_count(
        self,
        job_type: Optional[str] = None,
        status: Optional[str] = None
    ) -> int:
        """Get count of jobs matching filters."""
        if not self.pool:
            return 0
        
        conditions = []
        params = []
        param_idx = 1
        
        if job_type:
            conditions.append(f"job_type = ${param_idx}")
            params.append(job_type)
            param_idx += 1
        
        if status:
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        async with self.pool.acquire() as conn:
            result = await conn.fetchval(
                f"SELECT COUNT(*) FROM jobs WHERE {where_clause}",
                *params
            )
            return result or 0


# Singleton instance
_repository: Optional[JobRepository] = None


def get_job_repository() -> JobRepository:
    """
    Get the singleton JobRepository instance.
    
    Returns:
        JobRepository instance (may not be connected yet)
    """
    global _repository
    if _repository is None:
        _repository = JobRepository()
    return _repository


@asynccontextmanager
async def get_db_connection():
    """
    Context manager for database operations.
    
    Usage:
        async with get_db_connection() as repo:
            job = await repo.get_job(job_id)
    """
    repo = get_job_repository()
    if not repo._connected:
        await repo.connect()
    try:
        yield repo
    finally:
        pass  # Keep connection pool open
