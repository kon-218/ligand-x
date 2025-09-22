'use client'

import { Button } from '@/components/ui/button'
import type { LigandInput, MDParameters } from '@/types/md-types'

interface MDStepExecuteProps {
  selectedProtein: string | null
  ligandInput: LigandInput
  parameters: MDParameters
  isRunning: boolean
  progress: number
  progressMessage: string
  onExecute: () => void
}

export function MDStepExecute({
  selectedProtein,
  ligandInput,
  parameters,
  isRunning,
  progress,
  progressMessage,
  onExecute,
}: MDStepExecuteProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Step 3: Execute MD Optimization</h3>

      {!isRunning ? (
        <div>
          <div className="mb-6 text-center">
            <h5 className="text-base font-medium text-gray-300 mb-2">Ready to Start MD Optimization</h5>
            <p className="text-sm text-gray-400">This will prepare your complex and run equilibration simulation</p>
          </div>

          {/* Execution Summary */}
          <div className="p-4 bg-gray-800 rounded border border-gray-700 mb-6">
            <h6 className="text-sm font-semibold text-blue-400 mb-3">Execution Plan:</h6>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-start">
                <span className="text-green-400 mr-2">[DONE]</span>
                <span>Protein structure: {selectedProtein || 'Current structure'}</span>
              </div>
              <div className="flex items-start">
                <span className="text-green-400 mr-2">[DONE]</span>
                <span>Ligand input: {ligandInput.method}</span>
              </div>
              <div className="flex items-start">
                <span className="text-green-400 mr-2">[DONE]</span>
                <span>
                  {parameters.minimization_only
                    ? 'Minimization Only (No equilibration)'
                    : `Simulation: ${parameters.simulation_length} (${parameters.temperature}K, ${parameters.pressure} bar)`
                  }
                </span>
              </div>
              <div className="flex items-start">
                <span className="text-green-400 mr-2">[DONE]</span>
                <span>
                  Preview pause:{' '}
                  {parameters.preview_before_equilibration ? 'System preview before equilibration' : 'Run full workflow'}
                </span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Button onClick={onExecute} className="bg-green-600 hover:bg-green-500 px-8">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
              Start MD Optimization
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <span className="ml-4 text-gray-300">Running MD optimization...</span>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">{progressMessage}</p>
          </div>
        </div>
      )}
    </div>
  )
}
