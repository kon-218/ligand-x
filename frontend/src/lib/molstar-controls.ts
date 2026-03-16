/**
 * Molstar Viewer Controls Helper
 * Provides utility functions for controlling Molstar viewer state
 */

import { PluginContext } from 'molstar/lib/mol-plugin/context'
import { PluginCommands } from 'molstar/lib/mol-plugin/commands'
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms'
import { Color } from 'molstar/lib/mol-util/color'
import type { VisualizationStyle, SurfaceType } from '@/types/molecular'

/**
 * Change background color of the viewer
 * Uses full settings object so Molstar applies it correctly (see proteopedia-wrapper example)
 */
export async function setBackgroundColor(plugin: PluginContext, color: number) {
  try {
    if (!plugin.canvas3d) {
      console.warn('Canvas3D not available')
      return
    }

    const targetColor = Color(color)
    const renderer = plugin.canvas3d.props.renderer

    await PluginCommands.Canvas3D.SetSettings(plugin, {
      settings: {
        renderer: {
          ...renderer,
          backgroundColor: targetColor
        }
      }
    })

    plugin.canvas3d.requestDraw()

    const actualColor = plugin.canvas3d.props.renderer.backgroundColor
    console.log(`SUCCESS: Background color set: ${Color.toRgbString(targetColor)}, actual: ${actualColor ? Color.toRgbString(actualColor) : 'null'}`)
  } catch (error) {
    console.error('Failed to set background color:', error)
  }
}

/**
 * Change representation style for all structures
 */
export async function setRepresentationStyle(plugin: PluginContext, style: VisualizationStyle) {
  try {
    const state = plugin.state.data

    // Map our style names to Molstar representation types
    const reprTypeMap: Record<VisualizationStyle, string> = {
      'cartoon': 'cartoon',
      'stick': 'ball-and-stick',
      'ball-stick': 'ball-and-stick',
      'sphere': 'spacefill',
      'line': 'line'
    }

    const reprType = reprTypeMap[style] || 'cartoon'

    // Find all structure representations
    const representations = state.selectQ(q =>
      q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D)
    )

    if (representations.length === 0) {
      console.warn('No structure representations found')
      return false
    }

    // Update each representation while preserving color theme AND visibility (alpha)
    // IMPORTANT: Only update protein/polymer representations, skip ligands to preserve their ball-and-stick style
    const builder = state.build()
    let updatedCount = 0

    for (const repr of representations) {
      // Get the parent structure component to check what type it is
      const parentRef = repr.transform.parent
      const parentCell = state.cells.get(parentRef)
      const parentLabel = parentCell?.obj?.label?.toLowerCase() || ''

      // Skip ligand representations - they should keep their ball-and-stick style
      if (parentLabel.includes('ligand') ||
        parentLabel.includes('het') ||
        parentLabel.includes('non-standard') ||
        parentLabel.includes('branched')) {
        console.log(`⏭️ Skipping ligand representation: "${parentLabel}"`)
        continue
      }

      // Only update polymer/protein representations
      if (parentLabel.includes('polymer') || parentLabel.includes('protein') || parentLabel === '') {
        // For small molecule fallback representations (parentLabel === ''), the parent is the
        // raw structure node rather than a named component. These are always ball-and-stick
        // with multipleBonds for SDF bond-order rendering. Skip style updates that would
        // change the type away from ball-and-stick and lose double-bond geometry.
        if (parentLabel === '' && reprType !== 'ball-and-stick') {
          console.log(`⏭️ Skipping style update for small molecule fallback (would change to ${reprType})`)
          continue
        }
        // Preserve colorTheme, sizeTheme, and alpha (for component visibility)
        builder.to(repr).update(old => {
          const currentAlpha = old.type?.params?.alpha
          const params: Record<string, any> = currentAlpha !== undefined ? { alpha: currentAlpha } : {}
          if (reprType === 'ball-and-stick') {
            params.multipleBonds = 'symmetric'
          }
          return {
            type: { name: reprType, params },
            colorTheme: old.colorTheme,
            sizeTheme: old.sizeTheme
          }
        })
        updatedCount++
      }
    }

    await plugin.runTask(state.updateTree(builder))
    console.log(`[SUCCESS] Representation style changed to: ${reprType} (color theme preserved)`)
    return true
  } catch (error) {
    console.error('Failed to change representation style:', error)
    return false
  }
}

/**
 * Toggle molecular surface display
 */
export async function toggleSurface(
  plugin: PluginContext,
  show: boolean,
  surfaceType: SurfaceType = 'VDW',
  opacity: number = 0.7
) {
  try {
    const state = plugin.state.data

    if (show) {
      // Find all structures to add surface to
      const structures = state.selectQ(q =>
        q.ofTransformer(StateTransforms.Model.StructureFromModel)
      )

      if (structures.length === 0) {
        console.warn('No structures found to add surface to')
        return false
      }

      // Determine surface type
      const surfaceReprType = surfaceType === 'VDW' ? 'gaussian-surface'
        : surfaceType === 'SAS' ? 'molecular-surface'
          : 'molecular-surface'

      const builder = state.build()

      for (const structure of structures) {
        // Add surface representation
        builder.to(structure)
          .apply(StateTransforms.Representation.StructureRepresentation3D, {
            type: { name: surfaceReprType, params: { alpha: opacity } },
            colorTheme: { name: 'chain-id', params: {} },
            sizeTheme: { name: 'uniform', params: {} }
          }, { tags: ['surface-representation'] })
      }

      await plugin.runTask(state.updateTree(builder))
      console.log('[SUCCESS] Surface display enabled')
      return true
    } else {
      // Remove all surface representations
      const allReprs = state.selectQ(q =>
        q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D)
      )

      const surfaceReprs = allReprs.filter(r =>
        r.transform.tags?.includes('surface-representation')
      )

      if (surfaceReprs.length > 0) {
        const builder = state.build()
        for (const repr of surfaceReprs) {
          builder.delete(repr)
        }
        await plugin.runTask(state.updateTree(builder))
      }

      console.log('[SUCCESS] Surface display disabled')
      return true
    }
  } catch (error) {
    console.error('Failed to toggle surface:', error)
    return false
  }
}

