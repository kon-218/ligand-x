'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Circle } from 'lucide-react'
import type { GridBox, DockingParams } from '@/types/docking'

interface DockingStepGridBoxProps {
    gridBox: GridBox | null
    showManualGrid: boolean
    previewGridBox: boolean
    dockingParams: DockingParams
    onAutoCalculate: () => void
    onCalculateWholeProtein: () => void
    onShowManualGrid: () => void
    onGridBoxChange: (gridBox: GridBox) => void
    onPreviewToggle: (preview: boolean) => void
}

export function DockingStepGridBox({
    gridBox,
    showManualGrid,
    previewGridBox,
    dockingParams,
    onAutoCalculate,
    onCalculateWholeProtein,
    onShowManualGrid,
    onGridBoxChange,
    onPreviewToggle,
}: DockingStepGridBoxProps) {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-indigo-400">Step 3: Grid Box Configuration</h3>

            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <Button onClick={onAutoCalculate} className="w-full" variant="default">
                        Auto-Calculate (Ligand)
                    </Button>
                    <Button onClick={onCalculateWholeProtein} className="w-full" variant="secondary">
                        Whole Protein Box
                    </Button>
                </div>
                <Button onClick={onShowManualGrid} className="w-full" variant="outline">
                    Manual Grid Box
                </Button>
            </div>

            {/* Grid Box Parameters */}
            {showManualGrid && gridBox && (
                <div className="space-y-3 mt-4 p-4 border border-gray-700 rounded-lg">
                    <div>
                        <Label className="text-sm font-medium text-gray-300">Center (Å)</Label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <Input
                                type="number"
                                placeholder="X"
                                value={gridBox.center_x}
                                onChange={(e) =>
                                    onGridBoxChange({ ...gridBox, center_x: parseFloat(e.target.value) })
                                }
                                step="0.1"
                            />
                            <Input
                                type="number"
                                placeholder="Y"
                                value={gridBox.center_y}
                                onChange={(e) =>
                                    onGridBoxChange({ ...gridBox, center_y: parseFloat(e.target.value) })
                                }
                                step="0.1"
                            />
                            <Input
                                type="number"
                                placeholder="Z"
                                value={gridBox.center_z}
                                onChange={(e) =>
                                    onGridBoxChange({ ...gridBox, center_z: parseFloat(e.target.value) })
                                }
                                step="0.1"
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="text-sm font-medium text-gray-300">Size (Å)</Label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <Input
                                type="number"
                                placeholder="X"
                                value={gridBox.size_x}
                                onChange={(e) =>
                                    onGridBoxChange({ ...gridBox, size_x: parseFloat(e.target.value) })
                                }
                                step="0.1"
                            />
                            <Input
                                type="number"
                                placeholder="Y"
                                value={gridBox.size_y}
                                onChange={(e) =>
                                    onGridBoxChange({ ...gridBox, size_y: parseFloat(e.target.value) })
                                }
                                step="0.1"
                            />
                            <Input
                                type="number"
                                placeholder="Z"
                                value={gridBox.size_z}
                                onChange={(e) =>
                                    onGridBoxChange({ ...gridBox, size_z: parseFloat(e.target.value) })
                                }
                                step="0.1"
                            />
                        </div>
                    </div>

                    {/* Preview Toggle */}
                    <div className="flex items-center justify-between pt-2">
                        <Label htmlFor="preview-grid-box" className="text-sm font-medium text-gray-300">
                            Preview Grid Box
                        </Label>
                        <button
                            id="preview-grid-box"
                            onClick={() => onPreviewToggle(!previewGridBox)}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 border ${previewGridBox
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
                                }`}
                        >
                            {previewGridBox ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
