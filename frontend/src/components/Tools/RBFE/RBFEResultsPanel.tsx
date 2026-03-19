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
} from 'lucide-react'
import { Button } from '@/components/ui/button' // Used in DockedPosesPreview
import { api } from '@/lib/api-client'
import { useMolecularStore } from '@/store/molecular-store'
import { useRBFEStore } from '@/store/rbfe-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { UnifiedJobList } from '../shared'
import {
  generateNetworkGraphSVG,
  generateNetworkGraphSVGWithImages,
  downloadNetworkGraphSVG,
  svgToDataUrl,
} from '@/lib/rbfe-network-export'
import type { RBFEJob, RBFENetworkData, RBFEDdGValue, DockedPoseInfo, LigandSelection, AlignmentInfo, RBFETransformationResult } from '@/types/rbfe-types'
import { AlignmentPreview } from './AlignmentPreview'

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

// Helper to check if a job status indicates completion
const isCompletedStatus = (status: string | undefined): boolean => {
  const completedStatuses = new Set([
    'completed',
    'success',
    'successful',
    'finished',
    'done',
  ])
  return completedStatuses.has((status || '').toLowerCase())
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

  const filteredJobs = getFilteredJobs().filter(j => j.service === 'rbfe')

  // Use ref for callback to avoid dependency issues causing infinite loops
  const onJobsLoadedRef = useRef(onJobsLoaded)
  useEffect(() => {
    onJobsLoadedRef.current = onJobsLoaded
  }, [onJobsLoaded])

  // No longer need local loadJobs as it's handled by unified store

  // Auto-select most recent completed job if none selected
  useEffect(() => {
    if (!activeJobId && !result && jobs.length > 0) {
      const completedJobs = jobs.filter(j => isCompletedStatus(j.status))
      if (completedJobs.length > 0) {
        const sorted = [...completedJobs].sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        )
        onSelectJob(sorted[0].job_id)
        setResultsTab('completed')
      }
    }
  }, [jobs, activeJobId, result, onSelectJob])

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
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <GitBranch className="w-12 h-12 mb-4 opacity-50" />
          <p>No RBFE results yet</p>
          <p className="text-sm mt-1">Configure and run a calculation to see results, or select a job above</p>
        </div>
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

