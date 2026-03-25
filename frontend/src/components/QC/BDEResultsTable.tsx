'use client'

import React, { useMemo } from 'react'
import { BDEResult } from '@/store/qc-store'
import { AlertTriangle, TrendingDown, TrendingUp, Eye, ArrowUpDown, Download } from 'lucide-react'
import { downloadCSV } from '@/lib/csv-export'

interface BDEResultsTableProps {
  bdeResults: BDEResult[]
  statistics?: {
    min_bde_kcal: number
    max_bde_kcal: number
    mean_bde_kcal: number
    weakest_bond: string
    strongest_bond: string
    n_successful: number
    n_ring_bonds: number
    n_failed: number
  }
  className?: string
  onVisualize?: () => void
  onClearHighlight?: () => void
}

function getBDEStrengthColor(bde: number, min: number, max: number): string {
  const range = max - min
  if (range === 0) return 'text-gray-300'

  const normalized = (bde - min) / range

  if (normalized < 0.25) return 'text-blue-200'
  if (normalized < 0.5) return 'text-blue-300'
  if (normalized < 0.75) return 'text-blue-400'
  return 'text-blue-500'
}

function getBDEStrengthBg(bde: number, min: number, max: number): string {
  const range = max - min
  if (range === 0) return 'bg-gray-700/30'

  const normalized = (bde - min) / range

  if (normalized < 0.25) return 'bg-blue-950/30'
  if (normalized < 0.5) return 'bg-blue-900/25'
  if (normalized < 0.75) return 'bg-blue-800/20'
  return 'bg-blue-700/20'
}

