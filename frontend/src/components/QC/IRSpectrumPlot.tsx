'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Download, Info } from 'lucide-react'
import { qcService } from '@/lib/qc-service'

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
    </div>
  )
})

interface IRSpectrumPlotProps {
  jobId: string | null
  frequencies?: number[]
  intensities?: number[]
  irSpectrumFile?: string
  className?: string
}

// Generate broadened IR spectrum using Lorentzian line shape
// Returns transmittance (%) - peaks point downward from 100%
function generateBroadenedSpectrum(
  frequencies: number[],
  intensities: number[],
  fwhm: number = 20, // Full width at half maximum in cm⁻¹
  numPoints: number = 1000
): { x: number[], y: number[] } {
  if (frequencies.length === 0) return { x: [], y: [] }
  
  // Determine range with padding
  const minFreq = Math.min(...frequencies) - 200
  const maxFreq = Math.max(...frequencies) + 200
  // Standard IR range is typically 400-4000 cm⁻¹
  const rangeMin = Math.max(400, minFreq)
  const rangeMax = Math.min(4000, maxFreq)
  
  const step = (rangeMax - rangeMin) / numPoints
  const x: number[] = []
  const absorbance: number[] = []
  
  // Lorentzian broadening parameter (half-width)
  const gamma = fwhm / 2
  
  for (let i = 0; i <= numPoints; i++) {
    const freq = rangeMin + i * step
    x.push(freq)
    
    // Sum Lorentzian contributions from all peaks
    let intensity = 0
    for (let j = 0; j < frequencies.length; j++) {
      const diff = freq - frequencies[j]
      // Lorentzian: L(x) = (gamma^2) / ((x - x0)^2 + gamma^2)
      intensity += intensities[j] * (gamma * gamma) / (diff * diff + gamma * gamma)
    }
    absorbance.push(intensity)
  }
  
  // Normalize absorbance to max
  const maxAbs = Math.max(...absorbance)
  
  // Convert to transmittance (%) - T = 100 * 10^(-A)
  // For visualization, we scale so strongest peak goes to ~70% transmittance
  const y: number[] = []
  for (let i = 0; i < absorbance.length; i++) {
    const normalizedAbs = maxAbs > 0 ? (absorbance[i] / maxAbs) * 0.5 : 0 // Scale factor for visual depth
    // Transmittance: T = 10^(-A) * 100, but we use a simpler visual scaling
    const transmittance = 100 - (normalizedAbs * 30) // Peaks go down to ~70%
    y.push(transmittance)
  }
  
  return { x, y }
}

