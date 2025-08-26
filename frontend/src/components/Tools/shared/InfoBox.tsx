'use client'

import { ReactNode } from 'react'
import { Info, AlertTriangle, CheckCircle2, XCircle, Lightbulb } from 'lucide-react'
import type { AccentColor } from './types'
import { accentColorClasses } from './types'

type InfoBoxVariant = 'info' | 'warning' | 'success' | 'error' | 'tip'

interface InfoBoxProps {
  variant?: InfoBoxVariant
  title?: string
  children: ReactNode
  accentColor?: AccentColor
  className?: string
}

const variantConfig: Record<InfoBoxVariant, {
  icon: ReactNode
  bgClass: string
  borderClass: string
  titleClass: string
  textClass: string
}> = {
  info: {
    icon: <Info className="w-5 h-5 text-blue-400" />,
    bgClass: 'bg-blue-900/20',
    borderClass: 'border-blue-700/50',
    titleClass: 'text-blue-400',
    textClass: 'text-blue-300',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
    bgClass: 'bg-yellow-900/20',
    borderClass: 'border-yellow-700/50',
    titleClass: 'text-yellow-400',
    textClass: 'text-yellow-300',
  },
  success: {
    icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
    bgClass: 'bg-green-900/20',
    borderClass: 'border-green-700/50',
    titleClass: 'text-green-400',
    textClass: 'text-green-300',
  },
  error: {
    icon: <XCircle className="w-5 h-5 text-red-400" />,
    bgClass: 'bg-red-900/20',
    borderClass: 'border-red-700/50',
    titleClass: 'text-red-400',
    textClass: 'text-red-300',
  },
  tip: {
    icon: <Lightbulb className="w-5 h-5 text-purple-400" />,
    bgClass: 'bg-purple-900/20',
    borderClass: 'border-purple-700/50',
    titleClass: 'text-purple-400',
    textClass: 'text-purple-300',
  },
}

export function InfoBox({
  variant = 'info',
  title,
  children,
  accentColor,
  className = '',
}: InfoBoxProps) {
  const config = variantConfig[variant]

  // Override with accent color if provided
  const colors = accentColor ? accentColorClasses[accentColor] : null
  const bgClass = colors ? colors.bgLight : config.bgClass
  const borderClass = colors ? colors.border : config.borderClass
  const titleClass = colors ? colors.text : config.titleClass
  const textClass = colors ? `${colors.text} opacity-80` : config.textClass

  return (
    <div className={`p-4 ${bgClass} border ${borderClass} rounded-lg ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h5 className={`font-medium mb-1 ${titleClass}`}>{title}</h5>
          )}
          <div className={`text-sm ${textClass}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact inline info
interface InlineInfoProps {
  children: ReactNode
  variant?: InfoBoxVariant
}

export function InlineInfo({ children, variant = 'info' }: InlineInfoProps) {
  const config = variantConfig[variant]

  return (
    <div className="flex items-center gap-2 text-sm">
      {config.icon}
      <span className={config.textClass}>{children}</span>
    </div>
  )
}
