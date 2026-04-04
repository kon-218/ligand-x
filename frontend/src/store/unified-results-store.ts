import { create } from 'zustand'
import { api } from '@/lib/api-client'
import type {
    ServiceType,
    UnifiedJob,
    JobStatus,
    isRunningStatus,
    isCompletedStatus,
} from '@/types/unified-job-types'
import { normalizeToUnifiedJob } from '@/types/unified-job-types'
import type { JobUpdate } from '@/hooks/useJobWebSocket'

type ResultsTab = 'recent' | 'completed'

interface UnifiedResultsState {
    // All jobs from all services
    allJobs: UnifiedJob[]

    // Filter state
    activeServiceFilter: ServiceType | 'all'
    resultsTab: ResultsTab

    // Selected job
    activeJobId: string | null
    activeService: ServiceType | null

    // Loading states
    isLoading: boolean
    lastLoadTime: number | null

    // Poll interval ID (for cleanup)
    pollIntervalId: NodeJS.Timeout | null
    
    // WebSocket state
    wsConnected: boolean
    wsEnabled: boolean
}

interface UnifiedResultsActions {
    // Filter actions
    setActiveServiceFilter: (filter: ServiceType | 'all') => void
    setResultsTab: (tab: ResultsTab) => void

    // Selection actions
    setActiveJob: (jobId: string | null, service?: ServiceType | null) => void
    clearSelection: () => void

    // Data loading
    loadAllJobs: () => Promise<void>
    refreshJobs: () => Promise<void>

    // Polling (fallback when WebSocket unavailable)
    startPolling: (intervalMs?: number) => void
    stopPolling: () => void
    
    // WebSocket actions
    handleJobUpdate: (update: JobUpdate) => void
    setWsConnected: (connected: boolean) => void
    setWsEnabled: (enabled: boolean) => void

    // Job management
    cancelJob: (jobId: string, service: ServiceType) => Promise<void>
    deleteJob: (jobId: string, service: ServiceType) => Promise<void>

    // Computed getters
    getFilteredJobs: () => UnifiedJob[]
    getJobById: (jobId: string) => UnifiedJob | undefined
    hasRunningJobs: () => boolean

    // Reset
    reset: () => void
}

type UnifiedResultsStore = UnifiedResultsState & UnifiedResultsActions

const initialState: UnifiedResultsState = {
    allJobs: [],
    activeServiceFilter: 'all',
    resultsTab: 'recent',
    activeJobId: null,
    activeService: null,
    isLoading: false,
    lastLoadTime: null,
    pollIntervalId: null,
    wsConnected: false,
    wsEnabled: true,  // WebSocket enabled by default
}

