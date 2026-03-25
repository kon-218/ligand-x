'use client'

import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { QCJob, QCResults } from '@/types/qc'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { filterJobs, getJobTypeBadge } from './utils'
import { QCResultsTable } from '@/components/QC/QCResultsTable'
import { QCJobProgress } from '@/components/QC/QCJobProgress'
import { IRSpectrumPlot } from '@/components/QC/IRSpectrumPlot'
import { IRModesTable } from '@/components/QC/IRModesTable'
import { FukuiIndicesTable } from '@/components/QC/FukuiIndicesTable'
import { ConformerList } from '@/components/QC/ConformerList'
import { BDEResultsTable } from '@/components/QC/BDEResultsTable'
import { AtomicChargesTable } from '@/components/QC/AtomicChargesTable'
import { OrbitalControls } from '@/components/QC/OrbitalControls'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { UnifiedJobList } from '../shared'
import type { MolstarViewerHandle } from '@/components/MolecularViewer/MolecularViewer'

interface QCTabResultsProps {
    activeJobId: string | null
    activeResults: QCResults | null
    loadingResults: boolean
    resultsSubtab: 'recent' | 'completed'
    jobTypeFilter: 'all' | 'standard' | 'ir' | 'fukui' | 'conformer' | 'bde'
    onResultsSubtabChange: (subtab: 'recent' | 'completed') => void
    onJobTypeFilterChange: (filter: 'all' | 'standard' | 'ir' | 'fukui' | 'conformer' | 'bde') => void
    onSelectJob: (jobId: string | null) => void
    onViewLog: (jobId: string, filename?: string, title?: string) => void
    onVisualizeFukui?: (type: string, values: number[]) => Promise<void>
    onClearFukui?: () => Promise<void>
    onVisualizeCharges?: (values: number[], type: 'chelpg' | 'mulliken') => Promise<void>
    onClearCharges?: () => Promise<void>
    onLoadStructure?: (jobId: string) => void
    viewerRef?: MolstarViewerHandle | null
}

