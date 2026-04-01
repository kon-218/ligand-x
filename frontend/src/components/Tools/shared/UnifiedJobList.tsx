import { useState, useMemo, useRef, useEffect } from 'react'
import { StatusIcon, getStatusLabel } from './StatusIcon'
import type { UnifiedJob, ServiceType, SERVICE_CONFIGS } from '@/types/unified-job-types'
import { getJobDisplaySummary, getQCJobTypeLabel, getMDJobTypeLabel } from '@/types/unified-job-types'
import { ChevronDown, ChevronUp } from 'lucide-react'

type ResultsTab = 'recent' | 'completed'

interface ServiceBadgeProps {
    service: ServiceType
    small?: boolean
}

/**
 * Badge showing which service a job belongs to
 */
function ServiceBadge({ service, small = false }: ServiceBadgeProps) {
    const colorMap: Record<ServiceType, string> = {
        docking: 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50',
        md: 'bg-green-900/30 text-green-300 border-green-700/50',
        boltz2: 'bg-purple-900/30 text-purple-300 border-purple-700/50',
        abfe: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
        rbfe: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50',
        qc: 'bg-orange-900/30 text-orange-300 border-orange-700/50',
    }

    const nameMap: Record<ServiceType, string> = {
        docking: 'Dock',
        md: 'MD',
        boltz2: 'Boltz',
        abfe: 'ABFE',
        rbfe: 'RBFE',
        qc: 'QC',
    }

    const sizeClass = small
        ? 'text-[9px] px-1 py-0.5'
        : 'text-[10px] px-1.5 py-0.5'

    return (
        <span className={`${sizeClass} rounded border font-medium ${colorMap[service]}`}>
            {nameMap[service]}
        </span>
    )
}

interface QCJobTypeBadgeProps {
    qcJobType?: string
    orcaTaskType?: string
}

/**
 * Badge showing QC job subtype.
 * When orcaTaskType is available (SP/OPT/OPT_FREQ) it takes priority over
 * the legacy qcJobType category (standard/ir/fukui/conformer).
 */
function QCJobTypeBadge({ qcJobType, orcaTaskType }: QCJobTypeBadgeProps) {
    // Precise labels from the actual ORCA task keyword
    const orcaLabelMap: Record<string, { label: string; color: string }> = {
        'SP':       { label: 'SP',       color: 'bg-emerald-700/30 text-emerald-200 border-emerald-600/50' },
        'OPT':      { label: 'OPT',      color: 'bg-blue-700/30 text-blue-200 border-blue-600/50' },
        'OPT_FREQ': { label: 'OPT+FREQ', color: 'bg-purple-700/30 text-purple-200 border-purple-600/50' },
        'FREQ':     { label: 'FREQ',     color: 'bg-purple-700/30 text-purple-200 border-purple-600/50' },
        'OPTTS':    { label: 'TS OPT',   color: 'bg-red-700/30 text-red-200 border-red-600/50' },
    }

    // Fall back to legacy category labels
    const legacyColorMap: Record<string, string> = {
        'standard': 'bg-orange-700/30 text-orange-200 border-orange-600/50',
        'ir':       'bg-red-700/30 text-red-200 border-red-600/50',
        'fukui':    'bg-yellow-700/30 text-yellow-200 border-yellow-600/50',
        'conformer':'bg-pink-700/30 text-pink-200 border-pink-600/50',
        'bde':      'bg-sky-700/30 text-sky-200 border-sky-600/50',
    }

    // Prefer orca_task_type for standard jobs
    const taskKey = (orcaTaskType || '').toUpperCase()
    if (taskKey && orcaLabelMap[taskKey] && qcJobType === 'standard') {
        const { label, color } = orcaLabelMap[taskKey]
        return (
            <span className={`text-[9px] px-1 py-0.5 rounded border font-medium ${color}`}>
                {label}
            </span>
        )
    }

    // Fallback: legacy category badge for fukui/conformer/ir
    const label = getQCJobTypeLabel(qcJobType)
    const color = legacyColorMap[qcJobType || 'standard'] || legacyColorMap['standard']
    return (
        <span className={`text-[9px] px-1 py-0.5 rounded border font-medium ${color}`}>
            {label}
        </span>
    )
}

interface MDJobTypeBadgeProps {
    minimizationOnly?: boolean
    pauseAtMinimized?: boolean
}

/**
 * Badge showing MD job subtype (Minimization or Equilibration)
 */
