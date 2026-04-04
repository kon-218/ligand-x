import { create } from 'zustand'
import type {
  MDParameters,
  LigandInput,
  MDResult,
  LigandInputMethod,
  SimulationLength,
  TrajectoryInfo,
  BoxShape,
} from '@/types/md-types'
import type { StructureOption } from '@/components/Tools/shared/types'

// Maps backend snake_case stage names to frontend display names.
// thermal_heating is intentionally excluded — it's folded into NVT Equilibration.
const BACKEND_STAGE_MAP: Record<string, string> = {
  preparation: 'Preparation',
  minimization: 'Minimization',
  nvt: 'NVT Equilibration',
  npt: 'NPT Equilibration',
  production: 'Production',
}

function mapBackendStages(stages: string[]): string[] {
  return stages.map(s => BACKEND_STAGE_MAP[s]).filter((s): s is string => s !== undefined)
}

export interface MDJob {
  job_id: string
  status: string
  created_at: string
  updated_at?: string
  progress?: number
  message?: string
  protein_id?: string
  ligand_id?: string
  request?: any
  results?: any
  error?: string
}

interface MDStore {
  // Workflow state
  currentStep: number
  maxStep: number
  
  // Structure selection
  availableProteins: StructureOption[]
  availableLigands: StructureOption[]
  selectedProtein: string | null
  selectedLigandMethod: LigandInputMethod
  ligandInput: LigandInput
  
  // MD Parameters
  mdParameters: MDParameters
  
  // Job Management
  jobs: MDJob[]
  activeJobId: string | null
  
  // Results
  mdResult: MDResult | null
  isRunning: boolean
  progress: number
  progressMessage: string
  completedStages: string[]
  jobId: string | null
  isResuming: boolean
  hasProduction: boolean  // true when the active/selected job includes production MD
  
  // Trajectory viewer state
  trajectoryInfo: TrajectoryInfo | null
  currentFrame: number
  isPlaying: boolean
  playbackSpeed: number
  
  // Actions - Navigation
  setStep: (step: number) => void
  nextStep: () => void
  previousStep: () => void
  
  // Actions - Structure selection
  setAvailableProteins: (proteins: StructureOption[]) => void
  setAvailableLigands: (ligands: StructureOption[]) => void
  setSelectedProtein: (proteinId: string | null) => void
  setSelectedLigandMethod: (method: LigandInputMethod) => void
  setLigandInput: (input: Partial<LigandInput>) => void
  
  // Actions - Parameters
  setSimulationLength: (length: SimulationLength) => void
  setCustomSteps: (nvt: number, npt: number) => void
  setTemperature: (temp: number) => void
  setPressure: (pressure: number) => void
  setIonicStrength: (strength: number) => void
  setBoxShape: (shape: BoxShape) => void
  setProductionSteps: (steps: number) => void
  setMDParameters: (params: Partial<MDParameters>) => void
  
  // Actions - Job Management
  setJobs: (jobs: MDJob[]) => void
  addJob: (job: MDJob) => void
  updateJob: (jobId: string, updates: Partial<MDJob>) => void
  setActiveJob: (jobId: string | null) => void
  
  // Actions - Execution
  setIsRunning: (running: boolean) => void
  setProgress: (progress: number, message?: string, completedStages?: string[]) => void
  setCompletedStages: (stages: string[]) => void
  setMDResult: (result: MDResult | null) => void
  setJobId: (jobId: string | null) => void
  setHasProduction: (value: boolean) => void
  
  // Actions - Trajectory
  setTrajectoryInfo: (info: TrajectoryInfo | null) => void
  setCurrentFrame: (frame: number) => void
  setIsPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void

  // Actions - Resume
  resumeJob: (jobId: string) => Promise<void>

  // Reset
  reset: () => void
  resetResults: () => void
}

const initialMDParameters: MDParameters = {
  simulation_length: 'medium',
  nvt_steps: 25000,
  npt_steps: 250000,
  temperature: 300,
  pressure: 1.0,
  ionic_strength: 0.15,
  preview_before_equilibration: false,
  charge_method: 'am1bcc',
  forcefield_method: 'openff-2.2.1',
  box_shape: 'dodecahedron',
  production_steps: 2500000,
  padding_nm: 1.0,
  heating_steps_per_stage: 2500,
}

const initialLigandInput: LigandInput = {
  method: 'existing',
  generate_conformer: true,
  preserve_pose: true,
}

const simulationLengthSteps: Record<Exclude<SimulationLength, 'custom'>, {
  nvt_steps: number
  npt_steps: number
  production_steps: number
  heating_steps_per_stage: number
}> = {
  short: { nvt_steps: 25000, npt_steps: 175000, production_steps: 0, heating_steps_per_stage: 2500 },
  medium: { nvt_steps: 25000, npt_steps: 250000, production_steps: 2500000, heating_steps_per_stage: 2500 },
  long: { nvt_steps: 50000, npt_steps: 500000, production_steps: 6250000, heating_steps_per_stage: 2500 },
}

