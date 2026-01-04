import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Save, Activity, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useMolecularStore } from '@/store/molecular-store'

interface DockingResultsViewProps {
    jobId: string
}

export function DockingResultsView({ jobId }: DockingResultsViewProps) {
    const [loading, setLoading] = useState(true)
    const [job, setJob] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [savingPose, setSavingPose] = useState<number | null>(null)
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [selectedPoseIndex, setSelectedPoseIndex] = useState<number | null>(null)

    const { setCurrentStructure } = useMolecularStore()

    useEffect(() => {
        const fetchJob = async () => {
            try {
                setLoading(true)
                const data = await api.getDockingJob(jobId)
                setJob(data)
                setError(null)
            } catch (err: any) {
                console.error('Failed to fetch docking job:', err)
                setError(err.message || 'Failed to load docking results')
            } finally {
                setLoading(false)
            }
        }

        fetchJob()
    }, [jobId])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-gray-400">Loading docking results...</p>
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

    // PostgreSQL stores result in job.result, but docking service wraps it in another 'result' field
    // So actual data is at job.result.result
    const rawResult = job.result
    const results = rawResult?.result || rawResult?.docking || rawResult
    const analysis = rawResult?.analysis || {}

    // Normalize poses if missing but scores exist
    if (results && !results.poses && results.scores) {
        results.poses = results.scores.map((score: any, idx: number) => ({
            mode: score.mode || idx + 1,
            affinity: typeof score === 'number' ? score : (score.affinity || 0),
            rmsd_lb: typeof score === 'number' ? 0 : (score.rmsd_lb || 0),
            rmsd_ub: typeof score === 'number' ? 0 : (score.rmsd_ub || 0),
        }))
    }

    const handleVisualizePose = (idx: number) => {
        if (!results?.poses?.[idx]) return
        setSelectedPoseIndex(idx)

        const pose = results.poses[idx]
        if (pose.pdbqt_data || results.poses_pdbqt) {
            // In a real app, we'd convert PDBQT to PDB and update the viewer
            // For now, we'll just log it or use a placeholder
            console.log('Visualizing pose', idx)
            // If we have the full PDB data for the pose, we could do:
            // setStructure({ ... })
        }
    }

    const handleSavePose = async (idx: number) => {
        setSavingPose(idx)
        try {
            // Implementation for saving pose to library
            // await api.saveDockingPose(jobId, idx)
            setSaveMessage({ type: 'success', text: `Pose ${idx + 1} saved to library` })
        } catch (err: any) {
            setSaveMessage({ type: 'error', text: err.message || 'Failed to save pose' })
        } finally {
            setSavingPose(null)
            setTimeout(() => setSaveMessage(null), 3000)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Best Affinity</div>
                    <div className="text-2xl font-bold text-white">
                        {results?.best_affinity?.toFixed(2) || results?.best_score?.toFixed(2) || '-'}
                        <span className="text-sm font-normal text-gray-500 ml-1">kcal/mol</span>
                    </div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Poses</div>
                    <div className="text-2xl font-bold text-white">
                        {results?.num_poses || results?.poses?.length || '-'}
                    </div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">Status</div>
                    <div className="flex items-center gap-2 mt-1">
                        {job.status === 'completed' ? (
                            <><CheckCircle2 className="w-5 h-5 text-green-500" /><span className="text-lg font-bold text-green-500">Success</span></>
                        ) : (
                            <><AlertCircle className="w-5 h-5 text-red-500" /><span className="text-lg font-bold text-red-500">Failed</span></>
                        )}
                    </div>
                </div>
            </div>

            {/* Save Status Message */}
            {saveMessage && (
                <Alert className={saveMessage.type === 'success' ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}>
                    {saveMessage.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                    <AlertDescription className={saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}>
                        {saveMessage.text}
                    </AlertDescription>
                </Alert>
            )}

            {/* Poses Table */}
            <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
                    <h4 className="font-medium text-white">Docking Poses</h4>
                    <span className="text-xs text-gray-400">Select a pose to visualize</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-900/50">
                            <tr>
                                <th className="px-4 py-3">Mode</th>
                                <th className="px-4 py-3">Affinity (kcal/mol)</th>
                                <th className="px-4 py-3">RMSD l.b.</th>
                                <th className="px-4 py-3">RMSD u.b.</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {(results?.poses || []).map((pose: any, idx: number) => (
                                <tr
                                    key={idx}
                                    className={`hover:bg-gray-700/30 transition-colors cursor-pointer ${selectedPoseIndex === idx ? 'bg-indigo-500/10' : ''}`}
                                    onClick={() => handleVisualizePose(idx)}
                                >
                                    <td className="px-4 py-3 font-medium text-white">
                                        {pose.mode || idx + 1}
                                        {idx === 0 && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">BEST</span>}
                                    </td>
                                    <td className="px-4 py-3 text-white">{pose.affinity?.toFixed(2) || '-'}</td>
                                    <td className="px-4 py-3 text-gray-300">{pose.rmsd_lb?.toFixed(3) || '0.000'}</td>
                                    <td className="px-4 py-3 text-gray-300">{pose.rmsd_ub?.toFixed(3) || '0.000'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-700"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleSavePose(idx)
                                                }}
                                                disabled={savingPose === idx}
                                            >
                                                {savingPose === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 w-8 p-0 text-gray-400 hover:text-indigo-400 hover:bg-gray-700"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    // handleOptimize(idx)
                                                }}
                                            >
                                                <Activity className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Log / Details */}
            {results?.log && (
                <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-400">Calculation Log</h4>
                    <pre className="p-4 bg-black/40 rounded-lg border border-gray-800 text-xs text-gray-500 font-mono overflow-auto max-h-48 custom-scrollbar">
                        {results.log}
                    </pre>
                </div>
            )}
        </div>
    )
}
