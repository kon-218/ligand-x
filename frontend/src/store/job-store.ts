/**
 * Unified Job Store
 * 
 * Manages all Celery-based async jobs across the application.
 * Provides a single source of truth for job state, progress tracking,
 * and SSE streaming management.
 */

import { create } from 'zustand'
import { api } from '@/lib/api-client'

// ============================================================
// Types
// ============================================================

export type JobType = 'md' | 'abfe' | 'rbfe' | 'docking' | 'docking_batch' | 'boltz2' | 'qc' | 'admet'
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Job {
  id: string
  job_type: JobType
  status: JobStatus
  progress: number
  stage?: string
  message?: string
  created_at: string
  started_at?: string
  completed_at?: string
  molecule_name?: string
  input_params?: Record<string, any>
  result?: Record<string, any>
  error_message?: string
}

export interface JobProgress {
  status: string
  progress: number
  stage?: string
  message?: string
}

interface JobStore {
  // State
  jobs: Map<string, Job>
  activeStreams: Map<string, EventSource>
  isLoading: boolean
  error: string | null
  
  // Actions
  submitJob: (
    jobType: JobType,
    params: Record<string, any>,
    moleculeName?: string
  ) => Promise<string>
  
  cancelJob: (jobId: string) => Promise<void>
  deleteJob: (jobId: string) => Promise<void>
  
  refreshJob: (jobId: string) => Promise<void>
  refreshAllJobs: () => Promise<void>
  
  // Stream management
  startStreaming: (jobId: string) => void
  stopStreaming: (jobId: string) => void
  stopAllStreams: () => void
  
  // Selectors
  getJob: (jobId: string) => Job | undefined
  getJobsByType: (jobType: JobType) => Job[]
  getJobsByStatus: (status: JobStatus) => Job[]
  getRunningJobs: () => Job[]
  
  // Internal
  updateJob: (jobId: string, updates: Partial<Job>) => void
  setError: (error: string | null) => void
}

// ============================================================
// Store Implementation
// ============================================================

