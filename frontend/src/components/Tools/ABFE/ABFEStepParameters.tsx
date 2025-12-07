'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { ABFEParameters } from '@/types/abfe-types'

interface ABFEStepParametersProps {
    parameters: ABFEParameters
    onParametersChange: (params: Partial<ABFEParameters>) => void
}

export function ABFEStepParameters({
    parameters,
    onParametersChange,
}: ABFEStepParametersProps) {
    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">Step 2: ABFE Parameters</h3>

            {/* Simulation Time */}
            <div>
                <Label className="mb-2 block">
                    Simulation Time (ns)
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Total simulation time per lambda window
                    </span>
                </Label>
                <Input
                    type="number"
                    value={parameters.simulation_time_ns || 1.0}
                    onChange={(e) => onParametersChange({ simulation_time_ns: parseFloat(e.target.value) })}
                    min={0.1}
                    max={100}
                    step={0.1}
                    className="bg-gray-700 border-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                    For POC/testing: 0.1-1 ns (fast). For production: 5-20 ns (accurate)
                </p>
            </div>

            {/* Temperature */}
            <div>
                <Label className="mb-2 block">Temperature (K)</Label>
                <Input
                    type="number"
                    value={parameters.temperature || 300}
                    onChange={(e) => onParametersChange({ temperature: parseFloat(e.target.value) })}
                    min={250}
                    max={350}
                    className="bg-gray-700 border-gray-600"
                />
            </div>

            {/* Pressure */}
            <div>
                <Label className="mb-2 block">Pressure (bar)</Label>
                <Input
                    type="number"
                    value={parameters.pressure || 1.0}
                    onChange={(e) => onParametersChange({ pressure: parseFloat(e.target.value) })}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    className="bg-gray-700 border-gray-600"
                />
            </div>

            {/* Ionic Strength */}
            <div>
                <Label className="mb-2 block">Ionic Strength (M)</Label>
                <Input
                    type="number"
                    value={parameters.ionic_strength || 0.15}
                    onChange={(e) => onParametersChange({ ionic_strength: parseFloat(e.target.value) })}
                    min={0}
                    max={1}
                    step={0.05}
                    className="bg-gray-700 border-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                    NaCl concentration (physiological: ~0.15 M)
                </p>
            </div>

            {/* Fast Mode Toggle */}
            <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Fast Mode</Label>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={parameters.fast_mode !== false}
                            onChange={(e) => {
                                const fastMode = e.target.checked
                                onParametersChange({
                                    fast_mode: fastMode,
                                    equilibration_length_ns: fastMode ? 0.1 : 1.0,
                                    production_length_ns: fastMode ? 0.5 : 10.0,
                                    n_checkpoints: 10,
                                })
                            }}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                <p className="text-xs text-gray-400">
                    {parameters.fast_mode !== false
                        ? "Fast Mode ON: ~15-30 minutes. Good for testing/development."
                        : "Fast Mode OFF: ~5+ hours. Production-quality results."}
                </p>
            </div>

            {/* Equilibration Length */}
            <div>
                <Label className="mb-2 block">
                    Equilibration Length (ns)
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Time to equilibrate system before production
                    </span>
                </Label>
                <Input
                    type="number"
                    value={parameters.equilibration_length_ns || (parameters.fast_mode !== false ? 0.1 : 1.0)}
                    onChange={(e) => onParametersChange({ equilibration_length_ns: parseFloat(e.target.value) })}
                    min={0.01}
                    max={10}
                    step={0.1}
                    className="bg-gray-700 border-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                    Fast: 0.1 ns, Production: 1.0 ns
                </p>
            </div>

            {/* Production Length */}
            <div>
                <Label className="mb-2 block">
                    Production Length (ns)
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Time for production sampling
                    </span>
                </Label>
                <Input
                    type="number"
                    value={parameters.production_length_ns || (parameters.fast_mode !== false ? 0.5 : 10.0)}
                    onChange={(e) => onParametersChange({ production_length_ns: parseFloat(e.target.value) })}
                    min={0.1}
                    max={100}
                    step={0.1}
                    className="bg-gray-700 border-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                    Fast: 0.5 ns, Production: 10.0 ns
                </p>
                <p className="text-xs text-blue-400 mt-1 font-medium">
                    Calculated iterations: {Math.round((parameters.production_length_ns || (parameters.fast_mode !== false ? 0.5 : 10.0)) / ((parameters.time_per_iteration_ps || 2.5) / 1000)).toLocaleString()} 
                    <span className="text-gray-400 ml-1">(production_length ÷ {(parameters.time_per_iteration_ps || 2.5)} ps per iteration)</span>
                </p>
            </div>

            {/* Time per Iteration */}
            <div>
                <Label className="mb-2 block">
                    Time per Iteration (ps)
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Duration of each simulation iteration
                    </span>
                </Label>
                <Input
                    type="number"
                    value={parameters.time_per_iteration_ps || 2.5}
                    onChange={(e) => onParametersChange({ time_per_iteration_ps: parseFloat(e.target.value) })}
                    min={0.1}
                    max={10}
                    step={0.1}
                    className="bg-gray-700 border-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                    Default: 2.5 ps. Adjust this to change the time step per iteration.
                </p>
            </div>

            {/* Production Checkpoint Settings */}
            <div className="space-y-4">
                <Label className="mb-2 block">
                    Production Checkpoint Settings
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Configure checkpoints for production phase (complex and solvent)
                    </span>
                </Label>
                
                {/* Toggle between Number and Interval */}
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="production_checkpoint_mode"
                            value="number"
                            checked={parameters.production_checkpoint_mode === 'number'}
                            onChange={(e) => onParametersChange({ production_checkpoint_mode: 'number' as const })}
                            className="cursor-pointer"
                        />
                        <span className="text-sm">Number of Checkpoints</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="production_checkpoint_mode"
                            value="interval"
                            checked={parameters.production_checkpoint_mode === 'interval'}
                            onChange={(e) => onParametersChange({ production_checkpoint_mode: 'interval' as const })}
                            className="cursor-pointer"
                        />
                        <span className="text-sm">Checkpoint Interval (ns)</span>
                    </label>
                </div>

                {/* Number of Checkpoints Input */}
                {parameters.production_checkpoint_mode === 'number' && (
                    <div>
                        <Input
                            type="number"
                            placeholder="Number of checkpoints"
                            value={parameters.production_n_checkpoints || 10}
                            onChange={(e) => onParametersChange({ production_n_checkpoints: parseInt(e.target.value) })}
                            min={1}
                            max={100}
                            step={1}
                            className="bg-gray-700 border-gray-600"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Calculated interval: {((parameters.production_length_ns || 0.5) / (parameters.production_n_checkpoints || 10)).toFixed(4)} ns
                        </p>
                    </div>
                )}

                {/* Checkpoint Interval Input */}
                {parameters.production_checkpoint_mode === 'interval' && (
                    <div>
                        <Input
                            type="number"
                            placeholder="Checkpoint interval (ns)"
                            value={parameters.production_checkpoint_interval_ns || 0.05}
                            onChange={(e) => onParametersChange({ production_checkpoint_interval_ns: parseFloat(e.target.value) })}
                            min={0.01}
                            max={10}
                            step={0.01}
                            className="bg-gray-700 border-gray-600"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Calculated checkpoints: {Math.ceil((parameters.production_length_ns || 0.5) / (parameters.production_checkpoint_interval_ns || 0.05))}
                        </p>
                    </div>
                )}
            </div>

            {/* Equilibration Checkpoint Settings */}
            <div className="space-y-4">
                <Label className="mb-2 block">
                    Equilibration Checkpoint Settings
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Configure checkpoints for equilibration phase (complex and solvent)
                    </span>
                </Label>
                
                {/* Toggle between Number and Interval */}
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="equilibration_checkpoint_mode"
                            value="number"
                            checked={parameters.equilibration_checkpoint_mode === 'number'}
                            onChange={(e) => onParametersChange({ equilibration_checkpoint_mode: 'number' as const })}
                            className="cursor-pointer"
                        />
                        <span className="text-sm">Number of Checkpoints</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="equilibration_checkpoint_mode"
                            value="interval"
                            checked={parameters.equilibration_checkpoint_mode === 'interval'}
                            onChange={(e) => onParametersChange({ equilibration_checkpoint_mode: 'interval' as const })}
                            className="cursor-pointer"
                        />
                        <span className="text-sm">Checkpoint Interval (ns)</span>
                    </label>
                </div>

                {/* Number of Checkpoints Input */}
                {parameters.equilibration_checkpoint_mode === 'number' && (
                    <div>
                        <Input
                            type="number"
                            placeholder="Number of checkpoints"
                            value={parameters.equilibration_n_checkpoints || 5}
                            onChange={(e) => onParametersChange({ equilibration_n_checkpoints: parseInt(e.target.value) })}
                            min={1}
                            max={100}
                            step={1}
                            className="bg-gray-700 border-gray-600"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Calculated interval: {((parameters.equilibration_length_ns || 0.1) / (parameters.equilibration_n_checkpoints || 5)).toFixed(4)} ns
                        </p>
                    </div>
                )}

                {/* Checkpoint Interval Input */}
                {parameters.equilibration_checkpoint_mode === 'interval' && (
                    <div>
                        <Input
                            type="number"
                            placeholder="Checkpoint interval (ns)"
                            value={parameters.equilibration_checkpoint_interval_ns || 0.02}
                            onChange={(e) => onParametersChange({ equilibration_checkpoint_interval_ns: parseFloat(e.target.value) })}
                            min={0.01}
                            max={10}
                            step={0.01}
                            className="bg-gray-700 border-gray-600"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Calculated checkpoints: {Math.ceil((parameters.equilibration_length_ns || 0.1) / (parameters.equilibration_checkpoint_interval_ns || 0.02))}
                        </p>
                    </div>
                )}
            </div>

            {/* Protocol Repeats */}
            <div>
                <Label className="mb-2 block">
                    Protocol Repeats
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                        Number of independent repetitions
                    </span>
                </Label>
                <Input
                    type="number"
                    value={parameters.protocol_repeats || 1}
                    onChange={(e) => onParametersChange({ protocol_repeats: parseInt(e.target.value) })}
                    min={1}
                    max={10}
                    step={1}
                    className="bg-gray-700 border-gray-600"
                />
                <p className="text-xs text-gray-400 mt-1">
                    Run the calculation multiple times independently for better statistics (default: 1 for fast mode, 3 for production)
                </p>
            </div>

            {/* Information Box: How Iterations are Calculated */}
            <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-gray-300">
                        <p className="font-semibold mb-2 text-blue-300">How Iterations are Calculated</p>
                        <p className="text-gray-400 mb-2">
                            The number of simulation iterations is automatically calculated from the <strong>Production Length</strong>:
                        </p>
                        <div className="bg-gray-800/50 p-2 rounded text-xs font-mono text-gray-300 mb-2">
                            Iterations = Production Length (ns) ÷ Time per Iteration (ps) × 1000
                        </div>
                        <p className="text-gray-400 text-xs">
                            Each iteration takes {parameters.time_per_iteration_ps || 2.5} picoseconds ({(parameters.time_per_iteration_ps || 2.5) / 1000} ns). For example:
                        </p>
                        <ul className="text-gray-400 text-xs mt-1 ml-4 list-disc">
                            <li>0.5 ns production length = {Math.round(0.5 / ((parameters.time_per_iteration_ps || 2.5) / 1000)).toLocaleString()} iterations (at {(parameters.time_per_iteration_ps || 2.5)} ps/iteration)</li>
                            <li>10.0 ns production length = {Math.round(10.0 / ((parameters.time_per_iteration_ps || 2.5) / 1000)).toLocaleString()} iterations (at {(parameters.time_per_iteration_ps || 2.5)} ps/iteration)</li>
                        </ul>
                        <p className="text-gray-400 text-xs mt-2">
                            <strong>Note:</strong> You can adjust the time per iteration to control the simulation timestep. 
                            Longer production times = more iterations = better convergence but longer runtime.
                        </p>
                    </div>
                </div>
            </div>

            {/* Warning Box */}
            <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <div className="flex items-start">
                    <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm text-gray-300">
                        <p className="font-semibold mb-1">Performance Note</p>
                        <p className="text-gray-400">
                            Fast mode is enabled by default. Calculations will complete in ~15-30 minutes instead of 5+ hours.
                            For production-quality results, disable fast mode (will take much longer).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
