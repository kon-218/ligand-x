'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/store/ui-store'
import { injectNotificationHandler } from '@/lib/api-client'

/**
 * StoreProvider - Initializes store connections and dependency injection
 * 
 * This component:
 * 1. Injects the notification handler into the API client
 * 2. Can be extended for other initialization tasks
 * 
 * Must be rendered as a client component in the app layout.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const addNotification = useUIStore((state) => state.addNotification)

  useEffect(() => {
    // Inject the notification handler into the API client
    // This avoids circular dependencies and HMR issues
    injectNotificationHandler(addNotification)
  }, [addNotification])

  return <>{children}</>
}
