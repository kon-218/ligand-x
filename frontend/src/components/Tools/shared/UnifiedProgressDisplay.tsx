'use client'

import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ServiceType } from '@/types/unified-job-types'
import { SERVICE_CONFIGS } from '@/types/unified-job-types'

interface UnifiedProgressDisplayProps {
    service: ServiceType
    progress: number
    progressMessage: string
    completedStages?: string[]  // For MD
    hasProduction?: boolean  // Whether this MD job includes a production run
    isRunning: boolean
    onCancel?: () => void
}

// Service-specific stage definitions
// Keys must match what md-store.ts setProgress() adds to completedStages
const MD_STAGES = [
    { key: 'Preparation', name: 'Preparation' },
    { key: 'Minimization', name: 'Minimization' },
    { key: 'NVT Equilibration', name: 'NVT Equilibration' },
    { key: 'NPT Equilibration', name: 'NPT Equilibration' },
    { key: 'Production', name: 'Production MD' },
]

// Color mapping for services
const SERVICE_COLORS: Record<ServiceType, { gradient: string; text: string; bg: string }> = {
    docking: {
        gradient: 'from-indigo-500 to-purple-500',
        text: 'text-indigo-400',
        bg: 'bg-indigo-500/20',
    },
    md: {
        gradient: 'from-green-500 via-cyan-500 to-blue-500',
        text: 'text-green-400',
        bg: 'bg-green-500/20',
    },
    boltz2: {
        gradient: 'from-purple-500 to-pink-500',
        text: 'text-purple-400',
        bg: 'bg-purple-500/20',
    },
    abfe: {
        gradient: 'from-blue-500 to-cyan-500',
        text: 'text-blue-400',
        bg: 'bg-blue-500/20',
    },
    rbfe: {
        gradient: 'from-cyan-500 to-teal-500',
        text: 'text-cyan-400',
        bg: 'bg-cyan-500/20',
    },
    qc: {
        gradient: 'from-blue-600 to-indigo-600',
        text: 'text-blue-400',
        bg: 'bg-blue-600/20',
    },
}

/** Used when API returns a job_type not yet in ServiceType / SERVICE_COLORS */
const DEFAULT_SERVICE_COLORS = {
    gradient: 'from-gray-500 to-slate-500',
    text: 'text-gray-400',
    bg: 'bg-gray-500/20',
} as const

function getServiceColors(service: ServiceType) {
    return SERVICE_COLORS[service] ?? DEFAULT_SERVICE_COLORS
}

/**
 * Unified progress display for running jobs across all services
 * Supports streaming progress for MD, and simple loading for others
 */
export function UnifiedProgressDisplay({
    service,
    progress,
    progressMessage,
    completedStages = [],
    hasProduction = false,
    isRunning,
    onCancel,
}: UnifiedProgressDisplayProps) {
    const colors = getServiceColors(service)
    const serviceName = SERVICE_CONFIGS[service]?.name || service.toUpperCase()

    if (!isRunning) {
        return null
    }

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">{serviceName}</h3>

            {/* Loading Animation */}
            <div className="flex flex-col items-center justify-center py-8">
                <div className="relative">
                    <div className={`absolute inset-0 ${colors.bg} rounded-full blur-xl animate-pulse`} />
                    <div className="relative">
                        <Loader2 className={`w-20 h-20 animate-spin ${colors.text}`} />
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <p className={`text-lg font-medium ${colors.text} animate-pulse`}>
                        Running {serviceName}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                        {progressMessage || 'Processing...'}
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                    <span>Progress</span>
                    <span>{progress.toFixed(0)}%</span>
                </div>
                <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden shadow-inner">
                    <div
                        className={`absolute inset-0 bg-gradient-to-r ${colors.gradient} transition-all duration-500 ease-out`}
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                    </div>
                </div>
            </div>

            {/* MD-specific: Stage Indicators */}
            {service === 'md' && (
                <div className="grid grid-cols-2 gap-3">
                    {MD_STAGES.filter(stage =>
                        stage.key !== 'Production' || hasProduction || completedStages.includes('Production')
                    ).map((stage) => {
                        const isDone = completedStages.includes(stage.key)
                        return (
                            <div
                                key={stage.key}
                                className={`p-3 rounded-lg border transition-all ${isDone
                                    ? 'bg-green-900/20 border-green-700/50'
                                    : 'bg-gray-800/30 border-gray-700/50'
                                    }`}
                            >
                                <div className="flex items-center space-x-2">
                                    {isDone ? (
                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
                                    )}
                                    <span className={`text-xs font-medium ${isDone ? 'text-green-400' : 'text-gray-400'
                                        }`}>
                                        {stage.name}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Service-specific info boxes */}
            <ServiceInfoBox service={service} />

            {/* Cancel button */}
            {onCancel && (
                <div className="flex justify-center pt-4">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="bg-red-900/20 border-red-700/50 hover:bg-red-900/40 text-red-400"
                    >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel
                    </Button>
                </div>
            )}
        </div>
    )
}

/**
 * Service-specific information box shown during progress
 */
function ServiceInfoBox({ service }: { service: ServiceType }) {
    const content = SERVICE_INFO_CONTENT[service]

    if (!content) return null

    return (
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">What's happening:</h4>
            <ul className="space-y-1 text-sm text-gray-400">
                {content.steps.map((step, i) => (
                    <li key={i}>• {step}</li>
                ))}
            </ul>
            {content.note && (
                <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded">
                    <p className="text-sm text-yellow-300">
                        <strong>Note:</strong> {content.note}
                    </p>
                </div>
            )}
        </div>
    )
}

const SERVICE_INFO_CONTENT: Record<ServiceType, { steps: string[]; note?: string }> = {
    docking: {
        steps: [
            'Preparing receptor structure',
            'Converting ligand to PDBQT format',
            'Running AutoDock Vina',
            'Analyzing binding poses',
        ],
    },
    md: {
        steps: [
            'Solvating system with water molecules',
            'Adding ions for neutralization',
            'Energy minimization',
            'NVT equilibration (thermal heating → constant temperature)',
            'NPT equilibration (constant pressure)',
            'Production MD run (if configured)',
        ],
        note: 'MD simulations may take several minutes to complete.',
    },
    boltz2: {
        steps: [
            'Preparing protein and ligand structures',
            'Running Boltz-2 binding affinity prediction',
            'Generating multiple binding poses',
            'Calculating confidence scores',
        ],
    },
    abfe: {
        steps: [
            'Preparing ligand and protein structures',
            'Assigning partial charges',
            'Setting up chemical systems (complex and solvent)',
            'Running molecular dynamics simulations',
            'Calculating binding free energy using MBAR',
        ],
        note: 'ABFE calculations can take several hours to complete. The job runs in the background.',
    },
    rbfe: {
        steps: [
            'Building transformation network',
            'Docking ligands to binding site',
            'Setting up alchemical transformations',
            'Running free energy perturbation simulations',
            'Calculating relative binding free energies',
        ],
        note: 'RBFE calculations can take several hours. Results will be available when complete.',
    },
    qc: {
        steps: [
            'Preparing molecule geometry',
            'Setting up quantum chemistry calculation',
            'Running geometry optimization',
            'Calculating electronic properties',
        ],
        note: 'QC calculations duration depends on the method and basis set used.',
    },
}

// Add shimmer animation keyframes (should be in global CSS, but defining here for completeness)
const shimmerStyles = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
`