export function BDEResultsTable({
  bdeResults,
  statistics,
  className = "",
  onVisualize,
  onClearHighlight
}: BDEResultsTableProps) {
  const [sortBy, setSortBy] = React.useState<'bond' | 'bde'>('bde')
  const [sortAsc, setSortAsc] = React.useState(true)

  const sortedResults = useMemo(() => {
    const successful = bdeResults.filter(r => r.status === 'success')
    const failed = bdeResults.filter(r => r.status === 'failed')

    const sorted = [...successful].sort((a, b) => {
      if (sortBy === 'bde') {
        const aVal = a.bde_corrected_kcal ?? 0
        const bVal = b.bde_corrected_kcal ?? 0
        return sortAsc ? aVal - bVal : bVal - aVal
      } else {
        return sortAsc
          ? a.bond_label.localeCompare(b.bond_label)
          : b.bond_label.localeCompare(a.bond_label)
      }
    })

    return [...sorted, ...failed]
  }, [bdeResults, sortBy, sortAsc])

  const toggleSort = (column: 'bond' | 'bde') => {
    if (sortBy === column) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(column)
      setSortAsc(true)
    }
  }

  if (!bdeResults || bdeResults.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden ${className}`}>
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
          <h3 className="text-sm font-medium text-white">Bond Dissociation Energies</h3>
        </div>
        <div className="p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No BDE data available</p>
        </div>
      </div>
    )
  }

  const min = statistics?.min_bde_kcal ?? Math.min(...bdeResults.filter(r => r.bde_corrected_kcal).map(r => r.bde_corrected_kcal!))
  const max = statistics?.max_bde_kcal ?? Math.max(...bdeResults.filter(r => r.bde_corrected_kcal).map(r => r.bde_corrected_kcal!))

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Bond Dissociation Energies</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCSV(
                [{ key: 'bond', label: 'Bond' }, { key: 'bde', label: 'BDE (kcal/mol)' }, { key: 'status', label: 'Status' }],
                bdeResults.map(r => ({ bond: r.bond_label, bde: r.bde_corrected_kcal?.toFixed(2) ?? '', status: r.status })),
                'bde_results.csv'
              )}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 px-2 py-1 rounded transition-colors"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
            {onVisualize && (
              <button
                onClick={onVisualize}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
              >
                <Eye className="w-3 h-3" />
                Visualize in 3D
              </button>
            )}
            {onClearHighlight && (
              <button
                onClick={onClearHighlight}
                className="text-xs text-gray-400 hover:text-white hover:bg-gray-700 px-2 py-1 rounded transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Homolytic bond cleavage energies (kcal/mol).{' '}
          <span className="text-blue-200">Weak</span> →{' '}
          <span className="text-blue-500">Strong</span>
        </p>
      </div>

      {/* Statistics Summary */}
      {statistics && (
        <div className="px-4 py-3 bg-gray-800/30 border-b border-gray-700/50 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-blue-200" />
            <div>
              <p className="text-xs text-gray-500">Weakest Bond</p>
              <p className="text-sm text-blue-200 font-medium">
                {statistics.weakest_bond}
                <span className="text-gray-500 ml-1">({statistics.min_bde_kcal.toFixed(1)})</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-gray-500">Strongest Bond</p>
              <p className="text-sm text-blue-500 font-medium">
                {statistics.strongest_bond}
                <span className="text-gray-500 ml-1">({statistics.max_bde_kcal.toFixed(1)})</span>
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Mean BDE</p>
            <p className="text-sm text-gray-300 font-medium">{statistics.mean_bde_kcal.toFixed(1)} kcal/mol</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Bonds Calculated</p>
            <p className="text-sm text-gray-300 font-medium">
              {statistics.n_successful}/{statistics.n_successful + statistics.n_failed}
              {(statistics.n_ring_bonds ?? 0) > 0 && (
                <span className="text-purple-400 ml-1">({statistics.n_ring_bonds} ring-open)</span>
              )}
              {statistics.n_failed > 0 && (
                <span className="text-red-400 ml-1">({statistics.n_failed} failed)</span>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm w-12">#</th>
              <th 
                className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm cursor-pointer hover:text-white transition-colors"
                onClick={() => toggleSort('bond')}
              >
                <div className="flex items-center gap-1">
                  Bond
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">Type</th>
              <th 
                className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm cursor-pointer hover:text-white transition-colors"
                onClick={() => toggleSort('bde')}
              >
                <div className="flex items-center gap-1">
                  BDE (kcal/mol)
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">Raw</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sortedResults.map((result, idx) => {
              const isWeakest = statistics?.weakest_bond === result.bond_label
              const isStrongest = statistics?.strongest_bond === result.bond_label
              const bdeColor = result.status === 'success' && result.bde_corrected_kcal
                ? getBDEStrengthColor(result.bde_corrected_kcal, min, max)
                : 'text-gray-500'
              const rowBg = result.status === 'success' && result.bde_corrected_kcal
                ? getBDEStrengthBg(result.bde_corrected_kcal, min, max)
                : ''

              return (
                <tr
                  key={result.bond_idx}
                  className={`hover:bg-gray-800/50 transition-colors ${rowBg} ${
                    isWeakest ? 'border-l-2 border-l-red-500' : ''
                  } ${isStrongest ? 'border-l-2 border-l-green-500' : ''}`}
                >
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {result.rank ?? idx + 1}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-300">
                    {result.bond_label}
                    {isWeakest && <span className="ml-1 text-red-400 text-xs">★</span>}
                    {isStrongest && <span className="ml-1 text-green-400 text-xs">★</span>}
                    {result.ring_opening && (
                      <span
                        className="ml-1 text-xs text-purple-400 bg-purple-900/30 px-1 rounded"
                        title="Ring-opening biradical (triplet state)"
                      >
                        biradical
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {result.bond_type.replace('BondType.', '')}
                  </td>
                  <td className={`px-4 py-3 font-mono font-medium ${bdeColor}`}>
                    {result.status === 'success'
                      ? result.bde_corrected_kcal?.toFixed(1)
                      : <span className="text-red-400 text-xs">Failed</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {result.status === 'success' && result.bde_raw_kcal?.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-700/50 bg-gray-800/30">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>Strength:</span>
          <span className="text-blue-200">● Weak (&lt;25%)</span>
          <span className="text-blue-300">● Low (25-50%)</span>
          <span className="text-blue-400">● Medium (50-75%)</span>
          <span className="text-blue-500">● Strong (&gt;75%)</span>
        </div>
      </div>
    </div>
  )
}
