'use client'

import { useMemo } from 'react'
import { Loader2, CheckCircle, Clock, Flame, Beaker, Zap, Activity, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ABFEProgressDisplayProps {
    progress: number
    progressMessage: string
    stage?: string
    estimatedTimeRemaining?: string
    currentIteration?: number
    totalIterations?: number
    currentPhase?: 'setup' | 'charges' | 'md_optimization' | 'equil_hrex' | 'prod_hrex' | 'analysis'
    leg?: 'complex' | 'solvent'
    legNum?: number
    onCancel?: () => void
}

// ABFE calculation phases per leg
const ABFE_PHASES = [
    { 
        key: 'setup', 
        name: 'Setup', 
        description: 'Preparing structures',
        icon: Beaker,
    },
    { 
        key: 'charges', 
        name: 'Partial Charges', 
        description: 'AM1-BCC charge assignment',
        icon: Zap,
    },
    { 
        key: 'md_optimization', 
        name: 'MD Optimization', 
        description: 'Minimization, NPT, and NVT equilibration',
        icon: Activity,
    },
    { 
        key: 'equil_hrex', 
        name: 'Equilibration HREX', 
        description: 'Hamiltonian replica exchange equilibration',
        icon: Zap,
    },
    { 
        key: 'prod_hrex', 
        name: 'Production HREX', 
        description: 'Production free energy sampling',
        icon: Flame,
    },
]

// ABFE legs (Solvent runs first in OpenFE, then Complex)
const ABFE_LEGS = [
    { key: 'solvent', name: 'Solvent', description: 'Ligand in solvent' },
    { key: 'complex', name: 'Complex', description: 'Protein-ligand complex' },
]

/**
 * Parse the progress message to extract meaningful information
 */
function parseProgressMessage(message: string): {
    phase: 'setup' | 'charges' | 'md_optimization' | 'equil_hrex' | 'prod_hrex'
    leg?: 'complex' | 'solvent'
    legNum?: number
    currentIteration?: number
    totalIterations?: number
    estimatedTime?: string
    detailedMessage: string
} {
    const lowerMessage = message.toLowerCase()
    
    // Check for iteration patterns like "Iteration 5/200" or "Equilibration iteration 10/40"
    const iterationMatch = message.match(/iteration\s+(\d+)\/(\d+)/i)
    const currentIteration = iterationMatch ? parseInt(iterationMatch[1]) : undefined
    const totalIterations = iterationMatch ? parseInt(iterationMatch[2]) : undefined
    
    // Check for estimated time patterns
    const timeMatch = message.match(/eta\s+(\d+:\d+:\d+)/i)
    const estimatedTime = timeMatch ? timeMatch[1] : undefined
    
    // Detect leg from message (Solvent runs first, then Complex)
    let leg: 'complex' | 'solvent' | undefined = undefined
    let legNum: number | undefined = undefined
    if (lowerMessage.includes('solvent')) {
        leg = 'solvent'
        legNum = 1
    } else if (lowerMessage.includes('complex')) {
        leg = 'complex'
        legNum = 2
    }
    
    // Determine phase based on message content
    let phase: 'setup' | 'charges' | 'md_optimization' | 'equil_hrex' | 'prod_hrex' = 'setup'
    let detailedMessage = message
    
    if (lowerMessage.includes('partial charge') || lowerMessage.includes('assigning charge')) {
        phase = 'charges'
        detailedMessage = 'Assigning partial charges...'
    } else if (lowerMessage.includes('minimi') || 
               (lowerMessage.includes('npt') && (lowerMessage.includes('equil') || lowerMessage.includes('running'))) ||
               (lowerMessage.includes('nvt') && (lowerMessage.includes('equil') || lowerMessage.includes('running')))) {
        phase = 'md_optimization'
        if (lowerMessage.includes('minimi')) {
            detailedMessage = 'MD Optimization: Minimization...'
        } else if (lowerMessage.includes('npt')) {
            detailedMessage = 'MD Optimization: NPT Equilibration...'
        } else if (lowerMessage.includes('nvt')) {
            detailedMessage = 'MD Optimization: NVT Equilibration...'
        } else {
            detailedMessage = 'MD Optimization...'
        }
    } else if (lowerMessage.includes('equilibration hrex')) {
        phase = 'equil_hrex'
        detailedMessage = `Equilibration HREX: ${currentIteration || '?'}/${totalIterations || '?'} iterations`
    } else if (lowerMessage.includes('production hrex')) {
        phase = 'prod_hrex'
        detailedMessage = `Production HREX: ${currentIteration || '?'}/${totalIterations || '?'} iterations`
    } else if (lowerMessage.includes('parameteriz') || lowerMessage.includes('setup') || 
               lowerMessage.includes('preparing') || lowerMessage.includes('creating') || 
               lowerMessage.includes('loading') || lowerMessage.includes('building')) {
        phase = 'setup'
        detailedMessage = message.replace(/^\[.*?\]\s*/, '').trim() || 'Setting up calculation...'
    }
    
    return { phase, leg, legNum, currentIteration, totalIterations, estimatedTime, detailedMessage }
}

export function ABFEProgressDisplay({
    progress,
    progressMessage,
    stage,
    estimatedTimeRemaining,
    currentIteration,
    totalIterations,
    currentPhase,
    leg,
    legNum,
    onCancel,
}: ABFEProgressDisplayProps) {
    // Parse the progress message to extract phase and iteration info
    const parsedInfo = useMemo(() => {
        return parseProgressMessage(progressMessage || stage || '')
    }, [progressMessage, stage])
    
    const activePhase = currentPhase || parsedInfo.phase
    const activeLeg = leg || parsedInfo.leg
    const activeLegNum = legNum || parsedInfo.legNum
    const displayIteration = currentIteration || parsedInfo.currentIteration
    const displayTotalIterations = totalIterations || parsedInfo.totalIterations
    const displayEstimatedTime = estimatedTimeRemaining || parsedInfo.estimatedTime
    
    // Calculate which phases are complete
    const getPhaseStatus = (phaseKey: string): 'pending' | 'running' | 'completed' => {
        const phaseOrder = ['setup', 'charges', 'md_optimization', 'equil_hrex', 'prod_hrex']
        const currentIndex = phaseOrder.indexOf(activePhase)
        const phaseIndex = phaseOrder.indexOf(phaseKey)
        
        if (phaseIndex < currentIndex) return 'completed'
        if (phaseIndex === currentIndex) return 'running'
        return 'pending'
    }
    
    // Get leg display name
    const getLegDisplayName = () => {
        if (!activeLeg) return 'ABFE'
        return `${activeLeg === 'complex' ? 'Complex' : 'Solvent'} (${activeLegNum}/2)`
    }
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-500/30 rounded-lg">
                <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
                    <Loader2 className="h-8 w-8 animate-spin text-blue-400 relative" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-blue-300">Running ABFE Calculation</p>
                        {activeLeg && activeLegNum && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-600/40 border border-blue-500/50 text-blue-200">
                                {activeLeg === 'complex' ? '🧬' : '💧'} {getLegDisplayName()}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-blue-400/70">{parsedInfo.detailedMessage}</p>
                </div>
            </div>

            {/* Main Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Overall Progress</span>
                    <span className="text-blue-400 font-medium">{Math.round(progress)}%</span>
                </div>
                <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden shadow-inner">
                    <div
                        className="absolute inset-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-400 transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(progress, 2)}%` }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                    </div>
                </div>
            </div>

            {/* Leg Progress */}
            {activeLeg && activeLegNum && (
                <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-700/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-blue-300 font-medium">
                            {getLegDisplayName()}
                        </span>
                        <span className="text-xs text-blue-400">
                            {activeLeg === 'complex' ? 'Protein-ligand complex' : 'Ligand in solvent'}
                        </span>
                    </div>
                    <div className="h-2 bg-blue-900 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                            style={{ width: `${Math.min(100, (activeLegNum === 1 ? Math.min(progress, 50) : Math.max(0, progress - 50)) * 2)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Iteration Progress (if available) */}
            {displayIteration && displayTotalIterations && (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">
                            {activePhase === 'equil_hrex' ? 'Equilibration HREX' : 'Production HREX'} Iterations
                        </span>
                        <span className="text-sm font-mono text-cyan-400">
                            {displayIteration} / {displayTotalIterations}
                        </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-300"
                            style={{ width: `${(displayIteration / displayTotalIterations) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Estimated Time */}
            {displayEstimatedTime && (
                <div className="flex items-center gap-2 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <Timer className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">Estimated time remaining:</span>
                    <span className="text-sm font-mono text-white">{displayEstimatedTime}</span>
                </div>
            )}

            {/* Phase Progress */}
            <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-300">Calculation Phases</h4>
                <div className="space-y-2">
                    {ABFE_PHASES.map((phaseInfo) => {
                        const status = getPhaseStatus(phaseInfo.key)
                        const Icon = phaseInfo.icon
                        
                        return (
                            <div
                                key={phaseInfo.key}
                                className={`p-3 rounded-lg border transition-all ${
                                    status === 'running' 
                                        ? 'bg-blue-900/20 border-blue-500/50' 
                                        : status === 'completed'
                                        ? 'bg-green-900/20 border-green-700/50'
                                        : 'bg-gray-800/30 border-gray-700/50'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    {status === 'completed' ? (
                                        <CheckCircle className="w-5 h-5 text-green-400" />
                                    ) : status === 'running' ? (
                                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                    ) : (
                                        <Clock className="w-5 h-5 text-gray-500" />
                                    )}
                                    <Icon className={`w-4 h-4 ${
                                        status === 'running' ? 'text-blue-400' :
                                        status === 'completed' ? 'text-green-400' : 'text-gray-500'
                                    }`} />
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${
                                            status === 'running' ? 'text-blue-300' :
                                            status === 'completed' ? 'text-green-300' : 'text-gray-400'
                                        }`}>
                                            {phaseInfo.name}
                                        </p>
                                        <p className="text-xs text-gray-500">{phaseInfo.description}</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Info Box */}
            <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <div className="flex items-start gap-2">
                    <Flame className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-yellow-300 mb-1">Long-running Calculation</p>
                        <p className="text-sm text-gray-300">
                            ABFE calculations typically take 30 minutes to several hours depending on settings.
                            The job runs in the background - you can safely navigate away and return later.
                        </p>
                    </div>
                </div>
            </div>

            {/* Cancel Button */}
            {onCancel && (
                <div className="flex justify-center pt-2">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="bg-red-900/20 border-red-700/50 hover:bg-red-900/40 text-red-400"
                    >
                        Cancel Calculation
                    </Button>
                </div>
            )}
        </div>
    )
}
