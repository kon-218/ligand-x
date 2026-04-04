'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  ArrowRight,
  PlayCircle,
  Beaker,
  Eye,
  RefreshCw,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  Download,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button' // Used in DockedPosesPreview
import { api } from '@/lib/api-client'
import { useMolecularStore } from '@/store/molecular-store'
import { useRBFEStore } from '@/store/rbfe-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { UnifiedJobList, NoJobSelectedState } from '../shared'
import {
  generateNetworkGraphSVG,
  generateNetworkGraphSVGWithImages,
  downloadNetworkGraphSVG,
  svgToDataUrl,
} from '@/lib/rbfe-network-export'
import { computeNetworkGraphLayout } from '@/lib/rbfe-network-layout'
import type { RBFEJob, RBFENetworkData, RBFEDdGValue, RBFETransformationResult, DockedPoseInfo, LigandSelection, AlignmentInfo } from '@/types/rbfe-types'
import { AlignmentPreview } from './AlignmentPreview'

// Resolve a backend /api/… path to a full URL, encoding special characters in each segment.
// Transformation names may contain spaces and parentheses (e.g. "BNZ_A_200_BNZ_o (Library)_complex").
function resolveApiFileUrl(path: string): string {
  if (!path.startsWith('/api')) return path
  const base = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
  // Encode each path segment individually to handle spaces/parentheses while preserving slashes
  const encoded = path
    .split('/')
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join('/')
  return `${base}${encoded}`
}

// Helper to check if a job status indicates it's still running/in-progress
// Note: 'docking_ready' is NOT considered running since it's waiting for user action
const isRunningStatus = (status: string | undefined): boolean => {
  const runningStatuses = new Set([
    'running',
    'preparing',
    'submitted',
    'docking',
    'resuming',
  ])
  return runningStatuses.has(status || '')
}

interface TransformationLegRow {
  ligand_a: string
  ligand_b: string
  complex_dg: number | null
  complex_unc: number | null
  solvent_dg: number | null
  solvent_unc: number | null
  ddg: number | null
  ddg_unc: number | null
}

function buildTransformationLegData(
  transformationResults: RBFETransformationResult[],
  ddgValues: RBFEDdGValue[]
): TransformationLegRow[] {
  const edgeMap = new Map<string, { complex?: RBFETransformationResult; solvent?: RBFETransformationResult }>()
  for (const r of transformationResults) {
    if (!r.ligand_a || !r.ligand_b || r.status !== 'completed') continue
    const key = `${r.ligand_a}||${r.ligand_b}`
    if (!edgeMap.has(key)) edgeMap.set(key, {})
    const entry = edgeMap.get(key)!
    if (r.leg === 'complex') entry.complex = r
    else if (r.leg === 'solvent') entry.solvent = r
  }
  return ddgValues.map((ddg) => {
    const key = `${ddg.ligand_a}||${ddg.ligand_b}`
    const legs = edgeMap.get(key) ?? {}
    return {
      ligand_a: ddg.ligand_a,
      ligand_b: ddg.ligand_b,
      complex_dg: legs.complex?.estimate_kcal_mol ?? null,
      complex_unc: legs.complex?.uncertainty_kcal_mol ?? null,
      solvent_dg: legs.solvent?.estimate_kcal_mol ?? null,
      solvent_unc: legs.solvent?.uncertainty_kcal_mol ?? null,
      ddg: ddg.ddg_kcal_mol,
      ddg_unc: ddg.uncertainty_kcal_mol,
    }
  })
}

interface RBFEResultsPanelProps {
  result: RBFEJob | null
  isRunning: boolean
  progress: number
  progressMessage: string
  jobs: RBFEJob[]
  activeJobId: string | null
  onSelectJob: (jobId: string | null) => void
  onContinueAfterDocking?: () => void
  onJobsLoaded?: (jobs: RBFEJob[]) => void
  onClearDockingPreview?: () => void
}

// Helper function to extract PDB ID or molecule name from filename
function getDisplayName(filename: string): string {
  if (!filename) return 'Unknown'

  // Check if it's a PDB ID (4-character alphanumeric code)
  const pdbIdMatch = /^[A-Za-z0-9]{4}$/.exec(filename)
  if (pdbIdMatch) {
    return filename // Return just the PDB ID
  }

  // Extract PDB ID from patterns like "4RT7_cleaned_rbfe_pose_benzeneoh"
  const pdbIdFromLongName = /^([A-Za-z0-9]{4})_/.exec(filename)
  if (pdbIdFromLongName) {
    return pdbIdFromLongName[1] // Return just the PDB ID
  }

  // Extract molecule name from patterns like "(Library)_rbfe_pose_benzenef"
  const moleculeMatch = /\brbfe_pose_([a-zA-Z0-9-]+)/.exec(filename)
  if (moleculeMatch) {
    return moleculeMatch[1] // Return the molecule name
  }

  // Extract library name from patterns like "library_rbfe_pose_benzenef"
  const libraryMatch = /^library_rbfe_pose_([a-zA-Z0-9-]+)/.exec(filename)
  if (libraryMatch) {
    return libraryMatch[1] // Return the molecule name from library
  }

  // Fallback: Use full name if it's reasonably short, otherwise truncate
  if (filename.length <= 15) {
    return filename
  }

  // If it has underscores but is short enough, keep it (e.g. p30_cl)
  if (filename.includes('_') && filename.length <= 20) {
    return filename
  }

  // Return first part if it's a long filename with underscores
  const firstPart = filename.split('_')[0]
  if (firstPart && firstPart.length <= 15) {
    return firstPart
  }

  // Last resort: truncate long filename
  return filename.slice(0, 12) + '...'
}

