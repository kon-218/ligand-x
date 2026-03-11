'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, Play, Info, ChevronRight, ChevronDown } from 'lucide-react'
import { qcService } from '@/lib/qc-service'
import type { ModeClassification } from '@/lib/qc-service'
import { useMolecularStore } from '@/store/molecular-store'

interface VibrationalModesTableProps {
  jobId: string | null
  frequencies?: number[]
  intensities?: number[]
  className?: string
}

interface ModeData {
  index: number
  frequency: number
  intensity: number
  isImaginary: boolean
  classification?: ModeClassification
}

// Frequency-range heuristic fallback (used when displacement vectors unavailable)
function classifyByFrequency(freq: number): string | null {
  const f = Math.abs(freq)
  if (freq < 0)        return 'Transition state / saddle point'
  if (f >= 3580)       return 'O-H stretch (free)'
  if (f >= 3200)       return 'O-H / N-H stretch'
  if (f >= 3010)       return 'C-H stretch (aromatic)'
  if (f >= 2850)       return 'C-H stretch (alkyl)'
  if (f >= 2500)       return 'S-H / broad O-H stretch'
  if (f >= 2200)       return 'C≡N / C≡C stretch'
  if (f >= 1900)       return 'C=C=O / allene stretch'
  if (f >= 1800)       return 'C=O stretch (anhydride)'
  if (f >= 1735)       return 'C=O stretch (ester)'
  if (f >= 1700)       return 'C=O stretch (ketone/aldehyde)'
  if (f >= 1660)       return 'C=O stretch (amide) / C=C'
  if (f >= 1620)       return 'C=C stretch (alkene)'
  if (f >= 1550)       return 'N-H bend / aromatic C=C'
  if (f >= 1450)       return 'CH₂/CH₃ bend'
  if (f >= 1350)       return 'C-H bend'
  if (f >= 1200)       return 'C-N / C-O / C-F stretch'
  if (f >= 1000)       return 'C-O-C / ring breathing'
  if (f >= 900)        return 'C-H out-of-plane / ring'
  if (f >= 700)        return 'C-H oop / CH₂ rock'
  if (f >= 500)        return 'C-Cl / C-Br / skeletal bend'
  if (f >= 200)        return 'Skeletal bend'
  if (f >= 10)         return 'Torsion / libration'
  return null
}

const TYPE_COLORS: Record<string, string> = {
  stretch:              'text-blue-300 bg-blue-900/30 border-blue-700/40',
  bend:                 'text-green-300 bg-green-900/30 border-green-700/40',
  torsion:              'text-yellow-300 bg-yellow-900/30 border-yellow-700/40',
  'translation/rotation': 'text-gray-400 bg-gray-700/20 border-gray-600/30',
  heuristic:            'text-gray-300 bg-gray-700/30 border-gray-600/40',
  imaginary:            'text-red-300 bg-red-900/30 border-red-700/40',
}

