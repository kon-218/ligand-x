'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Save, Activity, CheckCircle, XCircle, Clock, Layers, Download, Target } from 'lucide-react'
import { downloadCSV } from '@/lib/csv-export'
import type { DockingResults, DockingPose } from '@/types/docking'
import { useDockingStore } from '@/store/batch-docking-store' // Using renamed generic store
import { api } from '@/lib/api-client'
import { UnifiedJobList, ResultsContainer, ResultsTable, NoJobSelectedState } from '../shared'
import { useUnifiedResultsStore } from '@/store/unified-results-store'

// Colors matching POSE_SURFACE_COLORS in MolecularViewer (hex strings for CSS)
const POSE_SURFACE_COLORS_HEX = ['#00CC66', '#FF8C00', '#BB44FF', '#00CCFF', '#FFCC00', '#FF4444', '#44AAFF', '#FF88CC', '#88FFCC']

interface DockingStepResultsProps {
    isDockingRunning: boolean
    dockingProgress: number
    dockingStatus: string
    dockingResults: DockingResults | null
    selectedPoseIndex: number | null
    savingPose: number | null
    saveMessage: { type: 'success' | 'error'; text: string } | null
    onVisualizePose: (poseIndex: number) => void
    onVisualizeMultiplePoses?: (poseIndices: number[]) => void
    onSavePose: (poseIndex: number) => void
    onOptimizeWithMD: (poseIndex: number) => void
    onClearPoses: () => void
    onJobSelected?: (jobId: string | null) => void // Optional callback for parent to handle if needed
}

