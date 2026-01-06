'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertCircle, TrendingDown, Activity, Save, Eye, Info } from 'lucide-react'
import { PAEHeatmap } from './PAEHeatmap'
import type { Boltz2Pose } from '@/store/boltz2-store'

interface Boltz2SinglePoseDisplayProps {
  pose: Boltz2Pose
  jobId: string
  onVisualize: () => void
  onOptimizeWithMD: () => void
  onSave: () => void
  isSaving?: boolean
  saveMessage?: { type: 'success' | 'error'; text: string } | null
  methodConditioning?: string
  predictionConfidence?: number
  complexPlddt?: number
}

// Helper to determine confidence tier color
const getConfidenceColor = (score: number | undefined, threshold: number) => {
  if (score === undefined) return 'text-gray-400'
  if (score >= threshold) return 'text-green-400'
  if (score >= threshold - 0.2) return 'text-yellow-400'
  return 'text-red-400'
}

// Helper to format IC50
const formatIC50 = (logIC50: number | undefined) => {
  if (logIC50 === undefined) return 'N/A'
  const ic50_uM = Math.pow(10, logIC50)
  if (ic50_uM < 0.001) {
    return `${(ic50_uM * 1000).toFixed(2)} nM`
  }
  return `${ic50_uM.toFixed(2)} µM`
}

export function Boltz2SinglePoseDisplay({
  pose,
  jobId,
  onVisualize,
  onOptimizeWithMD,
  onSave,
  isSaving = false,
  saveMessage = null,
  methodConditioning = 'default',
  predictionConfidence = 0,
  complexPlddt,
}: Boltz2SinglePoseDisplayProps) {
  const [showPAE, setShowPAE] = useState(false)

  // "High Confidence Hit" Logic
  const isHighConfidenceHit = (predictionConfidence || 0) > 0.8 &&
    (pose.aggregate_score || 0) > 0.75

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* High Confidence Banner */}
      {isHighConfidenceHit && (
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-green-500/30 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            <div>
              <p className="font-semibold text-green-300">High Confidence Hit</p>
              <p className="text-xs text-green-400/70">Meets stringent structural and interface quality criteria (ipTM &gt; 0.8, Score &gt; 0.75)</p>
            </div>
          </div>
          {methodConditioning !== 'default' && (
            <div className="px-2 py-1 bg-gray-800 rounded border border-gray-600 text-xs text-gray-300">
              Method: <span className="uppercase text-white font-medium">{methodConditioning}</span>
            </div>
          )}
        </div>
      )}

      {/* Save Status Message */}
      {saveMessage && (
        <Alert className={saveMessage.type === 'success' ? 'bg-green-900/20 border-green-500/50' : 'bg-red-900/20 border-red-500/50'}>
          {saveMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          <AlertDescription className={saveMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}>
            {saveMessage.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Binding Free Energy */}
        <div className="p-4 bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-lg border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-blue-400" />
            <p className="text-xs text-blue-300 font-medium">Binding Free Energy</p>
          </div>
          <p className="text-2xl font-bold text-blue-400">
            {pose.binding_free_energy?.toFixed(2) || 'N/A'}
          </p>
          <p className="text-xs text-blue-300/70 mt-1">kcal/mol</p>
        </div>

        {/* Binding Probability */}
        <div className="p-4 bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-purple-400" />
            <p className="text-xs text-purple-300 font-medium">Binding Probability</p>
          </div>
          <p className="text-2xl font-bold text-purple-400">
            {pose.affinity_probability_binary !== undefined
              ? (pose.affinity_probability_binary * 100).toFixed(1)
              : 'N/A'}%
          </p>
          <p className="text-xs text-purple-300/70 mt-1">Confidence</p>
        </div>
      </div>

      {/* Global Confidence Summary */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          <h4 className="font-medium text-white">Confidence Metrics</h4>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400 mb-1">Aggregate Score</p>
            <p className={`text-lg font-semibold ${getConfidenceColor(pose.aggregate_score, 0.75)}`}>
              {pose.aggregate_score?.toFixed(2) || 'N/A'}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">0.8*pLDDT + 0.2*ipTM</p>
          </div>

          <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400 mb-1">ipTM (Interface)</p>
            <p className={`text-lg font-semibold ${getConfidenceColor(pose.iptm, 0.8)}`}>
              {pose.iptm?.toFixed(2) || 'N/A'}
            </p>
          </div>

          <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400 mb-1">pTM (Topology)</p>
            <p className={`text-lg font-semibold ${getConfidenceColor(pose.ptm, 0.7)}`}>
              {pose.ptm?.toFixed(2) || 'N/A'}
            </p>
          </div>

          <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400 mb-1">Avg pLDDT</p>
            <p className={`text-lg font-semibold ${getConfidenceColor(complexPlddt ? complexPlddt / 100 : undefined, 0.7)}`}>
              {complexPlddt?.toFixed(1) || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Binding Affinity Details */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-purple-400" />
          <h4 className="font-medium text-white">Binding Affinity Details</h4>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-blue-900/20 rounded border border-blue-500/30">
              <p className="text-xs text-blue-300 mb-1">Predicted IC50</p>
              <p className="text-lg font-semibold text-blue-400">
                {formatIC50(pose.affinity_pred_value)}
              </p>
            </div>
            <div className="p-3 bg-blue-900/20 rounded border border-blue-500/30">
              <p className="text-xs text-blue-300 mb-1">Delta G (logIC50)</p>
              <p className="text-lg font-semibold text-blue-400">
                {pose.affinity_pred_value?.toFixed(2) || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-2">
          <Eye className="h-4 w-4 text-teal-400" />
          <h4 className="font-medium text-white">Actions</h4>
        </div>
        <div className="p-4 grid grid-cols-3 gap-2">
          <Button
            onClick={onVisualize}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs"
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          <Button
            onClick={onOptimizeWithMD}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-xs"
          >
            <Activity className="h-3 w-3 mr-1" />
            MD
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* PAE Heatmap Section */}
      {pose.has_pae && (
        <div className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-teal-400" />
              <h4 className="font-medium text-white">Predicted Aligned Error (PAE)</h4>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPAE(!showPAE)}
              className="text-xs text-gray-400 hover:text-white"
            >
              {showPAE ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showPAE && (
            <div className="p-4">
              <div className="bg-white/5 rounded-lg overflow-hidden h-[400px]">
                <PAEHeatmap
                  jobId={jobId}
                  poseIndex={0}
                  hasPAE={true}
                />
              </div>
              <p className="text-xs text-gray-400 mt-3">
                PAE (Predicted Aligned Error) shows the expected distance error in Ångströms. Blue indicates high confidence, red indicates low confidence.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Confidence Metrics Guide */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-blue-400" />
          <h4 className="font-medium text-white">Confidence Metrics Guide</h4>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">pLDDT (Local Confidence)</h5>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-blue-600"></div>
                <span className="text-gray-300">Very High (90-100)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-blue-400"></div>
                <span className="text-gray-300">Confident (70-90)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-yellow-400"></div>
                <span className="text-gray-300">Low Confidence (50-70)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-orange-500"></div>
                <span className="text-gray-300">Unreliable / Disordered (&lt;50)</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Metrics Explanation</h5>
            <ul className="text-xs text-gray-400 space-y-2 list-disc pl-4">
              <li><strong>Aggregate Score:</strong> Weighted combination of local (pLDDT) and interface (ipTM) confidence.</li>
              <li><strong>ipTM:</strong> Interface Predicted Template Modeling score. Measures protein-ligand interface quality.</li>
              <li><strong>PAE:</strong> Expected distance error in Ångströms. Lower values indicate higher confidence.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
