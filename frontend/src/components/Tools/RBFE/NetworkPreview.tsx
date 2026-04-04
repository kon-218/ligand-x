'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type {
  MappingPairResult,
  NetworkTopology,
  LigandSelection,
  RBFENetworkData,
} from '@/types/rbfe-types'
import { computeNetworkGraphLayout } from '@/lib/rbfe-network-layout'

interface NetworkPreviewProps {
  pairs: MappingPairResult[]
  topology: NetworkTopology
  centralLigand: string | null
  ligandNames: string[]
  availableLigands?: LigandSelection[]
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

const NODE_R = 32
const FONT_SIZE = 10

function edgeColor(score: number): string {
  if (score >= 0.7) return '#4ade80'  // green-400
  if (score >= 0.5) return '#60a5fa'  // blue-400
  if (score >= 0.3) return '#facc15'  // yellow-400
  return '#f87171'                     // red-400
}

function truncate(s: string, max = 14): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function NetworkGraphSVG({
  edges,
  nodes,
  topology,
  centralLigand,
  unscored = false,
  imageUrls = new Map(),
  containerWidth = 300,
}: {
  edges: NetworkEdge[] | StructuralEdge[]
  nodes: string[]
  topology: NetworkTopology
  centralLigand: string | null
  unscored?: boolean
  imageUrls?: Map<string, string>
  containerWidth?: number
}) {
  // Square canvas sized to the container so the graph always fills the available space
  const W = Math.max(containerWidth, 200)
  const H = W

  const layout = useMemo(() => {
    const nw: RBFENetworkData = {
      nodes,
      edges: edges.map((e) => ({
        ligand_a: e.ligand_a,
        ligand_b: e.ligand_b,
        score: unscored ? 0 : (e as NetworkEdge).score,
      })),
      topology,
      central_ligand: centralLigand ?? undefined,
    }
    return computeNetworkGraphLayout(nw, W, H, NODE_R)
  }, [nodes, edges, topology, centralLigand, unscored, W, H])

  const posByNode = useMemo(() => {
    const m = new Map<string, { x: number; y: number; index: number }>()
    for (const p of layout) {
      m.set(p.node, { x: p.x, y: p.y, index: p.index })
    }
    return m
  }, [layout])

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ display: 'block' }}
    >
      <defs>
        {layout.map((p) => (
          <clipPath key={p.index} id={`np-clip-${p.index}`}>
            <circle cx={p.x} cy={p.y} r={NODE_R - 2} />
          </clipPath>
        ))}
      </defs>

      {/* Edges */}
      {edges.map((edge, i) => {
        const a = posByNode.get(edge.ligand_a)
        const b = posByNode.get(edge.ligand_b)
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
      {layout.map((p) => {
        const imgUrl = imageUrls.get(p.node)
        const cx = W / 2
        const cy = H / 2
        const isHub =
          topology === 'radial' &&
          Math.abs(p.x - cx) < 0.01 &&
          Math.abs(p.y - cy) < 0.01

        const hubLabel = truncate(p.node, 18)
        const hubEstWidth = Math.max(hubLabel.length * 7 + 8, 30)
        return (
          <g key={p.node}>
            <circle
              cx={p.x}
              cy={p.y}
              r={NODE_R}
              fill={imgUrl ? 'white' : '#1e3a5f'}
              stroke="#60a5fa"
              strokeWidth={1.5}
            />
            {imgUrl ? (
              <image
                href={imgUrl}
                x={p.x - (isHub ? (NODE_R - 2) * 2 * 0.85 : (NODE_R - 2) * 2) / 2}
                y={
                  p.y -
                  (isHub ? (NODE_R - 2) * 2 * 0.85 : (NODE_R - 2) * 2) / 2 -
                  (isHub ? 6 : 0)
                }
                width={isHub ? (NODE_R - 2) * 2 * 0.85 : (NODE_R - 2) * 2}
                height={isHub ? (NODE_R - 2) * 2 * 0.85 : (NODE_R - 2) * 2}
                clipPath={`url(#np-clip-${p.index})`}
              />
            ) : (
              <text
                x={p.x}
                y={p.y + FONT_SIZE / 3}
                textAnchor="middle"
                fontSize={FONT_SIZE}
                fill="#e2e8f0"
                fontWeight="500"
              >
                {truncate(p.node)}
              </text>
            )}
            {isHub ? (
              <>
                <rect
                  x={p.x - hubEstWidth / 2}
                  y={p.y + 10}
                  width={hubEstWidth}
                  height={15}
                  fill="white"
                  fillOpacity={0.85}
                  rx={3}
                />
                <text
                  x={p.x}
                  y={p.y + 18}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={FONT_SIZE}
                  fill="#111827"
                  fontWeight="600"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  className="select-none"
                >
                  {hubLabel}
                </text>
              </>
            ) : (
              <text
                x={p.x}
                y={p.y + NODE_R + FONT_SIZE + 4}
                textAnchor="middle"
                fontSize={FONT_SIZE}
                fill="#cbd5e1"
                fontWeight="500"
              >
                {truncate(p.node, 18)}
              </text>
            )}
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
  availableLigands = [],
}: NetworkPreviewProps) {
  const isUnscored = pairs.length === 0
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(300)

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth)
    }
  }, [])

  useEffect(() => {
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [updateWidth])

  useEffect(() => {
    if (availableLigands.length === 0) return
    let cancelled = false
    const load = async () => {
      const entries = await Promise.all(
        ligandNames.map(async (name) => {
          const ligand = availableLigands.find(
            (l) => l.name === name || l.id === name
          )
          const smiles = ligand?.smiles
          if (!smiles) return [name, null] as const
          try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
            const res = await fetch(`${baseUrl}/api/rbfe/ligand-image?smiles=${encodeURIComponent(smiles)}`)
            if (!res.ok) return [name, null] as const
            const blob = await res.blob()
            return [name, URL.createObjectURL(blob)] as const
          } catch {
            return [name, null] as const
          }
        })
      )
      if (!cancelled) {
        setImageUrls(new Map(entries.filter(([, url]) => url !== null) as [string, string][]))
      }
    }
    load()
    return () => { cancelled = true }
  }, [ligandNames, availableLigands])

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
      <div ref={containerRef} className="rounded-lg border border-gray-700 bg-gray-900/50 p-3 overflow-hidden">
        <NetworkGraphSVG
          edges={edges}
          nodes={allNodes}
          topology={topology}
          centralLigand={centralLigand}
          unscored={isUnscored}
          imageUrls={imageUrls}
          containerWidth={containerWidth - 24}
        />
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
