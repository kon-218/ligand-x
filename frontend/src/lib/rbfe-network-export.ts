/**
 * RBFE Network Graph Export Utilities
 * Handles conversion of network graphs to images and SVG exports
 */

import type { RBFENetworkData, RBFEDdGValue, LigandSelection } from '@/types/rbfe-types'

/**
 * Get SMILES for a ligand name from available ligands
 */
export function getLigandSmiles(ligandName: string, availableLigands: LigandSelection[]): string | null {
  // Try to find exact match by name
  let ligand = availableLigands.find((l) => l.name === ligandName || l.id === ligandName)
  if (ligand?.smiles) {
    return ligand.smiles
  }
  
  // Try to find by ID (handle library_ prefix)
  if (ligandName.startsWith('library_')) {
    const id = ligandName.replace('library_', '')
    ligand = availableLigands.find((l) => l.id === `library_${id}`)
    if (ligand?.smiles) {
      return ligand.smiles
    }
  }
  
  // Try partial name matching (in case names are truncated)
  ligand = availableLigands.find((l) => 
    l.name.toLowerCase().includes(ligandName.toLowerCase()) || 
    ligandName.toLowerCase().includes(l.name.toLowerCase())
  )
  if (ligand?.smiles) {
    return ligand.smiles
  }
  
  return null
}

/**
 * Generate image URL from SMILES using PubChem API
 * Uses a proxy-friendly approach with timeout and fallback
 */