/**
 * Update surface opacity
 */
export async function setSurfaceOpacity(plugin: PluginContext, opacity: number) {
  try {
    const state = plugin.state.data

    // Find all surface representations
    const allReprs = state.selectQ(q =>
      q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D)
    )

    const surfaceReprs = allReprs.filter(r =>
      r.transform.tags?.includes('surface-representation')
    )

    if (surfaceReprs.length === 0) {
      console.log('No surface representations to update')
      return false
    }

    // Update opacity for each surface
    const builder = state.build()
    for (const repr of surfaceReprs) {
      builder.to(repr).update(old => ({
        ...old,
        type: {
          ...old.type,
          params: { ...old.type.params, alpha: opacity }
        }
      }))
    }

    await plugin.runTask(state.updateTree(builder))
    console.log(`[SUCCESS] Surface opacity updated to: ${opacity}`)
    return true
  } catch (error) {
    console.error('Failed to update surface opacity:', error)
    return false
  }
}

/**
 * Clear all highlights
 */
export function clearHighlights(plugin: PluginContext) {
  try {
    plugin.managers.interactivity.lociHighlights.clearHighlights()
    console.log('[SUCCESS] Highlights cleared')
  } catch (error) {
    console.error('Failed to clear highlights:', error)
  }
}

/**
 * Clear all selections
 */
export function clearSelections(plugin: PluginContext) {
  try {
    plugin.managers.interactivity.lociSelects.deselectAll()
    console.log('[SUCCESS] Selections cleared')
  } catch (error) {
    console.error('Failed to clear selections:', error)
  }
}

/**
 * Reset camera to default view
 */
export function resetCamera(plugin: PluginContext) {
  try {
    plugin.managers.camera.reset()
    console.log('[SUCCESS] Camera reset')
  } catch (error) {
    console.error('Failed to reset camera:', error)
  }
}

/**
 * Focus camera on entire structure
 */
export function focusCamera(plugin: PluginContext) {
  try {
    // Simply reset to default view which focuses on all content
    plugin.managers.camera.reset()
    console.log('[SUCCESS] Camera reset to default view')
  } catch (error) {
    console.error('Failed to focus camera:', error)
  }
}

/**
 * Toggle component visibility (protein, ligands, water, ions)
 * Note: For proper component filtering, structures should be loaded with separate
 * representations per component type. This implementation hides ALL non-surface representations
 * when protein is toggled off as a temporary solution.
 */
export async function toggleComponentVisibility(
  plugin: PluginContext,
  component: 'protein' | 'ligands' | 'water' | 'ions',
  show: boolean
): Promise<boolean> {
  try {
    const state = plugin.state.data
    const allReprs = state.selectQ(q => q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D))

    if (allReprs.length === 0) {
      console.warn('No representations found')
      return false
    }

    // Simplified approach: hide/show all non-surface representations
    // This works for protein toggle but needs improvement for granular control
    const builder = state.build()
    let modified = false

    for (const repr of allReprs) {
      // Skip surface representations
      if (repr.transform.tags?.includes('surface-representation')) continue

      if (component === 'protein') {
        // Hide by setting opacity to 0 (simple approach)
        builder.to(repr).update(old => ({
          ...old,
          type: {
            ...old.type,
            params: {
              ...old.type.params,
              alpha: show ? 1 : 0
            }
          }
        }))
        modified = true
      }
    }

    if (modified) {
      await plugin.runTask(state.updateTree(builder))
      console.log(`[SUCCESS] ${component} visibility: ${show}`)
      return true
    }

    // Other components require separate representations
    console.log(`[INFO] ${component} filtering requires separate representations per component`)
    return false
  } catch (error) {
    console.error(`Failed to toggle ${component} visibility:`, error)
    return false
  }
}

/**
 * Toggle spin animation
 */
export function toggleSpin(plugin: PluginContext, speed: number = 1) {
  try {
    const trackball = plugin.canvas3d?.props.trackball
    if (!trackball) return

    const isCurrentlyAnimating = trackball.animate && trackball.animate.name !== 'off'

    PluginCommands.Canvas3D.SetSettings(plugin, {
      settings: props => {
        props.trackball.animate = isCurrentlyAnimating
          ? { name: 'off', params: {} }
          : { name: 'spin', params: { speed } }
      }
    })

    console.log(`[SUCCESS] Spin ${!isCurrentlyAnimating ? 'enabled' : 'disabled'}`)
  } catch (error) {
    console.error('Failed to toggle spin:', error)
  }
}
