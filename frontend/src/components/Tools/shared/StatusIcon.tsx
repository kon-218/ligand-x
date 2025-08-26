'use client'

import { CheckCircle, XCircle, RefreshCw, Clock, Pause, Beaker } from 'lucide-react'
import type { JobStatus } from '@/types/unified-job-types'

interface StatusIconProps {
    status: JobStatus | string
    className?: string
    size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
}

/**
 * Unified status icon component used across all services
 * Provides consistent visual status indicators
 */
export function StatusIcon({ status, className = '', size = 'md' }: StatusIconProps) {
    const sizeClass = sizeClasses[size]

    switch (status) {
        case 'completed':
        case 'success':
        case 'successful':
        case 'finished':
        case 'done':
            return <CheckCircle className={`${sizeClass} text-green-400 ${className}`} />

        case 'failed':
        case 'error':
        case 'failure':
            return <XCircle className={`${sizeClass} text-red-400 ${className}`} />

        case 'running':
        case 'in_progress':
        case 'processing':
        case 'docking':
        case 'resuming':
            return <RefreshCw className={`${sizeClass} text-blue-400 animate-spin ${className}`} />

        case 'preparing':
        case 'submitted':
        case 'started':
            return <RefreshCw className={`${sizeClass} text-yellow-400 animate-spin ${className}`} />

        case 'paused':
        case 'preview_ready':
        case 'minimized_ready':
            return <Pause className={`${sizeClass} text-amber-400 ${className}`} />

        case 'docking_ready':
            return <Beaker className={`${sizeClass} text-amber-400 ${className}`} />

        default:
            return <Clock className={`${sizeClass} text-gray-400 ${className}`} />
    }
}

/**
 * Get status color class for backgrounds/borders
 */
export function getStatusColorClass(status: JobStatus | string): {
    bg: string
    border: string
    text: string
} {
    switch (status) {
        case 'completed':
        case 'success':
            return {
                bg: 'bg-green-900/20',
                border: 'border-green-700/50',
                text: 'text-green-400',
            }

        case 'failed':
        case 'error':
            return {
                bg: 'bg-red-900/20',
                border: 'border-red-700/50',
                text: 'text-red-400',
            }

        case 'running':
        case 'processing':
            return {
                bg: 'bg-blue-900/20',
                border: 'border-blue-700/50',
                text: 'text-blue-400',
            }

        case 'preparing':
        case 'submitted':
            return {
                bg: 'bg-yellow-900/20',
                border: 'border-yellow-700/50',
                text: 'text-yellow-400',
            }

        case 'paused':
        case 'docking_ready':
            return {
                bg: 'bg-amber-900/20',
                border: 'border-amber-700/50',
                text: 'text-amber-400',
            }

        default:
            return {
                bg: 'bg-gray-800/50',
                border: 'border-gray-700',
                text: 'text-gray-400',
            }
    }
}

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: JobStatus | string): string {
    switch (status) {
        case 'completed':
        case 'success':
        case 'successful':
        case 'finished':
        case 'done':
            return 'Completed'

        case 'failed':
        case 'error':
        case 'failure':
            return 'Failed'

        case 'running':
        case 'in_progress':
        case 'processing':
            return 'Running'

        case 'docking':
            return 'Docking'

        case 'resuming':
            return 'Resuming'

        case 'preparing':
            return 'Preparing'

        case 'submitted':
        case 'started':
            return 'Queued'

        case 'paused':
            return 'Paused'

        case 'preview_ready':
            return 'Preview Ready'

        case 'minimized_ready':
            return 'Minimized'

        case 'docking_ready':
            return 'Docking Ready'

        default:
            return 'Pending'
    }
}
