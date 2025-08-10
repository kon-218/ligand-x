'use client'

/**
 * Molecular Viewer for Ligand-X
 * Consolidated viewer component integrating Molstar with app state
 */

import React, { useRef, useState, useEffect, useCallback } from 'react'
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory'
import { Asset } from 'molstar/lib/mol-util/assets'
import { AnimateModelIndex } from 'molstar/lib/mol-plugin-state/animation/built-in/model-index'
import { Script } from 'molstar/lib/mol-script/script'
import { StructureSelection } from 'molstar/lib/mol-model/structure'
import { EmptyLoci } from 'molstar/lib/mol-model/loci'
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms'
import { StripedResidues } from './themes/StripedResidues'
import { CustomColorThemeProvider } from './themes/CustomColorTheme'
import { FukuiColorThemeProvider } from './themes/FukuiColorTheme'
import { StructureTabBar } from './StructureTabBar'
import { TextFileViewer } from './TextFileViewer'
import { ImageFileViewer } from './ImageFileViewer'
import { ChevronLeft } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { getDefaultVisualizationSettings, detectStructureType } from '@/lib/structure-utils'
import * as MolstarControls from '@/lib/molstar-controls'
import { showGridBox, removeGridBox, toggleGridBox } from '@/lib/molstar-grid-box'

// Declare global molstar variable
declare global {
  interface Window {
    molstar?: any;
  }
}

// Distinct colors applied as translucent surfaces to each docked pose (matches DockingStepResults.tsx)
const POSE_SURFACE_COLORS = [0x00CC66, 0xFF8C00, 0xBB44FF, 0x00CCFF, 0xFFCC00, 0xFF4444, 0x44AAFF, 0xFF88CC, 0x88FFCC]

export interface MolecularViewerProps {
  /** Show controls panel */
  showControls?: boolean
  /** Initial PDB ID */
  initialPdbId?: string
  /** Callback when structure is loaded */
  onStructureLoaded?: (pdbId: string) => void
}

export interface LoadParams {
  url?: string
  pdbId?: string
  pdbData?: string
  format?: BuiltInTrajectoryFormat
  isBinary?: boolean
  assemblyId?: string
}

export interface GridBoxParams {
  center_x: number
  center_y: number
  center_z: number
  size_x: number
  size_y: number
  size_z: number
}

export interface MolstarViewerHandle {
  plugin: any | null
  load: (params: LoadParams) => Promise<void>
  loadTrajectory: (trajectoryUrl: string | { pdbData: string }, format?: BuiltInTrajectoryFormat) => Promise<void>
  animateNormalMode: (pdbData: string, options?: { loop?: boolean; speed?: number; mode?: 'loop' | 'palindrome' | 'once' }) => Promise<void>
  setBackground: (color: number) => void
  toggleSpin: () => void
  animate: {
    onceForward: () => void
    onceBackward: () => void
    palindrome: () => void
    loop: () => void
    stop: () => void
  }
  coloring: {
    applyStripes: () => Promise<void>
    applyCustomTheme: () => Promise<void>
    applyDefault: () => Promise<void>
    applyFukuiTheme: (values: number[], type: string) => Promise<void>
  }
  interactivity: {
    highlightResidue: (seqId: number) => void
    clearHighlight: () => void
  }
  gridBox: {
    show: (params: GridBoxParams) => Promise<void>
    hide: () => Promise<void>
    toggle: (params: GridBoxParams | null, show: boolean) => Promise<void>
  }
}

