'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { StructureOption } from '@/types/abfe-types'
import type { MolecularStructure } from '@/types/molecular'

interface ABFEStepSelectionProps {
    selectedProtein: string | null
    selectedLigand: string | null
    availableProteins: StructureOption[]
    availableLigands: StructureOption[]
    currentStructure: MolecularStructure | null
    onProteinSelect: (proteinId: string | null) => void
    onLigandSelect: (ligandId: string | null) => void
    onRefresh: () => void
}

export function ABFEStepSelection({
    selectedProtein,
    selectedLigand,
    availableProteins,
    availableLigands,
    currentStructure,
    onProteinSelect,
    onLigandSelect,
    onRefresh,
}: ABFEStepSelectionProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Step 1: Structure Selection</h3>
                <Button onClick={onRefresh} size="sm" variant="outline" className="bg-gray-700 hover:bg-gray-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </Button>
            </div>

            {/* Protein Selection */}
            <div>
                <Label className="mb-2 block">Protein Structure</Label>
                {currentStructure ? (
                    <div className="p-3 bg-gray-800 rounded border border-gray-700">
                        <div className="flex items-center">
                            <svg className="w-5 h-5 text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            <span className="text-gray-300">Auto-detected from current structure</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {currentStructure.structure_id || 'Loaded structure'}
                        </p>
                    </div>
                ) : (
                    <div className="p-3 bg-gray-800 rounded border border-gray-700 text-gray-400">
                        No protein structure loaded. Please load a structure first.
                    </div>
                )}
            </div>

            {/* Ligand Selection */}
            <div>
                <Label className="mb-2 block">Ligand Selection</Label>
                <select
                    value={selectedLigand || ''}
                    onChange={(e) => onLigandSelect(e.target.value || null)}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                    <option value="">Select ligand...</option>
                    {availableLigands.map((ligand) => (
                        <option key={ligand.id} value={ligand.id}>
                            {ligand.name} ({ligand.type})
                        </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                    Choose from extracted ligands, edited molecules, or docked poses
                </p>
            </div>

            {/* Info Box */}
            <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-gray-300">
                        <p className="font-semibold mb-1">About ABFE Calculations</p>
                        <p className="text-gray-400">
                            Absolute Binding Free Energy (ABFE) calculations compute the binding affinity between a protein and ligand.
                            This is a computationally intensive process that can take several hours to days depending on settings.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
