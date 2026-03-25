import { QCJob, QCResults, QCPreset } from '@/store/qc-store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ModeClassification {
  type: 'stretch' | 'bend' | 'torsion' | 'translation/rotation'
  primary_label: string
  atom_indices: number[]
  atom_labels: string[]
  contributions: { stretch: number; bend: number; torsion: number }
  participation: number[]
  top_bonds: { atoms: number[]; labels: string[]; delta_r_mA: number }[]
  top_angles: { atoms: number[]; labels: string[]; delta_theta_deg: number }[]
  top_dihedrals: { atoms: number[]; labels: string[]; delta_phi_deg: number }[]
}

export interface SubmitJobRequest {
  molecule_xyz: string // XYZ format coordinates
  molecule_name?: string // Name of the molecule for display
  charge?: number
  multiplicity?: number
  method?: string
  basis_set?: string
  keywords?: string[]
  job_type?: 'SP' | 'OPT' | 'FREQ' | 'OPT_FREQ' | 'OPTTS' | 'single_point' | 'optimization' | 'frequency' | 'full_workflow'
  compute_frequencies?: boolean
  preset?: string
  calculate_properties?: boolean
  n_procs?: number
  memory_mb?: number
  solvation?: string
  extra_keywords?: string
  // New advanced parameters
  dispersion?: 'none' | 'D3BJ' | 'D4'
  use_rijcosx?: boolean
  scf_convergence?: 'Normal' | 'Tight' | 'VeryTight'
  convergence_strategy?: 'DIIS' | 'KDIIS' | 'SOSCF'
  use_slow_conv?: boolean
  integration_grid?: 'DefGrid2' | 'DefGrid3' | 'GridX'
  broken_symmetry_atoms?: string
  temperature?: number
  pressure?: number
  properties?: {
    dipole?: boolean
    quadrupole?: boolean
    chelpg?: boolean
    mulliken?: boolean
    bond_orders?: boolean
    nbo?: boolean
    nmr?: boolean
    td_dft?: boolean
    td_dft_roots?: number
    orbitals?: boolean
  }
  input_file_content?: string // Optional: full input file content to bypass generation
  // Coupled cluster specific parameters
  cc_max_iter?: number
  cc_use_qros?: boolean
  cc_density?: 'none' | 'linearized' | 'unrelaxed' | 'orbopt'
  cc_max_diis?: number
  cc_level_shift?: number
}

export interface JobStatusResponse {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress?: number
  message?: string
  error?: string
}

export interface JobResultsResponse {
  job_id: string
  status: string
  results?: QCResults
  error?: string
}

export interface QCJobFilesResponse {
  job_id: string
  files: string[]
  error?: string
}

