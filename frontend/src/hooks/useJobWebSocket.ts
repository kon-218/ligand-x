/**
 * WebSocket hook for real-time job updates.
 * 
 * Connects to the gateway WebSocket endpoint and receives push notifications
 * when jobs change status, eliminating the need for polling.
 * 
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Heartbeat ping/pong for connection health
 * - Graceful fallback to polling if WebSocket unavailable
 * - Optional job subscription filtering
 * 
 * Usage:
 *   const { isConnected, subscribe } = useJobWebSocket({
 *     onJobUpdate: (update) => console.log('Job updated:', update),
 *     enabled: true,
 *   })
 */

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * Job update message received from WebSocket
 */
export interface JobUpdate {
  job_id: string
  status: string
  progress?: number
  stage?: string
  job_type?: string
  error_message?: string
  has_result?: boolean
  timestamp: string
}

/**
 * WebSocket message types from server
 */
interface ServerMessage {
  type?: 'connected' | 'pong' | 'subscribed' | 'unsubscribed' | 'error' | 'ping' | 'stats'
  job_id?: string
  status?: string
  progress?: number
  stage?: string
  job_type?: string
  error_message?: string
  has_result?: boolean
  timestamp?: string
  message?: string
  client_id?: string
  count?: number
}

/**
 * Options for useJobWebSocket hook
 */
