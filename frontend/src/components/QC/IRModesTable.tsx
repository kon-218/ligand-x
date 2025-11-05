'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Info, Download } from 'lucide-react'

interface IRModesTableProps {
  modes?: number[]
  frequencies: number[]
  intensities: number[]  // Int (km/mol) - integrated absorption
  eps?: number[]         // Molar absorption coefficient L/(mol*cm)
  tSquared?: number[]    // T**2 in a.u.
  tx?: number[]          // Transition dipole X component
  ty?: number[]          // Transition dipole Y component
  tz?: number[]          // Transition dipole Z component
  className?: string
  jobId?: string
}

// Get relative intensity classification (purely from data)
function getIntensityClass(intensity: number, maxIntensity: number): { label: string; color: string } {
  const ratio = intensity / maxIntensity
  if (ratio > 0.7) return { label: 'Strong', color: 'text-red-400' }
  if (ratio > 0.3) return { label: 'Medium', color: 'text-yellow-400' }
  if (ratio > 0.1) return { label: 'Weak', color: 'text-green-400' }
  return { label: 'Very Weak', color: 'text-gray-500' }
}

export function IRModesTable({
  modes,
  frequencies,
  intensities,
  eps,
  tSquared,
  tx,
  ty,
  tz,
  className = '',
  jobId
}: IRModesTableProps) {
  const [sortColumn, setSortColumn] = useState<'mode' | 'freq' | 'int'>('freq')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (!frequencies || frequencies.length === 0) {
    return (
      <div className={`bg-gray-800/50 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-400">
          <Info className="w-6 h-6 mx-auto mb-2" />
          <p>No vibrational mode data available</p>
        </div>
      </div>
    )
  }

  const maxIntensity = Math.max(...intensities)
  const hasAdvancedData = eps && eps.length > 0 && eps.some(e => e > 0)

  // Build data array
  const data = frequencies.map((freq, i) => ({
    mode: modes?.[i] ?? i + 1,
    frequency: freq,
    intensity: intensities[i],
    eps: eps?.[i] ?? 0,
    tSquared: tSquared?.[i] ?? 0,
    tx: tx?.[i] ?? 0,
    ty: ty?.[i] ?? 0,
    tz: tz?.[i] ?? 0,
    intensityClass: getIntensityClass(intensities[i], maxIntensity)
  }))

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    let comparison = 0
    switch (sortColumn) {
      case 'mode':
        comparison = a.mode - b.mode
        break
      case 'freq':
        comparison = a.frequency - b.frequency
        break
      case 'int':
        comparison = a.intensity - b.intensity
        break
    }
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const handleSort = (column: 'mode' | 'freq' | 'int') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ column }: { column: 'mode' | 'freq' | 'int' }) => {
    if (sortColumn !== column) return null
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-3 h-3 inline ml-1" /> : 
      <ChevronDown className="w-3 h-3 inline ml-1" />
  }

  const downloadCSV = () => {
    const headers = ['Mode', 'Frequency (cm⁻¹)', 'Int (km/mol)', 'ε (L/mol·cm)', 'T² (a.u.)', 'TX', 'TY', 'TZ']
    const rows = sortedData.map(d => [
      d.mode,
      d.frequency.toFixed(2),
      d.intensity.toFixed(2),
      d.eps.toFixed(6),
      d.tSquared.toFixed(6),
      d.tx.toFixed(6),
      d.ty.toFixed(6),
      d.tz.toFixed(6),
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ir_modes_${jobId || 'data'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`bg-gray-800/50 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div>
          <h3 className="text-base font-semibold text-white">Vibrational Modes</h3>
          <p className="text-xs text-gray-400 mt-0.5">{frequencies.length} IR-active modes</p>
        </div>
        <div className="flex items-center gap-2">
          {hasAdvancedData && (
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              {showAdvanced ? 'Simple View' : 'Advanced View'}
            </button>
          )}
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800 z-10">
            <tr className="text-gray-400 text-xs">
              <th 
                className="px-3 py-2 text-left cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('mode')}
              >
                Mode <SortIcon column="mode" />
              </th>
              <th 
                className="px-3 py-2 text-right cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('freq')}
              >
                Frequency <SortIcon column="freq" />
                <span className="text-gray-500 font-normal ml-1">(cm⁻¹)</span>
              </th>
              <th 
                className="px-3 py-2 text-right cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('int')}
              >
                Int <SortIcon column="int" />
                <span className="text-gray-500 font-normal ml-1">(km/mol)</span>
              </th>
              {showAdvanced && hasAdvancedData && (
                <>
                  <th className="px-3 py-2 text-right">
                    ε <span className="text-gray-500 font-normal">(L/mol·cm)</span>
                  </th>
                  <th className="px-3 py-2 text-right">
                    T² <span className="text-gray-500 font-normal">(a.u.)</span>
                  </th>
                  <th className="px-3 py-2 text-center" colSpan={3}>
                    Transition Dipole (TX, TY, TZ)
                  </th>
                </>
              )}
              <th className="px-3 py-2 text-center">Relative Strength</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {sortedData.map((row, idx) => (
              <tr 
                key={idx} 
                className="hover:bg-gray-700/30 transition-colors"
              >
                <td className="px-3 py-2 text-gray-300 font-mono">{row.mode}</td>
                <td className="px-3 py-2 text-right text-white font-medium font-mono">
                  {row.frequency.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-gray-300 font-mono">
                  {row.intensity.toFixed(2)}
                </td>
                {showAdvanced && hasAdvancedData && (
                  <>
                    <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">
                      {row.eps.toExponential(3)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">
                      {row.tSquared.toExponential(3)}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-500 font-mono text-xs">
                      {row.tx.toFixed(4)}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-500 font-mono text-xs">
                      {row.ty.toFixed(4)}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-500 font-mono text-xs">
                      {row.tz.toFixed(4)}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-center">
                  <span className={`${row.intensityClass.color} text-xs px-1.5 py-0.5 rounded bg-gray-700/50`}>
                    {row.intensityClass.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="text-gray-300">Int:</span> Integrated absorption coefficient</span>
          <span><span className="text-gray-300">ε:</span> Molar absorption coefficient</span>
          <span><span className="text-gray-300">T²:</span> Transition dipole moment squared</span>
        </div>
      </div>
    </div>
  )
}
