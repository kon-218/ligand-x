'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { qcService } from '@/lib/qc-service'
import { api } from '@/lib/api-client'
import { getQCJobTypeLabel } from '@/types/unified-job-types'
import type { QCResults } from '@/types/qc'
import { QCResultsTable } from '@/components/QC/QCResultsTable'
import { IRSpectrumPlot } from '@/components/QC/IRSpectrumPlot'
import { IRModesTable } from '@/components/QC/IRModesTable'
import { FukuiIndicesTable } from '@/components/QC/FukuiIndicesTable'
import { ConformerList } from '@/components/QC/ConformerList'
import { AtomicChargesTable } from '@/components/QC/AtomicChargesTable'

interface QCResultsViewProps {
    jobId: string
}

export function QCResultsView({ jobId }: QCResultsViewProps) {
    const [loading, setLoading] = useState(true)
    const [results, setResults] = useState<QCResults | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [job, setJob] = useState<any>(null)

    useEffect(() => {
        const controller = new AbortController()

        const fetchResults = async () => {
            try {
                setLoading(true)
                const response = await qcService.getJobResults(jobId, { signal: controller.signal })
                if (controller.signal.aborted) return

                if (response.results) {
                    setResults(response.results)
                    setError(null)
                    setJob((prev: any) => ({
                        ...prev,
                        input_params: {
                            ...(prev?.input_params ?? {}),
                            job_type: (response as any).orca_task_type || prev?.input_params?.job_type,
                            qc_job_type: (response as any).qc_job_type || prev?.input_params?.qc_job_type,
                        },
                    }))
                } else {
                    setError('No results found for this job')
                }

                try {
                    const jobData = await api.getJobDetails(jobId, { signal: controller.signal })
                    if (controller.signal.aborted) return
                    setJob((prev: any) => ({
                        ...prev,
                        ...jobData,
                        input_params: {
                            ...(prev?.input_params ?? {}),
                            ...(jobData?.input_params ?? {}),
                            job_type: (response as any).orca_task_type || jobData?.input_params?.job_type || prev?.input_params?.job_type,
                        },
                    }))
                } catch {
                    // PostgreSQL job not found — QC-service fields already set above
                }
            } catch (err: any) {
                if (controller.signal.aborted) return
                console.error('Failed to fetch QC results:', err)
                setError(err.message || 'Failed to load QC results')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        fetchResults()
        return () => controller.abort()
    }, [jobId])

    const handleViewLog = async (id: string) => {
        try {
            const logContent = await qcService.getLogFile(id)
            // In the global results view, we might want to show this in a modal or new tab
            // For now, let's just log it or use a simple alert/modal if available
            console.log('Log content for', id, logContent.substring(0, 100) + '...')
            // We could use a global store to open a log viewer
        } catch (error) {
            console.error('Failed to load log file:', error)
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-gray-400">Loading QC results...</p>
            </div>
        )
    }

    if (error || !results) {
        return (
            <div className="p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Error Loading Results</h3>
                <p className="text-gray-400 mb-6">{error || 'Results not found'}</p>
                <Button onClick={() => window.location.reload()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        )
    }

    // Map the raw ORCA task type (SP/OPT/OPT_FREQ/etc.) to a human-readable label and badge style
    const orcaTaskTypeLabels: Record<string, { label: string; badge: string; style: string }> = {
        'SP':       { label: 'Electronic Properties', badge: 'SP', style: 'bg-emerald-700/30 text-emerald-200 border-emerald-600/50' },
        'OPT':      { label: 'Geometry Optimization', badge: 'OPT', style: 'bg-blue-700/30 text-blue-200 border-blue-600/50' },
        'OPT_FREQ': { label: 'IR Spectrum & Thermochemistry', badge: 'OPT+FREQ', style: 'bg-purple-700/30 text-purple-200 border-purple-600/50' },
        'FREQ':     { label: 'Frequency Analysis', badge: 'FREQ', style: 'bg-purple-700/30 text-purple-200 border-purple-600/50' },
        'OPTTS':    { label: 'Transition State Optimization', badge: 'OPTTS', style: 'bg-red-700/30 text-red-200 border-red-600/50' },
    }
    const qcJobType = job?.input_params?.qc_job_type  // "standard", "fukui", "conformer", "ir"
    const orcaTask = job?.input_params?.job_type       // "SP", "OPT", "OPT_FREQ", etc.
    const hasHeader = !!(qcJobType || orcaTask)

    const getCalcTypeInfo = () => {
        // For non-standard job types (fukui, conformer) keep original label
        if (qcJobType && qcJobType !== 'standard') {
            return {
                label: getQCJobTypeLabel(qcJobType),
                badge: qcJobType.toUpperCase(),
                style: qcJobType === 'ir' ? 'bg-red-700/30 text-red-200 border-red-600/50' :
                    qcJobType === 'fukui' ? 'bg-yellow-700/30 text-yellow-200 border-yellow-600/50' :
                    qcJobType === 'conformer' ? 'bg-pink-700/30 text-pink-200 border-pink-600/50' :
                    'bg-orange-700/30 text-orange-200 border-orange-600/50'
            }
        }
        // For standard jobs, use the actual ORCA task type for precise labeling
        if (orcaTask && orcaTaskTypeLabels[orcaTask.toUpperCase()]) {
            return orcaTaskTypeLabels[orcaTask.toUpperCase()]
        }
        // Fallback
        return { label: getQCJobTypeLabel(qcJobType || 'standard'), badge: (orcaTask || qcJobType || 'QC').toUpperCase(), style: 'bg-orange-700/30 text-orange-200 border-orange-600/50' }
    }

    const calcTypeInfo = getCalcTypeInfo()

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* QC Job Type Header */}
            {hasHeader && (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-medium text-gray-400 mb-1">Calculation Type</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-semibold text-white">
                                    {calcTypeInfo.label}
                                </span>
                                <span className={`text-[9px] px-2 py-1 rounded border font-medium ${calcTypeInfo.style}`}>
                                    {calcTypeInfo.badge}
                                </span>
                            </div>
                        </div>
                        {job?.input_params?.method && (
                            <div className="text-right">
                                <h3 className="text-sm font-medium text-gray-400 mb-1">Method</h3>
                                <p className="text-white font-semibold">
                                    {job.input_params.method}
                                    {job.input_params.basis_set && `/${job.input_params.basis_set}`}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div>
                <QCResultsTable
                    results={results}
                    className="w-full"
                    jobId={jobId}
                    onViewLog={handleViewLog}
                    orcaJobType={orcaTask}
                />
            </div>

            {/* Atomic Charges Table — shown for SP (Electronic Properties) jobs */}
            {(results.chelpg_charges || results.mulliken_charges) && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Atomic Charges</h3>
                    <AtomicChargesTable
                        chelpgCharges={results.chelpg_charges}
                        mullikenCharges={results.mulliken_charges}
                        finalStructureXyz={(results as any).final_structure_xyz}
                    />
                </div>
            )}

            {/* Fukui Indices Table */}
            {results.fukui && (
                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Fukui Indices</h3>
                    <FukuiIndicesTable
                        fukui={results.fukui}
                    />
                </div>
            )}

            {/* IR Spectrum */}
            {(results.ir_spectrum || (results.ir_frequencies && results.ir_intensities)) && (
                <div className="space-y-4 mt-4">
                    <div className="bg-gray-800 rounded-lg p-4">
                        <IRSpectrumPlot
                            jobId={jobId}
                            frequencies={results.ir_spectrum?.frequencies || results.ir_frequencies || []}
                            intensities={results.ir_spectrum?.intensities || results.ir_intensities || []}
                        />
                    </div>

                    <div className="bg-gray-800 rounded-lg">
                        <IRModesTable
                            jobId={jobId}
                            modes={(results as any).ir_modes}
                            frequencies={results.ir_spectrum?.frequencies || results.ir_frequencies || []}
                            intensities={results.ir_spectrum?.intensities || results.ir_intensities || []}
                        />
                    </div>
                </div>
            )}


            {/* Conformers */}
            {results.conformers && (
                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Conformers</h3>
                    <ConformerList
                        conformers={results.conformers}
                    />
                </div>
            )}
        </div>
    )
}
