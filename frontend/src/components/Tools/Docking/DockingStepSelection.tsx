'use client'

import { Check, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { InfoBox } from '@/components/Tools/shared'
import type { LigandOption } from '@/types/docking'
import type { MolecularStructure } from '@/types/molecular'

interface DockingStepSelectionProps {
    proteinLoaded: boolean
    currentStructure: MolecularStructure | null
    selectedLigand: string
    availableLigands: LigandOption[]
    onLigandSelect: (ligandId: string) => void
}

export function DockingStepSelection({
    proteinLoaded,
    currentStructure,
    selectedLigand,
    availableLigands,
    onLigandSelect,
}: DockingStepSelectionProps) {
    return (
        <div className="space-y-6">
            {/* No Protein Warning */}
            {!proteinLoaded && (
                <InfoBox variant="warning" title="No Structure Loaded">
                    Please load a protein structure first using the Input tool.
                </InfoBox>
            )}

            {/* Protein Status */}
            <div className="space-y-2">
                <Label className="text-gray-300">Protein (Receptor)</Label>
                <div className={`p-3 rounded-lg border ${
                    proteinLoaded 
                        ? 'bg-gray-800 border-gray-700' 
                        : 'bg-gray-800/50 border-gray-700/50'
                }`}>
                    <div className="flex items-center gap-2">
                        {proteinLoaded ? (
                            <>
                                <div className="p-1 rounded-full bg-indigo-500/20">
                                    <Check className="w-4 h-4 text-indigo-400" />
                                </div>
                                <span className="text-gray-300">
                                    {currentStructure?.structure_id || 'Structure loaded'}
                                </span>
                            </>
                        ) : (
                            <>
                                <div className="p-1 rounded-full bg-yellow-500/20">
                                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                                </div>
                                <span className="text-gray-400">No protein structure loaded</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Ligand Selector */}
            <div className="space-y-2">
                <Label className="text-gray-300">Ligand for Docking</Label>
                <select
                    value={selectedLigand}
                    onChange={(e) => onLigandSelect(e.target.value)}
                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                    <option value="">Select ligand...</option>
                    {availableLigands.map((ligand) => (
                        <option key={ligand.id} value={ligand.id}>
                            {ligand.name}
                        </option>
                    ))}
                </select>
                {availableLigands.length === 0 && proteinLoaded && (
                    <InfoBox variant="warning" title="No Ligands Available">
                        No ligands detected in the loaded structure. Please load a structure with ligands or add molecules to the library.
                    </InfoBox>
                )}
            </div>
        </div>
    )
}
