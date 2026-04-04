'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { useMolecularStore } from '@/store/molecular-store'
import {
    Loader2,
    BarChart3,
    Grid3X3,
    TrendingUp,
    FileText,
    Download,
    Image,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    Activity,
    Layers,
    ArrowRightLeft,
    RefreshCw,
    Eye
} from 'lucide-react'
import type { ABFEAnalysisData, ABFELegAnalysis, ABFEFileInfo } from '@/types/abfe-types'

interface ABFEDetailedAnalysisProps {
    jobId: string
}

export function ABFEDetailedAnalysis({ jobId }: ABFEDetailedAnalysisProps) {
    const [analysis, setAnalysis] = useState<ABFEAnalysisData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'overview' | 'overlap' | 'convergence' | 'files'>('overview')
    const [downloadingLog, setDownloadingLog] = useState(false)
    
    const { addImageFileTab, setActiveTab: setViewerTab } = useMolecularStore()

    useEffect(() => {
        loadAnalysis()
    }, [jobId])

    const loadAnalysis = async () => {
        try {
            setLoading(true)
            setError(null)
            const data = await api.getABFEDetailedAnalysis(jobId) as ABFEAnalysisData
            console.log('Loaded ABFE analysis data:', data)
            if (data.error) {
                setError(data.error)
                setAnalysis(null)
            } else {
                setAnalysis(data)
            }
        } catch (err: any) {
            console.error('Error loading analysis:', err)
            setError(err.message || 'Failed to load analysis')
            setAnalysis(null)
        } finally {
            setLoading(false)
        }
    }

    const handleDownloadLog = async () => {
        try {
            setDownloadingLog(true)
            const blob = await api.downloadABFELog(jobId)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `abfe_${jobId}_combined.log`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err) {
            console.error('Failed to download log:', err)
        } finally {
            setDownloadingLog(false)
        }
    }

    const openImageViewer = (url: string, title: string) => {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`
        const tabId = addImageFileTab(fullUrl, title)
        setViewerTab(tabId)
    }

    const getLegStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="w-4 h-4 text-green-400" />
            case 'running':
                return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-400" />
            default:
                return <Clock className="w-4 h-4 text-gray-400" />
        }
    }

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    if (loading) {
        return (
            <div className="p-6 bg-gray-900/30 rounded-lg border border-gray-800">
                <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    <span className="text-gray-300">Loading detailed analysis...</span>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-300">{error}</span>
                </div>
                <Button onClick={loadAnalysis} variant="outline" size="sm" className="mt-3">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        )
    }

    if (!analysis) {
        return (
            <div className="p-4 bg-gray-900/30 rounded-lg border border-gray-800">
                <p className="text-gray-400 text-sm">No analysis data available</p>
            </div>
        )
    }

    const tabs = [
        { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
        { id: 'overlap' as const, label: 'Overlap Matrices', icon: Grid3X3 },
        { id: 'convergence' as const, label: 'Convergence', icon: TrendingUp },
        { id: 'files' as const, label: 'Output Files', icon: FileText },
    ]

    return (
        <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-gray-900/50 rounded-lg">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        type="button"
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                            activeTab === tab.id
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-gray-900/30 rounded-lg border border-gray-800 p-4 min-h-[400px]">
                {activeTab === 'overview' && <OverviewTab analysis={analysis} />}
                {activeTab === 'overlap' && <OverlapTab analysis={analysis} onOpenImage={openImageViewer} />}
                {activeTab === 'convergence' && <ConvergenceTab analysis={analysis} />}
                {activeTab === 'files' && (
                    <FilesTab
                        analysis={analysis}
                        jobId={jobId}
                        onDownloadLog={handleDownloadLog}
                        downloadingLog={downloadingLog}
                        onOpenImage={openImageViewer}
                        formatBytes={formatBytes}
                    />
                )}
            </div>

        </div>
    )
}

// Overview Tab Component
function OverviewTab({ analysis }: { analysis: ABFEAnalysisData }) {
    const hasThermodynamicCycle = !!analysis.thermodynamic_cycle
    const hasLegs = analysis.legs && analysis.legs.length > 0

    return (
        <div className="space-y-6">
            {/* Thermodynamic Cycle */}
            {hasThermodynamicCycle && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                        Thermodynamic Cycle
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                            <p className="text-xs text-gray-400 mb-1">ΔG (Complex)</p>
                            <p className="text-lg font-mono text-blue-300">
                                {analysis.thermodynamic_cycle!.dg_complex.toFixed(2)}
                                <span className="text-xs text-gray-400 ml-1">± {analysis.thermodynamic_cycle!.dg_complex_error.toFixed(2)}</span>
                            </p>
                            <p className="text-xs text-gray-500">kcal/mol</p>
                        </div>
                        <div className="p-4 bg-green-900/20 border border-green-700/30 rounded-lg">
                            <p className="text-xs text-gray-400 mb-1">ΔG (Solvent)</p>
                            <p className="text-lg font-mono text-green-300">
                                {analysis.thermodynamic_cycle!.dg_solvent.toFixed(2)}
                                <span className="text-xs text-gray-400 ml-1">± {analysis.thermodynamic_cycle!.dg_solvent_error.toFixed(2)}</span>
                            </p>
                            <p className="text-xs text-gray-500">kcal/mol</p>
                        </div>
                        <div className="p-4 bg-purple-900/20 border border-purple-700/30 rounded-lg">
                            <p className="text-xs text-gray-400 mb-1">ΔG (Binding)</p>
                            <p className="text-xl font-mono font-bold text-purple-300">
                                {analysis.thermodynamic_cycle!.dg_binding.toFixed(2)}
                                <span className="text-sm text-gray-400 ml-1">± {analysis.thermodynamic_cycle!.dg_binding_error.toFixed(2)}</span>
                            </p>
                            <p className="text-xs text-gray-500">kcal/mol</p>
                        </div>
                    </div>
                    {analysis.thermodynamic_cycle!.dg_restraint_correction !== undefined && analysis.thermodynamic_cycle!.dg_restraint_correction !== 0 && (
                        <p className="text-xs text-gray-400">
                            Standard state correction: {analysis.thermodynamic_cycle!.dg_restraint_correction.toFixed(2)} kcal/mol
                        </p>
                    )}
                </div>
            )}

            {/* Leg Contributions */}
            {hasThermodynamicCycle && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-purple-400" />
                        Leg Contributions
                    </h3>
                    <div className="bg-gray-900/30 rounded-lg border border-gray-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-700 bg-gray-900/50">
                                        <th className="text-left py-3 px-4 text-gray-300 font-semibold">Leg</th>
                                        <th className="text-right py-3 px-4 text-gray-300 font-semibold">ΔG (kcal/mol)</th>
                                        <th className="text-right py-3 px-4 text-gray-300 font-semibold">Uncertainty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-gray-700/50 hover:bg-gray-800/30">
                                        <td className="py-3 px-4">
                                            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-900/30 text-blue-300">
                                                Complex
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-white">
                                            {analysis.thermodynamic_cycle!.dg_complex.toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-gray-400">
                                            ± {analysis.thermodynamic_cycle!.dg_complex_error.toFixed(2)}
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-700/50 hover:bg-gray-800/30">
                                        <td className="py-3 px-4">
                                            <span className="px-2 py-1 rounded text-xs font-medium bg-green-900/30 text-green-300">
                                                Solvent
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-white">
                                            {analysis.thermodynamic_cycle!.dg_solvent.toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-gray-400">
                                            ± {analysis.thermodynamic_cycle!.dg_solvent_error.toFixed(2)}
                                        </td>
                                    </tr>
                                    {analysis.thermodynamic_cycle!.dg_restraint_correction !== undefined && analysis.thermodynamic_cycle!.dg_restraint_correction !== 0 && (
                                        <tr className="border-b border-gray-700/50 hover:bg-gray-800/30">
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-1 rounded text-xs font-medium bg-purple-900/30 text-purple-300">
                                                    Standard State
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-white">
                                                {analysis.thermodynamic_cycle!.dg_restraint_correction.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-gray-400">
                                                ± 0.00
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Fallback: Show Leg Status Cards if no thermodynamic cycle but legs exist */}
            {!hasThermodynamicCycle && hasLegs && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        Simulation Legs
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analysis.legs.map((leg, idx) => (
                            <LegCard key={idx} leg={leg} />
                        ))}
                    </div>
                </div>
            )}

            {/* No data message */}
            {!hasThermodynamicCycle && !hasLegs && (
                <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                    <p className="text-gray-400">No overview data available</p>
                    <p className="text-xs text-gray-500 mt-1">Analysis results may still be processing</p>
                </div>
            )}
        </div>
    )
}

// Leg Card Component
function LegCard({ leg }: { leg: ABFELegAnalysis }) {
    const statusColors = {
        completed: 'border-green-600/30 bg-green-900/10',
        running: 'border-blue-600/30 bg-blue-900/10',
        failed: 'border-red-600/30 bg-red-900/10',
        pending: 'border-gray-600/30 bg-gray-900/10'
    }

    return (
        <div className={`p-4 rounded-lg border ${statusColors[leg.status as keyof typeof statusColors] || statusColors.pending}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        leg.leg_type === 'complex' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'
                    }`}>
                        {leg.leg_type}
                    </span>
                    {leg.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400" />}
                    {leg.status === 'running' && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
                    {leg.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                </div>
            </div>

            {leg.free_energy_kcal_mol !== undefined && (
                <div className="mb-3">
                    <p className="text-xs text-gray-400">Free Energy</p>
                    <p className="text-lg font-mono text-white">
                        {leg.free_energy_kcal_mol.toFixed(2)}
                        {leg.uncertainty_kcal_mol !== undefined && (
                            <span className="text-xs text-gray-400 ml-1">± {leg.uncertainty_kcal_mol.toFixed(2)}</span>
                        )}
                        <span className="text-xs text-gray-500 ml-1">kcal/mol</span>
                    </p>
                </div>
            )}

            {leg.mbar_analysis && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <p className="text-gray-500">Samples</p>
                        <p className="text-gray-300 font-mono">{leg.mbar_analysis.number_of_uncorrelated_samples.toFixed(0)}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Stat. Ineff.</p>
                        <p className="text-gray-300 font-mono">{leg.mbar_analysis.statistical_inefficiency.toFixed(2)}</p>
                    </div>
                </div>
            )}

            {leg.timing_data && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Progress</span>
                        <span className="text-gray-300">{leg.timing_data.percent_complete.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
                        <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${leg.timing_data.percent_complete}%` }}
                        />
                    </div>
                    {leg.timing_data.ns_per_day > 0 && (
                        <p className="text-xs text-gray-500 mt-1">{leg.timing_data.ns_per_day.toFixed(0)} ns/day</p>
                    )}
                </div>
            )}
        </div>
    )
}

