"""Job monitoring and status tracking utilities."""

import asyncio
import httpx
from typing import List, Dict, Any, Optional, Set
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class JobMonitor:
    """Monitor Celery job status via Ligand-X API."""

    def __init__(
        self,
        api_base_url: str,
        check_interval: int = 10,
        timeout: int = 86400,
        job_type: str = "generic"
    ):
        """
        Initialize job monitor.

        Args:
            api_base_url: Base URL for Ligand-X API
            check_interval: Seconds between status checks
            timeout: Maximum seconds to wait for job completion
            job_type: Type of job (rbfe, abfe, docking, etc.)
        """
        self.api_base_url = api_base_url
        self.check_interval = check_interval
        self.timeout = timeout
        self.job_type = job_type
        self.client = httpx.AsyncClient(timeout=30.0)

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get current job status.

        Args:
            job_id: Job UUID

        Returns:
            Job status data
        """
        # Try service-specific endpoints first based on job type
        endpoints_to_try = []
        
        if self.job_type == "rbfe":
            endpoints_to_try.append(f"{self.api_base_url}/api/rbfe/status/{job_id}")
        elif self.job_type == "abfe":
            endpoints_to_try.append(f"{self.api_base_url}/api/abfe/status/{job_id}")
        
        # Always try the gateway endpoint as fallback
        endpoints_to_try.append(f"{self.api_base_url}/api/jobs/{job_id}")
        endpoints_to_try.append(f"{self.api_base_url}/api/jobs/status/{job_id}")
        
        last_error = None
        for url in endpoints_to_try:
            try:
                response = await self.client.get(url)
                if response.status_code == 200:
                    return response.json()
            except Exception as e:
                last_error = e
                continue
        
        # If all endpoints failed, raise the last error
        if last_error:
            raise last_error
        raise httpx.HTTPStatusError("All status endpoints failed", request=None, response=None)

    async def wait_for_job(
        self,
        job_id: str,
        job_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Wait for a single job to complete.

        Args:
            job_id: Job UUID
            job_name: Optional job name for logging

        Returns:
            Final job status

        Raises:
            TimeoutError: If job doesn't complete within timeout
            RuntimeError: If job fails
        """
        name = job_name or job_id[:8]
        logger.info(f"Monitoring job {name} ({job_id})")

        start_time = datetime.now()
        last_progress = -1

        while True:
            # Check timeout
            if (datetime.now() - start_time).total_seconds() > self.timeout:
                raise TimeoutError(f"Job {name} exceeded timeout of {self.timeout}s")

            # Get status
            try:
                status = await self.get_job_status(job_id)
            except Exception as e:
                logger.warning(f"Failed to get status for {name}: {e}")
                await asyncio.sleep(self.check_interval)
                continue

            # Log progress
            job_status = status.get("status", "unknown")
            progress = status.get("progress", 0)

            if progress != last_progress:
                logger.info(f"Job {name}: {job_status} - {progress}%")
                last_progress = progress

            # Check completion
            if job_status == "completed":
                logger.info(f"Job {name} completed successfully")
                return status

            if job_status in ["failed", "error"]:
                error_msg = status.get("error", "Unknown error")
                logger.error(f"Job {name} failed: {error_msg}")
                raise RuntimeError(f"Job {name} failed: {error_msg}")

            # Wait before next check
            await asyncio.sleep(self.check_interval)

    async def wait_for_jobs(
        self,
        job_ids: List[str],
        job_names: Optional[Dict[str, str]] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Wait for multiple jobs to complete in parallel.

        Args:
            job_ids: List of job UUIDs
            job_names: Optional mapping of job_id -> name for logging

        Returns:
            Dictionary mapping job_id -> final status
        """
        job_names = job_names or {}

        logger.info(f"Monitoring {len(job_ids)} jobs in parallel")

        tasks = [
            self.wait_for_job(job_id, job_names.get(job_id))
            for job_id in job_ids
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        final_statuses = {}
        for job_id, result in zip(job_ids, results):
            if isinstance(result, Exception):
                logger.error(f"Job {job_id} failed: {result}")
                raise result
            final_statuses[job_id] = result

        logger.info(f"All {len(job_ids)} jobs completed")
        return final_statuses

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


async def wait_for_jobs(
    job_ids: List[str],
    api_base_url: str,
    check_interval: int = 10,
    timeout: int = 86400,
    job_names: Optional[Dict[str, str]] = None,
    job_type: str = "generic"
) -> Dict[str, Dict[str, Any]]:
    """
    Convenience function to wait for multiple jobs.

    Args:
        job_ids: List of job UUIDs
        api_base_url: Base URL for Ligand-X API
        check_interval: Seconds between status checks
        timeout: Maximum seconds to wait
        job_names: Optional mapping of job_id -> name
        job_type: Type of job (rbfe, abfe, etc.)

    Returns:
        Dictionary mapping job_id -> final status
    """
    async with JobMonitor(api_base_url, check_interval, timeout, job_type) as monitor:
        return await monitor.wait_for_jobs(job_ids, job_names)
