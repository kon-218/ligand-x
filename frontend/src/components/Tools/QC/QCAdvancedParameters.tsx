'use client'

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import type { QCPreset } from '@/store/qc-store'
import { InputFilePreviewModal } from '@/components/QC/InputFilePreviewModal'
import { qcService, type SubmitJobRequest } from '@/lib/qc-service'

// Custom Searchable Select Component
interface SearchableSelectProps {
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

function SearchableSelect({ value, options, onChange, placeholder, className = '', disabled = false }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options
    const term = searchTerm.toLowerCase()
    return options.filter(opt => opt.toLowerCase().includes(term))
  }, [options, searchTerm])

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
      return
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      inputRef.current?.focus()
    }
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
  }, [isOpen, disabled])

  const handleSelect = (option: string) => {
    onChange(option)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus-within:outline-none focus-within:border-blue-500 flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={value ? 'text-white' : 'text-gray-400'}>
          {value || placeholder || 'Select...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${value === option ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  {option}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-400 text-center">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Interface (kept compatible with backend) ───────────────────────────────

export interface QCAdvancedParameters {
  charge: number
  multiplicity: number
  method: string
  basis_set: string
  job_type: 'SP' | 'OPT' | 'FREQ' | 'OPT_FREQ' | 'OPTTS'
  compute_frequencies: boolean
  n_procs: number
  memory_mb: number
  solvation: string
  calculate_properties: boolean
  extra_keywords: string

  // Approximations & Accuracy
  dispersion: 'none' | 'D3BJ' | 'D4'
  use_rijcosx: boolean

  // SCF & Convergence
  scf_convergence: 'Normal' | 'Tight' | 'VeryTight'
  convergence_strategy: 'DIIS' | 'KDIIS' | 'SOSCF'
  use_slow_conv: boolean

  // Integration Grid
  integration_grid: 'DefGrid2' | 'DefGrid3' | 'GridX'

  // Broken Symmetry
  broken_symmetry_atoms: string

  // Thermodynamics
  temperature: number
  pressure: number

  // Coupled cluster specific (only used when method is CC)
  cc_max_iter?: number        // Max CCSD iterations (default: ORCA's 50)
  cc_use_qros?: boolean       // Use QRO orbitals for open-shell (recommended for DLPNO)
  cc_density?: 'none' | 'linearized' | 'unrelaxed' | 'orbopt'  // CC density type
  cc_max_diis?: number        // Max DIIS vectors (default: 7; increase for difficult convergence)
  cc_level_shift?: number     // Level shift for coefficient updates (default: 0.2)

  // Properties (granular)
  properties: {
    dipole: boolean
    quadrupole: boolean
    chelpg: boolean
    mulliken: boolean
    bond_orders: boolean
    nbo: boolean
    nmr: boolean
    td_dft: boolean
    td_dft_roots: number
    orbitals: boolean
  }
}

interface QCAdvancedParametersProps {
  parameters: QCAdvancedParameters
  onChange: (parameters: QCAdvancedParameters) => void
  onBack: () => void
  moleculeData?: string
  preset: QCPreset | null
  onPreviewInput?: (inputFile: string) => void
}

// ─── Curated options ────────────────────────────────────────────────────────

const COMMON_METHODS = [
  // Composite (no basis needed)
  'r2SCAN-3c', 'B97-3c', 'wB97X-3c', 'HF-3c', 'PBEh-3c',
  // Hybrid DFT
  'B3LYP', 'PBE0', 'wB97X-D3', 'wB97X-D4', 'CAM-B3LYP', 'M06-2X', 'TPSSH',
  // GGA
  'PBE', 'BLYP', 'BP86', 'TPSS', 'r2SCAN',
  // Range-separated
  'wB97X', 'wB97X-V', 'wB97M-D3BJ', 'LC-BLYP',
  // Double-hybrid
  'B2PLYP', 'B2GP-PLYP',
  // Wavefunction
  'HF', 'MP2', 'RI-MP2', 'DLPNO-MP2',
  // Coupled cluster
  'CCSD', 'CCSD(T)', 'CCSD(T)-F12',
  'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
  // xTB
  'GFN2-xTB', 'GFN-xTB', 'GFN-FF',
  // Semiempirical
  'PM3', 'AM1',
]

const COMMON_BASIS_SETS = [
  // def2 family (ORCA native, recommended)
  'def2-SVP', 'def2-TZVP', 'def2-TZVPP', 'def2-QZVP', 'def2-QZVPP',
  'def2-mTZVP', 'def2-mTZVPP', 'def2-TZVPD', 'def2-TZVPPD',
  // Dunning
  'cc-pVDZ', 'cc-pVTZ', 'cc-pVQZ',
  'aug-cc-pVDZ', 'aug-cc-pVTZ', 'aug-cc-pVQZ',
  // Pople
  '6-31G*', '6-31G**', '6-311G*', '6-311G**', '6-311+G**',
]

const SOLVENTS = [
  { value: '', label: 'None (Gas Phase)' },
  { value: 'WATER', label: 'Water' },
  { value: 'METHANOL', label: 'Methanol' },
  { value: 'ETHANOL', label: 'Ethanol' },
  { value: 'DMSO', label: 'DMSO' },
  { value: 'ACETONITRILE', label: 'Acetonitrile' },
  { value: 'THF', label: 'THF' },
  { value: 'CHLOROFORM', label: 'Chloroform' },
  { value: 'TOLUENE', label: 'Toluene' },
  { value: 'HEXANE', label: 'Hexane' },
]

const JOB_TYPES = [
  { value: 'SP', label: 'Single Point' },
  { value: 'OPT', label: 'Geometry Optimization' },
  { value: 'OPT_FREQ', label: 'Optimization + Frequencies' },
  { value: 'FREQ', label: 'Frequency Analysis' },
  { value: 'OPTTS', label: 'Transition State' },
] as const

// Methods whose basis set is built-in
const METHODS_WITHOUT_BASIS = new Set([
  'GFN0-XTB', 'GFN-XTB', 'GFN1-XTB', 'GFN2-XTB', 'GFN-FF',
  'XTB0', 'XTB1', 'XTB2', 'XTBFF',
  'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
  'PM3', 'AM1', 'MNDO', 'INDO', 'CNDO', 'NDDO',
  'HF-3C', 'PBEH-3C', 'B97-3C', 'R2SCAN-3C', 'WB97X-3C',
])

// Coupled cluster methods (all variants)
const COUPLED_CLUSTER_METHODS = new Set([
  'CCSD', 'CCSD(T)', 'CCSD-F12', 'CCSD(T)-F12',
  'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
  'QCISD', 'QCISD(T)',
])

// DLPNO-CC methods that benefit from RIJCOSX on the HF step
const DLPNO_CC_METHODS = new Set([
  'DLPNO-CCSD', 'DLPNO-CCSD(T)', 'DLPNO-CCSD(T1)',
])

// ─── Component ──────────────────────────────────────────────────────────────

export function QCAdvancedParameters({
  preset,
  parameters,
  onChange,
  onBack,
  moleculeData,
  onPreviewInput,
}: QCAdvancedParametersProps) {
  const [maxCpuCores, setMaxCpuCores] = useState<number>(64)
  const [showAdvancedMethod, setShowAdvancedMethod] = useState(false)
  const [showThermoSettings, setShowThermoSettings] = useState(false)

  // Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRawContent, setPreviewRawContent] = useState<string | undefined>()
  const [previewLoadingRaw, setPreviewLoadingRaw] = useState(false)

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch('/api/qc/system-info')
        if (response.ok) {
          const data = await response.json()
          setMaxCpuCores(data.max_cpu_cores || 64)
        }
      } catch { /* ignore */ }
    }
    fetchSystemInfo()
  }, [])

  const handleChange = (field: keyof QCAdvancedParameters, value: any) => {
    onChange({ ...parameters, [field]: value })
  }

  const handlePropertyChange = (property: keyof QCAdvancedParameters['properties'], value: boolean | number) => {
    onChange({ ...parameters, properties: { ...parameters.properties, [property]: value } })
  }

  const methodRequiresBasisSet = useMemo(() => {
    return !METHODS_WITHOUT_BASIS.has(parameters.method.toUpperCase())
  }, [parameters.method])

  const memoryPerCore = useMemo(() => Math.floor(parameters.memory_mb / parameters.n_procs), [parameters.memory_mb, parameters.n_procs])

  const shouldSuggestDispersion = useMemo(() => {
    const m = parameters.method.toUpperCase()
    return (m.includes('B3LYP') || m.includes('PBE') || m.includes('M06')) && parameters.dispersion === 'none'
  }, [parameters.method, parameters.dispersion])

  const isCCMethod = useMemo(() => COUPLED_CLUSTER_METHODS.has(parameters.method.toUpperCase()), [parameters.method])
  const isDLPNOCC = useMemo(() => DLPNO_CC_METHODS.has(parameters.method.toUpperCase()), [parameters.method])

  // Load raw ORCA input file from backend
  const handleLoadRaw = useCallback(async () => {
    if (!moleculeData) {
      setPreviewRawContent('# Error: No molecule loaded.\n# Please load a molecule first.')
      return
    }
    setPreviewLoadingRaw(true)
    try {
      const request: SubmitJobRequest = { molecule_xyz: moleculeData, ...parameters }
      const response = await qcService.previewJob(request)
      setPreviewRawContent(response.input_file_content)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      setPreviewRawContent(`# Error generating preview:\n# ${msg}`)
    } finally {
      setPreviewLoadingRaw(false)
    }
  }, [moleculeData, parameters])

  const handleOpenPreview = () => {
    setPreviewRawContent(undefined)
    setPreviewOpen(true)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
            title="Back"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <h3 className="text-base font-semibold text-white">Custom Parameters</h3>
        </div>
        <button
          onClick={handleOpenPreview}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
      </div>

      {/* ── Section 1: Calculation ─────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg p-3 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Calculation</h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Charge</label>
            <input
              type="number"
              value={parameters.charge}
              onChange={(e) => handleChange('charge', parseInt(e.target.value) || 0)}
              min={-10}
              max={10}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Multiplicity</label>
            <input
              type="number"
              value={parameters.multiplicity}
              onChange={(e) => handleChange('multiplicity', Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={10}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Task</label>
            <select
              value={parameters.job_type}
              onChange={(e) => handleChange('job_type', e.target.value as QCAdvancedParameters['job_type'])}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            >
              {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Solvent (CPCM)</label>
          <select
            value={parameters.solvation}
            onChange={(e) => handleChange('solvation', e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
          >
            {SOLVENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {(parameters.job_type === 'OPT_FREQ' || parameters.job_type === 'FREQ') && (
          <div>
            <button
              onClick={() => setShowThermoSettings(!showThermoSettings)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              {showThermoSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Thermodynamic conditions
            </button>
            {showThermoSettings && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Temperature (K)</label>
                  <input
                    type="number"
                    value={parameters.temperature}
                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value) || 298.15)}
                    step={0.1}
                    className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Pressure (atm)</label>
                  <input
                    type="number"
                    value={parameters.pressure}
                    onChange={(e) => handleChange('pressure', parseFloat(e.target.value) || 1.0)}
                    step={0.1}
                    className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Method ──────────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg p-3 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Method</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Functional / Method</label>
            <SearchableSelect
              value={parameters.method}
              options={COMMON_METHODS}
              onChange={(v) => handleChange('method', v)}
              placeholder="e.g., B3LYP, PBE0"
            />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${methodRequiresBasisSet ? 'text-gray-300' : 'text-gray-500'}`}>
              Basis Set{!methodRequiresBasisSet && <span className="ml-1">(not required)</span>}
            </label>
            <SearchableSelect
              value={parameters.basis_set}
              options={COMMON_BASIS_SETS}
              onChange={(v) => handleChange('basis_set', v)}
              placeholder={methodRequiresBasisSet ? 'e.g., def2-SVP' : 'Not required'}
              disabled={!methodRequiresBasisSet}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Dispersion
              {shouldSuggestDispersion && <span className="ml-1 text-yellow-400">(recommended)</span>}
            </label>
            <select
              value={parameters.dispersion}
              onChange={(e) => handleChange('dispersion', e.target.value as QCAdvancedParameters['dispersion'])}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="none">None</option>
              <option value="D3BJ">D3BJ (Standard)</option>
              <option value="D4">D4 (Better)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">SCF Convergence</label>
            <select
              value={parameters.scf_convergence}
              onChange={(e) => handleChange('scf_convergence', e.target.value as QCAdvancedParameters['scf_convergence'])}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="Normal">Normal</option>
              <option value="Tight">Tight</option>
              <option value="VeryTight">Very Tight</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={parameters.use_rijcosx}
            onChange={(e) => handleChange('use_rijcosx', e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-300">RIJCOSX Acceleration</span>
            <p className="text-xs text-gray-500">10×–100× speedup for hybrid DFT. Recommended.</p>
          </div>
        </label>

        {/* Advanced method options */}
        <button
          onClick={() => setShowAdvancedMethod(!showAdvancedMethod)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {showAdvancedMethod ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Advanced method settings
        </button>
        {showAdvancedMethod && (
          <div className="space-y-2 pt-1 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Integration Grid</label>
                <select
                  value={parameters.integration_grid}
                  onChange={(e) => handleChange('integration_grid', e.target.value as QCAdvancedParameters['integration_grid'])}
                  className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="DefGrid2">DefGrid2 (Default)</option>
                  <option value="DefGrid3">DefGrid3 (Better)</option>
                  <option value="GridX">GridX (COSX)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Convergence Strategy</label>
                <select
                  value={parameters.convergence_strategy}
                  onChange={(e) => handleChange('convergence_strategy', e.target.value as QCAdvancedParameters['convergence_strategy'])}
                  className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="DIIS">DIIS (Standard)</option>
                  <option value="KDIIS">KDIIS (Metals)</option>
                  <option value="SOSCF">SOSCF (Robust)</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={parameters.use_slow_conv}
                onChange={(e) => handleChange('use_slow_conv', e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">Slow Convergence Mode</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Extra Keywords</label>
              <input
                type="text"
                value={parameters.extra_keywords}
                onChange={(e) => handleChange('extra_keywords', e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g., CPCM NoPop (space-separated ORCA keywords)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Broken Symmetry Atoms</label>
              <input
                type="text"
                value={parameters.broken_symmetry_atoms}
                onChange={(e) => handleChange('broken_symmetry_atoms', e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g., 1 2 3 (atom indices, for radicals)"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Coupled Cluster Settings (shown only when CC method selected) ── */}
      {isCCMethod && (
        <div className="bg-gray-800 rounded-lg p-3 space-y-3 border border-amber-700/40">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Coupled Cluster Settings</h4>
            {isDLPNOCC && (
              <span className="text-xs bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded">DLPNO — /C basis auto-added</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {isDLPNOCC
              ? 'DLPNO-CCSD(T) scales linearly — suitable for larger molecules. A /C auxiliary basis will be added automatically. TightSCF is enforced.'
              : 'Canonical CCSD(T) scales as O(N⁷). Best for small molecules (≤10 heavy atoms). TightSCF is enforced.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Max CC Iterations
                <span className="text-gray-500 ml-1">(default: 50)</span>
              </label>
              <input
                type="number"
                value={parameters.cc_max_iter ?? ''}
                onChange={(e) => handleChange('cc_max_iter', e.target.value ? parseInt(e.target.value) : undefined)}
                min={10}
                max={500}
                placeholder="50"
                className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Max DIIS Vectors
                <span className="text-gray-500 ml-1">(default: 7)</span>
              </label>
              <input
                type="number"
                value={parameters.cc_max_diis ?? ''}
                onChange={(e) => handleChange('cc_max_diis', e.target.value ? parseInt(e.target.value) : undefined)}
                min={3}
                max={50}
                placeholder="7"
                className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Level Shift (Lshift)
                <span className="text-gray-500 ml-1">(default: 0.2)</span>
              </label>
              <input
                type="number"
                value={parameters.cc_level_shift ?? ''}
                onChange={(e) => handleChange('cc_level_shift', e.target.value ? parseFloat(e.target.value) : undefined)}
                min={0}
                max={2}
                step={0.05}
                placeholder="0.2"
                className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">CC Density</label>
              <select
                value={parameters.cc_density ?? 'none'}
                onChange={(e) => handleChange('cc_density', e.target.value as QCAdvancedParameters['cc_density'])}
                className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-amber-500"
              >
                <option value="none">None (energies only)</option>
                <option value="linearized">Linearized (fast)</option>
                <option value="unrelaxed">Unrelaxed (CCSD only)</option>
                <option value="orbopt">Orbital-optimized (OO-CCD)</option>
              </select>
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={parameters.cc_use_qros ?? false}
              onChange={(e) => handleChange('cc_use_qros', e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="text-xs font-medium text-gray-300">Use QRO Orbitals (UseQROs)</span>
              <p className="text-xs text-gray-500">
                Transforms UHF alpha/beta to quasi-restricted orbitals, removing spin contamination.
                Recommended for open-shell systems. Default for DLPNO-CCSD(T).
              </p>
            </div>
          </label>
          <div className="p-2 bg-amber-900/20 border border-amber-700/30 rounded text-xs text-amber-300">
            Memory note: DLPNO jobs need ~6 GB per core (<code className="font-mono">MaxCore</code> is per core).
            Canonical CCSD(T) may need significantly more for larger systems.
          </div>
        </div>
      )}

      {/* ── Section 3: Properties ─────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg p-3 space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Properties</h4>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'chelpg', label: 'CHELPG Charges', description: 'ESP-fitted atomic charges' },
            { key: 'mulliken', label: 'Mulliken Charges', description: 'Population analysis' },
            { key: 'dipole', label: 'Dipole Moment', description: 'Molecular dipole vector' },
            { key: 'orbitals', label: 'Molecular Orbitals', description: 'HOMO/LUMO for 3D visualization' },
            { key: 'nmr', label: 'NMR Shielding', description: 'Chemical shielding tensors' },
            { key: 'nbo', label: 'NBO Analysis', description: 'Natural bond orbital charges' },
          ].map(({ key, label, description }) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={parameters.properties[key as keyof QCAdvancedParameters['properties']] as boolean}
                onChange={(e) => handlePropertyChange(key as keyof QCAdvancedParameters['properties'], e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-medium text-gray-300">{label}</span>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
            </label>
          ))}
        </div>
        {/* TD-DFT */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={parameters.properties.td_dft}
              onChange={(e) => handlePropertyChange('td_dft', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-xs font-medium text-gray-300">TD-DFT (Excited States)</span>
              <p className="text-xs text-gray-500">UV/Vis absorption spectrum</p>
            </div>
          </label>
          {parameters.properties.td_dft && (
            <div className="ml-6 mt-1.5">
              <label className="block text-xs font-medium text-gray-300 mb-1">Number of roots</label>
              <input
                type="number"
                value={parameters.properties.td_dft_roots}
                onChange={(e) => handlePropertyChange('td_dft_roots', parseInt(e.target.value) || 5)}
                min={1}
                max={50}
                className="w-24 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Resources ──────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg p-3 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Resources</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              CPU Cores <span className="text-gray-500">(max {maxCpuCores})</span>
            </label>
            <input
              type="number"
              value={parameters.n_procs}
              onChange={(e) => handleChange('n_procs', Math.min(Math.max(1, parseInt(e.target.value) || 1), maxCpuCores))}
              min={1}
              max={maxCpuCores}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Total Memory (MB)
              <span className="text-gray-500 ml-1">({memoryPerCore} MB/core)</span>
            </label>
            <input
              type="number"
              value={parameters.memory_mb}
              onChange={(e) => handleChange('memory_mb', Math.max(1000, parseInt(e.target.value) || 4000))}
              min={1000}
              max={500000}
              step={1000}
              className="w-full px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <InputFilePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        parameters={parameters}
        rawContent={previewRawContent}
        isLoadingRaw={previewLoadingRaw}
        onLoadRaw={handleLoadRaw}
        title="Calculation Summary"
      />
    </div>
  )
}
