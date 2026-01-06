import { create } from 'zustand'

export interface Boltz2AlignmentOptions {
  use_alignment: boolean
  alignment_method: 'binding_site' | 'full_structure' | 'none'
  use_svd: boolean
  binding_site_radius: number
  iterative_until_threshold: boolean
  target_rmsd: number
}

export interface Boltz2PredictionParams {
  num_poses?: number
  confidence_threshold?: number
  accelerator?: 'gpu' | 'cpu'
}

export interface Boltz2MSAOptions {
  generateMsa: boolean
  msaMethod: 'ncbi_blast' | 'mmseqs2_server' | 'mmseqs2_local'
  msaSequenceHash: string | null
  msaStatus: 'idle' | 'checking' | 'generating' | 'ready' | 'error'
  msaCached: boolean
  msaError: string | null
}

export interface Boltz2Job {
  job_id: string
  status: string
  created_at: string
  updated_at?: string
  request?: any
  results?: any
  error?: string
  warnings?: string[]
  // Batch-specific fields
  batch_id?: string
  batch_index?: number
  batch_total?: number
  ligand_id?: string
  ligand_name?: string
}

export interface Boltz2Pose {
  pose_index: number
  affinity_pred_value: number
  binding_free_energy?: number
  affinity_probability_binary: number
  structure_data: string
  confidence?: number
  confidence_score?: number
  aggregate_score?: number
  iptm?: number
  ptm?: number
  complex_plddt?: number
  plddt?: number
  complex_iplddt?: number
  complex_pde?: number
  complex_ipde?: number
  has_pae?: boolean
}

export interface Boltz2Result {
  success: boolean
  job_id?: string
  affinity_pred_value?: number
  binding_free_energy?: number
  affinity_probability_binary?: number
  structure_data?: string
  prediction_confidence?: number
  processing_time?: number
  poses?: Boltz2Pose[]
  alignment_results?: any
  alignment_options?: Boltz2AlignmentOptions
  num_poses_generated?: number
  error?: string
  warnings?: string[]
  details?: {
    residue_count?: number
    accelerator?: string
    suggestion?: string
  }
  // MSA info from prediction
  msa_sequence_hash?: string
  msa_used?: boolean
  results?: Boltz2BatchLigandResult[]
}

// Batch screening result for a single ligand
export interface Boltz2BatchLigandResult {
  success: boolean
  ligand_id: string
  ligand_name: string
  affinity_pred_value?: number
  binding_free_energy?: number
  affinity_probability_binary?: number
  prediction_confidence?: number
  aggregate_score?: number
  confidence_score?: number
  ptm?: number
  iptm?: number
  complex_plddt?: number
  processing_time?: number
  poses?: Boltz2Pose[]
  error?: string
  warnings?: string[]
}

interface Boltz2Store {
  // Wizard state
  currentStep: number
  isRunning: boolean
  progress: number
  progressMessage: string

  // Input selection
  selectedProtein: string | null
  selectedLigand: string | null
  proteinSource: 'current' | 'library' | null
  ligandSource: 'current' | 'library' | 'smiles' | 'upload' | null
  ligandSmiles: string

  // Batch mode
  isBatchMode: boolean
  batchLigands: string[]  // Selected ligand IDs for batch
  activeBatchId: string | null
  batchResults: Boltz2BatchLigandResult[]

  // Prediction parameters
  predictionParams: Boltz2PredictionParams
  alignmentOptions: Boltz2AlignmentOptions
  msaOptions: Boltz2MSAOptions

  // Job Management
  jobs: Boltz2Job[]
  activeJobId: string | null

  // Results
  result: Boltz2Result | null
  selectedPose: number
  originalStructureData: string | null  // Original structure before prediction

  // Service status
  serviceAvailable: boolean | null

  // Actions
  setStep: (step: number) => void
  nextStep: () => void
  previousStep: () => void
  setIsRunning: (isRunning: boolean) => void
  setProgress: (progress: number, message?: string) => void

  setSelectedProtein: (protein: string | null) => void
  setProteinSource: (source: 'current' | 'library' | null) => void
  setSelectedLigand: (ligand: string | null) => void
  setLigandSource: (source: 'current' | 'library' | 'smiles' | 'upload' | null) => void
  setLigandSmiles: (smiles: string) => void

  // Batch mode actions
  setIsBatchMode: (enabled: boolean) => void
  setBatchLigands: (ligands: string[]) => void
  toggleBatchLigand: (ligandId: string) => void
  setActiveBatchId: (batchId: string | null) => void
  setBatchResults: (results: Boltz2BatchLigandResult[]) => void
  addBatchResult: (result: Boltz2BatchLigandResult) => void
  clearBatchResults: () => void

  setPredictionParams: (params: Partial<Boltz2PredictionParams>) => void
  setAlignmentOptions: (options: Partial<Boltz2AlignmentOptions>) => void
  setNumPoses: (num: number) => void
  setMsaOptions: (options: Partial<Boltz2MSAOptions>) => void