export function QCTabResults({
    activeJobId,
    activeResults,
    loadingResults,
    resultsSubtab,
    jobTypeFilter,
    onResultsSubtabChange,
    onJobTypeFilterChange,
    onSelectJob,
    onViewLog,
    onVisualizeFukui,
    onClearFukui,
    onVisualizeCharges,
    onClearCharges,
    onLoadStructure,
    viewerRef,
}: QCTabResultsProps) {
    const {
        resultsTab,
        setResultsTab,
        cancelJob,
        deleteJob,
        getFilteredJobs,
        getJobById,
    } = useUnifiedResultsStore()

    // Derive job type for the active job
    // orca_task_type carries the actual ORCA task (SP, OPT, OPT_FREQ, etc.) and lives in metadata
    // job_type is the legacy category ("standard" / "ir") — not granular enough
    const activeJob = activeJobId ? getJobById(activeJobId) : null
    const orcaJobType: string =
        activeJob?.metadata?.orca_task_type ||
        (activeJob as any)?.orca_task_type ||
        (activeJob as any)?.job_type ||
        ''

    const filteredJobs = getFilteredJobs().filter((j: any) => j.service === 'qc')

    // Completion delay: keep QCJobProgress visible for 1.5s after job completes so users
    // can see the final stages tick green before the results view takes over.
    const [showingCompletion, setShowingCompletion] = useState(false)
    const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevStatusRef = useRef<string | null>(null)

    useEffect(() => {
        const currentStatus = activeJob?.status ?? null
        const prevStatus = prevStatusRef.current
        prevStatusRef.current = currentStatus

        if (prevStatus !== null && prevStatus !== 'completed' && currentStatus === 'completed') {
            setShowingCompletion(true)
            completionTimerRef.current = setTimeout(() => {
                setShowingCompletion(false)
            }, 1500)
        }

        return () => {
            if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
        }
    }, [activeJob?.status])

    // All stage keys per job type (mirrors QC_STAGES in QCJobProgress)
    const ALL_STAGES: Record<string, string[]> = {
        standard: ['preparation', 'scf', 'properties'],
        ir: ['preparation', 'scf', 'optimization', 'frequencies', 'properties'],
        fukui: ['preparation', 'neutral', 'anion', 'cation', 'analysis'],
        conformer: ['generation', 'filtering', 'optimization', 'ranking'],
        bde: ['preparation', 'parent_opt', 'fragments', 'analysis'],
    }

    // Helper to map UnifiedJob to QCJob for progress display
    const isRunning = (activeJob && ['submitted', 'preparing', 'running', 'pending'].includes(activeJob.status)) || showingCompletion
    const runningQCJob: QCJob | null = isRunning && activeJob ? {
        id: activeJob.job_id,
        molecule_id: activeJob.metadata.ligand_id || 'unknown',
        status: (activeJob.status === 'submitted' ? 'pending' : (activeJob.status === 'preparing' ? 'running' : activeJob.status)) as QCJob['status'],
        job_type: (activeJob.metadata.qc_job_type || 'standard') as any,
        method: activeJob.metadata.method || '',
        basis_set: activeJob.metadata.basis_set || '',
        created_at: activeJob.created_at,
        updated_at: activeJob.updated_at || '',
        progress: showingCompletion
            ? { percent: 100, step: 'Calculation Complete', details: '', updated_at: '' }
            : typeof activeJob.progress === 'object' ? activeJob.progress : {
                percent: typeof activeJob.progress === 'number' ? activeJob.progress : 0,
                step: activeJob.message || (activeJob.status === 'submitted' ? 'Queued' : 'Processing...'),
                details: '',
                updated_at: ''
            },
        completed_stages: showingCompletion
            ? (ALL_STAGES[(activeJob.metadata.qc_job_type || 'standard')] ?? ALL_STAGES.standard)
            : (activeJob.completed_stages ?? []),
        error_message: activeJob.error
    } : null

    return (
        <div className="h-full flex flex-col">
            {/* Job List */}
            <UnifiedJobList
                jobs={filteredJobs}
                activeJobId={activeJobId}
                onSelectJob={(jobId) => onSelectJob(jobId)}
                onCancelJob={(jobId, service) => cancelJob(jobId, service)}
                onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
                resultsTab={resultsTab}
                onTabChange={setResultsTab}
                showServiceBadge={false}
                showQCJobType={true}
                accentColor="blue"
                title="QC Jobs"
                maxHeight="160px"
            />

            {/* Results Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {
                    runningQCJob ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <QCJobProgress 
                                job={runningQCJob} 
                                onCancel={() => activeJobId && cancelJob(activeJobId, 'qc')} 
                            />
                        </div>
                    ) : loadingResults ? (
                        <div className="flex items-center justify-center h-full text-gray-400" >
                            <div className="text-center">
                                <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-400" />
                                <p>Loading results...</p>
                            </div>
                        </div>
                    ) : activeResults ? (
                        <div className="space-y-6">
                            {!(activeResults as any)?.bde_results && (
                                <div>
                                    <QCResultsTable
                                        results={activeResults}
                                        className="w-full"
                                        jobId={activeJobId || undefined}
                                        onViewLog={onViewLog}
                                        orcaJobType={orcaJobType}
                                        onViewStructure={activeJobId && onLoadStructure ? () => onLoadStructure(activeJobId) : undefined}
                                    />
                                </div>
                            )}

                            {/* Molecular Orbitals — rendered in the main Molstar viewer (not for conformer, BDE, or Fukui jobs) */}
                            {activeJobId && viewerRef && !activeResults?.conformers && !(activeResults as any)?.bde_results && !activeResults?.fukui && (
                                <OrbitalControls
                                    jobId={activeJobId}
                                    viewerRef={viewerRef}
                                />
                            )}

                            {/* Atomic Charges Table — shown for SP (Electronic Properties) jobs */}
                            {(activeResults?.chelpg_charges || activeResults?.mulliken_charges) && (
                                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-white mb-3">Atomic Charges</h3>
                                    <AtomicChargesTable
                                        chelpgCharges={activeResults.chelpg_charges}
                                        mullikenCharges={activeResults.mulliken_charges}
                                        finalStructureXyz={(activeResults as any).final_structure_xyz}
                                        onVisualize={onVisualizeCharges}
                                        onClearVisualization={onClearCharges}
                                    />
                                </div>
                            )}

                            {/* Fukui Indices Table */}
                            {activeResults?.fukui && onVisualizeFukui && (
                                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-white mb-3">Fukui Indices</h3>
                                    <FukuiIndicesTable
                                        fukui={activeResults.fukui}
                                        onVisualize={onVisualizeFukui}
                                        onClearVisualization={onClearFukui}
                                    />
                                </div>
                            )}

                            {/* IR Spectrum - handle both ir_spectrum object and separate ir_frequencies/ir_intensities arrays */}
                            {(activeResults?.ir_spectrum || (activeResults?.ir_frequencies && activeResults?.ir_intensities)) && (
                                <div className="space-y-4 mt-4">
                                    {/* IR Spectrum Plot */}
                                    <div className="bg-gray-800 rounded-lg p-4">
                                        <IRSpectrumPlot
                                            jobId={activeJobId}
                                            frequencies={activeResults.ir_spectrum?.frequencies || activeResults.ir_frequencies || []}
                                            intensities={activeResults.ir_spectrum?.intensities || activeResults.ir_intensities || []}
                                        />
                                    </div>

                                    {/* IR Modes Table with detailed vibrational data */}
                                    <div className="bg-gray-800 rounded-lg">
                                        <IRModesTable
                                            jobId={activeJobId || undefined}
                                            modes={(activeResults as any)?.ir_modes}
                                            frequencies={activeResults.ir_spectrum?.frequencies || activeResults.ir_frequencies || []}
                                            intensities={activeResults.ir_spectrum?.intensities || activeResults.ir_intensities || []}
                                            eps={(activeResults as any)?.ir_eps}
                                            tSquared={(activeResults as any)?.ir_t_squared}
                                            tx={(activeResults as any)?.ir_tx}
                                            ty={(activeResults as any)?.ir_ty}
                                            tz={(activeResults as any)?.ir_tz}
                                        />
                                    </div>
                                </div>
                            )}


                            {/* Conformers */}
                            {activeResults?.conformers && (
                                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-white mb-3">Conformers</h3>
                                    <ConformerList
                                        conformers={activeResults.conformers}
                                    />
                                </div>
                            )}

                            {/* Bond Dissociation Energies */}
                            {(activeResults as any)?.bde_results && (
                                <div className="mt-4">
                                    <BDEResultsTable
                                        bdeResults={(activeResults as any).bde_results}
                                        statistics={(activeResults as any).bde_statistics}
                                        onVisualize={viewerRef?.coloring ? async () => {
                                            const bdeResults = (activeResults as any).bde_results
                                            const stats = (activeResults as any).bde_statistics
                                            const successfulBonds = bdeResults.filter((r: any) => r.status === 'success')
                                            const minBDE = stats?.min_bde_kcal ?? Math.min(...successfulBonds.map((r: any) => r.bde_corrected_kcal))
                                            const maxBDE = stats?.max_bde_kcal ?? Math.max(...successfulBonds.map((r: any) => r.bde_corrected_kcal))
                                            await viewerRef.coloring.applyBDETheme(successfulBonds, minBDE, maxBDE)
                                        } : undefined}
                                        onClearHighlight={viewerRef?.coloring ? async () => {
                                            await viewerRef.coloring.applyDefault()
                                        } : undefined}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                            <div className="text-center">
                                <p>Select a job to view results</p>
                            </div>
                        </div>
                    )}
            </div >
        </div >
    )
}
