"""
WebSocket Router for Real-time Job Updates.

Provides WebSocket endpoint for pushing job status updates to clients
in real-time, eliminating the need for polling.

Architecture:
    1. Client connects to /api/jobs/ws
    2. Server subscribes to Redis pub/sub channel 'jobs:updates'
    3. When jobs update, Redis publishes to channel
    4. Server broadcasts update to all connected WebSocket clients
    5. Client receives instant update without polling

Endpoints:
    WS  /api/jobs/ws       - WebSocket connection for job updates
    GET /api/jobs/ws/stats - Connection statistics (HTTP endpoint)

Client Protocol:
    Client -> Server:
        {"type": "subscribe", "job_ids": ["id1", "id2"]}  - Subscribe to specific jobs
        {"type": "unsubscribe", "job_ids": ["id1"]}       - Unsubscribe from jobs
        {"type": "ping"}                                   - Heartbeat ping
    
    Server -> Client:
        {"job_id": "...", "status": "...", ...}           - Job update
        {"type": "pong"}                                   - Heartbeat response
        {"type": "subscribed", "count": N}                - Subscription confirmation
        {"type": "error", "message": "..."}               - Error message
"""

import asyncio
import json
import logging
from uuid import uuid4
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from gateway.websocket.connection_manager import connection_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs-websocket"])

# Background task reference for cleanup
_redis_listener_task: Optional[asyncio.Task] = None


async def listen_to_redis_and_broadcast():
    """
    Background task that listens to Redis pub/sub and broadcasts to WebSocket clients.
    
    This runs continuously while the application is running, receiving job updates
    from Redis and pushing them to all connected WebSocket clients.
    """
    from lib.common.redis_client import get_redis_manager
    
    logger.info("[WebSocket] Starting Redis listener for job updates...")
    
    redis_mgr = get_redis_manager()
    
    # Keep trying to connect to Redis
    retry_delay = 1
    max_retry_delay = 30
    
    while True:
        try:
            # Connect if not already connected
            if not redis_mgr.is_connected:
                connected = await redis_mgr.connect()
                if not connected:
                    logger.warning(
                        f"[WebSocket] Redis not available, retrying in {retry_delay}s..."
                    )
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, max_retry_delay)
                    continue
            
            # Reset retry delay on successful connection
            retry_delay = 1
            logger.info("[WebSocket] Connected to Redis, listening for job updates...")
            
            # Listen for job updates
            async for update in redis_mgr.subscribe_job_updates():
                try:
                    await connection_manager.broadcast_job_update(update)
                except Exception as e:
                    logger.error(f"[WebSocket] Error broadcasting update: {e}")
                    
        except asyncio.CancelledError:
            logger.info("[WebSocket] Redis listener cancelled")
            break
        except Exception as e:
            logger.error(f"[WebSocket] Redis listener error: {e}")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, max_retry_delay)


def start_redis_listener():
    """Start the Redis listener background task."""
    global _redis_listener_task
    
    if _redis_listener_task is None or _redis_listener_task.done():
        _redis_listener_task = asyncio.create_task(listen_to_redis_and_broadcast())
        logger.info("[WebSocket] Redis listener task started")


def stop_redis_listener():
    """Stop the Redis listener background task."""
    global _redis_listener_task
    
    if _redis_listener_task and not _redis_listener_task.done():
        _redis_listener_task.cancel()
        logger.info("[WebSocket] Redis listener task stopped")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time job updates.
    
    Clients connect here to receive push notifications when jobs change status.
    Much more efficient than polling /api/jobs/list repeatedly.
    
    Connection Flow:
    1. Client connects
    2. Server accepts and assigns client ID
    3. Server sends initial connection confirmation
    4. Client optionally subscribes to specific job IDs
    5. Server pushes updates as jobs change
    6. Client can send ping for heartbeat
    7. On disconnect, cleanup
    """
    client_id = str(uuid4())
    
    # Ensure Redis listener is running
    start_redis_listener()
    
    # Accept connection
    connected = await connection_manager.connect(client_id, websocket)
    if not connected:
        return
    
    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "client_id": client_id,
            "message": "Connected to job updates stream"
        })
        
        # Handle incoming messages from client
        while True:
            try:
                # Wait for message with timeout for keepalive
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0  # 60 second timeout
                )
                
                try:
                    message = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON"
                    })
                    continue
                
                msg_type = message.get('type')
                
                if msg_type == 'subscribe':
                    # Subscribe to specific job updates
                    job_ids = set(message.get('job_ids', []))
                    if job_ids:
                        connection_manager.subscribe(client_id, job_ids)
                        await websocket.send_json({
                            "type": "subscribed",
                            "count": len(job_ids)
                        })
                    
                elif msg_type == 'unsubscribe':
                    # Unsubscribe from specific jobs
                    job_ids = set(message.get('job_ids', []))
                    connection_manager.unsubscribe(client_id, job_ids if job_ids else None)
                    await websocket.send_json({
                        "type": "unsubscribed"
                    })
                    
                elif msg_type == 'ping':
                    # Heartbeat response
                    await websocket.send_json({"type": "pong"})
                    
                elif msg_type == 'get_stats':
                    # Return connection stats (for debugging)
                    await websocket.send_json({
                        "type": "stats",
                        **connection_manager.stats
                    })
                    
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}"
                    })
                    
            except asyncio.TimeoutError:
                # Send keepalive ping
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception:
                        break
                else:
                    break
                    
    except WebSocketDisconnect:
        logger.debug(f"[WebSocket] Client {client_id[:8]}... disconnected normally")
    except Exception as e:
        logger.error(f"[WebSocket] Error for client {client_id[:8]}...: {e}")
    finally:
        connection_manager.disconnect(client_id)


@router.get("/ws/stats")
async def websocket_stats():
    """
    Get WebSocket connection statistics.
    
    Returns:
        Connection counts and message statistics
    """
    return {
        "status": "ok",
        **connection_manager.stats
    }


@router.get("/ws/health")
async def websocket_health():
    """
    Health check for WebSocket service.
    
    Returns:
        Health status and Redis connection state
    """
    from lib.common.redis_client import get_redis_manager
    
    redis_mgr = get_redis_manager()
    
    return {
        "status": "ok",
        "websocket_enabled": True,
        "redis_connected": redis_mgr.is_connected,
        "active_connections": connection_manager.connection_count,
        "listener_running": _redis_listener_task is not None and not _redis_listener_task.done()
    }
