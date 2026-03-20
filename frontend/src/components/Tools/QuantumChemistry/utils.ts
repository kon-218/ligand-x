// Utility functions for Quantum Chemistry workflow

import type { QCJob } from '@/types/qc'

/**
 * Normalize job status to standard values
 */
export function normalizeStatus(status?: string | null): QCJob['status'] {
    const value = typeof status === 'string' ? status.toLowerCase() : ''

    const completedSet = new Set(['completed', 'success', 'successful', 'finished', 'done'])
    const failedSet = new Set(['failed', 'error', 'failure', 'revoked'])
    const runningSet = new Set(['running', 'in_progress', 'processing', 'started'])

    if (completedSet.has(value)) return 'completed'
    if (failedSet.has(value)) return 'failed'
    if (runningSet.has(value)) return 'running'
    if (value === 'pending' || value === 'queued') return 'pending'

    return value ? (value as QCJob['status']) : 'pending'
}

/**
 * Check if status is completed
 */
export function isCompletedStatus(status?: string | null): boolean {
    const completedSet = new Set(['completed', 'success', 'successful', 'finished', 'done'])
    return completedSet.has((status || '').toLowerCase())
}

/**
 * Filter jobs by subtab and job type
 */
export function filterJobs(
    jobs: QCJob[],
    subtab: 'recent' | 'completed',
    jobTypeFilter: 'all' | 'standard' | 'ir' | 'fukui' | 'conformer'
): QCJob[] {
    if (!Array.isArray(jobs)) return []

    // Filter by completion status
    let filtered = subtab === 'recent'
        ? jobs.filter((job) => !isCompletedStatus(job.status)) // Recent: exclude completed
        : jobs.filter((job) => isCompletedStatus(job.status))  // Completed: only completed

    // Apply job type filter
    if (jobTypeFilter !== 'all') {
        filtered = filtered.filter((job) => job.job_type === jobTypeFilter)
    }

    // Sort by most recent first (using updated_at timestamp)
    return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

/**
 * Get job type badge configuration
 */
export function getJobTypeBadge(job: QCJob): { label: string; className: string } {
    switch (job.job_type) {
        case 'ir':
            return { label: 'IR Spectrum', className: 'bg-purple-600/30 text-purple-300' }
        case 'fukui':
            return { label: 'Fukui', className: 'bg-amber-600/30 text-amber-300' }
        case 'conformer':
            return { label: 'Conformer', className: 'bg-emerald-600/30 text-emerald-300' }
        case 'bde':
            return { label: 'BDE', className: 'bg-sky-600/30 text-sky-300' }
        case 'standard':
            return { label: 'Single Point', className: 'bg-blue-600/30 text-blue-300' }
        default:
            // Infer type from method for legacy jobs
            if (job.method === 'Fukui') return { label: 'Fukui', className: 'bg-amber-600/30 text-amber-300' }
            if (job.method === 'Conformer') return { label: 'Conformer', className: 'bg-emerald-600/30 text-emerald-300' }
            return { label: 'QC', className: 'bg-gray-600/30 text-gray-300' }
    }
}
