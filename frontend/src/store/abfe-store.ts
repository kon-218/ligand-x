import { create } from 'zustand'
import type {
    ABFEParameters,
    ABFEResult,
    ABFEJob,
    StructureOption,
    ABFEParsedResults,
} from '@/types/abfe-types'
import { mergeJobs } from '@/lib/job-utils'

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
    // ABFE has two-phase result loading: raw results first, then parsed analysis
    // This is intentional and different from MD/RBFE which combine results+parsing
    isLoadingResults: boolean  // Loading raw ABFE results
    isLoadingParsed: boolean   // Loading/parsing analysis data
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
    fast_mode: true,

    // Core simulation (fast mode defaults)
    equilibration_length_ns: 0.1,
    production_length_ns: 0.5,
    protocol_repeats: 1,

    // Checkpoint settings
    production_n_checkpoints: 10,
    production_checkpoint_mode: 'number',
    equilibration_n_checkpoints: 5,
    equilibration_checkpoint_mode: 'number',

    // Ligand preparation (OpenFE defaults)
    ligand_forcefield: 'openff-2.2.1',
    charge_method: 'am1bcc',

    // Environment (OpenFE defaults)
    temperature: 298.15,
    pressure: 1.0,
    solvent_model: 'tip3p',
    ionic_strength: 0.15,
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

        // Use shared merge utility to preserve local pending/running jobs
        const isRunningStatus = (status: string) =>
            status === 'running' || status === 'preparing' || status === 'submitted'
        const mergedJobs = mergeJobs(currentJobs, incomingJobs, isRunningStatus)

        // Automatically update isRunning based on job status
        const hasRunningJobs = mergedJobs.some(job => isRunningStatus(job.status))
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
