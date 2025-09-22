'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { MDParameters, SimulationLength } from '@/types/md-types'

interface MDStepParametersProps {
  parameters: MDParameters
  onSimulationLengthChange: (length: SimulationLength) => void
  onCustomStepsChange: (nvt: number, npt: number) => void
  onTemperatureChange: (temp: number) => void
  onPressureChange: (pressure: number) => void
  onIonicStrengthChange: (strength: number) => void
  onPreviewToggle: (enabled: boolean) => void
  onPauseAtMinimizedToggle: (enabled: boolean) => void
  onMinimizationOnlyToggle: (enabled: boolean) => void
}

export function MDStepParameters({
  parameters,
  onSimulationLengthChange,
  onCustomStepsChange,
  onTemperatureChange,
  onPressureChange,
  onIonicStrengthChange,
  onPreviewToggle,
  onPauseAtMinimizedToggle,
  onMinimizationOnlyToggle,
}: MDStepParametersProps) {
  // Determine current mode based on minimization_only flag
  const mode = parameters.minimization_only ? 'minimization' : 'equilibration'

  const setMode = (newMode: 'minimization' | 'equilibration') => {
    if (newMode === 'minimization') {
      onMinimizationOnlyToggle(true)
      onPauseAtMinimizedToggle(false) // Disable pause at minimized since it stops there anyway
    } else {
      onMinimizationOnlyToggle(false)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Step 2: MD Parameters</h3>

      {/* Mode Selection Tabs */}
      <div className="flex p-1 bg-gray-800 rounded-lg mb-6">
        <button
          onClick={() => setMode('minimization')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${mode === 'minimization'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }`}
        >
          Minimization Only
        </button>
        <button
          onClick={() => setMode('equilibration')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${mode === 'equilibration'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }`}
        >
          Full Equilibration
        </button>
      </div>

      {/* Common Settings (Always visible) */}
      <div className="space-y-4">
        {/* System Prep Preview */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-gray-700/50">
          <div>
            <Label className="text-sm text-gray-200">Preview System</Label>
            <p className="text-xs text-gray-400">
              Inspect solvated complex before starting
            </p>
          </div>
          <Switch
            checked={!!parameters.preview_before_equilibration}
            onCheckedChange={onPreviewToggle}
          />
        </div>

        {/* Ionic Strength (Relevant for solvation in both modes) */}
        <div>
          <Label className="mb-2 block">Ionic Strength (M)</Label>
          <Input
            type="number"
            value={parameters.ionic_strength}
            onChange={(e) => onIonicStrengthChange(parseFloat(e.target.value))}
            min={0.0}
            max={1.0}
            step={0.01}
            className="bg-gray-700 border-gray-600"
          />
          <p className="text-xs text-gray-400 mt-1">Salt concentration (0.15 M = physiological)</p>
        </div>
      </div>

      {/* Equilibration Specific Settings */}
      {mode === 'equilibration' && (
        <div className="space-y-6 pt-4 border-t border-gray-700">
          <h4 className="text-sm font-medium text-blue-400 uppercase tracking-wider">Equilibration Settings</h4>

          {/* Simulation Length */}
          <div>
            <Label className="mb-2 block">Simulation Length</Label>
            <select
              value={parameters.simulation_length}
              onChange={(e) => onSimulationLengthChange(e.target.value as SimulationLength)}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="short">Short (50 ps equilibration)</option>
              <option value="medium">Medium (100 ps equilibration)</option>
              <option value="long">Long (200 ps equilibration)</option>
              <option value="custom">Custom</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Longer simulations provide better relaxation</p>
          </div>

          {/* Custom Steps */}
          {parameters.simulation_length === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">NVT Steps</Label>
                <Input
                  type="number"
                  value={parameters.nvt_steps || 25000}
                  onChange={(e) => onCustomStepsChange(parseInt(e.target.value), parameters.npt_steps || 25000)}
                  min={1000}
                  max={1000000}
                  className="bg-gray-700 border-gray-600"
                />
              </div>
              <div>
                <Label className="mb-2 block">NPT Steps</Label>
                <Input
                  type="number"
                  value={parameters.npt_steps || 25000}
                  onChange={(e) => onCustomStepsChange(parameters.nvt_steps || 25000, parseInt(e.target.value))}
                  min={1000}
                  max={1000000}
                  className="bg-gray-700 border-gray-600"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Temperature */}
            <div>
              <Label className="mb-2 block">Temperature (K)</Label>
              <Input
                type="number"
                value={parameters.temperature}
                onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
                min={250}
                max={400}
                className="bg-gray-700 border-gray-600"
              />
            </div>

            {/* Pressure */}
            <div>
              <Label className="mb-2 block">Pressure (bar)</Label>
              <Input
                type="number"
                value={parameters.pressure}
                onChange={(e) => onPressureChange(parseFloat(e.target.value))}
                min={0.1}
                max={10.0}
                step={0.1}
                className="bg-gray-700 border-gray-600"
              />
            </div>
          </div>

          {/* Pause at Minimized */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-gray-700/50">
            <div>
              <Label className="text-sm text-gray-200">Pause after minimization</Label>
              <p className="text-xs text-gray-400">
                Inspect minimized structure before equilibration
              </p>
            </div>
            <Switch
              checked={!!parameters.pause_at_minimized}
              onCheckedChange={onPauseAtMinimizedToggle}
            />
          </div>
        </div>
      )}

      {/* Important Notes */}
      <div className="p-4 bg-blue-900/10 border border-blue-800/30 rounded">
        <h4 className="text-sm font-semibold text-blue-400 mb-2">
          {mode === 'minimization' ? 'INFO: Minimization Info:' : 'INFO: Equilibration Info:'}
        </h4>
        <ul className="text-xs text-gray-300 space-y-1">
          <li>• System will be solvated with TIP3P water model</li>
          {mode === 'minimization' ? (
            <li>• Only energy minimization will be performed (steepest descent)</li>
          ) : (
            <>
              <li>• Energy minimization will be performed first</li>
              <li>• Followed by NVT (heating) and NPT (pressure) equilibration</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
