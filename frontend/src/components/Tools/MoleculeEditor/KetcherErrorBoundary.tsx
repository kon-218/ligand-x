'use client'

import React, { Component, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorCount: number
}

/**
 * Error boundary specifically for Ketcher initialization issues
 * Catches and suppresses known Ketcher initialization errors
 */
export class KetcherErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a known Ketcher/React initialization error that can be safely suppressed
    const isSupressibleError = 
      error.message?.includes('Ketcher needs to be initialized') ||
      error.message?.includes('KetcherLogger') ||
      error.message?.includes('couldn\'t find ketcher instance') ||
      error.message?.includes('Cannot update a component') ||
      error.message?.includes('while rendering a different component')
    
    if (isSupressibleError) {
      console.warn('Suppressed Ketcher error:', error.message)
      // Don't show error UI for known initialization/rendering issues
      return {
        hasError: false,
        error: null,
        errorCount: 0
      }
    }
    
    // For critical errors, show error UI
    return {
      hasError: true,
      error,
      errorCount: 0
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const isSupressibleError = 
      error.message?.includes('Ketcher needs to be initialized') ||
      error.message?.includes('KetcherLogger') ||
      error.message?.includes('couldn\'t find ketcher instance') ||
      error.message?.includes('Cannot update a component') ||
      error.message?.includes('while rendering a different component')
    
    if (isSupressibleError) {
      // Silently suppress known non-critical errors
      this.props.onError?.(error)
      return
    }
    
    console.error('Critical Ketcher Error:', error, errorInfo)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Editor Error
          </h2>
          <p className="text-gray-600 text-center mb-4">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