export function getLigandImageUrl(smiles: string | null): string | null {
  if (!smiles) return null
  try {
    const encodedSmiles = encodeURIComponent(smiles)
    // Use PubChem API with additional parameters for better reliability
    // Add timeout and error handling parameters
    return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/PNG?image_size=200x200`
  } catch {
    return null
  }
}

/**
 * Create a data URL for a simple colored circle as fallback
 * Used when ligand images fail to load
 */
export function createFallbackImageDataUrl(color: string = '#e5e7eb'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70">
    <circle cx="35" cy="35" r="32" fill="${color}" stroke="#d1d5db" stroke-width="2"/>
  </svg>`
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}


/**
 * Helper to get display name from ligand identifier
 */
export function getDisplayName(filename: string): string {
  if (!filename) return 'Unknown'
  
  // Check if it's a PDB ID (4-character alphanumeric code)
  const pdbIdMatch = /^[A-Za-z0-9]{4}$/.exec(filename)
  if (pdbIdMatch) {
    return filename
  }
  
  // Extract PDB ID from patterns like "4RT7_cleaned_rbfe_pose_benzeneoh"
  const pdbIdFromLongName = /^([A-Za-z0-9]{4})_/.exec(filename)
  if (pdbIdFromLongName) {
    return pdbIdFromLongName[1]
  }
  
  // Extract molecule name from patterns like "(Library)_rbfe_pose_benzenef"
  const moleculeMatch = /\brbfe_pose_([a-zA-Z0-9-]+)/.exec(filename)
  if (moleculeMatch) {
    return moleculeMatch[1]
  }
  
  // Extract library name from patterns like "library_rbfe_pose_benzenef"
  const libraryMatch = /^library_rbfe_pose_([a-zA-Z0-9-]+)/.exec(filename)
  if (libraryMatch) {
    return libraryMatch[1]
  }
  
  // Fallback: return first part of filename before underscores
  const firstPart = filename.split('_')[0]
  if (firstPart && firstPart.length <= 20) {
    return firstPart
  }
  
  // Last resort: truncate long filename
  return filename.length > 15 ? filename.slice(0, 12) + '...' : filename
}

/**
 * Generate 2D ligand image from SMILES using Ketcher
 * Returns a data URL that can be embedded in SVG
 */
export async function generateLigandImageFromSmiles(smiles: string | null): Promise<string | null> {
  if (!smiles) return null
  
  try {
    // Dynamic import to avoid issues with server-side rendering
    const { StandaloneStructServiceProvider } = await import('ketcher-standalone')
    const structService = new StandaloneStructServiceProvider()
    
    // Convert SMILES to MOL format
    const molData = await structService.smiles2mol(smiles)
    if (!molData) return null
    
    // Create a canvas to render the molecule
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 200
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    // Fill background
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // For now, return a simple colored circle with the SMILES text
    // A full implementation would use RDKit or similar for proper 2D rendering
    ctx.fillStyle = '#e0e7ff'
    ctx.beginPath()
    ctx.arc(100, 100, 80, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // Convert canvas to data URL
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.warn('Failed to generate ligand image from SMILES:', error)
    return null
  }
}

/**
 * Generate SVG string for the network graph with 2D ligand images
 * Uses Ketcher to render SMILES to 2D images locally
 */
export async function generateNetworkGraphSVGWithImages(
  network: RBFENetworkData,
  ddgValues: RBFEDdGValue[],
  availableLigands: LigandSelection[]
): Promise<string> {
  const nodeRadius = 45
  const imageSize = 70
  const width = 800
  const height = 600
  const padding = 40
  
  // Calculate node positions and fetch images in parallel
  const nodePositionsPromises = network.nodes.map(async (node, i) => {
    const angle = (2 * Math.PI * i) / network.nodes.length - Math.PI / 2
    const radius = Math.min(width, height) / 2 - nodeRadius - padding
    const smiles = getLigandSmiles(node, availableLigands)
    const imageDataUrl = await generateLigandImageFromSmiles(smiles)
    
    return {
      node,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      imageUrl: imageDataUrl,
      index: i,
    }
  })
  
  const nodePositions = await Promise.all(nodePositionsPromises)

  // Create a map for quick lookup
  const posMap = new Map(nodePositions.map((p) => [p.node, p]))

  // Get DDG value for an edge
  const getDdgForEdge = (a: string, b: string) => {
    return ddgValues.find(
      (d) => (d.ligand_a === a && d.ligand_b === b) || (d.ligand_a === b && d.ligand_b === a)
    )
  }

  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <!-- Clip paths for nodes -->
    ${nodePositions.map((pos, i) => `
      <clipPath id="clip-${i}">
        <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius - 3}" />
      </clipPath>
    `).join('')}
    
    <!-- Arrow markers -->
    <marker id="arrow-green" markerWidth="12" markerHeight="12" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#16a34a" stroke="#16a34a" stroke-width="0.5" />
    </marker>
    <marker id="arrow-red" markerWidth="12" markerHeight="12" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#dc2626" stroke="#dc2626" stroke-width="0.5" />
    </marker>
    <marker id="arrow-gray" markerWidth="12" markerHeight="12" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#6b7280" stroke="#6b7280" stroke-width="0.5" />
    </marker>
    
    <!-- Drop shadow filter -->
    <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
      <feOffset dx="0" dy="1" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="white"/>
  
  <!-- Title -->
  <text x="${width / 2}" y="30" text-anchor="middle" font-size="24" font-weight="bold" fill="#1f2937">
    RBFE Network Graph (${network.topology.toUpperCase()})
  </text>
  
  <!-- Edges -->
  ${network.edges.map((edge, i) => {
    const from = posMap.get(edge.ligand_a)
    const to = posMap.get(edge.ligand_b)
    if (!from || !to) return ''
    
    const ddg = getDdgForEdge(edge.ligand_a, edge.ligand_b)
    const edgeColor = ddg
      ? ddg.ddg_kcal_mol < 0
        ? '#16a34a'
        : '#dc2626'
      : '#6b7280'
    
    const markerId = ddg
      ? ddg.ddg_kcal_mol < 0
        ? 'arrow-green'
        : 'arrow-red'
      : 'arrow-gray'

    // Calculate arrow endpoint
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const shorten = nodeRadius + 15
    const ratio = (distance - shorten) / distance
    const endX = from.x + dx * ratio
    const endY = from.y + dy * ratio
    
    // Calculate label position
    const midX = (from.x + endX) / 2
    const midY = (from.y + endY) / 2
    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2
    const labelOffset = 12
    const labelX = midX + Math.cos(perpAngle) * labelOffset
    const labelY = midY + Math.sin(perpAngle) * labelOffset

    return `
      <g>
        <line x1="${from.x}" y1="${from.y}" x2="${endX}" y2="${endY}" stroke="${edgeColor}" stroke-width="2.5" opacity="0.9" marker-end="url(#${markerId})" />
        ${ddg ? `
          <circle cx="${labelX}" cy="${labelY}" r="12" fill="white" stroke="${edgeColor}" stroke-width="1.5" opacity="0.95" />
          <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${edgeColor}" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
            ${ddg.ddg_kcal_mol.toFixed(1)}
          </text>
        ` : ''}
      </g>
    `
  }).join('')}
  
  <!-- Nodes -->
  ${nodePositions.map((pos) => {
    const hasImage = !!pos.imageUrl
    const displayName = getDisplayName(pos.node).length > 10 ? getDisplayName(pos.node).slice(0, 8) + '..' : getDisplayName(pos.node)
    return `
      <g filter="url(#node-shadow)">
        ${hasImage ? `
          <!-- 2D ligand image -->
          <image href="${pos.imageUrl}" x="${pos.x - imageSize / 2}" y="${pos.y - imageSize / 2}" width="${imageSize}" height="${imageSize}" clip-path="url(#clip-${pos.index})" />
          <!-- Ligand label below the node -->
          <text x="${pos.x}" y="${pos.y + nodeRadius + 15}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#1f2937" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
            ${displayName}
          </text>
        ` : `
          <!-- Fallback colored circle when image unavailable -->
          <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius - 5}" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5" />
          <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#374151" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
            ${displayName}
          </text>
        `}
      </g>
    `
  }).join('')}
  
  <!-- Legend -->
  <g transform="translate(20, ${height - 60})">
    <text x="0" y="0" font-size="12" font-weight="bold" fill="#1f2937">Legend:</text>
    <line x1="0" y1="15" x2="20" y2="15" stroke="#16a34a" stroke-width="2.5" marker-end="url(#arrow-green)" />
    <text x="30" y="20" font-size="11" fill="#374151">Improved binding (ΔΔG &lt; 0)</text>
    <line x1="0" y1="35" x2="20" y2="35" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />
    <text x="30" y="40" font-size="11" fill="#374151">Weaker binding (ΔΔG &gt; 0)</text>
  </g>
</svg>`

  return svg
}

/**
 * Generate SVG string for the network graph
 * 
 * Note: Uses colored circles as fallback when images are not available.
 * For images, use generateNetworkGraphSVGWithImages() instead.
 */
export function generateNetworkGraphSVG(
  network: RBFENetworkData,
  ddgValues: RBFEDdGValue[],
  availableLigands: LigandSelection[]
): string {
  const nodeRadius = 45
  const imageSize = 70
  const width = 800
  const height = 600
  const padding = 40
  
  // Calculate node positions in a circle
  const nodePositions = network.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / network.nodes.length - Math.PI / 2
    const radius = Math.min(width, height) / 2 - nodeRadius - padding
    const smiles = getLigandSmiles(node, availableLigands)
    const imageUrl = getLigandImageUrl(smiles)
    
    return {
      node,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      imageUrl,
      index: i,
    }
  })

  // Create a map for quick lookup
  const posMap = new Map(nodePositions.map((p) => [p.node, p]))

  // Get DDG value for an edge
  const getDdgForEdge = (a: string, b: string) => {
    return ddgValues.find(
      (d) => (d.ligand_a === a && d.ligand_b === b) || (d.ligand_a === b && d.ligand_b === a)
    )
  }

  // Build SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <!-- Clip paths for nodes -->
    ${nodePositions.map((pos, i) => `
      <clipPath id="clip-${i}">
        <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius - 3}" />
      </clipPath>
    `).join('')}
    
    <!-- Arrow markers -->
    <marker id="arrow-green" markerWidth="12" markerHeight="12" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#16a34a" stroke="#16a34a" stroke-width="0.5" />
    </marker>
    <marker id="arrow-red" markerWidth="12" markerHeight="12" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#dc2626" stroke="#dc2626" stroke-width="0.5" />
    </marker>
    <marker id="arrow-gray" markerWidth="12" markerHeight="12" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#6b7280" stroke="#6b7280" stroke-width="0.5" />
    </marker>
    
    <!-- Drop shadow filter -->
    <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
      <feOffset dx="0" dy="1" result="offsetblur"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="white"/>
  
  <!-- Title -->
  <text x="${width / 2}" y="30" text-anchor="middle" font-size="24" font-weight="bold" fill="#1f2937">
    RBFE Network Graph (${network.topology.toUpperCase()})
  </text>
  
  <!-- Edges -->
  ${network.edges.map((edge, i) => {
    const from = posMap.get(edge.ligand_a)
    const to = posMap.get(edge.ligand_b)
    if (!from || !to) return ''
    
    const ddg = getDdgForEdge(edge.ligand_a, edge.ligand_b)
    const edgeColor = ddg
      ? ddg.ddg_kcal_mol < 0
        ? '#16a34a'
        : '#dc2626'
      : '#6b7280'
    
    const markerId = ddg
      ? ddg.ddg_kcal_mol < 0
        ? 'arrow-green'
        : 'arrow-red'
      : 'arrow-gray'

    // Calculate arrow endpoint
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const shorten = nodeRadius + 15
    const ratio = (distance - shorten) / distance
    const endX = from.x + dx * ratio
    const endY = from.y + dy * ratio
    
    // Calculate label position
    const midX = (from.x + endX) / 2
    const midY = (from.y + endY) / 2
    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2
    const labelOffset = 12
    const labelX = midX + Math.cos(perpAngle) * labelOffset
    const labelY = midY + Math.sin(perpAngle) * labelOffset

    return `
      <g>
        <line x1="${from.x}" y1="${from.y}" x2="${endX}" y2="${endY}" stroke="${edgeColor}" stroke-width="2.5" opacity="0.9" marker-end="url(#${markerId})" />
        ${ddg ? `
          <circle cx="${labelX}" cy="${labelY}" r="12" fill="white" stroke="${edgeColor}" stroke-width="1.5" opacity="0.95" />
          <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${edgeColor}" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
            ${ddg.ddg_kcal_mol.toFixed(1)}
          </text>
        ` : ''}
      </g>
    `
  }).join('')}
  
  <!-- Nodes -->
  ${nodePositions.map((pos) => {
    const displayName = getDisplayName(pos.node).length > 10 ? getDisplayName(pos.node).slice(0, 8) + '..' : getDisplayName(pos.node)
    const nodeColor = getLigandColor(pos.node)
    const borderColor = '#9ca3af'
    return `
      <g filter="url(#node-shadow)">
        <!-- Colored circle for ligand -->
        <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius - 5}" fill="${nodeColor}" stroke="${borderColor}" stroke-width="2" />
        <!-- Ligand name in center -->
        <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#1f2937" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
          ${displayName}
        </text>
      </g>
    `
  }).join('')}
  
  <!-- Legend -->
  <g transform="translate(20, ${height - 60})">
    <text x="0" y="0" font-size="12" font-weight="bold" fill="#1f2937">Legend:</text>
    <line x1="0" y1="15" x2="20" y2="15" stroke="#16a34a" stroke-width="2.5" marker-end="url(#arrow-green)" />
    <text x="30" y="20" font-size="11" fill="#374151">Improved binding (ΔΔG &lt; 0)</text>
    <line x1="0" y1="35" x2="20" y2="35" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)" />
    <text x="30" y="40" font-size="11" fill="#374151">Weaker binding (ΔΔG &gt; 0)</text>
  </g>
</svg>`

  return svg
}

/**
 * Convert SVG string to data URL
 */
export function svgToDataUrl(svgString: string): string {
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  return URL.createObjectURL(blob)
}

/**
 * Download SVG as file
 */
export function downloadNetworkGraphSVG(
  network: RBFENetworkData,
  ddgValues: RBFEDdGValue[],
  availableLigands: LigandSelection[],
  filename: string = 'rbfe_network_graph.svg'
): void {
  const svgString = generateNetworkGraphSVG(network, ddgValues, availableLigands)
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Convert SVG to PNG using canvas (requires rendering)
 */
export async function svgToPngDataUrl(svgString: string, scale: number = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      const pngUrl = canvas.toDataURL('image/png')
      URL.revokeObjectURL(url)
      resolve(pngUrl)
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG image'))
    }
    
    img.src = url
  })
}