export const useJobStore = create<JobStore>((set, get) => ({
  // Initial state
  jobs: new Map(),
  activeStreams: new Map(),
  isLoading: false,
  error: null,

  // ============================================================
  // Job Submission
  // ============================================================
  
  submitJob: async (jobType, params, moleculeName) => {
    set({ isLoading: true, error: null })
    
    try {
      const response = await api.submitJob(jobType, params)
      const jobId = response.job_id
      
      // Create initial job record
      const job: Job = {
        id: jobId,
        job_type: jobType,
        status: 'pending',
        progress: 0,
        created_at: new Date().toISOString(),
        molecule_name: moleculeName,
        input_params: params,
      }
      
      set((state) => {
        const newJobs = new Map(state.jobs)
        newJobs.set(jobId, job)
        return { jobs: newJobs, isLoading: false }
      })
      
      // Start streaming progress
      get().startStreaming(jobId)
      
      return jobId
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to submit job'
      set({ error: errorMsg, isLoading: false })
      throw error
    }
  },

  // ============================================================
  // Job Cancellation & Deletion
  // ============================================================
  
  cancelJob: async (jobId) => {
    try {
      await api.cancelUnifiedJob(jobId)
      
      // Stop streaming
      get().stopStreaming(jobId)
      
      // Update local state
      get().updateJob(jobId, { status: 'cancelled', progress: 0 })
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to cancel job'
      set({ error: errorMsg })
      throw error
    }
  },
  
  deleteJob: async (jobId) => {
    try {
      await api.deleteUnifiedJob(jobId)
      
      // Stop streaming if active
      get().stopStreaming(jobId)
      
      // Remove from local state
      set((state) => {
        const newJobs = new Map(state.jobs)
        newJobs.delete(jobId)
        return { jobs: newJobs }
      })
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to delete job'
      set({ error: errorMsg })
      throw error
    }
  },

  // ============================================================
  // Job Refresh
  // ============================================================
  
  refreshJob: async (jobId) => {
    try {
      const jobDetails = await api.getJobDetails(jobId)
      
      const job: Job = {
        id: jobDetails.id,
        job_type: jobDetails.job_type as JobType,
        status: jobDetails.status as JobStatus,
        progress: jobDetails.progress,
        stage: jobDetails.stage,
        created_at: jobDetails.created_at,
        started_at: jobDetails.started_at,
        completed_at: jobDetails.completed_at,
        molecule_name: jobDetails.molecule_name,
        input_params: jobDetails.input_params,
        result: jobDetails.result,
        error_message: jobDetails.error_message,
      }
      
      set((state) => {
        const newJobs = new Map(state.jobs)
        newJobs.set(jobId, job)
        return { jobs: newJobs }
      })
    } catch (error) {
      console.error(`Failed to refresh job ${jobId}:`, error)
    }
  },
  
  refreshAllJobs: async () => {
    set({ isLoading: true })
    
    try {
      const response = await api.listUnifiedJobs({ limit: 100 })
      
      const newJobs = new Map<string, Job>()
      for (const jobData of response.jobs) {
        const job: Job = {
          id: jobData.id,
          job_type: jobData.job_type as JobType,
          status: jobData.status as JobStatus,
          progress: jobData.progress,
          stage: jobData.stage,
          created_at: jobData.created_at,
          started_at: jobData.started_at,
          completed_at: jobData.completed_at,
          molecule_name: jobData.molecule_name,
          error_message: jobData.error_message,
        }
        newJobs.set(job.id, job)
      }
      
      set({ jobs: newJobs, isLoading: false })
      
      // Start streaming for any running jobs
      for (const job of newJobs.values()) {
        if (job.status === 'running' || job.status === 'pending') {
          get().startStreaming(job.id)
        }
      }
    } catch (error: any) {
      console.error('Failed to refresh jobs:', error)
      set({ isLoading: false })
    }
  },

  // ============================================================
  // SSE Stream Management
  // ============================================================
  
  startStreaming: (jobId) => {
    const { activeStreams } = get()
    
    // Don't start if already streaming
    if (activeStreams.has(jobId)) {
      return
    }
    
    const eventSource = api.streamJobProgress(
      jobId,
      // onProgress
      (data) => {
        get().updateJob(jobId, {
          status: data.status as JobStatus,
          progress: data.progress,
          stage: data.stage,
          message: data.message,
        })
      },
      // onComplete
      (result) => {
        get().updateJob(jobId, {
          status: 'completed',
          progress: 100,
          result,
          completed_at: new Date().toISOString(),
        })
        get().stopStreaming(jobId)
      },
      // onError
      (error) => {
        get().updateJob(jobId, {
          status: 'failed',
          error_message: error,
          completed_at: new Date().toISOString(),
        })
        get().stopStreaming(jobId)
      }
    )
    
    set((state) => {
      const newStreams = new Map(state.activeStreams)
      newStreams.set(jobId, eventSource)
      return { activeStreams: newStreams }
    })
  },
  
  stopStreaming: (jobId) => {
    const { activeStreams } = get()
    const eventSource = activeStreams.get(jobId)
    
    if (eventSource) {
      eventSource.close()
      
      set((state) => {
        const newStreams = new Map(state.activeStreams)
        newStreams.delete(jobId)
        return { activeStreams: newStreams }
      })
    }
  },
  
  stopAllStreams: () => {
    const { activeStreams } = get()
    
    for (const eventSource of activeStreams.values()) {
      eventSource.close()
    }
    
    set({ activeStreams: new Map() })
  },

  // ============================================================
  // Selectors
  // ============================================================
  
  getJob: (jobId) => {
    return get().jobs.get(jobId)
  },
  
  getJobsByType: (jobType) => {
    const jobs: Job[] = []
    for (const job of get().jobs.values()) {
      if (job.job_type === jobType) {
        jobs.push(job)
      }
    }
    return jobs.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  },
  
  getJobsByStatus: (status) => {
    const jobs: Job[] = []
    for (const job of get().jobs.values()) {
      if (job.status === status) {
        jobs.push(job)
      }
    }
    return jobs.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  },
  
  getRunningJobs: () => {
    return get().getJobsByStatus('running')
  },

  // ============================================================
  // Internal Helpers
  // ============================================================
  
  updateJob: (jobId, updates) => {
    set((state) => {
      const existingJob = state.jobs.get(jobId)
      if (!existingJob) return state
      
      const newJobs = new Map(state.jobs)
      newJobs.set(jobId, { ...existingJob, ...updates })
      return { jobs: newJobs }
    })
  },
  
  setError: (error) => {
    set({ error })
  },
}))

// ============================================================
// Hooks for common patterns
// ============================================================

/**
 * Hook to get all jobs as an array, sorted by creation time
 */
export const useAllJobs = () => {
  const jobs = useJobStore((state) => state.jobs)
  return Array.from(jobs.values()).sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

/**
 * Hook to get jobs by type
 */
export const useJobsByType = (jobType: JobType) => {
  return useJobStore((state) => state.getJobsByType(jobType))
}

/**
 * Hook to get a specific job
 */
export const useJob = (jobId: string | null) => {
  return useJobStore((state) => jobId ? state.getJob(jobId) : undefined)
}

/**
 * Hook to check if any jobs are running
 */
export const useHasRunningJobs = () => {
  const jobs = useJobStore((state) => state.jobs)
  for (const job of jobs.values()) {
    if (job.status === 'running' || job.status === 'pending') {
      return true
    }
  }
  return false
}
