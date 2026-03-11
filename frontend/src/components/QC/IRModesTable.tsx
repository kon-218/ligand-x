'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, ChevronRight, Info, Download, Loader2, Play } from 'lucide-react'
import { qcService } from '@/lib/qc-service'
import type { ModeClassification } from '@/lib/qc-service'
import { useMolecularStore } from '@/store/molecular-store'

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

function getIntensityClass(intensity: number, maxIntensity: number): { label: string; color: string } {
  const ratio = intensity / maxIntensity
  if (ratio > 0.7) return { label: 'Strong', color: 'text-red-400' }
  if (ratio > 0.3) return { label: 'Medium', color: 'text-yellow-400' }
  if (ratio > 0.1) return { label: 'Weak', color: 'text-green-400' }
  return { label: 'Very Weak', color: 'text-gray-500' }
}

// Frequency-range fallback when displacement vectors are unavailable
function classifyByFrequency(freq: number): string | null {
  const f = Math.abs(freq)
  if (f >= 3580)  return 'O-H stretch (free)'
  if (f >= 3200)  return 'O-H / N-H stretch'
  if (f >= 3010)  return 'C-H stretch (aromatic)'
  if (f >= 2850)  return 'C-H stretch (alkyl)'
  if (f >= 2500)  return 'S-H / broad O-H stretch'
  if (f >= 2200)  return 'C≡N / C≡C stretch'
  if (f >= 1900)  return 'C=C=O / allene stretch'
  if (f >= 1800)  return 'C=O stretch (anhydride)'
  if (f >= 1735)  return 'C=O stretch (ester)'
  if (f >= 1700)  return 'C=O stretch (ketone/aldehyde)'
  if (f >= 1660)  return 'C=O stretch (amide) / C=C'
  if (f >= 1620)  return 'C=C stretch (alkene)'
  if (f >= 1550)  return 'N-H bend / aromatic C=C'
  if (f >= 1450)  return 'CH₂/CH₃ bend'
  if (f >= 1350)  return 'C-H bend'
  if (f >= 1200)  return 'C-N / C-O / C-F stretch'
  if (f >= 1000)  return 'C-O-C / ring breathing'
  if (f >= 900)   return 'C-H out-of-plane / ring'
  if (f >= 700)   return 'C-H oop / CH₂ rock'
  if (f >= 500)   return 'C-Cl / C-Br / skeletal bend'
  if (f >= 200)   return 'Skeletal bend'
  if (f >= 10)    return 'Torsion / libration'
  return null
}

const TYPE_COLORS: Record<string, string> = {
  stretch:  'text-blue-300 bg-blue-900/30 border-blue-700/40',
  bend:     'text-green-300 bg-green-900/30 border-green-700/40',
  torsion:  'text-yellow-300 bg-yellow-900/30 border-yellow-700/40',
  heuristic:'text-gray-300 bg-gray-700/30 border-gray-600/40',
}

const TYPE_BAR_COLORS: Record<string, string> = {
  stretch: 'bg-blue-400',
  bend:    'bg-green-400',
  torsion: 'bg-yellow-400',
}

// ── Sub-components for advanced expanded detail ──────────────────────────────

function ContributionBars({ contributions }: { contributions: ModeClassification['contributions'] }) {
  return (
    <div className="space-y-1">
      {(['stretch', 'bend', 'torsion'] as const).map(type => (
        <div key={type} className="flex items-center gap-2">
          <span className="text-gray-400 w-12 capitalize text-xs">{type}</span>
          <div className="flex-1 bg-gray-700/60 rounded-full h-1.5">
            <div
              className={`${TYPE_BAR_COLORS[type]} h-full rounded-full`}
              style={{ width: `${contributions[type]}%` }}
            />
          </div>
          <span className="text-gray-400 text-xs w-8 text-right">{contributions[type]}%</span>
        </div>
      ))}
    </div>
  )
}

