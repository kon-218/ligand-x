/**
 * Unified Job Types for cross-service results management
 * 
 * These types provide a common interface for jobs across all computational services:
 * - Docking
 * - MD (Molecular Dynamics)
 * - Boltz2 (Structure Prediction)
 * - ABFE (Absolute Binding Free Energy)
 * - RBFE (Relative Binding Free Energy)
 */

/**
 * All supported computational services
 */
export type ServiceType = 'docking' | 'md' | 'boltz2' | 'abfe' | 'rbfe' | 'qc'

/**
 * Service display configuration
 */
export interface ServiceConfig {
    id: ServiceType
    name: string
    color: string  // Accent color class prefix (e.g., 'green', 'blue', 'purple')
    icon: string   // Icon name for the service
}

export const SERVICE_CONFIGS: Record<ServiceType, ServiceConfig> = {
    docking: { id: 'docking', name: 'Docking', color: 'indigo', icon: 'target' },
    md: { id: 'md', name: 'MD Optimization', color: 'green', icon: 'activity' },
    boltz2: { id: 'boltz2', name: 'Boltz-2', color: 'purple', icon: 'brain' },
    abfe: { id: 'abfe', name: 'ABFE', color: 'blue', icon: 'flask' },
    rbfe: { id: 'rbfe', name: 'RBFE', color: 'cyan', icon: 'git-branch' },
    qc: { id: 'qc', name: 'Quantum Chemistry', color: 'blue', icon: 'zap' },
}

/**
 * Unified job status across all services
 */
export type JobStatus =
    | 'submitted'      // Job submitted, waiting to start
    | 'preparing'      // Setting up the calculation
    | 'running'        // Actively computing
    | 'completed'      // Successfully completed
    | 'failed'         // Failed with error
    | 'paused'         // Paused (MD preview/minimization checkpoints)
    | 'docking_ready'  // RBFE: waiting for user to approve docking poses

/**
 * Status categories for filtering
 */
export const isRunningStatus = (status: JobStatus): boolean => {
    return ['submitted', 'preparing', 'running'].includes(status)
}

export const isCompletedStatus = (status: JobStatus): boolean => {
    return ['completed'].includes(status)
}

export const isTerminalStatus = (status: JobStatus): boolean => {
    return ['completed', 'failed'].includes(status)
}

/**
 * Job metadata that varies by service
 * Each service can include relevant identifiers
 */
export interface JobMetadata {
    // Common fields
    protein_id?: string
    ligand_id?: string
    is_batch?: boolean  // True for batch jobs (docking, boltz2)
    batch_total?: number  // Total items in batch
    batch_completed?: number  // Completed items in batch

    // Docking
    grid_box?: any
    num_poses?: number
    best_affinity?: number

    // MD
    simulation_length?: string
    temperature?: number
    nvt_steps?: number
    npt_steps?: number
    production_steps?: number
    md_job_type?: string  // minimization, equilibration, full
    minimization_only?: boolean
    pause_at_minimized?: boolean

    // ABFE/RBFE
    num_ligands?: number
    network_topology?: string
    binding_free_energy?: number

    // Boltz2
    num_poses_generated?: number
    affinity_pred_value?: number
    best_binder_affinity?: number  // Best affinity from batch results

    // QC
    method?: string
    basis_set?: string
    qc_job_type?: string      // standard, ir, fukui, conformer
    orca_task_type?: string   // SP, OPT, OPT_FREQ, FREQ, OPTTS
}

/**
 * Unified job representation across all services
 */
export interface UnifiedJob {
    job_id: string
    service: ServiceType
    status: JobStatus
    created_at: string
    updated_at?: string

    // Progress (for running jobs)
    progress?: number
    message?: string

    // Error (for failed jobs)
    error?: string

    // Service-specific metadata for display
    metadata: JobMetadata
}

/**
 * Result of a unified job query
 */
export interface UnifiedJobResult {
    job_id: string
    service: ServiceType
    success: boolean
    status: string
    results?: any  // Service-specific results object
    output_files?: Record<string, string>
    error?: string
}

/**
 * Get QC job type label for display
 */
export function getQCJobTypeLabel(qcJobType?: string): string {
    const labelMap: Record<string, string> = {
        'standard': 'Standard',
        'ir': 'IR Spectrum',
        'fukui': 'Fukui',
        'conformer': 'Conformer',
    }
    return labelMap[qcJobType || 'standard'] || 'QC'
}

/**
 * Get MD job type label for display
 */
export function getMDJobTypeLabel(minimizationOnly?: boolean, pauseAtMinimized?: boolean): string {
    if (minimizationOnly) {
        return 'Minimization'
    } else if (pauseAtMinimized) {
        return 'Minimization'
    } else {
        return 'Equilibration'
    }
}