// Overlap Matrices Tab Component
function OverlapTab({
    analysis,
    onOpenImage
}: {
    analysis: ABFEAnalysisData
    onOpenImage: (url: string, title: string) => void
}) {
    const [selectedRepeat, setSelectedRepeat] = useState(0)

    const plotTypes = [
        { key: 'overlap_matrix_path', label: 'MBAR Overlap Matrix', description: 'Shows overlap between adjacent λ windows. High overlap (>0.03) indicates good sampling.' },
        { key: 'replica_exchange_matrix_path', label: 'Replica Exchange Matrix', description: 'Transition probabilities between replicas. Good mixing shows significant off-diagonal elements.' },
        { key: 'replica_state_timeseries_path', label: 'Replica State Timeseries', description: 'Shows how replicas explore λ space over time. Good mixing shows thorough exploration.' },
    ]

    // Get unique repeat numbers from legs
    const repeatSet = new Set<number>()
    analysis.legs.forEach(leg => {
        if (leg.repeat_num !== undefined) {
            repeatSet.add(leg.repeat_num)
        }
    })

    const repeats = Array.from(repeatSet).sort((a, b) => a - b)
    const hasAnyPlots = repeats.length > 0

    if (!hasAnyPlots) {
        return (
            <div className="text-center py-8">
                <Grid3X3 className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No analysis plots available yet</p>
                <p className="text-xs text-gray-500 mt-1">Plots are generated after simulation completes</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Repeat Selector */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-300">Repeat</label>
                <div className="flex gap-2 flex-wrap">
                    {repeats.map(repeat => (
                        <button
                            key={repeat}
                            onClick={() => setSelectedRepeat(repeat)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                selectedRepeat === repeat
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            {repeat + 1}
                        </button>
                    ))}
                </div>
            </div>

            {/* Plot Types */}
            {plotTypes.map(plotType => {
                const complexLeg = analysis.legs.find(leg => leg.leg_type === 'complex' && leg.repeat_num === selectedRepeat)
                const solventLeg = analysis.legs.find(leg => leg.leg_type === 'solvent' && leg.repeat_num === selectedRepeat)

                const complexPlotPath = complexLeg ? (complexLeg[plotType.key as keyof ABFELegAnalysis] as string | undefined) : undefined
                const solventPlotPath = solventLeg ? (solventLeg[plotType.key as keyof ABFELegAnalysis] as string | undefined) : undefined

                if (!complexPlotPath && !solventPlotPath) return null

                return (
                    <div key={plotType.key} className="space-y-3">
                        <div>
                            <h4 className="text-sm font-semibold text-white">{plotType.label}</h4>
                            <p className="text-xs text-gray-400">{plotType.description}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Complex Leg */}
                            {complexPlotPath && (
                                <div
                                    className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 transition-colors"
                                    onClick={() => onOpenImage(complexPlotPath, `${plotType.label} - Complex (Repeat ${selectedRepeat + 1})`)}
                                >
                                    <img
                                        src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${complexPlotPath}`}
                                        alt={`${plotType.label} - Complex`}
                                        className="w-full h-auto"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="flex items-center gap-2 text-white">
                                            <Image className="w-5 h-5" />
                                            <span>View Full Size</span>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent">
                                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-blue-900/70 text-blue-300">
                                            Complex
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Solvent Leg */}
                            {solventPlotPath && (
                                <div
                                    className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-green-500 transition-colors"
                                    onClick={() => onOpenImage(solventPlotPath, `${plotType.label} - Solvent (Repeat ${selectedRepeat + 1})`)}
                                >
                                    <img
                                        src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${solventPlotPath}`}
                                        alt={`${plotType.label} - Solvent`}
                                        className="w-full h-auto"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="flex items-center gap-2 text-white">
                                            <Image className="w-5 h-5" />
                                            <span>View Full Size</span>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent">
                                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-green-900/70 text-green-300">
                                            Solvent
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// Convergence Tab Component
function ConvergenceTab({ analysis }: { analysis: ABFEAnalysisData }) {
    const convergenceData = analysis.convergence_data

    if (!convergenceData || convergenceData.checkpoints.length === 0) {
        return (
            <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No convergence data available yet</p>
                <p className="text-xs text-gray-500 mt-1">Data is collected during simulation</p>
            </div>
        )
    }

    // Group checkpoints by leg
    const complexCheckpoints = convergenceData.checkpoints.filter(c => c.leg === 'complex')
    const solventCheckpoints = convergenceData.checkpoints.filter(c => c.leg === 'solvent')

    // Convert kT to kcal/mol
    const kT_to_kcal = 0.593

    // Check if we only have one checkpoint
    const totalCheckpoints = complexCheckpoints.length + solventCheckpoints.length
    const singleCheckpoint = totalCheckpoints === 2 && complexCheckpoints.length === 1 && solventCheckpoints.length === 1

    return (
        <div className="space-y-6">
            {/* Single Checkpoint Warning */}
            {singleCheckpoint && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-yellow-400 mb-1">Limited Convergence Data</p>
                            <p className="text-sm text-gray-300">
                                This simulation has completed with only one checkpoint (final result). For convergence analysis, 
                                consider running with longer production times or increasing the number of checkpoints to observe 
                                how free energy estimates change over time.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    MBAR Convergence Analysis
                </h4>
                <p className="text-xs text-gray-400 mb-4">
                    Free energy estimates at each checkpoint. Stable values indicate convergence.
                    {singleCheckpoint && ' Below is the final result:'}
                </p>

                {/* Complex Leg */}
                {complexCheckpoints.length > 0 && (
                    <div className="mb-6">
                        <h5 className="text-xs font-semibold text-blue-300 mb-2 uppercase">Complex Leg</h5>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="text-left py-2 px-2 text-gray-400">Progress</th>
                                        <th className="text-right py-2 px-2 text-gray-400">ΔG (kT)</th>
                                        <th className="text-right py-2 px-2 text-gray-400">ΔG (kcal/mol)</th>
                                        <th className="text-right py-2 px-2 text-gray-400">Error (kT)</th>
                                        <th className="text-right py-2 px-2 text-gray-400">N samples</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {complexCheckpoints.map((cp, idx) => (
                                        <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="py-2 px-2 text-gray-300">{cp.percent_complete.toFixed(0)}%</td>
                                            <td className="py-2 px-2 text-right font-mono text-white">{cp.free_energy_kT.toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right font-mono text-blue-300">{(cp.free_energy_kT * kT_to_kcal).toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right font-mono text-gray-400">± {cp.standard_error_kT.toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right font-mono text-gray-400">{cp.n_uncorrelated_samples.toFixed(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Solvent Leg */}
                {solventCheckpoints.length > 0 && (
                    <div>
                        <h5 className="text-xs font-semibold text-green-300 mb-2 uppercase">Solvent Leg</h5>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="text-left py-2 px-2 text-gray-400">Progress</th>
                                        <th className="text-right py-2 px-2 text-gray-400">ΔG (kT)</th>
                                        <th className="text-right py-2 px-2 text-gray-400">ΔG (kcal/mol)</th>
                                        <th className="text-right py-2 px-2 text-gray-400">Error (kT)</th>
                                        <th className="text-right py-2 px-2 text-gray-400">N samples</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {solventCheckpoints.map((cp, idx) => (
                                        <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="py-2 px-2 text-gray-300">{cp.percent_complete.toFixed(0)}%</td>
                                            <td className="py-2 px-2 text-right font-mono text-white">{cp.free_energy_kT.toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right font-mono text-green-300">{(cp.free_energy_kT * kT_to_kcal).toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right font-mono text-gray-400">± {cp.standard_error_kT.toFixed(2)}</td>
                                            <td className="py-2 px-2 text-right font-mono text-gray-400">{cp.n_uncorrelated_samples.toFixed(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <p className="text-xs text-gray-300">
                    <strong>Interpretation:</strong> A converged simulation shows stable free energy estimates
                    as sampling progresses. Large fluctuations or systematic drift may indicate insufficient
                    equilibration or sampling issues.
                </p>
            </div>
        </div>
    )
}

// Files Tab Component
function FilesTab({
    analysis,
    jobId,
    onDownloadLog,
    downloadingLog,
    onOpenImage,
    formatBytes
}: {
    analysis: ABFEAnalysisData
    jobId: string
    onDownloadLog: () => void
    downloadingLog: boolean
    onOpenImage: (url: string, title: string) => void
    formatBytes: (bytes: number) => string
}) {
    const [selectedRepeat, setSelectedRepeat] = useState(0)
    const [loadingFile, setLoadingFile] = useState<string | null>(null)
    const { addStructureTab, addInputFileTab } = useMolecularStore()
    const outputFiles = analysis.output_files

    // Get unique repeat numbers from output files
    const repeatSet = new Set<number>()
    Object.values(outputFiles).forEach(files => {
        files?.forEach((file: ABFEFileInfo) => {
            if (file.repeat_num !== undefined) {
                repeatSet.add(file.repeat_num)
            }
        })
    })
    const repeats = Array.from(repeatSet).sort((a, b) => a - b)
    
    // If no repeat info, show all files
    const hasRepeatInfo = repeats.length > 0

    const fileCategories = [
        { key: 'analysis_plots' as const, label: 'Analysis Plots', icon: Image, color: 'purple' },
        { key: 'logs' as const, label: 'Log Files', icon: FileText, color: 'yellow' },
        { key: 'structures' as const, label: 'Structure Files', icon: Layers, color: 'blue' },
        { key: 'trajectories' as const, label: 'Trajectories', icon: Activity, color: 'green' },
    ]

    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

    const handleViewStructure = async (file: ABFEFileInfo) => {
        const legDir = file.leg_dir || ''
        if (!legDir) return
        
        setLoadingFile(file.filename)
        try {
            const response = await fetch(`${API_BASE_URL}/api/abfe/file/${jobId}/${legDir}/${file.filename}`)
            if (!response.ok) throw new Error('Failed to fetch file')
            
            const pdbData = await response.text()
            const structure = {
                structure_id: `abfe_${jobId}_${file.filename}_${Date.now()}`,
                pdb_data: pdbData,
                format: 'pdb' as const,
                components: { protein: [], ligands: [], water: [], ions: [] }
            }
            addStructureTab(structure, file.description || file.filename.replace('.pdb', ''))
        } catch (err) {
            console.error('Failed to load structure:', err)
        } finally {
            setLoadingFile(null)
        }
    }

    const handleViewLog = async (file: ABFEFileInfo) => {
        const legDir = file.leg_dir || ''
        if (!legDir) return
        
        setLoadingFile(file.filename)
        try {
            const response = await fetch(`${API_BASE_URL}/api/abfe/file/${jobId}/${legDir}/${file.filename}`)
            if (!response.ok) throw new Error('Failed to fetch file')
            
            const logContent = await response.text()
            addInputFileTab(logContent, file.description || file.filename.replace('.log', ''))
        } catch (err) {
            console.error('Failed to load log:', err)
        } finally {
            setLoadingFile(null)
        }
    }

    const handleDownloadFile = (file: ABFEFileInfo) => {
        const legDir = file.leg_dir || ''
        if (!legDir) return
        
        const downloadUrl = `${API_BASE_URL}/api/abfe/file/${jobId}/${legDir}/${file.filename}`
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = file.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    // Filter files by selected repeat
    const getFilteredFiles = (files: ABFEFileInfo[] | undefined) => {
        if (!files) return []
        if (!hasRepeatInfo) return files
        return files.filter(f => f.repeat_num === undefined || f.repeat_num === selectedRepeat)
    }

    return (
        <div className="space-y-4">
            {/* Repeat Selector */}
            {hasRepeatInfo && repeats.length > 1 && (
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-300">Repeat</label>
                    <div className="flex gap-2 flex-wrap">
                        {repeats.map(repeat => (
                            <button
                                key={repeat}
                                onClick={() => setSelectedRepeat(repeat)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                    selectedRepeat === repeat
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                {repeat + 1}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Download Combined Log Button */}
            <div className="flex justify-end">
                <Button
                    onClick={onDownloadLog}
                    disabled={downloadingLog}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                >
                    {downloadingLog ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    Download Combined Log
                </Button>
            </div>

            {/* File Categories */}
            {fileCategories.map(category => {
                const files = getFilteredFiles(outputFiles[category.key])
                if (!files || files.length === 0) return null

                return (
                    <div key={category.key} className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                            <category.icon className={`w-4 h-4 text-${category.color}-400`} />
                            {category.label}
                            <span className="text-xs text-gray-500">({files.length})</span>
                        </h4>
                        <div className="space-y-1">
                            {files.map((file, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-2 bg-gray-900/50 rounded border border-gray-800 hover:border-gray-700 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            file.leg === 'complex' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'
                                        }`}>
                                            {file.leg}
                                        </span>
                                        <div>
                                            <p className="text-sm text-gray-300 font-mono">{file.filename}</p>
                                            {file.description && (
                                                <p className="text-xs text-gray-500">{file.description}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">{formatBytes(file.size_bytes)}</span>
                                        
                                        {/* View button for plots */}
                                        {file.file_type === 'plot' && file.leg_dir && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onOpenImage(
                                                    `/api/abfe/file/${jobId}/${file.leg_dir}/${file.filename}`,
                                                    file.description || file.filename
                                                )}
                                                className="h-7 px-2"
                                                title="View image"
                                            >
                                                <Eye className="w-3 h-3" />
                                            </Button>
                                        )}
                                        
                                        {/* View button for structures */}
                                        {file.file_type === 'structure' && file.leg_dir && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewStructure(file)}
                                                disabled={loadingFile === file.filename}
                                                className="h-7 px-2"
                                                title="View in 3D viewer"
                                            >
                                                {loadingFile === file.filename ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Eye className="w-3 h-3" />
                                                )}
                                            </Button>
                                        )}
                                        
                                        {/* View button for logs */}
                                        {file.file_type === 'log' && file.leg_dir && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewLog(file)}
                                                disabled={loadingFile === file.filename}
                                                className="h-7 px-2"
                                                title="View log"
                                            >
                                                {loadingFile === file.filename ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Eye className="w-3 h-3" />
                                                )}
                                            </Button>
                                        )}
                                        
                                        {/* Download button for all files */}
                                        {file.leg_dir && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDownloadFile(file)}
                                                className="h-7 px-2"
                                                title="Download file"
                                            >
                                                <Download className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}

            {Object.values(outputFiles).every(arr => !arr || arr.length === 0) && (
                <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                    <p className="text-gray-400">No output files available yet</p>
                </div>
            )}
        </div>
    )
}

export default ABFEDetailedAnalysis
