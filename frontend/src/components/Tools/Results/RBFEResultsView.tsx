import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, GitBranch, ArrowRight, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api } from '@/lib/api-client'

interface RBFEResultsViewProps {
    jobId: string
}

export function RBFEResultsView({ jobId }: RBFEResultsViewProps) {
    const [loading, setLoading] = useState(true)
    const [job, setJob] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        const fetchJob = async () => {
            try {
                setLoading(true)
                const data = await api.getJobDetails(jobId, { signal: controller.signal })
                setJob(data)
                setError(null)
            } catch (err: any) {
                if (controller.signal.aborted) return
                console.error('Failed to fetch RBFE job:', err)
                setError(err.message || 'Failed to load RBFE results')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        fetchJob()
        return () => controller.abort()
    }, [jobId])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                <p className="text-gray-400">Loading RBFE results...</p>
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
    const results = job.result || {}

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Status Banner */}
            <div className={`p - 4 rounded - xl border ${isCompleted ? 'bg-green-900/20 border-green-500/50' : isFailed ? 'bg-red-900/20 border-red-500/50' : 'bg-cyan-900/20 border-cyan-500/50'} `}>
                <div className="flex items-center gap-3">
                    {isCompleted ? (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : isFailed ? (
                        <XCircle className="w-6 h-6 text-red-500" />
                    ) : (
                        <Clock className="w-6 h-6 text-cyan-500 animate-spin" />
                    )}
                    <div>
                        <h3 className={`font - bold ${isCompleted ? 'text-green-400' : isFailed ? 'text-red-400' : 'text-cyan-400'} `}>
                            {isCompleted ? 'Calculation Completed' : isFailed ? 'Calculation Failed' : 'Calculation in Progress'}
                        </h3>
                        <p className="text-sm text-gray-400">Job ID: {job.job_id}</p>
                    </div>
                </div>
            </div>

            {isCompleted && results.ddg_values && (
                <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                            <div className="text-sm text-gray-400 mb-1 uppercase tracking-wider font-medium">Transformations</div>
                            <div className="text-2xl font-bold text-white">{results.ddg_values.length}</div>
                        </div>
                        <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                            <div className="text-sm text-gray-400 mb-1 uppercase tracking-wider font-medium">Reference Ligand</div>
                            <div className="text-2xl font-bold text-white truncate">{results.reference_ligand || 'N/A'}</div>
                        </div>
                    </div>

                    {/* DDG Results Table */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-cyan-400" />
                            <h4 className="font-medium text-white">Relative Binding Free Energies</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-900/50">
                                    <tr>
                                        <th className="px-4 py-3">Transformation</th>
                                        <th className="px-4 py-3 text-right">ΔΔG (kcal/mol)</th>
                                        <th className="px-4 py-3 text-right">Uncertainty</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {results.ddg_values.map((ddg: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-700/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 text-gray-300">
                                                    <span className="font-medium text-white">{ddg.ligand_a}</span>
                                                    <ArrowRight className="w-3 h-3 text-gray-500" />
                                                    <span className="font-medium text-white">{ddg.ligand_b}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                <span className={ddg.ddg_kcal_mol < 0 ? 'text-green-400' : 'text-red-400'}>
                                                    {ddg.ddg_kcal_mol > 0 ? '+' : ''}{ddg.ddg_kcal_mol.toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-gray-400">
                                                ± {ddg.uncertainty_kcal_mol.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Relative Affinities */}
                    {results.relative_affinities && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-gray-400">Relative Affinities (vs Reference)</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {Object.entries(results.relative_affinities)
                                    .sort(([, a]: any, [, b]: any) => a - b)
                                    .map(([ligand, affinity]: any) => (
                                        <div key={ligand} className="p-3 bg-gray-800/30 rounded-lg border border-gray-700/50 flex justify-between items-center">
                                            <span className="text-sm text-gray-300 truncate mr-2">{ligand}</span>
                                            <span className={`text-sm font-mono font-bold ${affinity <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {affinity > 0 ? '+' : ''}{affinity.toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
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
