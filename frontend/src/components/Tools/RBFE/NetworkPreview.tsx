'use client'

import { useMemo } from 'react'
import type { MappingPairResult, NetworkTopology } from '@/types/rbfe-types'

interface NetworkPreviewProps {
  pairs: MappingPairResult[]
  topology: NetworkTopology
  centralLigand: string | null
  ligandNames: string[]
}

interface NetworkEdge extends MappingPairResult {}

interface StructuralEdge {
  ligand_a: string
  ligand_b: string
}

// ─── Structural (unscored) network computation ────────────────────────────────

function computeStructuralNetwork(
  ligandNames: string[],
  topology: NetworkTopology,
  centralLigand: string | null,
): StructuralEdge[] {
  const n = ligandNames.length
  if (n < 2) return []

  if (topology === 'maximal') {
    const edges: StructuralEdge[] = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        edges.push({ ligand_a: ligandNames[i], ligand_b: ligandNames[j] })
      }
    }
    return edges
  }

  if (topology === 'radial') {
    const center = centralLigand || ligandNames[0]
    return ligandNames
      .filter((name) => name !== center)
      .map((name) => ({ ligand_a: center, ligand_b: name }))
  }

  // MST: sequential chain (indicative only — no scores to guide selection)
  return ligandNames.slice(0, -1).map((name, i) => ({
    ligand_a: name,
    ligand_b: ligandNames[i + 1],
  }))
}

// ─── Frontend network computation ────────────────────────────────────────────

function kruskalMST(pairs: MappingPairResult[]): NetworkEdge[] {
  const sorted = [...pairs].sort((a, b) => b.score - a.score) // best edges first

  const parent: Record<string, string> = {}
  const find = (x: string): string =>
    parent[x] === x ? x : (parent[x] = find(parent[x]))
  const union = (x: string, y: string) => {
    parent[find(x)] = find(y)
  }

  new Set(pairs.flatMap((p) => [p.ligand_a, p.ligand_b])).forEach((n) => {
    parent[n] = n
  })

  const mst: NetworkEdge[] = []
  for (const p of sorted) {
    if (find(p.ligand_a) !== find(p.ligand_b)) {
      union(p.ligand_a, p.ligand_b)
      mst.push(p)
    }
  }
  return mst
}

function computeNetwork(
  pairs: MappingPairResult[],
  topology: NetworkTopology,
  centralLigand: string | null,
): NetworkEdge[] {
  if (topology === 'maximal') return pairs

  if (topology === 'radial') {
    const center =
      centralLigand ||
      (pairs.length > 0 ? pairs[0].ligand_a : null)
    if (!center) return pairs
    return pairs.filter(
      (p) => p.ligand_a === center || p.ligand_b === center,
    )
  }

  // Default: MST
  return kruskalMST(pairs)
}

// ─── SVG network graph ────────────────────────────────────────────────────────

const WIDTH = 320
const HEIGHT = 220
const NODE_R = 18
const FONT_SIZE = 10

function edgeColor(score: number): string {
  if (score >= 0.7) return '#4ade80'  // green-400
  if (score >= 0.5) return '#60a5fa'  // blue-400
  if (score >= 0.3) return '#facc15'  // yellow-400
  return '#f87171'                     // red-400
}

function circularLayout(names: string[]): Record<string, { x: number; y: number }> {
  const cx = WIDTH / 2
  const cy = HEIGHT / 2
  const r = Math.min(cx, cy) - NODE_R - 8
  const positions: Record<string, { x: number; y: number }> = {}
  names.forEach((name, i) => {
    const angle = (2 * Math.PI * i) / names.length - Math.PI / 2
    positions[name] = {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    }
  })
  return positions
}

