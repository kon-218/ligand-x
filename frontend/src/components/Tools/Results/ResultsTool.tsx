'use client'

import React, { useEffect, useState } from 'react'
import { BarChart3, Target, Activity, Brain, FlaskConical, GitBranch, Trash2 } from 'lucide-react'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { UnifiedJobList, UnifiedProgressDisplay } from '../shared'
import { ServiceResultsRenderer } from './ServiceResultsRenderer'
import type { ServiceType } from '@/types/unified-job-types'
// Service filter configuration
const SERVICE_FILTERS: Array<{ id: ServiceType | 'all'; label: string; icon: React.ReactNode; color: string }> = [
    { id: 'all', label: 'All', icon: <BarChart3 className="w-4 h-4" />, color: 'gray' },
    { id: 'docking', label: 'Docking', icon: <Target className="w-4 h-4" />, color: 'indigo' },
    { id: 'md', label: 'MD', icon: <Activity className="w-4 h-4" />, color: 'green' },
    { id: 'boltz2', label: 'Boltz-2', icon: <Brain className="w-4 h-4" />, color: 'purple' },
    { id: 'abfe', label: 'ABFE', icon: <FlaskConical className="w-4 h-4" />, color: 'blue' },
    { id: 'rbfe', label: 'RBFE', icon: <GitBranch className="w-4 h-4" />, color: 'cyan' },
    { id: 'qc', label: 'QC', icon: <FlaskConical className="w-4 h-4" />, color: 'blue' },
]

/**
 * Main Results Tool component
 * Provides unified results browsing across all computational services
 */
