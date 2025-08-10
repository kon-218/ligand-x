'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DockingParams } from '@/types/docking'

interface DockingStepParametersProps {
    dockingParams: DockingParams
    onParamsChange: (params: DockingParams) => void
}

export function DockingStepParameters({
    dockingParams,
    onParamsChange,
}: DockingStepParametersProps) {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-indigo-400">Step 2: Docking Parameters</h3>

            <div className="grid grid-cols-2 gap-4">
                {/* Grid Padding */}
                <div>
                    <Label>Grid Padding (Å):</Label>
                    <Input
                        type="number"
                        value={dockingParams.gridPadding}
                        onChange={(e) =>
                            onParamsChange({ ...dockingParams, gridPadding: parseFloat(e.target.value) })
                        }
                        step="0.5"
                        min="1"
                        max="15"
                        className="mt-2"
                    />
                </div>

                {/* Exhaustiveness */}
                <div>
                    <Label>Exhaustiveness:</Label>
                    <Input
                        type="number"
                        value={dockingParams.exhaustiveness}
                        onChange={(e) =>
                            onParamsChange({ ...dockingParams, exhaustiveness: parseInt(e.target.value) })
                        }
                        min="1"
                        max="32"
                        className="mt-2"
                    />
                </div>

                {/* Scoring Function */}
                <div>
                    <Label>Scoring Function:</Label>
                    <select
                        value={dockingParams.scoringFunction}
                        onChange={(e) =>
                            onParamsChange({
                                ...dockingParams,
                                scoringFunction: e.target.value as 'vina' | 'ad4' | 'vinardo',
                            })
                        }
                        className="mt-2 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                        <option value="vina">Vina</option>
                        <option value="ad4">AutoDock4</option>
                        <option value="vinardo">Vinardo</option>
                    </select>
                </div>

                {/* Number of Poses */}
                <div>
                    <Label>Number of Poses:</Label>
                    <Input
                        type="number"
                        value={dockingParams.numPoses}
                        onChange={(e) =>
                            onParamsChange({ ...dockingParams, numPoses: parseInt(e.target.value) })
                        }
                        min="1"
                        max="20"
                        className="mt-2"
                    />
                    <p className="text-xs text-gray-400 mt-1">Poses to explore during docking (1-20)</p>
                </div>

                {/* Max Poses Returned */}
                <div>
                    <Label>Max Poses Returned:</Label>
                    <Input
                        type="number"
                        value={dockingParams.maxPosesReturned}
                        onChange={(e) =>
                            onParamsChange({ ...dockingParams, maxPosesReturned: parseInt(e.target.value) })
                        }
                        min="1"
                        max="20"
                        className="mt-2"
                    />
                    <p className="text-xs text-gray-400 mt-1">Maximum poses to keep in results (1-20)</p>
                </div>

                {/* Energy Range */}
                <div>
                    <Label>Energy Range (kcal/mol):</Label>
                    <Input
                        type="number"
                        value={dockingParams.energyRange}
                        onChange={(e) =>
                            onParamsChange({ ...dockingParams, energyRange: parseFloat(e.target.value) })
                        }
                        step="0.5"
                        min="1"
                        max="500"
                        className="mt-2"
                    />
                </div>
            </div>

            {/* Use Vina API Toggle */}
            <div className="flex items-center space-x-2 pt-2">
                <input
                    type="checkbox"
                    id="use-vina-api"
                    checked={dockingParams.useVinaApi}
                    onChange={(e) =>
                        onParamsChange({ ...dockingParams, useVinaApi: e.target.checked })
                    }
                    className="w-4 h-4"
                />
                <Label htmlFor="use-vina-api" className="cursor-pointer">
                    Use Vina Python API (recommended)
                </Label>
            </div>
        </div>
    )
}
