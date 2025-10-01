import { create } from 'zustand'
import type { BatchDockingJob } from '@/types/docking'

export interface DockingJob extends BatchDockingJob {
  // Extended job interface if needed, or just reuse BatchDockingJob as generic DockingJob
  // BatchDockingJob has: id, status, protein_name, ligands, progress, results, created_at, etc.
  type: 'single' | 'batch'
}

interface DockingStore {
  // Batch mode state
  isBatchMode: boolean
  setIsBatchMode: (enabled: boolean) => void

  // Jobs list (single and batch)
  jobs: DockingJob[]
  activeJobId: string | null
  setActiveJobId: (jobId: string | null) => void

  // Job management
  setJobs: (jobs: DockingJob[]) => void
  addJob: (job: DockingJob) => void
  updateJob: (jobId: string, updates: Partial<DockingJob>) => void
  removeJob: (jobId: string) => void
  clearJobs: () => void

  // Get job by ID
  getJob: (jobId: string) => DockingJob | undefined
}

export const useDockingStore = create<DockingStore>((set, get) => ({
  // Initial state
  isBatchMode: false,
  jobs: [],
  activeJobId: null,

  // Toggle batch mode
  setIsBatchMode: (enabled: boolean) =>
    set({ isBatchMode: enabled }),

  // Set active job
  setActiveJobId: (jobId: string | null) =>
    set({ activeJobId: jobId }),

  // Set all jobs
  setJobs: (jobs: DockingJob[]) => set({ jobs }),

  // Add a new job
  addJob: (job: DockingJob) =>
    set((state) => ({
      jobs: [job, ...state.jobs],
      activeJobId: job.id,
    })),

  // Update an existing job
  updateJob: (jobId: string, updates: Partial<DockingJob>) =>
    set((state) => ({
      jobs: state.jobs.map((j) =>
        j.id === jobId ? { ...j, ...updates } : j
      ),
    })),

  // Remove a job
  removeJob: (jobId: string) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== jobId),
      activeJobId: state.activeJobId === jobId ? null : state.activeJobId,
    })),

  // Clear all jobs
  clearJobs: () =>
    set({
      jobs: [],
      activeJobId: null,
    }),

  // Get job by ID
  getJob: (jobId: string) => {
    const state = get()
    return state.jobs.find((job) => job.id === jobId)
  },
}))

// Export alias for backward compatibility if needed, though we should update imports
export const useBatchDockingStore = useDockingStore