interface UseJobWebSocketOptions {
  /** Callback when a job update is received */
  onJobUpdate: (update: JobUpdate) => void
  /** Whether WebSocket should be enabled (default: true) */
  enabled?: boolean
  /** Reconnection interval in ms (default: 5000) */
  reconnectInterval?: number
  /** Max reconnection attempts (default: 10) */
  maxReconnectAttempts?: number
  /** Callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void
}

/**
 * Return value from useJobWebSocket hook
 */
interface UseJobWebSocketReturn {
  /** Subscribe to updates for specific job IDs */
  subscribe: (jobIds: string[]) => void
  /** Unsubscribe from job updates */
  unsubscribe: (jobIds?: string[]) => void
  /** Current connection state */
  isConnected: boolean
  /** Manually disconnect WebSocket */
  disconnect: () => void
  /** Manually reconnect WebSocket */
  reconnect: () => void
  /** Number of reconnection attempts */
  reconnectAttempts: number
}

/**
 * Build WebSocket URL from environment
 */
function getWebSocketUrl(): string {
  // Get API URL from environment
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  
  // Convert http(s) to ws(s)
  const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:'
  const host = apiUrl.replace(/^https?:\/\//, '')
  
  return `${wsProtocol}//${host}/api/jobs/ws`
}

/**
 * Hook for managing WebSocket connection to job updates stream.
 * 
 * Provides real-time job status updates without polling.
 */
export function useJobWebSocket({
  onJobUpdate,
  enabled = true,
  reconnectInterval = 5000,
  maxReconnectAttempts = 10,
  onConnectionChange,
}: UseJobWebSocketOptions): UseJobWebSocketReturn {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null)
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  
  const [isConnected, setIsConnected] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  
  // Track if component is mounted
  const mountedRef = useRef(true)
  
  // Stable callback refs
  const onJobUpdateRef = useRef(onJobUpdate)
  const onConnectionChangeRef = useRef(onConnectionChange)
  
  useEffect(() => {
    onJobUpdateRef.current = onJobUpdate
  }, [onJobUpdate])
  
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange
  }, [onConnectionChange])
  
  /**
   * Update connection state
   */
  const updateConnectionState = useCallback((connected: boolean) => {
    if (!mountedRef.current) return
    
    setIsConnected(connected)
    onConnectionChangeRef.current?.(connected)
  }, [])
  
  /**
   * Clear all timers
   */
  const clearTimers = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
      reconnectTimeout.current = null
    }
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current)
      heartbeatInterval.current = null
    }
  }, [])
  
  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    clearTimers()
    
    if (ws.current) {
      // Prevent reconnection on intentional close
      ws.current.onclose = null
      ws.current.close()
      ws.current = null
    }
    
    updateConnectionState(false)
    reconnectAttempts.current = 0
    setAttemptCount(0)
  }, [clearTimers, updateConnectionState])
  
  /**
   * Connect to WebSocket
   */
  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return
    
    // Don't connect if already connected
    if (ws.current?.readyState === WebSocket.OPEN) return
    
    // Clean up existing connection
    if (ws.current) {
      ws.current.onclose = null
      ws.current.close()
    }
    
    const wsUrl = getWebSocketUrl()
    
    try {
      console.log('[WebSocket] Connecting to', wsUrl)
      ws.current = new WebSocket(wsUrl)
      
      ws.current.onopen = () => {
        if (!mountedRef.current) return
        
        console.log('[WebSocket] Connected to job updates stream')
        reconnectAttempts.current = 0
        setAttemptCount(0)
        updateConnectionState(true)
        
        // Start heartbeat
        heartbeatInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000) // 30 second heartbeat
      }
      
      ws.current.onmessage = (event) => {
        if (!mountedRef.current) return
        
        try {
          const message: ServerMessage = JSON.parse(event.data)
          
          // Handle different message types
          switch (message.type) {
            case 'connected':
              console.log('[WebSocket] Server acknowledged connection:', message.client_id)
              break
              
            case 'pong':
              // Heartbeat response - connection is healthy
              break
              
            case 'ping':
              // Server ping - respond with pong
              ws.current?.send(JSON.stringify({ type: 'pong' }))
              break
              
            case 'subscribed':
              console.log('[WebSocket] Subscribed to', message.count, 'jobs')
              break
              
            case 'unsubscribed':
              console.log('[WebSocket] Unsubscribed from jobs')
              break
              
            case 'error':
              console.error('[WebSocket] Server error:', message.message)
              break
              
            case 'stats':
              console.log('[WebSocket] Stats:', message)
              break
              
            default:
              // Job update message (has job_id and status)
              if (message.job_id && message.status) {
                const update: JobUpdate = {
                  job_id: message.job_id,
                  status: message.status,
                  progress: message.progress,
                  stage: message.stage,
                  job_type: message.job_type,
                  error_message: message.error_message,
                  has_result: message.has_result,
                  timestamp: message.timestamp || new Date().toISOString(),
                }
                
                onJobUpdateRef.current(update)
              }
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }
      
      ws.current.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error)
      }
      
      ws.current.onclose = (event) => {
        if (!mountedRef.current) return
        
        console.log('[WebSocket] Disconnected:', event.code, event.reason)
        updateConnectionState(false)
        clearTimers()
        
        // Attempt reconnection with exponential backoff
        if (enabled && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(
            reconnectInterval * Math.pow(2, reconnectAttempts.current),
            30000 // Max 30 seconds
          )
          
          reconnectAttempts.current++
          setAttemptCount(reconnectAttempts.current)
          
          console.log(
            `[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`
          )
          
          reconnectTimeout.current = setTimeout(() => {
            if (mountedRef.current && enabled) {
              connect()
            }
          }, delay)
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.warn('[WebSocket] Max reconnection attempts reached')
        }
      }
      
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err)
      updateConnectionState(false)
    }
  }, [enabled, reconnectInterval, maxReconnectAttempts, clearTimers, updateConnectionState])
  
  /**
   * Manual reconnect
   */
  const reconnect = useCallback(() => {
    disconnect()
    reconnectAttempts.current = 0
    setAttemptCount(0)
    connect()
  }, [connect, disconnect])
  
  /**
   * Subscribe to specific job IDs
   */
  const subscribe = useCallback((jobIds: string[]) => {
    if (ws.current?.readyState === WebSocket.OPEN && jobIds.length > 0) {
      ws.current.send(JSON.stringify({
        type: 'subscribe',
        job_ids: jobIds,
      }))
    }
  }, [])
  
  /**
   * Unsubscribe from job updates
   */
  const unsubscribe = useCallback((jobIds?: string[]) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'unsubscribe',
        job_ids: jobIds || [],
      }))
    }
  }, [])
  
  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true
    
    if (enabled) {
      connect()
    }
    
    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  
  return {
    subscribe,
    unsubscribe,
    isConnected,
    disconnect,
    reconnect,
    reconnectAttempts: attemptCount,
  }
}

export default useJobWebSocket
