"""
WebSocket Connection Manager for real-time job updates.

Manages WebSocket connections from frontend clients and broadcasts
job updates received from Redis pub/sub.

Features:
- Connection tracking with unique client IDs
- Optional job subscription filtering
- Heartbeat support (ping/pong)
- Graceful disconnect handling
- Connection statistics

Usage:
    from gateway.websocket.connection_manager import connection_manager
    
    # In WebSocket endpoint
    await connection_manager.connect(client_id, websocket)
    await connection_manager.broadcast_job_update(update)
    connection_manager.disconnect(client_id)
"""

import json
import logging
import asyncio
from typing import Dict, Set, Optional, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for job update broadcasting.
    
    Tracks active connections and handles message broadcasting.
    Thread-safe for async operations.
    """
    
    def __init__(self):
        # Map of client_id -> WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}
        
        # Map of client_id -> set of job_ids they're subscribed to
        # If empty set, client receives all updates
        self.subscriptions: Dict[str, Set[str]] = {}
        
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
        
        # Statistics
        self._total_connections = 0
        self._total_messages_sent = 0
    
    async def connect(self, client_id: str, websocket: WebSocket) -> bool:
        """
        Accept and register a new WebSocket connection.
        
        Args:
            client_id: Unique identifier for this client
            websocket: The WebSocket connection
            
        Returns:
            True if connection accepted successfully
        """
        try:
            await websocket.accept()
            
            async with self._lock:
                self.active_connections[client_id] = websocket
                self.subscriptions[client_id] = set()  # Subscribe to all by default
                self._total_connections += 1
            
            logger.info(
                f"[WebSocket] Client {client_id[:8]}... connected. "
                f"Active: {len(self.active_connections)}"
            )
            return True
            
        except Exception as e:
            logger.error(f"[WebSocket] Failed to accept connection: {e}")
            return False
    
    def disconnect(self, client_id: str):
        """
        Remove client connection from tracking.
        
        Args:
            client_id: Client to disconnect
        """
        self.active_connections.pop(client_id, None)
        self.subscriptions.pop(client_id, None)
        
        logger.info(
            f"[WebSocket] Client {client_id[:8]}... disconnected. "
            f"Remaining: {len(self.active_connections)}"
        )
    
    def subscribe(self, client_id: str, job_ids: Set[str]):
        """
        Subscribe client to specific job updates.
        
        Args:
            client_id: Client ID
            job_ids: Set of job IDs to subscribe to
        """
        if client_id in self.subscriptions:
            self.subscriptions[client_id].update(job_ids)
            logger.debug(
                f"[WebSocket] Client {client_id[:8]}... subscribed to "
                f"{len(job_ids)} jobs"
            )
    
    def unsubscribe(self, client_id: str, job_ids: Optional[Set[str]] = None):
        """
        Unsubscribe client from job updates.
        
        Args:
            client_id: Client ID
            job_ids: Specific jobs to unsubscribe from, or None for all
        """
        if client_id in self.subscriptions:
            if job_ids is None:
                self.subscriptions[client_id].clear()
            else:
                self.subscriptions[client_id] -= job_ids
    
    def _should_send_to_client(self, client_id: str, job_id: str) -> bool:
        """
        Check if client should receive updates for this job.
        
        Returns True if:
        - Client has no specific subscriptions (receives all)
        - Client is specifically subscribed to this job
        """
        subs = self.subscriptions.get(client_id, set())
        return len(subs) == 0 or job_id in subs
    
    async def send_to_client(
        self,
        client_id: str,
        message: Dict[str, Any]
    ) -> bool:
        """
        Send message to a specific client.
        
        Args:
            client_id: Target client
            message: Message to send (will be JSON serialized)
            
        Returns:
            True if sent successfully, False otherwise
        """
        websocket = self.active_connections.get(client_id)
        if not websocket:
            return False
        
        try:
            await websocket.send_json(message)
            self._total_messages_sent += 1
            return True
        except Exception as e:
            logger.debug(f"[WebSocket] Failed to send to {client_id[:8]}...: {e}")
            return False
    
    async def broadcast_job_update(self, job_update: Dict[str, Any]):
        """
        Broadcast job update to all interested clients.
        
        Args:
            job_update: Update containing at minimum 'job_id' and 'status'
        """
        job_id = job_update.get('job_id')
        if not job_id:
            logger.warning("[WebSocket] Received update without job_id")
            return
        
        message_str = json.dumps(job_update)
        disconnected = []
        sent_count = 0
        
        # Iterate over a copy of items to avoid modification during iteration
        for client_id, websocket in list(self.active_connections.items()):
            # Check if client wants this update
            if not self._should_send_to_client(client_id, job_id):
                continue
            
            try:
                await websocket.send_text(message_str)
                sent_count += 1
                self._total_messages_sent += 1
            except Exception as e:
                logger.debug(
                    f"[WebSocket] Error sending to {client_id[:8]}...: {e}"
                )
                disconnected.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected:
            self.disconnect(client_id)
        
        if sent_count > 0:
            logger.debug(
                f"[WebSocket] Broadcast job {job_id[:8]}... update to "
                f"{sent_count} clients"
            )
    
    async def broadcast_all(self, message: Dict[str, Any]):
        """
        Broadcast message to all connected clients regardless of subscriptions.
        
        Useful for system-wide notifications.
        
        Args:
            message: Message to broadcast
        """
        message_str = json.dumps(message)
        disconnected = []
        
        for client_id, websocket in list(self.active_connections.items()):
            try:
                await websocket.send_text(message_str)
                self._total_messages_sent += 1
            except Exception:
                disconnected.append(client_id)
        
        for client_id in disconnected:
            self.disconnect(client_id)
    
    @property
    def connection_count(self) -> int:
        """Get current number of active connections."""
        return len(self.active_connections)
    
    @property
    def stats(self) -> Dict[str, Any]:
        """Get connection statistics."""
        return {
            "active_connections": len(self.active_connections),
            "total_connections": self._total_connections,
            "total_messages_sent": self._total_messages_sent,
            "clients_with_subscriptions": sum(
                1 for subs in self.subscriptions.values() if len(subs) > 0
            ),
        }


# Global connection manager instance
connection_manager = ConnectionManager()