/**
 * Get a display summary for a job (single line format)
 * Example: "4RT7 • benzene • MST topology"
 */
export function getJobDisplaySummary(job: UnifiedJob): string {
    const parts: string[] = []
    const meta = job.metadata

    // Add protein ID if available
    if (meta.protein_id) {
        // Extract short PDB ID if full path/name
        const proteinShort = extractShortId(meta.protein_id)
        parts.push(proteinShort)
    }

    // Add ligand info
    if (meta.ligand_id) {
        const ligandShort = extractShortId(meta.ligand_id)
        parts.push(ligandShort)
    } else if (meta.num_ligands) {
        parts.push(`${meta.num_ligands} ligands`)
    }

    // Add service-specific details
    switch (job.service) {
        case 'docking':
            if (meta.best_affinity !== undefined) {
                parts.push(`${meta.best_affinity.toFixed(1)} kcal/mol`)
            }
            break;
        case 'md':
            if (meta.simulation_length) {
                parts.push(meta.simulation_length)
            }
            break
        case 'rbfe':
            if (meta.network_topology) {
                parts.push(meta.network_topology.toUpperCase())
            }
            break
        case 'abfe':
            if (meta.binding_free_energy !== undefined) {
                parts.push(`ΔG: ${meta.binding_free_energy.toFixed(1)} kcal/mol`)
            }
            break
        case 'boltz2':
            if (meta.is_batch) {
                if (meta.best_binder_affinity !== undefined) {
                    parts.push(`best: ${meta.best_binder_affinity.toFixed(2)}`)
                }
            } else if (meta.num_poses_generated) {
                parts.push(`${meta.num_poses_generated} poses`)
            }
            break;
        case 'qc':
            if (meta.method) {
                parts.push(`${meta.method}${meta.basis_set ? `/${meta.basis_set}` : ''}`)
            }
            break
    }

    return parts.join(' • ') || 'Calculation'
}

/**
 * Extract a short, readable ID from a potentially long identifier
 */
function extractShortId(id: string): string {
    if (!id) return ''

    // Check if it's a PDB ID (4 alphanumeric chars)
    const pdbMatch = /^([A-Za-z0-9]{4})(?:_|$)/.exec(id)
    if (pdbMatch) return pdbMatch[1].toUpperCase()

    // Extract from library_ prefix
    if (id.startsWith('library_')) {
        const name = id.replace('library_', '')
        return name.length > 12 ? name.slice(0, 10) + '...' : name
    }

    // Truncate long names
    if (id.length > 15) {
        return id.slice(0, 12) + '...'
    }

    return id
}

/**
 * Normalize a service-specific job to UnifiedJob format
 * Handles both legacy service-specific formats and PostgreSQL unified format
 */
