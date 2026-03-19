import { create } from 'zustand'
import type { QCAdvancedParameters } from '@/components/Tools/QC/QCAdvancedParameters'

export interface BDEResult {
  bond_idx: number
  bond_label: string
  atom1_idx: number
  atom2_idx: number
  atom1_symbol: string
  atom2_symbol: string
  bond_type: string
  frag1_energy_hartree?: number
  frag2_energy_hartree?: number | null
  bde_raw_kcal?: number
  bde_corrected_kcal?: number
  status: 'success' | 'failed'
  is_in_ring?: boolean
  ring_opening?: boolean
  biradical_mult?: number
  biradical_energy_hartree?: number
  error?: string
  rank?: number
}

export interface QCJob {
  id: string
  molecule_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  job_type?: 'standard' | 'ir' | 'fukui' | 'conformer' | 'bde'
  method: string
  basis_set: string
  created_at: string
  updated_at: string
  progress?: number
  error_message?: string
}

export interface QCResults {
  // Energy
  final_energy_hartree?: number
  
  // Frontier Molecular Orbitals
  homo_eV?: number
  lumo_eV?: number
  gap_eV?: number
  homo_index?: number

  // Electrostatics
  dipole_magnitude_debye?: number
  dipole_vector?: [number, number, number]
  chelpg_charges?: number[]
  mulliken_charges?: number[]

  // Thermodynamics
  gibbs_free_energy_hartree?: number
  enthalpy_hartree?: number
  entropy_hartree_per_kelvin?: number
  is_valid_minimum?: boolean

  // Solvation
  delta_g_solv_kcal_mol?: number
  g_enp_hartree?: number
  g_cds_hartree?: number

  // IR Spectrum
  ir_frequencies?: number[]
  ir_intensities?: number[]
  ir_spectrum_file?: string // Path to .dat file

  // Normal Modes
  normal_modes?: {
    frequencies: number[]
    intensities: number[]
    displacements?: number[][][] // [mode][atom][x,y,z]
    equilibrium_geometry?: number[][] // [atom][x,y,z]
    atom_symbols?: string[]
  }

  // Conformer Search
  conformers?: {
    conf_id: number
    energy_hartree: number
    rel_energy_kcal: number
    xyz_content: string
    xyz_file?: string
  }[]

  // Fukui Indices
  fukui?: {
    atoms: string[]
    f_plus: number[]
    f_minus: number[]
    f_zero: number[]
    charges_neutral: number[]
  }

  // Bond Dissociation Energies
  bde_results?: BDEResult[]
  bde_statistics?: {
    min_bde_kcal: number
    max_bde_kcal: number
    mean_bde_kcal: number
    weakest_bond: string
    strongest_bond: string
    n_successful: number
    n_ring_bonds: number
    n_failed: number
  }
  parent_energy_hartree?: number
  regression_coeffs?: { a: number; b: number }

  // File URLs for visualization
  structure_url?: string
  homo_cube_url?: string
  lumo_cube_url?: string
  density_cube_url?: string
  esp_cube_url?: string
  ir_spectrum_url?: string
}

export interface QCPreset {
  id: string
  name: string
  description: string
  method: string
  basis_set: string
  keywords: string[]
  use_case: string
}

interface QCStore {
  // Job Management
  jobs: QCJob[]
  activeJobId: string | null
  isRunning: boolean
  
  // Results
  results: Record<string, QCResults>
  activeResults: QCResults | null
  
  // Presets
  presets: QCPreset[]
  selectedPreset: QCPreset | null
  
  // Advanced Parameters
  advancedParameters: QCAdvancedParameters | null
  
  // Visualization State
  activeVisualization: 'ir' | 'homo' | 'lumo' | 'esp' | null
  showMolecularOrbitals: boolean
  showESPMap: boolean
  orbitalIsovalue: number
  espIsovalue: number
  
  // Actions
  setJobs: (jobs: QCJob[]) => void
  addJob: (job: QCJob) => void
  updateJob: (jobId: string, updates: Partial<QCJob>) => void
  setActiveJob: (jobId: string | null) => void
  setIsRunning: (running: boolean) => void
  
  setResults: (jobId: string, results: QCResults) => void
  setActiveResults: (results: QCResults | null) => void
  
  setPresets: (presets: QCPreset[]) => void
  setSelectedPreset: (preset: QCPreset | null) => void
  
  setAdvancedParameters: (params: QCAdvancedParameters | null) => void
  updateAdvancedParameters: (params: Partial<QCAdvancedParameters>) => void
  
