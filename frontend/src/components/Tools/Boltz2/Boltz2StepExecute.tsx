'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AlertCircle, PlayCircle, Loader2 } from 'lucide-react'
import type { Boltz2PredictionParams, Boltz2AlignmentOptions } from '@/store/boltz2-store'

interface Boltz2StepExecuteProps {
  proteinSource: string | null
  ligandSource: string | null
  selectedLigand: string | null
  ligandSmiles: string
  predictionParams: Boltz2PredictionParams
  alignmentOptions: Boltz2AlignmentOptions
  isRunning: boolean
  progress: number
  progressMessage: string
  onExecute: () => void
}

export function Boltz2StepExecute({
  proteinSource,
  ligandSource,
  selectedLigand,
  ligandSmiles,
  predictionParams,
  alignmentOptions,
  isRunning,
  progress,
  progressMessage,
  onExecute,
}: Boltz2StepExecuteProps) {
  const getLigandDescription = () => {
    if (ligandSource === 'current' && selectedLigand) {
      return selectedLigand
    } else if (ligandSource === 'smiles' && ligandSmiles) {
      return ligandSmiles.length > 40 ? ligandSmiles.substring(0, 40) + '...' : ligandSmiles
    }
    return 'Not specified'
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Review and Execute</h3>
        <p className="text-sm text-gray-400 mb-4">
          Review your configuration and start the Boltz-2 prediction.
        </p>
      </div>

      {/* Configuration Summary */}
      <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <h4 className="font-medium text-sm text-gray-300">Configuration Summary</h4>
        
        <div className="space-y-3 text-sm">
          {/* Protein */}
          <div className="flex justify-between">
            <span className="text-gray-400">Protein Source:</span>
            <span className="font-mono text-gray-200">
              {proteinSource === 'current' ? 'Current Structure' : proteinSource || 'Not set'}
            </span>
          </div>

          {/* Ligand */}
          <div className="flex justify-between">
            <span className="text-gray-400">Ligand Source:</span>
            <span className="font-mono text-gray-200">
              {ligandSource === 'current' ? 'Existing Ligand' : ligandSource === 'smiles' ? 'SMILES' : 'Not set'}
            </span>
          </div>

          {ligandSource && (
            <div className="flex justify-between">
              <span className="text-gray-400">Ligand:</span>
              <span className="font-mono text-gray-200 truncate ml-2 max-w-xs">
                {getLigandDescription()}
              </span>
            </div>
          )}

          <div className="border-t border-gray-700 my-2" />

          {/* Parameters */}
          <div className="flex justify-between">
            <span className="text-gray-400">Number of Poses:</span>
            <span className="font-mono text-gray-200">{predictionParams.num_poses}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Confidence Threshold:</span>
            <span className="font-mono text-gray-200">
              {(predictionParams.confidence_threshold || 0.7).toFixed(2)}
            </span>
          </div>

          <div className="border-t border-gray-700 my-2" />

          {/* Alignment Options */}
          <div className="flex justify-between">
            <span className="text-gray-400">Pose Alignment:</span>
            <span className="font-mono text-gray-200">
              {alignmentOptions.use_alignment ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {alignmentOptions.use_alignment && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-400">Alignment Method:</span>
                <span className="font-mono text-gray-200">
                  {alignmentOptions.alignment_method === 'binding_site'
                    ? 'Binding Site'
                    : alignmentOptions.alignment_method === 'full_structure'
                    ? 'Full Structure'
                    : 'None'}
                </span>
              </div>

              {alignmentOptions.alignment_method === 'binding_site' && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Binding Site Radius:</span>
                  <span className="font-mono text-gray-200">
                    {alignmentOptions.binding_site_radius.toFixed(1)} Å
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Warning/Info Messages */}
      <div className="space-y-2">
        <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-1">Prediction may take several minutes</p>
              <p className="text-xs text-blue-400">
                Boltz-2 will generate {predictionParams.num_poses} binding poses and calculate affinity predictions.
                Processing time depends on system resources and number of poses.
              </p>
            </div>
          </div>
        </div>

        {alignmentOptions.use_alignment && (
          <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-purple-400 mt-0.5" />
              <div className="text-sm text-purple-300">
                <p className="text-xs">
                  Pose alignment will be performed using the {alignmentOptions.alignment_method} method to enable
                  better comparison and visualization.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress Section */}
      {isRunning && (
        <div className="space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Running Prediction...</span>
          </div>
          
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {progressMessage && (
            <p className="text-xs text-gray-400">{progressMessage}</p>
          )}
        </div>
      )}

      {/* Execute Button */}
      {!isRunning && (
        <Button
          onClick={onExecute}
          className="w-full bg-green-600 hover:bg-green-700"
          size="lg"
        >
          <PlayCircle className="h-5 w-5 mr-2" />
          Start Boltz-2 Prediction
        </Button>
      )}
    </div>
  )
}