export function normalizeToUnifiedJob(
    job: any,
    service: ServiceType
): UnifiedJob {
    // Handle PostgreSQL unified format (has 'id' and 'job_type' fields)
    const isPostgresFormat = job.job_type !== undefined

    // Extract input_params for PostgreSQL format
    const inputParams = job.input_params || {}
    const result = job.result || {}

    // Normalize job_type to ServiceType (handle batch variants)
    const normalizeJobType = (jobType: string): ServiceType => {
        const typeMap: Record<string, ServiceType> = {
            'boltz2_batch': 'boltz2',
            'docking_batch': 'docking',
            'docking': 'docking',
            'md': 'md',
            'boltz2': 'boltz2',
            'abfe': 'abfe',
            'rbfe': 'rbfe',
            'qc': 'qc',
        }
        return typeMap[jobType] || jobType as ServiceType
    }

    // Determine status with priority for docking_ready/paused states
    let status = normalizeStatus(job.status)
    const stage = (job.stage || job.message || '').toLowerCase()

    // Check for docking_ready in stage or result
    if (stage === 'docking_ready' ||
        result.status === 'docking_ready' ||
        job.result?.status === 'docking_ready') {
        status = 'docking_ready'
    }

    const baseJob: UnifiedJob = {
        job_id: job.job_id || job.id || '',
        service: isPostgresFormat ? normalizeJobType(job.job_type) : service,
        status: status,
        created_at: job.created_at || new Date().toISOString(),
        updated_at: job.updated_at || job.completed_at,
        progress: job.progress,
        message: job.message || job.stage,
        error: job.error || job.error_message,
        metadata: {},
    }

    // Determine effective service type
    const effectiveService = baseJob.service

    // Extract service-specific metadata
    // Support both direct job fields and PostgreSQL input_params/result format
    switch (effectiveService) {
        case 'docking':
            // Check if this is a batch docking job
            const isDockingBatch = inputParams.ligands?.length > 0 || inputParams.is_batch || result.batch_id
            baseJob.metadata = {
                protein_id: job.protein_id || inputParams.protein_id || job.metadata?.protein_id,
                ligand_id: isDockingBatch ? undefined : (job.ligand_id || inputParams.ligand_id || job.molecule_name || job.metadata?.ligand_id),
                num_poses: job.num_poses || job.results?.num_poses || result.num_poses,
                best_affinity: job.best_affinity || job.results?.best_affinity || result.best_affinity,
                is_batch: isDockingBatch,
                batch_total: isDockingBatch ? (inputParams.ligands?.length || result.total_ligands) : undefined,
                batch_completed: isDockingBatch ? result.completed : undefined,
                num_ligands: isDockingBatch ? (inputParams.ligands?.length || result.total_ligands) : undefined,
            }
            break

        case 'md':
            const proteinId = job.protein_id || inputParams.protein_id || job.request?.protein_name
            baseJob.metadata = {
                protein_id: proteinId === 'current' ? (job.protein_name || job.request?.protein_name || 'current') : proteinId,
                ligand_id: job.ligand_id || inputParams.ligand_id || job.molecule_name || job.request?.ligand_name,
                simulation_length: job.request?.simulation_length || inputParams.simulation_length,
                temperature: job.request?.temperature || inputParams.temperature,
                nvt_steps: job.request?.nvt_steps || inputParams.nvt_steps,
                npt_steps: job.request?.npt_steps || inputParams.npt_steps,
                production_steps: job.request?.production_steps || inputParams.production_steps,
                minimization_only: job.minimization_only || inputParams.minimization_only,
                pause_at_minimized: job.pause_at_minimized || inputParams.pause_at_minimized,
            }
            break

        case 'boltz2':
            // Check if this is a batch job
            const isBatch = inputParams.ligands?.length > 0 || result.batch_id || job.is_batch
            baseJob.metadata = {
                protein_id: job.protein_id || inputParams.protein_id || job.metadata?.protein_id,
                ligand_id: isBatch ? undefined : (job.ligand_id || inputParams.ligand_id || job.molecule_name || job.metadata?.ligand_id),
                num_poses_generated: job.results?.num_poses_generated || job.results?.poses?.length || result.num_poses,
                affinity_pred_value: job.results?.affinity_pred_value || result.affinity_pred_value,
                is_batch: isBatch,
                batch_total: inputParams.ligands?.length || result.total_ligands,
                batch_completed: result.completed,
                best_binder_affinity: result.best_affinity,
                num_ligands: isBatch ? (inputParams.ligands?.length || result.total_ligands) : undefined,
            }
            break

        case 'abfe':
            baseJob.metadata = {
                protein_id: job.protein_id || job.results?.protein_id || inputParams.protein_id,
                ligand_id: job.ligand_id || job.results?.ligand_id || inputParams.ligand_id || inputParams.ligand_name || job.molecule_name,
                binding_free_energy: job.results?.binding_free_energy_kcal_mol || result.binding_free_energy_kcal_mol,
            }
            break

        case 'rbfe':
            baseJob.metadata = {
                protein_id: job.protein_id || inputParams.protein_id,
                num_ligands: job.num_ligands || inputParams.ligands?.length,
                network_topology: job.network_topology || inputParams.network_topology,
            }
            break

        case 'qc':
            baseJob.metadata = {
                ligand_id: job.molecule_id || inputParams.molecule_id || job.molecule_name,
                method: job.method || inputParams.method,
                basis_set: job.basis_set || inputParams.basis_set,
                qc_job_type: job.qc_job_type || inputParams.qc_job_type || 'standard',
                orca_task_type: job.orca_task_type || inputParams.job_type || '',
            }
            break
    }

    return baseJob
}

/**
 * Normalize status strings from different services to JobStatus
 */
function normalizeStatus(status: string | undefined): JobStatus {
    const statusLower = (status || 'submitted').toLowerCase()

    // Map various status strings to unified statuses
    const statusMap: Record<string, JobStatus> = {
        'submitted': 'submitted',
        'preparing': 'preparing',
        'started': 'running',
        'running': 'running',
        'in_progress': 'running',
        'processing': 'running',
        'docking': 'running',
        'resuming': 'running',
        'completed': 'completed',
        'success': 'completed',
        'successful': 'completed',
        'finished': 'completed',
        'done': 'completed',
        'failed': 'failed',
        'error': 'failed',
        'failure': 'failed',
        'paused': 'paused',
        'preview_ready': 'paused',
        'minimized_ready': 'paused',
        'docking_ready': 'docking_ready',
    }

    return statusMap[statusLower] || 'submitted'
}
