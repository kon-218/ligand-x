'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Activity, Thermometer } from 'lucide-react'
import type { MDAnalyticsData, MDKpiStatus } from '@/types/md-types'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as any

interface MDAnalyticsPanelProps {
  analytics: MDAnalyticsData
}

// ── Shared Plotly layout defaults ────────────────────────────────────────────
const PLOT_LAYOUT_BASE = {
  autosize: true,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(17, 24, 39, 0.8)',
  font: { color: '#9ca3af', size: 11 },
  margin: { t: 8, r: 16, b: 36, l: 60 },
  xaxis: {
    gridcolor: '#374151',
    zerolinecolor: '#374151',
    tickfont: { color: '#6b7280', size: 10 },
    title: { text: 'Time (ps)', font: { color: '#9ca3af', size: 11 } },
  },
  yaxis: {
    gridcolor: '#374151',
    zerolinecolor: '#374151',
    tickfont: { color: '#6b7280', size: 10 },
    title: { text: '', font: { color: '#9ca3af', size: 11 } },
  },
  legend: { font: { color: '#9ca3af', size: 10 }, bgcolor: 'rgba(0,0,0,0)' },
}

const PLOT_CONFIG = { displayModeBar: false, responsive: true }

// ── KPI card helpers ─────────────────────────────────────────────────────────
type KpiState = 'pass' | 'warn' | 'fail' | 'unknown'

function boolToState(v: boolean | null | undefined): KpiState {
  if (v === null || v === undefined) return 'unknown'
  return v ? 'pass' : 'fail'
}

function statusToState(v: MDKpiStatus | null | undefined): KpiState {
  if (!v) return 'unknown'
  return v
}

const KPI_STYLES: Record<KpiState, { card: string; icon: string; label: string }> = {
  pass:    { card: 'bg-green-900/20 border-green-700/50',   icon: 'text-green-400',  label: 'PASS' },
  warn:    { card: 'bg-amber-900/20 border-amber-700/50',   icon: 'text-amber-400',  label: 'WARN' },
  fail:    { card: 'bg-red-900/20 border-red-700/50',       icon: 'text-red-400',    label: 'FAIL' },
  unknown: { card: 'bg-gray-800/60 border-gray-700/50',     icon: 'text-gray-500',   label: '—'    },
}

function KpiIcon({ state }: { state: KpiState }) {
  const cls = `w-4 h-4 ${KPI_STYLES[state].icon}`
  if (state === 'pass')    return <CheckCircle className={cls} />
  if (state === 'fail')    return <XCircle className={cls} />
  if (state === 'warn')    return <AlertTriangle className={cls} />
  return <span className={`${cls} inline-block w-4 h-4`} />
}

interface KpiCardProps {
  label: string
  state: KpiState
  detail?: string
}

function KpiCard({ label, state, detail }: KpiCardProps) {
  const s = KPI_STYLES[state]
  return (
    <div className={`flex items-center gap-2 p-2 rounded border ${s.card}`}>
      <KpiIcon state={state} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-300 truncate">{label}</p>
        {detail && <p className="text-xs text-gray-500 truncate">{detail}</p>}
      </div>
      <span className={`text-xs font-bold ${s.icon} shrink-0`}>{s.label}</span>
    </div>
  )
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
function hasData(arr: number[] | undefined): boolean {
  return Array.isArray(arr) && arr.length > 0
}

function ThermodynamicsTab({ thermo }: { thermo: MDAnalyticsData['thermodynamics'] }) {
  const hasEnergy  = hasData(thermo?.potential_energy_kjmol)
  const hasTemp    = hasData(thermo?.temperature_k)
  const hasDensity = hasData(thermo?.density_gcm3)
  const timeAxis   = thermo?.time_ps ?? []

  if (!hasEnergy && !hasTemp && !hasDensity) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No thermodynamic data available for this run.
      </p>
    )
  }

  return (
    <div className="space-y-4 w-full min-w-0">
      {hasEnergy && (
        <div className="w-full min-w-0">
          <p className="text-xs text-gray-400 mb-1 font-medium">Potential Energy (kJ/mol)</p>
          <Plot
            data={[{
              x: timeAxis,
              y: thermo.potential_energy_kjmol,
              type: 'scatter',
              mode: 'lines',
              line: { color: '#60a5fa', width: 1.5 },
              showlegend: false,
            }]}
            layout={{ ...PLOT_LAYOUT_BASE, height: 160 }}
            config={PLOT_CONFIG}
            style={{ width: '100%' }}
            useResizeHandler={true}
          />
        </div>
      )}

      {hasTemp && (
        <div className="w-full min-w-0">
          <p className="text-xs text-gray-400 mb-1 font-medium">Temperature (K)</p>
          <Plot
            data={[{
              x: timeAxis,
              y: thermo.temperature_k,
              type: 'scatter',
              mode: 'lines',
              line: { color: '#f97316', width: 1.5 },
              showlegend: false,
            }]}
            layout={{ ...PLOT_LAYOUT_BASE, height: 160 }}
            config={PLOT_CONFIG}
            style={{ width: '100%' }}
            useResizeHandler={true}
          />
        </div>
      )}

      {hasDensity && (
        <div className="w-full min-w-0">
          <p className="text-xs text-gray-400 mb-1 font-medium">Density (g/cm³) — dashed: target 1.0</p>
          <Plot
            data={[
              {
                x: timeAxis,
                y: thermo.density_gcm3,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#34d399', width: 1.5 },
                showlegend: false,
              },
              {
                x: [timeAxis[0] ?? 0, timeAxis[timeAxis.length - 1] ?? 0],
                y: [1.0, 1.0],
                type: 'scatter',
                mode: 'lines',
                line: { color: '#6b7280', width: 1, dash: 'dash' },
                showlegend: false,
              },
            ]}
            layout={{ ...PLOT_LAYOUT_BASE, height: 160 }}
            config={PLOT_CONFIG}
            style={{ width: '100%' }}
            useResizeHandler={true}
          />
        </div>
      )}
    </div>
  )
}

