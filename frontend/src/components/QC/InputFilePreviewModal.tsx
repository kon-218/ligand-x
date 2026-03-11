import React, { useState } from 'react'
import { X, ChevronDown, ChevronUp, Code } from 'lucide-react'
import type { QCAdvancedParameters } from '@/components/Tools/QC/QCAdvancedParameters'

const JOB_TYPE_LABELS: Record<string, string> = {
    SP: 'Single Point',
    OPT: 'Geometry Optimization',
    FREQ: 'Frequency Analysis',
    OPT_FREQ: 'Optimization + Frequencies',
    OPTTS: 'Transition State Optimization',
}

function buildMethodLabel(params: QCAdvancedParameters): string {
    const parts = [params.method]
    if (params.basis_set) parts.push(params.basis_set)
    if (params.dispersion && params.dispersion !== 'none') parts.push(params.dispersion)
    if (params.use_rijcosx) parts.push('RIJCOSX')
    return parts.join(' ')
}

function buildPropertiesLabel(params: QCAdvancedParameters): string {
    const active: string[] = []
    if (params.properties.chelpg) active.push('CHELPG charges')
    if (params.properties.mulliken) active.push('Mulliken charges')
    if (params.properties.dipole) active.push('Dipole')
    if (params.properties.orbitals) active.push('HOMO/LUMO')
    if (params.properties.nmr) active.push('NMR')
    if (params.properties.nbo) active.push('NBO')
    if (params.properties.td_dft) active.push(`TD-DFT (${params.properties.td_dft_roots} roots)`)
    return active.length > 0 ? active.join(', ') : 'None'
}

interface SummaryRowProps {
    label: string
    value: string
    highlight?: boolean
}

function SummaryRow({ label, value, highlight }: SummaryRowProps) {
    return (
        <div className="flex items-start gap-3 py-2 border-b border-gray-700/50 last:border-0">
            <span className="text-gray-400 text-sm w-24 flex-shrink-0">{label}</span>
            <span className={`text-sm font-mono ${highlight ? 'text-blue-300' : 'text-white'}`}>{value}</span>
        </div>
    )
}

interface InputFilePreviewModalProps {
    isOpen: boolean
    onClose: () => void
    parameters: QCAdvancedParameters
    rawContent?: string
    isLoadingRaw?: boolean
    onLoadRaw?: () => void
    title?: string
}

export function InputFilePreviewModal({
    isOpen,
    onClose,
    parameters,
    rawContent,
    isLoadingRaw,
    onLoadRaw,
    title = 'Calculation Summary',
}: InputFilePreviewModalProps) {
    const [showRaw, setShowRaw] = useState(false)

    if (!isOpen) return null

    const handleToggleRaw = () => {
        if (!showRaw && !rawContent && onLoadRaw) {
            onLoadRaw()
        }
        setShowRaw(!showRaw)
    }

    const memGb = (parameters.memory_mb / 1000).toFixed(1)
    const solventLabel = parameters.solvation || 'None'

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-[calc(100%-32px)] max-w-[calc(480px-32px)] max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-base font-semibold text-white">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 custom-scrollbar space-y-4">
                    {/* Structured summary */}
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <SummaryRow label="Method" value={buildMethodLabel(parameters)} highlight />
                        <SummaryRow label="Task" value={JOB_TYPE_LABELS[parameters.job_type] || parameters.job_type} />
                        <SummaryRow
                            label="Molecule"
                            value={`Charge ${parameters.charge >= 0 ? '+' : ''}${parameters.charge}, Multiplicity ${parameters.multiplicity}`}
                        />
                        <SummaryRow label="Resources" value={`${parameters.n_procs} cores, ${memGb} GB RAM`} />
                        <SummaryRow label="Properties" value={buildPropertiesLabel(parameters)} />
                        <SummaryRow label="Solvent" value={solventLabel} />
                        {parameters.solvation && (
                            <SummaryRow label="Solv. model" value="CPCM (SMD)" />
                        )}
                        {parameters.scf_convergence !== 'Normal' && (
                            <SummaryRow label="SCF" value={`${parameters.scf_convergence}SCF`} />
                        )}
                        {parameters.extra_keywords && (
                            <SummaryRow label="Extra" value={parameters.extra_keywords} />
                        )}
                    </div>

                    {/* Raw ORCA input toggle */}
                    <div>
                        <button
                            onClick={handleToggleRaw}
                            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                        >
                            <Code className="w-4 h-4" />
                            {showRaw ? 'Hide' : 'Show'} raw ORCA input
                            {showRaw ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showRaw && (
                            <div className="mt-2">
                                {isLoadingRaw ? (
                                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 text-center text-gray-400 text-sm">
                                        Generating input file...
                                    </div>
                                ) : rawContent ? (
                                    <pre className="bg-gray-900 rounded-lg p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto border border-gray-700 max-h-64">
                                        {rawContent}
                                    </pre>
                                ) : (
                                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 text-center text-gray-400 text-sm">
                                        {onLoadRaw ? 'Loading...' : 'Raw input not available'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
