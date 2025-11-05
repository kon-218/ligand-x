'use client'

import React from 'react'
import { OrbitalViewer } from '@/components/QC/OrbitalViewer'
import type { QCResults } from '@/types/qc'

interface QCTabVisualizationProps {
    activeResults: QCResults | null
    activeJobId: string | null
}

export function QCTabVisualization({
    activeResults,
    activeJobId,
}: QCTabVisualizationProps) {
    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-4">
            {activeResults && activeJobId ? (
                <div className="space-y-6">
                    {/* Orbital Viewer */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Molecular Orbitals</h3>
                        <OrbitalViewer jobId={activeJobId} />
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                        <p>Select a completed job to view visualizations</p>
                    </div>
                </div>
            )}
        </div>
    )
}
