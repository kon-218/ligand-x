'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, Info, Loader2 } from 'lucide-react'
import { qcService } from '@/lib/qc-service'

interface OrbitalViewerProps {
  jobId: string | null
  className?: string
}

interface ViewerState {
  selectedMO: number | null
  orbitalIsovalue: number
  loading: boolean
  error: string | null
  homoIndex: number
  totalMOs: number
}

export function OrbitalViewer({
  jobId,
  className = ""
}: OrbitalViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<ViewerState>({
    selectedMO: null,
    orbitalIsovalue: 1.0,
    loading: false,
    error: null,
    homoIndex: -1,
    totalMOs: 0
  })
  const [molstarPlugin, setMolstarPlugin] = useState<any>(null)
  const basisRef = useRef<any>(null)
  const selectorsRef = useRef<any>(null)

  // Load MO data and initialize viewer
  useEffect(() => {
    if (!jobId || !viewerRef.current) return

    const initializeViewer = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        console.log('🔧 Initializing Molstar with alpha-orbitals extension...')
        
        // Dynamically import Molstar modules
        const { createPluginUI } = await import('molstar/lib/mol-plugin-ui')
        const { DefaultPluginUISpec } = await import('molstar/lib/mol-plugin-ui/spec')
        const { renderReact18 } = await import('molstar/lib/mol-plugin-ui/react18')
        const { PluginConfig } = await import('molstar/lib/mol-plugin/config')
        const { StaticBasisAndOrbitals, CreateOrbitalVolume, CreateOrbitalRepresentation3D } = 
          await import('molstar/lib/extensions/alpha-orbitals/transforms')
        const { ColorNames } = await import('molstar/lib/mol-util/color/names')
        
        const defaultSpec = DefaultPluginUISpec()
        const plugin = await createPluginUI({
          target: viewerRef.current!,
          render: renderReact18,
          spec: {
            ...defaultSpec,
            layout: {
              initial: {
                isExpanded: false,
                showControls: false
              },
            },
            components: {
              controls: { left: 'none', right: 'none', top: 'none', bottom: 'none' },
            },
            config: [
              [PluginConfig.Viewport.ShowExpand, false],
              [PluginConfig.Viewport.ShowControls, false],
              [PluginConfig.Viewport.ShowSelectionMode, false],
              [PluginConfig.Viewport.ShowAnimation, false],
            ]
          }
        })

        console.log('📥 Fetching MO data for job:', jobId)
        const moData = await qcService.getMOData(jobId)
        
        // Create molecular structure from geometry FIRST
        const coords = moData.geometry.Coordinates.Cartesians
        const isBohr = moData.geometry.Coordinates.Units === 'a.u.'
        const conversionFactor = isBohr ? 0.529177 : 1.0
        
        // Extract coordinates and convert units
        const atomCoords = coords.map(([element, x, y, z]: any) => ({
          element,
          x: x * conversionFactor,
          y: y * conversionFactor, 
          z: z * conversionFactor
        }))
        
        const xyzData = `${coords.length}\nMolecule from ORCA\n${atomCoords.map((atom: any) => 
          `${atom.element} ${atom.x.toFixed(6)} ${atom.y.toFixed(6)} ${atom.z.toFixed(6)}`
        ).join('\n')}`

        const data = await plugin.builders.data.rawData({ data: xyzData }, { state: { isGhost: true } })
        const trajectory = await plugin.builders.structure.parseTrajectory(data, 'xyz')
        const model = await plugin.builders.structure.createModel(trajectory)
        const structure = await plugin.builders.structure.createStructure(model)
        
        // For XYZ format, coordinates should not be transformed by Mol*
        // Use original coordinates directly - they should match the structure exactly
        // Convert atomCoords array to the format expected by convertOrcaToMolstarFormat
        const structureCoords: number[][] = atomCoords.map((atom: { x: number; y: number; z: number }) => [atom.x, atom.y, atom.z])
        
        console.log('🔧 Using original coordinates for basis alignment:', structureCoords.length, 'atoms')
        if (structureCoords.length > 0) {
          console.log('Coordinates (first 3):', structureCoords.slice(0, 3))
        }
        
        // Convert ORCA data to Molstar alpha-orbitals format using original coordinates
        // Since XYZ format is not transformed, these should align perfectly with the structure
        const { basisData, orbitalsData, homoIndex } = convertOrcaToMolstarFormat(
          moData, 
          structureCoords // Use original coordinates (XYZ format is not transformed)
        )
        
        console.log(`[SUCCESS] Converted data: ${orbitalsData.length} orbitals, HOMO index: ${homoIndex}`)
        
        // Add ball-and-stick representation
        await plugin.builders.structure.representation.addRepresentation(structure, {
          type: 'ball-and-stick',
          color: 'element-symbol',
          size: 'uniform',
        })

        // Create basis and orbitals data using Molstar alpha-orbitals extension
        // Basis centers now use the same coordinate system as the parsed structure
        console.log('🔧 Creating basis with aligned coordinates...')
        console.log('Structure coordinates (first 3):', structureCoords.slice(0, 3))
        console.log('Basis centers (first 3):', basisData.atoms.slice(0, 3).map((a: any) => a.center))
        
        const basis = await plugin.build().to(structure).apply(StaticBasisAndOrbitals, {
          basis: basisData,
          orbitals: orbitalsData,
          order: 'cca-reverse' // Use same order as example
        }).commit()
        
        basisRef.current = basis
        
        // Initialize with HOMO orbital
        setState(prev => ({
          ...prev,
          selectedMO: homoIndex,
          homoIndex: homoIndex,
          totalMOs: orbitalsData.length,
          loading: false
        }))

        setMolstarPlugin(plugin)
        
        setState(prev => ({
          ...prev,
          homoIndex,
          totalMOs: orbitalsData.length,
          selectedMO: homoIndex, // Default to HOMO
          loading: false
        }))

        console.log('[SUCCESS] Molstar viewer initialized with alpha-orbitals')
      } catch (error) {
        console.error('[ERROR] Failed to initialize viewer:', error)
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize viewer'
        }))
      }
    }

    initializeViewer()

    return () => {
      if (molstarPlugin) {
        molstarPlugin.dispose()
      }
    }
  }, [jobId])

  // Visualize selected MO
  useEffect(() => {
    if (!molstarPlugin || !basisRef.current || state.selectedMO === null) return

    const visualizeMO = async () => {
      const selectedMOIndex = state.selectedMO
      if (selectedMOIndex === null) return
      
      console.log(`[STYLE] Visualizing MO ${selectedMOIndex}...`)
      
      try {
        const { CreateOrbitalVolume, CreateOrbitalRepresentation3D } = 
          await import('molstar/lib/extensions/alpha-orbitals/transforms')
        const { ColorNames } = await import('molstar/lib/mol-util/color/names')

        // Clear previous orbital representations
        if (selectorsRef.current) {
          await molstarPlugin.build().delete(selectorsRef.current.volume).commit()
          selectorsRef.current = null
        }

        // Create new orbital volume and representations
        const update = molstarPlugin.build()
        const volume = update
          .to(basisRef.current)
          .apply(CreateOrbitalVolume, { index: selectedMOIndex })

        const volumeParams = {
          alpha: 0.85,
          relativeIsovalue: state.orbitalIsovalue,
          pickable: false,
          xrayShaded: true,
          tryUseGpu: true
        }

        const positive = volume.apply(CreateOrbitalRepresentation3D, {
          ...volumeParams,
          kind: 'positive',
          color: ColorNames.blue
        }).selector

        const negative = volume.apply(CreateOrbitalRepresentation3D, {
          ...volumeParams,
          kind: 'negative',
          color: ColorNames.red
        }).selector

        await update.commit()

        selectorsRef.current = {
          volume: volume.selector,
          positive,
          negative
        }

        console.log('[SUCCESS] Orbital visualization complete')
        
      } catch (error) {
        console.error('[ERROR] Failed to visualize orbital:', error)
        setState(prev => ({
          ...prev,
          error: `Failed to render orbital: ${error instanceof Error ? error.message : 'Unknown error'}`
        }))
      }
    }

    visualizeMO()
  }, [molstarPlugin, state.selectedMO, state.orbitalIsovalue])

  const changeMO = (delta: number) => {
    setState(prev => {
      const newMO = (prev.selectedMO ?? prev.homoIndex) + delta
      if (newMO < 0 || newMO >= prev.totalMOs) return prev
      return { ...prev, selectedMO: newMO }
    })
  }

  const updateIsovalue = (value: number) => {
    setState(prev => ({ ...prev, orbitalIsovalue: value }))
  }

  const getMOLabel = (index: number, homoIndex: number): string => {
    if (index === homoIndex) return 'HOMO'
    if (index === homoIndex + 1) return 'LUMO'
    if (index === homoIndex - 1) return 'HOMO-1'
    if (index === homoIndex + 2) return 'LUMO+1'
    if (index < homoIndex) return `HOMO-${homoIndex - index}`
    return `LUMO+${index - homoIndex - 1}`
  }

  if (!jobId) {
    return (
      <div className={`flex items-center justify-center h-96 bg-gray-900 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2" />
          <p>No job selected</p>
        </div>
      </div>
    )
  }

  const isOccupied = state.selectedMO !== null && state.selectedMO <= state.homoIndex

  return (
    <div className={`flex flex-col bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      {/* Controls */}
      <div className="p-4 bg-gray-750 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-3">Molecular Orbitals</h3>
        
        {state.loading && (
          <div className="flex items-center gap-2 text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading MO data...</span>
          </div>
        )}

        {state.error && (
          <div className="text-red-400 text-sm mb-3">
            <Info className="w-4 h-4 inline mr-1" />
            {state.error}
          </div>
        )}

        {state.selectedMO !== null && !state.loading && (
          <div className="space-y-3">
            {/* MO Selector */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => changeMO(-1)}
                disabled={state.selectedMO === 0}
                className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              
              <div className="flex-1 text-center">
                <div className="text-white font-semibold">
                  {getMOLabel(state.selectedMO, state.homoIndex)}
                </div>
                <div className="text-xs text-gray-400">
                  MO {state.selectedMO} / {state.totalMOs - 1}
                </div>
                <div className={`text-xs ${isOccupied ? 'text-green-400' : 'text-blue-400'}`}>
                  {isOccupied ? 'Occupied' : 'Virtual'}
                </div>
              </div>
              
              <button
                onClick={() => changeMO(1)}
                disabled={state.selectedMO === state.totalMOs - 1}
                className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Navigation */}
            <div className="flex gap-2">
              <button
                onClick={() => setState(prev => ({ ...prev, selectedMO: prev.homoIndex - 1 }))}
                disabled={state.homoIndex < 1}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                HOMO-1
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, selectedMO: prev.homoIndex }))}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
              >
                HOMO
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, selectedMO: prev.homoIndex + 1 }))}
                disabled={state.homoIndex >= state.totalMOs - 1}
                className="flex-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                LUMO
              </button>
              <button
                onClick={() => setState(prev => ({ ...prev, selectedMO: prev.homoIndex + 2 }))}
                disabled={state.homoIndex >= state.totalMOs - 2}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                LUMO+1
              </button>
            </div>

            {/* Isovalue Control */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Isovalue: {state.orbitalIsovalue.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={state.orbitalIsovalue}
                onChange={(e) => updateIsovalue(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.5</span>
                <span>3.0</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3D Viewer */}
      <div className="relative flex-1">
        <div 
          ref={viewerRef} 
          className="w-full h-full bg-black"
          style={{ minHeight: '400px' }}
        />
        
        {state.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
            <div className="text-center text-red-400">
              <Info className="w-8 h-8 mx-auto mb-2" />
              <p>{state.error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="p-3 bg-gray-750 border-t border-gray-700">
        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-blue-400">Blue:</strong> Positive orbital lobe (phase +)</p>
          <p><strong className="text-red-400">Red:</strong> Negative orbital lobe (phase −)</p>
          <p><strong>HOMO:</strong> Highest Occupied Molecular Orbital (electron donor)</p>
          <p><strong>LUMO:</strong> Lowest Unoccupied Molecular Orbital (electron acceptor)</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Convert ORCA JSON format to Molstar alpha-orbitals format
 * @param moData - ORCA molecular orbital data
 * @param structureCoords - Optional: parsed structure coordinates from Mol* to ensure alignment
 */
function convertOrcaToMolstarFormat(moData: any, structureCoords?: number[][]): {
  basisData: any
  orbitalsData: any[]
  homoIndex: number
} {
  const coords = moData.geometry.Coordinates.Cartesians
  const isBohr = moData.geometry.Coordinates.Units === 'a.u.'
  const conversionFactor = isBohr ? 0.529177 : 1.0
  
  console.log('[PROCESS] Converting ORCA data to Molstar format...')
  console.log('Coordinates:', coords)
  console.log('Units:', moData.geometry.Coordinates.Units, 'Conversion factor:', conversionFactor)
  console.log('Using structure coordinates for alignment:', structureCoords ? 'Yes' : 'No')
  
  // Convert basis functions to Molstar format
  const atoms = moData.atoms.map((atom: any, atomIndex: number) => {
    // Use parsed structure coordinates if available, otherwise use original coordinates
    let x: number, y: number, z: number
    if (structureCoords && structureCoords[atomIndex]) {
      // Use coordinates from parsed structure to ensure perfect alignment
      [x, y, z] = structureCoords[atomIndex]
      if (atomIndex < 3) {
        console.log(`Atom ${atomIndex}: Using parsed coords [${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}]`)
      }
    } else {
      // Fallback to original coordinates with unit conversion
      const [, origX, origY, origZ] = coords[atomIndex]
      x = origX * conversionFactor
      y = origY * conversionFactor
      z = origZ * conversionFactor
    }
    
    const shells = atom.Basis.map((basis: any) => {
      // Map shell type to angular momentum for Molstar
      // Molstar expects angular momentum as array of integers
      let angularMomentum: number[]
      const shellType = basis.Shell.toLowerCase()
      
      switch (shellType) {
        case 's':
          angularMomentum = [0] // s orbital
          break
        case 'p':
          angularMomentum = [1] // p orbitals
          break
        case 'd':
          angularMomentum = [2] // d orbitals
          break
        case 'f':
          angularMomentum = [3] // f orbitals
          break
        default:
          console.warn(`Unknown shell type: ${shellType}, defaulting to s`)
          angularMomentum = [0]
      }
      
      // Normalize coefficients to ensure proper basis function scaling
      const normalizedCoefficients = basis.Coefficients.map((coeff: number) => 
        Math.abs(coeff) < 1e-10 ? 0 : coeff
      )
      
      return {
        angularMomentum: angularMomentum,
        exponents: basis.Exponents,
        coefficients: [normalizedCoefficients] // Molstar expects array of coefficient arrays
      }
    })
    
    return {
      center: [x, y, z], // Already in correct units (Angstroms) from structure or conversion
      shells: shells
    }
  })

  // Calculate total number of basis functions for validation
  // ORCA typically uses spherical harmonics for d and f functions
  let totalBasisFunctions = 0
  atoms.forEach((atom: any) => {
    atom.shells.forEach((shell: any) => {
      const l = shell.angularMomentum[0]
      // ORCA basis functions: s=1, p=3, d=5 (spherical), f=7 (spherical)
      // Use spherical harmonics count which matches ORCA's default
      const numFunctions = l === 0 ? 1 : (l === 1 ? 3 : (l === 2 ? 5 : (l === 3 ? 7 : 2*l + 1)))
      totalBasisFunctions += numFunctions
    })
  })

  // Convert MO coefficients to Molstar format
  const mos = moData.molecular_orbitals.MOs || []
  const orbitalsData = mos.map((mo: any, idx: number) => {
    const coefficients = mo.MOCoefficients
    
    // Validate coefficient count matches basis functions
    if (coefficients.length !== totalBasisFunctions) {
      console.warn(`MO ${idx}: coefficient count (${coefficients.length}) doesn't match basis functions (${totalBasisFunctions})`)
      // If mismatch, pad with zeros or truncate as needed
      const adjustedCoeffs = new Array(totalBasisFunctions).fill(0)
      const copyLength = Math.min(coefficients.length, totalBasisFunctions)
      for (let i = 0; i < copyLength; i++) {
        adjustedCoeffs[i] = coefficients[i]
      }
      console.warn(`Adjusted MO ${idx} coefficients from ${coefficients.length} to ${totalBasisFunctions}`)
      
      return {
        energy: mo.OrbitalEnergy,
        occupancy: mo.Occupancy || 0,
        alpha: adjustedCoeffs
      }
    }
    
    // Normalize coefficients to prevent visualization artifacts
    const normalizedCoeffs = coefficients.map((coeff: number) => {
      if (Math.abs(coeff) < 1e-12) return 0 // Remove numerical noise
      return coeff
    })
    
    return {
      energy: mo.OrbitalEnergy,
      occupancy: mo.Occupancy || 0, // Add occupancy if available
      alpha: normalizedCoeffs // Molstar expects 'alpha' field for coefficients
    }
  })

  // Determine HOMO index from occupancy or electron count
  let homoIndex = -1
  if (mos.length > 0 && mos[0].Occupancy !== undefined) {
    // Find last occupied orbital
    for (let i = mos.length - 1; i >= 0; i--) {
      if (mos[i].Occupancy > 0) {
        homoIndex = i
        break
      }
    }
  } else {
    // Fallback: use electron count
    const nElectrons = moData.n_electrons || 0
    homoIndex = nElectrons > 0 ? Math.floor(nElectrons / 2) - 1 : Math.floor(mos.length / 2) - 1
  }

  console.log('[SUCCESS] Conversion complete:')
  console.log('  - Atoms:', atoms.length)
  console.log('  - Total basis functions:', totalBasisFunctions)
  console.log('  - Orbitals:', orbitalsData.length)
  console.log('  - HOMO index:', homoIndex)
  console.log('  - First orbital coefficients length:', orbitalsData[0]?.alpha?.length)

  return {
    basisData: { atoms },
    orbitalsData,
    homoIndex
  }
}