function StructuralTab({ rmsd, kpi }: { rmsd: MDAnalyticsData['rmsd']; kpi: MDAnalyticsData['kpi_summary'] }) {
  const hasBackbone = hasData(rmsd?.backbone_rmsd_angstrom)
  const hasLigand   = hasData(rmsd?.ligand_rmsd_angstrom)
  const timeAxis    = rmsd?.time_ps ?? []
  const bbThreshold  = kpi?.backbone_rmsd_pass_a ?? 2.5
  const ligThreshold = kpi?.ligand_rmsd_pass_a ?? 2.0

  if (!hasBackbone) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No structural data available. RMSD requires a full equilibration trajectory (NVT + NPT).
      </p>
    )
  }

  const traces: any[] = [
    {
      x: timeAxis,
      y: rmsd.backbone_rmsd_angstrom,
      type: 'scatter',
      mode: 'lines',
      name: 'Backbone (Cα)',
      line: { color: '#60a5fa', width: 1.5 },
    },
    // Backbone threshold line (2.5 Å)
    {
      x: [timeAxis[0] ?? 0, timeAxis[timeAxis.length - 1] ?? 0],
      y: [bbThreshold, bbThreshold],
      type: 'scatter',
      mode: 'lines',
      name: `Backbone limit (${bbThreshold} Å)`,
      line: { color: '#3b82f6', width: 1, dash: 'dot' },
    },
  ]

  if (hasLigand) {
    traces.push(
      {
        x: timeAxis,
        y: rmsd.ligand_rmsd_angstrom,
        type: 'scatter',
        mode: 'lines',
        name: 'Ligand',
        line: { color: '#fbbf24', width: 1.5 },
      },
      // Ligand threshold line (2.0 Å)
      {
        x: [timeAxis[0] ?? 0, timeAxis[timeAxis.length - 1] ?? 0],
        y: [ligThreshold, ligThreshold],
        type: 'scatter',
        mode: 'lines',
        name: `Ligand limit (${ligThreshold} Å)`,
        line: { color: '#d97706', width: 1, dash: 'dot' },
      }
    )
  }

  return (
    <div className="w-full min-w-0">
      <p className="text-xs text-gray-400 mb-1 font-medium">RMSD vs. Initial Frame (Å)</p>
      <Plot
        data={traces}
        layout={{ ...PLOT_LAYOUT_BASE, height: 260 }}
        config={PLOT_CONFIG}
        style={{ width: '100%' }}
        useResizeHandler={true}
      />
      <p className="text-xs text-gray-500 mt-1">
        Dashed lines: pass thresholds — backbone {bbThreshold} Å{hasLigand ? `, ligand ${ligThreshold} Å` : ''}.
      </p>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
type Tab = 'thermodynamics' | 'structural'

export function MDAnalyticsPanel({ analytics }: MDAnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('thermodynamics')

  // Analytics backend error
  if (analytics.error) {
    return (
      <div className="p-3 bg-gray-800/50 rounded border border-gray-700/50">
        <p className="text-xs text-gray-400">
          Analytics unavailable for this run.
        </p>
      </div>
    )
  }

  const kpi = analytics.kpi_summary
  const rmsd = analytics.rmsd

  // KPI cards — only shown if data exists
  const showBackboneRmsd = hasData(rmsd?.backbone_rmsd_angstrom)
  const showLigandRmsd   = hasData(rmsd?.ligand_rmsd_angstrom)
  const showEnergy       = kpi?.energy_stable !== null && kpi?.energy_stable !== undefined
  const showDensity      = kpi?.density_converged !== null && kpi?.density_converged !== undefined

  return (
    <div className="space-y-4 w-full min-w-0 overflow-hidden">
      {/* KPI cards grid */}
      <div className="grid grid-cols-2 gap-2">
        {showEnergy && (
          <KpiCard label="Energy stable" state={boolToState(kpi?.energy_stable)} detail="std < 500 kJ/mol" />
        )}
        {showDensity && (
          <KpiCard label="Density converged" state={boolToState(kpi?.density_converged)} detail="std < 0.05 g/cm³" />
        )}
        {showBackboneRmsd && (
          <KpiCard label="Backbone RMSD" state={statusToState(kpi?.backbone_rmsd_status)} detail="< 2.5 Å target" />
        )}
        {showLigandRmsd && (
          <KpiCard label="Ligand RMSD" state={statusToState(kpi?.ligand_rmsd_status)} detail="< 2.0 Å target" />
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        <button
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'thermodynamics'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('thermodynamics')}
        >
          <Thermometer className="w-3 h-3" />
          Thermodynamics
        </button>
        <button
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'structural'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('structural')}
        >
          <Activity className="w-3 h-3" />
          Structural (RMSD)
        </button>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'thermodynamics' && (
          <ThermodynamicsTab thermo={analytics.thermodynamics} />
        )}
        {activeTab === 'structural' && (
          <StructuralTab rmsd={analytics.rmsd} kpi={analytics.kpi_summary} />
        )}
      </div>
    </div>
  )
}
