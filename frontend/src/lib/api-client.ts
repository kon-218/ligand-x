import axios from 'axios'
import type { MolecularStructure, ADMETRequest, ADMETResult, DockingConfig, DockingResult } from '@/types/molecular'
import type { MDResult, MDOptimizationConfig, TrajectoryFrame, TrajectoryInfo, MDAnalyticsData } from '@/types/md-types'
import type { StructureOption } from '@/components/Tools/shared/types'
import type { Boltz2PredictionParams, Boltz2AlignmentOptions, Boltz2Result, Boltz2MSAOptions } from '@/store/boltz2-store'
import type { UnifiedJob, ServiceType } from '@/types/unified-job-types'
import { normalizeToUnifiedJob } from '@/types/unified-job-types'
import type { DockingResults } from '@/types/docking'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds for most requests
})

/**
 * Notification handler type for dependency injection
 * This avoids circular dependencies and HMR issues with Next.js 15
 */
type NotifyFn = (type: 'error' | 'success' | 'warning' | 'info', message: string) => void

// Default no-op handler - will be replaced at app initialization
let notifyHandler: NotifyFn = () => { }

/**
 * Inject the notification handler at app initialization
 * Call this from a provider component after stores are ready
 */
export const injectNotificationHandler = (handler: NotifyFn) => {
  notifyHandler = handler
}

// Add response interceptor for global error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'An unexpected error occurred'

    if (error.response) {
      // Server responded with error status
      const data = error.response.data
      message = data.error || data.detail || data.message || `Request failed with status ${error.response.status}`
    } else if (error.request) {
      // Request made but no response
      message = 'No response received from server. Please check your connection.'
    } else {
      // Request setup error
      message = error.message
    }

    // Don't show notification for 404s on specific endpoints that might be polled
    if (error.response?.status === 404 && error.config.url?.includes('/status')) {
      return Promise.reject(error)
    }

    // Use the injected handler (no-op if not yet initialized)
    notifyHandler('error', message)
    return Promise.reject(error)
  }
)

