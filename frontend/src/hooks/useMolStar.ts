import { useCallback } from 'react'
import { useMolecularStore } from '@/store/molecular-store'
import { PluginContext } from 'molstar/lib/mol-plugin/context'

/**
 * Custom hook for advanced Mol* viewer control
 * Provides methods to interact with the Mol* viewer programmatically
 */
export function useMolStar() {
  const { viewerRef, currentStructure } = useMolecularStore()
  const plugin = viewerRef as PluginContext | null

  /**
   * Focus camera on a specific chain
   */
  const focusOnChain = useCallback(
    (chainId: string) => {
      if (!plugin) return

      // Implementation would use Mol* selection and focus API
      console.log(`Focusing on chain: ${chainId}`)
    },
    [plugin]
  )

  /**
   * Highlight a specific residue
   */
  const highlightResidue = useCallback(
    (chainId: string, resId: number) => {
      if (!plugin) return

      console.log(`Highlighting residue: ${chainId}:${resId}`)
      // Implementation would use Mol* selection API
    },
    [plugin]
  )

  /**
   * Apply a custom color scheme
   */
  const applyColorScheme = useCallback(
    (scheme: 'chain-id' | 'element-symbol' | 'secondary-structure' | 'uniform') => {
      if (!plugin) return

      console.log(`Applying color scheme: ${scheme}`)
      // Implementation would update representation colors
    },
    [plugin]
  )

  /**
   * Toggle surface representation
   */
  const toggleSurface = useCallback(
    (show: boolean, opacity = 0.5) => {
      if (!plugin) return

      console.log(`Toggle surface: ${show}, opacity: ${opacity}`)
      // Implementation would add/remove surface representation
    },
    [plugin]
  )

  /**
   * Take a screenshot of the current view
   */
  const takeScreenshot = useCallback(
    async (width = 1920, height = 1080): Promise<string | null> => {
      if (!plugin?.canvas3d) return null

      try {
        // Get the canvas element
        const canvas = plugin.canvas3d.webgl?.gl?.canvas as HTMLCanvasElement | undefined
        if (!canvas) return null

        // Convert canvas to data URL
        return canvas.toDataURL('image/png')
      } catch (error) {
        console.error('Error taking screenshot:', error)
        return null
      }
    },
    [plugin]
  )

  /**
   * Reset camera to default view
   */
  const resetCamera = useCallback(() => {
    if (!plugin?.canvas3d) return

    plugin.canvas3d.requestCameraReset()
  }, [plugin])

  /**
   * Clear all structures from the viewer
   */
  const clearViewer = useCallback(async () => {
    if (!plugin) return

    await plugin.clear()
  }, [plugin])

  return {
    plugin,
    isReady: !!plugin,
    currentStructure,
    focusOnChain,
    highlightResidue,
    applyColorScheme,
    toggleSurface,
    takeScreenshot,
    resetCamera,
    clearViewer,
  }
}
