'use client'

import React, { useState, useRef, useEffect } from 'react'
import { QCResults } from '@/store/qc-store'
import { Info, CheckCircle, XCircle, AlertTriangle, FileText, ChevronDown, ExternalLink } from 'lucide-react'

interface QCResultsTableProps {
  results: QCResults | null
  className?: string
  jobId?: string
  onViewLog?: (jobId: string, filename?: string, title?: string) => void
  orcaJobType?: string
  onViewStructure?: () => void
}

interface KPIItem {
  category: string
  label: string
  value: string | number | null
  unit: string
  description: string
  interpretation?: string
  status?: 'good' | 'warning' | 'error' | 'info'
}

function LogMenu({ jobId, results, onViewLog }: { jobId: string, results: QCResults, onViewLog: (id: string, f?: string, t?: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuRef])

  if (results.fukui) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-xs font-medium border border-gray-700"
        >
          <FileText className="w-3.5 h-3.5" />
          View Logs
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>
        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 overflow-hidden">
            <button
              onClick={() => { onViewLog(jobId, 'neutral.out', 'Neutral Log'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-b border-gray-700/50"
            >
              Neutral Species
            </button>
            <button
              onClick={() => { onViewLog(jobId, 'anion.out', 'Anion Log'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-b border-gray-700/50"
            >
              Anion Species
            </button>
            <button
              onClick={() => { onViewLog(jobId, 'cation.out', 'Cation Log'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              Cation Species
            </button>
          </div>
        )}
      </div>
    )
  }

  if (results.conformers && results.conformers.length > 0) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-xs font-medium border border-gray-700"
        >
          <FileText className="w-3.5 h-3.5" />
          View Logs
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>
        {isOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 max-h-64 overflow-y-auto custom-scrollbar">
            {results.conformers.map((conf, idx) => (
              <button
                key={conf.conf_id}
                onClick={() => { 
                  const filename = conf.conf_id !== undefined ? `conf_${conf.conf_id}.out` : `conf_${idx}.out`;
                  onViewLog(jobId, filename, `Conformer ${conf.conf_id} Log`); 
                  setIsOpen(false); 
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-b border-gray-700/50 last:border-0"
              >
                <div className="flex justify-between items-center">
                  <span>Conformer {conf.conf_id}</span>
                  <span className="text-xs text-gray-500">{conf.rel_energy_kcal.toFixed(2)} kcal</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onViewLog(jobId)}
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors text-xs font-medium border border-gray-700"
      title="View ORCA output log file"
    >
      <FileText className="w-3.5 h-3.5" />
      View Log
    </button>
  )
}

export function QCResultsTable({ results, className = "", jobId, onViewLog, orcaJobType, onViewStructure }: QCResultsTableProps) {
  // Check if there are any specialized results (these are displayed separately)
  // Use type assertion to check for properties that may exist on the results object
  const resultsAny = results as any
  const hasSpecializedResults = results && (
    results.fukui || 
    results.conformers || 
    resultsAny?.ir_spectrum ||
    results.ir_frequencies ||
    results.normal_modes
  )

  if (!results) {
    return (
      <div className={`bg-gray-800 rounded-lg p-6 ${className}`}>
        <div className="text-center text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2" />
          <p>No quantum chemistry results available</p>
          <p className="text-sm text-gray-500 mt-1">
            Submit a QC calculation to see molecular properties
          </p>
        </div>
      </div>
    )
  }

  // Helper function to format numbers
  const formatValue = (value: number | undefined, decimals: number = 3): string => {
    if (value === undefined || value === null) return 'N/A'
    return value.toFixed(decimals)
  }

  // Helper function to get HOMO/LUMO interpretation
  const getOrbitalInterpretation = (homo?: number, lumo?: number, gap?: number) => {
    return undefined
  }

  // Helper function to get dipole interpretation
  const getDipoleInterpretation = (dipole?: number) => {
    if (!dipole) return undefined

    if (dipole < 1.0) return 'Low polarity (lipophilic)'
    if (dipole > 4.0) return 'High polarity (hydrophilic)'
    return 'Moderate polarity'
  }

  // Helper function to get solvation interpretation
  const getSolvationInterpretation = (deltaG?: number) => {
    if (!deltaG) return undefined

    if (deltaG < -10) return 'Highly water-soluble'
    if (deltaG > 0) return 'Poorly water-soluble'
    return 'Moderately water-soluble'
  }

  // Build KPI data array
  const kpiData: KPIItem[] = [
    // Energy
    {
      category: 'Energy',
      label: 'Final SCF Energy',
      value: formatValue(results.final_energy_hartree, 6),
      unit: 'Hartree',
      description: 'Total electronic energy from self-consistent field calculation',
      interpretation: results.final_energy_hartree ? 'Calculation converged successfully' : undefined,
      status: 'good' as 'good' | 'warning' | 'error' | 'info'
    },

    // Frontier Molecular Orbitals
    {
      category: 'Frontier Molecular Orbitals',
      label: 'HOMO Energy',
      value: formatValue(results.homo_eV),
      unit: 'eV',
      description: 'Highest Occupied Molecular Orbital energy (electron-donating ability)',
      interpretation: undefined,
      status: 'info' as 'good' | 'warning' | 'error' | 'info'
    },
    {
      category: 'Frontier Molecular Orbitals',
      label: 'LUMO Energy',
      value: formatValue(results.lumo_eV),
      unit: 'eV',
      description: 'Lowest Unoccupied Molecular Orbital energy (electron-accepting ability)',
      interpretation: undefined,
      status: 'info' as 'good' | 'warning' | 'error' | 'info'
    },
    {
      category: 'Frontier Molecular Orbitals',
      label: 'HOMO-LUMO Gap',
      value: formatValue(results.gap_eV),
      unit: 'eV',
      description: 'Energy gap indicating kinetic stability and reactivity',
      interpretation: getOrbitalInterpretation(results.homo_eV, results.lumo_eV, results.gap_eV),
      status: results.gap_eV ? (results.gap_eV < 3.0 ? 'warning' : results.gap_eV > 5.0 ? 'info' : 'good') as 'good' | 'warning' | 'error' | 'info' : undefined
    },

    // Electrostatics & Polarity
    {
      category: 'Electrostatics & Polarity',
      label: 'Dipole Moment',
      value: formatValue(results.dipole_magnitude_debye),
      unit: 'Debye',
      description: 'Overall molecular polarity affecting solubility and permeability',
      interpretation: getDipoleInterpretation(results.dipole_magnitude_debye),
      status: results.dipole_magnitude_debye ?
        (results.dipole_magnitude_debye > 4.0 ? 'warning' : 'good') as 'good' | 'warning' | 'error' | 'info' : undefined
    },
    {
      category: 'Electrostatics & Polarity',
      label: 'CHELPG Charges',
      value: results.chelpg_charges ? `${results.chelpg_charges.length} atoms` : 'N/A',
      unit: '',
      description: 'ESP-derived partial charges for accurate electrostatic modeling (see charge table below)',
      interpretation: undefined,
      status: 'info' as 'good' | 'warning' | 'error' | 'info'
    },
    {
      category: 'Electrostatics & Polarity',
      label: 'Mulliken Charges',
      value: results.mulliken_charges ? `${results.mulliken_charges.length} atoms` : 'N/A',
      unit: '',
      description: 'Mulliken population analysis partial charges (see charge table below)',
      interpretation: results.mulliken_charges ? 'Atomic charge distribution available' : undefined,
      status: (results.mulliken_charges ? 'good' : 'info') as 'good' | 'warning' | 'error' | 'info'
    },

    // Thermodynamics
    {
      category: 'Thermodynamics',
      label: 'Gibbs Free Energy',
      value: formatValue(results.gibbs_free_energy_hartree, 6),
      unit: 'Hartree',
      description: 'Total free energy for stability comparison and Boltzmann weighting',
      interpretation: results.is_valid_minimum === false ? 'Invalid geometry (transition state)' :
        results.is_valid_minimum === true ? 'Valid minimum energy structure' : undefined,
      status: (results.is_valid_minimum === false ? 'error' :
        results.is_valid_minimum === true ? 'good' : 'info') as 'good' | 'warning' | 'error' | 'info'
    },
    {
      category: 'Thermodynamics',
      label: 'Enthalpy',
      value: formatValue(results.enthalpy_hartree, 6),
      unit: 'Hartree',
      description: 'Total enthalpy including thermal corrections',
      status: 'info' as 'good' | 'warning' | 'error' | 'info'
    },
    {
      category: 'Thermodynamics',
      label: 'Entropy',
      value: formatValue(results.entropy_hartree_per_kelvin, 6),
      unit: 'Hartree/K',
      description: 'Molecular entropy from vibrational, rotational, and translational modes',
      status: 'info' as 'good' | 'warning' | 'error' | 'info'
    },

    // Solvation
    {
      category: 'Solvation',
      label: 'Solvation Free Energy',
      value: formatValue(results.delta_g_solv_kcal_mol, 2),
      unit: 'kcal/mol',
      description: 'Free energy of solvation in water (aqueous solubility predictor)',
      interpretation: getSolvationInterpretation(results.delta_g_solv_kcal_mol),
      status: results.delta_g_solv_kcal_mol ?
        (results.delta_g_solv_kcal_mol < -10 ? 'good' : results.delta_g_solv_kcal_mol > 0 ? 'warning' : 'info') as 'good' | 'warning' | 'error' | 'info' : undefined
    },

    // Vibrational Analysis
    {
      category: 'Vibrational Analysis',
      label: 'IR Frequencies',
      value: results.ir_frequencies ? `${results.ir_frequencies.length} modes` : 'N/A',
      unit: '',
      description: 'Vibrational frequencies for IR spectrum and structure validation',
      interpretation: results.ir_frequencies ? 'IR spectrum available' : undefined,
      status: (results.ir_frequencies ? 'good' : 'info') as 'good' | 'warning' | 'error' | 'info'
    },
  ].filter(item => item.value !== 'N/A')

  // Group by category
  const groupedData = kpiData.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item)
    return acc
  }, {} as Record<string, KPIItem[]>)

  // Filter out categories that have no valid data (all items were filtered out)
  // Only show categories that have at least one item with a non-N/A value
  const categoriesWithData = Object.keys(groupedData).filter(category => {
    return groupedData[category].length > 0
  })

  // Determine job characteristics from the actual ORCA task type
  // orcaJobType is now the raw ORCA task ("OPT", "SP", "OPT_FREQ", etc.)
  // Only show the "Optimized Structure" banner when geometry was actually optimized
  const isGeomOpt = orcaJobType === 'OPT' || orcaJobType === 'OPT_FREQ'

  // For SP jobs, reorder categories: FMO first, Electrostatics second, Energy last
  const isSP = orcaJobType === 'SP'
  if (isSP) {
    const spOrder = [
      'Frontier Molecular Orbitals',
      'Electrostatics & Polarity',
      'Thermodynamics',
      'Solvation',
      'Vibrational Analysis',
      'Energy',
    ]
    categoriesWithData.sort((a, b) => {
      const ia = spOrder.indexOf(a)
      const ib = spOrder.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'good': return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      case 'error': return <XCircle className="w-4 h-4 text-red-400" />
      default: return <Info className="w-4 h-4 text-blue-400" />
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'good': return 'text-green-400'
      case 'warning': return 'text-yellow-400'
      case 'error': return 'text-red-400'
      default: return 'text-blue-400'
    }
  }

  // If there are only specialized results and no standard QC results, don't render the full table.
  // But still show the header (with log button) and the optimized structure banner if applicable.
  if (categoriesWithData.length === 0 && hasSpecializedResults) {
    if (isGeomOpt || (jobId && onViewLog)) {
      return (
        <div className={`space-y-4 ${className}`}>
          {jobId && onViewLog && (
            <div className="flex items-center justify-between pb-3 border-b border-gray-700/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/20 rounded">
                  <Info className="h-4 w-4 text-blue-400" />
                </div>
                <h3 className="text-base font-semibold text-white">Quantum Chemistry Results</h3>
              </div>
              <LogMenu jobId={jobId} results={results} onViewLog={onViewLog} />
            </div>
          )}
          {isGeomOpt && (
            <div className="p-4 bg-gradient-to-r from-blue-900/40 to-blue-800/20 border border-blue-600/40 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1 bg-blue-500/20 rounded">
                      <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <span className="text-sm font-semibold text-blue-300">Optimized Structure</span>
                  </div>
                  {results.final_energy_hartree !== undefined && (
                    <p className="text-xs text-gray-300 ml-7">
                      Final energy: {results.final_energy_hartree.toFixed(6)} Hartree
                    </p>
                  )}
                  {results.is_valid_minimum !== undefined && (
                    <p className={`text-xs font-medium ml-7 mt-0.5 ${results.is_valid_minimum ? 'text-green-400' : 'text-red-400'}`}>
                      {results.is_valid_minimum ? '✓ Valid minimum' : '✗ Not a minimum (imaginary frequencies)'}
                    </p>
                  )}
                </div>
                {onViewStructure && (
                  <button
                    onClick={onViewStructure}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white rounded-lg transition-colors text-xs font-medium border border-blue-600/40 whitespace-nowrap"
                  >
                    View in Molstar
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="pb-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 rounded">
              <Info className="h-4 w-4 text-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Quantum Chemistry Results</h3>
          </div>
          {jobId && onViewLog && (
            <LogMenu jobId={jobId} results={results} onViewLog={onViewLog} />
          )}
        </div>
      </div>

      {/* Optimized Structure Banner — shown for OPT/OPT_FREQ jobs */}
      {isGeomOpt && (
        <div className="p-4 bg-gradient-to-r from-blue-900/40 to-blue-800/20 border border-blue-600/40 rounded-xl mb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1 bg-blue-500/20 rounded">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-blue-300">Optimized Structure</span>
              </div>
              {results.final_energy_hartree !== undefined && (
                <p className="text-xs text-gray-300 ml-7">
                  Final energy: {results.final_energy_hartree.toFixed(6)} Hartree
                </p>
              )}
              {results.is_valid_minimum !== undefined && (
                <p className={`text-xs font-medium ml-7 mt-0.5 ${results.is_valid_minimum ? 'text-green-400' : 'text-red-400'}`}>
                  {results.is_valid_minimum ? '✓ Valid minimum' : '✗ Not a minimum (imaginary frequencies)'}
                </p>
              )}
            </div>
            {onViewStructure && (
              <button
                onClick={onViewStructure}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white rounded-lg transition-colors text-xs font-medium border border-blue-600/40 whitespace-nowrap"
              >
                View in Molstar
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {categoriesWithData.length === 0 && !hasSpecializedResults ? (
          <div className="text-center text-gray-400 py-8">
            <Info className="w-8 h-8 mx-auto mb-2" />
            <p>No results available for this calculation</p>
          </div>
        ) : categoriesWithData.length === 0 ? (
          // Has specialized results but no standard QC results - don't show anything here
          // The specialized results are displayed in separate components
          null
        ) : (
          categoriesWithData.map((category) => {
            const items = groupedData[category]
            const displayCategory = isSP && category === 'Energy' ? 'Reference Energy' : category
            return (
          <div key={category} className="space-y-3">
            <div className="flex items-center gap-2.5">
              {category === 'Energy' && (
                <div className="p-1.5 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                </div>
              )}
              {category === 'Frontier Molecular Orbitals' && (
                <div className="p-1.5 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-blue-400" />
                </div>
              )}
              {category === 'Electrostatics & Polarity' && (
                <div className="p-1.5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-purple-400" />
                </div>
              )}
              {category === 'Thermodynamics' && (
                <div className="p-1.5 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-orange-400" />
                </div>
              )}
              {category === 'Solvation' && (
                <div className="p-1.5 bg-gradient-to-br from-teal-500/20 to-green-500/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-teal-400" />
                </div>
              )}
              {category === 'Vibrational Analysis' && (
                <div className="p-1.5 bg-gradient-to-br from-indigo-500/20 to-blue-500/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-indigo-400" />
                </div>
              )}
              <h4 className={`text-sm font-semibold ${
                category === 'Energy' ? 'text-green-400' :
                category === 'Frontier Molecular Orbitals' ? 'text-blue-400' :
                category === 'Electrostatics & Polarity' ? 'text-purple-400' :
                category === 'Thermodynamics' ? 'text-orange-400' :
                category === 'Solvation' ? 'text-teal-400' :
                'text-indigo-400'
              }`}>{displayCategory}</h4>
            </div>

            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex justify-between items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-300 font-medium leading-relaxed block">{item.label}</span>
                    <span className="text-xs text-gray-500 block mt-0.5">{item.description}</span>
                    {item.interpretation && (
                      <span className={`text-xs ${getStatusColor(item.status)} font-medium block mt-1`}>
                        {item.interpretation}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm text-white font-semibold">{item.value}</span>
                    {item.unit && <span className="text-xs text-gray-500 mt-0.5">{item.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
            )
          })
        )}
      </div>

    </div>
  )
}
