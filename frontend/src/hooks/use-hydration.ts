import { useEffect, useState } from 'react'

/**
 * Hook to check if component has hydrated on client.
 * Returns false during SSR and initial render, true after hydration.
 * Use this to prevent hydration mismatches when using client-only state.
 */
export function useHydration() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return hydrated
}
