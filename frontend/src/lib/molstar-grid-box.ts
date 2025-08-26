/**
 * Grid Box Visualization Helper for Molstar
 * Renders a 3D wireframe box to visualize the docking grid
 */

import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context'
import { PluginCommands } from 'molstar/lib/mol-plugin/commands'
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra'
import { Color } from 'molstar/lib/mol-util/color'
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms'
import { createPrimitive } from 'molstar/lib/mol-geo/primitive/primitive'
import { Primitive } from 'molstar/lib/mol-geo/primitive/primitive'

export interface GridBoxParams {
  center_x: number
  center_y: number
  center_z: number
  size_x: number
  size_y: number
  size_z: number
}

const GRID_BOX_TAG = 'grid-box-marker'

/**
 * Show grid box in the viewer as a 3D wireframe cube
 */
export async function showGridBox(plugin: PluginUIContext, gridBox: GridBoxParams) {
  const { center_x, center_y, center_z, size_x, size_y, size_z } = gridBox
  
  console.log('[TARGET] Showing Grid Box:', {
    center: [center_x, center_y, center_z],
    size: [size_x, size_y, size_z]
  })

  try {
    // Remove any existing grid box first
    await removeGridBox(plugin)
    
    // Create the 3D wireframe box
    await create3DWireframeBox(plugin, gridBox)
    
    // Don't zoom the camera - keep the whole protein in view
    console.log('SUCCESS: Grid box 3D visualization active')
  } catch (error) {
    console.error('Failed to show grid box:', error)
  }
}

/**
 * Remove grid box from the viewer
 */
export async function removeGridBox(plugin: PluginUIContext) {
  console.log('👁️ Hiding Grid Box')
  
  try {
    // Find and remove the grid box structure
    const state = plugin.state.data
    const refs = state.selectQ(q => q.root.subtree().filter(c => 
      c.obj?.label === 'Docking Grid Box'
    ))
    
    if (refs.length > 0) {
      const update = plugin.build()
      refs.forEach(ref => update.delete(ref))
      await update.commit()
    }
    
    console.log('SUCCESS: Grid box visualization removed')
  } catch (error) {
    console.error('Failed to remove grid box:', error)
  }
}

/**
 * Toggle grid box visibility
 */
export async function toggleGridBox(plugin: PluginUIContext, gridBox: GridBoxParams | null, show: boolean) {
  if (show && gridBox) {
    await showGridBox(plugin, gridBox)
  } else {
    await removeGridBox(plugin)
  }
}

/**
 * Create a 3D wireframe box in the viewer
 */
async function create3DWireframeBox(plugin: PluginUIContext, gridBox: GridBoxParams) {
  console.log('🔨 Starting grid box wireframe creation...')
  
  // Create a complete PDB structure with all edges as a single entity
  const pdbData = createBoxPDBStructure(gridBox)
  
  try {
    console.log('[PACKAGE] Loading PDB data...')
    const data = await plugin.builders.data.rawData({ 
      data: pdbData, 
      label: 'Docking Grid Box' 
    })
    console.log('SUCCESS: Data loaded:', data)
    
    console.log('[PROCESS] Parsing trajectory...')
    const trajectory = await plugin.builders.structure.parseTrajectory(data, 'pdb')
    console.log('SUCCESS: Trajectory parsed:', trajectory)
    
    console.log('🏗️ Creating model...')
    const model = await plugin.builders.structure.createModel(trajectory)
    console.log('SUCCESS: Model created:', model)
    
    console.log('🧬 Creating structure...')
    const structure = await plugin.builders.structure.createStructure(model)
    console.log('SUCCESS: Structure created:', structure)
    
    // Add ball-and-stick representation to show the wireframe
    console.log('[STYLE] Adding representation...')
    const representation = await plugin.builders.structure.representation.addRepresentation(structure, {
      type: 'ball-and-stick',
      typeParams: { 
        sizeFactor: 0.3, // Thin lines
        sizeAspectRatio: 0.5 
      },
      color: 'uniform',
      colorParams: { value: Color.fromRgb(0, 200, 255) }, // Cyan color
    })
    console.log('SUCCESS: Representation added:', representation)
    
    console.log('🎉 Grid box wireframe created successfully!')
  } catch (error) {
    console.error('ERROR: Failed to create grid box wireframe:')
    console.error('Error details:', error)
    console.error('Stack trace:', (error as Error).stack)
    throw error
  }
}

/**
 * Create a complete PDB structure representing the grid box
 * Returns a PDB format string with all 8 corners and 12 edges
 */
function createBoxPDBStructure(gridBox: GridBoxParams): string {
  const { center_x, center_y, center_z, size_x, size_y, size_z } = gridBox
  
  console.log('Creating grid box PDB structure:', { center_x, center_y, center_z, size_x, size_y, size_z })
  
  // Calculate the 8 corners
  const halfX = size_x / 2
  const halfY = size_y / 2
  const halfZ = size_z / 2
  
  const corners = [
    [center_x - halfX, center_y - halfY, center_z - halfZ], // 1
    [center_x + halfX, center_y - halfY, center_z - halfZ], // 2
    [center_x + halfX, center_y + halfY, center_z - halfZ], // 3
    [center_x - halfX, center_y + halfY, center_z - halfZ], // 4
    [center_x - halfX, center_y - halfY, center_z + halfZ], // 5
    [center_x + halfX, center_y - halfY, center_z + halfZ], // 6
    [center_x + halfX, center_y + halfY, center_z + halfZ], // 7
    [center_x - halfX, center_y + halfY, center_z + halfZ], // 8
  ]
  
  // Define all 12 edges (connections between corners)
  // Each edge needs to be defined in both directions for proper connectivity
  const edges = [
    // Front face (4 edges)
    [1, 2], [2, 3], [3, 4], [4, 1],
    // Back face (4 edges)  
    [5, 6], [6, 7], [7, 8], [8, 5],
    // Connecting edges (4 edges)
    [1, 5], [2, 6], [3, 7], [4, 8],
  ]
  
  // Build PDB format string with proper spacing
  const lines: string[] = []
  
  // Add HETATM records for each corner
  corners.forEach(([x, y, z], idx) => {
    const atomNum = idx + 1
    const atomName = 'CA'
    const resName = 'BOX'
    const chainId = 'A'
    const resSeq = 1
    
    // Format coordinates with proper spacing (8.3 format)
    const xStr = x.toFixed(3).padStart(8)
    const yStr = y.toFixed(3).padStart(8)
    const zStr = z.toFixed(3).padStart(8)
    
    const line = `HETATM${atomNum.toString().padStart(5)} ${atomName.padEnd(4)}${resName} ${chainId}${resSeq.toString().padStart(4)}    ${xStr}${yStr}${zStr}  1.00  0.00           C`
    lines.push(line)
  })
  
  // Add CONECT records for each edge (bidirectional for proper rendering)
  edges.forEach(([start, end]) => {
    // Add connection in both directions to ensure all edges render
    lines.push(`CONECT${start.toString().padStart(5)}${end.toString().padStart(5)}`)
    lines.push(`CONECT${end.toString().padStart(5)}${start.toString().padStart(5)}`)
  })
  
  lines.push('END')
  
  const pdb = lines.join('\n') + '\n'
  console.log('Generated PDB structure:', pdb)
  
  return pdb
}