export const useUnifiedResultsStore = create<UnifiedResultsStore>((set, get) => ({
    ...initialState,

    // --- Filter Actions ---

    setActiveServiceFilter: (filter) => {
        set({ activeServiceFilter: filter })
    },

    setResultsTab: (tab) => {
        set({ resultsTab: tab })
    },

    // --- Selection Actions ---

    setActiveJob: (jobId, service = null) => {
        if (jobId && !service) {
            // Try to find the service from the job
            const job = get().allJobs.find(j => j.job_id === jobId)
            service = job?.service || null
        }
        set({ activeJobId: jobId, activeService: service })
    },

    clearSelection: () => {
        set({ activeJobId: null, activeService: null })
    },

    // --- Data Loading ---

    loadAllJobs: async () => {
        set({ isLoading: true })

        try {
            // Use unified PostgreSQL endpoint for all jobs
            const result = await api.listAllJobs()
            
            // Filter out internal/transient job types like rbfe_mapping_preview
            const filteredJobs = result.jobs.filter(job => 
                job.service !== 'rbfe_mapping_preview' as ServiceType
            )
            
            set({
                allJobs: filteredJobs,
                isLoading: false,
                lastLoadTime: Date.now(),
            })
        } catch (error) {
            console.error('Failed to load jobs:', error)
            set({ isLoading: false })
        }
    },

    refreshJobs: async () => {
        // Only refresh if not already loading
        if (!get().isLoading) {
            await get().loadAllJobs()
        }
    },

    // --- Polling (fallback when WebSocket unavailable) ---

    startPolling: (intervalMs?: number) => {
        // Clear any existing interval
        const existingId = get().pollIntervalId
        if (existingId) {
            clearInterval(existingId)
        }
        
        // Determine polling interval based on WebSocket state
        // With WebSocket: poll every 30s as backup
        // Without WebSocket: poll every 5s
        const { wsConnected } = get()
        const interval = intervalMs ?? (wsConnected ? 30000 : 5000)

        // Start new polling interval
        const intervalId = setInterval(() => {
            get().refreshJobs()
        }, interval)

        set({ pollIntervalId: intervalId })

        // Also load immediately
        get().loadAllJobs()
    },

    stopPolling: () => {
        const intervalId = get().pollIntervalId
        if (intervalId) {
            clearInterval(intervalId)
            set({ pollIntervalId: null })
        }
    },
    
    // --- WebSocket Actions ---
    
    handleJobUpdate: (update: JobUpdate) => {
        // Ignore internal/transient job types
        if (update.job_type === 'rbfe_mapping_preview') {
            return
        }

        const { allJobs } = get()
        
        // Find the job in current state
        const jobIndex = allJobs.findIndex(job => job.job_id === update.job_id)
        
        if (jobIndex === -1) {
            // Job not in list - might be new, trigger a refresh to get full data
            // But don't refresh too frequently
            const lastLoad = get().lastLoadTime
            const now = Date.now()
            if (!lastLoad || now - lastLoad > 2000) {
                get().loadAllJobs()
            }
            return
        }
        
        // Update the job in place
        const updatedJobs = [...allJobs]
        const existingJob = updatedJobs[jobIndex]
        
        const newStage = update.stage ?? existingJob.stage
        const newCompletedStages = newStage
            ? newStage.split(',').map((s: string) => s.trim()).filter(Boolean)
            : existingJob.completed_stages
        updatedJobs[jobIndex] = {
            ...existingJob,
            status: update.status as UnifiedJob['status'],
            progress: update.progress ?? existingJob.progress,
            stage: newStage,
            completed_stages: newCompletedStages,
            error: update.error_message ?? existingJob.error,
        }
        
        set({ allJobs: updatedJobs })
        
        // If job completed/failed and has_result, fetch full job data
        if (update.has_result && (update.status === 'completed' || update.status === 'failed')) {
            // Trigger a refresh to get full result data
            const lastLoad = get().lastLoadTime
            const now = Date.now()
            if (!lastLoad || now - lastLoad > 2000) {
                get().loadAllJobs()
            }
        }
    },
    
    setWsConnected: (connected: boolean) => {
        set({ wsConnected: connected })
        // ResultsTool reacts to wsConnected and stops/starts polling; no store-driven restart here.
    },
    
    setWsEnabled: (enabled: boolean) => {
        set({ wsEnabled: enabled })
    },

    // --- Computed Getters ---

    getFilteredJobs: () => {
        const { allJobs, activeServiceFilter, resultsTab } = get()

        let filtered = allJobs.filter(job => {
             // Global filter: exclude internal job types
             if (job.service === 'rbfe_mapping_preview' as ServiceType) return false
             
             // Global filter: exclude RBFE jobs without topology (mislabeled previews)
             if (job.service === 'rbfe' && !job.metadata?.network_topology) return false
             
             return true
        })

        // Filter by service
        if (activeServiceFilter !== 'all') {
            filtered = filtered.filter(job => job.service === activeServiceFilter)
        }

        // Filter by status (recent vs completed)
        if (resultsTab === 'recent') {
            filtered = filtered.filter(job =>
                job.status !== 'completed' && job.status !== 'failed'
            )
        } else {
            filtered = filtered.filter(job =>
                job.status === 'completed' || job.status === 'failed'
            )
        }

        // Limit to last 50 for performance
        return filtered.slice(0, 50)
    },

    getJobById: (jobId) => {
        return get().allJobs.find(job => job.job_id === jobId)
    },
    
    hasRunningJobs: () => {
        return get().allJobs.some(job => 
            job.status === 'running' || job.status === 'submitted' || job.status === 'preparing'
        )
    },

    // --- Job Management ---

    cancelJob: async (jobId, service) => {
        try {
            await api.cancelJob(jobId, service)
            // Refresh jobs to update status
            await get().loadAllJobs()
        } catch (error) {
            console.error(`Failed to cancel job ${jobId}:`, error)
        }
    },

    deleteJob: async (jobId, service) => {
        try {
            await api.deleteJob(jobId, service)

            // If the deleted job was active, clear selection
            if (get().activeJobId === jobId) {
                get().clearSelection()
            }

            // Refresh jobs
            await get().loadAllJobs()
        } catch (error) {
            console.error(`Failed to delete job ${jobId}:`, error)
        }
    },

    // --- Reset ---

    reset: () => {
        get().stopPolling()
        set(initialState)
    },
}))