export function RBFEResultsPanel({
  result,
  isRunning,
  progress,
  progressMessage,
  jobs,
  activeJobId,
  onSelectJob,
  onContinueAfterDocking,
  onJobsLoaded,
  onClearDockingPreview,
}: RBFEResultsPanelProps) {
  const rbfeStore = useRBFEStore()
  const {
    resultsTab,
    setResultsTab,
    cancelJob,
    deleteJob,
    loadAllJobs,
    getFilteredJobs,
  } = useUnifiedResultsStore()

  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(null)
  const [showDockingResults, setShowDockingResults] = useState(false)

  // Load jobs on mount
  useEffect(() => {
    loadAllJobs()
  }, [])

  const filteredJobs = getFilteredJobs().filter(j => j.service === 'rbfe' && j.metadata.network_topology)

  // Use ref for callback to avoid dependency issues causing infinite loops
  const onJobsLoadedRef = useRef(onJobsLoaded)
  useEffect(() => {
    onJobsLoadedRef.current = onJobsLoaded
  }, [onJobsLoaded])

  // No longer need local loadJobs as it's handled by unified store

  // Ensure docking results are loaded for completed jobs
  useEffect(() => {
    if (result?.status === 'completed' && result.results && !result.docked_poses && result.job_id) {
      // Try to fetch full job status to get docking results if they're missing
      const fetchDockingResults = async () => {
        try {
          const status = await api.getRBFEStatus(result.job_id) as any
          if (status.docked_poses && status.docked_poses.length > 0) {
            // Update the result with docking data via the store
            rbfeStore.setRBFEResult({
              ...result,
              docked_poses: status.docked_poses,
              docking_scores: status.docking_scores,
              docking_log: status.docking_log,
            })
          }
        } catch (err) {
          console.error('Failed to fetch docking results:', err)
        }
      }
      fetchDockingResults()
    }
  }, [result?.job_id, result?.status, result?.results, result?.docked_poses, rbfeStore])

  // Helper to get status icon
  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-orange-400" />
      case 'docking_ready':
        return <Beaker className="w-4 h-4 text-amber-400" />
      case 'running':
      case 'preparing':
      case 'submitted':
      case 'docking':
      case 'resuming':
        return <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }, [])

  // Render the main content based on job state
  const renderContent = () => {
    // Docking ready state - show docked poses for validation
    if (result?.status === 'docking_ready') {
      if (result.docked_poses) {
        return (
          <DockedPosesPreview
            result={result}
            selectedPoseId={selectedPoseId}
            onSelectPose={setSelectedPoseId}
            onContinue={onContinueAfterDocking}
            onClearPreview={onClearDockingPreview}
          />
        )
      } else {
        // Status is ready but poses missing - likely still syncing or error
        return (
           <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-12 h-12 mb-4 text-amber-400 animate-spin" />
            <p>Loading aligned poses...</p>
            <p className="text-sm mt-1">Status: {result.status}</p>
          </div>
        )
      }
    }

    // Completed state with option to show docking results
    if (result?.status === 'completed' && result.results) {
      // Show docking results if user wants to see them
      if (showDockingResults && result.docked_poses) {
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-cyan-400">Alignment Results</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDockingResults(false)}
                className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300"
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Back to RBFE Results
              </Button>
            </div>
            <DockedPosesPreview
              result={result}
              selectedPoseId={selectedPoseId}
              onSelectPose={setSelectedPoseId}
              onContinue={undefined}
              onClearPreview={undefined}
            />
          </div>
        )
      }
    }

    // Running state - check if job is in any running/in-progress state (but not docking_ready)
    if (isRunning && (!result || isRunningStatus(result.status))) {
      return (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">RBFE Calculation in Progress</h3>
            <p className="text-gray-400 text-center mb-4">{progressMessage || 'Processing...'}</p>

            {/* Progress bar */}
            <div className="w-full max-w-md">
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Current transformation info */}
          {result?.message && (
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="text-sm text-gray-400">{result.message}</div>
            </div>
          )}
        </div>
      )
    }

    // No result yet
    if (!result) {
      return (
        <NoJobSelectedState
          icon={GitBranch}
          description="Select a job from the list or run a new RBFE calculation"
          className="h-full"
        />
      )
    }

    // Failed state
    if (result.status === 'failed') {
      return (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center py-8">
            <XCircle className="w-12 h-12 text-red-400 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Calculation Failed</h3>
            <p className="text-gray-400 text-center">{result.error || 'An error occurred'}</p>
          </div>
        </div>
      )
    }

    // Completed state
    if (result.status === 'completed' && result.results) {
      return (
        <div className="space-y-6">
          {/* Success header */}
          <div className="flex items-center justify-between p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <div>
                <h3 className="text-white font-semibold">Calculation Complete</h3>
                <p className="text-sm text-gray-400">
                  {result.results.ddg_values?.length || 0} transformations analyzed
                </p>
              </div>
            </div>
            {/* Show docking results button if available */}
            {result.docked_poses && result.docked_poses.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDockingResults(true)}
                className="bg-amber-900/20 border-amber-600/50 hover:bg-amber-900/40 hover:border-amber-600 text-amber-300"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Alignment Results
              </Button>
            )}
          </div>

          {/* Network visualization placeholder */}
          {result.network && (
            <NetworkGraph
              network={result.network}
              ddgValues={result.results.ddg_values || []}
              availableLigands={rbfeStore.availableLigands}
              jobLigandSmiles={result.ligand_smiles}
            />
          )}

          {/* DDG Results Table */}
          {result.results.ddg_values && result.results.ddg_values.length > 0 && (
            <div className="space-y-2">
               <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-300">Relative Binding Free Energies (ΔΔG)</h4>
                <div className="group relative">
                  <div className="cursor-help text-xs text-gray-500 border border-gray-600 rounded-full w-4 h-4 flex items-center justify-center">?</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-xs text-gray-300 rounded border border-gray-700 shadow-lg z-20">
                    Difference in binding free energy between two ligands. Negative values indicate improved binding relative to the reference.
                  </div>
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-4 py-2 text-left text-gray-400">Transformation</th>
                      <th className="px-4 py-2 text-right text-gray-400">ΔΔG (kcal/mol)</th>
                      <th className="px-4 py-2 text-right text-gray-400">Uncertainty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.ddg_values.map((ddg, i) => (
                      <tr key={i} className="border-b border-gray-700/50 last:border-0">
                        <td className="px-4 py-2 text-gray-300">
                          <span className="flex items-center gap-2">
                            {ddg.ligand_a}
                            <ArrowRight className="w-4 h-4 text-gray-500" />
                            {ddg.ligand_b}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={ddg.ddg_kcal_mol < 0 ? 'text-green-400' : 'text-red-400'}>
                            {ddg.ddg_kcal_mol.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">
                          ± {ddg.uncertainty_kcal_mol.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-Transformation Leg Breakdown */}
          {result.results.transformation_results && result.results.transformation_results.length > 0 && (() => {
            const rows = buildTransformationLegData(
              result.results.transformation_results,
              result.results.ddg_values ?? []
            )
            if (rows.length === 0) return null
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-300">Thermodynamic Cycle per Transformation</h4>
                  <div className="group relative">
                    <div className="cursor-help text-xs text-gray-500 border border-gray-600 rounded-full w-4 h-4 flex items-center justify-center">?</div>
                    <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-2 bg-gray-900 text-xs text-gray-300 rounded border border-gray-700 shadow-lg z-20">
                      Per-leg free energies for each transformation. ΔΔG = ΔG(complex) − ΔG(solvent).
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-900/50">
                        <th className="px-3 py-2 text-left text-gray-400">Transformation</th>
                        <th className="px-3 py-2 text-right text-blue-400">ΔG Complex</th>
                        <th className="px-3 py-2 text-right text-green-400">ΔG Solvent</th>
                        <th className="px-3 py-2 text-right text-gray-300">ΔΔG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-700/50 last:border-0">
                          <td className="px-3 py-2 text-gray-300">
                            <span className="flex items-center gap-1 text-xs">
                              {row.ligand_a}
                              <ArrowRight className="w-3 h-3 text-gray-500" />
                              {row.ligand_b}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.complex_dg !== null
                              ? <span className="text-blue-300">{row.complex_dg.toFixed(2)} <span className="text-gray-500 text-xs">± {row.complex_unc!.toFixed(2)}</span></span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.solvent_dg !== null
                              ? <span className="text-green-300">{row.solvent_dg.toFixed(2)} <span className="text-gray-500 text-xs">± {row.solvent_unc!.toFixed(2)}</span></span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.ddg !== null
                              ? <span className={row.ddg < 0 ? 'text-green-400' : 'text-red-400'}>
                                  {row.ddg.toFixed(2)} <span className="text-gray-500 text-xs">± {row.ddg_unc!.toFixed(2)}</span>
                                </span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Relative Affinities */}
          {result.results.relative_affinities && Object.keys(result.results.relative_affinities).length > 0 && (
            <div className="space-y-2">
               <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-300">
                  Relative Affinities (vs {result.results.reference_ligand || 'reference'})
                </h4>
                <div className="group relative">
                  <div className="cursor-help text-xs text-gray-500 border border-gray-600 rounded-full w-4 h-4 flex items-center justify-center">?</div>
                  <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-xs text-gray-300 rounded border border-gray-700 shadow-lg z-20">
                    Estimated binding affinity of each ligand relative to the reference ligand.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.results.relative_affinities)
                  .sort(([, a], [, b]) => a - b)
                  .map(([ligand, affinity]) => (
                    <div
                      key={ligand}
                      className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 flex justify-between items-center"
                    >
                      <span className="text-gray-300 truncate">{ligand}</span>
                      <span className={affinity <= 0 ? 'text-green-400' : 'text-red-400'}>
                        {affinity > 0 ? '+' : ''}{affinity.toFixed(2)} kcal/mol
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Phase space overlap matrices */}
          {result.results.transformation_results && (
            <OverlapMatrices transformationResults={result.results.transformation_results} />
          )}
        </div>
      )
    }

    // Default/pending state
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Clock className="w-12 h-12 mb-4 opacity-50" />
        <p>Waiting for results...</p>
        <p className="text-sm mt-1">Status: {result.status}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Job List */}
      <UnifiedJobList
        jobs={filteredJobs}
        activeJobId={activeJobId}
        onSelectJob={(jobId) => onSelectJob(jobId)}
        onCancelJob={(jobId, service) => cancelJob(jobId, service)}
        onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
        resultsTab={resultsTab}
        onTabChange={setResultsTab}
        showServiceBadge={false}
        accentColor="cyan"
        title="RBFE Jobs"
        maxHeight="160px"
      />

      {/* Results Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {renderContent()}
      </div>
    </div>
  )
}

interface NetworkGraphProps {
  network: RBFENetworkData
  ddgValues: RBFEDdGValue[]
  availableLigands: LigandSelection[]
  jobLigandSmiles?: Record<string, string>
}

// Helper function to get SMILES for a ligand name
function getLigandSmiles(ligandName: string, availableLigands: LigandSelection[]): string | null {
  // Try to find exact match by name
  let ligand = availableLigands.find((l) => l.name === ligandName || l.id === ligandName)
  if (ligand?.smiles) {
    return ligand.smiles
  }

  // Try to find by ID (handle library_ prefix)
  if (ligandName.startsWith('library_')) {
    const id = ligandName.replace('library_', '')
    ligand = availableLigands.find((l) => l.id === `library_${id}`)
    if (ligand?.smiles) {
      return ligand.smiles
    }
  }

  // Try partial name matching (in case names are truncated)
  ligand = availableLigands.find((l) =>
    l.name.toLowerCase().includes(ligandName.toLowerCase()) ||
    ligandName.toLowerCase().includes(l.name.toLowerCase())
  )
  if (ligand?.smiles) {
    return ligand.smiles
  }

  return null
}

// Generate image URL from SMILES using PubChem API
function getLigandImageUrl(smiles: string | null): string | null {
  if (!smiles) return null
  try {
    const encodedSmiles = encodeURIComponent(smiles)
    return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/PNG?image_size=150x150`
  } catch {
    return null
  }
}

function OverlapMatrixHeatmap({ matrix }: { matrix: number[][] }) {
  const n = matrix.length
  const cellSize = Math.min(28, Math.floor(200 / Math.max(n, 1)))
  const size = n * cellSize

  // Blue color scale 0→white, 1→blue (consistent with ABFE overlap display)
  const cellColor = (v: number) => {
    const intensity = Math.round((1 - v) * 255)
    return `rgb(${intensity}, ${intensity}, 255)`
  }

  return (
    <div className="overflow-x-auto">
      <svg width={size + 20} height={size + 20} className="block">
        <g transform="translate(10,10)">
          {matrix.map((row, i) =>
            row.map((val, j) => {
              const isAdjacentSuperDiag = Math.abs(i - j) === 1
              const poor = isAdjacentSuperDiag && val < 0.03
              return (
                <g key={`${i}-${j}`}>
                  <rect
                    x={j * cellSize}
                    y={i * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill={cellColor(val)}
                    stroke={poor ? '#ef4444' : '#374151'}
                    strokeWidth={poor ? 1.5 : 0.5}
                  />
                  {cellSize >= 18 && (
                    <text
                      x={j * cellSize + cellSize / 2}
                      y={i * cellSize + cellSize / 2 + 4}
                      textAnchor="middle"
                      fontSize={Math.max(8, cellSize * 0.38)}
                      fill={val > 0.5 ? '#1e3a5f' : '#e5e7eb'}
                    >
                      {val.toFixed(2)}
                    </text>
                  )}
                </g>
              )
            })
          )}
        </g>
      </svg>
      <p className="text-xs text-gray-600 mt-1">
        {n} λ windows · red border = superdiag &lt; 0.03
      </p>
    </div>
  )
}

function NetworkGraph({ network, ddgValues, availableLigands, jobLigandSmiles }: NetworkGraphProps) {
  const { addImageFileTab } = useMolecularStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [imageDataUrls, setImageDataUrls] = useState<Map<string, string>>(new Map())

  // Container measurement for responsive canvas
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(400)

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth)
    }
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Load ligand images as data URLs (avoids cross-origin SVG image issues)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const entries = await Promise.all(
        network.nodes.map(async (node) => {
          const smiles = getLigandSmiles(node, availableLigands) ?? jobLigandSmiles?.[node] ?? null
          if (!smiles) return [node, null] as const
          try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
            const res = await fetch(`${baseUrl}/api/rbfe/ligand-image?smiles=${encodeURIComponent(smiles)}`)
            if (!res.ok) return [node, null] as const
            const blob = await res.blob()
            return [node, URL.createObjectURL(blob)] as const
          } catch {
            return [node, null] as const
          }
        })
      )
      if (!cancelled) {
        setImageDataUrls(new Map(entries.filter(([, url]) => url !== null) as [string, string][]))
      }
    }
    load()
    return () => { cancelled = true }
  }, [network.nodes, availableLigands, jobLigandSmiles])

  // Zoom and Pan state — initial scale=1, position=(0,0) always fits since layout
  // is computed to match the canvas dimensions exactly.
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  const handleZoomIn = () => setScale(s => Math.min(s * 1.2, 3))
  const handleZoomOut = () => setScale(s => Math.max(s / 1.2, 0.5))
  const handleResetView = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation()
    // Optional: implement wheel zoom if desired, but buttons are often safer for nested scrolls
  }

  const handleViewGraph = async () => {
    try {
      setIsGenerating(true)
      // Use async version to generate 2D ligand images locally
      const svgString = await generateNetworkGraphSVGWithImages(network, ddgValues, availableLigands, jobLigandSmiles)
      const imageUrl = svgToDataUrl(svgString)
      addImageFileTab(imageUrl, `RBFE Network Graph (${network.topology.toUpperCase()})`)
    } catch (error) {
      console.error('Failed to generate network graph:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadGraph = async () => {
    try {
      await downloadNetworkGraphSVG(network, ddgValues, availableLigands, `rbfe_network_${network.topology}.svg`, jobLigandSmiles)
    } catch (error) {
      console.error('Failed to download network graph:', error)
    }
  }

  const nodeRadius = 45
  const imageSize = 70
  // Responsive square canvas — layout positions are computed for these dimensions
  // so scale=1, position=(0,0) is always a perfect fit with no zoomToFit needed.
  const width = Math.max(containerWidth - 24, 300)
  const height = width

  const layoutPositions = useMemo(
    () => computeNetworkGraphLayout(network, width, height, nodeRadius),
    [network, width, height, nodeRadius],
  )

  const nodePositions = layoutPositions.map((p) => ({
    node: p.node,
    x: p.x,
    y: p.y,
    imageUrl: imageDataUrls.get(p.node) ?? null,
    index: p.index,
  }))

  // Create a map for quick lookup
  const posMap = new Map(nodePositions.map((p) => [p.node, p]))

  // Get DDG value for an edge
  const getDdgForEdge = (a: string, b: string) => {
    return ddgValues.find(
      (d) => (d.ligand_a === a && d.ligand_b === b) || (d.ligand_a === b && d.ligand_b === a)
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
          <GitBranch className="w-4 h-4" />
          Network Graph ({network.topology.toUpperCase()})
        </h4>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-800 rounded-md border border-gray-700 mr-2">
             <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomOut}
              className="h-7 w-7 text-gray-400 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleResetView}
              className="h-7 w-7 text-gray-400 hover:text-white border-x border-gray-700 rounded-none"
              title="Reset View"
            >
              <Maximize className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleZoomIn}
              className="h-7 w-7 text-gray-400 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleViewGraph}
            disabled={isGenerating}
            className="bg-cyan-900/20 border-cyan-600/50 hover:bg-cyan-900/40 hover:border-cyan-600 text-cyan-300 disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            {isGenerating ? 'Generating...' : 'View Graph'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadGraph}
            disabled={isGenerating}
            className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-300"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="bg-gray-900/50 rounded-lg border border-gray-200/20 shadow-sm overflow-hidden relative min-h-[280px]"
        style={{ height: width }}
      >
        <div className="absolute top-2 left-2 z-10 pointer-events-none">
          <div className="bg-black/40 backdrop-blur-sm text-xs text-gray-400 px-2 py-1 rounded border border-white/10 flex items-center gap-1">
             <Move className="w-3 h-3" /> Drag to pan • Scroll to zoom
          </div>
        </div>
        
        <svg 
          ref={svgRef}
          width="100%" 
          height="100%" 
          className="cursor-move"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          viewBox={`0 0 ${width} ${height}`}
        >
          <g transform={`translate(${position.x}, ${position.y}) scale(${scale})`} transform-origin="center">
          <defs>
            {/* Define clip paths for all nodes */}
            {nodePositions.map((pos, i) => (
              <clipPath key={i} id={`clip-${i}`}>
                <circle cx={pos.x} cy={pos.y} r={nodeRadius - 3} />
              </clipPath>
            ))}
            {/* Arrow markers — dimensions in userSpaceOnUse tied to nodeRadius so
                arrowheads stay proportional to nodes as the canvas resizes.
                Keep aLen small (0.28×r) so there is always visible line before the tip. */}
            {(['#16a34a', '#dc2626', '#6b7280'] as const).map((fill, i) => {
              const id = ['arrow-green', 'arrow-red', 'arrow-gray'][i]
              const aLen = nodeRadius * 0.28
              const aHalf = nodeRadius * 0.14
              return (
                <marker
                  key={id}
                  id={id}
                  markerWidth={aLen + 2}
                  markerHeight={aHalf * 2 + 2}
                  refX={aLen}
                  refY={aHalf}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d={`M0,0 L0,${aHalf * 2} L${aLen},${aHalf} z`} fill={fill} />
                </marker>
              )
            })}
            {/* Drop shadow filter for nodes */}
            <filter id="node-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
              <feOffset dx="0" dy="1" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges as directional arrows */}
          {network.edges.map((edge, i) => {
            const from = posMap.get(edge.ligand_a)
            const to = posMap.get(edge.ligand_b)
            if (!from || !to) return null

            const ddg = getDdgForEdge(edge.ligand_a, edge.ligand_b)
            const edgeColor = ddg
              ? ddg.ddg_kcal_mol < 0
                ? '#16a34a'
                : '#dc2626'
              : '#6b7280'

            const markerId = ddg
              ? ddg.ddg_kcal_mol < 0
                ? 'arrow-green'
                : 'arrow-red'
              : 'arrow-gray'

            // Start from edge of source node, end at edge of target node.
            // gap = nodeRadius (circle edge) + effective arrow length.
            // Cap the arrow to ≤40% of the inner edge (space between circle borders)
            // so the visible line is always longer than the arrowhead.
            const dx = to.x - from.x
            const dy = to.y - from.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const arrowLen = nodeRadius * 0.28
            const innerEdge = Math.max(0, distance - 2 * nodeRadius)
            const effectiveArrow = Math.min(arrowLen, innerEdge * 0.4)
            const gap = nodeRadius + effectiveArrow
            const startX = from.x + dx * (gap / distance)
            const startY = from.y + dy * (gap / distance)
            const endX = from.x + dx * ((distance - gap) / distance)
            const endY = from.y + dy * ((distance - gap) / distance)

            // DDG label at center between nodes, offset perpendicular
            const midX = (from.x + to.x) / 2
            const midY = (from.y + to.y) / 2
            const perpAngle = Math.atan2(dy, dx) + Math.PI / 2
            const labelX = midX + Math.cos(perpAngle) * 14
            const labelY = midY + Math.sin(perpAngle) * 14

            return (
              <g key={i}>
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={edgeColor}
                  strokeWidth={2.5}
                  opacity={0.9}
                  markerEnd={`url(#${markerId})`}
                />
                {ddg && (
                  <g>
                    {/* Background circle for label */}
                    <circle
                      cx={labelX}
                      cy={labelY}
                      r="12"
                      fill="white"
                      stroke={edgeColor}
                      strokeWidth="1.5"
                      opacity="0.95"
                    />
                    {/* Label text */}
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fill={edgeColor}
                      fontWeight="600"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {ddg.ddg_kcal_mol.toFixed(1)}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {nodePositions.map((pos) => {
            const hasImage = !!pos.imageUrl
            const displayName = getDisplayName(pos.node)
            const cx = width / 2
            const cy = height / 2
            const isHub =
              network.topology === 'radial' &&
              Math.abs(pos.x - cx) < 0.01 &&
              Math.abs(pos.y - cy) < 0.01

            const imgSize = isHub ? 58 : imageSize
            const imgYOffset = isHub ? -5 : 0

            // Place labels on the OUTER side (away from center) so that arrows
            // arriving from the hub/center never collide with labels.
            // Upper-half nodes: label above (outer); lower-half nodes: label below (outer).
            // Hub label stays inside the circle via the isHub branch below.
            const labelBelow = pos.y > height / 2
            const labelY = isHub
              ? pos.y + 18
              : labelBelow
                ? pos.y + nodeRadius + 4
                : pos.y - nodeRadius - 4
            const labelBaseline = isHub
              ? 'middle'
              : labelBelow
                ? 'hanging'
                : 'auto'
            const labelBgY = isHub
              ? pos.y + 10
              : labelBelow
                ? pos.y + nodeRadius + 3
                : pos.y - nodeRadius - 18
            const estWidth = Math.max(displayName.length * 7 + 8, 30)
            return (
              <g key={pos.index} filter="url(#node-shadow)">
                {/* Ligand image */}
                {hasImage ? (
                  <image
                    href={pos.imageUrl!}
                    x={pos.x - imgSize / 2}
                    y={pos.y - imgSize / 2 + imgYOffset}
                    width={imgSize}
                    height={imgSize}
                    clipPath={`url(#clip-${pos.index})`}
                    style={{ cursor: 'pointer' }}
                  />
                ) : (
                  // Fallback circle
                  <g>
                    <circle cx={pos.x} cy={pos.y} r={nodeRadius - 5} fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.5" />
                  </g>
                )}
                {/* Ligand name label with white backing */}
                <rect
                  x={pos.x - estWidth / 2}
                  y={labelBgY}
                  width={estWidth}
                  height={15}
                  fill="white"
                  fillOpacity={0.85}
                  rx={3}
                />
                <text
                  x={pos.x}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline={labelBaseline}
                  fontSize="11"
                  fill="#111827"
                  fontWeight="600"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  className="select-none"
                >
                  {displayName}
                </text>
                {/* Invisible hit area for tooltip */}
                <circle cx={pos.x} cy={pos.y} r={nodeRadius} fill="transparent" style={{ cursor: 'pointer' }}>
                  <title>{pos.node}</title>
                </circle>
              </g>
            )
          })}
          </g>
        </svg>
      </div>
      <p className="text-xs text-gray-600 text-center mt-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-green-600"></span>
          Green arrows indicate improved binding
        </span>
        {' • '}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-red-600"></span>
          Red arrows indicate weaker binding
        </span>
      </p>
    </div>
  )
}

// Component to display docked poses for validation before continuing RBFE
interface DockedPosesPreviewProps {
  result: RBFEJob
  selectedPoseId: string | null
  onSelectPose: (poseId: string | null) => void
  onContinue?: () => void
  onClearPreview?: () => void
}

function DockedPosesPreview({
  result,
  selectedPoseId,
  onSelectPose,
  onContinue,
  onClearPreview,
}: DockedPosesPreviewProps) {
  const docked_poses = result.docked_poses || []
  const { addStructureTab } = useMolecularStore()
  const [visualizingPose, setVisualizingPose] = useState<string | null>(null)
  
  // Track which pose tab IDs have been created
  const [poseTabIds, setPoseTabIds] = useState<Record<string, string>>({})

  // Sort poses by alignment score (RMSD) if available, otherwise affinity
  const sortedPoses = [...docked_poses].sort((a, b) => {
    if (a.alignment_score !== undefined && b.alignment_score !== undefined) {
      return a.alignment_score - b.alignment_score
    }
    return a.affinity_kcal_mol - b.affinity_kcal_mol
  })

  // Handle visualizing a docked pose - creates a new tab with the complex PDB
  const handleVisualizePose = async (pose: DockedPoseInfo) => {
    setVisualizingPose(pose.ligand_id)
    try {
      // Fetch the complex PDB (protein + ligand) directly from backend
      const complexUrl = api.getRBFEFileUrl(result.job_id, pose.complex_pdb_path)
      const response = await fetch(complexUrl)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch complex PDB: ${response.status}`)
      }
      
      const complexPdbData = await response.text()
      
      // Create a new structure tab for this pose
      const poseStructure = {
        structure_id: `rbfe_pose_${result.job_id}_${pose.ligand_id}`,
        pdb_data: complexPdbData,
        metadata: {
          is_docked_pose: true,
          pose_affinity: pose.affinity_kcal_mol,
        },
      }
      
      // Add new tab for the pose (this automatically switches to the new tab)
      addStructureTab(poseStructure, `RBFE Pose: ${pose.ligand_id}`)
      
      // Track the pose as selected
      onSelectPose(pose.ligand_id)

    } catch (err: any) {
      console.error('Failed to visualize pose:', err)
      alert(`Failed to visualize pose: ${err.message}`)
    } finally {
      setVisualizingPose(null)
    }
  }

  return (
    <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-300px)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-amber-900/20 border border-amber-600/50 rounded-lg">
        <Beaker className="w-6 h-6 text-amber-400" />
        <div className="flex-1">
          <h3 className="text-white font-semibold">Alignment Completed - Review Poses</h3>
          <p className="text-sm text-gray-400">
            {docked_poses.length} ligands aligned. Review the binding poses before continuing with RBFE calculation.
          </p>
        </div>
      </div>

      {/* Pose info - shown when a pose is selected */}
      {selectedPoseId && (
        <div className="p-3 bg-cyan-900/20 rounded-lg border border-cyan-600/30 flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-cyan-300">
            Viewing pose: <strong>{selectedPoseId}</strong> (opens in new tab)
          </span>
        </div>
      )}

      {/* Job info */}
      <div className="text-xs text-gray-500 font-mono">
        Job ID: {result.job_id}
      </div>

      {/* Docked poses table */}
      {sortedPoses.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Aligned Poses
          </h4>
          <p className="text-xs text-gray-500 mb-2">Click on a row to open the pose in a new viewer tab</p>
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Ligand</th>
                  <th className="px-4 py-3 text-right text-gray-400 font-medium">Alignment Score (RMSD)</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium">MCS Size</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium">Pose Quality</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPoses.map((pose, index) => {
                  const affinity = pose.affinity_kcal_mol
                  const isSelected = selectedPoseId === pose.ligand_id
                  const isVisualizing = visualizingPose === pose.ligand_id
                  
                  // Determine quality based on alignment score (RMSD) or affinity
                  let qualityColor, qualityLabel
                  if (pose.alignment_score !== undefined) {
                    qualityColor = getRMSDQualityColor(pose.alignment_score)
                    qualityLabel = getRMSDQualityLabel(pose.alignment_score)
                  } else {
                    qualityColor = getAffinityQualityColor(affinity)
                    qualityLabel = getAffinityQualityLabel(affinity)
                  }

                  return (
                    <tr
                      key={pose.ligand_id}
                      className={`border-b border-gray-700/50 last:border-0 cursor-pointer transition-colors ${isSelected
                        ? 'bg-cyan-500/10'
                        : 'hover:bg-gray-700/30'
                        }`}
                      onClick={() => {
                        if (!isSelected) {
                          handleVisualizePose(pose)
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-5">{index + 1}.</span>
                          <span className="text-gray-200 font-medium">{pose.ligand_id}</span>
                          {isSelected && (
                            <span className="ml-2 text-xs bg-cyan-600 px-2 py-0.5 rounded">Viewing</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pose.alignment_score !== undefined ? (
                          <span className={`font-mono ${pose.alignment_score < 2.0 ? 'text-green-400' : pose.alignment_score < 3.0 ? 'text-yellow-400' : 'text-orange-400'}`}>
                            {pose.alignment_score.toFixed(3)} Å
                          </span>
                        ) : (
                          <span className={`font-mono ${affinity < -7 ? 'text-green-400' : affinity < -5 ? 'text-yellow-400' : 'text-orange-400'}`}>
                            {affinity.toFixed(2)} kcal/mol
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-gray-300 font-mono">
                          {pose.mcs_atoms ? pose.mcs_atoms : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${qualityColor}`}>
                          {qualityLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVisualizePose(pose)}
                          disabled={isVisualizing}
                          className="bg-cyan-900/20 border-cyan-700/50 hover:bg-cyan-900/40 hover:border-cyan-600"
                          title="Open pose in new viewer tab"
                        >
                          {isVisualizing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected pose details */}
      {selectedPoseId && (
        <SelectedPoseDetails
          pose={docked_poses.find((p) => p.ligand_id === selectedPoseId)}
          jobId={result.job_id}
        />
      )}

      {/* Docking statistics */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-300">Alignment Statistics</h4>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Best Score"
            value={sortedPoses.length > 0 ? (sortedPoses[0].alignment_score !== undefined ? `${sortedPoses[0].alignment_score.toFixed(3)}` : `${sortedPoses[0].affinity_kcal_mol.toFixed(2)}`) : 'N/A'}
            unit={sortedPoses.length > 0 && sortedPoses[0].alignment_score !== undefined ? "Å" : "kcal/mol"}
            color="text-green-400"
          />
          <StatCard
            label="Average Score"
            value={
              sortedPoses.length > 0
                ? (sortedPoses[0].alignment_score !== undefined 
                    ? `${(sortedPoses.reduce((acc, p) => acc + (p.alignment_score || 0), 0) / sortedPoses.length).toFixed(3)}`
                    : `${(sortedPoses.reduce((acc, p) => acc + p.affinity_kcal_mol, 0) / sortedPoses.length).toFixed(2)}`)
                : 'N/A'
            }
            unit={sortedPoses.length > 0 && sortedPoses[0].alignment_score !== undefined ? "Å" : "kcal/mol"}
            color="text-cyan-400"
          />
          <StatCard
            label="Ligands Aligned"
            value={sortedPoses.length.toString()}
            unit=""
            color="text-purple-400"
          />
        </div>
      </div>

      {/* Continue button - only show if onContinue is provided (not for viewing completed jobs) */}
      {onContinue && (
        <div className="flex flex-col items-center gap-4 pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 text-center">
            If the poses look correct, click Continue to proceed with the RBFE calculation.
          </p>
          <Button
            onClick={onContinue}
            className="w-full max-w-xs gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold py-3"
          >
            <PlayCircle className="w-5 h-5" />
            Continue with RBFE Calculation
          </Button>
          <p className="text-xs text-gray-500">
            This will continue the calculation with the docked poses shown above.
          </p>
        </div>
      )}
    </div>
  )
}

// Helper function to get affinity quality color
function getAffinityQualityColor(affinity: number): string {
  if (affinity < -8) return 'bg-green-500/20 text-green-400'
  if (affinity < -6) return 'bg-cyan-500/20 text-cyan-400'
  if (affinity < -4) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-orange-500/20 text-orange-400'
}

// Helper function to get affinity quality label
function getAffinityQualityLabel(affinity: number): string {
  if (affinity < -8) return 'Excellent'
  if (affinity < -6) return 'Good'
  if (affinity < -4) return 'Moderate'
  return 'Weak'
}

function getRMSDQualityColor(rmsd: number): string {
  if (rmsd < 1.0) return 'bg-green-500/20 text-green-400'
  if (rmsd < 2.0) return 'bg-cyan-500/20 text-cyan-400'
  if (rmsd < 3.0) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-orange-500/20 text-orange-400'
}

function getRMSDQualityLabel(rmsd: number): string {
  if (rmsd < 1.0) return 'Excellent'
  if (rmsd < 2.0) return 'Good'
  if (rmsd < 3.0) return 'Moderate'
  return 'Poor'
}

// Selected pose details component
interface SelectedPoseDetailsProps {
  pose?: DockedPoseInfo
  jobId: string
}

function SelectedPoseDetails({ pose, jobId }: SelectedPoseDetailsProps) {
  if (!pose) return null

  return (
    <div className="p-4 bg-gray-800/30 rounded-lg border border-cyan-500/30">
      <h4 className="text-sm font-semibold text-cyan-400 mb-3">
        Selected: {pose.ligand_id}
      </h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-400">Alignment Score:</span>
          {pose.alignment_score !== undefined ? (
            <span className={`ml-2 font-mono ${pose.alignment_score < 2.0 ? 'text-green-400' : 'text-yellow-400'}`}>
              {pose.alignment_score.toFixed(3)} Å
            </span>
          ) : (
            <span className={`ml-2 font-mono ${pose.affinity_kcal_mol < -6 ? 'text-green-400' : 'text-yellow-400'}`}>
              {pose.affinity_kcal_mol.toFixed(2)} kcal/mol
            </span>
          )}
        </div>
        {pose.mcs_atoms && (
          <div>
            <span className="text-gray-400">MCS Size:</span>
            <span className="ml-2 text-gray-300 font-mono">{pose.mcs_atoms} atoms</span>
          </div>
        )}
        <div>
          <span className="text-gray-400">Pose File:</span>
          <span className="ml-2 text-gray-300 text-xs font-mono">{pose.pose_pdb_path}</span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-400">Complex File:</span>
          <span className="ml-2 text-gray-300 text-xs font-mono">{pose.complex_pdb_path}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Tip: Download PDB files from the job folder to visualize poses in your preferred molecular viewer.
      </p>
    </div>
  )
}

// Stat card for docking statistics
interface StatCardProps {
  label: string
  value: string
  unit: string
  color: string
}

function StatCard({ label, value, unit, color }: StatCardProps) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>
        {value}
        {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  )
}

// ── Overlap matrices ──────────────────────────────────────────────────────────

function OverlapHeatmap({ matrix, label }: { matrix: number[][]; label: string }) {
  const n = matrix.length
  const { addImageFileTab, setActiveTab: setViewerTab } = useMolecularStore()

  const cellColor = (v: number): string => {
    const t = Math.max(0, Math.min(1, v))
    const r = Math.round(255 - t * 180)
    const g = Math.round(255 - t * 160)
    return `rgb(${r},${g},255)`
  }

  // Nearest-neighbour values (super-diagonal) to check sampling quality
  const neighbors: number[] = []
  for (let i = 0; i < n - 1; i++) neighbors.push(matrix[i][i + 1])
  const minNeighbor = neighbors.length > 0 ? Math.min(...neighbors) : 0
  const avgNeighbor = neighbors.length > 0 ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : 0
  const poor = minNeighbor < 0.03

  const handleEnlarge = () => {
    const cellPx = 40
    const sidePad = 24
    const headerH = 52  // room for title (18px) + gap + quality label (14px) + gap
    const footerH = 36  // legend bar + labels
    const gridW = n * cellPx
    const gridH = n * cellPx
    const totalW = gridW + sidePad * 2
    const totalH = headerH + gridH + footerH
    const fontSize = 11
    const gridX = sidePad
    const gridY = headerH

    const cells = matrix.flatMap((row, i) =>
      row.map((v, j) => {
        const x = gridX + j * cellPx
        const y = gridY + i * cellPx
        const bg = cellColor(v)
        const text = v >= 0.005 ? v.toFixed(2).replace('0.', '.') : '0'
        return `<rect x="${x}" y="${y}" width="${cellPx}" height="${cellPx}" fill="${bg}" stroke="white" stroke-width="0.5"/>
<text x="${x + cellPx / 2}" y="${y + cellPx / 2 + fontSize * 0.38}" text-anchor="middle" font-size="${fontSize}" fill="black" font-family="monospace">${text}</text>`
      })
    ).join('\n')

    const qualityText = poor
      ? `min λ±1: ${minNeighbor.toFixed(3)} ⚠`
      : `avg λ±1: ${avgNeighbor.toFixed(3)} ✓`
    const qualityColor = poor ? '#b91c1c' : '#15803d'

    const gradId = 'omg1'
    const barY = headerH + gridH + 8
    const legend = `
<defs><linearGradient id="${gradId}" x1="0" x2="1" y1="0" y2="0">
  <stop offset="0%" stop-color="rgb(255,255,255)"/>
  <stop offset="100%" stop-color="rgb(75,95,255)"/>
</linearGradient></defs>
<rect x="${gridX}" y="${barY}" width="${gridW}" height="10" fill="url(#${gradId})" rx="2" stroke="#ccc" stroke-width="0.5"/>
<text x="${gridX}" y="${barY + 24}" font-size="10" fill="#444" font-family="sans-serif">0</text>
<text x="${gridX + gridW}" y="${barY + 24}" font-size="10" fill="#444" font-family="sans-serif" text-anchor="end">1</text>`

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
<rect width="${totalW}" height="${totalH}" fill="white"/>
<text x="${totalW / 2}" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#111" font-family="sans-serif">${label}</text>
<text x="${totalW / 2}" y="40" text-anchor="middle" font-size="11" fill="${qualityColor}" font-family="sans-serif">${qualityText}</text>
${cells}
${legend}
</svg>`

    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const tabId = addImageFileTab(url, `Overlap Matrix – ${label}`)
    setViewerTab(tabId)
  }

  return (
    <div className="space-y-1 min-w-0 bg-white rounded p-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-800 font-semibold">{label}</span>
        <span className={`text-xs px-1 py-0.5 rounded font-medium ${poor ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {poor ? `min: ${minNeighbor.toFixed(2)}` : `avg: ${avgNeighbor.toFixed(2)}`}
        </span>
        <button
          onClick={handleEnlarge}
          title="Open in viewer"
          className="ml-auto p-0.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gap: '1px',
          width: '100%',
        }}
      >
        {matrix.flatMap((row, i) =>
          row.map((v, j) => (
            <div
              key={`${i}-${j}`}
              title={`λ${i} ↔ λ${j}: ${v.toFixed(4)}`}
              style={{
                backgroundColor: cellColor(v),
                aspectRatio: '1',
                cursor: 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '6px',
                color: 'black',
                overflow: 'hidden',
              }}
            >
              {v >= 0.005 ? v.toFixed(2).replace('0.', '.') : '0'}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-1 pt-0.5">
        <span className="text-xs text-gray-700 font-medium">0</span>
        <div className="flex-1 h-1.5 rounded" style={{ background: 'linear-gradient(to right, rgb(255,255,255), rgb(75,95,255))' }} />
        <span className="text-xs text-gray-700 font-medium">1</span>
      </div>
    </div>
  )
}

function OverlapMatrices({ transformationResults }: { transformationResults: RBFETransformationResult[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  const edges = useMemo(() => {
    const map = new Map<string, {
      complex?: number[][] | null; solvent?: number[][] | null
      complex_path?: string; solvent_path?: string
    }>()
    for (const tr of transformationResults) {
      if (!tr.ligand_a || !tr.ligand_b) continue
      if (!tr.overlap_matrix && !tr.overlap_matrix_path) continue
      const key = `${tr.ligand_a}|${tr.ligand_b}`
      const entry = map.get(key) ?? {}
      if (tr.leg === 'complex') { entry.complex = tr.overlap_matrix; entry.complex_path = tr.overlap_matrix_path ?? undefined }
      if (tr.leg === 'solvent') { entry.solvent = tr.overlap_matrix; entry.solvent_path = tr.overlap_matrix_path ?? undefined }
      map.set(key, entry)
    }
    return Array.from(map.entries())
  }, [transformationResults])

  if (edges.length === 0) return null

  const clampedIdx = Math.min(selectedIdx, edges.length - 1)
  const [key, { complex, solvent, complex_path, solvent_path }] = edges[clampedIdx]
  const [ligandA, ligandB] = key.split('|')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-gray-300">Phase Space Overlap Matrices</h4>
        <div className="group relative">
          <div className="cursor-help text-xs text-gray-500 border border-gray-600 rounded-full w-4 h-4 flex items-center justify-center">?</div>
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-72 p-2 bg-gray-900 text-xs text-gray-300 rounded border border-gray-700 shadow-lg z-20">
            Each cell shows the phase-space overlap between λ windows i and j. Nearest-neighbour values (super-diagonal) should be ≥ 0.03 for reliable free energy estimates.
          </div>
        </div>
      </div>

      {/* Navigation row */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSelectedIdx(i => Math.max(0, i - 1))}
          disabled={clampedIdx === 0}
          className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <select
          value={clampedIdx}
          onChange={e => setSelectedIdx(Number(e.target.value))}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-gray-500 truncate"
        >
          {edges.map(([k], i) => {
            const [a, b] = k.split('|')
            return <option key={k} value={i}>{a} → {b}</option>
          })}
        </select>
        <button
          onClick={() => setSelectedIdx(i => Math.min(edges.length - 1, i + 1))}
          disabled={clampedIdx === edges.length - 1}
          className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Matrices side by side */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-3">
        <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
          <span className="font-medium text-gray-300">{ligandA}</span>
          <ArrowRight className="w-3 h-3 text-gray-500" />
          <span className="font-medium text-gray-300">{ligandB}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            {complex
              ? <OverlapHeatmap matrix={complex} label="Complex" />
              : complex_path
                ? <img src={resolveApiFileUrl(complex_path)} alt="MBAR overlap matrix (complex)" className="w-full rounded border border-gray-700" />
                : <div className="h-16 bg-gray-800/40 rounded border border-gray-700 flex items-center justify-center text-xs text-gray-600">N/A</div>
            }
          </div>
          <div>
            {solvent
              ? <OverlapHeatmap matrix={solvent} label="Solvent" />
              : solvent_path
                ? <img src={resolveApiFileUrl(solvent_path)} alt="MBAR overlap matrix (solvent)" className="w-full rounded border border-gray-700" />
                : <div className="h-16 bg-gray-800/40 rounded border border-gray-700 flex items-center justify-center text-xs text-gray-600">N/A</div>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
