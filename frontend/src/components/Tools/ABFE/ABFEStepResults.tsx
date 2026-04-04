'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { api } from '@/lib/api-client'
import { useABFEStore } from '@/store/abfe-store'
import type { ABFEResult, ABFEParsedResults, ABFEJob } from '@/types/abfe-types'
import { Loader2, TrendingDown, TrendingUp, AlertCircle, CheckCircle, XCircle, Clock, RefreshCw, Flame } from 'lucide-react'
import { UnifiedJobList, NoJobSelectedState } from '../shared'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { ABFEProgressDisplay } from './ABFEProgressDisplay'
import { ABFEDetailedAnalysis } from './ABFEDetailedAnalysis'

interface ABFEStepResultsProps {
    result: ABFEResult | null
    isRunning?: boolean
    progress?: number
    progressMessage?: string
}

export function ABFEStepResults({
    result,
    isRunning = false,
    progress = 0,
    progressMessage = '',
}: ABFEStepResultsProps) {
    const {
        activeJobId,
        setActiveJob,
        abfeResult,
        setABFEResult,
        parsedResults,
        setParsedResults,
        isLoadingResults,
        setIsLoadingResults,
        isLoadingParsed,
        setIsLoadingParsed,
        parseError,
        setParseError,
    } = useABFEStore()

    const {
        loadAllJobs,
        getFilteredJobs,
        cancelJob,
        deleteJob,
        resultsTab,
        setResultsTab,
    } = useUnifiedResultsStore()

    // Load jobs on mount
    useEffect(() => {
        loadAllJobs()
    }, [])

    const filteredJobs = getFilteredJobs().filter((j: any) => j.service === 'abfe')

    const fetchControllerRef = useRef<AbortController | null>(null)

    const handleSelectJob = useCallback(async (jobId: string | null) => {
        fetchControllerRef.current?.abort()
        setActiveJob(jobId)
        if (!jobId) {
            setABFEResult(null)
            setParsedResults(null)
            setParseError(null)
            setIsLoadingResults(false)
            setIsLoadingParsed(false)
            return
        }

        const controller = new AbortController()
        fetchControllerRef.current = controller

        setIsLoadingResults(true)
        setParseError(null)
        setParsedResults(null)

        try {
            const status = await api.getABFEStatus(jobId, { signal: controller.signal })
            if (controller.signal.aborted) return

            const abfeResult = {
                ...status,
                job_id: status.id || jobId
            }
            setABFEResult(abfeResult)

            if (status.status === 'completed') {
                try {
                    const parsed = await api.parseABFEResults(jobId, { signal: controller.signal })
                    if (controller.signal.aborted) return
                    setParsedResults(parsed)
                    if (parsed.error) {
                        setParseError(parsed.error)
                    }
                } catch (err) {
                    if (controller.signal.aborted) return
                    console.error('Error parsing results:', err)
                    setParseError(err instanceof Error ? err.message : 'Failed to parse results')
                }
            }
        } catch (err) {
            if (controller.signal.aborted) return
            console.error('Error loading job status:', err)
            setParseError(err instanceof Error ? err.message : 'Failed to load job status')
        } finally {
            if (!controller.signal.aborted) setIsLoadingResults(false)
        }
    }, [setActiveJob, setIsLoadingResults, setParseError, setParsedResults, setABFEResult])

    // Update selected result when activeJobId changes
    useEffect(() => {
        if (activeJobId && activeJobId !== abfeResult?.job_id) {
            handleSelectJob(activeJobId)
        }
    }, [activeJobId, handleSelectJob, abfeResult?.job_id])

    // Update selected result when prop result changes
    useEffect(() => {
        if (result) {
            setABFEResult(result)
            if (result.job_id) {
                setActiveJob(result.job_id)
            }
        }
    }, [result, setActiveJob, setABFEResult])

    // Fetch parsed results when job is completed
    useEffect(() => {
        if (abfeResult && abfeResult.status === 'completed' && abfeResult.job_id) {
            setIsLoadingParsed(true)
            setParseError(null)

            api.parseABFEResults(abfeResult.job_id)
                .then((data) => {
                    setParsedResults(data)
                    if (data.error) {
                        setParseError(data.error)
                    }
                })
                .catch((err) => {
                    console.error('Error parsing ABFE results:', err)
                    setParseError(err.message || 'Failed to parse results')
                })
                .finally(() => {
                    setIsLoadingParsed(false)
                })
        }
    }, [abfeResult?.status, abfeResult?.job_id, setIsLoadingParsed, setParseError, setParsedResults])

    const [runSettings, setRunSettings] = useState<any | null>(null)
    const [isLoadingSettings, setIsLoadingSettings] = useState(false)
    const [settingsError, setSettingsError] = useState<string | null>(null)

    const getDGInterpretation = (dg: number) => {
        if (dg < -10) return { text: 'Very strong binding', color: 'text-green-400' }
        if (dg < -5) return { text: 'Strong binding', color: 'text-green-300' }
        if (dg < -2) return { text: 'Moderate binding', color: 'text-yellow-400' }
        if (dg < 0) return { text: 'Weak binding', color: 'text-orange-400' }
        return { text: 'Very weak/no binding', color: 'text-red-400' }
    }

    const displayResult = abfeResult || result
    const isCompleted = displayResult?.status === 'completed'
    const isFailed = displayResult?.status === 'failed'
    // Determine if job is running based on backend status
    // Trust the status from the backend - if it says completed/failed, it's not running
    // Only show running state if status is actually running/preparing/submitted
    // and we're not viewing a completed/failed job
    const jobIsRunning = !isCompleted && !isFailed &&
        (displayResult?.status === 'running' ||
            displayResult?.status === 'preparing' ||
            displayResult?.status === 'submitted')

    // Load detailed run settings for the selected job when results are completed
    useEffect(() => {
        const loadSettings = async () => {
            if (!displayResult?.job_id || !isCompleted) {
                setRunSettings(null)
                setSettingsError(null)
                return
            }

            try {
                setIsLoadingSettings(true)
                setSettingsError(null)
                const details = await api.getABFEDetails(displayResult.job_id)
                setRunSettings(details)
            } catch (err) {
                console.error('Failed to load ABFE run settings:', err)
                setSettingsError(err instanceof Error ? err.message : 'Failed to load run settings')
                setRunSettings(null)
            } finally {
                setIsLoadingSettings(false)
            }
        }

        loadSettings()
    }, [displayResult?.job_id, isCompleted])

    return (
        <div className="h-full flex flex-col">
            {/* Job Lists: Recent / Completed */}
            {/* Job List */}
            <UnifiedJobList
                jobs={filteredJobs}
                activeJobId={activeJobId}
                onSelectJob={(jobId) => handleSelectJob(jobId)}
                onCancelJob={(jobId, service) => cancelJob(jobId, service)}
                onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
                resultsTab={resultsTab}
                onTabChange={setResultsTab}
                showServiceBadge={false}
                accentColor="orange"
                title="ABFE Jobs"
                maxHeight="160px"
            />

            {/* Results Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {isLoadingResults ? (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                            <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-400" />
                            <p>Loading results...</p>
                        </div>
                    </div>
                ) : displayResult ? (
                    <div className="space-y-6">
                        {/* Running State - Enhanced Progress Display */}
                        {jobIsRunning && (
                            <ABFEProgressDisplay
                                progress={progress}
                                progressMessage={progressMessage}
                                stage={(displayResult as any)?.stage}
                                leg={(displayResult as any)?.leg}
                                legNum={(displayResult as any)?.leg_num}
                                onCancel={() => {
                                    if (displayResult?.job_id) {
                                        cancelJob(displayResult.job_id, 'abfe')
                                    }
                                }}
                            />
                        )}

                        {/* Status Card - Only show when not running */}
                        {!jobIsRunning && (
                            <div className={`p-4 rounded border ${isCompleted ? 'bg-green-900/20 border-green-700/50' :
                                isFailed ? 'bg-red-900/20 border-red-700/50' :
                                    'bg-gray-900/20 border-gray-700/50'
                                }`}>
                                <div className="flex items-center">
                                    {isCompleted && (
                                        <CheckCircle className="w-6 h-6 text-green-400 mr-2" />
                                    )}
                                    {isFailed && (
                                        <XCircle className="w-6 h-6 text-red-400 mr-2" />
                                    )}
                                    <div>
                                        <p className="font-semibold">
                                            {isCompleted && 'Calculation Completed'}
                                            {isFailed && 'Calculation Failed'}
                                        </p>
                                        <p className="text-sm text-gray-400">Job ID: {displayResult.job_id}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Results Display */}
                        {isCompleted && (
                            <div className="space-y-4">
                                {/* Loading Parsed Results */}
                                {isLoadingParsed && (
                                    <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                            <p className="text-sm text-gray-300">Parsing results from job directory...</p>
                                        </div>
                                    </div>
                                )}

                                {/* Parse Error */}
                                {parseError && !parsedResults && (
                                    <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-semibold text-yellow-400 mb-1">Parsing Warning</p>
                                                <p className="text-sm text-gray-300">{parseError}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Parsed Results - Overall DG */}
                                {parsedResults && parsedResults.dg_results && parsedResults.dg_results.length > 0 && (
                                    <div className="space-y-4">
                                        {/* Overall Binding Free Energy Card */}
                                        {parsedResults.dg_results.map((dgResult, idx) => {
                                            const interpretation = getDGInterpretation(dgResult.dg_kcal_mol)
                                            return (
                                                <div key={idx} className="p-6 bg-gradient-to-br from-gray-800 to-gray-800/50 rounded-lg border border-gray-700">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div>
                                                            <p className="text-sm text-gray-400 mb-1">Binding Free Energy (ΔG)</p>
                                                            <p className="text-xs text-gray-500">Ligand: {dgResult.ligand}</p>
                                                        </div>
                                                        {dgResult.dg_kcal_mol < 0 ? (
                                                            <TrendingDown className="w-6 h-6 text-green-400" />
                                                        ) : (
                                                            <TrendingUp className="w-6 h-6 text-red-400" />
                                                        )}
                                                    </div>
                                                    <div className="text-center mb-3">
                                                        <p className="text-4xl font-bold text-blue-400 mb-1">
                                                            {dgResult.dg_kcal_mol.toFixed(2)} kcal/mol
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
                                    </div>
                                )}

                                {/* Fallback: Simple Results Display */}
                                {!parsedResults && !isLoadingParsed && displayResult.results && (
                                    <div className="space-y-4">
                                        {/* Binding Free Energy */}
                                        <div className="p-6 bg-gray-800 rounded border border-gray-700">
                                            <div className="text-center">
                                                <p className="text-sm text-gray-400 mb-2">Binding Free Energy</p>
                                                <p className="text-4xl font-bold text-blue-400">
                                                    {displayResult.results.binding_free_energy_kcal_mol !== null && displayResult.results.binding_free_energy_kcal_mol !== undefined
                                                        ? `${displayResult.results.binding_free_energy_kcal_mol.toFixed(2)} kcal/mol`
                                                        : 'Pending analysis'}
                                                </p>
                                                {displayResult.results.binding_free_energy_kcal_mol === null && (
                                                    <p className="text-xs text-gray-400 mt-2">
                                                        Results are being processed. Check job directory for detailed output.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* System Information */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-gray-800 rounded border border-gray-700">
                                                <p className="text-xs text-gray-400 mb-1">Protein</p>
                                                <p className="text-sm font-semibold">{displayResult.results.protein_id || 'N/A'}</p>
                                            </div>
                                            <div className="p-4 bg-gray-800 rounded border border-gray-700">
                                                <p className="text-xs text-gray-400 mb-1">Ligand</p>
                                                <p className="text-sm font-semibold">{displayResult.results.ligand_id || 'N/A'}</p>
                                            </div>
                                        </div>

                                        {/* Job Directory */}
                                        {displayResult.results.job_dir && (
                                            <div className="p-4 bg-gray-800 rounded border border-gray-700">
                                                <p className="text-xs text-gray-400 mb-1">Output Directory</p>
                                                <p className="text-sm font-mono text-gray-300">{displayResult.results.job_dir}</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Run Settings Summary */}
                                <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                                    <p className="text-sm font-semibold text-blue-300 mb-2">
                                        Simulation settings for this ABFE run
                                    </p>

                                    {isLoadingSettings && (
                                        <div className="flex items-center gap-2 text-xs text-gray-300">
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                            <span>Loading run settings...</span>
                                        </div>
                                    )}

                                    {!isLoadingSettings && settingsError && (
                                        <p className="text-xs text-yellow-400">
                                            Could not load detailed settings for this run.
                                        </p>
                                    )}

                                    {!isLoadingSettings && !settingsError && runSettings && runSettings.settings && (
                                        <>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-200">
                                                {runSettings.settings.temperature_K !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Temperature:</span>{' '}
                                                        {runSettings.settings.temperature_K} K
                                                    </div>
                                                )}
                                                {runSettings.settings.pressure_bar !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Pressure:</span>{' '}
                                                        {runSettings.settings.pressure_bar} bar
                                                    </div>
                                                )}
                                                {runSettings.settings.protocol_repeats !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Protocol repeats:</span>{' '}
                                                        {runSettings.settings.protocol_repeats}
                                                    </div>
                                                )}
                                                {runSettings.settings.complex_lambda_windows !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Complex λ windows:</span>{' '}
                                                        {runSettings.settings.complex_lambda_windows}
                                                    </div>
                                                )}
                                                {runSettings.settings.solvent_lambda_windows !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Solvent λ windows:</span>{' '}
                                                        {runSettings.settings.solvent_lambda_windows}
                                                    </div>
                                                )}
                                                {runSettings.settings.production_iterations !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Production iterations:</span>{' '}
                                                        {runSettings.settings.production_iterations}
                                                    </div>
                                                )}
                                                {runSettings.settings.equilibration_iterations !== undefined && (
                                                    <div>
                                                        <span className="text-gray-400">Equilibration iterations:</span>{' '}
                                                        {runSettings.settings.equilibration_iterations}
                                                    </div>
                                                )}
                                                {runSettings.settings.small_molecule_forcefield && (
                                                    <div className="col-span-2 md:col-span-3">
                                                        <span className="text-gray-400">Ligand force field:</span>{' '}
                                                        {runSettings.settings.small_molecule_forcefield}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-3">
                                                These settings show how this ABFE calculation was configured when it was submitted.
                                            </p>
                                        </>
                                    )}

                                    {!isLoadingSettings && !settingsError && runSettings && !runSettings.settings && (
                                        <p className="text-xs text-gray-300">
                                            Detailed simulation settings are not available for this job.
                                        </p>
                                    )}
                                </div>

                                {/* Detailed Analysis Section */}
                                {displayResult?.job_id && (
                                    <div className="mt-6">
                                        <ABFEDetailedAnalysis jobId={displayResult.job_id} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error Display */}
                        {isFailed && displayResult.error && (
                            <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
                                <p className="text-sm font-semibold text-red-400 mb-2">Error Message:</p>
                                <p className="text-sm text-gray-300 font-mono">{displayResult.error}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <NoJobSelectedState
                        icon={Flame}
                        description="Select a job from the list or run a new ABFE calculation"
                        className="h-full"
                    />
                )}
            </div>
        </div>
    )
}
