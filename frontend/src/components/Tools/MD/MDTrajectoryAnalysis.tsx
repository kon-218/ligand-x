'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Info } from 'lucide-react'
import { api } from '@/lib/api-client'
import type { TrajectoryAnalysisResult } from '@/types/md-types'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
    </div>
  ),
})

const DARK_LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(17,24,39,0.8)',
  font: { color: '#D1D5DB', size: 11 },
  margin: { t: 30, r: 15, b: 50, l: 55 },
  xaxis: { gridcolor: 'rgba(75,85,99,0.3)', color: '#D1D5DB', tickfont: { color: '#D1D5DB', size: 10 }, linecolor: '#4B5563', showline: true, zeroline: false },
  yaxis: { gridcolor: 'rgba(75,85,99,0.3)', color: '#D1D5DB', tickfont: { color: '#D1D5DB', size: 10 }, linecolor: '#4B5563', showline: true, zeroline: false },
  showlegend: false,
  hovermode: 'closest' as const,
}

interface MDTrajectoryAnalysisProps {
  trajectoryPath: string
}

export function MDTrajectoryAnalysis({ trajectoryPath }: MDTrajectoryAnalysisProps) {
  const [data, setData] = useState<TrajectoryAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.getTrajectoryAnalysis(trajectoryPath)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.detail || err.message || 'Analysis failed') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trajectoryPath])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        Computing trajectory analysis...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg text-sm text-red-400">
        <Info className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{data.n_frames} frames · {data.n_residues} Cα atoms</div>

      {/* RMSD */}
      <div className="bg-gray-800/50 rounded-lg p-2">
        <p className="text-xs font-medium text-gray-300 mb-1">RMSD vs Time</p>
        <Plot
          data={[{ x: data.time_ns, y: data.rmsd_angstrom, type: 'scatter', mode: 'lines', line: { color: '#60A5FA', width: 1.5 }, hovertemplate: '%{x:.3f} ns<br>RMSD: %{y:.3f} Å<extra></extra>' }]}
          layout={{ ...DARK_LAYOUT, height: 180, xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Time (ns)', font: { color: '#9CA3AF', size: 10 }, standoff: 5 } }, yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'RMSD (Å)', font: { color: '#9CA3AF', size: 10 }, standoff: 5 } } }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: 180 }}
          useResizeHandler
        />
      </div>

      {/* RMSF */}
      {data.rmsf_angstrom.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-2">
          <p className="text-xs font-medium text-gray-300 mb-1">RMSF per Residue</p>
          <Plot
            data={[{ x: data.residue_labels, y: data.rmsf_angstrom, type: 'bar', marker: { color: '#34D399' }, hovertemplate: '%{x}<br>RMSF: %{y:.3f} Å<extra></extra>' }]}
            layout={{ ...DARK_LAYOUT, height: 180, xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Residue', font: { color: '#9CA3AF', size: 10 }, standoff: 5 }, tickangle: -45, nticks: 20 }, yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'RMSF (Å)', font: { color: '#9CA3AF', size: 10 }, standoff: 5 } } }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%', height: 180 }}
            useResizeHandler
          />
        </div>
      )}

      {/* Rg */}
      <div className="bg-gray-800/50 rounded-lg p-2">
        <p className="text-xs font-medium text-gray-300 mb-1">Radius of Gyration</p>
        <Plot
          data={[{ x: data.time_ns, y: data.rg_angstrom, type: 'scatter', mode: 'lines', line: { color: '#F472B6', width: 1.5 }, hovertemplate: '%{x:.3f} ns<br>Rg: %{y:.3f} Å<extra></extra>' }]}
          layout={{ ...DARK_LAYOUT, height: 180, xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Time (ns)', font: { color: '#9CA3AF', size: 10 }, standoff: 5 } }, yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Rg (Å)', font: { color: '#9CA3AF', size: 10 }, standoff: 5 } } }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: 180 }}
          useResizeHandler
        />
      </div>
    </div>
  )
}
