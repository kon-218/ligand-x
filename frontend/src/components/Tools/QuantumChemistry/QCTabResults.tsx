'use client'

import React from 'react'
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { QCJob, QCResults } from '@/types/qc'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { filterJobs, getJobTypeBadge } from './utils'
import { QCResultsTable } from '@/components/QC/QCResultsTable'
import { IRSpectrumPlot } from '@/components/QC/IRSpectrumPlot'
import { IRModesTable } from '@/components/QC/IRModesTable'
import { FukuiIndicesTable } from '@/components/QC/FukuiIndicesTable'
import { ConformerList } from '@/components/QC/ConformerList'
import { VibrationalModesTable } from '@/components/QC/VibrationalModesTable'
import { AtomicChargesTable } from '@/components/QC/AtomicChargesTable'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { UnifiedJobList } from '../shared'

interface QCTabResultsProps {
    activeJobId: string | null
    activeResults: QCResults | null
    loadingResults: boolean
    resultsSubtab: 'recent' | 'completed'
    jobTypeFilter: 'all' | 'standard' | 'ir' | 'fukui' | 'conformer'
    onResultsSubtabChange: (subtab: 'recent' | 'completed') => void
    onJobTypeFilterChange: (filter: 'all' | 'standard' | 'ir' | 'fukui' | 'conformer') => void
    onSelectJob: (jobId: string) => void
    onViewLog: (jobId: string, filename?: string, title?: string) => void
    onVisualizeFukui?: (type: string, values: number[]) => Promise<void>
    onClearFukui?: () => Promise<void>
    onLoadStructure?: (jobId: string) => void
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
    onLoadStructure,
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
                    loadingResults ? (
                        <div className="flex items-center justify-center h-full text-gray-400" >
                            <div className="text-center">
                                <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-400" />
                                <p>Loading results...</p>
                            </div>
                        </div>
                    ) : activeResults ? (
                        <div className="space-y-6">
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

                            {/* Atomic Charges Table — shown for SP (Electronic Properties) jobs */}
                            {(activeResults?.chelpg_charges || activeResults?.mulliken_charges) && (
                                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-white mb-3">Atomic Charges</h3>
                                    <AtomicChargesTable
                                        chelpgCharges={activeResults.chelpg_charges}
                                        mullikenCharges={activeResults.mulliken_charges}
                                        finalStructureXyz={(activeResults as any).final_structure_xyz}
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

                            {/* Vibrational Modes */}
                            {activeResults?.normal_modes && (
                                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-white mb-3">Vibrational Modes</h3>
                                    <VibrationalModesTable
                                        jobId={activeJobId}
                                        frequencies={activeResults.normal_modes.frequencies}
                                        intensities={activeResults.normal_modes.intensities}
                                    />
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
