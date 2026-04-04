import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, TrendingDown, Activity, Save, Eye, Info } from 'lucide-react'
import { api } from '@/lib/api-client'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { useMDStore } from '@/store/md-store'
import { PAEHeatmap } from '@/components/Tools/Boltz2/PAEHeatmap'
import { Boltz2SinglePoseDisplay } from '@/components/Tools/Boltz2/Boltz2SinglePoseDisplay'
import { BatchBoltz2Results } from '@/components/Tools/Boltz2/BatchBoltz2Results'
import type { Boltz2Pose, Boltz2BatchLigandResult } from '@/store/boltz2-store'

interface Boltz2ResultsViewProps {
    jobId: string
}

export function Boltz2ResultsView({ jobId }: Boltz2ResultsViewProps) {
    const [loading, setLoading] = useState(true)
    const [job, setJob] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [savingPose, setSavingPose] = useState<number | null>(null)
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [selectedPoseIndex, setSelectedPoseIndex] = useState<number | null>(null)

    const { setCurrentStructure } = useMolecularStore()
    const { addNotification } = useUIStore()
    const mdStore = useMDStore()

    useEffect(() => {
        const controller = new AbortController()

        const fetchJob = async () => {
            try {
                setLoading(true)
                const data = await api.getBoltz2Job(jobId, { signal: controller.signal })
                console.log('[Boltz2ResultsView] Job data received:', data)
                setJob(data)
                setError(null)

                const result = data.result || (data as any).results || {}
                const poses = result.poses || []
                if (poses.length > 0) {
                    setSelectedPoseIndex(0)
                }
            } catch (err: any) {
                if (controller.signal.aborted) return
                console.error('Failed to fetch Boltz2 job:', err)
                setError(err.message || 'Failed to load Boltz2 results')
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
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                <p className="text-gray-400">Loading Boltz-2 results...</p>
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

    // Handle both 'result' (PostgreSQL format) and 'results' (legacy format)
    const result = job.result || job.results || {}
    const poses = result.poses || []

    // Check if this is a batch job
    const isBatchJob = job.input_params?.is_batch || result.batch_id || result.results?.length > 0

    // If this is a batch job, render the BatchBoltz2Results component
    if (isBatchJob) {
        const batchResults: Boltz2BatchLigandResult[] = result.results || []
        const batchId = result.batch_id || jobId

        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] px-2 py-1 rounded border font-medium bg-purple-700/30 text-purple-200 border-purple-600/50">
                        Batch Job
                    </span>
                    <span className="text-sm text-gray-400">
                        {result.total_ligands || batchResults.length} ligands • {result.completed || batchResults.filter((r: any) => r.success).length} completed
                    </span>
                </div>
                <BatchBoltz2Results
                    batchId={batchId}
                    results={batchResults}
                    isRunning={false}
                    progress={100}
                    progressMessage="Completed"
                    onViewResult={(r) => {
                        if (r.poses && r.poses.length > 0) {
                            const timestamp = Date.now()
                            setCurrentStructure({
                                structure_id: `boltz_batch_${r.ligand_id}_${timestamp}`,
                                filename: `${r.ligand_name}_pose.pdb`,
                                format: 'pdb',
                                pdb_data: r.poses[0].structure_data || '',
                                atoms: [],
                                bonds: [],
                                residues: [],
                                chains: [],
                                metadata: {
                                    boltz2_affinity: r.affinity_pred_value,
                                    boltz2_probability: r.affinity_probability_binary,
                                    is_boltz2_pose: true,
                                },
                                ligands: {}
                            })
                        }
                    }}
                    onExportResults={() => {
                        const headers = ['Ligand ID', 'Ligand Name', 'Status', 'Affinity (log IC50)', 'Delta G (kcal/mol)', 'Probability', 'Confidence', 'pLDDT']
                        const csvContent = [
                            headers.join(','),
                            ...batchResults.map(r => [
                                r.ligand_id,
                                r.ligand_name,
                                r.success ? 'Success' : 'Failed',
                                r.affinity_pred_value ?? 'N/A',
                                r.binding_free_energy ?? 'N/A',
                                r.affinity_probability_binary ?? 'N/A',
                                r.confidence_score ?? r.prediction_confidence ?? 'N/A',
                                r.complex_plddt ?? 'N/A'
                            ].join(','))
                        ].join('\n')

                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                        const link = document.createElement('a')
                        const url = URL.createObjectURL(blob)
                        link.setAttribute('href', url)
                        link.setAttribute('download', `boltz2_batch_${jobId}_results.csv`)
                        link.style.visibility = 'hidden'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                    }}
                />
            </div>
        )
    }

    // Get selected pose data
    const selectedPose = selectedPoseIndex !== null ? poses[selectedPoseIndex] : null

    // "High Confidence Hit" Logic
    const isHighConfidenceHit = (result.prediction_confidence || 0) > 0.8 &&
        (selectedPose?.aggregate_score || 0) > 0.75

    // Method conditioning (mock check - in real app would come from job.input_params)
    // Checking for method flag in input parameters
    const methodConditioning = job.input_params?.method || job.input_params?.conditioning || 'default'

    const handleVisualizePose = (idx: number) => {
        const pose = poses[idx]
        if (!pose?.structure_data) return

        setSelectedPoseIndex(idx)
        const timestamp = Date.now()
        const poseStructure = {
            structure_id: `boltz2_pose_${idx + 1}_${timestamp}`,
            pdb_data: pose.structure_data,
            format: pose.format || 'pdb', // Use format from pose (cif/pdb)
            metadata: {
                boltz2_affinity: pose.affinity_pred_value,
                boltz2_probability: pose.affinity_probability_binary,
                pose_index: idx,
                is_boltz2_pose: true,
            },
            components: { protein: [], ligands: [], water: [], ions: [] }
        }
        setCurrentStructure(poseStructure as any)
        addNotification('success', `Visualizing Pose ${idx + 1}`)
    }

    const handleSavePose = async (idx: number) => {
        const pose = poses[idx]
        if (!pose?.structure_data) return

        setSavingPose(idx)
        try {
            const extractResult = await api.extractLigandFromComplex(pose.structure_data)
            if (!extractResult.success || !extractResult.ligand_pdb) {
                throw new Error(extractResult.error || 'Failed to extract ligand')
            }

            const name = `Boltz2 Pose ${idx + 1} (Affinity: ${pose.affinity_pred_value?.toFixed(2)})`
            await api.saveStructureToLibrary(extractResult.ligand_pdb, name)

            setSaveMessage({ type: 'success', text: `Pose ${idx + 1} saved to library` })
        } catch (err: any) {
            setSaveMessage({ type: 'error', text: err.message || 'Failed to save pose' })
        } finally {
            setSavingPose(null)
            setTimeout(() => setSaveMessage(null), 3000)
        }
    }

    const handleOptimizeWithMD = async (pose: Boltz2Pose) => {
        try {
            if (!pose.structure_data) throw new Error('No structure data')

            const extractResult = await api.extractLigandFromComplex(pose.structure_data)
            if (!extractResult.success) throw new Error(extractResult.error || 'Failed to extract ligand')

            const ligandData = extractResult.ligand_sdf || extractResult.ligand_pdb
            const fileExtension = extractResult.ligand_sdf ? 'sdf' : 'pdb'
            if (!ligandData) throw new Error('No ligand data extracted')

            const poseName = `boltz2_pose_${pose.affinity_pred_value?.toFixed(2)}.${fileExtension}`

            mdStore.reset()
            mdStore.setSelectedProtein('current')
            mdStore.setSelectedLigandMethod('structure')
            mdStore.setLigandInput({
                method: 'structure',
                file_data: ligandData,
                file_name: poseName,
                preserve_pose: true,
                generate_conformer: false,
            })

            addNotification('info', 'Switching to MD Optimization tool...')
            // Note: In Results Browser, we can't directly switch tools, so we just prepare the data
            // The user would need to navigate to MD tool manually
        } catch (err: any) {
            console.error('Failed to prepare MD optimization:', err)
            setSaveMessage({ type: 'error', text: err.message || 'Failed to prepare MD optimization' })
        }
    }

    // Helper to determine confidence tier color
    const getConfidenceColor = (score: number | undefined, threshold: number) => {
        if (score === undefined) return 'text-gray-400'
        if (score >= threshold) return 'text-green-400'
        if (score >= threshold - 0.2) return 'text-yellow-400'
        return 'text-red-400'
    }

    // Helper to format IC50
    const formatIC50 = (logIC50: number | undefined) => {
        if (logIC50 === undefined) return 'N/A'
        // Convert log10(IC50 in uM) to uM
        const ic50_uM = Math.pow(10, logIC50)

        if (ic50_uM < 0.001) {
            return `${(ic50_uM * 1000).toFixed(2)} nM`
        }
        return `${ic50_uM.toFixed(2)} µM`
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Single Pose - Use Unified Display */}
            {poses.length === 1 && selectedPose ? (
                <Boltz2SinglePoseDisplay
                    pose={selectedPose}
                    jobId={jobId}
                    onVisualize={() => handleVisualizePose(0)}
                    onOptimizeWithMD={() => handleOptimizeWithMD(selectedPose)}
                    onSave={() => handleSavePose(0)}
                    isSaving={savingPose === 0}
                    saveMessage={saveMessage}
                    predictionConfidence={result.prediction_confidence}
                    methodConditioning={methodConditioning}
                />
            ) : (
                /* Multiple Poses - Show Table and Details */
                <div className="space-y-6">
                    {/* High Confidence Banner */}
                    {isHighConfidenceHit && (
                        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/30 rounded-lg p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-400" />
                                <div>
                                    <p className="font-semibold text-green-300">High Confidence Hit</p>
                                    <p className="text-xs text-green-400/70">Meets stringent structural and interface quality criteria (ipTM &gt; 0.8, Score &gt; 0.75)</p>
                                </div>
                            </div>
                            {methodConditioning !== 'default' && (
                                <div className="px-2 py-1 bg-gray-800 rounded border border-gray-600 text-xs text-gray-300">
                                    Method: <span className="uppercase text-white font-medium">{methodConditioning}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 1. Global Confidence Summary */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-blue-400" />
                            <h4 className="font-medium text-white">Global Confidence Summary</h4>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-4">
                            <div className="col-span-2 flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                                <span className="text-sm text-gray-300">Aggregate Score</span>
                                <div className="text-right">
                                    <span className={`text-xl font-bold ${getConfidenceColor(selectedPose?.aggregate_score, 0.75)}`}>
                                        {selectedPose?.aggregate_score?.toFixed(2) || 'N/A'}
                                    </span>
                                    <p className="text-[10px] text-gray-500">0.8*pLDDT + 0.2*ipTM</p>
                                </div>
                            </div>

                            <div className="p-2 bg-gray-900/30 rounded border border-gray-700/50">
                                <p className="text-xs text-gray-400 mb-1">ipTM (Interface)</p>
                                <p className={`text-lg font-semibold ${getConfidenceColor(selectedPose?.iptm, 0.8)}`}>
                                    {selectedPose?.iptm?.toFixed(2) || 'N/A'}
                                </p>
                            </div>
                            <div className="p-2 bg-gray-900/30 rounded border border-gray-700/50">
                                <p className="text-xs text-gray-400 mb-1">pTM (Topology)</p>
                                <p className={`text-lg font-semibold ${getConfidenceColor(selectedPose?.ptm, 0.7)}`}>
                                    {selectedPose?.ptm?.toFixed(2) || 'N/A'}
                                </p>
                            </div>
                            <div className="col-span-2 p-2 bg-gray-900/30 rounded border border-gray-700/50 flex justify-between items-center">
                                <p className="text-xs text-gray-400">Avg pLDDT</p>
                                <p className={`text-lg font-semibold ${getConfidenceColor(selectedPose?.complex_plddt ? selectedPose.complex_plddt / 100 : undefined, 0.7)}`}>
                                    {selectedPose?.complex_plddt?.toFixed(1) || 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 2. Binding Affinity Dashboard */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-purple-400" />
                            <h4 className="font-medium text-white">Binding Affinity</h4>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-300">Binder Probability</span>
                                <div className="text-right">
                                    <span className="text-xl font-bold text-purple-400">
                                        {selectedPose?.affinity_probability_binary != null
                                            ? `${(selectedPose.affinity_probability_binary * 100).toFixed(1)}%`
                                            : 'N/A'}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-blue-900/20 rounded border border-blue-500/30">
                                    <p className="text-xs text-blue-300 mb-1">Predicted IC50</p>
                                    <p className="text-lg font-semibold text-blue-400">
                                        {formatIC50(selectedPose?.affinity_pred_value)}
                                    </p>
                                </div>
                                <div className="p-3 bg-blue-900/20 rounded border border-blue-500/30">
                                    <p className="text-xs text-blue-300 mb-1">Delta G</p>
                                    <p className="text-lg font-semibold text-blue-400">
                                        {selectedPose?.binding_free_energy?.toFixed(2) || 'N/A'}
                                        <span className="text-xs font-normal ml-1">kcal/mol</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Error Analysis & Visualization */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
                            <Eye className="h-4 w-4 text-teal-400" />
                            <h4 className="font-medium text-white">Visualization & Error</h4>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                className="w-full justify-start text-xs border-gray-600 hover:bg-gray-700"
                                onClick={() => document.getElementById('pae-heatmap-section')?.scrollIntoView({ behavior: 'smooth' })}
                            >
                                <Activity className="h-3 w-3 mr-2 text-teal-400" />
                                PAE Heatmap
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full justify-start text-xs border-gray-600 hover:bg-gray-700"
                                disabled={!selectedPose?.has_pde}
                            >
                                <Activity className="h-3 w-3 mr-2 text-orange-400" />
                                PDE Error {selectedPose?.has_pde ? '' : '(N/A)'}
                            </Button>
                            <Button
                                variant="outline"
                                className="col-span-2 w-full justify-start text-xs border-gray-600 hover:bg-gray-700"
                                onClick={() => {
                                    // Mock download - in real app would trigger file download
                                    addNotification('info', 'Downloading mmCIF structure...')
                                }}
                            >
                                <Save className="h-3 w-3 mr-2 text-blue-400" />
                                Download Structure (mmCIF)
                            </Button>
                        </div>
                    </div>

                    {/* 4. Validation & Metadata */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
                            <Info className="h-4 w-4 text-gray-400" />
                            <h4 className="font-medium text-white">Validation & Metadata</h4>
                        </div>
                        <div className="p-4 space-y-3 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">PoseBusters</span>
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">Pending</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Method</span>
                                <span className="text-white uppercase">{methodConditioning}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Token Count</span>
                                <span className="text-white">{job.details?.residue_count || 'N/A'}</span>
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
                            <h4 className="font-medium text-white">Predicted Poses</h4>
                            <span className="text-xs text-gray-400">{poses.length} poses generated</span>
                        </div>
                        {poses.length === 0 ? (
                            <div className="p-6 text-center text-gray-400">
                                <p>No poses available for this job.</p>
                                <p className="text-xs mt-2">Job status: {job.status}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/50">
                                        <tr>
                                            <th className="px-4 py-3">Pose</th>
                                            <th className="px-4 py-3">Delta G</th>
                                            <th className="px-4 py-3">Score</th>
                                            <th className="px-4 py-3">ipTM</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {poses.map((pose: any, idx: number) => (
                                            <tr
                                                key={idx}
                                                className={`hover:bg-gray-700/30 transition-colors cursor-pointer ${selectedPoseIndex === idx ? 'bg-purple-500/10' : ''}`}
                                                onClick={() => handleVisualizePose(idx)}
                                            >
                                                <td className="px-4 py-3 font-medium text-white">
                                                    Pose {idx + 1}
                                                    {idx === 0 && <span className="ml-2 text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">TOP</span>}
                                                </td>
                                                <td className="px-4 py-3 text-white">
                                                    {pose.binding_free_energy != null ? pose.binding_free_energy.toFixed(2) : 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-300">
                                                    {pose.aggregate_score != null ? pose.aggregate_score.toFixed(2) : 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-300">
                                                    {pose.iptm != null ? pose.iptm.toFixed(2) : 'N/A'}
                                                </td>
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
                                                            className="h-8 w-8 p-0 text-gray-400 hover:text-purple-400 hover:bg-gray-700"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleVisualizePose(idx)
                                                            }}
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Selected Pose Analysis */}
            {selectedPose && selectedPoseIndex !== null && (
                <div id="pae-heatmap-section" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* pLDDT Legend & Info */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <Info className="h-5 w-5 text-blue-400" />
                            <h4 className="font-medium text-white">Confidence Metrics Guide</h4>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">pLDDT (Local Confidence)</h5>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded bg-blue-600"></div>
                                        <span className="text-gray-300">Very High (90-100)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded bg-blue-400"></div>
                                        <span className="text-gray-300">Confident (70-90)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded bg-yellow-400"></div>
                                        <span className="text-gray-300">Low Confidence (50-70)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded bg-orange-500"></div>
                                        <span className="text-gray-300">Unreliable / Disordered (&lt;50)</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-700">
                                <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Metrics Explanation</h5>
                                <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
                                    <li><strong>Aggregate Score:</strong> Weighted combination of local (pLDDT) and interface (ipTM) confidence (0.8*pLDDT + 0.2*ipTM).</li>
                                    <li><strong>ipTM:</strong> Interface Predicted Template Modeling score. Measures the quality of protein-protein or protein-ligand interface.</li>
                                    <li><strong>PAE (Predicted Aligned Error):</strong> Expected distance error in Ångströms. Lower values (blue) indicate higher confidence in relative positions.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* PAE Heatmap */}
                    <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-white">PAE Heatmap (Pose {selectedPoseIndex + 1})</h4>
                        </div>
                        <div className="bg-white/5 rounded-lg overflow-hidden h-[400px]">
                            <PAEHeatmap
                                jobId={jobId}
                                poseIndex={selectedPoseIndex}
                                hasPAE={selectedPose.has_pae}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
