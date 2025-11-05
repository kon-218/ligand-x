'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, Play, Info } from 'lucide-react'
import { qcService } from '@/lib/qc-service'
import { useMolecularStore } from '@/store/molecular-store'

interface VibrationalModesTableProps {
  jobId: string | null
  frequencies?: number[]
  intensities?: number[]
  className?: string
}

interface ModeData {
  index: number
  frequency: number
  intensity: number
  isImaginary: boolean
}

export function VibrationalModesTable({
  jobId,
  frequencies: propFrequencies,
  intensities: propIntensities,
  className = ""
}: VibrationalModesTableProps) {
  const [modes, setModes] = useState<ModeData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animatingMode, setAnimatingMode] = useState<number | null>(null)
  const { viewerRef } = useMolecularStore()

  useEffect(() => {
    const loadModes = async () => {
      if (!jobId && (!propFrequencies || !propIntensities)) {
        setModes([])
        return
      }

      if (propFrequencies && propIntensities) {
        // Use provided data
        const modeData: ModeData[] = propFrequencies.map((freq, idx) => ({
          index: idx,
          frequency: freq,
          intensity: propIntensities[idx] || 0,
          isImaginary: freq < 0
        }))
        setModes(modeData)
        return
      }

      if (!jobId) return

      setLoading(true)
      setError(null)

      try {
        const data = await qcService.getNormalModes(jobId)
        const normalModes = data.normal_modes
        
        if (normalModes.frequencies && normalModes.intensities) {
          const modeData: ModeData[] = normalModes.frequencies.map((freq, idx) => ({
            index: idx,
            frequency: freq,
            intensity: normalModes.intensities[idx] || 0,
            isImaginary: freq < 0
          }))
          setModes(modeData)
        } else {
          setError('No mode data available')
        }
      } catch (err) {
        console.error('Failed to load normal modes:', err)
        setError(err instanceof Error ? err.message : 'Failed to load modes')
      } finally {
        setLoading(false)
      }
    }

    loadModes()
  }, [jobId, propFrequencies, propIntensities])

  const handleModeClick = async (modeIndex: number) => {
    if (!jobId) {
      console.error('No job ID available')
      return
    }

    if (!viewerRef) {
      console.error('Viewer not available')
      return
    }

    setAnimatingMode(modeIndex)

    try {
      // Fetch trajectory data
      const trajectoryData = await qcService.getModeTrajectory(jobId, modeIndex, 60, 0.5)
      
      // Get the viewer handle
      const handle = viewerRef as any
      
      // Check if animateNormalMode method exists
      if (handle && typeof handle.animateNormalMode === 'function') {
        await handle.animateNormalMode(trajectoryData.pdb_data, {
          loop: true,
          speed: 30 // frames per second
        })
      } else {
        // Fallback: use loadTrajectory if available
        if (handle && typeof handle.loadTrajectory === 'function') {
          await handle.loadTrajectory({ pdbData: trajectoryData.pdb_data }, 'pdb')
          // Try to start animation
          if (handle.animate && typeof handle.animate.loop === 'function') {
            handle.animate.loop()
          }
        } else {
          console.error('Viewer does not support normal mode animation')
          setError('Viewer animation not available')
        }
      }
    } catch (err) {
      console.error('Failed to animate mode:', err)
      setError(err instanceof Error ? err.message : 'Failed to animate mode')
    } finally {
      setAnimatingMode(null)
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-gray-800/50 rounded-lg ${className}`}>
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Loading vibrational modes...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-gray-800/50 rounded-lg ${className}`}>
        <div className="text-center text-red-400">
          <Info className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm">Failed to load modes</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (modes.length === 0) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] bg-gray-800 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2" />
          <p>No vibrational modes available</p>
          <p className="text-sm text-gray-500 mt-1">
            Run a frequency calculation to generate normal modes
          </p>
        </div>
      </div>
    )
  }

  // Filter out very low frequency modes (translational/rotational)
  const filteredModes = modes.filter(mode => Math.abs(mode.frequency) > 10)

  return (
    <div className={`bg-gray-800/50 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-white">Vibrational Modes</h3>
        <span className="text-xs text-gray-400">
          {filteredModes.length} mode{filteredModes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900/80 backdrop-blur-sm z-10">
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-3 text-gray-300 font-medium">Mode</th>
              <th className="text-right py-2 px-3 text-gray-300 font-medium">Frequency</th>
              <th className="text-right py-2 px-3 text-gray-300 font-medium">Intensity</th>
              <th className="text-center py-2 px-3 text-gray-300 font-medium w-20">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredModes.map((mode) => (
              <tr
                key={mode.index}
                className={`
                  border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors
                  ${animatingMode === mode.index ? 'bg-blue-900/20' : ''}
                  ${mode.isImaginary ? 'bg-red-900/10' : ''}
                `}
              >
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{mode.index + 1}</span>
                    {mode.isImaginary && (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Imaginary
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right py-2 px-3">
                  <span className={mode.isImaginary ? 'text-red-400' : 'text-gray-200'}>
                    {mode.frequency.toFixed(2)} cm⁻¹
                  </span>
                </td>
                <td className="text-right py-2 px-3">
                  <span className="text-gray-300">
                    {mode.intensity.toFixed(2)} km/mol
                  </span>
                </td>
                <td className="text-center py-2 px-3">
                  <button
                    onClick={() => handleModeClick(mode.index)}
                    disabled={animatingMode !== null || mode.isImaginary}
                    className={`
                      px-3 py-1 rounded-md text-xs font-medium transition-colors
                      ${mode.isImaginary
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : animatingMode === mode.index
                        ? 'bg-blue-600 text-white cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }
                      flex items-center gap-1 mx-auto
                    `}
                    title={mode.isImaginary ? 'Cannot animate imaginary frequencies' : 'Animate this mode'}
                  >
                    {animatingMode === mode.index ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        Animate
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredModes.length < modes.length && (
        <div className="mt-2 text-xs text-gray-500">
          {modes.length - filteredModes.length} low-frequency mode(s) hidden (translational/rotational)
        </div>
      )}
    </div>
  )
}