function MDJobTypeBadge({ minimizationOnly, pauseAtMinimized }: MDJobTypeBadgeProps) {
    const label = getMDJobTypeLabel(minimizationOnly, pauseAtMinimized)
    const isMinimization = minimizationOnly || pauseAtMinimized
    const color = isMinimization
        ? 'bg-blue-700/30 text-blue-200 border-blue-600/50'
        : 'bg-green-700/30 text-green-200 border-green-600/50'

    return (
        <span className={`text-[9px] px-1 py-0.5 rounded border font-medium ${color}`}>
            {label}
        </span>
    )
}

interface BatchBadgeProps {
    batchTotal?: number
    batchCompleted?: number
    service?: ServiceType
}

/**
 * Badge showing batch job indicator with progress
 * Uses service-specific colors when provided
 */
function BatchBadge({ batchTotal, batchCompleted, service }: BatchBadgeProps) {
    const label = batchTotal
        ? (batchCompleted !== undefined ? `Batch ${batchCompleted}/${batchTotal}` : `Batch (${batchTotal})`)
        : 'Batch'

    // Use service-specific colors if provided, otherwise default to purple
    const colorMap: Record<ServiceType, string> = {
        docking: 'bg-indigo-700/30 text-indigo-200 border-indigo-600/50',
        md: 'bg-green-700/30 text-green-200 border-green-600/50',
        boltz2: 'bg-purple-700/30 text-purple-200 border-purple-600/50',
        abfe: 'bg-blue-700/30 text-blue-200 border-blue-600/50',
        rbfe: 'bg-cyan-700/30 text-cyan-200 border-cyan-600/50',
        qc: 'bg-orange-700/30 text-orange-200 border-orange-600/50',
    }

    const colorClass = service ? colorMap[service] : colorMap.boltz2

    return (
        <span className={`text-[9px] px-1 py-0.5 rounded border font-medium ${colorClass}`}>
            {label}
        </span>
    )
}

interface UnifiedJobListProps {
    jobs: UnifiedJob[]
    activeJobId: string | null
    onSelectJob: (jobId: string | null, service: ServiceType | null) => void
    onCancelJob?: (jobId: string, service: ServiceType) => void
    onDeleteJob?: (jobId: string, service: ServiceType) => void
    resultsTab: ResultsTab
    onTabChange: (tab: ResultsTab) => void
    accentColor?: string
    showServiceBadge?: boolean
    maxHeight?: string
    title?: string
    showQCJobType?: boolean  // Show QC job type badge (only when QC filter is active)
    showMDJobType?: boolean  // Show MD job type badge (only when MD filter is active)
    resizable?: boolean
}

/**
 * Unified job list component with Recent/Completed tabs
 * Shows job info in single-line format with service badges
 */
