'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Beaker, Pill, Activity, Droplets, Zap, Skull, Library as LibraryIcon } from 'lucide-react'
import type { ADMETResult } from '@/types/molecular'
import type { MoleculeOption } from '@/types/admet'
import { parseValueUnit } from './utils'
import { LoadingOverlay } from '@/components/ui/LoadingOverlay'

interface ADMETTabPredictProps {
    selectedMolecule: string
    onMoleculeSelect: (id: string) => void
    availableMolecules: MoleculeOption[]
    onRefreshMolecules: () => void
    isRunning: boolean
    onRunPrediction: () => void
    error: string | null
    results: ADMETResult | null
}

export function ADMETTabPredict({
    selectedMolecule,
    onMoleculeSelect,
    availableMolecules,
    onRefreshMolecules,
    isRunning,
    onRunPrediction,
    error,
    results,
}: ADMETTabPredictProps) {
    return (
        <div className="space-y-6 relative">
            {/* Molecule Selection */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label htmlFor="admet-molecule-selector" className="text-sm font-medium text-gray-300">
                        Select Molecule
                    </Label>
                    <Button
                        onClick={onRefreshMolecules}
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-gray-400 hover:text-gray-300"
                    >
                        <LibraryIcon className="h-3.5 w-3.5 mr-1" />
                        Refresh
                    </Button>
                </div>
                <select
                    id="admet-molecule-selector"
                    value={selectedMolecule}
                    onChange={(e) => onMoleculeSelect(e.target.value)}
                    disabled={availableMolecules.length === 0 || isRunning}
                    className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    <option value="">Choose a molecule...</option>

                    {/* Group by source */}
                    {availableMolecules.filter(m => m.source === 'structure').length > 0 && (
                        <optgroup label="From Current Structure">
                            {availableMolecules
                                .filter(m => m.source === 'structure')
                                .map((molecule) => (
                                    <option key={molecule.id} value={molecule.id}>
                                        {molecule.name}
                                    </option>
                                ))}
                        </optgroup>
                    )}

                    {availableMolecules.filter(m => m.source === 'library').length > 0 && (
                        <optgroup label="From Library">
                            {availableMolecules
                                .filter(m => m.source === 'library')
                                .map((molecule) => (
                                    <option key={molecule.id} value={molecule.id}>
                                        {molecule.name}
                                    </option>
                                ))}
                        </optgroup>
                    )}
                </select>
                {availableMolecules.length === 0 && (
                    <Alert className="bg-gray-800/50 border-gray-700">
                        <AlertCircle className="h-4 w-4 text-gray-400" />
                        <AlertDescription className="text-xs text-gray-400">
                            No molecules found. Load a structure with ligands or save molecules to your library.
                        </AlertDescription>
                    </Alert>
                )}
            </div>
            {/* Run Button */}
            <Button
                onClick={onRunPrediction}
                disabled={!selectedMolecule || isRunning}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isRunning ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing Properties...
                    </>
                ) : (
                    <>
                        <Beaker className="mr-2 h-4 w-4" />
                        Run ADMET Prediction
                    </>
                )}
            </Button>

            {/* Error Message */}
            {error && (
                <Alert variant="destructive" className="border-red-900/50 bg-red-950/50">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
            )}

            {/* Results */}
            {results && (
                <div className="flex-1 space-y-5">
                    <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10 pb-3 border-b border-gray-700/50">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-purple-500/20 rounded">
                                <Beaker className="h-4 w-4 text-purple-400" />
                            </div>
                            <h3 className="text-base font-semibold text-white">Prediction Results</h3>
                        </div>
                    </div>

                    {/* Absorption */}
                    {results.Absorption && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg">
                                    <Pill className="h-4 w-4 text-green-400" />
                                </div>
                                <h4 className="text-sm font-semibold text-green-400">Absorption</h4>
                            </div>
                            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
                                {Object.entries(results.Absorption).map(([key, value]) => {
                                    const { value: displayValue, unit } = parseValueUnit(value)
                                    return (
                                        <div key={key} className="flex justify-between items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                                            <span className="text-sm text-gray-300 font-medium leading-relaxed">{key}</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm text-white font-semibold">{displayValue}</span>
                                                {unit && <span className="text-xs text-gray-500 mt-0.5">{unit}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Distribution */}
                    {results.Distribution && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
                                    <Droplets className="h-4 w-4 text-blue-400" />
                                </div>
                                <h4 className="text-sm font-semibold text-blue-400">Distribution</h4>
                            </div>
                            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
                                {Object.entries(results.Distribution).map(([key, value]) => {
                                    const { value: displayValue, unit } = parseValueUnit(value)
                                    return (
                                        <div key={key} className="flex justify-between items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                                            <span className="text-sm text-gray-300 font-medium leading-relaxed">{key}</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm text-white font-semibold">{displayValue}</span>
                                                {unit && <span className="text-xs text-gray-500 mt-0.5">{unit}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Metabolism */}
                    {results.Metabolism && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
                                    <Activity className="h-4 w-4 text-purple-400" />
                                </div>
                                <h4 className="text-sm font-semibold text-purple-400">Metabolism</h4>
                            </div>
                            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
                                {Object.entries(results.Metabolism).map(([key, value]) => {
                                    const { value: displayValue, unit } = parseValueUnit(value)
                                    return (
                                        <div key={key} className="flex justify-between items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                                            <span className="text-sm text-gray-300 font-medium leading-relaxed">{key}</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm text-white font-semibold">{displayValue}</span>
                                                {unit && <span className="text-xs text-gray-500 mt-0.5">{unit}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Excretion */}
                    {results.Excretion && Object.keys(results.Excretion).length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-lg">
                                    <Zap className="h-4 w-4 text-cyan-400" />
                                </div>
                                <h4 className="text-sm font-semibold text-cyan-400">Excretion</h4>
                            </div>
                            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
                                {Object.entries(results.Excretion).map(([key, value]) => {
                                    const { value: displayValue, unit } = parseValueUnit(value)
                                    return (
                                        <div key={key} className="flex justify-between items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                                            <span className="text-sm text-gray-300 font-medium leading-relaxed">{key}</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm text-white font-semibold">{displayValue}</span>
                                                {unit && <span className="text-xs text-gray-500 mt-0.5">{unit}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Toxicity */}
                    {results.Toxicity && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-lg">
                                    <Skull className="h-4 w-4 text-red-400" />
                                </div>
                                <h4 className="text-sm font-semibold text-red-400">Toxicity</h4>
                            </div>
                            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl p-4 space-y-3">
                                {Object.entries(results.Toxicity).map(([key, value]) => {
                                    const { value: displayValue, unit } = parseValueUnit(value)
                                    return (
                                        <div key={key} className="flex justify-between items-start gap-3 py-2 border-b border-gray-700/30 last:border-0">
                                            <span className="text-sm text-gray-300 font-medium leading-relaxed">{key}</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm text-white font-semibold">{displayValue}</span>
                                                {unit && <span className="text-xs text-gray-500 mt-0.5">{unit}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Loading Overlay */}
            <LoadingOverlay
                isLoading={isRunning}
                message="Predicting Properties..."
                description="Running ADMET analysis on selected molecule."
            />
        </div>
    )
}