export const api = {
  // Structure fetching and upload
  fetchPDB: async (pdbId: string): Promise<MolecularStructure> => {
    const response = await apiClient.post('/api/structure/fetch_pdb', { pdb_id: pdbId })
    return response.data
  },

  uploadStructure: async (file: File): Promise<MolecularStructure> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post('/api/structure/upload_structure', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  uploadSmiles: async (smiles: string, moleculeName?: string): Promise<MolecularStructure> => {
    const response = await apiClient.post('/api/structure/upload_smiles', {
      smiles,
      name: moleculeName || 'molecule',
    })
    return response.data
  },

  fetchLigandByHETID: async (hetId: string): Promise<MolecularStructure> => {
    const response = await apiClient.post('/api/structure/fetch_hetid', {
      het_id: hetId,
    })
    return response.data
  },

  extractLigandByHETID: async (pdbData: string, hetId: string, ligandName?: string): Promise<MolecularStructure> => {
    const response = await apiClient.post('/api/structure/extract_ligand_by_hetid', {
      pdb_data: pdbData,
      het_id: hetId,
      ligand_name: ligandName,
    })
    return response.data
  },

  cleanProteinStaged: async (
    pdbData: string,
    options: {
      remove_heterogens: boolean
      remove_water: boolean
      add_missing_residues: boolean
      add_missing_atoms: boolean
      add_missing_hydrogens: boolean
      ph: number
      add_solvation?: boolean
      solvation_box_size?: number
      solvation_box_shape?: string
      keep_ligands?: boolean
    }
  ): Promise<{ stages: Record<string, string>, stage_info: Record<string, any>, ligands?: Record<string, any> }> => {
    const response = await apiClient.post('/api/structure/clean_protein_staged', {
      pdb_data: pdbData,
      remove_heterogens: options.remove_heterogens,
      remove_water: options.remove_water,
      add_missing_residues: options.add_missing_residues,
      add_missing_atoms: options.add_missing_atoms,
      add_missing_hydrogens: options.add_missing_hydrogens,
      ph: options.ph,
      add_solvation: options.add_solvation || false,
      solvation_box_size: options.solvation_box_size || 10.0,
      solvation_box_shape: options.solvation_box_shape || 'cubic',
      keep_ligands: options.keep_ligands || false,
    }, {
      timeout: 120000, // 2 minutes for protein cleaning
    })
    return response.data
  },

  prepareDocking: async (
    proteinPdb: string,
    ligandData: string,
    ligandFormat: 'sdf' | 'pdb' = 'pdb',
    ligandResname?: string,
    gridPadding: number = 5.0,
    gridBox?: any  // Pre-calculated grid box from UI (if provided, skips recalculation)
  ): Promise<{ grid_box: any; receptor_pdbqt: string; ligand_pdbqt: string }> => {
    const payload: any = {
      protein_pdb: proteinPdb,
      ligand_data: ligandData,
      ligand_format: ligandFormat,
      ligand_resname: ligandResname,
      grid_padding: gridPadding,
    }

    // Include grid_box if provided
    if (gridBox) {
      payload.grid_box = gridBox
    }

    // Increase timeout for docking preparation (can be slow for large structures)
    const response = await apiClient.post('/api/docking/prepare_docking', payload, { timeout: 120000 })
    return response.data
  },

  calculateWholeProteinGridBox: async (
    proteinPdb: string
  ): Promise<{ grid_box: any }> => {
    const response = await apiClient.post('/api/docking/calculate_whole_protein_grid_box', {
      pdb_data: proteinPdb,
    })
    return response.data
  },

  validateRedocking: async (
    complexPdb: string,
    ligandResname?: string,
    exhaustiveness: number = 32
  ): Promise<{
    success: boolean
    passed?: boolean
    rmsd?: number
    best_affinity?: number
    scores?: any[]
    ligand_resname?: string
    grid_box?: any
    message?: string
    error?: string
    crystal_pdb?: string
    docked_pdb?: string
    protein_pdb?: string
  }> => {
    const response = await apiClient.post('/api/docking/validate_redocking', {
      complex_pdb: complexPdb,
      ligand_resname: ligandResname,
      exhaustiveness,
    }, {
      timeout: 600000, // 10 minutes for full redocking validation
    })
    return response.data
  },

  // Batch docking with multiple ligands - submit as a single 'docking_batch' job
  batchDockProteinLigands: async (
    config: any, // BatchDockingConfig
  ): Promise<{ success: boolean; job_id: string; stream_url: string; total_ligands: number }> => {
    try {
      console.log('[Batch Docking] Submitting batch docking job for', config.ligands.length, 'ligands')

      const requestData = {
        protein_pdb_data: config.protein_pdb,
        ligands: config.ligands.map((l: any) => ({
          id: l.id,
          name: l.name,
          data: l.data,
          format: l.format,
        })),
        box_center: [config.grid_box.center_x, config.grid_box.center_y, config.grid_box.center_z],
        box_size: [config.grid_box.size_x, config.grid_box.size_y, config.grid_box.size_z],
        exhaustiveness: config.docking_params.exhaustiveness || 8,
        is_batch: true,
        protein_id: config.protein_id,
      }

      const response = await apiClient.post('/api/jobs/submit/docking_batch', requestData)

      return {
        success: true,
        job_id: response.data.job_id,
        stream_url: response.data.stream_url,
        total_ligands: config.ligands.length
      }
    } catch (error) {
      console.error('[Batch Docking] Submission failed:', error)
      throw error
    }
  },

  listDockingJobs: async () => {
    const response = await apiClient.get('/api/docking/jobs')
    return response.data
  },

  getDockingJob: async (jobId: string) => {
    // Use unified PostgreSQL endpoint instead of service-specific endpoint
    return await api.getJobDetails(jobId)
  },

  // Docking with SSE streaming via Celery job submission
  dockProteinLigand: async (
    config: DockingConfig,
    onProgress?: (progress: number, status: string, jobId?: string) => void
  ): Promise<DockingResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        // First, prepare the docking (convert PDB to PDBQT and calculate grid box)
        console.log('[Docking] Preparing docking...')
        const prepareResponse = await api.prepareDocking(
          config.protein_pdb,
          config.ligand_data,
          config.ligand_format,
          config.ligand_resname,
          config.grid_padding,
          config.grid_box  // Pass pre-calculated grid box to avoid recalculation
        )

        // Transform prepared data into format expected by docking service
        // Use pre-calculated grid_box from config if provided, otherwise use the one from prepareDocking
        const gridBoxToUse = config.grid_box || prepareResponse.grid_box
        console.log('[Docking] Using grid_box:', config.grid_box ? 'from UI' : 'from prepareDocking', gridBoxToUse)

        const dockingJobData = {
          receptor_pdbqt: prepareResponse.receptor_pdbqt,
          ligand_pdbqt: prepareResponse.ligand_pdbqt,
          grid_box: gridBoxToUse,
          docking_params: config.docking_params,
          use_api: config.use_api || false,
          // Pass original ligand data for SDF bond preservation
          // Only needed for SDF/MOL formats where we use RDKit template
          // For PDB, we use Open Babel fallback which doesn't need the template
          original_ligand_data: ['sdf', 'mol'].includes((config.ligand_format || '').toLowerCase()) ? config.ligand_data : undefined,
          original_ligand_format: config.ligand_format,
          protein_id: config.protein_id,
          ligand_id: config.ligand_id,
        }

        console.log('[Docking] Submitting job to backend...')

        // Submit job via unified Celery API
        const submitResponse = await apiClient.post('/api/jobs/submit/docking', dockingJobData)
        const { job_id, stream_url } = submitResponse.data

        console.log('[Docking] Job submitted:', { job_id, stream_url })

        // Stream progress via SSE
        const eventSource = new EventSource(`${API_BASE_URL}${stream_url}`)
        let finalResult: any = null

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('[Docking SSE] Progress update:', data)

            // Report progress
            if (data.progress !== undefined) {
              onProgress?.(data.progress, data.status || data.message || '', job_id)
            }

            // Handle completion
            if (data.status === 'completed') {
              console.log('[Docking SSE] Job completed:', data.result)
              finalResult = data.result
              eventSource.close()

              if (finalResult && finalResult.success) {
                const scores = finalResult.scores || []
                const posesData = finalResult.poses_pdbqt || finalResult.log || ''

                const poses = scores.map((score: any, index: number) => ({
                  pose_id: `pose_${index + 1} `,
                  pdb_data: '',
                  affinity: typeof score === 'object' ? score.affinity : score,
                  rmsd_lb: typeof score === 'object' ? (score.rmsd_lb || 0) : 0,
                  rmsd_ub: typeof score === 'object' ? (score.rmsd_ub || 0) : 0,
                }))

                const result = {
                  poses,
                  log: posesData,
                  poses_sdf: finalResult.poses_sdf,  // SDF with preserved bond orders
                  best_affinity: finalResult.best_affinity || finalResult.best_score || 0,
                  binding_strength: finalResult.binding_strength,
                  analysis: finalResult.analysis,
                  job_id: job_id,
                }

                resolve(result)
              } else {
                reject(new Error(finalResult?.error || 'Docking failed'))
              }
            }

            // Handle failure
            if (data.status === 'failed') {
              console.error('[Docking SSE] Job failed:', data.error)
              eventSource.close()
              reject(new Error(data.error || 'Docking job failed'))
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e)
          }
        }

        eventSource.onerror = (error) => {
          console.error('[Docking SSE] Connection error:', error)
          eventSource.close()
          reject(new Error('Lost connection to docking job stream'))
        }
      } catch (error) {
        console.error('[Docking] Job submission failed:', error)
        reject(error)
      }
    })
  },

  // MD Optimization - Full workflow
  listMDJobs: async () => {
    const response = await apiClient.get('/api/md/jobs')
    return response.data
  },

  getMDJob: async (jobId: string) => {
    // Use unified PostgreSQL endpoint instead of service-specific endpoint
    return await api.getJobDetails(jobId)
  },

  optimizeMD: async (
    config: MDOptimizationConfig,
    onProgress?: (progress: number, status: string, completedStages?: string[]) => void
  ): Promise<MDResult> => {
    // Transform frontend config to backend format
    const backendConfig: any = {
      protein_pdb_data: config.protein_data,
      protein_id: config.protein_id || 'protein',
      protein_name: config.protein_name || config.protein_id || 'protein',
      ligand_id: config.ligand_name || 'ligand',
      ligand_name: config.ligand_name || 'ligand',
      molecule_name: config.ligand_name || 'ligand',
    }

    // Handle ligand input based on method
    if (config.ligand_input.method === 'none') {
      // protein-only mode: no ligand keys sent to backend
    } else if (config.ligand_input.method === 'smiles' && config.ligand_input.smiles) {
      backendConfig.ligand_smiles = config.ligand_input.smiles
      backendConfig.generate_conformer = config.ligand_input.generate_conformer ?? true
    } else if (config.ligand_input.file_data) {
      backendConfig.ligand_structure_data = config.ligand_input.file_data
      backendConfig.ligand_data_format = config.ligand_input.file_name?.endsWith('.sdf') ? 'sdf' : 'pdb'
      backendConfig.preserve_ligand_pose = config.ligand_input.preserve_pose ?? true
    } else if (config.ligand_input.ligand_id) {
      // If ligand_id is provided but no file_data, this is an error
      // The frontend should have converted ligand_id to file_data before calling this
      throw new Error('Ligand ID provided but no structure data available. Please select a ligand or provide structure data.')
    }

    // Add MD parameters
    if (config.parameters) {
      // Map frontend simulation_length to backend steps
      // With HMR 4fs timestep:
      //   short:  NVT 25k + NPT 175k (7 stages x 25k) ~ 5 min
      //   medium: NVT 25k + NPT 250k (7 stages x ~36k) + production 2.5M (10 ns) ~ 30 min
      //   long:   NVT 50k + NPT 500k (7 stages x ~71k) + production 6.25M (25 ns) ~ 60 min
      const lengthMap: Record<string, { nvt_steps: number; npt_steps: number; production_steps: number }> = {
        short: { nvt_steps: 25000, npt_steps: 175000, production_steps: 0 },
        medium: { nvt_steps: 25000, npt_steps: 250000, production_steps: 2500000 },
        long: { nvt_steps: 50000, npt_steps: 500000, production_steps: 6250000 },
        custom: {
          nvt_steps: config.parameters.nvt_steps || 25000,
          npt_steps: config.parameters.npt_steps || 250000,
          production_steps: config.parameters.production_steps || 0,
        },
      }
      const steps = lengthMap[config.parameters.simulation_length] || lengthMap.medium

      backendConfig.nvt_steps = steps.nvt_steps
      backendConfig.npt_steps = steps.npt_steps
      backendConfig.production_steps = steps.production_steps
      backendConfig.production_report_interval = config.parameters.production_report_interval || 2500
      backendConfig.temperature = config.parameters.temperature
      backendConfig.pressure = config.parameters.pressure
      backendConfig.ionic_strength = config.parameters.ionic_strength

      // Add force field and system configuration
      backendConfig.charge_method = config.parameters.charge_method || 'am1bcc'
      backendConfig.forcefield_method = config.parameters.forcefield_method || 'openff-2.2.0'
      backendConfig.box_shape = config.parameters.box_shape || 'dodecahedron'
      backendConfig.padding_nm = config.parameters.padding_nm || 1.0
    }

    if (config.preview_before_equilibration) {
      backendConfig.preview_before_equilibration = true
    }
    if (config.preview_acknowledged) {
      backendConfig.preview_acknowledged = true
    }
    if (config.pause_at_minimized) {
      backendConfig.pause_at_minimized = true
    }
    if (config.minimization_only) {
      backendConfig.minimization_only = true
    }
    if (config.minimized_acknowledged) {
      backendConfig.minimized_acknowledged = true
    }

    // Use Celery-based job submission with SSE streaming
    // This offloads the computation to a dedicated GPU worker
    console.log('[MD] Submitting job to Celery queue via /api/jobs/submit/md')

    return await new Promise((resolve, reject) => {
      // Submit job to Celery queue
      apiClient.post('/api/jobs/submit/md', backendConfig)
        .then(async (submitResponse) => {
          const { job_id, stream_url } = submitResponse.data
          console.log('[MD] Job submitted:', { job_id, stream_url })

          // Stream progress via SSE
          const eventSource = new EventSource(`${API_BASE_URL}${stream_url}`)
          let finalResult: MDResult | null = null

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              console.log('[MD SSE] Progress update:', data)

              // Report progress
              if (data.progress !== undefined) {
                onProgress?.(data.progress, data.stage || data.message || '', data.completed_stages)
              }

              // Handle completion
              if (data.status === 'completed') {
                console.log('[MD SSE] Job completed:', data.result)
                finalResult = data.result?.result || data.result
                if (finalResult) {
                  finalResult.success = true
                  finalResult.job_id = job_id
                }
                eventSource.close()
                resolve(finalResult as MDResult)
              }

              // Handle failure
              if (data.status === 'failed') {
                console.error('[MD SSE] Job failed:', data.error)
                eventSource.close()
                reject(new Error(data.error || 'MD optimization failed'))
              }

              // Handle cancellation
              if (data.status === 'cancelled') {
                eventSource.close()
                reject(new Error('Job was cancelled'))
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e)
            }
          }

          eventSource.onerror = (error) => {
            console.error('[MD SSE] Connection error:', error)
            eventSource.close()
            // Don't reject immediately - the job might still be running
            // Try to get the final status
            apiClient.get(`/api/jobs/status/${job_id}`)
              .then((statusResponse) => {
                const status = statusResponse.data
                if (status.status === 'completed' && status.result) {
                  resolve(status.result as MDResult)
                } else if (status.status === 'failed') {
                  reject(new Error(status.error || 'MD optimization failed'))
                } else {
                  reject(new Error('Lost connection to job stream'))
                }
              })
              .catch(() => {
                reject(new Error('Lost connection to job stream'))
              })
          }
        })
        .catch(async (error) => {
          // Fall back to direct streaming endpoint if Celery submission fails
          console.log('[MD] Celery submission failed, falling back to stream_optimize:', error.message)

          try {
            const streamEndpoint = `${API_BASE_URL}/api/md/stream_optimize`
            const response = await fetch(streamEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(backendConfig),
            })

            if (!response.ok || !response.body) {
              throw new Error('Streaming not available')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let finalResult: MDResult | null = null

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))
                    if (data.progress !== undefined) {
                      onProgress?.(data.progress, data.status || '', data.completed_stages)
                    }
                    if (data.output_files || ('success' in data && data.progress === 100)) {
                      finalResult = data
                    }
                  } catch (e) {
                    console.error('Failed to parse SSE data:', line, e)
                  }
                }
              }
            }

            if (finalResult) {
              if (!('success' in finalResult)) {
                (finalResult as any).success = (finalResult as any).status === 'success'
              }
              resolve(finalResult as MDResult)
            } else {
              reject(new Error('No result received from server'))
            }
          } catch (fallbackError) {
            reject(fallbackError)
          }
        })
    })
  },

  // Get trajectory frames as multi-model PDB
  getTrajectoryFrames: async (trajectoryPath: string, frameIndices?: number[]): Promise<{ pdb_data: string; num_frames: number }> => {
    const response = await apiClient.post('/api/md/trajectory/frames', {
      trajectory_path: trajectoryPath,
      frame_indices: frameIndices,
    }, {
      timeout: 300000, // 5 minutes for large trajectories (NPT can have 100+ frames)
    })
    return response.data
  },

  // Get trajectory as PDB file URL
  getTrajectoryPdbUrl: (trajectoryPath: string, maxFrames: number = 100): string => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return `${API_BASE_URL}/api/md/trajectory/pdb?trajectory_path=${encodeURIComponent(trajectoryPath)}&max_frames=${maxFrames}`
  },

  // Resume MD job from preview checkpoint
  resumeMDJob: async (jobId: string): Promise<{ job_id: string; status: string; message: string }> => {
    const response = await apiClient.post(`/api/jobs/resume/md/${jobId}`)
    return response.data
  },

  // Re-run post-hoc analytics for a completed job (backfill for older jobs)
  recomputeMDAnalytics: async (jobId: string): Promise<{ success: boolean; analytics: MDAnalyticsData }> => {
    const response = await apiClient.post(`/api/jobs/${jobId}/recompute-analytics`)
    return response.data
  },

  // Boltz-2 Prediction
  getBoltz2Status: async (): Promise<{ available: boolean; service: string; error?: string }> => {
    try {
      const response = await apiClient.get('/api/boltz2/status')
      return response.data
    } catch (error) {
      return {
        available: false,
        service: 'Boltz-2 Binding Affinity Prediction',
        error: 'Failed to check service status',
      }
    }
  },

  listBoltz2Jobs: async () => {
    // Use unified PostgreSQL endpoint instead of service-specific endpoint
    const response = await apiClient.get('/api/jobs/list', {
      params: { job_type: 'boltz2', limit: 100, offset: 0 }
    })
    return response.data
  },

  getBoltz2Job: async (jobId: string) => {
    // Use unified PostgreSQL endpoint instead of service-specific endpoint
    return await api.getJobDetails(jobId)
  },

  getBoltz2PosePAE: async (jobId: string, poseIndex: number) => {
    const response = await apiClient.get(`/api/boltz2/jobs/${jobId}/poses/${poseIndex}/pae`)
    return response.data
  },

  validateBoltz2Input: async (proteinData: string, ligandData: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const response = await apiClient.post('/api/boltz2/validate', {
        protein_pdb_data: proteinData,
        ligand_data: ligandData,
      })
      return response.data
    } catch (error: any) {
      return {
        valid: false,
        error: error.response?.data?.error || 'Validation failed',
      }
    }
  },

  predictBoltz2: async (
    proteinData: string,
    ligandData: string,
    predictionParams?: Boltz2PredictionParams,
    alignmentOptions?: Boltz2AlignmentOptions,
    msaOptions?: Boltz2MSAOptions,
    proteinId?: string,
    ligandId?: string
  ): Promise<Boltz2Result> => {
    try {
      // Use Celery-based job submission via unified jobs API
      console.log('[Boltz2] Submitting job to Celery queue via /api/jobs/submit/boltz2')

      const jobData: any = {
        protein_pdb_data: proteinData,
        ligand_data: ligandData,
        num_poses: predictionParams?.num_poses || 5,
        accelerator: predictionParams?.accelerator || 'gpu',
        msa_sequence_hash: msaOptions?.msaSequenceHash || null,
        alignment_options: alignmentOptions || null,
        protein_id: proteinId,
        ligand_id: ligandId,
      }

      const response = await apiClient.post('/api/jobs/submit/boltz2', jobData)

      // Return job submission response (cast to Boltz2Result)
      return {
        success: true,
        job_id: response.data.job_id,
        stream_url: response.data.stream_url,
        warnings: [],
      } as any
    } catch (error: any) {
      // Extract detailed error from response
      const responseData = error.response?.data
      const errorMsg = responseData?.error || responseData?.detail || error.message || 'Prediction failed'
      const suggestion = responseData?.details?.suggestion

      return {
        success: false,
        error: suggestion ? `${errorMsg} \n\nSuggestion: ${suggestion} ` : errorMsg,
        warnings: responseData?.warnings || [],
        details: responseData?.details,
      }
    }
  },

  // Batch Boltz2 Compound Screening - Now uses Celery queue
  batchPredictBoltz2: async (
    proteinData: string,
    ligands: Array<{ id: string; name: string; data: string; format: 'smiles' | 'sdf' | 'pdb' }>,
    predictionParams?: Boltz2PredictionParams,
    msaOptions?: { generateMsa?: boolean; msaMethod?: string; msaSequenceHash?: string | null },
    proteinId?: string,
    alignmentOptions?: Boltz2AlignmentOptions
  ): Promise<{
    success: boolean
    job_id: string
    stream_url: string
    total_ligands: number
    message?: string
    error?: string
  }> => {
    try {
      console.log(`[Boltz2 Batch] Submitting batch prediction for ${ligands.length} ligands`)

      const requestData = {
        protein_pdb_data: proteinData,
        ligands: ligands,
        prediction_params: predictionParams || {},
        accelerator: predictionParams?.accelerator || 'gpu',
        generate_msa: msaOptions?.generateMsa ?? true,
        msa_method: msaOptions?.msaMethod || null,
        msa_sequence_hash: msaOptions?.msaSequenceHash || null,
        protein_id: proteinId,
        alignment_options: alignmentOptions || null,
        is_batch: true,
      }

      // Use unified job submission endpoint
      const response = await apiClient.post('/api/jobs/submit/boltz2_batch', requestData)

      return {
        success: true,
        job_id: response.data.job_id,
        stream_url: response.data.stream_url,
        total_ligands: ligands.length,
        message: response.data.message
      }
    } catch (error: any) {
      console.error('[Boltz2 Batch] Prediction failed:', error)
      return {
        success: false,
        job_id: '',
        stream_url: '',
        total_ligands: ligands.length,
        error: error.response?.data?.detail || error.message || 'Batch prediction failed',
      }
    }
  },

  getMSADownloadUrl: (sequenceHash: string, method?: string): string => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const params = method ? `?method=${encodeURIComponent(method)}` : ''
    return `${API_BASE_URL}/api/msa/download/${sequenceHash}${params}`
  },

  // ADMET Prediction
  predictADMET: async (request: ADMETRequest): Promise<ADMETResult | ADMETBatchResult> => {
    const response = await apiClient.post('/api/admet/predict', request, {
      timeout: 300000, // 5 minutes for potential batch ADMET prediction
    })
    return response.data
  },

  // Get all stored ADMET results
  getADMETResults: async () => {
    const response = await apiClient.get('/api/admet/results')
    return response.data
  },

  // Get ADMET result by SMILES
  getADMETResultBySmiles: async (smiles: string) => {
    const encodedSmiles = encodeURIComponent(smiles)
    const response = await apiClient.get(`/api/admet/results/${encodedSmiles}`)
    return response.data
  },

  // Delete ADMET result
  deleteADMETResult: async (resultId: number) => {
    const response = await apiClient.delete(`/api/admet/results/${resultId}`)
    return response.data
  },

  getSmilesImageUrl: (smiles: string) => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return `${API_BASE_URL}/api/structure/render_smiles?smiles=${encodeURIComponent(smiles)}`
  },

  // Molecule library
  getMolecules: async () => {
    const response = await apiClient.get('/api/molecules')
    return response.data
  },

  saveMolecule: async (moleculeData: any) => {
    const response = await apiClient.post('/api/molecules', moleculeData)
    return response.data
  },

  extractLigandFromComplex: async (pdbData: string) => {
    const response = await apiClient.post('/api/molecules/extract_ligand', {
      pdb_data: pdbData,
    })
    return response.data
  },

  saveStructureToLibrary: async (pdbData: string, name: string) => {
    const response = await apiClient.post('/api/molecules/save_structure', {
      pdb_data: pdbData,
      name: name,
    })
    return response.data
  },

  deleteMolecule: async (moleculeId: string) => {
    const response = await apiClient.delete(`/api/molecules/${moleculeId}`)
    return response.data
  },

  updateMolecule: async (moleculeId: number, data: { name?: string; molfile?: string }) => {
    const response = await apiClient.put(`/api/molecules/${moleculeId}`, data)
    return response.data
  },

  // ABFE (Absolute Binding Free Energy) Calculations
  submitABFECalculation: async (config: {
    protein_pdb: string
    ligand_sdf: string
    ligand_id?: string
    protein_id?: string
    simulation_settings?: Record<string, any>
  }) => {
    // Use Celery-based job submission via unified jobs API
    console.log('[ABFE] Submitting job to Celery queue via /api/jobs/submit/abfe')

    const jobData: any = {
      protein_pdb_data: config.protein_pdb,
      ligand_sdf_data: config.ligand_sdf,
      ligand_id: config.ligand_id || 'ligand',
      protein_id: config.protein_id || 'protein',
      ligand_name: config.ligand_id || 'ligand',
    }

    if (config.simulation_settings) {
      jobData.protocol_settings = config.simulation_settings
    }

    const response = await apiClient.post('/api/jobs/submit/abfe', jobData)
    return response.data
  },

  getABFEStatus: async (jobId: string) => {
    // Use unified PostgreSQL endpoint instead of service-specific endpoint
    return await api.getJobDetails(jobId)
  },

  listABFEJobs: async () => {
    const response = await apiClient.get('/api/abfe/jobs')
    return response.data
  },

  parseABFEResults: async (jobId: string) => {
    const response = await apiClient.get(`/api/abfe/parse-results/${jobId}`)
    return response.data
  },

  // Get detailed ABFE analysis including overlap matrices, convergence, etc.
  getABFEDetailedAnalysis: async (jobId: string): Promise<{
    job_id: string
    legs: Array<{
      leg_name: string
      leg_type: 'complex' | 'solvent'
      status: string
      free_energy_kT?: number
      free_energy_kcal_mol?: number
      uncertainty_kcal_mol?: number
      overlap_matrix_path?: string
      replica_exchange_matrix_path?: string
      replica_state_timeseries_path?: string
      mbar_analysis?: {
        free_energy_in_kT: number
        standard_error_in_kT: number
        number_of_uncorrelated_samples: number
        n_equilibrium_iterations: number
        statistical_inefficiency: number
      }
      timing_data?: {
        iteration_seconds: number
        average_seconds_per_iteration: number
        estimated_time_remaining: string
        estimated_total_time: string
        ns_per_day: number
        percent_complete: number
      }
    }>
    convergence_data: {
      forward_reverse_available: boolean
      checkpoints: Array<{
        iteration: number
        percent_complete: number
        leg: string
        free_energy_kT: number
        standard_error_kT: number
        n_uncorrelated_samples: number
      }>
    } | null
    thermodynamic_cycle: {
      dg_complex: number
      dg_complex_error: number
      dg_solvent: number
      dg_solvent_error: number
      dg_restraint_correction?: number
      dg_binding: number
      dg_binding_error: number
    } | null
    output_files: {
      logs: Array<{
        filename: string
        path: string
        size_bytes: number
        leg: string
        file_type: string
        description?: string
      }>
      structures: Array<{
        filename: string
        path: string
        size_bytes: number
        leg: string
        file_type: string
        description?: string
      }>
      trajectories: Array<{
        filename: string
        path: string
        size_bytes: number
        leg: string
        file_type: string
        description?: string
      }>
      analysis_plots: Array<{
        filename: string
        path: string
        size_bytes: number
        leg: string
        file_type: string
        description?: string
      }>
    }
    error?: string
  }> => {
    const response = await apiClient.get(`/api/abfe/detailed-analysis/${jobId}`)
    return response.data
  },

  // Get URL for ABFE analysis file (for displaying images)
  getABFEAnalysisFileUrl: (jobId: string, legName: string, filename: string): string => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return `${API_BASE_URL}/api/abfe/file/${jobId}/${encodeURIComponent(legName)}/${encodeURIComponent(filename)}`
  },

  // Download combined ABFE log file
  downloadABFELog: async (jobId: string): Promise<Blob> => {
    const response = await apiClient.get(`/api/abfe/download-log/${jobId}`, {
      responseType: 'blob'
    })
    return response.data
  },

  getABFEFileUrl: (jobId: string, filename: string): string => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return `${API_BASE_URL}/api/abfe/files/${jobId}/${encodeURIComponent(filename)}`
  },

  getABFEDetails: async (jobId: string): Promise<{
    job_id: string
    status: string
    ligand_id?: string
    protein_id?: string
    created_at?: string
    updated_at?: string
    settings?: {
      protocol_repeats?: number
      temperature_K?: number
      pressure_bar?: number
      timestep_fs?: number
      nonbonded_cutoff_nm?: number
      compute_platform?: string
      small_molecule_forcefield?: string
      complex_lambda_windows?: number
      solvent_lambda_windows?: number
      solvent_padding_nm?: number
      production_iterations?: number
      equilibration_iterations?: number
    }
    leg_details?: Array<{
      name: string
      simtype: string
      repeat_id?: string
      unit_estimate?: number
      unit_estimate_error?: number
      standard_state_correction?: number
      production_iterations?: number
      equilibration_iterations?: number
      start_time?: string
      end_time?: string
    }>
    results_summary?: {
      leg_counts: Record<string, number>
      total_legs: number
      binding_free_energy_kcal_mol: number
      complex_mean?: number
      solvent_mean?: number
    }
    dg_results?: Array<{
      ligand: string
      dg_kcal_mol: number
      uncertainty_kcal_mol: number
    }>
    dg_raw?: Array<{
      leg: string
      ligand: string
      dg_kcal_mol: number
      uncertainty_kcal_mol: number
    }>
    error?: string
  }> => {
    const response = await apiClient.get(`/api/abfe/details/${jobId}`)
    return response.data
  },

  // Calculate pairwise similarity between two molecules
  calculateSimilarity: async (
    smiles1: string,
    smiles2: string,
    fingerprintType: string = 'morgan',
    metric: string = 'tanimoto'
  ): Promise<{
    success: boolean
    smiles1: string
    smiles2: string
    canonical_smiles1: string
    canonical_smiles2: string
    fingerprint_type: string
    metric: string
    similarity: number
    all_metrics: Record<string, number | null>
  }> => {
    const response = await apiClient.post('/api/similarity/calculate', {
      smiles1,
      smiles2,
      fingerprint_type: fingerprintType,
      metric,
    })
    return response.data
  },

  // ==========================================================================
  // RBFE (Relative Binding Free Energy) Calculations
  // ==========================================================================

  submitRBFECalculation: async (config: {
    protein_pdb: string
    ligands: Array<{
      id: string
      data: string
      format: 'sdf' | 'mol' | 'pdb'
      has_docked_pose?: boolean
      docking_affinity?: number
    }>
    protein_id?: string
    network_topology?: 'mst' | 'radial' | 'maximal'
    central_ligand?: string
    simulation_settings?: Record<string, any>
    pause_after_docking?: boolean
    docking_acknowledged?: boolean
  }) => {
    // Use Celery-based job submission via unified jobs API
    console.log('[RBFE] Submitting job to Celery queue via /api/jobs/submit/rbfe')

    const jobData: any = {
      protein_pdb_data: config.protein_pdb,
      ligands: config.ligands,
      protein_id: config.protein_id || 'protein',
      network_topology: config.network_topology || 'mst',
      central_ligand: config.central_ligand,
    }

    if (config.simulation_settings) {
      jobData.protocol_settings = config.simulation_settings
    }

    const response = await apiClient.post('/api/jobs/submit/rbfe', jobData)
    return response.data
  },

  getRBFEStatus: async (jobId: string) => {
    // Use unified PostgreSQL endpoint instead of service-specific endpoint
    return await api.getJobDetails(jobId)
  },

  getRBFEFileUrl: (jobId: string, filename: string): string => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return `${API_BASE_URL}/api/rbfe/files/${jobId}/${encodeURIComponent(filename)}`
  },

  // Continue RBFE calculation after docking validation
  // Uses the unified jobs resume endpoint to continue an existing job
  continueRBFEAfterDocking: async (jobId: string) => {
    console.log(`[RBFE] Resuming job ${jobId} via /api/jobs/resume/rbfe/${jobId}`)
    const response = await apiClient.post(`/api/jobs/resume/rbfe/${jobId}`)
    return response.data
  },

  listAllJobs: async (): Promise<{ jobs: UnifiedJob[] }> => {
    // Use unified PostgreSQL endpoint for all jobs
    const response = await apiClient.get('/api/jobs/list', {
      params: { limit: 100, offset: 0 }
    })

    // Normalize jobs from PostgreSQL format
    const allJobs: UnifiedJob[] = (response.data.jobs || []).map((j: any) =>
      normalizeToUnifiedJob(j, j.job_type as ServiceType)
    )

    // Sort by creation time (newest first)
    return {
      jobs: allJobs.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }
  },

  cancelJob: async (jobId: string, _service?: ServiceType) => {
    // Use unified jobs API for cancellation (PostgreSQL-backed)
    const response = await apiClient.post(`/api/jobs/${jobId}/cancel`)
    return response.data
  },

  deleteJob: async (jobId: string, _service?: ServiceType) => {
    // Use unified jobs API for deletion (PostgreSQL-backed)
    const response = await apiClient.delete(`/api/jobs/${jobId}`)
    return response.data
  },

  // ==========================================================================
  // Unified Jobs API (Celery-based async job management)
  // ==========================================================================

  /**
   * Submit a job to the Celery task queue
   * @param jobType - Type of job ('md', 'abfe', 'rbfe', 'docking', 'docking_batch', 'boltz2')
   * @param params - Job parameters
   * @returns Job submission response with job_id and stream_url
   */
  submitJob: async (jobType: string, params: Record<string, any>): Promise<{
    job_id: string
    status: string
    job_type: string
    stream_url: string
    message: string
  }> => {
    const response = await apiClient.post(`/api/jobs/submit/${jobType}`, params)
    return response.data
  },

  /**
   * Get full job details from PostgreSQL
   * @param jobId - Job identifier
   */
  getJobDetails: async (jobId: string): Promise<{
    id: string
    job_type: string
    status: string
    created_at: string
    started_at?: string
    completed_at?: string
    input_params: Record<string, any>
    result?: Record<string, any>
    error_message?: string
    progress: number
    stage?: string
    message?: string
    molecule_name?: string
  }> => {
    const response = await apiClient.get(`/api/jobs/${jobId}`)
    return response.data
  },

  /**
   * List jobs with optional filters
   */
  listUnifiedJobs: async (params?: {
    job_type?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<{
    jobs: Array<{
      id: string
      job_type: string
      status: string
      created_at: string
      started_at?: string
      completed_at?: string
      molecule_name?: string
      progress: number
      stage?: string
      error_message?: string
    }>
    total: number
    limit: number
    offset: number
  }> => {
    const response = await apiClient.get('/api/jobs/list', { params })
    return response.data
  },

  /**
   * Cancel a running job
   * @param jobId - Job identifier
   */
  cancelUnifiedJob: async (jobId: string): Promise<{
    job_id: string
    status: string
    message: string
  }> => {
    const response = await apiClient.post(`/api/jobs/${jobId}/cancel`)
    return response.data
  },

  /**
   * Delete a job record
   * @param jobId - Job identifier
   */
  deleteUnifiedJob: async (jobId: string): Promise<{
    job_id: string
    status: string
  }> => {
    const response = await apiClient.delete(`/api/jobs/${jobId}`)
    return response.data
  },

  /**
   * Stream job progress via SSE
   * @param jobId - Job identifier
   * @param onProgress - Progress callback
   * @param onComplete - Completion callback
   * @param onError - Error callback
   * @returns EventSource instance (call .close() to stop streaming)
   */
  streamJobProgress: (
    jobId: string,
    onProgress: (data: { status: string; progress: number; stage?: string; message?: string }) => void,
    onComplete: (result: any) => void,
    onError: (error: string) => void
  ): EventSource => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/jobs/stream/${jobId}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.status === 'completed') {
          onComplete(data.result)
          eventSource.close()
        } else if (data.status === 'failed') {
          onError(data.error || 'Job failed')
          eventSource.close()
        } else if (data.status === 'cancelled') {
          onError('Job was cancelled')
          eventSource.close()
        } else {
          onProgress(data)
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', e)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      onError('Connection to job stream lost')
      eventSource.close()
    }

    return eventSource
  },

  getServicesHealth: async (): Promise<Record<string, boolean> | null> => {
    try {
      const response = await apiClient.get('/api/services/health')
      return response.data.services ?? {}
    } catch {
      return null  // null signals a failed check (transient error), not "all services down"
    }
  },

  enumerateTautomers: async (smiles: string, maxTautomers = 20) =>
    (await apiClient.post('/api/structure/enumerate-tautomers', { smiles, max_tautomers: maxTautomers })).data,

  findPockets: async (pdbData: string, topN = 5) =>
    (await apiClient.post('/api/structure/find-pockets', { pdb_data: pdbData, top_n: topN }, { timeout: 90000 })).data,

  getTrajectoryAnalysis: async (trajectoryPath: string) =>
    (await apiClient.post('/api/md/trajectory/analysis', { trajectory_path: trajectoryPath }, { timeout: 120000 })).data,
}
