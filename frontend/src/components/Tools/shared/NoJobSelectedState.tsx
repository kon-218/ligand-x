'use client'

import type { LucideIcon } from 'lucide-react'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NoJobSelectedStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function NoJobSelectedState({
  icon: Icon = Activity,
  title = 'No job selected',
  description = 'Select a job from the list or run a new job',
  actionLabel,
  onAction,
  className = 'h-full min-h-[16rem]',
}: NoJobSelectedStateProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="text-center text-gray-400">
        <Icon className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>{title}</p>
        <p className="text-sm mt-1">{description}</p>
        {actionLabel && onAction && (
          <Button
            onClick={onAction}
            className="mt-4"
            size="sm"
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