function truncate(s: string, max = 8): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function NetworkGraphSVG({
  edges,
  nodes,
  unscored = false,
}: {
  edges: NetworkEdge[] | StructuralEdge[]
  nodes: string[]
  unscored?: boolean
}) {
  const positions = circularLayout(nodes)

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-xs mx-auto"
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const a = positions[edge.ligand_a]
        const b = positions[edge.ligand_b]
        if (!a || !b) return null
        const scored = !unscored && 'score' in edge
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={scored ? edgeColor((edge as NetworkEdge).score) : '#6b7280'}
              strokeWidth={2}
              strokeOpacity={0.7}
              strokeDasharray={unscored ? '5 4' : undefined}
            />
            {scored && (
              <text
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 4}
                textAnchor="middle"
                fontSize={8}
                fill="#9ca3af"
              >
                {(edge as NetworkEdge).score.toFixed(2)}
              </text>
            )}
          </g>
        )
      })}

      {/* Nodes */}
      {nodes.map((name) => {
        const pos = positions[name]
        if (!pos) return null
        return (
          <g key={name}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={NODE_R}
              fill="#1e3a5f"
              stroke="#60a5fa"
              strokeWidth={1.5}
            />
            <text
              x={pos.x}
              y={pos.y + FONT_SIZE / 3}
              textAnchor="middle"
              fontSize={FONT_SIZE}
              fill="#e2e8f0"
              fontWeight="500"
            >
              {truncate(name)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Quality pill ─────────────────────────────────────────────────────────────

function QualityPill({ score }: { score: number }) {
  if (score >= 0.7) return <span className="text-xs text-green-400">Excellent</span>
  if (score >= 0.5) return <span className="text-xs text-blue-400">Good</span>
  if (score >= 0.3) return <span className="text-xs text-yellow-400">Moderate</span>
  return <span className="text-xs text-red-400">Poor</span>
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NetworkPreview({
  pairs,
  topology,
  centralLigand,
  ligandNames,
}: NetworkPreviewProps) {
  const isUnscored = pairs.length === 0

  const scoredEdges = useMemo(
    () => computeNetwork(pairs, topology, centralLigand),
    [pairs, topology, centralLigand],
  )

  const structuralEdges = useMemo(
    () => computeStructuralNetwork(ligandNames, topology, centralLigand),
    [ligandNames, topology, centralLigand],
  )

  const edges: NetworkEdge[] | StructuralEdge[] = isUnscored ? structuralEdges : scoredEdges

  const allNodes = useMemo(() => {
    if (ligandNames.length > 0) return ligandNames
    const fromEdges = new Set(scoredEdges.flatMap((e) => [e.ligand_a, e.ligand_b]))
    return [...fromEdges]
  }, [scoredEdges, ligandNames])

  if (allNodes.length === 0) {
    return (
      <div className="rounded border border-gray-700 bg-gray-900/40 p-4 text-sm text-gray-400 text-center">
        No ligands to display.
      </div>
    )
  }

  const topologyLabel =
    topology === 'maximal'
      ? 'Maximal'
      : topology === 'radial'
      ? 'Radial'
      : 'MST'

  return (
    <div className="space-y-3">
      {/* Unscored banner */}
      {isUnscored && (
        <div className="rounded border border-gray-600 bg-gray-800/60 px-3 py-2 text-xs text-gray-400">
          Topology preview — run <strong className="text-gray-300">Preview Atom Mappings</strong> in step 2 to score and optimize edge selection.
          {topology === 'mst' && (
            <span className="ml-1">(MST shown as sequential chain; scored MST may differ.)</span>
          )}
        </div>
      )}

      {/* Graph */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
        <NetworkGraphSVG edges={edges} nodes={allNodes} unscored={isUnscored} />
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>
          <span className="text-white font-medium">{topologyLabel}</span> topology
        </span>
        <span>·</span>
        <span>
          <span className="text-white font-medium">{edges.length}</span> edge{edges.length !== 1 ? 's' : ''}
        </span>
        {!isUnscored && scoredEdges.length > 0 && (
          <>
            <span>·</span>
            <span>
              Avg score{' '}
              <span className="text-white font-medium">
                {(scoredEdges.reduce((s, e) => s + e.score, 0) / scoredEdges.length).toFixed(2)}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Edge quality table (scored only) */}
      {!isUnscored && scoredEdges.length > 0 && (
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="py-1 pr-3 font-normal">Ligand A</th>
              <th className="py-1 pr-3 font-normal">Ligand B</th>
              <th className="py-1 pr-3 font-normal text-right">Score</th>
              <th className="py-1 font-normal text-right">Quality</th>
            </tr>
          </thead>
          <tbody>
            {scoredEdges.map((edge, i) => (
              <tr key={i} className="border-b border-gray-800 text-gray-300">
                <td className="py-1 pr-3">{edge.ligand_a}</td>
                <td className="py-1 pr-3">{edge.ligand_b}</td>
                <td className="py-1 pr-3 text-right font-mono">
                  {edge.score.toFixed(3)}
                </td>
                <td className="py-1 text-right">
                  <QualityPill score={edge.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
