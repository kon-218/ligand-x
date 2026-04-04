/**
 * RBFE Network Graph Export Utilities
 * Handles conversion of network graphs to images and SVG exports
 */

import type { RBFENetworkData, RBFEDdGValue, LigandSelection } from '@/types/rbfe-types'
import { computeNetworkGraphLayout } from '@/lib/rbfe-network-layout'

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

function escapeSvgText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Short, distinctive label for a network node id (file / pose path).
 * Prefer OpenFE-style rbfe_pose_* tail so similar complexes do not all show the same PDB code (e.g. BNZ).
 */
export function formatNodeLabelForGraph(node: string, maxLen = 16): string {
  if (!node) return 'Unknown'
  const pose = /\brbfe_pose_([a-zA-Z0-9-]+)\b/i.exec(node)
  if (pose) {
    const tail = pose[1]
    return tail.length <= maxLen ? tail : `${tail.slice(0, maxLen - 1)}…`
  }
  const parts = node.split('_').filter(Boolean)
  if (parts.length >= 2) {
    const tail = parts.slice(-2).join('_')
    if (tail.length <= maxLen) return tail
    return `${tail.slice(0, maxLen - 1)}…`
  }
  return node.length <= maxLen ? node : `${node.slice(0, maxLen - 1)}…`
}

