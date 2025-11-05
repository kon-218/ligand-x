'use client'

import React, { useState, useEffect } from 'react'
import { Play, RefreshCw, Settings, Info, Atom, Zap, Layers, Waves, ChevronDown, Check, FlaskConical } from 'lucide-react'
import type { MolecularStructure } from '@/types/molecular'
import { CURATED_METHODS, WORKFLOW_PRESETS, type QCCalculationWorkflow, type QCCuratedMethod } from '@/types/qc'
import type { QCAdvancedParameters as QCAdvancedParametersType } from '@/components/Tools/QC/QCAdvancedParameters'
import { QCAdvancedParameters } from '@/components/Tools/QC/QCAdvancedParameters'

const DEFAULT_ADVANCED_PARAMS: QCAdvancedParametersType = {
    charge: 0,
    multiplicity: 1,
    method: 'B3LYP',
    basis_set: 'def2-SVP',
    job_type: 'OPT',
    compute_frequencies: false,
    n_procs: 4,
    memory_mb: 4000,
    solvation: '',
    calculate_properties: true,
    extra_keywords: '',
    dispersion: 'D3BJ',
    use_rijcosx: true,
    scf_convergence: 'Tight',
    convergence_strategy: 'DIIS',
    use_slow_conv: false,
    integration_grid: 'DefGrid2',
    broken_symmetry_atoms: '',
    temperature: 298.15,
    pressure: 1.0,
    properties: {
        dipole: true,
        quadrupole: false,
        chelpg: false,
        mulliken: false,
        bond_orders: false,
        nbo: false,
        nmr: false,
        td_dft: false,
        td_dft_roots: 5,
        orbitals: true,
    },
}

interface QCTabSetupProps {
    currentStructure: MolecularStructure | null
    calculationType: 'standard' | 'fukui' | 'conformer'
    onCalculationTypeChange: (type: 'standard' | 'fukui' | 'conformer') => void
    advancedParameters: QCAdvancedParametersType | null
    onAdvancedParametersChange: (params: QCAdvancedParametersType) => void
    submitting: boolean
    fukuiMethod: string
    fukuiBasisSet: string
    onFukuiMethodChange: (method: string) => void
    onFukuiBasisSetChange: (basisSet: string) => void
    fukuiCores: number
    onFukuiCoresChange: (cores: number) => void
    conformerCount: number
    onConformerCountChange: (count: number) => void
    energyWindow: number
    onEnergyWindowChange: (window: number) => void
    conformerCores: number
    onConformerCoresChange: (cores: number) => void
    onSubmitStandard: (params: QCAdvancedParametersType) => void
    onSubmitFukui: () => void
    onSubmitConformer: () => void
    onPreviewInput: (inputFile: string) => void
}

function buildParamsFromWorkflow(
    workflow: QCCalculationWorkflow,
    method: QCCuratedMethod,
    charge: number,
    multiplicity: number,
    solvent: string,
    nProcs: number,
    memoryMb: number,
): QCAdvancedParametersType {
    const workflowPreset = WORKFLOW_PRESETS.find(w => w.id === workflow)!
    return {
        ...DEFAULT_ADVANCED_PARAMS,
        charge,
        multiplicity,
        method: method.method,
        basis_set: method.basis_set,
        job_type: workflowPreset.task,
        compute_frequencies: workflowPreset.task === 'OPT_FREQ',
        n_procs: nProcs,
        memory_mb: memoryMb,
        solvation: solvent,
        dispersion: method.dispersion,
        use_rijcosx: method.use_rijcosx,
        calculate_properties: true,
        properties: {
            ...DEFAULT_ADVANCED_PARAMS.properties,
            ...workflowPreset.defaultProperties,
        },
    }
}

const WORKFLOW_ICONS = {
    optimize: FlaskConical,
    ir: Waves,
    properties: Atom,
}

const WORKFLOW_ACCENT = {
    optimize: {
        border: 'border-blue-500',
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        button: 'bg-blue-600 hover:bg-blue-700',
        hover: 'hover:border-blue-500/50',
    },
    ir: {
        border: 'border-purple-500',
        bg: 'bg-purple-500/10',
        text: 'text-purple-400',
        button: 'bg-purple-600 hover:bg-purple-700',
        hover: 'hover:border-purple-500/50',
    },
    properties: {
        border: 'border-emerald-500',
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        button: 'bg-emerald-600 hover:bg-emerald-700',
        hover: 'hover:border-emerald-500/50',
    },
}