function NetworkGraph({ network, ddgValues, availableLigands }: NetworkGraphProps) {
  const { addImageFileTab } = useMolecularStore()
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Zoom and Pan state
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
      const svgString = await generateNetworkGraphSVGWithImages(network, ddgValues, availableLigands)
      const imageUrl = svgToDataUrl(svgString)
      addImageFileTab(imageUrl, `RBFE Network Graph (${network.topology.toUpperCase()})`)
    } catch (error) {
      console.error('Failed to generate network graph:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadGraph = () => {
    try {
      downloadNetworkGraphSVG(network, ddgValues, availableLigands, `rbfe_network_${network.topology}.svg`)
    } catch (error) {
      console.error('Failed to download network graph:', error)
    }
  }

  // Enhanced visualization with better spacing and styling
  const nodeRadius = 45
  const imageSize = 70
  const width = 600
  const height = 400
  const padding = 40

  // Calculate node positions in a circle with better spacing
  const nodePositions = network.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / network.nodes.length - Math.PI / 2
    const radius = Math.min(width, height) / 2 - nodeRadius - padding
    const smiles = getLigandSmiles(node, availableLigands)
    const imageUrl = getLigandImageUrl(smiles)

    return {
      node,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      imageUrl,
      index: i,
    }
  })

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
        className="bg-gray-900/50 rounded-lg border border-gray-200/20 shadow-sm overflow-hidden relative"
        style={{ height: height }}
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
            {/* Define arrow markers for directional edges - larger and more visible */}
            <marker
              id="arrow-green"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,7 L10,3.5 z" fill="#16a34a" stroke="#16a34a" strokeWidth="0.5" />
            </marker>
            <marker
              id="arrow-red"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,7 L10,3.5 z" fill="#dc2626" stroke="#dc2626" strokeWidth="0.5" />
            </marker>
            <marker
              id="arrow-gray"
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,7 L10,3.5 z" fill="#6b7280" stroke="#6b7280" strokeWidth="0.5" />
            </marker>
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

            // Calculate arrow endpoint (shortened to avoid overlapping with node)
            const dx = to.x - from.x
            const dy = to.y - from.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const shorten = nodeRadius + 15 // Shorten by node radius + padding to prevent DDG circles from touching arrows
            const ratio = (distance - shorten) / distance
            const endX = from.x + dx * ratio
            const endY = from.y + dy * ratio

            // Calculate label position (offset perpendicular to the arrow)
            const midX = (from.x + endX) / 2
            const midY = (from.y + endY) / 2
            const perpAngle = Math.atan2(dy, dx) + Math.PI / 2
            const labelOffset = 12
            const labelX = midX + Math.cos(perpAngle) * labelOffset
            const labelY = midY + Math.sin(perpAngle) * labelOffset

            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
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
            return (
              <g key={pos.index} filter="url(#node-shadow)">
                {/* Ligand image with subtle shadow */}
                {hasImage ? (
                  <g>
                    <image
                      href={pos.imageUrl!}
                      x={pos.x - imageSize / 2}
                      y={pos.y - imageSize / 2}
                      width={imageSize}
                      height={imageSize}
                      clipPath={`url(#clip-${pos.index})`}
                      style={{ cursor: 'pointer' }}
                    />
                    {/* Tooltip area - invisible but captures hover */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={nodeRadius}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{getDisplayName(pos.node)}</title>
                    </circle>
                  </g>
                ) : (
                  // Fallback to text if no image available
                  <g>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={nodeRadius - 5}
                      fill="#f3f4f6"
                      stroke="#d1d5db"
                      strokeWidth="1.5"
                    />
                    <text
                      x={pos.x}
                      y={pos.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="12"
                      fill="#374151"
                      className="select-none"
                      fontWeight="600"
                      fontFamily="system-ui, -apple-system, sans-serif"
                    >
                      {getDisplayName(pos.node).length > 10 ? getDisplayName(pos.node).slice(0, 8) + '..' : getDisplayName(pos.node)}
                    </text>
                    {/* Tooltip area for text nodes */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={nodeRadius}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{getDisplayName(pos.node)}</title>
                    </circle>
                  </g>
                )}
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

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${poor ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
          {poor ? `min λ±1: ${minNeighbor.toFixed(3)}` : `avg λ±1: ${avgNeighbor.toFixed(3)}`}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, 22px)`,
          gap: '1px',
        }}
      >
        {matrix.flatMap((row, i) =>
          row.map((v, j) => (
            <div
              key={`${i}-${j}`}
              title={`λ${i} ↔ λ${j}: ${v.toFixed(4)}`}
              style={{
                backgroundColor: cellColor(v),
                width: '22px',
                height: '22px',
                fontSize: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: v > 0.5 ? 'rgba(20,40,80,0.8)' : 'rgba(100,100,100,0.6)',
                cursor: 'default',
              }}
            >
              {v >= 0.005 ? v.toFixed(2).replace('0.', '.') : '0'}
            </div>
          ))
        )}
      </div>
      {/* Colour legend */}
      <div className="flex items-center gap-1 pt-0.5">
        <span className="text-xs text-gray-600">0</span>
        <div className="flex-1 h-1.5 rounded" style={{ background: 'linear-gradient(to right, rgb(255,255,255), rgb(75,95,255))' }} />
        <span className="text-xs text-gray-600">1</span>
      </div>
    </div>
  )
}

function OverlapMatrices({ transformationResults }: { transformationResults: RBFETransformationResult[] }) {
  const edges = useMemo(() => {
    const map = new Map<string, { complex?: number[][] | null; solvent?: number[][] | null }>()
    for (const tr of transformationResults) {
      if (!tr.overlap_matrix || !tr.ligand_a || !tr.ligand_b) continue
      const key = `${tr.ligand_a}|${tr.ligand_b}`
      const entry = map.get(key) ?? {}
      if (tr.leg === 'complex') entry.complex = tr.overlap_matrix
      if (tr.leg === 'solvent') entry.solvent = tr.overlap_matrix
      map.set(key, entry)
    }
    return Array.from(map.entries())
  }, [transformationResults])

  if (edges.length === 0) return null

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
      <div className="space-y-3">
        {edges.map(([key, { complex, solvent }]) => {
          const [ligandA, ligandB] = key.split('|')
          return (
            <div key={key} className="bg-gray-800/50 rounded-lg border border-gray-700 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <span className="font-medium">{ligandA}</span>
                <ArrowRight className="w-3 h-3 text-gray-500" />
                <span className="font-medium">{ligandB}</span>
              </div>
              <div className="flex flex-wrap gap-6">
                {complex && <OverlapHeatmap matrix={complex} label="Complex" />}
                {solvent && <OverlapHeatmap matrix={solvent} label="Solvent" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