const TYPE_BAR_COLORS: Record<string, string> = {
  stretch: 'bg-blue-400',
  bend:    'bg-green-400',
  torsion: 'bg-yellow-400',
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function ContributionBars({ contributions }: { contributions: ModeClassification['contributions'] }) {
  return (
    <div className="space-y-1">
      {(['stretch', 'bend', 'torsion'] as const).map(type => (
        <div key={type} className="flex items-center gap-2">
          <span className="text-gray-400 w-12 capitalize text-xs">{type}</span>
          <div className="flex-1 bg-gray-700/60 rounded-full h-1.5">
            <div
              className={`${TYPE_BAR_COLORS[type]} h-full rounded-full transition-all`}
              style={{ width: `${contributions[type]}%` }}
            />
          </div>
          <span className="text-gray-400 text-xs w-8 text-right">{contributions[type]}%</span>
        </div>
      ))}
    </div>
  )
}

function TopCoordinates({ cls }: { cls: ModeClassification }) {
  const dominantType = cls.type
  if (dominantType === 'stretch') {
    return (
      <table className="text-xs w-full">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-normal pb-1">Bond</th>
            <th className="text-right font-normal pb-1">Δr (mÅ)</th>
          </tr>
        </thead>
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
  if (dominantType === 'bend') {
    return (
      <table className="text-xs w-full">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-normal pb-1">Angle</th>
            <th className="text-right font-normal pb-1">Δθ (°)</th>
          </tr>
        </thead>
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
  if (dominantType === 'torsion') {
    return (
      <table className="text-xs w-full">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-normal pb-1">Dihedral</th>
            <th className="text-right font-normal pb-1">Δφ (°)</th>
          </tr>
        </thead>
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
  const indexed = participation
    .map((p, i) => ({ p, label: atomSymbols ? `${atomSymbols[i]}${i + 1}` : `${i + 1}` }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 8)

  return (
    <div className="flex flex-wrap gap-1.5">
      {indexed.map(({ p, label }, i) => (
        p > 0.5 ? (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300">
            {label} <span className="text-gray-500">{p.toFixed(1)}%</span>
          </span>
        ) : null
      ))}
    </div>
  )
}

function ExpandedDetail({ cls, atomSymbols }: {
  cls: ModeClassification
  atomSymbols?: string[]
}) {
  return (
    <tr className="bg-gray-800/60">
      <td colSpan={5} className="px-6 py-3 border-b border-gray-700/40">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Contribution bars */}
          <div>
            <p className="text-gray-500 mb-2 uppercase tracking-wide text-xs">Contributions</p>
            <ContributionBars contributions={cls.contributions} />
          </div>

          {/* Top internal coordinates */}
          <div>
            <p className="text-gray-500 mb-2 uppercase tracking-wide text-xs">
              {cls.type === 'stretch' ? 'Top bonds' :
               cls.type === 'bend'    ? 'Top angles' :
               cls.type === 'torsion' ? 'Top dihedrals' : ''}
            </p>
            <TopCoordinates cls={cls} />
          </div>

          {/* Atom participation */}
          <div>
            <p className="text-gray-500 mb-2 uppercase tracking-wide text-xs">Atom participation</p>
            <AtomParticipation participation={cls.participation} atomSymbols={atomSymbols} />
          </div>
        </div>
      </td>
    </tr>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function VibrationalModesTable({
  jobId,
  frequencies: propFrequencies,
  intensities: propIntensities,
  className = ""
}: VibrationalModesTableProps) {
  const [modes, setModes]               = useState<ModeData[]>([])
  const [atomSymbols, setAtomSymbols]   = useState<string[] | undefined>()
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [animatingMode, setAnimatingMode] = useState<number | null>(null)
  const [viewMode, setViewMode]         = useState<'simple' | 'advanced'>('simple')
  const [expandedModes, setExpandedModes] = useState<Set<number>>(new Set())
  const { viewerRef }                   = useMolecularStore()

  useEffect(() => {
    const loadModes = async () => {
      if (!jobId && (!propFrequencies || !propIntensities)) {
        setModes([])
        return
      }

      // If only prop data provided (no API), build modes without classifications
      if (propFrequencies && propIntensities && !jobId) {
        setModes(propFrequencies.map((freq, idx) => ({
          index: idx,
          frequency: freq,
          intensity: propIntensities[idx] || 0,
          isImaginary: freq < 0,
        })))
        return
      }

      if (!jobId) return

      setLoading(true)
      setError(null)

      try {
        const data = await qcService.getNormalModes(jobId)
        const nm   = data.normal_modes

        if (!nm.frequencies) {
          setError('No mode data available')
          return
        }

        const freqs = propFrequencies || nm.frequencies
        const ints  = propIntensities || nm.intensities

        const modeData: ModeData[] = freqs.map((freq, idx) => ({
          index: idx,
          frequency: freq,
          intensity: ints?.[idx] || 0,
          isImaginary: freq < 0,
          classification: nm.classifications?.[idx] ?? undefined,
        }))

        setModes(modeData)
        if (nm.atom_symbols) setAtomSymbols(nm.atom_symbols)
      } catch (err) {
        console.error('Failed to load normal modes:', err)
        setError(err instanceof Error ? err.message : 'Failed to load modes')
      } finally {
        setLoading(false)
      }
    }

    loadModes()
  }, [jobId, propFrequencies, propIntensities])

  const handleModeClick = async (modeIndex: number) => {
    if (!jobId || !viewerRef) return
    setAnimatingMode(modeIndex)
    try {
      const trajectoryData = await qcService.getModeTrajectory(jobId, modeIndex, 60, 0.3)
      const handle = viewerRef as any
      if (typeof handle?.animateNormalMode === 'function') {
        await handle.animateNormalMode(trajectoryData.pdb_data, { loop: true, speed: 30 })
      } else if (typeof handle?.loadTrajectory === 'function') {
        await handle.loadTrajectory({ pdbData: trajectoryData.pdb_data }, 'pdb')
        handle.animate?.loop?.()
      }
    } catch (err) {
      console.error('Failed to animate mode:', err)
      setError(err instanceof Error ? err.message : 'Failed to animate mode')
    } finally {
      setAnimatingMode(null)
    }
  }

  const toggleExpand = (modeIndex: number) => {
    setExpandedModes(prev => {
      const next = new Set(prev)
      next.has(modeIndex) ? next.delete(modeIndex) : next.add(modeIndex)
      return next
    })
  }

  // ── Loading / error / empty states ──────────────────────────────────────

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-gray-800/50 rounded-lg ${className}`}>
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Loading vibrational modes...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-gray-800/50 rounded-lg ${className}`}>
        <div className="text-center text-red-400">
          <Info className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm">Failed to load modes</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (modes.length === 0) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-gray-800 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2" />
          <p>No vibrational modes available</p>
          <p className="text-sm text-gray-500 mt-1">Run a frequency calculation to generate normal modes</p>
        </div>
      </div>
    )
  }

  const filteredModes = modes.filter(m => Math.abs(m.frequency) > 10)
  const hasClassifications = filteredModes.some(m => m.classification)

  // ── Table ────────────────────────────────────────────────────────────────

  return (
    <div className={`bg-gray-800/50 rounded-lg p-4 ${className}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-white">Vibrational Modes</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {hasClassifications
              ? 'Assignments from internal coordinate displacement analysis'
              : 'Assignments based on IR frequency ranges (approximate)'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {filteredModes.length} mode{filteredModes.length !== 1 ? 's' : ''}
          </span>
          {/* Simple / Advanced toggle */}
          <div className="flex items-center gap-0.5 bg-gray-900/60 rounded-lg p-0.5 text-xs">
            {(['simple', 'advanced'] as const).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-3 py-1 rounded transition-colors ${
                  viewMode === v
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[460px] custom-scrollbar">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900/80 backdrop-blur-sm z-10">
            <tr className="border-b border-gray-700">
              {viewMode === 'advanced' && (
                <th className="w-6 py-2 px-1" />
              )}
              <th className="text-left py-2 px-3 text-gray-300 font-medium w-12">Mode</th>
              <th className="text-right py-2 px-3 text-gray-300 font-medium">Frequency</th>
              <th className="text-right py-2 px-3 text-gray-300 font-medium">Intensity</th>
              <th className="text-left py-2 px-3 text-gray-300 font-medium">Assignment</th>
              <th className="text-center py-2 px-3 text-gray-300 font-medium w-24">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredModes.map((mode) => {
              const cls         = mode.classification
              const isExpanded  = expandedModes.has(mode.index)

              // Determine assignment label + color key
              let assignLabel: string | null = null
              let colorKey = 'heuristic'
              if (cls && cls.type !== 'translation/rotation') {
                assignLabel = cls.primary_label
                colorKey    = cls.type
              } else if (mode.isImaginary) {
                assignLabel = 'Transition state / saddle point'
                colorKey    = 'imaginary'
              } else {
                assignLabel = classifyByFrequency(mode.frequency)
                colorKey    = 'heuristic'
              }

              return (
                <React.Fragment key={mode.index}>
                  <tr
                    className={`
                      border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors
                      ${animatingMode === mode.index ? 'bg-blue-900/20' : ''}
                      ${mode.isImaginary ? 'bg-red-900/10' : ''}
                      ${isExpanded ? 'bg-gray-800/40' : ''}
                    `}
                  >
                    {/* Expand chevron — advanced view only */}
                    {viewMode === 'advanced' && (
                      <td className="py-2 px-1 text-center">
                        {cls && cls.type !== 'translation/rotation' ? (
                          <button
                            onClick={() => toggleExpand(mode.index)}
                            className="text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="w-3.5 h-3.5 inline-block" />
                        )}
                      </td>
                    )}

                    {/* Mode number */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-medium">{mode.index + 1}</span>
                        {mode.isImaginary && (
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                        )}
                      </div>
                    </td>

                    {/* Frequency */}
                    <td className="text-right py-2 px-3">
                      <span className={`font-mono ${mode.isImaginary ? 'text-red-400' : 'text-gray-200'}`}>
                        {mode.frequency.toFixed(1)} cm⁻¹
                      </span>
                    </td>

                    {/* Intensity */}
                    <td className="text-right py-2 px-3">
                      <span className="text-gray-300 font-mono">{mode.intensity.toFixed(1)}</span>
                      <span className="text-gray-600 text-xs ml-1">km/mol</span>
                    </td>

                    {/* Assignment badge */}
                    <td className="py-2 px-3">
                      {assignLabel ? (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border ${TYPE_COLORS[colorKey] ?? TYPE_COLORS.heuristic}`}>
                          {assignLabel}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>

                    {/* Animate button */}
                    <td className="text-center py-2 px-3">
                      <button
                        onClick={() => handleModeClick(mode.index)}
                        disabled={animatingMode !== null || mode.isImaginary || !jobId}
                        className={`
                          px-3 py-1 rounded-md text-xs font-medium transition-colors
                          flex items-center gap-1 mx-auto
                          ${mode.isImaginary || !jobId
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : animatingMode === mode.index
                            ? 'bg-blue-600 text-white cursor-wait'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'}
                        `}
                        title={mode.isImaginary ? 'Cannot animate imaginary frequencies' : 'Animate this mode'}
                      >
                        {animatingMode === mode.index ? (
                          <><Loader2 className="w-3 h-3 animate-spin" />Loading...</>
                        ) : (
                          <><Play className="w-3 h-3" />Animate</>
                        )}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {viewMode === 'advanced' && isExpanded && cls && (
                    <ExpandedDetail cls={cls} atomSymbols={atomSymbols} />
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredModes.length < modes.length && (
        <div className="mt-2 text-xs text-gray-500">
          {modes.length - filteredModes.length} low-frequency mode(s) hidden (translational/rotational)
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-gray-700/50 flex flex-wrap gap-2">
        {([
          ['stretch',  'Stretch'],
          ['bend',     'Bend'],
          ['torsion',  'Torsion'],
          ['heuristic','Freq. range (approx.)'],
        ] as [string, string][]).map(([key, label]) => (
          <span key={key} className={`text-xs px-2 py-0.5 rounded border ${TYPE_COLORS[key]}`}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
