'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Beaker, Pill, Activity, Droplets, Zap, Skull, Library as LibraryIcon, History, Trash2 } from 'lucide-react'
import type { ADMETResult } from '@/types/molecular'
import type { StoredADMETResult } from '@/types/admet'
import { parseValueUnit } from './utils'

interface ADMETTabHistoryProps {
    storedResults: StoredADMETResult[]
    loadingHistory: boolean
    onRefreshHistory: () => void
    expandedResults: { [key: number]: ADMETResult | null }
    loadingResult: number | null
    onToggleExpand: (resultId: number, smiles: string) => void
    onDeleteResult: (resultId: number, name: string) => void
}

export function ADMETTabHistory({
    storedResults,
    loadingHistory,
    onRefreshHistory,
    expandedResults,
    loadingResult,
    onToggleExpand,
    onDeleteResult,
}: ADMETTabHistoryProps) {
    return (
        <div className="flex-1 overflow-y-auto space-y-4">
            {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                </div>
            ) : storedResults.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center space-y-3">
                        <div className="p-4 bg-gray-800/50 rounded-full w-fit mx-auto">
                            <History className="h-8 w-8 text-gray-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-300">No stored results yet</p>
                            <p className="text-xs text-gray-500 mt-1">Run predictions to build your history</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">
                            {storedResults.length} stored result{storedResults.length !== 1 ? 's' : ''}
                        </p>
                        <Button
                            onClick={onRefreshHistory}
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-gray-400 hover:text-gray-300"
                        >
                            <LibraryIcon className="h-3.5 w-3.5 mr-1" />
                            Refresh
                        </Button>
                    </div>

                    {storedResults.map((result) => {
                        const isExpanded = expandedResults[result.id] !== undefined
                        const resultData = expandedResults[result.id]
                        const isLoading = loadingResult === result.id

                        return (
                            <div
                                key={result.id}
                                className="bg-gradient-to-br from-gray-800/70 to-gray-800/40 border border-gray-700/60 rounded-xl overflow-hidden hover:border-purple-500/40 transition-all"
                            >
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-white mb-1 truncate">
                                                {result.molecule_name}
                                            </h4>
                                            <p className="text-xs text-gray-400 font-mono truncate mb-2">
                                                {result.smiles}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(result.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={() => onToggleExpand(result.id, result.smiles)}
                                                size="sm"
                                                disabled={isLoading}
                                                className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8"
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                                ) : (
                                                    <Beaker className="h-3.5 w-3.5 mr-1" />
                                                )}
                                                {isExpanded ? 'Collapse' : 'Expand'}
                                            </Button>
                                            <Button
                                                onClick={() => onDeleteResult(result.id, result.molecule_name)}
                                                size="sm"
                                                variant="outline"
                                                className="px-3 bg-gray-800/80 border-gray-600 hover:bg-red-900/60 hover:border-red-600 text-gray-300 hover:text-red-400 h-8"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Results */}
                                {isExpanded && resultData && (
                                    <div className="border-t border-gray-700/50 bg-gray-900/40 p-4 space-y-4">
                                        {/* Physicochemical Properties */}
                                        {resultData.Physicochemical && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 bg-blue-500/20 rounded">
                                                        <Beaker className="h-3.5 w-3.5 text-blue-400" />
                                                    </div>
                                                    <h5 className="text-xs font-semibold text-blue-400">Physicochemical</h5>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                                    {Object.entries(resultData.Physicochemical).map(([key, value]) => {
                                                        const { value: displayValue, unit } = parseValueUnit(value)
                                                        return (
                                                            <div key={key} className="flex justify-between items-start gap-2 text-xs">
                                                                <span className="text-gray-400">{key}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-white font-medium">{displayValue}</span>
                                                                    {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Absorption */}
                                        {resultData.Absorption && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 bg-green-500/20 rounded">
                                                        <Pill className="h-3.5 w-3.5 text-green-400" />
                                                    </div>
                                                    <h5 className="text-xs font-semibold text-green-400">Absorption</h5>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                                    {Object.entries(resultData.Absorption).map(([key, value]) => {
                                                        const { value: displayValue, unit } = parseValueUnit(value)
                                                        return (
                                                            <div key={key} className="flex justify-between items-start gap-2 text-xs">
                                                                <span className="text-gray-400">{key}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-white font-medium">{displayValue}</span>
                                                                    {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Distribution */}
                                        {resultData.Distribution && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 bg-blue-500/20 rounded">
                                                        <Droplets className="h-3.5 w-3.5 text-blue-400" />
                                                    </div>
                                                    <h5 className="text-xs font-semibold text-blue-400">Distribution</h5>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                                    {Object.entries(resultData.Distribution).map(([key, value]) => {
                                                        const { value: displayValue, unit } = parseValueUnit(value)
                                                        return (
                                                            <div key={key} className="flex justify-between items-start gap-2 text-xs">
                                                                <span className="text-gray-400">{key}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-white font-medium">{displayValue}</span>
                                                                    {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Metabolism */}
                                        {resultData.Metabolism && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 bg-purple-500/20 rounded">
                                                        <Activity className="h-3.5 w-3.5 text-purple-400" />
                                                    </div>
                                                    <h5 className="text-xs font-semibold text-purple-400">Metabolism</h5>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                                    {Object.entries(resultData.Metabolism).map(([key, value]) => {
                                                        const { value: displayValue, unit } = parseValueUnit(value)
                                                        return (
                                                            <div key={key} className="flex justify-between items-start gap-2 text-xs">
                                                                <span className="text-gray-400">{key}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-white font-medium">{displayValue}</span>
                                                                    {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Excretion */}
                                        {resultData.Excretion && Object.keys(resultData.Excretion).length > 0 && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 bg-cyan-500/20 rounded">
                                                        <Zap className="h-3.5 w-3.5 text-cyan-400" />
                                                    </div>
                                                    <h5 className="text-xs font-semibold text-cyan-400">Excretion</h5>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                                    {Object.entries(resultData.Excretion).map(([key, value]) => {
                                                        const { value: displayValue, unit } = parseValueUnit(value)
                                                        return (
                                                            <div key={key} className="flex justify-between items-start gap-2 text-xs">
                                                                <span className="text-gray-400">{key}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-white font-medium">{displayValue}</span>
                                                                    {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Toxicity */}
                                        {resultData.Toxicity && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1 bg-red-500/20 rounded">
                                                        <Skull className="h-3.5 w-3.5 text-red-400" />
                                                    </div>
                                                    <h5 className="text-xs font-semibold text-red-400">Toxicity</h5>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                                                    {Object.entries(resultData.Toxicity).map(([key, value]) => {
                                                        const { value: displayValue, unit } = parseValueUnit(value)
                                                        return (
                                                            <div key={key} className="flex justify-between items-start gap-2 text-xs">
                                                                <span className="text-gray-400">{key}</span>
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-white font-medium">{displayValue}</span>
                                                                    {unit && <span className="text-gray-500 text-[10px]">{unit}</span>}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </>
            )}
        </div>
    )
}
