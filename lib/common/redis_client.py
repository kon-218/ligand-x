"""
Redis client manager for pub/sub and caching.

Provides async Redis operations for:
- Job update pub/sub broadcasting
- Connection pooling
- Graceful error handling

Usage:
    from lib.common.redis_client import get_redis_manager
    
    redis_mgr = get_redis_manager()
    await redis_mgr.connect()
    
    # Publish job update
    await redis_mgr.publish_job_update(job_id, status, progress)
    
    # Subscribe to updates
    async for update in redis_mgr.subscribe_job_updates():
        print(update)
"""

import os
import json
import asyncio
import logging
from typing import Optional, Dict, Any, AsyncGenerator
from datetime import datetime

logger = logging.getLogger(__name__)

# Try to import redis, provide fallback if not available
try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("redis[asyncio] not installed. Redis pub/sub will be disabled.")


# Channel names
JOB_UPDATES_CHANNEL = "jobs:updates"


class RedisManager:
    """
    Async Redis manager for job update pub/sub.
    
    Handles connection lifecycle, publishing updates, and subscribing to channels.
    Designed for use with FastAPI's async context.
    """
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._client: Optional['aioredis.Redis'] = None
        self._pubsub: Optional['aioredis.client.PubSub'] = None
        self._connected = False
        self._subscriber_task: Optional[asyncio.Task] = None
    
    async def connect(self) -> bool:
        """
        Connect to Redis server.
        
        Returns:
            True if connection successful, False otherwise
        """
        if not REDIS_AVAILABLE:
            logger.warning("Redis client not available - skipping connection")
            return False
        
        if self._connected and self._client:
            return True
        
        try:
            self._client = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5.0,
                socket_keepalive=True,
            )
            
            # Test connection
            await self._client.ping()
            self._connected = True
            logger.info(f"[Redis] Connected to {self.redis_url}")
            return True
            
        except Exception as e:
            logger.error(f"[Redis] Failed to connect: {e}")
            self._connected = False
            return False
    
    async def disconnect(self):
        """Close Redis connection."""
        if self._pubsub:
            try:
                await self._pubsub.unsubscribe(JOB_UPDATES_CHANNEL)
                await self._pubsub.close()
            except Exception as e:
                logger.debug(f"[Redis] Error closing pubsub: {e}")
            self._pubsub = None
        
        if self._client:
            try:
                await self._client.close()
            except Exception as e:
                logger.debug(f"[Redis] Error closing client: {e}")
            self._client = None
        
        self._connected = False
        logger.info("[Redis] Disconnected")
    
    async def publish(self, channel: str, message: str) -> bool:
        """
        Publish message to a Redis channel.
        
        Args:
            channel: Channel name
            message: Message to publish (should be JSON string)
            
        Returns:
            True if published successfully, False otherwise
        """
        if not self._connected or not self._client:
            return False
        
        try:
            await self._client.publish(channel, message)
            return True
        except Exception as e:
            logger.error(f"[Redis] Failed to publish to {channel}: {e}")
            return False
    
    async def publish_job_update(
        self,
        job_id: str,
        status: str,
        progress: Optional[int] = None,
        stage: Optional[str] = None,
        job_type: Optional[str] = None,
        error_message: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Publish a job update to the jobs:updates channel.
        
        Args:
            job_id: Unique job identifier
            status: Job status (pending, running, completed, failed, cancelled)
            progress: Progress percentage (0-100)
            stage: Current execution stage
            job_type: Type of job (md, docking, qc, etc.)
            error_message: Error message if failed
            result: Job result data (for completed jobs)
            
        Returns:
            True if published successfully
        """
        update = {
            "job_id": job_id,
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        if progress is not None:
            update["progress"] = progress
        if stage is not None:
            update["stage"] = stage
        if job_type is not None:
            update["job_type"] = job_type
        if error_message is not None:
            update["error_message"] = error_message
        if result is not None:
            # Only include minimal result info to keep message small
            update["has_result"] = True
        
        try:
            message = json.dumps(update)
            return await self.publish(JOB_UPDATES_CHANNEL, message)
        except Exception as e:
            logger.error(f"[Redis] Failed to serialize job update: {e}")
            return False
    
    async def subscribe_job_updates(self) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Subscribe to job updates channel and yield updates.
        
        Yields:
            Dict containing job update data
            
        Usage:
            async for update in redis_mgr.subscribe_job_updates():
                print(f"Job {update['job_id']} is now {update['status']}")
        """
        if not self._connected or not self._client:
            logger.warning("[Redis] Not connected - cannot subscribe")
            return
        
        try:
            self._pubsub = self._client.pubsub()
            await self._pubsub.subscribe(JOB_UPDATES_CHANNEL)
            logger.info(f"[Redis] Subscribed to {JOB_UPDATES_CHANNEL}")
            
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        yield data
                    except json.JSONDecodeError as e:
                        logger.warning(f"[Redis] Invalid JSON in message: {e}")
                        continue
                        
        except asyncio.CancelledError:
            logger.info("[Redis] Subscription cancelled")
            raise
        except Exception as e:
            logger.error(f"[Redis] Subscription error: {e}")
            raise
        finally:
            if self._pubsub:
                try:
                    await self._pubsub.unsubscribe(JOB_UPDATES_CHANNEL)
                except Exception:
                    pass
    
    @property
    def is_connected(self) -> bool:
        """Check if Redis is connected."""
        return self._connected and self._client is not None


# Global Redis manager instance
_redis_manager: Optional[RedisManager] = None


def get_redis_manager() -> RedisManager:
    """
    Get the global Redis manager instance.
    
    Creates a new instance if one doesn't exist.
    Uses REDIS_URL environment variable for connection string.
    
    Returns:
        RedisManager instance
    """
    global _redis_manager
    
    if _redis_manager is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        _redis_manager = RedisManager(redis_url)
    
    return _redis_manager


async def init_redis() -> bool:
    """
    Initialize Redis connection on startup.
    
    Returns:
        True if connected successfully
    """
    manager = get_redis_manager()
    return await manager.connect()


async def close_redis():
    """Close Redis connection on shutdown."""
    global _redis_manager
    if _redis_manager:
        await _redis_manager.disconnect()
        _redis_manager = None
