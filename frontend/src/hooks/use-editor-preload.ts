'use client'

import { useEffect, useRef } from 'react'

let preloadStarted = false

/**
 * Preloads the editor bundle by triggering the dynamic import
 * This is called by the hook and can also be called manually
 */
export function preloadEditor() {
  // Avoid duplicate preload attempts
  if (preloadStarted) return
  preloadStarted = true

  // Use requestIdleCallback for low-priority preloading, with setTimeout fallback
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    requestIdleCallback(
      () => {
        // Trigger the dynamic import to load the chunk
        import('../components/Tools/MoleculeEditor').catch((err) => {
          console.error('Failed to preload editor:', err)
        })
      },
      { timeout: 2000 } // Fallback to timeout after 2 seconds
    )
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      import('../components/Tools/MoleculeEditor').catch((err) => {
        console.error('Failed to preload editor:', err)
      })
    }, 500) // Small delay to avoid blocking initial render
  }
}

/**
 * Hook to automatically preload the editor bundle after hydration
 * Can be called from any component, but typically from the main layout/app
 */
export function useEditorPreload() {
  const hasPreloadedRef = useRef(false)

  useEffect(() => {
    // Only preload once per component lifetime
    if (hasPreloadedRef.current) return
    hasPreloadedRef.current = true

    // Start preloading
    preloadEditor()
  }, [])
}