export function UnifiedJobList({
    jobs,
    activeJobId,
    onSelectJob,
    onCancelJob,
    onDeleteJob,
    resultsTab,
    onTabChange,
    accentColor = 'blue',
    showServiceBadge = true,
    maxHeight = '200px',
    title = 'Jobs',
    showQCJobType = false,
    showMDJobType = false,
    resizable = true,
}: UnifiedJobListProps) {

    // Filter jobs based on tab
    const filteredJobs = useMemo(() => {
        if (resultsTab === 'recent') {
            return jobs.filter(j =>
                j.status !== 'completed' && j.status !== 'failed'
            )
        } else {
            return jobs.filter(j =>
                j.status === 'completed' || j.status === 'failed'
            )
        }
    }, [jobs, resultsTab])

    const activeColorClass = `bg-${accentColor}-600`
    const selectedBgClass = `bg-${accentColor}-500/20 border-${accentColor}-500/50`

    // Height state for resizing
    const initialHeight = useMemo(() => {
        if (typeof maxHeight === 'string' && maxHeight.endsWith('px')) {
            const parsed = parseInt(maxHeight)
            return isNaN(parsed) ? 200 : parsed
        }
        return 200
    }, []) // Only on mount

    const [height, setHeight] = useState(initialHeight)
    const [isMinimized, setIsMinimized] = useState(false)
    const isResizing = useRef(false)
    const startY = useRef(0)
    const startHeight = useRef(0)

    // Handle resizing events
    useEffect(() => {
        if (resizable) {
            const handleMouseMove = (e: MouseEvent) => {
                if (!isResizing.current) return
                const delta = e.clientY - startY.current
                setHeight(Math.max(100, startHeight.current + delta)) // Min height 100
            }
            const handleMouseUp = () => {
                isResizing.current = false
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
            return () => {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }
        }
    }, [resizable])

    // Auto-expand list when job is deselected so user isn't left with a collapsed empty panel
    useEffect(() => {
        if (!activeJobId) setIsMinimized(false)
    }, [activeJobId])

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!resizable) return
        isResizing.current = true
        startY.current = e.clientY
        startHeight.current = height
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }

    return (
        <div className="p-4 border-b border-gray-700 relative group/list">
            {/* Header with title and tabs */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">{title}</h3>
                <div className="inline-flex rounded-md overflow-hidden border border-gray-600">
                    <button
                        className="px-3 py-1 text-xs transition-colors"
                        style={{
                            backgroundColor: resultsTab === 'recent' ? getAccentColor(accentColor) : '#374151',
                            color: resultsTab === 'recent' ? 'white' : '#d1d5db'
                        }}
                        onClick={() => onTabChange('recent')}
                    >
                        Recent
                    </button>
                    <button
                        className="px-3 py-1 text-xs transition-colors"
                        style={{
                            backgroundColor: resultsTab === 'completed' ? getAccentColor(accentColor) : '#374151',
                            color: resultsTab === 'completed' ? 'white' : '#d1d5db'
                        }}
                        onClick={() => onTabChange('completed')}
                    >
                        Completed
                    </button>
                </div>
            </div>

            {/* Job list */}
            <div
                className="space-y-2 overflow-y-auto custom-scrollbar"
                style={{ height: resizable ? `${height}px` : maxHeight, maxHeight: resizable ? 'none' : maxHeight }}
            >
                {filteredJobs.length > 0 ? (
                    filteredJobs.map((job) => (
                        <JobListItem
                            key={job.job_id}
                            job={job}
                            isActive={activeJobId === job.job_id}
                            showServiceBadge={showServiceBadge}
                            showQCJobType={showQCJobType}
                            showMDJobType={showMDJobType}
                            onClick={() => activeJobId === job.job_id ? onSelectJob(null, null) : onSelectJob(job.job_id, job.service)}
                            onCancel={() => onCancelJob?.(job.job_id, job.service)}
                            onDelete={() => onDeleteJob?.(job.job_id, job.service)}
                            accentColor={accentColor}
                        />
                    ))
                ) : (
                    <div className="text-center text-gray-400 py-4 text-sm">
                        {resultsTab === 'completed'
                            ? 'No completed jobs yet'
                            : 'No recent jobs'}
                    </div>
                )}
            </div>

            {/* Resize Handle */}
            {resizable && (
                <div
                    onMouseDown={handleMouseDown}
                    className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors z-10 flex justify-center items-center group-hover/list:bg-gray-600/50"
                    title="Drag to resize list"
                >
                    <div className="w-8 h-0.5 bg-gray-500/50 rounded-full" />
                </div>
            )}
        </div>
    )
}

interface JobListItemProps {
    job: UnifiedJob
    isActive: boolean
    showServiceBadge: boolean
    showQCJobType: boolean
    showMDJobType: boolean
    onClick: () => void
    onCancel: () => void
    onDelete: () => void
    accentColor: string
}

/**
 * Individual job item in the list
 * Shows: Status icon | Job ID | Service badge | Details (single line)
 */
