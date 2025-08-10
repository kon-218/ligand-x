import React from 'react'
import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusType = 'completed' | 'success' | 'failed' | 'error' | 'running' | 'pending' | 'queued' | 'warning' | 'info' | 'default'

interface StatusBadgeProps {
    status: string
    label?: string
    showIcon?: boolean
    className?: string
    size?: 'sm' | 'md' | 'lg'
}

export function StatusBadge({
    status,
    label,
    showIcon = true,
    className,
    size = 'md'
}: StatusBadgeProps) {
    const normalizedStatus = status.toLowerCase() as StatusType

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'completed':
            case 'success':
            case 'successful':
            case 'finished':
            case 'done':
                return {
                    color: 'bg-green-500/10 text-green-400 border-green-500/20',
                    icon: CheckCircle,
                    defaultLabel: 'Completed'
                }
            case 'failed':
            case 'error':
                return {
                    color: 'bg-red-500/10 text-red-400 border-red-500/20',
                    icon: XCircle,
                    defaultLabel: 'Failed'
                }
            case 'running':
            case 'processing':
                return {
                    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                    icon: RefreshCw,
                    iconClass: 'animate-spin',
                    defaultLabel: 'Running'
                }
            case 'pending':
            case 'queued':
                return {
                    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                    icon: Clock,
                    defaultLabel: 'Pending'
                }
            case 'warning':
                return {
                    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    icon: AlertTriangle,
                    defaultLabel: 'Warning'
                }
            default:
                return {
                    color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
                    icon: Info,
                    defaultLabel: status
                }
        }
    }

    const config = getStatusConfig(normalizedStatus)
    const Icon = config.icon
    const displayText = label || config.defaultLabel

    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-0.5',
        lg: 'text-base px-3 py-1'
    }

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
                config.color,
                sizeClasses[size],
                className
            )}
        >
            {showIcon && (
                <Icon className={cn('w-3.5 h-3.5', config.iconClass)} />
            )}
            {displayText}
        </span>
    )
}
