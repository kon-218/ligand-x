import { create } from 'zustand'
import type {
  RBFEParameters,
  RBFEJob,
  RBFENetworkData,
  LigandSelection,
  NetworkTopology,
  DockingMode,
  MappingPreviewResult,
} from '@/types/rbfe-types'

// Helper to check if a job status indicates it's still running/in-progress
// Note: 'docking_ready' is NOT considered running since it's waiting for user action
const isRunningStatus = (status: string | undefined): boolean => {
  const runningStatuses = new Set([
    'running',
    'preparing',
    'submitted',
    'docking',
    'resuming',
  ])
  return runningStatuses.has(status || '')
}

interface RBFEStore {
  // Workflow state
  currentStep: number
  maxStep: number

  // Protein selection
  selectedProtein: string | null

  // Ligand selection (multi-select)
  availableLigands: LigandSelection[]
  selectedLigandIds: string[]

  // Docking mode
  dockingMode: DockingMode
  isDocking: boolean
  dockingProgress: number
  dockingStatus: string

  // Network configuration
  networkTopology: NetworkTopology
  centralLigand: string | null
  networkPreview: RBFENetworkData | null

  // RBFE Parameters
  rbfeParameters: RBFEParameters

  // Job Management
  jobs: RBFEJob[]
  activeJobId: string | null

  // Atom mapping preview (step 2)
  mappingPreviewJobId: string | null
  mappingPreviewStatus: 'idle' | 'running' | 'completed' | 'failed'
  mappingPreviewResult: MappingPreviewResult | null

  // Results
  rbfeResult: RBFEJob | null
  isRunning: boolean
  progress: number
  progressMessage: string
  jobId: string | null

  // Actions - Navigation
  setStep: (step: number) => void
  nextStep: () => void
  previousStep: () => void

  // Actions - Protein selection
  setSelectedProtein: (proteinId: string | null) => void

  // Actions - Ligand selection
  setAvailableLigands: (ligands: LigandSelection[]) => void
  toggleLigandSelection: (ligandId: string) => void
  setSelectedLigandIds: (ids: string[]) => void
  clearLigandSelection: () => void

  // Actions - Docking
  setDockingMode: (mode: DockingMode) => void
  setIsDocking: (isDocking: boolean) => void
  setDockingProgress: (progress: number, status?: string) => void

  // Actions - Network
  setNetworkTopology: (topology: NetworkTopology) => void
  setCentralLigand: (ligandId: string | null) => void
  setNetworkPreview: (preview: RBFENetworkData | null) => void

  // Actions - Parameters
  setRBFEParameters: (params: Partial<RBFEParameters>) => void

  // Actions - Job Management
  setJobs: (jobs: RBFEJob[]) => void
  addJob: (job: RBFEJob) => void
  updateJob: (jobId: string, updates: Partial<RBFEJob>) => void
  setActiveJob: (jobId: string | null) => void

  // Actions - Mapping Preview
  setMappingPreviewJobId: (jobId: string | null) => void
  setMappingPreviewStatus: (status: 'idle' | 'running' | 'completed' | 'failed') => void
  setMappingPreviewResult: (result: MappingPreviewResult | null) => void
  clearMappingPreview: () => void

  // Actions - Execution
  setIsRunning: (running: boolean) => void
  setProgress: (progress: number, message?: string) => void
  setJobId: (jobId: string | null) => void
  setRBFEResult: (result: RBFEJob | null) => void

  // Reset
  reset: () => void
  resetResults: () => void
}

const initialRBFEParameters: RBFEParameters = {
  network_topology: 'mst',
  atom_mapper: 'kartograf',  // NEW: Default to Kartograf (OpenFE best practice)
  atom_map_hydrogens: true,  // NEW: Include hydrogens in Kartograf mapping
  lomap_max3d: 1.0,  // NEW: LOMAP max 3D distance
  lambda_windows: 11,
  equilibration_length_ns: 0.1,
  production_length_ns: 0.5,
  protocol_repeats: 1,
  fast_mode: true,
  temperature: 300,
  pressure: 1.0,
  ionic_strength: 0.15,
  charge_method: 'am1bcc',
  ligand_forcefield: 'openff-2.0.0',
  robust: false,
  hydrogen_mass: 3.0,
  timestep_fs: 4.0,
}

