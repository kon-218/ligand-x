'use client'

import React, { useMemo } from 'react'
import { QCResults } from '@/store/qc-store'
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Eye, EyeOff } from 'lucide-react'

interface FukuiIndicesTableProps {
  fukui: NonNullable<QCResults['fukui']>
  className?: string
  onVisualize?: (type: 'f+' | 'f-' | 'f0', values: number[]) => void
  onClearVisualization?: () => void
}

export function FukuiIndicesTable({ fukui, className = "", onVisualize, onClearVisualization }: FukuiIndicesTableProps) {
  const { atoms, f_plus, f_minus, f_zero, charges_neutral } = fukui

  // Find the most reactive sites
  const reactivityAnalysis = useMemo(() => {
    if (!atoms || atoms.length === 0 || !f_plus || !f_minus) {
      return null
    }

    // Find max f+ (nucleophilic attack site)
    const maxFPlusIdx = f_plus.reduce((maxIdx, val, idx, arr) =>
      val > arr[maxIdx] ? idx : maxIdx, 0)

    // Find max f- (electrophilic attack site)  
    const maxFMinusIdx = f_minus.reduce((maxIdx, val, idx, arr) =>
      val > arr[maxIdx] ? idx : maxIdx, 0)

    // Find max f0 (radical attack site)
    const maxFZeroIdx = f_zero?.reduce((maxIdx, val, idx, arr) =>
      val > arr[maxIdx] ? idx : maxIdx, 0) ?? 0

    return {
      nucleophilic: { idx: maxFPlusIdx, atom: atoms[maxFPlusIdx], value: f_plus[maxFPlusIdx] },
      electrophilic: { idx: maxFMinusIdx, atom: atoms[maxFMinusIdx], value: f_minus[maxFMinusIdx] },
      radical: { idx: maxFZeroIdx, atom: atoms[maxFZeroIdx], value: f_zero?.[maxFZeroIdx] }
    }
  }, [atoms, f_plus, f_minus, f_zero])

  // Handle empty or invalid data
  if (!atoms || atoms.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden ${className}`}>
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
          <h3 className="text-sm font-medium text-white">Atomic Fukui Indices</h3>
        </div>
        <div className="p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No Fukui indices data available</p>
          <p className="text-gray-500 text-xs mt-1">
            Mulliken charges may not have been extracted from the calculation
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Atomic Fukui Indices</h3>
          {onClearVisualization && (
            <button
              onClick={onClearVisualization}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 px-2 py-1 rounded transition-colors"
              title="Clear Fukui colours from viewer"
            >
              <EyeOff className="w-3 h-3" />
              Clear colours
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Predicts reactivity sites:
          <span className="text-red-400 ml-2">f⁺ (Nucleophilic)</span>,
          <span className="text-blue-400 ml-2">f⁻ (Electrophilic)</span>,
          <span className="text-purple-400 ml-2">f⁰ (Radical)</span>
        </p>
      </div>

      {/* Reactivity Summary */}
      {reactivityAnalysis && (
        <div className="px-4 py-3 bg-gray-800/30 border-b border-gray-700/50 grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-400" />
            <div>
              <p className="text-xs text-gray-500">Nucleophilic Attack</p>
              <p className="text-sm text-red-300 font-medium">
                {reactivityAnalysis.nucleophilic.idx + 1}: {reactivityAnalysis.nucleophilic.atom}
                <span className="text-gray-500 ml-1">({reactivityAnalysis.nucleophilic.value?.toFixed(3)})</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-blue-400" />
            <div>
              <p className="text-xs text-gray-500">Electrophilic Attack</p>
              <p className="text-sm text-blue-300 font-medium">
                {reactivityAnalysis.electrophilic.idx + 1}: {reactivityAnalysis.electrophilic.atom}
                <span className="text-gray-500 ml-1">({reactivityAnalysis.electrophilic.value?.toFixed(3)})</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            <div>
              <p className="text-xs text-gray-500">Radical Attack</p>
              <p className="text-sm text-purple-300 font-medium">
                {reactivityAnalysis.radical.idx + 1}: {reactivityAnalysis.radical.atom}
                <span className="text-gray-500 ml-1">({reactivityAnalysis.radical.value?.toFixed(3)})</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">Atom</th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">Charge (Neutral)</th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('🔴 f+ button clicked', { hasCallback: !!onVisualize, f_plusLength: f_plus?.length })
                    if (onVisualize && f_plus) {
                      onVisualize('f+', f_plus)
                    } else {
                      console.warn('[WARNING] Cannot visualize f+:', { hasCallback: !!onVisualize, hasData: !!f_plus })
                    }
                  }}
                  className="flex items-center gap-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1 rounded transition-colors"
                  title="Visualize f+ (Nucleophilic Attack)"
                >
                  f⁺ <Eye className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('🔵 f- button clicked', { hasCallback: !!onVisualize, f_minusLength: f_minus?.length })
                    if (onVisualize && f_minus) {
                      onVisualize('f-', f_minus)
                    } else {
                      console.warn('[WARNING] Cannot visualize f-:', { hasCallback: !!onVisualize, hasData: !!f_minus })
                    }
                  }}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
                  title="Visualize f- (Electrophilic Attack)"
                >
                  f⁻ <Eye className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">
                {f_zero && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('🟣 f0 button clicked', { hasCallback: !!onVisualize, f_zeroLength: f_zero?.length })
                      if (onVisualize && f_zero) {
                        onVisualize('f0', f_zero)
                      } else {
                        console.warn('[WARNING] Cannot visualize f0:', { hasCallback: !!onVisualize, hasData: !!f_zero })
                      }
                    }}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 hover:bg-purple-900/30 px-2 py-1 rounded transition-colors"
                    title="Visualize f0 (Radical Attack)"
                  >
                    f⁰ <Eye className="w-3 h-3" />
                  </button>
                )}
                {!f_zero && <span className="text-purple-400">f⁰</span>}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {atoms.map((atom, idx) => {
              const isNucleophilicMax = reactivityAnalysis?.nucleophilic.idx === idx
              const isElectrophilicMax = reactivityAnalysis?.electrophilic.idx === idx
              const isRadicalMax = reactivityAnalysis?.radical.idx === idx

              return (
                <tr
                  key={idx}
                  className={`hover:bg-gray-800/50 transition-colors ${isNucleophilicMax || isElectrophilicMax || isRadicalMax
                    ? 'bg-gray-800/30'
                    : ''
                    }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-300">
                    {idx + 1}: {atom}
                    {isNucleophilicMax && <span className="ml-1 text-red-400 text-xs">★</span>}
                    {isElectrophilicMax && <span className="ml-1 text-blue-400 text-xs">★</span>}
                    {isRadicalMax && <span className="ml-1 text-purple-400 text-xs">★</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono">
                    {charges_neutral?.[idx]?.toFixed(3) ?? '-'}
                  </td>
                  <td className={`px-4 py-3 font-mono ${isNucleophilicMax ? 'text-red-400 font-bold' : 'text-red-300/90'}`}>
                    {f_plus?.[idx]?.toFixed(3) ?? '-'}
                  </td>
                  <td className={`px-4 py-3 font-mono ${isElectrophilicMax ? 'text-blue-400 font-bold' : 'text-blue-300/90'}`}>
                    {f_minus?.[idx]?.toFixed(3) ?? '-'}
                  </td>
                  <td className={`px-4 py-3 font-mono ${isRadicalMax ? 'text-purple-400 font-bold' : 'text-purple-300/90'}`}>
                    {f_zero?.[idx]?.toFixed(3) ?? '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