export function ResultsTool() {
    const {
        allJobs,
        activeServiceFilter,
        activeJobId,
        activeService,
        resultsTab,
        isLoading,
        setActiveServiceFilter,
        setResultsTab,
        setActiveJob,
        loadAllJobs,
        startPolling,
        stopPolling,
        getFilteredJobs,
        getJobById,
        cancelJob,
        deleteJob,
    } = useUnifiedResultsStore()

    const [isCleaningUp, setIsCleaningUp] = useState(false)
    const [cleanupResult, setCleanupResult] = useState<string | null>(null)

    // WebSocket state from store – use WS for updates when connected, avoid polling
    const wsConnected = useUnifiedResultsStore(state => state.wsConnected)
    
    // Load jobs on mount and when opening tab. Use WebSocket when connected; poll only when disconnected.
    useEffect(() => {
        stopPolling()
        if (wsConnected) {
            loadAllJobs()
            // No polling – WebSocket delivers real-time job updates
        } else {
            startPolling() // loads + polls every 5s as fallback
        }
        return () => {
            stopPolling()
        }
    }, [wsConnected, loadAllJobs, startPolling, stopPolling])

    const handleCleanupStale = async () => {
        setIsCleaningUp(true)
        setCleanupResult(null)
        try {
            const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
            const res = await fetch(`${API_BASE}/api/jobs/cleanup-stale`, { method: 'POST' })
            const data = await res.json()
            setCleanupResult(`Cleaned up ${data.cleaned ?? 0} stale job(s)`)
            await loadAllJobs()
        } catch {
            setCleanupResult('Cleanup failed')
        } finally {
            setIsCleaningUp(false)
            setTimeout(() => setCleanupResult(null), 4000)
        }
    }

    // Get filtered jobs based on current filters
    const filteredJobs = getFilteredJobs()

    // Get active job details
    const activeJob = activeJobId ? getJobById(activeJobId) : null
    const isActiveJobRunning = activeJob &&
        ['submitted', 'preparing', 'running', 'pending'].includes(activeJob.status)
    


    return (
        <div className="h-full flex flex-col">
            {/* Service Filter Tabs */}
            <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-white">Results Browser</h2>
                    <button
                        onClick={handleCleanupStale}
                        disabled={isCleaningUp}
                        title="Mark stale queued/running jobs as failed"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 className={`w-3.5 h-3.5 ${isCleaningUp ? 'animate-pulse' : ''}`} />
                        {isCleaningUp ? 'Cleaning…' : 'Clean stale'}
                    </button>
                </div>
                {cleanupResult && (
                    <p className="text-xs text-gray-400 mb-2">{cleanupResult}</p>
                )}
                <div className="flex flex-wrap gap-2">
                    {SERVICE_FILTERS.map((filter) => (
                        <button
                            key={filter.id}
                            onClick={() => setActiveServiceFilter(filter.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeServiceFilter === filter.id
                                ? `bg-${filter.color}-600 text-white`
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                        >
                            {filter.icon}
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Job List */}
            <UnifiedJobList
                jobs={filteredJobs}
                activeJobId={activeJobId}
                onSelectJob={(jobId, service) => setActiveJob(jobId, service)}
                onCancelJob={(jobId, service) => cancelJob(jobId, service)}
                onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
                resultsTab={resultsTab}
                onTabChange={setResultsTab}
                showServiceBadge={activeServiceFilter === 'all'}
                showQCJobType={activeServiceFilter === 'qc'}
                showMDJobType={activeServiceFilter === 'md'}
                accentColor={getServiceColor(activeServiceFilter)}
                title={activeServiceFilter === 'all' ? 'All Jobs' : `${getServiceLabel(activeServiceFilter)} Jobs`}
            />

            {/* Results Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {!activeJobId ? (
                    <NoJobSelectedState />
                ) : isActiveJobRunning && activeJob ? (
                    <UnifiedProgressDisplay
                        service={activeJob.service}
                        progress={activeJob.progress || 0}
                        progressMessage={activeJob.message || 'Processing...'}
                        completedStages={getCompletedStages(activeJob)}
                        hasProduction={(activeJob.metadata?.production_steps ?? 0) > 0}
                        isRunning={true}
                    />
                ) : activeService ? (
                    <ServiceResultsRenderer
                        jobId={activeJobId}
                        service={activeService}
                    />
                ) : activeJob ? (
                    // Fallback: use service from activeJob if activeService is null
                    <ServiceResultsRenderer
                        jobId={activeJobId}
                        service={activeJob.service}
                    />
                ) : null}
            </div>
        </div>
    )
}

/**
 * Empty state when no job is selected
 */
function NoJobSelectedState() {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <BarChart3 className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Job Selected</h3>
            <p className="text-sm text-center max-w-md">
                Select a job from the list above to view its results.
                You can filter by service using the tabs.
            </p>
        </div>
    )
}

/**
 * Get color for a service filter
 */
const getServiceColor = (service: ServiceType | 'all'): string => {
    const colors: Record<ServiceType | 'all', string> = {
        all: 'blue',
        docking: 'indigo',
        md: 'green',
        boltz2: 'purple',
        abfe: 'blue',
        rbfe: 'cyan',
        qc: 'blue',
    }
    return colors[service]
}

/**
 * Get label for a service
 */
const getServiceLabel = (service: ServiceType | 'all'): string => {
    const labels: Record<ServiceType | 'all', string> = {
        all: 'All Services',
        docking: 'Docking',
        md: 'MD Optimization',
        boltz2: 'Boltz-2',
        abfe: 'ABFE',
        rbfe: 'RBFE',
        qc: 'Quantum Chemistry',
    }
    return labels[service]
}

/**
 * Infer completed stages for MD jobs based on progress
 */
const BACKEND_STAGE_MAP: Record<string, string> = {
    preparation: 'Preparation',
    minimization: 'Minimization',
    nvt: 'NVT Equilibration',
    npt: 'NPT Equilibration',
    production: 'Production',
    // thermal_heating folded into NVT Equilibration
}

const getCompletedStages = (job: any) => {
    if (job.service !== 'md') return undefined

    // Use explicit backend completed_stages if available
    if (job.completed_stages?.length) {
        return job.completed_stages
            .map((s: string) => BACKEND_STAGE_MAP[s])
            .filter(Boolean) as string[]
    }

    // Fallback: infer from progress
    const inferredStages: string[] = []
    const progress = job.progress || 0

    if (progress > 5)  inferredStages.push('Preparation')
    if (progress > 9)  inferredStages.push('Minimization')
    if (progress > 15) inferredStages.push('NVT Equilibration')
    if (progress > 28) inferredStages.push('NPT Equilibration')
    if (progress > 28 && job.message?.toLowerCase().includes('production')) inferredStages.push('Production')

    return inferredStages
}