export const useRBFEStore = create<RBFEStore>((set, get) => ({
  // Initial state
  currentStep: 1,
  maxStep: 5,

  selectedProtein: null,

  availableLigands: [],
  selectedLigandIds: [],

  dockingMode: 'existing_poses',
  isDocking: false,
  dockingProgress: 0,
  dockingStatus: '',

  networkTopology: 'mst',
  centralLigand: null,
  networkPreview: null,

  rbfeParameters: initialRBFEParameters,

  jobs: [],
  activeJobId: null,

  mappingPreviewJobId: null,
  mappingPreviewStatus: 'idle',
  mappingPreviewResult: null,

  rbfeResult: null,
  isRunning: false,
  progress: 0,
  progressMessage: '',
  jobId: null,

  // Navigation actions
  setStep: (step) => set({ currentStep: step }),

  nextStep: () =>
    set((state) => ({
      currentStep: Math.min(state.currentStep + 1, state.maxStep),
    })),

  previousStep: () =>
    set((state) => ({
      currentStep: Math.max(state.currentStep - 1, 1),
    })),

  // Protein selection
  setSelectedProtein: (proteinId) => set({ selectedProtein: proteinId }),

  // Ligand selection actions
  setAvailableLigands: (ligands) => set({ availableLigands: ligands }),

  toggleLigandSelection: (ligandId) =>
    set((state) => {
      const isSelected = state.selectedLigandIds.includes(ligandId)
      if (isSelected) {
        return {
          selectedLigandIds: state.selectedLigandIds.filter((id) => id !== ligandId),
        }
      } else {
        return {
          selectedLigandIds: [...state.selectedLigandIds, ligandId],
        }
      }
    }),

  setSelectedLigandIds: (ids) => set({ selectedLigandIds: ids }),

  clearLigandSelection: () => set({ selectedLigandIds: [] }),

  // Docking actions
  setDockingMode: (mode) => set({ dockingMode: mode }),

  setIsDocking: (isDocking) => set({ isDocking }),

  setDockingProgress: (progress, status = '') =>
    set({ dockingProgress: progress, dockingStatus: status }),

  // Network actions
  setNetworkTopology: (topology) =>
    set((state) => ({
      networkTopology: topology,
      rbfeParameters: { ...state.rbfeParameters, network_topology: topology },
    })),

  setCentralLigand: (ligandId) =>
    set((state) => ({
      centralLigand: ligandId,
      rbfeParameters: { ...state.rbfeParameters, central_ligand: ligandId || undefined },
    })),

  setNetworkPreview: (preview) => set({ networkPreview: preview }),

  // Mapping preview actions
  setMappingPreviewJobId: (jobId) => set({ mappingPreviewJobId: jobId }),

  setMappingPreviewStatus: (status) => set({ mappingPreviewStatus: status }),

  setMappingPreviewResult: (result) => set({ mappingPreviewResult: result }),

  clearMappingPreview: () => set({
    mappingPreviewJobId: null,
    mappingPreviewStatus: 'idle',
    mappingPreviewResult: null,
  }),

  // Parameter actions
  setRBFEParameters: (params) =>
    set((state) => ({
      rbfeParameters: { ...state.rbfeParameters, ...params },
    })),

  // Job Management actions
  setJobs: (jobs) =>
    set((state) => {
      const incomingJobs = Array.isArray(jobs) ? jobs : []
      const currentJobs = Array.isArray(state.jobs) ? state.jobs : []

      // Merge logic similar to ABFE
      const incomingJobsMap = new Map(incomingJobs.map((job) => [job.job_id, job]))

      const localOnlyJobs = currentJobs.filter((job) => {
        const isLocalOnly = !incomingJobsMap.has(job.job_id)
        return isLocalOnly && isRunningStatus(job.status)
      })

      const mergedJobs = [...incomingJobs, ...localOnlyJobs]

      const hasRunningJobs = mergedJobs.some((job) => isRunningStatus(job.status))
      return { jobs: mergedJobs, isRunning: hasRunningJobs }
    }),

  addJob: (job) =>
    set((state) => {
      const currentJobs = Array.isArray(state.jobs) ? state.jobs : []
      if (currentJobs.some((j) => j.job_id === job.job_id)) {
        return state
      }
      return { jobs: [...currentJobs, job] }
    }),

  updateJob: (jobId, updates) =>
    set((state) => {
      const currentJobs = Array.isArray(state.jobs) ? state.jobs : []
      const updatedJobs = currentJobs.map((job) =>
        job.job_id === jobId ? { ...job, ...updates } : job
      )
      const hasRunningJobs = updatedJobs.some((job) => isRunningStatus(job.status))
      return { jobs: updatedJobs, isRunning: hasRunningJobs }
    }),

  setActiveJob: (jobId) => set({ activeJobId: jobId }),

  // Execution actions
  setIsRunning: (running) => set({ isRunning: running }),

  setProgress: (progress, message = '') => set({ progress, progressMessage: message }),

  setJobId: (jobId) => set({ jobId }),

  setRBFEResult: (result) =>
    set((state) => ({
      rbfeResult: result,
      isRunning: isRunningStatus(result?.status),
      currentStep: state.currentStep === 4 ? 5 : state.currentStep,
    })),

  // Reset actions
  resetResults: () =>
    set({
      rbfeResult: null,
      isRunning: false,
      progress: 0,
      progressMessage: '',
      jobId: null,
    }),

  reset: () =>
    set({
      currentStep: 1,
      selectedProtein: null,
      selectedLigandIds: [],
      dockingMode: 'existing_poses',
      isDocking: false,
      dockingProgress: 0,
      dockingStatus: '',
      networkTopology: 'mst',
      centralLigand: null,
      referenceLigand: null,
      networkPreview: null,
      mappingPreviewJobId: null,
      mappingPreviewStatus: 'idle',
      mappingPreviewResult: null,
      rbfeParameters: initialRBFEParameters,
      rbfeResult: null,
      isRunning: false,
      progress: 0,
      progressMessage: '',
      jobId: null,
      activeJobId: null,
    }),
}))







