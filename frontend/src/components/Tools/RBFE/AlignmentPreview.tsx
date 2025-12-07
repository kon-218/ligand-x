'use client'

import React from 'react'
import { Check, X, AlertTriangle, Play, Loader2 } from 'lucide-react'
import type { AlignmentInfo, DockedPoseInfo } from '@/types/rbfe-types'

interface AlignmentPreviewProps {
  alignmentInfo: AlignmentInfo
  dockedPoses?: DockedPoseInfo[]
  referenceLigand?: string
  jobDir?: string
  onContinue: () => void
  onCancel: () => void
  isLoading?: boolean
}

export function AlignmentPreview({
  alignmentInfo,
  dockedPoses,
  onContinue,
  onCancel,
  isLoading = false,
}: AlignmentPreviewProps) {
  const alignedCount = alignmentInfo.aligned_ligands.filter(l => !l.is_reference).length
  const failedCount = alignmentInfo.failed_ligands.length

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Alignment Preview</h3>
          <p className="text-sm text-gray-400">
            Review aligned ligand poses before continuing with RBFE calculation
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded">
            {alignedCount + 1} aligned
          </span>
          {failedCount > 0 && (
            <span className="px-2 py-1 bg-red-600/20 text-red-400 rounded">
              {failedCount} failed
            </span>
          )}
        </div>
      </div>

      {/* Reference Ligand */}
      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-blue-300">
              {alignmentInfo.reference_ligand}
            </span>
            <span className="ml-2 text-xs px-2 py-0.5 bg-blue-600/30 text-blue-300 rounded">
              Reference
            </span>
          </div>
          <span className="text-xs text-gray-400">
            Binding mode template
          </span>
        </div>
      </div>

      {/* Aligned Ligands */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Aligned Ligands</h4>
        {alignmentInfo.aligned_ligands
          .filter(l => !l.is_reference)
          .map((ligand) => {
            const pose = dockedPoses?.find(p => p.ligand_id === ligand.id)
            
            return (
              <div
                key={ligand.id}
                className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-2 p-3">
                  <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-white">{ligand.id}</span>
                    {ligand.rmsd !== undefined && (
                      <span className="ml-2 text-xs text-gray-400">
                        RMSD: {ligand.rmsd.toFixed(2)} Å
                      </span>
                    )}
                  </div>
                  {pose && (
                    <span className="text-xs text-gray-500">
                      Affinity: {pose.affinity_kcal_mol?.toFixed(2) || 'N/A'} kcal/mol
                    </span>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      {/* Failed Ligands */}
      {failedCount > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Failed Alignments ({failedCount})
          </h4>
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 space-y-2">
            {alignmentInfo.failed_ligands.map((ligand) => (
              <div key={ligand.id} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
                  <X className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <span className="font-medium text-red-300">{ligand.id}</span>
                  <p className="text-xs text-red-400/80">{ligand.error}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-red-400/60 mt-2">
              These ligands will be excluded from the RBFE calculation.
            </p>
          </div>
        </div>
      )}

      {/* Alignment Method Info */}
      <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-2">
        <strong>Method:</strong> {alignmentInfo.alignment_method === 'mcs_template' 
          ? 'Maximum Common Substructure (MCS) template-based alignment'
          : alignmentInfo.alignment_method}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          onClick={onContinue}
          disabled={isLoading || alignedCount < 1}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Continuing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Continue with {alignedCount + 1} Ligands
            </>
          )}
        </button>
      </div>

      {/* Warning if not enough ligands */}
      {alignedCount < 1 && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 text-sm text-yellow-400">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          At least 2 ligands are required for RBFE. Please check alignment failures.
        </div>
      )}
    </div>
  )
}

export default AlignmentPreview