function TopCoords({ cls }: { cls: ModeClassification }) {
  if (cls.type === 'stretch') {
    return (
      <table className="text-xs w-full">
        <thead><tr className="text-gray-500"><th className="text-left font-normal pb-1">Bond</th><th className="text-right font-normal pb-1">Δr (mÅ)</th></tr></thead>
        <tbody>
          {cls.top_bonds.map((b, i) => (
            <tr key={i} className="border-t border-gray-700/30">
              <td className="py-0.5 text-gray-300 font-mono">{b.labels.join('-')}</td>
              <td className="py-0.5 text-right text-gray-300 font-mono">{b.delta_r_mA}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (cls.type === 'bend') {
    return (
      <table className="text-xs w-full">
        <thead><tr className="text-gray-500"><th className="text-left font-normal pb-1">Angle</th><th className="text-right font-normal pb-1">Δθ (°)</th></tr></thead>
        <tbody>
          {cls.top_angles.map((a, i) => (
            <tr key={i} className="border-t border-gray-700/30">
              <td className="py-0.5 text-gray-300 font-mono">{a.labels.join('-')}</td>
              <td className="py-0.5 text-right text-gray-300 font-mono">{a.delta_theta_deg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (cls.type === 'torsion') {
    return (
      <table className="text-xs w-full">
        <thead><tr className="text-gray-500"><th className="text-left font-normal pb-1">Dihedral</th><th className="text-right font-normal pb-1">Δφ (°)</th></tr></thead>
        <tbody>
          {cls.top_dihedrals.map((d, i) => (
            <tr key={i} className="border-t border-gray-700/30">
              <td className="py-0.5 text-gray-300 font-mono">{d.labels.join('-')}</td>
              <td className="py-0.5 text-right text-gray-300 font-mono">{d.delta_phi_deg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return null
}

function AtomParticipation({ participation, atomSymbols }: {
  participation: number[]
  atomSymbols?: string[]
}) {
  const top = participation
    .map((p, i) => ({ p, label: atomSymbols ? `${atomSymbols[i]}${i + 1}` : `${i + 1}` }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 8)
    .filter(x => x.p > 0.5)

  return (
    <div className="flex flex-wrap gap-1.5">
      {top.map(({ p, label }, i) => (
        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300">
          {label} <span className="text-gray-500">{p.toFixed(1)}%</span>
        </span>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

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
  const [sortColumn, setSortColumn]     = useState<'mode' | 'freq' | 'int'>('freq')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [animatingMode, setAnimatingMode] = useState<number | null>(null)

  // Classification state (fetched from normal-modes API)
  const [classifications, setClassifications]     = useState<ModeClassification[] | null>(null)
  const [allFreqs, setAllFreqs]                   = useState<number[] | null>(null)
  const [atomSymbols, setAtomSymbols]             = useState<string[] | undefined>()
  const [clsLoading, setClsLoading]               = useState(false)

  const { viewerRef } = useMolecularStore()

  // Fetch classifications once when jobId is available
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    setClsLoading(true)
    qcService.getNormalModes(jobId)
      .then(data => {
        if (cancelled) return
        const nm = data.normal_modes
        if (nm.classifications) setClassifications(nm.classifications)
        if (nm.frequencies)     setAllFreqs(nm.frequencies)
        if (nm.atom_symbols)    setAtomSymbols(nm.atom_symbols)
      })
      .catch(() => { /* classification unavailable — gracefully show heuristic */ })
      .finally(() => { if (!cancelled) setClsLoading(false) })
    return () => { cancelled = true }
  }, [jobId])

  // Match an IR frequency to the closest classified mode by value
  const getClassification = useCallback((freq: number): ModeClassification | null => {
    if (!classifications || !allFreqs) return null
    let bestIdx = -1
    let bestDist = Infinity
    allFreqs.forEach((f, i) => {
      const d = Math.abs(f - freq)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    })
    // Only accept match within 2 cm⁻¹ to avoid wrong-mode assignments
    if (bestIdx >= 0 && bestDist < 2 && classifications[bestIdx]?.type !== 'translation/rotation') {
      return classifications[bestIdx]
    }
    return null
  }, [classifications, allFreqs])

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

  const data = frequencies.map((freq, i) => ({
    mode: modes?.[i] ?? i + 1,
    frequency: freq,
    intensity: intensities[i],
    eps: eps?.[i] ?? 0,
    tSquared: tSquared?.[i] ?? 0,
    tx: tx?.[i] ?? 0,
    ty: ty?.[i] ?? 0,
    tz: tz?.[i] ?? 0,
    intensityClass: getIntensityClass(intensities[i], maxIntensity),
    originalIndex: i,
  }))

  const sortedData = [...data].sort((a, b) => {
    let cmp = 0
    if (sortColumn === 'mode') cmp = a.mode - b.mode
    else if (sortColumn === 'freq') cmp = a.frequency - b.frequency
    else cmp = a.intensity - b.intensity
    return sortDirection === 'asc' ? cmp : -cmp
  })

  const handleSort = (column: 'mode' | 'freq' | 'int') => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortColumn(column); setSortDirection('desc') }
  }

  const toggleExpand = (modeNum: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(modeNum) ? next.delete(modeNum) : next.add(modeNum)
      return next
    })
  }

  const handleAnimate = async (modeIndex: number) => {
    if (!jobId || !viewerRef) return
    setAnimatingMode(modeIndex)
    try {
      const traj = await qcService.getModeTrajectory(jobId, modeIndex, 60, 0.3)
      const handle = viewerRef as any
      if (typeof handle?.animateNormalMode === 'function') {
        await handle.animateNormalMode(traj.pdb_data, { loop: true, speed: 30 })
      } else if (typeof handle?.loadTrajectory === 'function') {
        await handle.loadTrajectory({ pdbData: traj.pdb_data }, 'pdb')
        handle.animate?.loop?.()
      }
    } catch (err) {
      console.error('Failed to animate mode:', err)
    } finally {
      setAnimatingMode(null)
    }
  }

  const downloadCSV = () => {
    const headers = ['Mode', 'Frequency (cm⁻¹)', 'Int (km/mol)', 'Assignment',
      'ε (L/mol·cm)', 'T² (a.u.)', 'TX', 'TY', 'TZ']
    const rows = sortedData.map(d => {
      const cls = getClassification(d.frequency)
      const label = cls?.primary_label ?? classifyByFrequency(d.frequency) ?? ''
      return [d.mode, d.frequency.toFixed(2), d.intensity.toFixed(2), label,
        d.eps.toFixed(6), d.tSquared.toFixed(6), d.tx.toFixed(6), d.ty.toFixed(6), d.tz.toFixed(6)]
    })
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `ir_modes_${jobId || 'data'}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const SortIcon = ({ column }: { column: 'mode' | 'freq' | 'int' }) => {
    if (sortColumn !== column) return null
    return sortDirection === 'asc'
      ? <ChevronUp className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />
  }

  // Determine if we have classifications to show
  const hasClassifications = classifications !== null

  return (
    <div className={`bg-gray-800/50 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div>
          <h3 className="text-base font-semibold text-white">Vibrational Modes</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {frequencies.length} IR-active modes
            {clsLoading && <span className="ml-2 text-gray-500">· loading assignments...</span>}
            {!clsLoading && hasClassifications && <span className="ml-2 text-gray-500">· displacement-based assignments</span>}
            {!clsLoading && !hasClassifications && <span className="ml-2 text-gray-500">· frequency-range assignments (approx.)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAdvancedData && (
            <button
              onClick={() => setShowAdvanced(v => !v)}
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
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800 z-10">
            <tr className="text-gray-400 text-xs">
              {/* Expand chevron column (always present, for alignment) */}
              <th className="w-6 px-1 py-2" />
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
                  <th className="px-3 py-2 text-right">ε <span className="text-gray-500 font-normal">(L/mol·cm)</span></th>
                  <th className="px-3 py-2 text-right">T² <span className="text-gray-500 font-normal">(a.u.)</span></th>
                  <th className="px-3 py-2 text-center" colSpan={3}>Transition Dipole (TX, TY, TZ)</th>
                </>
              )}
              <th className="px-3 py-2 text-left">Assignment</th>
              <th className="px-3 py-2 text-center">Strength</th>
              {jobId && <th className="px-3 py-2 text-center w-20">Animate</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {sortedData.map((row) => {
              const cls        = getClassification(row.frequency)
              const isExpanded = expandedRows.has(row.mode)

              // Assignment label + colour
              let assignLabel: string | null
              let colorKey: string
              if (cls) {
                assignLabel = cls.primary_label
                colorKey    = cls.type
              } else {
                assignLabel = classifyByFrequency(row.frequency)
                colorKey    = 'heuristic'
              }

              // Map to the 0-based index expected by the trajectory endpoint.
              // 'modes' holds the ORCA 0-based mode numbers (e.g. 6 for the first real
              // vibrational mode of a molecule with 6 trivial modes). The trajectory
              // displacements array is indexed the same way (trivial modes 0-5, real
              // modes 6+), so we use row.mode directly.
              // When 'modes' is absent the full frequency array is passed and
              // originalIndex is already the correct 0-based index.
              const animModeIdx = modes !== undefined ? row.mode : row.originalIndex

              return (
                <React.Fragment key={row.mode}>
                  <tr className={`hover:bg-gray-700/30 transition-colors ${isExpanded ? 'bg-gray-800/40' : ''}`}>
                    {/* Expand toggle — only when classification detail available */}
                    <td className="px-1 py-2 text-center">
                      {cls ? (
                        <button
                          onClick={() => toggleExpand(row.mode)}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : <span className="w-3.5 h-3.5 inline-block" />}
                    </td>

                    <td className="px-3 py-2 text-gray-300 font-mono">{row.mode}</td>

                    <td className="px-3 py-2 text-right text-white font-medium font-mono">
                      {row.frequency.toFixed(2)}
                    </td>

                    <td className="px-3 py-2 text-right text-gray-300 font-mono">
                      {row.intensity.toFixed(2)}
                    </td>

                    {showAdvanced && hasAdvancedData && (
                      <>
                        <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">{row.eps.toExponential(3)}</td>
                        <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">{row.tSquared.toExponential(3)}</td>
                        <td className="px-2 py-2 text-right text-gray-500 font-mono text-xs">{row.tx.toFixed(4)}</td>
                        <td className="px-2 py-2 text-right text-gray-500 font-mono text-xs">{row.ty.toFixed(4)}</td>
                        <td className="px-2 py-2 text-right text-gray-500 font-mono text-xs">{row.tz.toFixed(4)}</td>
                      </>
                    )}

                    <td className="px-3 py-2">
                      {assignLabel ? (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border ${TYPE_COLORS[colorKey] ?? TYPE_COLORS.heuristic}`}>
                          {assignLabel}
                        </span>
                      ) : <span className="text-gray-600 text-xs">—</span>}
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span className={`${row.intensityClass.color} text-xs px-1.5 py-0.5 rounded bg-gray-700/50`}>
                        {row.intensityClass.label}
                      </span>
                    </td>

                    {jobId && (
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleAnimate(animModeIdx)}
                          disabled={animatingMode !== null}
                          className={`
                            px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 mx-auto
                            ${animatingMode === animModeIdx
                              ? 'bg-blue-600 text-white cursor-wait'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'}
                          `}
                          title="Animate this mode"
                        >
                          {animatingMode === animModeIdx
                            ? <><Loader2 className="w-3 h-3 animate-spin" />Loading...</>
                            : <><Play className="w-3 h-3" />Animate</>}
                        </button>
                      </td>
                    )}
                  </tr>

                  {/* Expanded classification detail */}
                  {isExpanded && cls && (
                    <tr className="bg-gray-800/60">
                      <td colSpan={jobId ? (showAdvanced && hasAdvancedData ? 12 : 8) : (showAdvanced && hasAdvancedData ? 11 : 7)}
                          className="px-6 py-3 border-b border-gray-700/40">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="text-gray-500 mb-2 uppercase tracking-wide text-xs">Contributions</p>
                            <ContributionBars contributions={cls.contributions} />
                          </div>
                          <div>
                            <p className="text-gray-500 mb-2 uppercase tracking-wide text-xs">
                              {cls.type === 'stretch' ? 'Top bonds' : cls.type === 'bend' ? 'Top angles' : 'Top dihedrals'}
                            </p>
                            <TopCoords cls={cls} />
                          </div>
                          <div>
                            <p className="text-gray-500 mb-2 uppercase tracking-wide text-xs">Atom participation</p>
                            <AtomParticipation participation={cls.participation} atomSymbols={atomSymbols} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="text-gray-300">Int:</span> Integrated absorption</span>
          {hasAdvancedData && (
            <>
              <span><span className="text-gray-300">ε:</span> Molar absorption coefficient</span>
              <span><span className="text-gray-300">T²:</span> Transition dipole moment squared</span>
            </>
          )}
          <span className="flex gap-2 ml-auto">
            {([['stretch','Stretch','text-blue-300'], ['bend','Bend','text-green-300'], ['torsion','Torsion','text-yellow-300'], ['heuristic','Freq. range','text-gray-300']] as const).map(([,label,color]) => (
              <span key={label} className={`${color}`}>{label}</span>
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}