export function IRSpectrumPlot({ 
  jobId, 
  frequencies: propFrequencies, 
  intensities: propIntensities,
  irSpectrumFile,
  className = ""
}: IRSpectrumPlotProps) {
  const [plotData, setPlotData] = useState<{
    frequencies: number[]
    intensities: number[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 300 })

  // Handle resize
  const updateSize = useCallback(() => {
    if (containerRef.current) {
      const { width } = containerRef.current.getBoundingClientRect()
      setContainerSize({ width: width - 32, height: Math.max(250, Math.min(400, width * 0.6)) })
    }
  }, [])

  useEffect(() => {
    updateSize()
    const resizeObserver = new ResizeObserver(updateSize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [updateSize])

  useEffect(() => {
    const loadSpectrumData = async () => {
      if (!jobId && (!propFrequencies || !propIntensities)) {
        setPlotData(null)
        return
      }

      if (propFrequencies && propIntensities) {
        setPlotData({
          frequencies: propFrequencies,
          intensities: propIntensities
        })
        return
      }

      if (!jobId) return

      setLoading(true)
      setError(null)

      try {
        const data = await qcService.getIRSpectrum(jobId)
        setPlotData(data)
      } catch (err) {
        console.error('Failed to load IR spectrum:', err)
        setError(err instanceof Error ? err.message : 'Failed to load spectrum')
      } finally {
        setLoading(false)
      }
    }

    loadSpectrumData()
  }, [jobId, propFrequencies, propIntensities])

  const downloadSpectrum = () => {
    // If we have a backend file, try to download it
    if (jobId && irSpectrumFile) {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      // Extract filename from path if possible
      const filename = irSpectrumFile.split('/').pop() || 'ir_spectrum.dat'
      const downloadUrl = `${API_BASE_URL}/api/qc/jobs/files/${jobId}/${filename}`
      
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }

    // Fallback: Client-side CSV generation
    if (!plotData) return

    const csvContent = [
      'Frequency (cm⁻¹),Intensity (km/mol)',
      ...plotData.frequencies.map((freq, i) => 
        `${freq},${plotData.intensities[i]}`
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ir_spectrum_${jobId || 'data'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center min-h-[250px] bg-gray-800/50 rounded-lg ${className}`}>
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Loading IR spectrum...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center min-h-[250px] bg-gray-800/50 rounded-lg ${className}`}>
        <div className="text-center text-red-400">
          <Info className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm">Failed to load IR spectrum</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!plotData || plotData.frequencies.length === 0) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center min-h-[250px] bg-gray-800 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <Info className="w-8 h-8 mx-auto mb-2" />
          <p>No IR spectrum data available</p>
          <p className="text-sm text-gray-500 mt-1">
            Run a frequency calculation to generate IR spectrum
          </p>
        </div>
      </div>
    )
  }

  // Generate broadened spectrum for visualization (returns transmittance %)
  const broadenedSpectrum = generateBroadenedSpectrum(
    plotData.frequencies,
    plotData.intensities,
    15 // FWHM in cm⁻¹
  )

  // Create stick spectrum data for showing exact peak positions (in transmittance)
  const stickData = {
    x: [] as number[],
    y: [] as number[],
  }
  
  // Normalize intensities for stick spectrum - convert to transmittance scale
  const maxIntensity = Math.max(...plotData.intensities)
  plotData.frequencies.forEach((freq, i) => {
    // Each stick: from 100% down to peak depth
    const normalizedInt = plotData.intensities[i] / (maxIntensity || 1)
    const peakTransmittance = 100 - (normalizedInt * 30) // Match broadened spectrum scaling
    stickData.x.push(freq, freq, freq)
    stickData.y.push(100, peakTransmittance, null as unknown as number)
  })

  const plotConfig = {
    data: [
      // Broadened spectrum (transmittance line) - red like in ORCA docs
      {
        x: broadenedSpectrum.x,
        y: broadenedSpectrum.y,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Transmittance',
        line: {
          color: '#EF4444', // Red like ORCA documentation
          width: 2,
        },
        hovertemplate: '%{x:.1f} cm⁻¹<br>T: %{y:.1f}%<extra></extra>',
      },
    ],
    layout: {
      autosize: true,
      xaxis: {
        title: {
          text: 'Wavenumber (cm⁻¹)',
          font: { color: '#E5E7EB', size: 12 },
          standoff: 10,
        },
        autorange: 'reversed' as const, // IR spectra are plotted high-to-low wavenumber
        zeroline: false,
        gridcolor: 'rgba(75, 85, 99, 0.3)',
        color: '#D1D5DB',
        tickfont: { color: '#D1D5DB', size: 10 },
        linecolor: '#4B5563',
        showline: true,
      },
      yaxis: {
        title: {
          text: 'Transmittance (%)',
          font: { color: '#E5E7EB', size: 12 },
          standoff: 5,
        },
        zeroline: false,
        gridcolor: 'rgba(75, 85, 99, 0.3)',
        color: '#D1D5DB',
        tickfont: { color: '#D1D5DB', size: 10 },
        linecolor: '#4B5563',
        showline: true,
        range: [65, 102], // Show from ~65% to 100% transmittance
        tickvals: [70, 80, 90, 100],
        ticktext: ['70', '80', '90', '100'],
      },
      plot_bgcolor: 'rgba(17, 24, 39, 0.8)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#F3F4F6' },
      hovermode: 'closest' as const,
      showlegend: false,
      margin: { t: 20, r: 15, b: 50, l: 60 },
    },
    config: {
      displayModeBar: true,
      displaylogo: false,
      responsive: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'] as const,
      toImageButtonOptions: {
        format: 'png' as const,
        filename: `ir_spectrum_${jobId || 'data'}`,
        height: 400,
        width: 800,
        scale: 2,
      },
    },
  }

  return (
    <div ref={containerRef} className={`bg-gray-800/50 rounded-lg p-3 ${className}`}>
      {/* Header with download button */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-white">IR Spectrum</h3>
        <button
          onClick={downloadSpectrum}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV
        </button>
      </div>

      {/* Plot - responsive container */}
      <div 
        className="w-full bg-gray-900/50 rounded-md overflow-hidden"
        style={{ height: containerSize.height }}
      >
        <Plot
          data={plotConfig.data}
          layout={plotConfig.layout}
          config={plotConfig.config}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler={true}
        />
      </div>

      {/* Info - compact */}
      <div className="mt-2 text-xs text-gray-400 space-y-0.5">
        <p>
          <span className="text-gray-300 font-medium">Peaks:</span> {plotData.frequencies.length} vibrational mode{plotData.frequencies.length !== 1 ? 's' : ''}
        </p>
        <p>
          <span className="text-gray-300 font-medium">Range:</span> {Math.min(...plotData.frequencies).toFixed(0)} - {Math.max(...plotData.frequencies).toFixed(0)} cm⁻¹
        </p>
        <p className="text-gray-500 pt-1">
          Tip: Use zoom and pan tools to explore specific regions. High-intensity peaks indicate strong IR-active vibrations.
        </p>
      </div>
    </div>
  )
}
