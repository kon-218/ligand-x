'use client'

import { useState } from 'react'
import { Download, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageFileViewerProps {
  imageUrl: string
  name: string
  onClose?: () => void
}

export function ImageFileViewer({ imageUrl, name, onClose }: ImageFileViewerProps) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 300))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 50))
  }

  const handleResetZoom = () => {
    setZoom(100)
    setRotation(0)
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-900 z-10 top-[40px]">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{name}</span>
          <span className="text-xs text-gray-400">({zoom}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
            title="Zoom out"
            type="button"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
            title="Zoom in"
            type="button"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
            title="Rotate 90°"
            type="button"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-1.5 text-xs rounded hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
            title="Reset zoom and rotation"
            type="button"
          >
            Reset
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
            title="Download image"
            type="button"
          >
            <Download className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
              title="Close"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Image Container */}
      <div className="flex-1 overflow-auto bg-gray-950 flex items-center justify-center p-4">
        <div
          className="flex items-center justify-center"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          <img
            src={imageUrl}
            alt={name}
            className="max-w-full max-h-full object-contain"
            style={{
              maxWidth: '100%',
              maxHeight: '100%'
            }}
          />
        </div>
      </div>
    </div>
  )
}