function JobListItem({
    job,
    isActive,
    showServiceBadge,
    showQCJobType,
    showMDJobType,
    onClick,
    onCancel,
    onDelete,
    accentColor,
}: JobListItemProps) {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
    const isPending = job.status === 'submitted' || job.status === 'preparing'
    const isRunning = job.status === 'running'
    const isPaused = job.status === 'paused' || job.status === 'docking_ready'

    // Get the display summary (protein • ligand • details format)
    const displaySummary = getJobDisplaySummary(job)

    // Base classes
    const baseClass = 'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border group'

    // Get background color based on state
    let bgColor = '#374151'  // gray-700
    let borderColor = 'transparent'
    let hoverBgColor = '#4b5563'  // gray-600

    if (isActive) {
        bgColor = getAccentColorWithOpacity(accentColor, 0.2)
        borderColor = getAccentColorWithOpacity(accentColor, 0.5)
    } else if (isPending || isRunning) {
        bgColor = '#78350f20'  // yellow-900/20
        borderColor = '#b45309'  // yellow-600
        hoverBgColor = '#78350f30'  // yellow-900/30
    } else if (isPaused) {
        bgColor = '#78280f20'  // amber-900/20
        borderColor = '#b45309'  // amber-600
        hoverBgColor = '#78280f30'  // amber-900/30
    }

    return (
        <div
            className={baseClass}
            style={{
                backgroundColor: bgColor,
                borderColor: borderColor
            }}
            onClick={onClick}
            onMouseEnter={(e) => {
                if (hoverBgColor !== bgColor) {
                    e.currentTarget.style.backgroundColor = hoverBgColor
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = bgColor
            }}
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Status icon */}
                <StatusIcon status={job.status} size="sm" />

                {/* Job info */}
                <div className="flex-1 min-w-0">
                    {/* Top row: Job ID + badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-white">
                            {job.job_id.substring(0, 8)}...
                        </span>

                        {/* Service badge - shown in "All Jobs" view */}
                        {showServiceBadge && (
                            <ServiceBadge service={job.service} small />
                        )}

                        {/* QC Job Type badge - shown when QC filter is active */}
                        {showQCJobType && job.service === 'qc' && (job.metadata.qc_job_type || job.metadata.orca_task_type) && (
                            <QCJobTypeBadge
                                qcJobType={job.metadata.qc_job_type}
                                orcaTaskType={job.metadata.orca_task_type}
                            />
                        )}

                        {/* MD Job Type badge - shown when MD filter is active */}
                        {showMDJobType && job.service === 'md' && (
                            <MDJobTypeBadge
                                minimizationOnly={job.metadata.minimization_only}
                                pauseAtMinimized={job.metadata.pause_at_minimized}
                            />
                        )}

                        {/* Batch badge - shown when service-filtered (not in All Jobs) and job is batch */}
                        {!showServiceBadge && job.metadata.is_batch && (
                            <BatchBadge
                                service={job.service}
                                batchTotal={job.metadata.batch_total}
                                batchCompleted={job.metadata.batch_completed}
                            />
                        )}

                        {isPending && (
                            <span className="text-[9px] px-1 py-0.5 bg-yellow-600/30 text-yellow-300 rounded">
                                Queued
                            </span>
                        )}
                        {isRunning && (
                            <span className="text-[9px] px-1 py-0.5 bg-green-600/30 text-green-300 rounded animate-pulse">
                                Active
                            </span>
                        )}
                        {isPaused && (
                            <span className="text-[9px] px-1 py-0.5 bg-amber-600/30 text-amber-300 rounded">
                                {getStatusLabel(job.status)}
                            </span>
                        )}
                    </div>

                    {/* Bottom row: Summary details (single line) */}
                    <div className="text-[10px] text-gray-400 truncate">
                        {displaySummary}
                    </div>

                    {/* Progress Bar for Running Jobs */}
                    {isRunning && (
                        <div className="w-full h-0.5 bg-gray-700 mt-1.5 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 transition-all duration-500"
                                style={{ 
                                    width: `${typeof job.progress === 'object' ? job.progress.percent : (job.progress || 0)}%` 
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Actions / Timestamp */}
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                {/* Action Buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(isRunning || isPending) && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onCancel()
                            }}
                            className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            title="Cancel Job"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </button>
                    )}

                    {(job.status === 'completed' || job.status === 'failed' || !isRunning) && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (isConfirmingDelete) {
                                    onDelete()
                                } else {
                                    setIsConfirmingDelete(true)
                                    setTimeout(() => setIsConfirmingDelete(false), 3000)
                                }
                            }}
                            className={`p-1 rounded transition-colors ${isConfirmingDelete
                                ? 'text-red-500 bg-red-500/20'
                                : 'text-gray-400 hover:text-red-400 hover:bg-red-400/10'
                                }`}
                            title={isConfirmingDelete ? "Confirm Delete" : "Delete Job"}
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Timestamp */}
                <div className="text-[10px] text-gray-500 text-right min-w-[60px]">
                    <div>{new Date(job.created_at).toLocaleDateString()}</div>
                    <div>{new Date(job.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                    })}</div>
                </div>
            </div>
        </div>
    )
}

/**
 * Helper function to get hex color for accent color name
 */
function getAccentColor(accentColor: string): string {
    const colorMap: Record<string, string> = {
        'blue': '#2563eb',
        'purple': '#a855f7',
        'indigo': '#4f46e5',
        'green': '#16a34a',
        'cyan': '#06b6d4',
        'red': '#dc2626',
        'pink': '#ec4899',
        'orange': '#ea580c',
        'yellow': '#eab308',
    }
    return colorMap[accentColor] || '#2563eb'
}

/**
 * Helper function to get accent color with opacity (as rgba)
 */
function getAccentColorWithOpacity(accentColor: string, opacity: number): string {
    const colorMap: Record<string, string> = {
        'blue': 'rgb(37, 99, 235',
        'purple': 'rgb(168, 85, 247',
        'indigo': 'rgb(79, 70, 229',
        'green': 'rgb(22, 163, 74',
        'cyan': 'rgb(6, 182, 212',
        'red': 'rgb(220, 38, 38',
        'pink': 'rgb(236, 72, 153',
        'orange': 'rgb(234, 88, 12',
        'yellow': 'rgb(234, 179, 8',
    }
    const rgb = colorMap[accentColor] || 'rgb(37, 99, 235'
    return `${rgb}, ${opacity})`
}

export { ServiceBadge, QCJobTypeBadge, MDJobTypeBadge, BatchBadge }