export function DockingStepResults({
    isDockingRunning,
    dockingProgress,
    dockingStatus,
    dockingResults,
    selectedPoseIndex,
    savingPose,
    saveMessage,
    onVisualizePose,
    onVisualizeMultiplePoses,
    onSavePose,
    onOptimizeWithMD,
    onClearPoses,
    onJobSelected
}: DockingStepResultsProps) {
    const [multiSelectIndices, setMultiSelectIndices] = useState<Set<number>>(new Set())

    const dockingStore = useDockingStore()
    const {
        resultsTab,
        setResultsTab,
        cancelJob,
        deleteJob,
        loadAllJobs,
        getFilteredJobs,
    } = useUnifiedResultsStore()

    // Load jobs on mount
    useEffect(() => {
        loadAllJobs()
    }, [])

    const filteredJobs = getFilteredJobs().filter(j => j.service === 'docking')

    const handleSelectJob = async (jobId: string | null) => {
        dockingStore.setActiveJobId(jobId)
        if (onJobSelected) {
            onJobSelected(jobId)
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle className="w-4 h-4 text-green-400" />
            case 'failed': return <XCircle className="w-4 h-4 text-red-400" />
            case 'running': return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
            default: return <Clock className="w-4 h-4 text-yellow-400" />
        }
    }

    return (
        <div className="h-full flex flex-col">
            {/* Job List Sidebar - Only show if not running active docking? Or always? */}
            {/* Integrating sidebar layout similar to other tools */}

            {/* Layout: Sidebar | Main Content */}
            {/* Since DockingTool structure passes this as a component inside WorkflowContainer, 
                 we might need to adjust the layout. WorkflowContainer usually has content area.
                 We will render the sidebar inside this component. */}

            <div className="flex-1 flex flex-col space-y-4">
                {/* Job List */}
                <UnifiedJobList
                    jobs={filteredJobs}
                    activeJobId={dockingStore.activeJobId}
                    onSelectJob={(jobId) => handleSelectJob(jobId)}
                    onCancelJob={(jobId, service) => cancelJob(jobId, service)}
                    onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
                    resultsTab={resultsTab}
                    onTabChange={setResultsTab}
                    showServiceBadge={false}
                    accentColor="indigo"
                    title="Docking Jobs"
                    maxHeight="160px"
                />

                {/* Main Results Area */}
                {isDockingRunning && (
                    <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                            <span>{dockingStatus}</span>
                            <span>{dockingProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div
                                className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${dockingProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!dockingStore.activeJobId && !dockingResults && !isDockingRunning && (
                    <NoJobSelectedState
                        icon={Target}
                        description="Select a job from the list or run a new docking job"
                    />
                )}

                {dockingStore.activeJobId && !dockingResults && !isDockingRunning && (
                    <div className="flex items-center justify-center h-64 text-gray-400">
                        <p>No results available for selected job</p>
                    </div>
                )}

                {/* Results Summary */}
                {dockingResults && dockingResults.success && (
                    <div className="space-y-4">
                        {/* Check if this is a batch result */}
                        {dockingResults.results && dockingResults.results.length > 0 ? (
                            <ResultsContainer
                                status="success"
                                title="Batch Docking Results"
                                subtitle={`Processed ${dockingResults.results.length} ligands`}
                                onNewCalculation={onClearPoses}
                                accentColor="indigo"
                            >
                                <ResultsTable
                                    columns={[
                                        { key: 'ligand', label: 'Ligand', align: 'left' },
                                        { key: 'affinity', label: 'Best Affinity', align: 'right' },
                                        { key: 'status', label: 'Status', align: 'center' },
                                        { key: 'actions', label: 'Actions', align: 'center' },
                                    ]}
                                    data={dockingResults.results.map((r: any, idx) => ({
                                        ligand: r.ligand_name,
                                        affinity: r.result?.best_affinity != null ? r.result.best_affinity.toFixed(2) : 'N/A',
                                        status: r.status,
                                        actions: (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    // view ligand details
                                                }}
                                            >
                                                <Activity className="h-4 w-4 mr-1" /> View
                                            </Button>
                                        )
                                    }))}
                                    accentColor="indigo"
                                />
                            </ResultsContainer>
                        ) : (
                            <>
                                {/* Single Result View (Internal grid cards) */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 bg-gray-800 rounded-lg text-center">
                                        <div className="text-sm text-gray-400">Best Score</div>
                                        <div className="text-2xl font-semibold text-white mt-1">
                                            {dockingResults.best_affinity?.toFixed(2) || '-'}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-800 rounded-lg text-center">
                                        <div className="text-sm text-gray-400">Poses Generated</div>
                                        <div className="text-2xl font-semibold text-white mt-1">
                                            {dockingResults.num_poses || '-'}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-800 rounded-lg text-center">
                                        <div className="text-sm text-gray-400">Binding Strength</div>
                                        <div className="text-2xl font-semibold text-white mt-1">
                                            {dockingResults.binding_strength || '-'}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Scores Table */}
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h4 className="text-base font-medium text-indigo-400">Docking Scores</h4>
                                    <p className="text-sm text-gray-400 mt-1">Click a row to view that pose · Check multiple to compare</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {dockingResults.poses && dockingResults.poses.length > 0 && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => downloadCSV(
                                                [
                                                    { key: 'mode', label: 'Pose' },
                                                    { key: 'affinity', label: 'Affinity (kcal/mol)' },
                                                    { key: 'rmsd_lb', label: 'RMSD l.b.' },
                                                    { key: 'rmsd_ub', label: 'RMSD u.b.' },
                                                ],
                                                dockingResults.poses.map(p => ({
                                                    mode: p.mode,
                                                    affinity: p.affinity.toFixed(2),
                                                    rmsd_lb: p.rmsd_lb.toFixed(3),
                                                    rmsd_ub: p.rmsd_ub.toFixed(3),
                                                })),
                                                'docking_poses.csv'
                                            )}
                                            className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300"
                                        >
                                            <Download className="h-3.5 w-3.5 mr-1.5" />
                                            CSV
                                        </Button>
                                    )}
                                    {multiSelectIndices.size >= 2 && onVisualizeMultiplePoses && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onVisualizeMultiplePoses(Array.from(multiSelectIndices).sort((a, b) => a - b))}
                                            className="bg-purple-900/20 border-purple-700/50 hover:bg-purple-900/40 hover:border-purple-600 text-purple-300"
                                            title="Show selected poses overlaid in viewer"
                                        >
                                            <Layers className="h-3.5 w-3.5 mr-1.5" />
                                            Compare {multiSelectIndices.size}
                                        </Button>
                                    )}
                                    {selectedPoseIndex !== null && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => { setMultiSelectIndices(new Set()); onClearPoses() }}
                                            className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300"
                                            title="Clear pose and show original protein"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                            Clear
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-gray-700">
                                        <tr>
                                            <th className="py-2 px-2 w-8"></th>
                                            <th className="text-left py-2 px-3 text-gray-400">Mode</th>
                                            <th className="text-left py-2 px-3 text-gray-400">Affinity (kcal/mol)</th>
                                            <th className="text-left py-2 px-3 text-gray-400">RMSD l.b.</th>
                                            <th className="text-left py-2 px-3 text-gray-400">RMSD u.b.</th>
                                            <th className="text-center py-2 px-3 text-gray-400">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dockingResults.poses?.map((pose, idx) => {
                                            const multiSelectOrder = Array.from(multiSelectIndices).sort((a, b) => a - b).indexOf(idx)
                                            const isMultiSelected = multiSelectIndices.has(idx)
                                            const dotColor = isMultiSelected ? POSE_SURFACE_COLORS_HEX[multiSelectOrder] : undefined
                                            return (
                                                <tr
                                                    key={idx}
                                                    className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors ${selectedPoseIndex === idx && !isMultiSelected ? 'bg-indigo-900/30' : isMultiSelected ? 'bg-purple-900/20' : ''}`}
                                                    onClick={() => { setMultiSelectIndices(new Set()); onVisualizePose(idx) }}
                                                >
                                                    <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isMultiSelected}
                                                            onChange={e => {
                                                                const next = new Set(multiSelectIndices)
                                                                e.target.checked ? next.add(idx) : next.delete(idx)
                                                                setMultiSelectIndices(next)
                                                            }}
                                                            className="accent-purple-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="py-2 px-3 text-white">
                                                        <span className="flex items-center gap-1.5">
                                                            {dotColor && (
                                                                <span
                                                                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                    style={{ background: dotColor }}
                                                                    title={`Pose color in comparison view`}
                                                                />
                                                            )}
                                                            {pose.mode}
                                                            {idx === 0 && (
                                                                <span className="ml-1 text-xs bg-green-600 px-2 py-0.5 rounded">Best</span>
                                                            )}
                                                            {selectedPoseIndex === idx && (
                                                                <span className="ml-1 text-xs bg-indigo-600 px-2 py-0.5 rounded">Viewing</span>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-white">{pose.affinity.toFixed(2)}</td>
                                                    <td className="py-2 px-3 text-white">{pose.rmsd_lb.toFixed(3)}</td>
                                                    <td className="py-2 px-3 text-white">{pose.rmsd_ub.toFixed(3)}</td>
                                                    <td className="py-2 px-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    onSavePose(idx)
                                                                }}
                                                                disabled={savingPose === idx}
                                                                className="bg-green-900/20 border-green-700/50 hover:bg-green-900/40 hover:border-green-600"
                                                                title="Save to Library"
                                                            >
                                                                {savingPose === idx ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : (
                                                                    <Save className="h-3 w-3" />
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    onOptimizeWithMD(idx)
                                                                }}
                                                                className="bg-indigo-900/20 border-indigo-700/50 hover:bg-indigo-900/40 hover:border-indigo-600"
                                                                title="Optimize with MD"
                                                            >
                                                                <Activity className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