function getLigandColor(node: string): string {
  let h = 0
  for (let i = 0; i < node.length; i++) h = (h * 31 + node.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue}, 52%, 86%)`
}

/**
 * Generate 2D ligand image from SMILES via backend RDKit endpoint.
 * Returns a data URL so raster images work when the SVG is opened as <img src="blob:..."> (nested blob: URLs do not).
 */
export async function generateLigandImageFromSmiles(smiles: string | null): Promise<string | null> {
  if (!smiles) return null
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const res = await fetch(`${baseUrl}/api/rbfe/ligand-image?smiles=${encodeURIComponent(smiles)}`)
    if (!res.ok) return null
    const blob = await res.blob()
    return await blobToDataUrl(blob)
  } catch {
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
  availableLigands: LigandSelection[],
  jobLigandSmiles?: Record<string, string>
): Promise<string> {
  const nodeRadius = 45
  const imageSize = 70
  const width = 1000
  const height = 720

  const layout = computeNetworkGraphLayout(network, width, height, nodeRadius)

  const nodePositionsPromises = layout.map(async (bp) => {
    const smiles =
      getLigandSmiles(bp.node, availableLigands) ??
      jobLigandSmiles?.[bp.node] ??
      null
    const imageDataUrl = await generateLigandImageFromSmiles(smiles)

    return {
      node: bp.node,
      x: bp.x,
      y: bp.y,
      imageUrl: imageDataUrl,
      index: bp.index,
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

    // Start from edge of source, end at edge of target
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const gap = nodeRadius + 18
    const startX = from.x + dx * (gap / distance)
    const startY = from.y + dy * (gap / distance)
    const endX = from.x + dx * ((distance - gap) / distance)
    const endY = from.y + dy * ((distance - gap) / distance)

    // DDG label at center between nodes, offset perpendicular
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2
    const labelX = midX + Math.cos(perpAngle) * 16
    const labelY = midY + Math.sin(perpAngle) * 16

    return `
      <g>
        <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${edgeColor}" stroke-width="2.5" opacity="0.9" marker-end="url(#${markerId})" />
        ${ddg ? `
          <circle cx="${labelX}" cy="${labelY}" r="13" fill="white" stroke="${edgeColor}" stroke-width="1.5" opacity="0.95" />
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
    const displayName = escapeSvgText(formatNodeLabelForGraph(pos.node))
    const estWidth = Math.max(displayName.length * 7 + 8, 30)
    // Place label below if node in upper half, above if in lower half
    const labelBelow = pos.y <= height / 2
    const labelY = labelBelow ? pos.y + nodeRadius + 4 : pos.y - nodeRadius - 4
    const labelBaseline = labelBelow ? 'hanging' : 'auto'
    const labelBgY = labelBelow ? pos.y + nodeRadius + 3 : pos.y - nodeRadius - 18
    return `
      <g filter="url(#node-shadow)">
        ${hasImage ? `
          <image href="${pos.imageUrl}" x="${pos.x - imageSize / 2}" y="${pos.y - imageSize / 2}" width="${imageSize}" height="${imageSize}" clip-path="url(#clip-${pos.index})" />
        ` : `
          <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius - 5}" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5" />
        `}
        <rect x="${pos.x - estWidth / 2}" y="${labelBgY}" width="${estWidth}" height="16" fill="white" fill-opacity="0.9" rx="3"/>
        <text x="${pos.x}" y="${labelY}" text-anchor="middle" dominant-baseline="${labelBaseline}" font-size="11" fill="#111827" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
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
  const width = 1000
  const height = 720

  const layout = computeNetworkGraphLayout(network, width, height, nodeRadius)
  const nodePositions = layout.map((bp) => {
    const smiles = getLigandSmiles(bp.node, availableLigands)
    const imageUrl = getLigandImageUrl(smiles)
    return {
      node: bp.node,
      x: bp.x,
      y: bp.y,
      imageUrl,
      index: bp.index,
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

    // Start from edge of source, end at edge of target
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const gap = nodeRadius + 18
    const startX = from.x + dx * (gap / distance)
    const startY = from.y + dy * (gap / distance)
    const endX = from.x + dx * ((distance - gap) / distance)
    const endY = from.y + dy * ((distance - gap) / distance)

    // DDG label at center between nodes, offset perpendicular
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2
    const labelX = midX + Math.cos(perpAngle) * 16
    const labelY = midY + Math.sin(perpAngle) * 16

    return `
      <g>
        <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${edgeColor}" stroke-width="2.5" opacity="0.9" marker-end="url(#${markerId})" />
        ${ddg ? `
          <circle cx="${labelX}" cy="${labelY}" r="13" fill="white" stroke="${edgeColor}" stroke-width="1.5" opacity="0.95" />
          <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${edgeColor}" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
            ${ddg.ddg_kcal_mol.toFixed(1)}
          </text>
        ` : ''}
      </g>
    `
  }).join('')}

  <!-- Nodes -->
  ${nodePositions.map((pos) => {
    const displayName = escapeSvgText(formatNodeLabelForGraph(pos.node))
    const nodeColor = getLigandColor(pos.node)
    const borderColor = '#9ca3af'
    const estWidth = Math.max(displayName.length * 7 + 8, 30)
    const labelBelow = pos.y <= height / 2
    const labelY = labelBelow ? pos.y + nodeRadius + 4 : pos.y - nodeRadius - 4
    const labelBaseline = labelBelow ? 'hanging' : 'auto'
    const labelBgY = labelBelow ? pos.y + nodeRadius + 3 : pos.y - nodeRadius - 18
    return `
      <g filter="url(#node-shadow)">
        <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius - 5}" fill="${nodeColor}" stroke="${borderColor}" stroke-width="2" />
        <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#1f2937" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
          ${displayName}
        </text>
        <rect x="${pos.x - estWidth / 2}" y="${labelBgY}" width="${estWidth}" height="16" fill="white" fill-opacity="0.9" rx="3"/>
        <text x="${pos.x}" y="${labelY}" text-anchor="middle" dominant-baseline="${labelBaseline}" font-size="11" fill="#111827" font-weight="600" font-family="system-ui, -apple-system, sans-serif">
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
export async function downloadNetworkGraphSVG(
  network: RBFENetworkData,
  ddgValues: RBFEDdGValue[],
  availableLigands: LigandSelection[],
  filename: string = 'rbfe_network_graph.svg',
  jobLigandSmiles?: Record<string, string>
): Promise<void> {
  const svgString = await generateNetworkGraphSVGWithImages(network, ddgValues, availableLigands, jobLigandSmiles)
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