  setJobs: (jobs: Boltz2Job[]) => void
  addJob: (job: Boltz2Job) => void
  updateJob: (jobId: string, updates: Partial<Boltz2Job>) => void
  setActiveJob: (jobId: string | null) => void

  setResult: (result: Boltz2Result | null) => void
  setSelectedPose: (poseIndex: number) => void
  setOriginalStructureData: (data: string | null) => void
  setServiceAvailable: (available: boolean) => void

  reset: () => void
}

const defaultAlignmentOptions: Boltz2AlignmentOptions = {
  use_alignment: true,
  alignment_method: 'binding_site',
  use_svd: true,
  binding_site_radius: 8.0,
  iterative_until_threshold: false,
  target_rmsd: 0.05,
}

const defaultPredictionParams: Boltz2PredictionParams = {
  num_poses: 1,
  confidence_threshold: 0.7,
  accelerator: 'gpu',
}

const defaultMsaOptions: Boltz2MSAOptions = {
  generateMsa: false,
  msaMethod: 'ncbi_blast', // Default to NCBI BLAST (more reliable)
  msaSequenceHash: null,
  msaStatus: 'idle',
  msaCached: false,
  msaError: null,
}

export const useBoltz2Store = create<Boltz2Store>((set) => ({
  // Initial state
  currentStep: 1,
  isRunning: false,
  progress: 0,
  progressMessage: '',

  selectedProtein: null,
  selectedLigand: null,
  proteinSource: null,
  ligandSource: null,
  ligandSmiles: '',

  // Batch mode initial state
  isBatchMode: false,
  batchLigands: [],
  activeBatchId: null,
  batchResults: [],

  predictionParams: defaultPredictionParams,
  alignmentOptions: defaultAlignmentOptions,
  msaOptions: defaultMsaOptions,

  jobs: [],
  activeJobId: null,

  result: null,
  selectedPose: 0,
  originalStructureData: null,
  serviceAvailable: null,

  // Actions
  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 4) })),
  previousStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
  setIsRunning: (isRunning) => set({ isRunning }),
  setProgress: (progress, message) => set({
    progress,
    progressMessage: message || ''
  }),

  setSelectedProtein: (protein) => set({ selectedProtein: protein }),
  setProteinSource: (source) => set({ proteinSource: source }),
  setSelectedLigand: (ligand) => set({ selectedLigand: ligand }),
  setLigandSource: (source) => set({ ligandSource: source }),
  setLigandSmiles: (smiles) => set({ ligandSmiles: smiles }),

  // Batch mode actions
  setIsBatchMode: (enabled) => set({ isBatchMode: enabled, batchLigands: [], batchResults: [] }),
  setBatchLigands: (ligands) => set({ batchLigands: ligands }),
  toggleBatchLigand: (ligandId) => set((state) => ({
    batchLigands: state.batchLigands.includes(ligandId)
      ? state.batchLigands.filter((id) => id !== ligandId)
      : [...state.batchLigands, ligandId]
  })),
  setActiveBatchId: (batchId) => set({ activeBatchId: batchId }),
  setBatchResults: (results) => set({ batchResults: results }),
  addBatchResult: (result) => set((state) => ({
    batchResults: [...state.batchResults, result]
  })),
  clearBatchResults: () => set({ batchResults: [], activeBatchId: null }),

  setPredictionParams: (params) => set((state) => ({
    predictionParams: { ...state.predictionParams, ...params }
  })),
  setAlignmentOptions: (options) => set((state) => ({
    alignmentOptions: { ...state.alignmentOptions, ...options }
  })),
  setNumPoses: (num) => set((state) => ({
    predictionParams: { ...state.predictionParams, num_poses: num }
  })),
  setMsaOptions: (options) => set((state) => ({
    msaOptions: { ...state.msaOptions, ...options }
  })),

  setJobs: (jobs) => set({ jobs }),
  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
  updateJob: (jobId, updates) => set((state) => ({
    jobs: state.jobs.map((j) => (j.job_id === jobId ? { ...j, ...updates } : j))
  })),
  setActiveJob: (jobId) => set({ activeJobId: jobId }),

  setResult: (result) => set({ result }),
  setSelectedPose: (poseIndex) => set({ selectedPose: poseIndex }),
  setOriginalStructureData: (data) => set({ originalStructureData: data }),
  setServiceAvailable: (available) => set({ serviceAvailable: available }),

  reset: () => set({
    currentStep: 1,
    isRunning: false,
    progress: 0,
    progressMessage: '',
    selectedProtein: null,
    selectedLigand: null,
    proteinSource: null,
    ligandSource: null,
    ligandSmiles: '',
    isBatchMode: false,
    batchLigands: [],
    activeBatchId: null,
    batchResults: [],
    predictionParams: defaultPredictionParams,
    alignmentOptions: defaultAlignmentOptions,
    msaOptions: defaultMsaOptions,
    result: null,
    selectedPose: 0,
    originalStructureData: null,
    activeJobId: null,
  }),
}))
