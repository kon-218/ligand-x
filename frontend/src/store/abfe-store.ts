import { create } from 'zustand'
import type {
    ABFEParameters,
    ABFEResult,
    ABFEJob,
    StructureOption,
    ABFEParsedResults,
} from '@/types/abfe-types'

// Preloaded ligand from external source (e.g., MD equilibration output)
interface PreloadedLigand {
    name: string
    data: string  // SDF or PDB data
    format: 'sdf' | 'pdb'
    source: string  // e.g., 'md_equilibration', 'docking', 'boltz2'
}

interface ABFEStore {
    // Workflow state
    currentStep: number
    maxStep: number

    // Structure selection
    availableProteins: StructureOption[]
    availableLigands: StructureOption[]
    selectedProtein: string | null
    selectedLigand: string | null

    // Preloaded ligand from external source (MD, Docking, Boltz2)
    preloadedLigand: PreloadedLigand | null

    // ABFE Parameters
    abfeParameters: ABFEParameters

    // Job Management
    jobs: ABFEJob[]
    activeJobId: string | null

    // Results
    abfeResult: ABFEResult | null
    isRunning: boolean
    progress: number
    progressMessage: string
    jobId: string | null
    parsedResults: ABFEParsedResults | null
    isLoadingResults: boolean
    isLoadingParsed: boolean
    parseError: string | null

    // Actions - Navigation
    setStep: (step: number) => void
    nextStep: () => void
    previousStep: () => void

    // Actions - Structure selection
    setAvailableProteins: (proteins: StructureOption[]) => void
    setAvailableLigands: (ligands: StructureOption[]) => void
    setSelectedProtein: (proteinId: string | null) => void
    setSelectedLigand: (ligandId: string | null) => void
    setPreloadedLigand: (ligand: PreloadedLigand | null) => void

    // Actions - Parameters
    setABFEParameters: (params: Partial<ABFEParameters>) => void

    // Actions - Job Management
    setJobs: (jobs: ABFEJob[]) => void
    addJob: (job: ABFEJob) => void
    setActiveJob: (jobId: string | null) => void

    // Actions - Execution
    setIsRunning: (running: boolean) => void
    setProgress: (progress: number, message?: string) => void
    setJobId: (jobId: string | null) => void
    setABFEResult: (result: ABFEResult | null) => void
    setParsedResults: (results: ABFEParsedResults | null) => void
    setIsLoadingResults: (loading: boolean) => void
    setIsLoadingParsed: (loading: boolean) => void
    setParseError: (error: string | null) => void

    // Reset
    reset: () => void
    resetResults: () => void
}

const initialABFEParameters: ABFEParameters = {
    simulation_time_ns: 1.0, // Short for POC
    fast_mode: true, // Fast mode by default - reduces iterations significantly

    // New fine-grained control parameters
    equilibration_length_ns: 0.1, // 0.1 ns for fast mode
    production_length_ns: 0.5, // 0.5 ns for fast mode (200 iterations * 2.5 ps)
    n_checkpoints: 10, // 10 checkpoints by default (deprecated, use production_n_checkpoints)
    protocol_repeats: 1, // 1 independent repetition for fast mode

    // Production checkpoint settings
    production_n_checkpoints: 10, // 10 checkpoints for production
    production_checkpoint_mode: 'number', // Use number of checkpoints by default

    // Equilibration checkpoint settings
    equilibration_n_checkpoints: 5, // 5 checkpoints for equilibration
    equilibration_checkpoint_mode: 'number', // Use number of checkpoints by default

    // Legacy parameters (still supported for backward compatibility)
    n_iterations: 200, // Fast mode: 200 iterations (~15-30 min) vs 4000 (~5+ hours)
    steps_per_iteration: 1000, // Reduced steps per iteration for speed

    temperature: 300,
    pressure: 1.0,
    ionic_strength: 0.15,
    ligand_forcefield: 'openff-2.0.0',
    charge_method: 'am1bcc',
}

