/**
 * Shared node positions for RBFE network SVGs (results panel, export, preview).
 * Radial topology uses a hub at center with satellites on an outer ring for clearer spacing.
 */
import type { RBFENetworkData } from '@/types/rbfe-types'

/** Room for text labels and ΔΔG badges outside node circles */
const LABEL_MARGIN = 38
const EDGE_BADGE_MARGIN = 16

function inferRadialHub(network: RBFENetworkData): string {
  const { nodes, edges, central_ligand } = network
  if (central_ligand && nodes.includes(central_ligand)) {
    return central_ligand
  }
  const deg = new Map<string, number>()
  for (const n of nodes) deg.set(n, 0)
  for (const e of edges) {
    deg.set(e.ligand_a, (deg.get(e.ligand_a) ?? 0) + 1)
    deg.set(e.ligand_b, (deg.get(e.ligand_b) ?? 0) + 1)
  }
  let best = nodes[0]
  let bestD = -1
  for (const n of nodes) {
    const d = deg.get(n) ?? 0
    if (d > bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

export interface NetworkLayoutPoint {
  node: string
  x: number
  y: number
  index: number
}

/**
 * Compute pixel positions for each node in network.nodes order (stable clipPath indices).
 */
export function computeNetworkGraphLayout(
  network: RBFENetworkData,
  width: number,
  height: number,
  nodeRadius: number,
): NetworkLayoutPoint[] {
  const { nodes, topology } = network
  const cx = width / 2
  const cy = height / 2
  const n = nodes.length

  if (n === 0) return []
  if (n === 1) {
    return [{ node: nodes[0], x: cx, y: cy, index: 0 }]
  }

  const half = Math.min(width / 2, height / 2)
  const maxRing =
    half - nodeRadius - LABEL_MARGIN - EDGE_BADGE_MARGIN

  if (topology === 'radial') {
    const hub = inferRadialHub(network)
    const satellites = nodes.filter((x) => x !== hub)
    const m = satellites.length
    const minForSpokes =
      m >= 2 ? minRingRadiusOnCircle(m, nodeRadius) : 0
    const ringRadius = Math.min(
      maxRing,
      Math.max(minForSpokes, maxRing * 0.94),
    )
    const posByNode = new Map<string, { x: number; y: number }>()
    posByNode.set(hub, { x: cx, y: cy })
    for (let k = 0; k < m; k++) {
      const angle = (2 * Math.PI * k) / m - Math.PI / 2
      const node = satellites[k]
      posByNode.set(node, {
        x: cx + ringRadius * Math.cos(angle),
        y: cy + ringRadius * Math.sin(angle),
      })
    }
    return nodes.map((node, index) => {
      const p = posByNode.get(node)!
      return { node, x: p.x, y: p.y, index }
    })
  }

  const minForRing = minRingRadiusOnCircle(n, nodeRadius)
  const ringRadius = Math.min(
    maxRing,
    Math.max(minForRing, maxRing * 0.94),
  )

  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    return {
      node,
      x: cx + ringRadius * Math.cos(angle),
      y: cy + ringRadius * Math.sin(angle),
      index: i,
    }
  })
}

/** Minimum ring radius so adjacent nodes on the circle do not overlap (node + label fudge). */
function minRingRadiusOnCircle(countOnRing: number, nodeRadius: number): number {
  if (countOnRing <= 1) return 0
  const minChord = nodeRadius * 2.45
  const angle = (2 * Math.PI) / countOnRing
  const sinHalf = Math.sin(angle / 2)
  if (sinHalf < 1e-6) return nodeRadius * 6
  return minChord / (2 * sinHalf)
}