export const useMDStore = create<MDStore>((set) => ({
  // Initial state
  currentStep: 1,
  maxStep: 4,
  
  availableProteins: [],
  availableLigands: [],
  selectedProtein: null,
  selectedLigandMethod: 'existing',
  ligandInput: initialLigandInput,
  
  mdParameters: initialMDParameters,
  
  jobs: [],
  activeJobId: null,
  
  mdResult: null,
  isRunning: false,
  progress: 0,
  progressMessage: '',
  completedStages: [],
  jobId: null,
  isResuming: false,
  hasProduction: true,  // default preset is 'medium' which includes production

  trajectoryInfo: null,
  currentFrame: 0,
  isPlaying: false,
  playbackSpeed: 1.0,
  
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
  
  // Structure selection actions
  setAvailableProteins: (proteins) => set({ availableProteins: proteins }),
  
  setAvailableLigands: (ligands) => set({ availableLigands: ligands }),
  
  setSelectedProtein: (proteinId) => set({ selectedProtein: proteinId }),
  
  setSelectedLigandMethod: (method) =>
    set((state) => ({
      selectedLigandMethod: method,
      ligandInput: { ...state.ligandInput, method },
    })),
  
  setLigandInput: (input) =>
    set((state) => ({
      ligandInput: { ...state.ligandInput, ...input },
    })),
  
  // Parameter actions
  setSimulationLength: (length) =>
    set((state) => {
      const nextParameters: MDParameters = {
        ...state.mdParameters,
        simulation_length: length,
      }

      if (length !== 'custom') {
        const preset = simulationLengthSteps[length]
        nextParameters.nvt_steps = preset.nvt_steps
        nextParameters.npt_steps = preset.npt_steps
        nextParameters.production_steps = preset.production_steps
        nextParameters.heating_steps_per_stage = preset.heating_steps_per_stage
      }

      return {
        mdParameters: nextParameters,
        hasProduction: length === 'custom'
          ? (nextParameters.production_steps ?? 0) > 0
          : ['medium', 'long'].includes(length),
      }
    }),
  
  setCustomSteps: (nvt, npt) =>
    set((state) => ({
      mdParameters: {
        ...state.mdParameters,
        nvt_steps: nvt,
        npt_steps: npt,
      },
    })),
  
  setTemperature: (temp) =>
    set((state) => ({
      mdParameters: { ...state.mdParameters, temperature: temp },
    })),
  
  setPressure: (pressure) =>
    set((state) => ({
      mdParameters: { ...state.mdParameters, pressure },
    })),
  
  setIonicStrength: (strength) =>
    set((state) => ({
      mdParameters: { ...state.mdParameters, ionic_strength: strength },
    })),

  setBoxShape: (shape) =>
    set((state) => ({
      mdParameters: { ...state.mdParameters, box_shape: shape },
    })),

  setProductionSteps: (steps) =>
    set((state) => ({
      mdParameters: { ...state.mdParameters, production_steps: steps },
      hasProduction: steps > 0,
    })),

  setMDParameters: (params) =>
    set((state) => ({
      mdParameters: { ...state.mdParameters, ...params },
    })),
  
  // Job Management actions
  setJobs: (jobs) => set({ jobs }),
  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
  updateJob: (jobId, updates) => set((state) => ({
    jobs: state.jobs.map((j) => (j.job_id === jobId ? { ...j, ...updates } : j))
  })),
  setActiveJob: (jobId) => set({ activeJobId: jobId }),
  
  // Execution actions
  setIsRunning: (running) => set({ isRunning: running }),
  
  setProgress: (progress, message = '', completedStages) =>
    set((state) => {
      let stages: string[]

      if (completedStages !== undefined) {
        // Backend provided explicit completed_stages — map them to display names
        stages = mapBackendStages(completedStages)
      } else if (state.isRunning) {
        // During execution, if backend doesn't provide stages, keep existing ones
        // Don't infer - let the backend control what's marked complete
        stages = state.completedStages
      } else {
        // Fallback: only infer from progress when loading completed jobs from DB
        // where backend stages aren't available
        stages = []
        if (progress > 9)  stages.push('Preparation')
        if (progress > 15) stages.push('Minimization')
        if (progress > 35) stages.push('NVT Equilibration')
        if (progress >= 100) stages.push('NPT Equilibration')
      }

      return {
        progress,
        progressMessage: message,
        completedStages: stages,
      }
    }),
  
  setCompletedStages: (stages) => set({ completedStages: stages }),
  
  setMDResult: (result) =>
    set((state) => ({
      mdResult: result,
      isRunning: false,
      currentStep: state.currentStep === 4 ? 4 : (result ? 4 : 3),
      // Update completedStages from result if available (map backend names to display names)
      // If result is null (e.g., when selecting a running job), preserve existing stages
      completedStages: result?.completed_stages
        ? mapBackendStages(result.completed_stages)
        : (result === null ? state.completedStages : []),
    })),
    
  setJobId: (jobId) => set({ jobId }),

  setHasProduction: (value) => set({ hasProduction: value }),
  
  // Trajectory actions
  setTrajectoryInfo: (info) => set({ trajectoryInfo: info }),
  
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  // Resume action
  resumeJob: async (jobId: string) => {
    try {
      set({ isResuming: true })
      const { api } = await import('@/lib/api-client')
      await api.resumeMDJob(jobId)
      // Job will reappear in joblist via WebSocket updates
      // No need to manually refresh - unified-results-store handles it
      set({ isResuming: false })
    } catch (error) {
      console.error('Failed to resume MD job:', error)
      set({ isResuming: false })
      throw error
    }
  },

  // Reset actions
  resetResults: () =>
    set({
      mdResult: null,
      isRunning: false,
      progress: 0,
      progressMessage: '',
      completedStages: [],
      jobId: null,
      activeJobId: null,
      trajectoryInfo: null,
      currentFrame: 0,
      isPlaying: false,
      hasProduction: false,
    }),
  
  reset: () =>
    set({
      currentStep: 1,
      selectedProtein: null,
      selectedLigandMethod: 'existing',
      ligandInput: initialLigandInput,
      mdParameters: initialMDParameters,
      mdResult: null,
      isRunning: false,
      progress: 0,
      progressMessage: '',
      completedStages: [],
      jobId: null,
      trajectoryInfo: null,
      currentFrame: 0,
      isPlaying: false,
      activeJobId: null,
    }),
}))