export const useABFEStore = create<ABFEStore>((set, get) => ({
    // Initial state
    currentStep: 1,
    maxStep: 4,

    availableProteins: [],
    availableLigands: [],
    selectedProtein: null,
    selectedLigand: null,
    preloadedLigand: null,

    abfeParameters: initialABFEParameters,

    parsedResults: null,
    isLoadingResults: false,
    isLoadingParsed: false,
    parseError: null,

    jobs: [],
    activeJobId: null,

    abfeResult: null,
    isRunning: false,
    progress: 0,
    progressMessage: '',
    jobId: null,

    // Navigation actions
    setStep: (step) => set({ currentStep: step }),

    nextStep: () =>
        set((state: ABFEStore) => ({
            currentStep: Math.min(state.currentStep + 1, state.maxStep),
        })),

    previousStep: () =>
        set((state: ABFEStore) => ({
            currentStep: Math.max(state.currentStep - 1, 1),
        })),

    // Structure selection actions
    setAvailableProteins: (proteins) => set({ availableProteins: proteins }),

    setAvailableLigands: (ligands) => set({ availableLigands: ligands }),

    setSelectedProtein: (proteinId) => set({ selectedProtein: proteinId }),

    setSelectedLigand: (ligandId) => set({ selectedLigand: ligandId }),

    setPreloadedLigand: (ligand) => set({
        preloadedLigand: ligand,
        // If preloading a ligand, auto-select it
        selectedLigand: ligand ? 'preloaded' : null,
    }),

    // Parameter actions
    setABFEParameters: (params) =>
        set((state: ABFEStore) => ({
            abfeParameters: { ...state.abfeParameters, ...params },
        })),

    // Job Management actions
    setJobs: (jobs) => set((state: ABFEStore) => {
        const incomingJobs = Array.isArray(jobs) ? jobs : []
        const currentJobs = Array.isArray(state.jobs) ? state.jobs : []

        // Create a map of incoming jobs by ID for quick lookup
        const incomingJobsMap = new Map(incomingJobs.map(job => [job.job_id, job]))

        // Merge: Keep local pending/running jobs that aren't in the incoming data yet
        const localOnlyJobs = currentJobs.filter((job: ABFEJob) => {
            const isLocalOnly = !incomingJobsMap.has(job.job_id)
            const isPendingOrRunning = job.status === 'running' || job.status === 'preparing' || job.status === 'submitted'
            return isLocalOnly && isPendingOrRunning
        })

        // Combine: incoming jobs (with latest status from backend) + local-only pending jobs
        const mergedJobs = [...incomingJobs, ...localOnlyJobs]

        // Automatically update isRunning based on job status
        const hasRunningJobs = mergedJobs.some(job =>
            job.status === 'running' || job.status === 'preparing' || job.status === 'submitted'
        )
        return { jobs: mergedJobs, isRunning: hasRunningJobs }
    }),

    addJob: (job) => set((state: ABFEStore) => {
        const currentJobs = Array.isArray(state.jobs) ? state.jobs : []
        // Check if job already exists (prevent duplicates)
        if (currentJobs.some((j: ABFEJob) => j.job_id === job.job_id)) {
            return state
        }
        return { jobs: [...currentJobs, job] }
    }),

    setActiveJob: (jobId) => set({ activeJobId: jobId }),

    // Execution actions
    setIsRunning: (running) => set({ isRunning: running }),

    setProgress: (progress, message = '') =>
        set({ progress, progressMessage: message }),

    setJobId: (jobId) => set({ jobId }),

    setABFEResult: (result) =>
        set({
            abfeResult: result,
            // Only set isRunning to true if status is actually running/preparing/submitted
            // Set to false if completed, failed, or any other status
            isRunning: result?.status === 'running' ||
                result?.status === 'preparing' ||
                result?.status === 'submitted',
        }),

    setParsedResults: (results) => set({ parsedResults: results }),
    setIsLoadingResults: (loading) => set({ isLoadingResults: loading }),
    setIsLoadingParsed: (loading) => set({ isLoadingParsed: loading }),
    setParseError: (error) => set({ parseError: error }),


    // Reset actions
    resetResults: () =>
        set({
            abfeResult: null,
            isRunning: false,
            progress: 0,
            progressMessage: '',
            jobId: null,
            parsedResults: null,
            isLoadingResults: false,
            isLoadingParsed: false,
            parseError: null,
        }),

    reset: () =>
        set({
            currentStep: 1,
            selectedProtein: null,
            selectedLigand: null,
            preloadedLigand: null,
            abfeParameters: initialABFEParameters,
            abfeResult: null,
            isRunning: false,
            progress: 0,
            progressMessage: '',
            jobId: null,
            activeJobId: null,
        }),
}))
