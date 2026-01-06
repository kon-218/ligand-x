import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api-client'
import { Loader2, AlertCircle } from 'lucide-react'

// Dynamically import Plotly with no SSR to avoid window is not defined errors
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as any

interface PAEHeatmapProps {
    jobId: string
    poseIndex: number
    hasPAE: boolean
}

export function PAEHeatmap({ jobId, poseIndex, hasPAE }: PAEHeatmapProps) {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<number[][] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!hasPAE) return

        const fetchPAE = async () => {
            try {
                setLoading(true)
                setError(null)
                const response = await api.getBoltz2PosePAE(jobId, poseIndex)
                if (response.pae) {
                    setData(response.pae)
                } else {
                    setError('Invalid PAE data received')
                }
            } catch (err: any) {
                console.error('Failed to fetch PAE data:', err)
                setError(err.message || 'Failed to load PAE matrix')
            } finally {
                setLoading(false)
            }
        }

        fetchPAE()
    }, [jobId, poseIndex, hasPAE])

    if (!hasPAE) {
        return (
            <div className="flex flex-col items-center justify-center h-64 bg-gray-900/30 rounded-lg border border-gray-700/50">
                <p className="text-gray-500">PAE data not available for this pose</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 bg-gray-900/30 rounded-lg border border-gray-700/50">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                <p className="text-gray-400 text-sm">Loading PAE Matrix...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 bg-gray-900/30 rounded-lg border border-red-900/30">
                <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        )
    }

    if (!data) return null

    return (
        <div className="w-full h-[400px] bg-white rounded-lg overflow-hidden relative">
             <Plot
                data={[
                    {
                        z: data,
                        type: 'heatmap',
                        // AlphaFold PAE Color Palette:
                        // 0 Å (High Confidence) -> Dark Blue
                        // 30 Å (Low Confidence) -> Red
                        colorscale: [
                            [0, 'rgb(0, 0, 150)'],        // Dark Blue
                            [0.33, 'rgb(100, 149, 237)'], // Cornflower Blue (~10Å)
                            [0.66, 'rgb(255, 255, 0)'],   // Yellow (~20Å)
                            [1, 'rgb(255, 0, 0)']         // Red (30Å)
                        ],
                        zmin: 0,
                        zmax: 30,
                        colorbar: {
                            title: 'Expected Error (Å)',
                            titleside: 'right'
                        },
                        hovertemplate: 'Residue %{x} vs %{y}<br>Error: %{z:.1f} Å<extra></extra>'
                    }
                ]}
                layout={{
                    title: {
                        text: 'Predicted Aligned Error (PAE)',
                        font: { size: 14 }
                    },
                    xaxis: {
                        title: 'Residue Index',
                        showgrid: false
                    },
                    yaxis: {
                        title: 'Residue Index',
                        showgrid: false,
                        autorange: 'reversed' // Standard matrix view
                    },
                    margin: { t: 40, r: 50, b: 40, l: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    autosize: true
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ displayModeBar: false }}
            />
        </div>
    )
}
