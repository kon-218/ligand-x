'use client'

/**
 * Control panel for Molstar Viewer
 * Provides UI for all visualization customizations
 */

import React from 'react'
import { MolstarViewerHandle } from './MolecularViewer'

export interface MolstarViewerControlsProps {
  viewerRef: React.RefObject<MolstarViewerHandle | null>
  className?: string
}

export const MolstarViewerControls: React.FC<MolstarViewerControlsProps> = ({
  viewerRef,
  className = ''
}) => {
  const handleSetBackground = (color: string) => {
    if (!viewerRef.current) return
    // Convert hex string to number
    const colorNum = parseInt(color.replace('#', ''), 16)
    viewerRef.current.setBackground(colorNum)
  }

  const handleHighlight = () => {
    if (!viewerRef.current) return
    // Highlight residue with seq_id 7 as an example
    viewerRef.current.interactivity.highlightResidue(7)
  }

  return (
    <div className={`flex flex-col gap-4 p-4 bg-gray-800 rounded-lg ${className}`}>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">Background</h3>
        <div className="flex gap-2">
          <button
            onClick={() => handleSetBackground('#111827')}
            className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Dark
          </button>
          <button
            onClick={() => handleSetBackground('#ffffff')}
            className="px-3 py-1.5 text-xs bg-white text-gray-900 rounded hover:bg-gray-100 transition-colors"
          >
            Light
          </button>
          <button
            onClick={() => handleSetBackground('#1e40af')}
            className="px-3 py-1.5 text-xs bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Blue
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">Color Themes</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => viewerRef.current?.coloring.applyDefault()}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
          >
            Default
          </button>
          <button
            onClick={() => viewerRef.current?.coloring.applyStripes()}
            className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-500 transition-colors"
          >
            Striped Residues
          </button>
          <button
            onClick={() => viewerRef.current?.coloring.applyCustomTheme()}
            className="px-3 py-1.5 text-xs bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 text-white rounded hover:opacity-90 transition-opacity"
          >
            Radial Gradient
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">Animation</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => viewerRef.current?.toggleSpin()}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-500 transition-colors"
          >
            Toggle Spin
          </button>
          <button
            onClick={() => viewerRef.current?.animate.loop()}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-500 transition-colors"
          >
            Loop Frames
          </button>
          <button
            onClick={() => viewerRef.current?.animate.palindrome()}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-500 transition-colors"
          >
            Palindrome
          </button>
          <button
            onClick={() => viewerRef.current?.animate.stop()}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-200">Interactivity</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleHighlight}
            className="px-3 py-1.5 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-500 transition-colors"
          >
            Highlight Residue 7
          </button>
          <button
            onClick={() => viewerRef.current?.interactivity.clearHighlight()}
            className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
          >
            Clear Highlight
          </button>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-700">
        <p className="text-xs text-gray-400">
          All customizations from Molstar basic-wrapper example
        </p>
      </div>
    </div>
  )
}