export const MolecularViewer: React.FC<MolecularViewerProps> = ({
  showControls = true,
  initialPdbId,
  onStructureLoaded
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const pluginRef = useRef<any | null>(null)
  const viewerRef = useRef<any | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [currentPdbId, setCurrentPdbId] = useState(initialPdbId)
  const [loadedStructureId, setLoadedStructureId] = useState<string | null>(null)
  const isInitializedRef = useRef(false)

  const {
    currentStructure,
    inputFileTabs,
    imageFileTabs,
    activeTabId,
    visualizationState,
    setViewerRef: setStoreViewerRef,
    setVisualizationStyle
  } = useMolecularStore()

  // Normalize legacy dark background to white so existing tabs show white viewer
  const effectiveBackgroundColor =
    visualizationState.backgroundColor === 0x111827 ? 0xffffff : visualizationState.backgroundColor

  // Check if active tab is an input file tab
  const activeInputFileTab = inputFileTabs.find(tab => tab.id === activeTabId)

  // Check if active tab is an image file tab
  const activeImageFileTab = imageFileTabs.find(tab => tab.id === activeTabId)

  // Animation controls
  const animateModelIndexTargetFps = () => {
    return 8 // Default FPS for model animations
  }

  const animate = {
    onceForward: () => {
      if (!pluginRef.current) return
      pluginRef.current.managers.animation.play(AnimateModelIndex, {
        duration: { name: 'computed', params: { targetFps: animateModelIndexTargetFps() } },
        mode: { name: 'once', params: { direction: 'forward' } }
      })
    },
    onceBackward: () => {
      if (!pluginRef.current) return
      pluginRef.current.managers.animation.play(AnimateModelIndex, {
        duration: { name: 'computed', params: { targetFps: animateModelIndexTargetFps() } },
        mode: { name: 'once', params: { direction: 'backward' } }
      })
    },
    palindrome: () => {
      if (!pluginRef.current) return
      pluginRef.current.managers.animation.play(AnimateModelIndex, {
        duration: { name: 'computed', params: { targetFps: animateModelIndexTargetFps() } },
        mode: { name: 'palindrome', params: {} }
      })
    },
    loop: () => {
      if (!pluginRef.current) return
      pluginRef.current.managers.animation.play(AnimateModelIndex, {
        duration: { name: 'computed', params: { targetFps: animateModelIndexTargetFps() } },
        mode: { name: 'loop', params: { direction: 'forward' } }
      })
    },
    stop: () => {
      if (!pluginRef.current) return
      pluginRef.current.managers.animation.stop()
    }
  }

  // Coloring controls
  const coloring = {
    applyStripes: async () => {
      if (!pluginRef.current) return
      await pluginRef.current.dataTransaction(async () => {
        for (const s of pluginRef.current!.managers.structure.hierarchy.current.structures) {
          await pluginRef.current!.managers.structure.component.updateRepresentationsTheme(
            s.components,
            { color: StripedResidues.propertyProvider.descriptor.name as any }
          )
        }
      })
    },
    applyCustomTheme: async () => {
      if (!pluginRef.current) return
      await pluginRef.current.dataTransaction(async () => {
        for (const s of pluginRef.current!.managers.structure.hierarchy.current.structures) {
          await pluginRef.current!.managers.structure.component.updateRepresentationsTheme(
            s.components,
            { color: CustomColorThemeProvider.name as any }
          )
        }
      })
    },
    applyDefault: async () => {
      if (!pluginRef.current) return
      await pluginRef.current.dataTransaction(async () => {
        for (const s of pluginRef.current!.managers.structure.hierarchy.current.structures) {
          await pluginRef.current!.managers.structure.component.updateRepresentationsTheme(
            s.components,
            { color: 'default' }
          )
        }
      })
    },
    applyFukuiTheme: async (values: number[], type: string) => {
      if (!pluginRef.current) {
        console.warn('WARNING: Cannot apply Fukui theme: plugin not initialized');
        return;
      }

      console.log(`[STYLE] Applying Fukui theme: type=${type}, values count=${values.length}`);
      if (values.length > 0) {
        console.log(`[INFO] Value range: min=${Math.min(...values).toFixed(4)}, max=${Math.max(...values).toFixed(4)}`);
        console.log(`[INFO] First 5 values:`, values.slice(0, 5).map(v => v.toFixed(4)));
      }

      // Ensure the theme is registered (non-blocking, don't wait for it)
      // Registration is idempotent, so we can try to register even if already registered
      try {
        const registry = pluginRef.current.representation.structure.themes.colorThemeRegistry;
        const isRegistered = registry.has(FukuiColorThemeProvider.name);

        if (!isRegistered) {
          console.log('[REGISTER] Registering Fukui color theme provider');
          registry.add(FukuiColorThemeProvider);
          console.log('SUCCESS: Theme registered');
        } else {
          console.log('SUCCESS: Theme already registered, proceeding...');
        }
      } catch (regError) {
        console.warn('WARNING: Theme registration check failed (non-fatal, continuing):', regError);
        // Continue anyway - try to register it (idempotent operation)
        try {
          pluginRef.current.representation.structure.themes.colorThemeRegistry.add(FukuiColorThemeProvider);
          console.log('SUCCESS: Theme registered via fallback');
        } catch (e) {
          console.warn('WARNING: Could not register theme, but continuing anyway:', e);
        }
      }

      // Proceed immediately - don't wait for registration to complete
      console.log('[PROCESS] Proceeding with theme application...');

      try {
        // Use state builder API for more reliable theme updates
        const state = pluginRef.current.state.data;

        // Find all structure representations - try multiple queries to catch all types
        let representations = state.selectQ(q =>
          q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D)
        );

        // If no representations found, try finding by structure hierarchy
        if (representations.length === 0) {
          console.log('🔍 No representations found with StructureRepresentation3D, trying alternative method...');
          // Try to find any representation transforms
          representations = state.selectQ(q =>
            q.ofType(StateTransforms.Representation.StructureRepresentation3D)
          );
        }

        console.log(`[SEARCH] Found ${representations.length} representation(s) to update`);

        // Always use manager API as it's more reliable for theme updates
        // The state builder approach sometimes doesn't find representations for small molecules
        console.log('[PROCESS] Using manager API for theme update (more reliable for small molecules)');

        // Directly update the theme parameters without resetting to default first
        // This avoids the visible flash when switching between Fukui types
        // Create a new params object to ensure Molstar sees it as a change
        const themeParams = {
          values: [...values], // New array copy to ensure it's a different reference
          type: type
        };

        await pluginRef.current.dataTransaction(async () => {
          const structures = pluginRef.current!.managers.structure.hierarchy.current.structures;
          console.log(`🏗️ Updating ${structures.length} structure(s) with new Fukui theme (type=${type})`);

          for (const s of structures) {
            console.log(`[PROCESS] Updating structure with ${s.components.length} component(s)`);
            await pluginRef.current!.managers.structure.component.updateRepresentationsTheme(
              s.components,
              {
                color: FukuiColorThemeProvider.name as any,
                colorParams: themeParams // Use the new params object
              }
            );
          }
        });

        // Also update via state builder if representations are found
        // This provides a double-update to ensure the theme refreshes with new parameters
        if (representations.length > 0) {
          console.log(`[PROCESS] Also updating ${representations.length} representation(s) via state builder...`);

          const builder2 = state.build();

          for (const repr of representations) {
            // Create completely new params object to force re-evaluation
            const newParams = {
              values: [...values], // New array copy
              type: type
            };

            builder2.to(repr).update(old => ({
              ...old,
              colorTheme: {
                name: FukuiColorThemeProvider.name as any,
                params: newParams
              }
            }));
          }

          await pluginRef.current.runTask(state.updateTree(builder2));
          console.log(`SUCCESS: Also updated ${representations.length} representation(s) via state builder`);
        }

        // Force a repaint to ensure the changes are visible
        if (pluginRef.current.canvas3d) {
          pluginRef.current.canvas3d.requestDraw();
        }

        console.log('SUCCESS: Fukui theme applied using manager API');

        return;
      } catch (error) {
        console.error('ERROR: Failed to apply Fukui theme:', error);
        // Fallback to manager API
        try {
          await pluginRef.current.dataTransaction(async () => {
            const structures = pluginRef.current!.managers.structure.hierarchy.current.structures;
            for (const s of structures) {
              // Force update by first removing the theme, then re-applying
              await pluginRef.current!.managers.structure.component.updateRepresentationsTheme(
                s.components,
                { color: 'default' }
              );
              // Small delay to ensure the change is processed
              await new Promise(resolve => setTimeout(resolve, 50));
              // Now apply the Fukui theme
              await pluginRef.current!.managers.structure.component.updateRepresentationsTheme(
                s.components,
                {
                  color: FukuiColorThemeProvider.name as any,
                  colorParams: { values, type }
                }
              );
            }
          });
          console.log('SUCCESS: Fukui theme applied using fallback method');
        } catch (fallbackError) {
          console.error('ERROR: Fallback method also failed:', fallbackError);
          throw fallbackError;
        }
      }
    }
  }

  // Interactivity controls
  const interactivity = {
    highlightResidue: (seqId: number) => {
      if (!pluginRef.current) return

      try {
        const structure = pluginRef.current.managers.structure.hierarchy.current.structures[0]
        if (!structure?.cell?.obj?.data && !structure?.data) {
          console.warn('Cannot highlight: structure not loaded')
          return
        }

        const data = structure.cell?.obj?.data || structure.data

        const { MolScriptBuilder } = require('molstar/lib/mol-script/language/builder')
        const MS = MolScriptBuilder

        const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
          'residue-test': Q.core.rel.eq([Q.struct.atomProperty.macromolecular.label_seq_id(), seqId])
        }), data)

        if (!sel) {
          console.warn('Cannot highlight: selection is empty or invalid')
          return
        }

        const loci = StructureSelection.toLociWithSourceUnits(sel)

        if (!loci) {
          console.warn('Cannot highlight: loci is null or undefined')
          return
        }

        try {
          pluginRef.current.managers.interactivity.lociHighlights.highlightOnly({ loci }, false)
        } catch (highlightError) {
          console.warn('Failed to highlight - loci may be invalid:', highlightError)
        }
      } catch (e) {
        console.warn('Failed to highlight residue:', e)
      }
    },
    clearHighlight: () => {
      if (!pluginRef.current) return
      try {
        pluginRef.current.managers.interactivity.lociHighlights.highlightOnly({ loci: EmptyLoci }, false)
      } catch (e) {
        console.warn('Failed to clear highlight:', e)
      }
    }
  }

  // Grid box visualization controls
  const gridBoxControls = {
    show: async (params: GridBoxParams) => {
      if (!pluginRef.current) return
      await showGridBox(pluginRef.current, params)
    },
    hide: async () => {
      if (!pluginRef.current) return
      await removeGridBox(pluginRef.current)
    },
    toggle: async (params: GridBoxParams | null, show: boolean) => {
      if (!pluginRef.current) return
      await toggleGridBox(pluginRef.current, params, show)
    }
  }

  // Load structure function
  const load = useCallback(async (params: LoadParams) => {
    if (!pluginRef.current) {
      console.error('Plugin not initialized')
      return
    }

    const {
      url: loadUrl,
      pdbId: loadPdbId,
      pdbData: loadPdbData,
      format: loadFormat = 'mmcif',
      isBinary: loadIsBinary = false,
      assemblyId: loadAssemblyId = ''
    } = params

    console.log('[PROCESS] Loading structure...', params)

    try {
      await pluginRef.current.clear()

      // Restore camera state immediately after clear to prevent flash of wrong angle
      // This ensures that when the new structure appears, the camera is already in the correct position
      const state = useMolecularStore.getState()
      const activeTab = state.structureTabs.find(t => t.id === state.activeTabId)
      let cameraRestored = false

      if (activeTab?.cameraState && pluginRef.current.canvas3d) {
        try {
          pluginRef.current.canvas3d.camera.setState(activeTab.cameraState)
          cameraRestored = true
          console.log('📸 Restored camera state early')
        } catch (e) {
          console.warn('Failed to restore camera state early:', e)
        }
      }

      let data
      let actualFormat = loadFormat

      if (loadUrl) {
        data = await pluginRef.current.builders.data.download(
          { url: Asset.Url(loadUrl), isBinary: loadIsBinary },
          { state: { isGhost: false } }
        )
      } else if (loadPdbId) {
        const url = `https://files.rcsb.org/download/${loadPdbId.toUpperCase()}.cif`
        data = await pluginRef.current.builders.data.download(
          { url: Asset.Url(url), isBinary: false },
          { state: { isGhost: false } }
        )
        actualFormat = 'mmcif'
      } else if (loadPdbData) {
        data = await pluginRef.current.builders.data.rawData({
          data: loadPdbData,
          label: 'Structure Data'
        })
        actualFormat = loadFormat || 'pdb'
      } else {
        console.error('No data source provided')
        return
      }

      if (!data || !data.obj) {
        throw new Error('Invalid data cell: data object is null or missing')
      }

      const trajectory = await pluginRef.current.builders.structure.parseTrajectory(data, actualFormat)
      const model = await pluginRef.current.builders.structure.createModel(trajectory)
      const structure = await pluginRef.current.builders.structure.createStructure(
        model,
        loadAssemblyId ? { name: 'assembly', params: { id: loadAssemblyId } } : undefined
      )

      console.log('SUCCESS: Structure created successfully')

      const structureData = structure.cell?.obj?.data
      if (structureData) {
        try {
          const atomCount = structureData.units.reduce((sum: number, unit: any) => {
            return sum + (unit.elements?.length || 0)
          }, 0)
          console.log('🔍 Structure has', atomCount, 'atoms')

          if (atomCount === 0) {
            pluginRef.current.managers.interactivity.setProps({
              granularity: 'element'
            })
          } else {
            pluginRef.current.managers.interactivity.setProps({
              granularity: 'residue'
            })
          }
        } catch (e) {
          console.error('ERROR: Could not count atoms:', e)
        }
      }

      // Create separate representations for protein and ligands
      let hasProtein = false
      let hasLigands = false

      // Check if it's a Boltz-2 pose to use B-factor coloring (uncertainty)
      const isBoltz2Pose = currentStructure?.metadata?.is_boltz2_pose === true

      // Add cartoon representation for polymer
      try {
        const polymer = await pluginRef.current.builders.structure.tryCreateComponentStatic(
          structure,
          'polymer'
        )
        if (polymer) {
          await pluginRef.current.builders.structure.representation.addRepresentation(polymer, {
            type: 'cartoon',
            color: isBoltz2Pose ? 'uncertainty' : 'chain-id',
          })
          hasProtein = true
          console.log(`SUCCESS: Cartoon representation added for protein (color: ${isBoltz2Pose ? 'uncertainty' : 'chain-id'})`)
        }
      } catch (e) {
        console.log('[INFO] No polymer found')
      }

      // Add ball-and-stick representation for ligands
      try {
        const ligand = await pluginRef.current.builders.structure.tryCreateComponentStatic(
          structure,
          'ligand'
        )
        if (ligand) {
          await pluginRef.current.builders.structure.representation.addRepresentation(ligand, {
            type: 'ball-and-stick',
            color: 'element-symbol',
            typeParams: {
              sizeFactor: 0.3,
            }
          })
          hasLigands = true
          console.log('SUCCESS: Ball-and-stick representation added for ligands')
        }
      } catch (e) {
        console.log('[INFO] No standard ligands found')
      }

      // Try non-standard component
      if (!hasLigands) {
        try {
          const nonStandard = await pluginRef.current.builders.structure.tryCreateComponentStatic(
            structure,
            'non-standard'
          )
          if (nonStandard) {
            await pluginRef.current.builders.structure.representation.addRepresentation(nonStandard, {
              type: 'ball-and-stick',
              color: 'element-symbol',
              typeParams: {
                sizeFactor: 0.3,
              }
            })
            hasLigands = true
            console.log('SUCCESS: Ball-and-stick representation added for non-standard entities')
          }
        } catch (e) {
          // Continue
        }
      }

      // Fallback: if no components, show everything as ball-and-stick
      if (!hasProtein && !hasLigands) {
        try {
          await pluginRef.current.builders.structure.representation.addRepresentation(structure, {
            type: 'ball-and-stick',
            color: 'element-symbol',
          })
          console.log('SUCCESS: Fallback representation created')
        } catch (e) {
          console.error('ERROR: Error creating fallback representation:', e)
        }
      }

      // Add colored surface to each docked pose to distinguish from native cofactors.
      // Docked poses are assigned unique chain IDs (Z, Y, X...) so they can be reliably
      // selected via auth_asym_id, which Mol* always reads verbatim from PDB column 22.
      const poseChainIds: string[] = currentStructure?.metadata?.pose_chain_ids ?? []
      if (poseChainIds.length > 0) {
        const { MolScriptBuilder } = require('molstar/lib/mol-script/language/builder')
        const MS = MolScriptBuilder
        for (let i = 0; i < poseChainIds.length; i++) {
          const chainId = poseChainIds[i]
          const color = POSE_SURFACE_COLORS[i % POSE_SURFACE_COLORS.length]
          try {
            // auth_asym_id is the PDB chain column, guaranteed verbatim — use set.has pattern
            // from Mol*'s own structure-selection-query helpers for reliable matching
            const expression = MS.struct.generator.atomGroups({
              'chain-test': MS.core.rel.eq([MS.ammp('auth_asym_id'), chainId])
            })
            const poseComp = await pluginRef.current.builders.structure.tryCreateComponentFromExpression(
              structure,
              expression,
              `docked-pose-${i}`,
              { label: `Docked Pose ${i + 1}` }
            )
            if (poseComp) {
              await pluginRef.current.builders.structure.representation.addRepresentation(poseComp, {
                type: 'molecular-surface',
                color: 'uniform',
                colorParams: { value: color },
                typeParams: { alpha: 0.6 }
              })
              console.log(`SUCCESS: Added colored surface for docked pose ${i + 1} (chain ${chainId})`)
            } else {
              console.warn(`WARNING: No atoms found in chain ${chainId} for docked pose ${i + 1}`)
            }
          } catch (e) {
            console.warn(`WARNING: Could not add surface for docked pose ${i + 1} (chain ${chainId}):`, e)
          }
        }
      }

      // Verify structure has valid representations
      const hasValidRepresentations = pluginRef.current.managers.structure.hierarchy.current.structures.length > 0 &&
        pluginRef.current.managers.structure.hierarchy.current.structures[0].components.length > 0

      if (hasValidRepresentations) {
        pluginRef.current.managers.interactivity.setProps({
          granularity: 'residue'
        })
      } else {
        pluginRef.current.managers.interactivity.setProps({
          granularity: 'element'
        })
      }

      // Focus camera on structure
      const { canvas3d } = pluginRef.current
      if (canvas3d) {
        if (!cameraRestored) {
          // Only reset camera if we didn't restore a saved state
          canvas3d.requestCameraReset()
          console.log('SUCCESS: Camera reset complete')
        }
      }

      // Apply background color after structure load
      await MolstarControls.setBackgroundColor(pluginRef.current, effectiveBackgroundColor)

      console.log('SUCCESS: Structure loaded successfully')

      // Detect structure type
      if (loadPdbData) {
        const structureType = detectStructureType(loadPdbData)
        if (onStructureLoaded) {
          onStructureLoaded(structureType)
        }
      } else if (hasProtein && hasLigands) {
        if (onStructureLoaded) {
          onStructureLoaded('complex')
        }
      } else if (hasProtein) {
        if (onStructureLoaded) {
          onStructureLoaded('protein')
        }
      } else {
        if (onStructureLoaded) {
          onStructureLoaded('small-molecule')
        }
      }
    } catch (error) {
      console.error('[ERROR] Failed to load structure:', error)
      throw error
    }
  }, [onStructureLoaded, effectiveBackgroundColor])

  // Load trajectory function
  const loadTrajectory = useCallback(async (
    trajectoryUrl: string | { pdbData: string },
    format: BuiltInTrajectoryFormat = 'pdb'
  ) => {
    if (!pluginRef.current) {
      console.error('Plugin not initialized')
      return
    }

    console.log('[PROCESS] Loading trajectory...', typeof trajectoryUrl === 'string' ? trajectoryUrl : 'from PDB data')

    try {
      await pluginRef.current.clear()

      // Restore camera state immediately after clear
      const state = useMolecularStore.getState()
      const activeTab = state.structureTabs.find(t => t.id === state.activeTabId)
      let cameraRestored = false

      if (activeTab?.cameraState && pluginRef.current.canvas3d) {
        try {
          pluginRef.current.canvas3d.camera.setState(activeTab.cameraState)
          cameraRestored = true
          console.log('📸 Restored camera state early (trajectory)')
        } catch (e) {
          console.warn('Failed to restore camera state early:', e)
        }
      }

      let data
      let actualFormat = format

      if (typeof trajectoryUrl === 'string') {
        data = await pluginRef.current.builders.data.download(
          { url: Asset.Url(trajectoryUrl), isBinary: false },
          { state: { isGhost: false } }
        )
      } else {
        data = await pluginRef.current.builders.data.rawData({
          data: trajectoryUrl.pdbData,
          label: 'Trajectory'
        })
        actualFormat = 'pdb'
      }

      if (!data || !data.obj) {
        throw new Error('Invalid trajectory data: data object is null or missing')
      }

      const trajectory = await pluginRef.current.builders.structure.parseTrajectory(data, actualFormat)
      const model = await pluginRef.current.builders.structure.createModel(trajectory)
      const structure = await pluginRef.current.builders.structure.createStructure(model)

      // Create representations
      let hasProtein = false
      let hasLigands = false

      try {
        const polymer = await pluginRef.current.builders.structure.tryCreateComponentStatic(
          structure,
          'polymer'
        )
        if (polymer) {
          await pluginRef.current.builders.structure.representation.addRepresentation(polymer, {
            type: 'cartoon',
            color: 'chain-id',
          })
          hasProtein = true
        }
      } catch (e) {
        // Continue
      }

      try {
        const ligand = await pluginRef.current.builders.structure.tryCreateComponentStatic(
          structure,
          'ligand'
        )
        if (ligand) {
          await pluginRef.current.builders.structure.representation.addRepresentation(ligand, {
            type: 'ball-and-stick',
            color: 'element-symbol',
            typeParams: {
              sizeFactor: 0.3,
            }
          })
          hasLigands = true
        }
      } catch (e) {
        // Continue
      }

      if (!hasProtein && !hasLigands) {
        await pluginRef.current.builders.structure.representation.addRepresentation(structure, {
          type: 'ball-and-stick',
          color: 'element-symbol',
        })
      }

      const { canvas3d } = pluginRef.current
      if (canvas3d) {
        if (!cameraRestored) {
          setTimeout(() => {
            canvas3d.requestCameraReset()
          }, 100)
        }
      }

      if (onStructureLoaded) {
        onStructureLoaded('complex')
      }
    } catch (error) {
      console.error('ERROR: Failed to load trajectory:', error)
      throw error
    }
  }, [onStructureLoaded])

  // Animate normal mode from trajectory PDB data
  const animateNormalMode = useCallback(async (
    pdbData: string,
    options: { loop?: boolean; speed?: number; mode?: 'loop' | 'palindrome' | 'once' } = {}
  ) => {
    if (!pluginRef.current) {
      console.error('Plugin not initialized')
      return
    }

    const {
      loop = true,
      speed = 30, // frames per second
      mode = 'loop'
    } = options

    console.log('[PROCESS] Loading normal mode trajectory for animation...')

    try {
      // Load trajectory
      await loadTrajectory({ pdbData }, 'pdb')

      // Wait a bit for structure to be ready
      await new Promise(resolve => setTimeout(resolve, 300))

      // Start animation based on mode
      if (mode === 'palindrome') {
        animate.palindrome()
      } else if (mode === 'once') {
        animate.onceForward()
      } else {
        // Default: loop
        animate.loop()
      }

      // Adjust animation speed if needed
      // Note: Molstar's AnimateModelIndex uses targetFps, but we can't directly set it here
      // The speed parameter is informational for now
      console.log(`[SUCCESS] Normal mode animation started (mode: ${mode}, target speed: ${speed} fps)`)
    } catch (error) {
      console.error('ERROR: Failed to animate normal mode:', error)
      throw error
    }
  }, [loadTrajectory, animate])

  // Set background color
  const setBackground = useCallback((color: number) => {
    if (!pluginRef.current) return
    MolstarControls.setBackgroundColor(pluginRef.current, color)
  }, [])

  // Handle structure type detected
  const handleStructureTypeDetected = async (structureType: 'protein' | 'small-molecule' | 'complex') => {
    console.log(`[PROCESS] Resetting visualization to defaults for ${structureType}`)

    const defaults = getDefaultVisualizationSettings(structureType)
    setVisualizationStyle(defaults.style)

    setTimeout(async () => {
      if (pluginRef.current) {
        await MolstarControls.setRepresentationStyle(pluginRef.current, defaults.style)
        console.log(`SUCCESS: Applied default style: ${defaults.style} for ${structureType}`)
      }
    }, 500)
  }

  // Initialize plugin
  const initPlugin = async () => {
    const targetElement = containerRef.current

    if (!targetElement) {
      console.error('ERROR: Target element not found')
      return
    }

    console.log('[PROCESS] Initializing Molstar plugin from bundle...')

    try {
      // Suppress console errors from PDBe API fetch failures in dev mode
      const originalError = console.error
      const originalWarn = console.warn
      let suppressNextError = false

      // Temporarily suppress fetch errors from PDBe API
      console.error = function(...args: any[]) {
        const message = args[0]?.toString?.() || ''
        if (message.includes('Failed to fetch') || message.includes('ERR_CONNECTION_REFUSED')) {
          suppressNextError = true
          return
        }
        if (!suppressNextError) {
          originalError.apply(console, args)
        }
        suppressNextError = false
      }

      const viewer = await window.molstar.Viewer.create(targetElement, {
        layoutIsExpanded: false,
        layoutShowControls: false,
        viewportShowExpand: false,
        collapseLeftPanel: true
      })

      // Restore original console methods
      console.error = originalError
      console.warn = originalWarn

      viewerRef.current = viewer
      pluginRef.current = viewer.plugin
      isInitializedRef.current = true
      setIsReady(true)

      console.log('SUCCESS: Molstar plugin initialized from bundle')

      // Set background color using simplified API
      await MolstarControls.setBackgroundColor(viewer.plugin, effectiveBackgroundColor)

      // Remove background images from canvas (CSS handles this, but ensure it's clean)
      const canvas = targetElement.querySelector('canvas')
      if (canvas) {
        canvas.style.backgroundImage = 'none'
      }

      // Create handle object for store and other components
      const handle: MolstarViewerHandle = {
        plugin: viewer.plugin,
        load,
        loadTrajectory,
        animateNormalMode,
        setBackground,
        toggleSpin: () => MolstarControls.toggleSpin(viewer.plugin),
        animate,
        coloring,
        interactivity,
        gridBox: gridBoxControls
      }

      // Store handle in store for other components to access
      setStoreViewerRef(handle)

      // Apply background color immediately
      setBackground(effectiveBackgroundColor)
    } catch (error) {
      console.error('[ERROR] Failed to initialize plugin:', error)
    }
  }

  // Load Molstar assets and initialize
  useEffect(() => {
    if (isInitializedRef.current) return

    const loadAssets = async () => {
      if (window.molstar) {
        initPlugin()
        return
      }

      // Load CSS
      const link = document.createElement('link')
      link.href = '/molstar/molstar.css'
      link.rel = 'stylesheet'
      link.onerror = () => {
        console.warn('WARNING: Failed to load molstar.css')
      }
      document.head.appendChild(link)

      // Load JS
      const script = document.createElement('script')
      script.src = '/molstar/molstar.js'
      script.async = true
      script.onload = () => {
        if (window.molstar && window.molstar.Viewer) {
          initPlugin()
        } else {
          setTimeout(() => {
            if (window.molstar && window.molstar.Viewer) {
              initPlugin()
            } else {
              console.error('[ERROR] Molstar not available after script load')
            }
          }, 100)
        }
      }
      script.onerror = () => {
        console.error('ERROR: Failed to load molstar.js')
      }
      document.body.appendChild(script)
    }

    loadAssets()
  }, [])

  // Watch for structure changes from the store
  useEffect(() => {
    if (!pluginRef.current) return

    if (!currentStructure) {
      console.log('🧹 Clearing viewer - no structure loaded')
      pluginRef.current.clear().then(() => {
        console.log('SUCCESS: Viewer cleared')
        setLoadedStructureId(null)
        setCurrentPdbId(undefined)
      }).catch((err: any) => console.error('ERROR: Failed to clear viewer:', err))
      return
    }

    const isDockedPose = currentStructure.metadata?.is_docked_pose === true
    const isBoltz2Pose = currentStructure.metadata?.is_boltz2_pose === true
    const isPose = isDockedPose || isBoltz2Pose
    const shouldSkipReload = !isPose && loadedStructureId === currentStructure.structure_id

    if (shouldSkipReload) {
      console.log('⏭️ Skipping reload - structure already loaded:', currentStructure.structure_id)
      return
    }

    const isPdbId = currentStructure.structure_id && /^[0-9][A-Za-z0-9]{3}$/i.test(currentStructure.structure_id)

    if (isPdbId) {
      setCurrentPdbId(currentStructure.structure_id)
      load({ pdbId: currentStructure.structure_id })
        .then(() => {
          console.log('SUCCESS: Loaded structure from PDB ID:', currentStructure.structure_id)
          setLoadedStructureId(currentStructure.structure_id)
          if (onStructureLoaded) {
            onStructureLoaded(currentStructure.structure_id)
          }
        })
        .catch(err => console.error('ERROR: Failed to load structure:', err))
    } else if (currentStructure.pdb_data || currentStructure.sdf_data || currentStructure.xyz_data) {
      // Determine which format and data to use for visualization
      // Special cases (docked poses, Boltz2 poses) always use PDB data
      // Otherwise: XYZ > SDF > PDB (XYZ for QC results, SDF for small molecules, PDB for proteins)
      let primaryFormat: BuiltInTrajectoryFormat = 'pdb'
      let visualizationData = ''

      const isDockedPose = currentStructure.metadata?.is_docked_pose === true
      const isBoltz2Pose = currentStructure.metadata?.is_boltz2_pose === true
      const forcePDB = isDockedPose || isBoltz2Pose

      if (forcePDB && currentStructure.pdb_data) {
        // Docked poses and Boltz2 predictions must use PDB format
        primaryFormat = 'pdb'
        visualizationData = currentStructure.pdb_data
      } else if (currentStructure.xyz_data) {
        primaryFormat = 'xyz'
        visualizationData = currentStructure.xyz_data
      } else if (currentStructure.pdb_data) {
        // Prioritize PDB as it is more robust for visualization in Molstar and generally preferred
        primaryFormat = 'pdb'
        visualizationData = currentStructure.pdb_data
      } else if (currentStructure.sdf_data) {
        // Molstar uses 'sdf' format which handles both SDF and MOL files
        primaryFormat = 'sdf'
        visualizationData = currentStructure.sdf_data
      }

      if (!visualizationData) {
        console.warn('WARNING: No structure data available for visualization')
        return
      }

      const isTrajectory = (currentStructure as any).isTrajectory || false

      const loadStructure = async () => {
        try {
          console.log('🧹 Clearing viewer before loading structure...')
          await pluginRef.current?.clear()
          console.log('SUCCESS: Viewer cleared, now loading structure...')

          if (isTrajectory && loadTrajectory) {
            console.log('🎬 Loading trajectory...')
            await loadTrajectory({ pdbData: visualizationData }, 'pdb')
            console.log(`SUCCESS: Loaded trajectory (primary format: ${primaryFormat.toUpperCase()})`);
          } else {
            // Use the actual format for loading - XYZ files need 'xyz' format, not 'pdb'
            await load({ pdbData: visualizationData, format: primaryFormat })
            console.log(`SUCCESS: Loaded structure with format: ${primaryFormat.toUpperCase()}`);
          }

          setLoadedStructureId(currentStructure.structure_id)
          if (onStructureLoaded) {
            onStructureLoaded(currentStructure.structure_id || 'uploaded')
          }
        } catch (err) {
          console.error('ERROR: Failed to load structure:', err)
        }
      }

      loadStructure()
    }
  }, [currentStructure, load, loadTrajectory, onStructureLoaded, loadedStructureId])

  // Apply background color when it changes
  useEffect(() => {
    if (!pluginRef.current) return
    setBackground(effectiveBackgroundColor)
  }, [effectiveBackgroundColor, setBackground])

  // Sync viewer rendering with visualization state
  useEffect(() => {
    if (!pluginRef.current || !currentStructure) return

    const applyVisualizationState = async () => {
      try {
        console.log('[PROCESS] Syncing viewer with visualization state:', visualizationState)

        // Apply background color
        setBackground(effectiveBackgroundColor)

        // Apply color theme
        switch (visualizationState.colorTheme) {
          case 'default':
            await coloring.applyDefault()
            break
          case 'striped':
            await coloring.applyStripes()
            break
          case 'custom':
            await coloring.applyCustomTheme()
            break
        }

        // Apply style
        await MolstarControls.setRepresentationStyle(
          pluginRef.current,
          visualizationState.style
        )

        // Apply surface settings
        await MolstarControls.toggleSurface(
          pluginRef.current,
          visualizationState.showSurface,
          visualizationState.surfaceType,
          visualizationState.surfaceOpacity
        )

        console.log('SUCCESS: Viewer synced with visualization state')
      } catch (error) {
        console.error('ERROR: Failed to sync viewer with visualization state:', error)
      }
    }

    const timeoutId = setTimeout(applyVisualizationState, 100)
    return () => clearTimeout(timeoutId)
  }, [visualizationState, currentStructure, setBackground])

  // Create viewer handle for external access (e.g., Fukui visualization)
  const viewerHandle: MolstarViewerHandle | null = pluginRef.current ? {
    plugin: pluginRef.current,
    load,
    loadTrajectory,
    animateNormalMode,
    setBackground,
    toggleSpin: () => MolstarControls.toggleSpin(pluginRef.current),
    animate,
    coloring,
    interactivity,
    gridBox: gridBoxControls
  } : null

  return (
    <div className="relative w-full h-full flex flex-col bg-gray-900" suppressHydrationWarning>
      {/* Structure Tab Bar */}
      <StructureTabBar />

      {/* Main Viewer */}
      <div className="flex-1 relative bg-gray-900" suppressHydrationWarning>
        {/* Text File Viewer - shown when input file tab is active */}
        {activeInputFileTab && (
          <div className="absolute inset-0 z-10">
            <TextFileViewer
              content={activeInputFileTab.content}
              name={activeInputFileTab.name}
            />
          </div>
        )}

        {/* Image File Viewer - shown when image file tab is active */}
        {activeImageFileTab && (
          <div className="absolute inset-0 z-10">
            <ImageFileViewer
              imageUrl={activeImageFileTab.imageUrl}
              name={activeImageFileTab.name}
            />
          </div>
        )}

        {/* Molecular Viewer Container - always rendered to preserve Molstar state */}
        <div
          className="w-full h-full relative"
          style={{ visibility: activeInputFileTab || activeImageFileTab ? 'hidden' : 'visible' }}
        >
          <div
            ref={containerRef}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              backgroundColor: '#ffffff'
            }}
          />
        </div>
      </div>
    </div>
  )
}
