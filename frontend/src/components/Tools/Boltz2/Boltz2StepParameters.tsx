'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { AlertTriangle, Cpu, Zap, Database, CheckCircle, Loader2, XCircle } from 'lucide-react'
import type { Boltz2PredictionParams, Boltz2AlignmentOptions, Boltz2MSAOptions } from '@/store/boltz2-store'

interface Boltz2StepParametersProps {
  predictionParams: Boltz2PredictionParams
  alignmentOptions: Boltz2AlignmentOptions
  msaOptions: Boltz2MSAOptions
  onPredictionParamsChange: (params: Partial<Boltz2PredictionParams>) => void
  onAlignmentOptionsChange: (options: Partial<Boltz2AlignmentOptions>) => void
  onMsaOptionsChange: (options: Partial<Boltz2MSAOptions>) => void
}

export function Boltz2StepParameters({
  predictionParams,
  alignmentOptions,
  msaOptions,
  onPredictionParamsChange,
  onAlignmentOptionsChange,
  onMsaOptionsChange,
}: Boltz2StepParametersProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Prediction Parameters</h3>
        <p className="text-sm text-gray-400 mb-4">
          Configure the Boltz-2 prediction settings and pose alignment options.
        </p>
      </div>

      {/* Accelerator Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Compute Device</Label>
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => onPredictionParamsChange({ accelerator: 'gpu' })}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              predictionParams.accelerator === 'gpu'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className={`w-5 h-5 ${predictionParams.accelerator === 'gpu' ? 'text-emerald-400' : 'text-gray-400'}`} />
              <span className="font-medium">GPU</span>
            </div>
            <p className="text-xs text-gray-400">
              Fast (~1-2 min). Best for proteins &lt;300 residues.
            </p>
          </div>
          <div
            onClick={() => onPredictionParamsChange({ accelerator: 'cpu' })}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              predictionParams.accelerator === 'cpu'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Cpu className={`w-5 h-5 ${predictionParams.accelerator === 'cpu' ? 'text-blue-400' : 'text-gray-400'}`} />
              <span className="font-medium">CPU</span>
            </div>
            <p className="text-xs text-gray-400">
              Slower (~10-30 min). Handles any protein size.
            </p>
          </div>
        </div>
        {predictionParams.accelerator === 'gpu' && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-200">
              GPU mode may fail for large proteins (&gt;300 residues) due to memory limits.
              Switch to CPU if you encounter errors.
            </p>
          </div>
        )}
      </div>

      {/* MSA Options */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Multiple Sequence Alignment (MSA)</Label>
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
          <div className="space-y-1">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              Pre-generate MSA
            </Label>
            <p className="text-xs text-gray-500">
              Generate MSA before prediction for better caching and reuse
            </p>
          </div>
          <Switch
            checked={msaOptions.generateMsa}
            onCheckedChange={(checked: boolean) => onMsaOptionsChange({ generateMsa: checked })}
          />
        </div>
        
        {/* MSA Method Selection */}
        {msaOptions.generateMsa && (
          <div className="space-y-2">
            <Label className="text-xs text-gray-400">MSA Generation Method</Label>
            <select
              value={msaOptions.msaMethod}
              onChange={(e) => onMsaOptionsChange({ 
                msaMethod: e.target.value as 'ncbi_blast' | 'mmseqs2_server' | 'mmseqs2_local' 
              })}
              className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ncbi_blast">NCBI BLAST + Biopython (Recommended - Reliable)</option>
              <option value="mmseqs2_server">ColabFold MMSeqs2 Server (May be slow/unreliable)</option>
              <option value="mmseqs2_local">Local MMSeqs2 (Requires large databases)</option>
            </select>
            <p className="text-xs text-gray-500">
              {msaOptions.msaMethod === 'ncbi_blast' && 'Uses NCBI BLAST API to find similar sequences and aligns with Biopython. Most reliable option.'}
              {msaOptions.msaMethod === 'mmseqs2_server' && 'Uses ColabFold remote server. Fast but may experience timeouts or errors.'}
              {msaOptions.msaMethod === 'mmseqs2_local' && 'Uses local MMSeqs2 installation. Fastest but requires 100GB+ databases.'}
            </p>
          </div>
        )}
        
        {/* MSA Status Indicator */}
        {msaOptions.generateMsa && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            msaOptions.msaStatus === 'ready' || msaOptions.msaCached
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : msaOptions.msaStatus === 'error'
              ? 'bg-red-500/10 border border-red-500/30'
              : msaOptions.msaStatus === 'generating' || msaOptions.msaStatus === 'checking'
              ? 'bg-blue-500/10 border border-blue-500/30'
              : 'bg-gray-800/50 border border-gray-700'
          }`}>
            {msaOptions.msaStatus === 'ready' || msaOptions.msaCached ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">
                  {msaOptions.msaCached ? 'MSA cached and ready' : 'MSA ready'}
                </span>
              </>
            ) : msaOptions.msaStatus === 'generating' ? (
              <>
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-300">Generating MSA...</span>
              </>
            ) : msaOptions.msaStatus === 'checking' ? (
              <>
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-300">Checking cache...</span>
              </>
            ) : msaOptions.msaStatus === 'error' ? (
              <>
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-300">
                  {msaOptions.msaError || 'MSA generation failed'}
                </span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">
                  MSA will be generated during prediction
                </span>
              </>
            )}
          </div>
        )}
        
        <p className="text-xs text-gray-500">
          MSAs provide evolutionary information that improves prediction accuracy.
          {!msaOptions.generateMsa && ' Boltz-2 will use the MMSeqs2 server automatically.'}
        </p>
      </div>

      {/* Number of Poses */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Number of Poses</Label>
          <span className="text-sm text-gray-400">{predictionParams.num_poses}</span>
        </div>
        <Slider
          value={[predictionParams.num_poses || 5]}
          onValueChange={([value]: number[]) => onPredictionParamsChange({ num_poses: value })}
          min={1}
          max={20}
          step={1}
          className="w-full"
        />
        <p className="text-xs text-gray-500">
          Number of binding poses to generate. More poses increase accuracy but take longer.
        </p>
      </div>

      {/* Confidence Threshold */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Confidence Threshold</Label>
          <span className="text-sm text-gray-400">
            {(predictionParams.confidence_threshold || 0.7).toFixed(2)}
          </span>
        </div>
        <Slider
          value={[(predictionParams.confidence_threshold || 0.7) * 100]}
          onValueChange={([value]: number[]) => onPredictionParamsChange({ confidence_threshold: value / 100 })}
          min={0}
          max={100}
          step={5}
          className="w-full"
        />
        <p className="text-xs text-gray-500">
          Minimum confidence score for accepting predictions (0.0 - 1.0).
        </p>
      </div>

      {/* Alignment Options Section */}
      <div className="border-t border-gray-700 pt-6 space-y-4">
        <h4 className="text-md font-semibold">Pose Alignment Options</h4>

        {/* Use Alignment Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Enable Pose Alignment</Label>
            <p className="text-xs text-gray-500">
              Align multiple poses for better comparison
            </p>
          </div>
          <Switch
            checked={alignmentOptions.use_alignment}
            onCheckedChange={(checked: boolean) => onAlignmentOptionsChange({ use_alignment: checked })}
          />
        </div>

        {alignmentOptions.use_alignment && (
          <>
            {/* Alignment Method */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Alignment Method</Label>
              <div className="space-y-2">
                {[
                  { value: 'binding_site', label: 'Binding Site', desc: 'Align based on binding site residues' },
                  { value: 'full_structure', label: 'Full Structure', desc: 'Align entire protein structure' },
                  { value: 'none', label: 'No Alignment', desc: 'Keep original orientations' },
                ].map((method) => (
                  <div
                    key={method.value}
                    onClick={() => onAlignmentOptionsChange({ alignment_method: method.value as any })}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      alignmentOptions.alignment_method === method.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium text-sm">{method.label}</div>
                    <div className="text-xs text-gray-400">{method.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Binding Site Radius (only for binding_site method) */}
            {alignmentOptions.alignment_method === 'binding_site' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Binding Site Radius (Å)</Label>
                  <span className="text-sm text-gray-400">
                    {alignmentOptions.binding_site_radius.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[alignmentOptions.binding_site_radius]}
                  onValueChange={([value]: number[]) => onAlignmentOptionsChange({ binding_site_radius: value })}
                  min={3}
                  max={15}
                  step={0.5}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">
                  Radius around ligand to define binding site for alignment.
                </p>
              </div>
            )}

            {/* Use SVD */}
            <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Use SVD Algorithm</Label>
                <p className="text-xs text-gray-500">
                  Singular Value Decomposition for optimal alignment
                </p>
              </div>
              <Switch
                checked={alignmentOptions.use_svd}
                onCheckedChange={(checked: boolean) => onAlignmentOptionsChange({ use_svd: checked })}
              />
            </div>

            {/* Iterative Refinement */}
            <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Iterative Refinement</Label>
                <p className="text-xs text-gray-500">
                  Refine alignment until target RMSD is reached
                </p>
              </div>
              <Switch
                checked={alignmentOptions.iterative_until_threshold}
                onCheckedChange={(checked: boolean) => onAlignmentOptionsChange({ iterative_until_threshold: checked })}
              />
            </div>

            {/* Target RMSD (only if iterative refinement is on) */}
            {alignmentOptions.iterative_until_threshold && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Target RMSD (Å)</Label>
                  <span className="text-sm text-gray-400">
                    {alignmentOptions.target_rmsd.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[alignmentOptions.target_rmsd * 100]}
                  onValueChange={([value]: number[]) => onAlignmentOptionsChange({ target_rmsd: value / 100 })}
                  min={1}
                  max={50}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">
                  Target RMSD threshold for iterative alignment convergence.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