  setActiveVisualization: (viz: 'ir' | 'homo' | 'lumo' | 'esp' | null) => void
  setShowMolecularOrbitals: (show: boolean) => void
  setShowESPMap: (show: boolean) => void
  setOrbitalIsovalue: (value: number) => void
  setESPIsovalue: (value: number) => void
  
  // Reset
  reset: () => void
}

export const useQCStore = create<QCStore>((set, get) => ({
  // Initial state
  jobs: [],
  activeJobId: null,
  isRunning: false,
  
  results: {},
  activeResults: null,
  
  presets: [],
  selectedPreset: null,
  
  advancedParameters: null,
  
  activeVisualization: null,
  showMolecularOrbitals: false,
  showESPMap: false,
  orbitalIsovalue: 0.02,
  espIsovalue: 0.01,
  
  // Job Management Actions
  setJobs: (jobs) => set((state) => {
    const incomingJobs = Array.isArray(jobs) ? jobs : []
    const currentJobs = Array.isArray(state.jobs) ? state.jobs : []
    
    // Create a map of incoming jobs by ID for quick lookup
    const incomingJobsMap = new Map(incomingJobs.map(job => [job.id, job]))
    
    // Merge: Keep local pending/running jobs that aren't in the incoming data yet
    // (they might not be persisted to backend yet)
    const localOnlyJobs = currentJobs.filter(job => {
      const isLocalOnly = !incomingJobsMap.has(job.id)
      const isPendingOrRunning = job.status === 'pending' || job.status === 'running'
      return isLocalOnly && isPendingOrRunning
    })
    
    // Combine: incoming jobs (with latest status from backend) + local-only pending jobs
    const mergedJobs = [...incomingJobs, ...localOnlyJobs]
    
    // Automatically update isRunning based on job status
    const hasRunningJobs = mergedJobs.some(job => 
      job.status === 'running' || job.status === 'pending'
    )
    return { jobs: mergedJobs, isRunning: hasRunningJobs }
  }),
  
  addJob: (job) => set((state) => {
    const currentJobs = Array.isArray(state.jobs) ? state.jobs : []
    // Check if job already exists (prevent duplicates)
    if (currentJobs.some(j => j.id === job.id)) {
      return state
    }
    const updatedJobs = [...currentJobs, job]
    // Recalculate isRunning based on all jobs
    const hasRunningJobs = updatedJobs.some(j => 
      j.status === 'running' || j.status === 'pending'
    )
    return {
      jobs: updatedJobs,
      isRunning: hasRunningJobs
    }
  }),
  
  updateJob: (jobId, updates) => set((state) => {
    const updatedJobs = (Array.isArray(state.jobs) ? state.jobs : []).map(job => 
      job.id === jobId ? { ...job, ...updates } : job
    )
    // Recalculate isRunning when job status changes
    const hasRunningJobs = updatedJobs.some(job => 
      job.status === 'running' || job.status === 'pending'
    )
    return {
      jobs: updatedJobs,
      isRunning: hasRunningJobs
    }
  }),
  
  setActiveJob: (jobId) => set({ activeJobId: jobId }),
  
  setIsRunning: (running) => set({ isRunning: running }),
  
  // Results Actions
  setResults: (jobId, results) => set((state) => ({
    results: { ...state.results, [jobId]: results }
  })),
  
  setActiveResults: (results) => set({ activeResults: results }),
  
  // Presets Actions
  setPresets: (presets) => set({ presets }),
  setSelectedPreset: (preset) => set({ selectedPreset: preset }),
  
  // Advanced Parameters Actions
  setAdvancedParameters: (params) => set({ advancedParameters: params }),
  updateAdvancedParameters: (params) => set((state) => ({
    advancedParameters: state.advancedParameters
      ? { ...state.advancedParameters, ...params }
      : null
  })),
  
  // Visualization Actions
  setActiveVisualization: (viz) => set({ activeVisualization: viz }),
  setShowMolecularOrbitals: (show) => set({ showMolecularOrbitals: show }),
  setShowESPMap: (show) => set({ showESPMap: show }),
  setOrbitalIsovalue: (value) => set({ orbitalIsovalue: value }),
  setESPIsovalue: (value) => set({ espIsovalue: value }),
  
  // Reset
  reset: () => set({
    jobs: [],
    activeJobId: null,
    isRunning: false,
    results: {},
    activeResults: null,
    advancedParameters: null,
    activeVisualization: null,
    showMolecularOrbitals: false,
    showESPMap: false,
    orbitalIsovalue: 0.02,
    espIsovalue: 0.01,
  }),
}))
