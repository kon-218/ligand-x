'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
    FlaskConical,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Check,
    X,
    AlertCircle,
    Activity,
    ChevronDown,
    ChevronUp,
    BarChart3,
    Eye,
    Download,
    Loader2,
    Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Boltz2BatchLigandResult } from '@/store/boltz2-store'
import { useMolecularStore } from '@/store/molecular-store'
import type { MolecularStructure } from '@/types/molecular'
import type { MolstarViewerHandle } from '@/components/MolecularViewer/MolecularViewer'

interface BatchBoltz2ResultsProps {
    batchId: string | null
    results: Boltz2BatchLigandResult[]
    isRunning: boolean
    progress: number
    progressMessage: string
    onViewResult: (result: Boltz2BatchLigandResult) => void
    onExportResults: () => void
}

type SortField = 'ligand_name' | 'affinity_pred_value' | 'binding_free_energy' | 'affinity_probability_binary' | 'confidence_score' | 'complex_plddt'
type SortDirection = 'asc' | 'desc'

const formatNumber = (value: number | undefined | null, decimals: number = 3): string => {
    if (value === undefined || value === null || isNaN(value)) return 'N/A'
    return value.toFixed(decimals)
}

const getAffinityColor = (value: number | undefined): string => {
    if (value === undefined) return 'text-gray-500'
    // Lower is better for affinity (log10 IC50)
    if (value < -2) return 'text-green-500'
    if (value < 0) return 'text-emerald-500'
    if (value < 1) return 'text-yellow-500'
    return 'text-red-500'
}

const getProbabilityColor = (value: number | undefined): string => {
    if (value === undefined) return 'text-gray-500'
    if (value >= 0.8) return 'text-green-500'
    if (value >= 0.5) return 'text-yellow-500'
    return 'text-red-500'
}

const getConfidenceColor = (value: number | undefined): string => {
    if (value === undefined) return 'text-gray-500'
    if (value >= 0.7) return 'text-green-500'
    if (value >= 0.5) return 'text-yellow-500'
    return 'text-red-500'
}

