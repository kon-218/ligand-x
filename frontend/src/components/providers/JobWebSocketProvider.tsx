'use client'

/**
 * JobWebSocketProvider
 * 
 * Manages WebSocket connection lifecycle for real-time job updates.
 * Connects the useJobWebSocket hook to the unified results store.
 * 
 * Features:
 * - Auto-connects on mount
 * - Updates store when connection state changes
 * - Routes job updates to store handler
 * - Falls back to faster polling when disconnected
 * 
 * Usage:
 *   // In layout.tsx or _app.tsx
 *   <JobWebSocketProvider>
 *     {children}
 *   </JobWebSocketProvider>
 */

import { useEffect, useCallback } from 'react'
import { useJobWebSocket, type JobUpdate } from '@/hooks/useJobWebSocket'
import { useUnifiedResultsStore } from '@/store/unified-results-store'

interface JobWebSocketProviderProps {
  children: React.ReactNode
}

export function JobWebSocketProvider({ children }: JobWebSocketProviderProps) {
  // Get store actions and state
  const handleJobUpdate = useUnifiedResultsStore(state => state.handleJobUpdate)
  const setWsConnected = useUnifiedResultsStore(state => state.setWsConnected)
  const wsEnabled = useUnifiedResultsStore(state => state.wsEnabled)
  const allJobs = useUnifiedResultsStore(state => state.allJobs)
  
  // Callback for job updates from WebSocket
  const onJobUpdate = useCallback((update: JobUpdate) => {
    handleJobUpdate(update)
  }, [handleJobUpdate])
  
  // Callback for connection state changes
  const onConnectionChange = useCallback((connected: boolean) => {
    setWsConnected(connected)
    
    if (connected) {
      console.log('[JobWebSocketProvider] WebSocket connected - real-time updates active')
    } else {
      console.log('[JobWebSocketProvider] WebSocket disconnected - polling fallback active')
    }
  }, [setWsConnected])
  
  // Initialize WebSocket connection
  const { isConnected, subscribe, reconnectAttempts } = useJobWebSocket({
    onJobUpdate,
    enabled: wsEnabled,
    onConnectionChange,
    reconnectInterval: 3000,
    maxReconnectAttempts: 20,
  })
  
  // Subscribe to job updates when connected and jobs are loaded
  useEffect(() => {
    if (isConnected && allJobs.length > 0) {
      // Subscribe to all current job IDs
      const jobIds = allJobs.map(job => job.job_id)
      subscribe(jobIds)
    }
  }, [isConnected, allJobs, subscribe])
  
  // Log connection status changes
  useEffect(() => {
    if (reconnectAttempts > 0) {
      console.log(`[JobWebSocketProvider] Reconnection attempt ${reconnectAttempts}`)
    }
  }, [reconnectAttempts])
  
  return <>{children}</>
}

export default JobWebSocketProvider