class QCService {
  /**
   * Get available QC calculation presets
   */
  async getPresets(): Promise<QCPreset[]> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/presets`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch QC presets:', error)
      throw error
    }
  }

  /**
   * Submit a new quantum chemistry job
   */
  async submitJob(request: SubmitJobRequest): Promise<{ job_id: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to submit QC job:', error)
      throw error
    }
  }

  /**
   * Get status of a specific job
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/status/${jobId}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch job status:', error)
      throw error
    }
  }

  /**
   * Get results of a completed job
   */
  async getJobResults(jobId: string): Promise<JobResultsResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/results/${jobId}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch job results:', error)
      throw error
    }
  }

  /**
   * Get list of all jobs
   */
  async getJobs(): Promise<QCJob[]> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()

      // Handle both array response and wrapped {jobs: [...]} format
      const jobs = Array.isArray(data) ? data : (data.jobs || [])

      // Normalize job objects to match QCJob interface
      return jobs.map((job: any) => ({
        id: job.id || job.job_id || '',
        molecule_id: job.molecule_id || 'unknown',
        status: (job.status || 'pending').toLowerCase() as QCJob['status'],
        job_type: job.job_type || 'standard',  // For frontend filtering
        method: job.method || 'Unknown',
        basis_set: job.basis_set || 'Unknown',
        created_at: job.created_at || job.timestamp_start || new Date().toISOString(),
        updated_at: job.updated_at || job.timestamp_end || job.created_at || new Date().toISOString(),
        progress: job.progress,
        error_message: job.error
      }))
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
      throw error
    }
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/${jobId}/cancel`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to cancel job:', error)
      throw error
    }
  }

  /**
   * Poll job status until completion
   */
  async pollJobUntilComplete(
    jobId: string,
    onProgress?: (status: JobStatusResponse) => void,
    pollInterval = 2000
  ): Promise<JobResultsResponse> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getJobStatus(jobId)

          if (onProgress) {
            onProgress(status)
          }

          if (status.status === 'completed') {
            const results = await this.getJobResults(jobId)
            resolve(results)
          } else if (status.status === 'failed') {
            reject(new Error(status.error || 'Job failed'))
          } else {
            // Continue polling
            setTimeout(poll, pollInterval)
          }
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }

  /**
   * Get IR spectrum data file
   */
  async getIRSpectrum(jobId: string): Promise<{ frequencies: number[], intensities: number[] }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/files/${jobId}/ir.dat`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const text = await response.text()
      const lines = text.split('\n').filter(line => line.trim())

      const frequencies: number[] = []
      const intensities: number[] = []

      for (const line of lines) {
        const [freq, intensity] = line.trim().split(/\s+/).map(Number)
        if (!isNaN(freq) && !isNaN(intensity)) {
          frequencies.push(freq)
          intensities.push(intensity)
        }
      }

      return { frequencies, intensities }
    } catch (error) {
      console.error('Failed to fetch IR spectrum:', error)
      throw error
    }
  }

  /**
   * Get cube file URL for visualization
   */
  getCubeFileUrl(jobId: string, cubeType: 'homo' | 'lumo' | 'density' | 'esp'): string {
    return `${API_BASE}/api/qc/jobs/files/${jobId}/${cubeType}.cube`
  }

  /**
   * Get optimized structure file URL
   */
  getStructureUrl(jobId: string): string {
    return `${API_BASE}/api/qc/jobs/files/${jobId}/structure.xyz`
  }

  /**
   * Get list of files for a job
   */
  async getJobFiles(jobId: string): Promise<QCJobFilesResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/files/${jobId}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch job files:', error)
      throw error
    }
  }

  /**
   * Get ORCA output log file
   */
  async getLogFile(jobId: string): Promise<string> {
    return this.getJobFileContent(jobId, 'orca.out')
  }

  /**
   * Get content of a specific job file
   */
  async getJobFileContent(jobId: string, filename: string): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/files/${jobId}/${filename}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      console.error(`Failed to fetch file ${filename}:`, error)
      throw error
    }
  }

  /**
   * Get molecular orbital data for visualization
   */
  async getMOData(jobId: string): Promise<any> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/mo-data/${jobId}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data.mo_data
    } catch (error) {
      console.error('Failed to fetch MO data:', error)
      throw error
    }
  }

  /**
   * Get normal mode data including frequencies, intensities, and displacement vectors
   */
  async getNormalModes(jobId: string): Promise<{
    job_id: string
    normal_modes: {
      frequencies: number[]
      intensities: number[]
      displacements?: number[][][]
      equilibrium_geometry?: number[][]
      atom_symbols?: string[]
      classifications?: ModeClassification[] | null
    }
  }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/normal-modes/${jobId}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch normal modes:', error)
      throw error
    }
  }

  /**
   * Get trajectory data for a specific normal mode
   */
  async getModeTrajectory(
    jobId: string,
    modeIndex: number,
    numFrames: number = 60,
    amplitude: number = 0.5
  ): Promise<{
    job_id: string
    mode_index: number
    frequency: number
    num_frames: number
    pdb_data: string
  }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/mode-trajectory/${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode_index: modeIndex,
          num_frames: numFrames,
          amplitude: amplitude
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to fetch mode trajectory:', error)
      throw error
    }
  }

  /**
   * Submit job with current molecule from molecular store
   */
  async submitJobForCurrentMolecule(
    moleculeData: string,
    preset: QCPreset
  ): Promise<{ job_id: string }> {
    const request: SubmitJobRequest = {
      molecule_xyz: moleculeData,
      charge: 0,
      multiplicity: 1,
      preset: preset.id,
      method: preset.method,
      basis_set: preset.basis_set,
      keywords: preset.keywords,
      job_type: 'full_workflow',
      calculate_properties: true
    }

    return this.submitJob(request)
  }
  /**
   * Preview job input file
   */
  async previewJob(request: SubmitJobRequest): Promise<{ input_file_content: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        // Handle both FastAPI 'detail' and custom 'error' fields
        throw new Error(errorData.detail || errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to preview QC job:', error)
      throw error
    }
  }

  /**
   * Submit IR Spectrum calculation (frequency calculation)
   */
  async submitIRJob(request: {
    molecule_xyz: string
    molecule_name?: string
    method?: string
    basis_set?: string
    charge?: number
    multiplicity?: number
    n_procs?: number
    memory_mb?: number
  }): Promise<{ job_id: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/ir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to submit IR job:', error)
      throw error
    }
  }

  /**
   * Submit Fukui Indices calculation
   */
  async submitFukuiJob(request: {
    molecule_xyz: string
    molecule_name?: string
    method?: string
    basis_set?: string
    dispersion?: string
    n_procs?: number
    memory_mb?: number
  }): Promise<{ job_id: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/fukui`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to submit Fukui job:', error)
      throw error
    }
  }

  /**
   * Submit Conformer Search
   */
  async submitConformerJob(request: {
    smiles?: string
    molecule_xyz?: string
    molecule_name?: string
    n_confs?: number
    rms_thresh?: number
    energy_window?: number
    method?: string
    n_procs?: number
  }): Promise<{ job_id: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/conformer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to submit Conformer job:', error)
      throw error
    }
  }

  /**
   * Submit Bond Dissociation Energy (BDE) calculation
   */
  async submitBDEJob(request: {
    molecule_xyz: string
    molecule_name?: string
    mode?: 'reckless' | 'rapid' | 'careful' | 'meticulous'
    charge?: number
    n_procs?: number
    memory_mb?: number
  }): Promise<{ job_id: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/qc/jobs/bde`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to submit BDE job:', error)
      throw error
    }
  }
}

export const qcService = new QCService()