export const BatchBoltz2Results: React.FC<BatchBoltz2ResultsProps> = ({
    batchId,
    results,
    isRunning,
    progress,
    progressMessage,
    onViewResult,
    onExportResults,
}) => {
    const [sortField, setSortField] = useState<SortField>('affinity_pred_value')
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
    const [expandedChart, setExpandedChart] = useState(false)
    const [selectedVisualizationIndex, setSelectedVisualizationIndex] = useState(0)
    const [isFirstLoad, setIsFirstLoad] = useState(true)
    const { setCurrentStructure, viewerRef } = useMolecularStore()

    // Sort results
    const sortedResults = useMemo(() => {
        const sorted = [...results]
        sorted.sort((a, b) => {
            let aVal: number | undefined
            let bVal: number | undefined

            switch (sortField) {
                case 'ligand_name':
                    return sortDirection === 'asc'
                        ? a.ligand_name.localeCompare(b.ligand_name)
                        : b.ligand_name.localeCompare(a.ligand_name)
                case 'affinity_pred_value':
                    aVal = a.affinity_pred_value
                    bVal = b.affinity_pred_value
                    break
                case 'binding_free_energy':
                    aVal = a.binding_free_energy
                    bVal = b.binding_free_energy
                    break
                case 'affinity_probability_binary':
                    aVal = a.affinity_probability_binary
                    bVal = b.affinity_probability_binary
                    break
                case 'confidence_score':
                    aVal = a.confidence_score
                    bVal = b.confidence_score
                    break
                case 'complex_plddt':
                    aVal = a.complex_plddt
                    bVal = b.complex_plddt
                    break
            }

            // Handle undefined values
            if (aVal === undefined && bVal === undefined) return 0
            if (aVal === undefined) return 1
            if (bVal === undefined) return -1

            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        })
        return sorted
    }, [results, sortField, sortDirection])

    // Calculate summary statistics
    const summary = useMemo(() => {
        // Stricter success check: must have success=true AND valid affinity
        const successful = results.filter((r) => r.success && r.affinity_pred_value != null)
        const failed = results.filter((r) => !r.success || (r.success && r.affinity_pred_value == null))

        const affinities = successful
            .map((r) => r.affinity_pred_value)
            .filter((v): v is number => v != null && !isNaN(v))

        const probabilities = successful
            .map((r) => r.affinity_probability_binary)
            .filter((v): v is number => v != null && !isNaN(v))

        return {
            total: results.length,
            successful: successful.length,
            failed: failed.length,
            avgAffinity: affinities.length > 0
                ? affinities.reduce((a, b) => a + b, 0) / affinities.length
                : undefined,
            minAffinity: affinities.length > 0 ? Math.min(...affinities) : undefined,
            maxAffinity: affinities.length > 0 ? Math.max(...affinities) : undefined,
            avgProbability: probabilities.length > 0
                ? probabilities.reduce((a, b) => a + b, 0) / probabilities.length
                : undefined,
            highBinders: probabilities.filter((p) => p >= 0.7).length,
        }
    }, [results])

    // Histogram Data Calculation
    const histogramData = useMemo(() => {
        const successful = results.filter((r) => r.success && r.affinity_pred_value != null)
        const data = successful.map(r => r.affinity_pred_value!).filter(v => !isNaN(v))

        if (data.length === 0) return []

        const min = Math.min(...data)
        const max = Math.max(...data)
        const binCount = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(data.length)))) // Sturges' rule-ish

        // Handle single value case
        if (Math.abs(max - min) < 0.001) {
            return [{ binStart: min - 0.5, binEnd: max + 0.5, count: data.length, rangeLabel: formatNumber(min, 2) }]
        }

        const step = (max - min) / binCount
        const bins = Array.from({ length: binCount }, (_, i) => ({
            binStart: min + i * step,
            binEnd: min + (i + 1) * step,
            count: 0,
            rangeLabel: `${formatNumber(min + i * step, 1)}-${formatNumber(min + (i + 1) * step, 1)}`
        }))

        data.forEach(v => {
            const binIndex = Math.min(Math.floor((v - min) / step), binCount - 1)
            bins[binIndex].count++
        })

        return bins
    }, [results])

    const maxHistogramCount = Math.max(...histogramData.map(d => d.count), 1)

    // Chart data for table/list view (sorted)
    const chartData = useMemo(() => {
        const successful = results.filter((r) => r.success && r.affinity_pred_value != null)
        return successful
            .map((r) => ({
                name: r.ligand_name,
                affinity: r.affinity_pred_value!,
                probability: r.affinity_probability_binary ?? 0,
            }))
            .sort((a, b) => a.affinity - b.affinity)
    }, [results])

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            // Default directions: affinity/energy ascending (lower = better), others descending
            setSortDirection(field === 'affinity_pred_value' || field === 'binding_free_energy' ? 'asc' : 'desc')
        }
    }

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
        }
        return sortDirection === 'asc'
            ? <ArrowUp className="h-3 w-3 ml-1" />
            : <ArrowDown className="h-3 w-3 ml-1" />
    }

    // Simple bar chart visualization
    const maxAffinity = Math.max(...chartData.map((d) => Math.abs(d.affinity)), 1)

    // Get successful results with structure data for visualization
    const visualizableResults = useMemo(() => {
        return sortedResults.filter(
            (r) => r.success && r.poses && r.poses.length > 0 && r.poses[0].structure_data
        )
    }, [sortedResults])

    // Helper to get camera state from viewer
    const getCameraState = (): any | null => {
        if (!viewerRef) return null
        const viewer = viewerRef as MolstarViewerHandle
        const plugin = viewer?.plugin
        if (plugin?.canvas3d?.camera) {
            try {
                return plugin.canvas3d.camera.getSnapshot()
            } catch (e) {
                console.warn('Failed to capture camera state:', e)
            }
        }
        return null
    }

    // Helper to restore camera state after structure load
    const restoreCameraState = (cameraState: any) => {
        if (!viewerRef || !cameraState) return
        const viewer = viewerRef as MolstarViewerHandle
        const plugin = viewer?.plugin
        if (plugin?.canvas3d?.camera) {
            // Small delay to ensure structure is loaded
            setTimeout(() => {
                try {
                    plugin.canvas3d.camera.setState(cameraState)
                    console.log('📸 Restored camera state for batch ligand comparison')
                } catch (e) {
                    console.warn('Failed to restore camera state:', e)
                }
            }, 100)
        }
    }

    // Load structure into viewer with camera preservation
    const loadStructureToViewer = (result: Boltz2BatchLigandResult, index: number, preserveCamera: boolean = false) => {
        if (!result.poses || result.poses.length === 0 || !result.poses[0].structure_data) return

        // Capture camera state before loading new structure (for ligand comparison)
        const savedCameraState = preserveCamera ? getCameraState() : null

        const pose = result.poses[0]
        const timestamp = Date.now()
        const structure: MolecularStructure = {
            structure_id: `batch_boltz2_${result.ligand_id}_${timestamp}`,
            filename: `${result.ligand_name}_pose.pdb`,
            format: 'pdb',
            pdb_data: pose.structure_data,
            atoms: [],
            bonds: [],
            residues: [],
            chains: [],
            metadata: {
                boltz2_affinity: result.affinity_pred_value,
                boltz2_probability: result.affinity_probability_binary,
                boltz2_confidence: result.confidence_score,
                ligand_name: result.ligand_name,
                ligand_id: result.ligand_id,
                is_batch_boltz2: true,
                is_boltz2_pose: true, // Mark as Boltz2 pose for proper rendering
                batch_id: batchId,
                preserve_camera: preserveCamera, // Signal to viewer to preserve camera
            } as any,
            ligands: {},
        }
        setCurrentStructure(structure)
        setSelectedVisualizationIndex(index)

        // Restore camera state after structure loads (for ligand comparison)
        if (savedCameraState) {
            restoreCameraState(savedCameraState)
        }
    }

    // Auto-visualize best binder when results complete
    useEffect(() => {
        if (!isRunning && visualizableResults.length > 0 && isFirstLoad) {
            // Find best binder (lowest affinity value)
            const bestBinder = visualizableResults.reduce((best, current) => {
                const bestAffinity = best.affinity_pred_value ?? Infinity
                const currentAffinity = current.affinity_pred_value ?? Infinity
                return currentAffinity < bestAffinity ? current : best
            })
            const bestIndex = visualizableResults.indexOf(bestBinder)
            if (bestIndex >= 0) {
                // First load - don't preserve camera, let it auto-fit
                loadStructureToViewer(bestBinder, bestIndex, false)
                setIsFirstLoad(false)
            }
        }
    }, [isRunning, visualizableResults.length, isFirstLoad])

    // Handle slider change - preserve camera for ligand comparison
    const handleVisualizationChange = (index: number) => {
        if (index >= 0 && index < visualizableResults.length) {
            // Preserve camera when switching ligands so protein stays aligned
            loadStructureToViewer(visualizableResults[index], index, true)
        }
    }

    return (
        <div className="space-y-4">
            {/* Progress Section */}
            {isRunning && (
                <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
                    <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        <span className="font-medium">Batch Screening in Progress</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                        <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-sm text-gray-400">
                        <span>{progressMessage || 'Processing ligands...'}</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                </div>
            )}

            {/* Visualization Slider */}
            {!isRunning && visualizableResults.length > 0 && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-5 w-5 text-purple-400" />
                        <h3 className="font-medium">Structure Visualization</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Viewing:</span>
                            <span className="font-medium text-purple-300">
                                {visualizableResults[selectedVisualizationIndex]?.ligand_name}
                            </span>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    max={visualizableResults.length - 1}
                                    value={selectedVisualizationIndex}
                                    onChange={(e) => handleVisualizationChange(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                                    style={{
                                        background: `linear-gradient(to right, rgb(168 85 247) 0%, rgb(168 85 247) ${(selectedVisualizationIndex / (visualizableResults.length - 1)) * 100}%, rgb(55 65 81) ${(selectedVisualizationIndex / (visualizableResults.length - 1)) * 100}%, rgb(55 65 81) 100%)`
                                    }}
                                />
                                <span className="text-sm text-gray-400 min-w-[4rem] text-right">
                                    {selectedVisualizationIndex + 1} / {visualizableResults.length}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                    <div className="text-gray-500">Affinity</div>
                                    <div className={getAffinityColor(visualizableResults[selectedVisualizationIndex]?.affinity_pred_value)}>
                                        {formatNumber(visualizableResults[selectedVisualizationIndex]?.affinity_pred_value, 2)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500">Probability</div>
                                    <div className={getProbabilityColor(visualizableResults[selectedVisualizationIndex]?.affinity_probability_binary)}>
                                        {formatNumber(visualizableResults[selectedVisualizationIndex]?.affinity_probability_binary, 2)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-500">Confidence</div>
                                    <div className={getConfidenceColor(visualizableResults[selectedVisualizationIndex]?.confidence_score)}>
                                        {formatNumber(visualizableResults[selectedVisualizationIndex]?.confidence_score, 2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                        <FlaskConical className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-400">Total</span>
                    </div>
                    <div className="text-2xl font-bold">{summary.total}</div>
                </div>

                <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-gray-400">Completed</span>
                    </div>
                    <div className="text-2xl font-bold text-green-500">{summary.successful}</div>
                </div>

                <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="text-sm text-gray-400">High Binders</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-500">{summary.highBinders}</div>
                    <div className="text-xs text-gray-500">P(bind) ≥ 0.7</div>
                </div>

                <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-4 w-4 text-primary" />
                        <span className="text-sm text-gray-400">Best Affinity</span>
                    </div>
                    <div className={`text-2xl font-bold ${getAffinityColor(summary.minAffinity)}`}>
                        {formatNumber(summary.minAffinity, 2)}
                    </div>
                    <div className="text-xs text-gray-500">log₁₀(IC₅₀)</div>
                </div>
            </div>

            {/* Affinity Chart */}
            {histogramData.length > 0 && (
                <div className="rounded-lg border border-gray-700 bg-gray-800/50">
                    <div className="p-4 border-b border-gray-700">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-primary" />
                                <h3 className="font-medium">Binding Affinity Distribution</h3>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedChart(!expandedChart)}
                            >
                                {expandedChart ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                            Distribution of predicted binding affinities (lower = stronger binding)
                        </p>
                    </div>

                    {/* SVG Histogram */}
                    <div className={`p-4 transition-all ${expandedChart ? 'h-[400px]' : 'h-[250px]'}`}>
                        <div className="h-full w-full flex flex-col">
                            <div className="flex-1 flex items-end gap-1 pb-6 px-2 relative border-b border-gray-700/50">
                                {/* Bars */}
                                {histogramData.map((bin, i) => {
                                    const heightPercent = (bin.count / maxHistogramCount) * 100;
                                    return (
                                        <div key={i} className="flex-1 h-full flex flex-col justify-end group relative">
                                            {/* Tooltip */}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                                <div className="bg-gray-900 text-white text-xs p-2 rounded border border-gray-700 shadow-lg whitespace-nowrap">
                                                    <div>Range: {bin.rangeLabel}</div>
                                                    <div>Count: {bin.count}</div>
                                                </div>
                                            </div>

                                            <div
                                                className="w-full bg-blue-500/60 hover:bg-blue-500/80 transition-all rounded-t relative group-hover:shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                                style={{ height: `${Math.max(heightPercent, 2)}%` }}
                                            >
                                                {bin.count > 0 && (
                                                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-gray-400">
                                                        {bin.count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* X-Axis Labels */}
                            <div className="flex justify-between pt-2 text-xs text-gray-500 px-2">
                                <span>{histogramData[0]?.rangeLabel.split('-')[0]}</span>
                                <span>{histogramData[histogramData.length - 1]?.rangeLabel.split('-')[1]}</span>
                            </div>
                            <div className="text-center text-xs text-gray-500 mt-1">
                                Predicted Affinity (log₁₀IC₅₀)
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Table */}
            <div className="rounded-lg border border-gray-700 bg-gray-800/50">
                <div className="p-4 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">Screening Results</h3>
                            <p className="text-sm text-gray-400">
                                Click on a row to view detailed results for that ligand
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onExportResults}
                            disabled={results.length === 0}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                    </div>
                </div>
                <div className="overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                    <table className="w-full">
                        <thead className="bg-gray-900 sticky top-0">
                            <tr>
                                <th className="p-2 text-left text-sm font-medium text-gray-400 w-8">#</th>
                                <th className="p-2 text-left">
                                    <button
                                        className="flex items-center text-sm font-medium text-gray-400 hover:text-white"
                                        onClick={() => handleSort('ligand_name')}
                                    >
                                        Ligand
                                        <SortIcon field="ligand_name" />
                                    </button>
                                </th>
                                <th className="p-2 text-right">
                                    <button
                                        className="flex items-center justify-end text-sm font-medium text-gray-400 hover:text-white w-full"
                                        onClick={() => handleSort('affinity_pred_value')}
                                    >
                                        Affinity
                                        <SortIcon field="affinity_pred_value" />
                                    </button>
                                </th>
                                <th className="p-2 text-right">
                                    <button
                                        className="flex items-center justify-end text-sm font-medium text-gray-400 hover:text-white w-full"
                                        onClick={() => handleSort('binding_free_energy')}
                                    >
                                        ΔG (kcal/mol)
                                        <SortIcon field="binding_free_energy" />
                                    </button>
                                </th>
                                <th className="p-2 text-right">
                                    <button
                                        className="flex items-center justify-end text-sm font-medium text-gray-400 hover:text-white w-full"
                                        onClick={() => handleSort('affinity_probability_binary')}
                                    >
                                        P(bind)
                                        <SortIcon field="affinity_probability_binary" />
                                    </button>
                                </th>
                                <th className="p-2 text-right">
                                    <button
                                        className="flex items-center justify-end text-sm font-medium text-gray-400 hover:text-white w-full"
                                        onClick={() => handleSort('confidence_score')}
                                    >
                                        Confidence
                                        <SortIcon field="confidence_score" />
                                    </button>
                                </th>
                                <th className="p-2 text-right">
                                    <button
                                        className="flex items-center justify-end text-sm font-medium text-gray-400 hover:text-white w-full"
                                        onClick={() => handleSort('complex_plddt')}
                                    >
                                        pLDDT
                                        <SortIcon field="complex_plddt" />
                                    </button>
                                </th>
                                <th className="p-2 w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedResults.map((result, idx) => (
                                <tr
                                    key={`${result.ligand_id}-${idx}`}
                                    className={`border-t border-gray-700 cursor-pointer hover:bg-gray-700/50 ${!result.success || result.affinity_pred_value == null ? 'bg-red-500/5' : ''
                                        }`}
                                    onClick={() => {
                                        if (result.success && result.affinity_pred_value != null) {
                                            const visIndex = visualizableResults.findIndex(r => r.ligand_id === result.ligand_id);
                                            if (visIndex !== -1) {
                                                loadStructureToViewer(result, visIndex, true);
                                            }
                                            onViewResult(result);
                                        }
                                    }}
                                >
                                    <td className="p-2 text-sm text-gray-500">{idx + 1}</td>
                                    <td className="p-2">
                                        <div className="flex items-center gap-2">
                                            {result.success && result.affinity_pred_value != null ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <div title={result.success ? "Prediction incomplete (missing affinity)" : "Prediction failed"}>
                                                    <AlertCircle className="h-3 w-3 text-red-500" />
                                                </div>
                                            )}
                                            <span className="font-medium truncate max-w-[150px]" title={result.ligand_name}>
                                                {result.ligand_name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className={`p-2 text-right font-mono text-sm ${getAffinityColor(result.affinity_pred_value)}`}>
                                        {result.success && result.affinity_pred_value != null ? formatNumber(result.affinity_pred_value, 2) : '-'}
                                    </td>
                                    <td className={`p-2 text-right font-mono text-sm ${getAffinityColor(result.binding_free_energy)}`}>
                                        {result.success && result.binding_free_energy != null ? formatNumber(result.binding_free_energy, 2) : '-'}
                                    </td>
                                    <td className={`p-2 text-right font-mono text-sm ${getProbabilityColor(result.affinity_probability_binary)}`}>
                                        {result.success && result.affinity_probability_binary !== undefined
                                            ? `${(result.affinity_probability_binary * 100).toFixed(0)}%`
                                            : '-'}
                                    </td>
                                    <td className={`p-2 text-right font-mono text-sm ${getConfidenceColor(result.confidence_score)}`}>
                                        {result.success && result.confidence_score != null ? formatNumber(result.confidence_score, 2) : '-'}
                                    </td>
                                    <td className={`p-2 text-right font-mono text-sm ${getConfidenceColor(result.complex_plddt)}`}>
                                        {result.success && result.complex_plddt != null ? formatNumber(result.complex_plddt, 2) : '-'}
                                    </td>
                                    <td className="p-2">
                                        {result.success && result.affinity_pred_value != null ? (
                                            <button
                                                className="p-1 hover:bg-gray-600 rounded"
                                                title="View details"
                                                onClick={(e: React.MouseEvent) => {
                                                    e.stopPropagation()
                                                    onViewResult(result)
                                                }}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <div title={result.error || 'Prediction failed or incomplete'}>
                                                <AlertCircle className="h-4 w-4 text-red-500" />
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {results.length === 0 && !isRunning && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">
                                        No results yet. Start a batch prediction to see results here.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Batch Info */}
            {batchId && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Batch ID: {batchId}</span>
                    {summary.successful > 0 && (
                        <span>
                            Avg. time per ligand: {(results.filter(r => r.processing_time).reduce((a, r) => a + (r.processing_time || 0), 0) / summary.successful / 60).toFixed(1)} min
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

export default BatchBoltz2Results