const SOLVENTS = ['None', 'Water', 'DMSO', 'Methanol', 'Ethanol', 'Acetonitrile', 'Chloroform', 'THF', 'Toluene', 'Hexane']

export function QCTabSetup({
    currentStructure,
    calculationType,
    onCalculationTypeChange,
    advancedParameters,
    onAdvancedParametersChange,
    submitting,
    fukuiMethod,
    fukuiBasisSet,
    onFukuiMethodChange,
    onFukuiBasisSetChange,
    fukuiCores,
    onFukuiCoresChange,
    conformerCount,
    onConformerCountChange,
    energyWindow,
    onEnergyWindowChange,
    conformerCores,
    onConformerCoresChange,
    onSubmitStandard,
    onSubmitFukui,
    onSubmitConformer,
    onPreviewInput,
}: QCTabSetupProps) {
    const [selectedLigandId, setSelectedLigandId] = useState<string | null>(null)
    const [maxCpuCores, setMaxCpuCores] = useState<number>(64)

    // Standard QC workflow state
    const [selectedWorkflow, setSelectedWorkflow] = useState<QCCalculationWorkflow>('optimize')
    const [selectedMethodId, setSelectedMethodId] = useState<string>(CURATED_METHODS[0].id)
    const [charge, setCharge] = useState(0)
    const [multiplicity, setMultiplicity] = useState(1)
    const [solvent, setSolvent] = useState('None')
    const [nProcs, setNProcs] = useState(4)
    const [memoryMb, setMemoryMb] = useState(4000)
    const [showCustom, setShowCustom] = useState(false)

    // Fetch system info on mount
    useEffect(() => {
        const fetchSystemInfo = async () => {
            try {
                const response = await fetch('/api/qc/system-info')
                if (response.ok) {
                    const data = await response.json()
                    const cores = data.max_cpu_cores || 64
                    setMaxCpuCores(cores)
                    const defaultCores = Math.min(4, cores)
                    setNProcs(defaultCores)
                    onFukuiCoresChange(defaultCores)
                    onConformerCoresChange(defaultCores)
                }
            } catch (error) {
                console.error('Failed to fetch system info:', error)
            }
        }
        fetchSystemInfo()
    }, [])

    const ligands = currentStructure?.ligands ? Object.entries(currentStructure.ligands) : []
    const hasLigands = ligands.length > 0
    const isProtein = !!(currentStructure?.metadata?.residue_count !== undefined && currentStructure.metadata.residue_count > 10)
    const isQCDisabled = !currentStructure || (isProtein && !hasLigands)

    // Molecule data for QC
    let moleculeData: string | undefined
    let selectedMoleculeName = ''
    if (isProtein && hasLigands && selectedLigandId) {
        const selectedLigand = currentStructure!.ligands![selectedLigandId]
        if (selectedLigand) {
            moleculeData = selectedLigand.sdf_data || selectedLigand.pdb_data
            selectedMoleculeName = selectedLigand.residue_name || selectedLigandId
        } else {
            const firstLigand = ligands[0][1]
            moleculeData = firstLigand.sdf_data || firstLigand.pdb_data
            selectedMoleculeName = firstLigand.residue_name || ligands[0][0]
        }
    } else if (isProtein && hasLigands && !selectedLigandId) {
        const firstLigand = ligands[0][1]
        moleculeData = firstLigand.sdf_data || firstLigand.pdb_data
        selectedMoleculeName = firstLigand.residue_name || ligands[0][0]
        if (!selectedLigandId) setSelectedLigandId(ligands[0][0])
    } else if (!isProtein) {
        moleculeData = currentStructure ? (
            currentStructure.sdf_data ||
            currentStructure.xyz_data ||
            (currentStructure.ligands ? Object.values(currentStructure.ligands)[0]?.sdf_data : undefined) ||
            currentStructure.pdb_data ||
            (currentStructure.ligands ? Object.values(currentStructure.ligands)[0]?.pdb_data : undefined)
        ) : undefined
        selectedMoleculeName = currentStructure?.structure_id || 'Current Molecule'
    }

    const selectedMethod = CURATED_METHODS.find(m => m.id === selectedMethodId) || CURATED_METHODS[0]

    const handleRunWorkflow = () => {
        const params = buildParamsFromWorkflow(selectedWorkflow, selectedMethod, charge, multiplicity, solvent === 'None' ? '' : solvent, nProcs, memoryMb)
        onSubmitStandard(params)
    }

    const handleOpenCustom = () => {
        const method = CURATED_METHODS[0]
        const params = buildParamsFromWorkflow(selectedWorkflow, method, charge, multiplicity, solvent === 'None' ? '' : solvent, nProcs, memoryMb)
        onAdvancedParametersChange(params)
        setShowCustom(true)
    }

    const activeWorkflow = WORKFLOW_PRESETS.find(w => w.id === selectedWorkflow)!
    const activeAccent = WORKFLOW_ACCENT[selectedWorkflow]

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-4">

                {/* Molecule selector */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <Atom className="w-4 h-4 text-blue-400" />
                        Molecule
                    </h3>
                    {currentStructure ? (
                        <div className="space-y-2 text-sm">
                            <p className="text-gray-300">
                                <span className="text-gray-500">Structure:</span>{' '}
                                {currentStructure.structure_id || 'Unnamed'}
                            </p>
                            {isProtein && hasLigands && (
                                <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                                    <label className="block text-xs font-medium text-blue-300 mb-2">
                                        Select Ligand for QC Calculation
                                    </label>
                                    <select
                                        value={selectedLigandId || ''}
                                        onChange={(e) => setSelectedLigandId(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {ligands.map(([ligandId, ligand]) => (
                                            <option key={ligandId} value={ligandId}>
                                                {ligand.residue_name || ligandId} (Chain {ligand.chain_id})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-blue-200 text-xs mt-1">
                                        Protein detected ({currentStructure.metadata?.residue_count} residues). Ligand will be extracted for QC.
                                    </p>
                                </div>
                            )}
                            {isProtein && !hasLigands && (
                                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                                    <p className="text-red-300 text-xs font-medium">
                                        No ligands found in protein structure. QC is only available for small molecules.
                                    </p>
                                </div>
                            )}
                            {!isProtein && currentStructure.smiles && (
                                <p className="text-gray-400 text-xs font-mono truncate" title={currentStructure.smiles}>
                                    {currentStructure.smiles}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 py-3">
                            <Info className="w-6 h-6 mx-auto mb-1" />
                            <p className="text-sm">No molecule loaded — use the Input tab to load a structure</p>
                        </div>
                    )}
                </div>

                {/* Calculation type tabs */}
                <div className="grid grid-cols-3 gap-2">
                    {([
                        { id: 'standard' as const, icon: Atom, label: 'QC Calculation', activeClass: 'border-blue-500 bg-blue-500/10', iconClass: 'text-blue-400' },
                        { id: 'fukui' as const, icon: Zap, label: 'Fukui Indices', activeClass: 'border-amber-500 bg-amber-500/10', iconClass: 'text-amber-400' },
                        { id: 'conformer' as const, icon: Layers, label: 'Conformers', activeClass: 'border-emerald-500 bg-emerald-500/10', iconClass: 'text-emerald-400' },
                    ] as const).map(({ id, icon: Icon, label, activeClass, iconClass }) => (
                        <button
                            key={id}
                            onClick={() => { onCalculationTypeChange(id); setShowCustom(false) }}
                            disabled={isQCDisabled}
                            className={`p-2.5 rounded-lg border text-center transition-colors ${isQCDisabled
                                ? 'border-gray-700 bg-gray-700/30 opacity-50 cursor-not-allowed'
                                : calculationType === id
                                    ? activeClass
                                    : 'border-gray-600 hover:border-gray-500'
                                }`}
                        >
                            <Icon className={`w-4 h-4 mx-auto mb-1 ${calculationType === id ? iconClass : 'text-gray-400'}`} />
                            <span className="text-xs font-medium text-white leading-tight">{label}</span>
                        </button>
                    ))}
                </div>

                {/* ─────────────── Standard QC ─────────────── */}
                {calculationType === 'standard' && !showCustom && (
                    <>
                        {/* Workflow preset cards */}
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Choose Workflow</h3>
                            {WORKFLOW_PRESETS.map((workflow) => {
                                const isSelected = selectedWorkflow === workflow.id
                                const accent = WORKFLOW_ACCENT[workflow.id]
                                const Icon = WORKFLOW_ICONS[workflow.id]
                                return (
                                    <div
                                        key={workflow.id}
                                        onClick={() => setSelectedWorkflow(workflow.id)}
                                        className={`rounded-lg border cursor-pointer transition-all ${isSelected
                                            ? `${accent.border} ${accent.bg}`
                                            : `border-gray-700 bg-gray-800/50 ${accent.hover}`
                                            }`}
                                    >
                                        <div className="p-3">
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 p-1.5 rounded-md ${isSelected ? accent.bg : 'bg-gray-700'}`}>
                                                    <Icon className={`w-4 h-4 ${isSelected ? accent.text : 'text-gray-400'}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-medium text-white text-sm">{workflow.name}</span>
                                                        {isSelected && <Check className={`w-4 h-4 flex-shrink-0 ${accent.text}`} />}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-0.5">{workflow.description}</p>
                                                    <div className="flex flex-wrap gap-x-3 mt-1.5">
                                                        {workflow.outputs.map(output => (
                                                            <span key={output} className="text-xs text-gray-500">· {output}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Method selector — only shown when card is selected */}
                                            {isSelected && (
                                                <div className="mt-3 pt-3 border-t border-gray-700/50">
                                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Method</label>
                                                    <div className="relative">
                                                        <select
                                                            value={selectedMethodId}
                                                            onChange={(e) => setSelectedMethodId(e.target.value)}
                                                            className="w-full appearance-none px-3 py-2 pr-8 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                        >
                                                            {CURATED_METHODS.map(m => (
                                                                <option key={m.id} value={m.id}>
                                                                    {m.label}
                                                                    {m.tag === 'Recommended' ? ' ★' : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                                    </div>
                                                    {selectedMethod && (
                                                        <p className="text-xs text-gray-500 mt-1">{selectedMethod.tag}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Common parameters */}
                        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Molecule Settings</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Charge</label>
                                    <input
                                        type="number"
                                        value={charge}
                                        onChange={(e) => setCharge(parseInt(e.target.value) || 0)}
                                        min={-10}
                                        max={10}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Multiplicity</label>
                                    <input
                                        type="number"
                                        value={multiplicity}
                                        onChange={(e) => setMultiplicity(Math.max(1, parseInt(e.target.value) || 1))}
                                        min={1}
                                        max={10}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Solvent</label>
                                    <select
                                        value={solvent}
                                        onChange={(e) => setSolvent(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {SOLVENTS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                        CPU Cores <span className="text-gray-500">(max {maxCpuCores})</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={nProcs}
                                        onChange={(e) => setNProcs(Math.min(Math.max(1, parseInt(e.target.value) || 1), maxCpuCores))}
                                        min={1}
                                        max={maxCpuCores}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="space-y-2">
                            <button
                                onClick={handleRunWorkflow}
                                disabled={isQCDisabled || submitting}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-white ${isQCDisabled || submitting
                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : activeAccent.button
                                    }`}
                            >
                                {submitting ? (
                                    <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                                ) : (
                                    <><Play className="w-4 h-4" /> Run {activeWorkflow.name}</>
                                )}
                            </button>
                            <button
                                onClick={handleOpenCustom}
                                disabled={isQCDisabled}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white transition-colors text-sm"
                            >
                                <Settings className="w-4 h-4" />
                                Customize Parameters...
                            </button>
                        </div>
                    </>
                )}

                {/* Custom / Advanced params view */}
                {calculationType === 'standard' && showCustom && (
                    <>
                        {advancedParameters && (
                            <QCAdvancedParameters
                                preset={null}
                                parameters={advancedParameters}
                                onChange={onAdvancedParametersChange}
                                onBack={() => setShowCustom(false)}
                                onPreviewInput={onPreviewInput}
                                moleculeData={moleculeData}
                            />
                        )}
                        <button
                            onClick={() => {
                                if (advancedParameters) onSubmitStandard(advancedParameters)
                            }}
                            disabled={!currentStructure || !advancedParameters || submitting}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${!currentStructure || !advancedParameters || submitting
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                        >
                            {submitting ? (
                                <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                            ) : (
                                <><Play className="w-4 h-4" /> Run Custom Calculation</>
                            )}
                        </button>
                    </>
                )}

                {/* ─────────────── Fukui Indices ─────────────── */}
                {calculationType === 'fukui' && (
                    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-1">Fukui Indices</h3>
                            <p className="text-xs text-gray-400">
                                Calculates f⁺, f⁻, f⁰ reactivity indices by running three SP calculations
                                (neutral, cation, anion) and comparing electron densities.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1.5">Functional</label>
                                <select
                                    value={fukuiMethod}
                                    onChange={(e) => onFukuiMethodChange(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                >
                                    <option value="B3LYP">B3LYP (Recommended)</option>
                                    <option value="PBE0">PBE0</option>
                                    <option value="wB97X-D">wB97X-D</option>
                                    <option value="M06-2X">M06-2X</option>
                                    <option value="GFN2-xTB">GFN2-xTB (Fast)</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-xs font-medium mb-1.5 ${['GFN2-xTB', 'GFN-xTB'].includes(fukuiMethod) ? 'text-gray-500' : 'text-gray-300'}`}>
                                    Basis Set
                                    {['GFN2-xTB', 'GFN-xTB'].includes(fukuiMethod) && <span className="text-gray-500 ml-1">(not required)</span>}
                                </label>
                                <select
                                    value={fukuiBasisSet}
                                    onChange={(e) => onFukuiBasisSetChange(e.target.value)}
                                    disabled={['GFN2-xTB', 'GFN-xTB'].includes(fukuiMethod)}
                                    className={`w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${['GFN2-xTB', 'GFN-xTB'].includes(fukuiMethod) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <option value="def2-SVP">def2-SVP</option>
                                    <option value="def2-TZVP">def2-TZVP</option>
                                    <option value="6-31G*">6-31G*</option>
                                    <option value="cc-pVDZ">cc-pVDZ</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                    CPU Cores <span className="text-gray-500">(max {maxCpuCores})</span>
                                </label>
                                <input
                                    type="number"
                                    value={fukuiCores}
                                    onChange={(e) => onFukuiCoresChange(Math.min(parseInt(e.target.value) || 1, maxCpuCores))}
                                    min={1}
                                    max={maxCpuCores}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </div>
                        </div>

                        <div className="p-2.5 bg-amber-900/20 border border-amber-700/40 rounded-lg">
                            <p className="text-xs text-amber-300">
                                Runs 3 ORCA calculations (neutral, +1, −1) — takes approximately 3× longer than a single SP job.
                            </p>
                        </div>

                        <button
                            onClick={onSubmitFukui}
                            disabled={isQCDisabled || submitting}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-white ${isQCDisabled || submitting
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-amber-600 hover:bg-amber-700'
                                }`}
                        >
                            {submitting ? (
                                <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                            ) : (
                                <><Play className="w-4 h-4" /> Calculate Fukui Indices</>
                            )}
                        </button>
                    </div>
                )}

                {/* ─────────────── Conformer Search ─────────────── */}
                {calculationType === 'conformer' && (
                    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-1">Conformer Search</h3>
                            <p className="text-xs text-gray-400">
                                Generates conformers with RDKit, pre-optimizes with MMFF94, then re-ranks
                                the lowest-energy structures with DFT (r²SCAN-3c).
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                    Conformers to Generate <span className="text-gray-500">(max 200)</span>
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={200}
                                    value={conformerCount}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value)
                                        if (!isNaN(val) && val >= 1 && val <= 200) onConformerCountChange(val)
                                    }}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                    Energy Window <span className="text-gray-500">(kcal/mol)</span>
                                </label>
                                <input
                                    type="number"
                                    min={0.5}
                                    max={50}
                                    step={0.5}
                                    value={energyWindow}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value)
                                        if (!isNaN(val) && val >= 0.5 && val <= 50) onEnergyWindowChange(val)
                                    }}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                    CPU Cores <span className="text-gray-500">(max {maxCpuCores})</span>
                                </label>
                                <input
                                    type="number"
                                    value={conformerCores}
                                    onChange={(e) => onConformerCoresChange(Math.min(parseInt(e.target.value) || 1, maxCpuCores))}
                                    min={1}
                                    max={maxCpuCores}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                        </div>

                        <div className="p-2.5 bg-emerald-900/20 border border-emerald-700/40 rounded-lg">
                            <p className="text-xs text-emerald-300">
                                Conformers within {energyWindow} kcal/mol of the lowest-energy structure will be returned.
                                Requires a SMILES string for your molecule.
                            </p>
                        </div>

                        <button
                            onClick={onSubmitConformer}
                            disabled={isQCDisabled || submitting}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors text-white ${isQCDisabled || submitting
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                                }`}
                        >
                            {submitting ? (
                                <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                            ) : (
                                <><Play className="w-4 h-4" /> Start Conformer Search</>
                            )}
                        </button>
                    </div>
                )}

            </div>
        </div>
    )
}
