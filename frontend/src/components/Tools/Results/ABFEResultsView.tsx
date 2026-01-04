import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, TrendingDown, TrendingUp, BarChart3, Clock, CheckCircle, XCircle, GitBranch, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import { ABFEDetailedAnalysis } from '../ABFE/ABFEDetailedAnalysis'

interface ABFEResultsViewProps {
    jobId: string
}

export function ABFEResultsView({ jobId }: ABFEResultsViewProps) {
    const [loading, setLoading] = useState(true)
    const [job, setJob] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [parsedResults, setParsedResults] = useState<any>(null)
    const [loadingParsed, setLoadingParsed] = useState(false)

    useEffect(() => {
        const fetchJob = async () => {
            try {
                setLoading(true)
                const data = await api.getJobDetails(jobId)
                setJob(data)
                setError(null)

                if (data.status === 'completed') {
                    fetchParsedResults()
                }
            } catch (err: any) {
                console.error('Failed to fetch ABFE job:', err)
                setError(err.message || 'Failed to load ABFE results')
            } finally {
                setLoading(false)
            }
        }

        const fetchParsedResults = async () => {
            try {
                setLoadingParsed(true)
                const data = await api.parseABFEResults(jobId)
                setParsedResults(data)
            } catch (err) {
                console.error('Failed to parse ABFE results:', err)
            } finally {
                setLoadingParsed(false)
            }
        }

        fetchJob()
    }, [jobId])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-gray-400">Loading ABFE results...</p>
            </div>
        )
    }

    if (error || !job) {
        return (
            <div className="p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Error Loading Results</h3>
                <p className="text-gray-400 mb-6">{error || 'Job not found'}</p>
                <Button onClick={() => window.location.reload()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        )
    }

    const isCompleted = job.status === 'completed'
    const isFailed = job.status === 'failed'

    const getDGInterpretation = (dg: number) => {
        if (dg < -10) return { text: 'Very strong binding', color: 'text-green-400' }
        if (dg < -5) return { text: 'Strong binding', color: 'text-green-300' }
        if (dg < -2) return { text: 'Moderate binding', color: 'text-yellow-400' }
        if (dg < 0) return { text: 'Weak binding', color: 'text-orange-400' }
        return { text: 'Very weak/no binding', color: 'text-red-400' }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Status Banner */}
            <div className={`p-4 rounded-xl border ${isCompleted ? 'bg-green-900/20 border-green-500/50' : isFailed ? 'bg-red-900/20 border-red-500/50' : 'bg-blue-900/20 border-blue-500/50'}`}>
                <div className="flex items-center gap-3">
                    {isCompleted ? (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : isFailed ? (
                        <XCircle className="w-6 h-6 text-red-500" />
                    ) : (
                        <Clock className="w-6 h-6 text-blue-500 animate-pulse" />
                    )}
                    <div>
                        <h3 className={`font-bold ${isCompleted ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-blue-400'}`}>
                            {isCompleted ? 'Calculation Completed' : isFailed ? 'Calculation Failed' : 'Calculation in Progress'}
                        </h3>
                        <p className="text-sm text-gray-400">Job ID: {job.job_id}</p>
                    </div>
                </div>
            </div>

            {isCompleted && (
                <div className="space-y-6">
                    {/* Main Results */}
                    {parsedResults?.dg_results?.map((dgResult: any, idx: number) => {
                        const interpretation = getDGInterpretation(dgResult.dg_kcal_mol)
                        return (
                            <div key={idx} className="p-6 bg-gradient-to-br from-gray-800 to-gray-800/50 rounded-xl border border-gray-700">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-sm text-gray-400 mb-1 uppercase tracking-wider font-medium">Binding Free Energy (ΔG)</p>
                                        <p className="text-xs text-gray-500">Ligand: {dgResult.ligand}</p>
                                    </div>
                                    {dgResult.dg_kcal_mol < 0 ? (
                                        <TrendingDown className="w-6 h-6 text-green-400" />
                                    ) : (
                                        <TrendingUp className="w-6 h-6 text-red-400" />
                                    )}
                                </div>
                                <div className="text-center mb-4">
                                    <p className="text-4xl font-bold text-blue-400 mb-1">
                                        {dgResult.dg_kcal_mol.toFixed(2)}
                                        <span className="text-lg font-normal text-blue-300/50 ml-1">kcal/mol</span>
                                    </p>
                                    <p className="text-sm text-gray-400">
                                        Uncertainty: ± {dgResult.uncertainty_kcal_mol.toFixed(2)} kcal/mol
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className={`text-sm font-medium ${interpretation.color}`}>
                                        {interpretation.text}
                                    </p>
                                </div>
                            </div>
                        )
                    })}

                    {/* Detailed Analysis */}
                    <ABFEDetailedAnalysis jobId={jobId} />
                </div>
            )}

            {isFailed && job.error && (
                <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-xl">
                    <p className="text-sm font-semibold text-red-400 mb-2">Error Details</p>
                    <pre className="text-xs text-gray-300 font-mono overflow-auto max-h-48 p-2 bg-black/20 rounded">
                        {job.error}
                    </pre>
                </div>
            )}
        </div>
    )
}
