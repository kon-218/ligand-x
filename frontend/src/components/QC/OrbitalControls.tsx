'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, Loader2, Eye, EyeOff } from 'lucide-react'
import { getMOLabel } from '@/lib/orbital-utils'
import type { MolstarViewerHandle, OrbitalInfo } from '@/components/MolecularViewer/MolecularViewer'

interface OrbitalControlsProps {
  jobId: string | null
  viewerRef: MolstarViewerHandle | null
}

export function OrbitalControls({ jobId, viewerRef }: OrbitalControlsProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orbitalInfo, setOrbitalInfo] = useState<OrbitalInfo | null>(null)
  const [selectedMO, setSelectedMO] = useState<number | null>(null)
  const [isovalue, setIsovalue] = useState(1.0)
  const [enabled, setEnabled] = useState(false)
  const loadedJobIdRef = useRef<string | null>(null)
  const prevJobIdRef = useRef<string | null>(null)

  // Reset state when job changes (orbitals stay off until toggled)
  useEffect(() => {
    if (jobId !== prevJobIdRef.current) {
      prevJobIdRef.current = jobId
      setEnabled(false)
      setOrbitalInfo(null)
      setSelectedMO(null)
      setError(null)
      loadedJobIdRef.current = null
      if (viewerRef?.orbitals) {
        viewerRef.orbitals.clear().catch(() => {})
      }
    }
  }, [jobId, viewerRef])

  // Show/update orbital when selection or isovalue changes (only when enabled)
  useEffect(() => {
    if (!enabled || !viewerRef?.orbitals || selectedMO === null || !orbitalInfo) return

    viewerRef.orbitals.show(selectedMO, isovalue).catch(err => {
      console.error('Failed to show orbital:', err)
    })
  }, [selectedMO, isovalue, enabled, viewerRef, orbitalInfo])

  // Toggle: load data on first enable, then show/hide
  const toggleEnabled = async () => {
    if (!viewerRef?.orbitals || !jobId) return

    if (enabled) {
      await viewerRef.orbitals.hide()
      setEnabled(false)
      return
    }

    // First activation — load basis if not loaded yet
    if (!orbitalInfo || loadedJobIdRef.current !== jobId) {
      setLoading(true)
      setError(null)
      try {
        const info = await viewerRef.orbitals.load(jobId)
        setOrbitalInfo(info)
        setSelectedMO(info.homoIndex)
        loadedJobIdRef.current = jobId
        setEnabled(true)
      } catch (err) {
        console.error('Failed to load orbital data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load MO data')
        setOrbitalInfo(null)
      } finally {
        setLoading(false)
      }
    } else {
      // Already loaded — just re-show
      if (selectedMO !== null) {
        await viewerRef.orbitals.show(selectedMO, isovalue)
      }
      setEnabled(true)
    }
  }

  // Clean up orbitals on unmount
  const viewerRefForCleanup = useRef(viewerRef)
  viewerRefForCleanup.current = viewerRef
  useEffect(() => {
    return () => {
      if (viewerRefForCleanup.current?.orbitals) {
        viewerRefForCleanup.current.orbitals.clear().catch(() => {})
      }
    }
  }, [])

  if (!jobId) return null

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Molecular Orbitals</h3>
        <button
          onClick={toggleEnabled}
          disabled={loading}
          className={`p-1.5 rounded transition-colors ${
            enabled
              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
              : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={loading ? 'Loading...' : enabled ? 'Hide orbitals' : 'Show orbitals'}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mt-2">{error}</p>
      )}

      {enabled && orbitalInfo && selectedMO !== null && (
        <div className="space-y-3 mt-3">
          {/* MO Selector */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedMO(prev => Math.max(0, (prev ?? 0) - 1))}
              disabled={selectedMO === 0}
              className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            <div className="flex-1 text-center">
              <div className="text-white font-semibold">
                {getMOLabel(selectedMO, orbitalInfo.homoIndex)}
              </div>
              <div className="text-xs text-gray-400">
                MO {selectedMO} / {orbitalInfo.totalMOs - 1}
              </div>
              <div className={`text-xs ${selectedMO <= orbitalInfo.homoIndex ? 'text-green-400' : 'text-blue-400'}`}>
                {selectedMO <= orbitalInfo.homoIndex ? 'Occupied' : 'Virtual'}
              </div>
            </div>

            <button
              onClick={() => setSelectedMO(prev => Math.min(orbitalInfo.totalMOs - 1, (prev ?? 0) + 1))}
              disabled={selectedMO === orbitalInfo.totalMOs - 1}
              className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedMO(orbitalInfo.homoIndex - 1)}
              disabled={orbitalInfo.homoIndex < 1}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              HOMO-1
            </button>
            <button
              onClick={() => setSelectedMO(orbitalInfo.homoIndex)}
              className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
            >
              HOMO
            </button>
            <button
              onClick={() => setSelectedMO(orbitalInfo.homoIndex + 1)}
              disabled={orbitalInfo.homoIndex >= orbitalInfo.totalMOs - 1}
              className="flex-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              LUMO
            </button>
            <button
              onClick={() => setSelectedMO(orbitalInfo.homoIndex + 2)}
              disabled={orbitalInfo.homoIndex >= orbitalInfo.totalMOs - 2}
              className="flex-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              LUMO+1
            </button>
          </div>

          {/* Isovalue Control */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Isovalue: {isovalue.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={isovalue}
              onChange={(e) => setIsovalue(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0.5</span>
              <span>3.0</span>
            </div>
          </div>

          {/* Legend */}
          <div className="text-xs text-gray-400 space-y-0.5 pt-1 border-t border-gray-700">
            <p><strong className="text-blue-400">Blue:</strong> Positive lobe (+)</p>
            <p><strong className="text-red-400">Red:</strong> Negative lobe (-)</p>
          </div>
        </div>
      )}
    </div>
  )
}
