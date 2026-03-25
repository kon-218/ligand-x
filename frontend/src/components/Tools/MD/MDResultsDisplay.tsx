'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Download, Eye, Play, FileText, Loader2, Flame, BarChart2 } from 'lucide-react'
import { MDTrajectoryAnalysis } from './MDTrajectoryAnalysis'
import { MDAnalyticsPanel } from './MDAnalyticsPanel'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { useABFEStore } from '@/store/abfe-store'
import { api } from '@/lib/api-client'
import type { MDResult, MDAnalyticsData } from '@/types/md-types'

interface MDResultsDisplayProps {
  result: MDResult
  jobId: string
  isRunning?: boolean
  onResumePreview?: () => void
  onResumeMinimized?: () => void
  isReadOnly?: boolean
  parameters?: any
}

export function MDResultsDisplay({ 
  result, 
  jobId, 
  isRunning = false, 
  onResumePreview,
  onResumeMinimized,
  isReadOnly = false,
  parameters 
}: MDResultsDisplayProps) {
  const { addStructureTab, addInputFileTab, setCurrentStructure } = useMolecularStore()
  const { addNotification, setActiveTool } = useUIStore()
  const abfeStore = useABFEStore()
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [settingUpABFE, setSettingUpABFE] = useState(false)
  const [recomputedAnalytics, setRecomputedAnalytics] = useState<MDAnalyticsData | null>(null)
  const [isRecomputing, setIsRecomputing] = useState(false)

  const handleRecomputeAnalytics = async () => {
    setIsRecomputing(true)
    try {
      const { analytics } = await api.recomputeMDAnalytics(jobId)
      setRecomputedAnalytics(analytics)
      addNotification('success', 'Analytics recomputed successfully')
    } catch (e) {
      addNotification('error', 'Failed to recompute analytics')
    } finally {
      setIsRecomputing(false)
    }
  }

  const handleDownload = (filepath: string, filename: string) => {
    // Ensure filepath is a clean string (remove any unexpected suffixes like :1, :2, etc.)
    const cleanPath = String(filepath).split(':')[0].trim()
    if (!cleanPath) {
      addNotification('error', 'Invalid file path')
      return
    }

    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    // Use MD service endpoint for MD output files
    const downloadUrl = `${API_BASE_URL}/api/md/download_file?filepath=${encodeURIComponent(cleanPath)}`

    // Create a temporary link and trigger download
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleView = async (filepath: string, filename: string, key: string) => {
    console.log('🔍 handleView called:', { filepath, filename, key })

    // Handle trajectories separately
    if (key.includes('trajectory') || key.includes('TRAJECTORY')) {
      console.log('📹 Routing to handleViewTrajectory')
      await handleViewTrajectory(filepath, filename, key)
      return
    }

    // Handle log files (equilibration log, etc.) - view as text file
    if (key.includes('log') || key.includes('LOG') || filename.endsWith('.log')) {
      console.log('[FILE] Routing to handleViewLogFile')
      await handleViewLogFile(filepath, filename, key)
      return
    }

    console.log('🧬 Routing to PDB viewer')
    // Ensure filepath is a clean string (remove any unexpected suffixes like :1, :2, etc.)
    const cleanPath = String(filepath).split(':')[0].trim()
    if (!cleanPath) {
      addNotification('error', 'Invalid file path')
      return
    }

    setViewingFile(key)
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      // Use MD service endpoint for MD output files
      const response = await fetch(`${API_BASE_URL}/api/md/download_file?filepath=${encodeURIComponent(cleanPath)}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`)
      }

      const pdbData = await response.text()

      // Create structure object
      const uniqueId = jobId 
        ? `${filename.replace('.pdb', '')}_${jobId}`
        : `${filename.replace('.pdb', '')}_${Date.now()}`

      const structure = {
        structure_id: uniqueId,
        pdb_data: pdbData,
        format: 'pdb' as const,
        components: {
          protein: [],
          ligands: [],
          water: [],
          ions: []
        },
      }

      // Add to viewer
      addStructureTab(structure, filename.replace('.pdb', ''))
      addNotification('success', `Loaded ${filename} into viewer`)
    } catch (error: any) {
      console.error('Failed to load structure:', error)
      addNotification('error', `Failed to load structure: ${error.message || 'Unknown error'}`)
    } finally {
      setViewingFile(null)
    }
  }

  const handleViewLogFile = async (filepath: string, filename: string, key: string) => {
    const cleanPath = String(filepath).split(':')[0].trim()
    if (!cleanPath) {
      addNotification('error', 'Invalid file path')
      return
    }

    setViewingFile(key)
    try {
      addNotification('info', 'Loading log file...')
      console.log(`[FILE] Loading log file: ${cleanPath}`)

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      // Use MD service endpoint for MD output files
      const response = await fetch(`${API_BASE_URL}/api/md/download_file?filepath=${encodeURIComponent(cleanPath)}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch log file: ${response.statusText}`)
      }

      const logContent = await response.text()

      // Determine a friendly name for the log file
      let logName = filename.replace('.log', '')
      if (key.includes('console') || key.includes('CONSOLE')) {
        logName = 'Console Output'
      } else if (key.includes('equilibration') || key.includes('EQUILIBRATION')) {
        logName = 'Equilibration Data'
      } else if (key.includes('optimization') || key.includes('OPTIMIZATION')) {
        logName = 'Optimization Log'
      } else {
        logName = logName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }

      // Add as input file tab (same as ORCA input files)
      addInputFileTab(logContent, logName)
      addNotification('success', `Opened ${logName} in viewer`)

      console.log(`SUCCESS: Log file loaded: ${logName} (${logContent.length} characters)`)
    } catch (error: any) {
      console.error('Failed to load log file:', error)
      addNotification('error', `Failed to load log file: ${error.message || 'Unknown error'}`)
    } finally {
      setViewingFile(null)
    }
  }

  const handleViewTrajectory = async (filepath: string, filename: string, key: string) => {
    const cleanPath = String(filepath).split(':')[0].trim()
    if (!cleanPath) {
      addNotification('error', 'Invalid trajectory path')
      return
    }

    setViewingFile(key)
    try {
      // Detect if this is NPT trajectory (typically larger)
      const isNPT = key.toLowerCase().includes('npt')
      const loadingMessage = isNPT
        ? 'Loading NPT trajectory... This may take a minute or two due to larger size.'
        : 'Loading trajectory... This may take a moment.'

      addNotification('info', loadingMessage)
      console.log(`[PROCESS] Loading trajectory: ${cleanPath} (NPT: ${isNPT})`)

      // Convert trajectory to multi-model PDB
      const startTime = Date.now()
      const trajectoryData = await api.getTrajectoryFrames(cleanPath)
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(1)

      console.log(`SUCCESS: Trajectory conversion completed in ${loadTime}s`)
      console.log(`[INFO] Trajectory data: ${trajectoryData.num_frames} frames, PDB data length: ${trajectoryData.pdb_data?.length || 0} chars`)

      if (!trajectoryData.pdb_data) {
        throw new Error('Failed to convert trajectory to PDB format')
      }

      if (trajectoryData.pdb_data.length === 0) {
        throw new Error('Trajectory PDB data is empty')
      }

      // Create structure object with trajectory PDB data
      const uniqueId = jobId 
        ? `${filename.replace('.dcd', '_trajectory')}_${jobId}`
        : `${filename.replace('.dcd', '_trajectory')}_${Date.now()}`

      const structure = {
        structure_id: uniqueId,
        pdb_data: trajectoryData.pdb_data,
        format: 'pdb' as const,
        components: {
          protein: [],
          ligands: [],
          water: [],
          ions: []
        },
        isTrajectory: true, // Mark as trajectory for special handling
      }

      console.log(`[PACKAGE] Adding trajectory to viewer: ${uniqueId} (${trajectoryData.num_frames} frames)`)

      // Add to viewer
      addStructureTab(structure, filename.replace('.dcd', '_trajectory'))
      addNotification(
        'success',
        `Loaded trajectory (${trajectoryData.num_frames} frames) into viewer. Use animation controls to play.`
      )
    } catch (error: any) {
      console.error('ERROR: Failed to load trajectory:', error)
      addNotification('error', error.message || 'Failed to load trajectory')
    } finally {
      setViewingFile(null)
    }
  }

  // Check if this MD job is an equilibration (not minimization only)
  const isEquilibrationJob = (): boolean => {
    // Check from parameters or result
    const isMinOnly = result?.minimization_only || parameters?.minimization_only
    return !isMinOnly && result?.success === true
  }

  // Get the final equilibrated structure path (NVT or final PDB)
  const getEquilibratedStructurePath = (): string | null => {
    if (!result?.output_files) return null
    // Prefer NVT equilibrated structure, fall back to final or minimized
    return result.output_files.nvt_pdb || 
           result.output_files.final_pdb || 
           result.output_files.equilibrated_pdb ||
           null
  }

  // Handle setting up ABFE from MD equilibration output
  const handleSetupABFE = async () => {
    setSettingUpABFE(true)
    try {
      const equilibratedPath = getEquilibratedStructurePath()
      if (!equilibratedPath) {
        throw new Error('No equilibrated structure found in MD output')
      }

      const cleanPath = String(equilibratedPath).split(':')[0].trim()
      addNotification('info', 'Extracting ligand from equilibrated structure...')

      // Fetch the equilibrated PDB
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE_URL}/api/md/download_file?filepath=${encodeURIComponent(cleanPath)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch equilibrated structure: ${response.statusText}`)
      }

      const pdbData = await response.text()

      // Extract ligand from the equilibrated complex
      const extractResult = await api.extractLigandFromComplex(pdbData)
      if (!extractResult.success) {
        throw new Error(extractResult.error || 'Failed to extract ligand from equilibrated structure')
      }

      const ligandData = extractResult.ligand_sdf || extractResult.ligand_pdb
      const ligandFormat = extractResult.ligand_sdf ? 'sdf' : 'pdb'
      if (!ligandData) {
        throw new Error('No ligand data extracted from equilibrated structure')
      }

      // Load the equilibrated complex into the molecular store
      const structure = {
        structure_id: `md_equilibrated_${jobId || Date.now()}`,
        pdb_data: pdbData,
        format: 'pdb' as const,
        components: {
          protein: [],
          ligands: [],
          water: [],
          ions: []
        },
      }
      setCurrentStructure(structure)

      // Set up ABFE with the extracted ligand
      abfeStore.reset()
      abfeStore.setSelectedProtein('current')
      abfeStore.setPreloadedLigand({
        name: `MD Equilibrated Ligand`,
        data: ligandData,
        format: ligandFormat,
        source: 'md_equilibration',
      })
      
      // Navigate to ABFE tool at step 2 (parameters) so user can adjust settings
      abfeStore.setStep(2)
      setActiveTool('abfe')

      addNotification('success', 'ABFE calculation set up from MD equilibration. Adjust parameters and run.')
    } catch (err: any) {
      console.error('Failed to set up ABFE:', err)
      addNotification('error', err.message || 'Failed to set up ABFE from MD output')
    } finally {
      setSettingUpABFE(false)
    }
  }

  const isPDBFile = (key: string) => {
    // Check if it's a PDB file (not a trajectory or log)
    return !key.includes('trajectory') && !key.includes('TRAJECTORY') && !key.includes('log') && !key.includes('LOG')
  }

  const isTrajectoryFile = (key: string) => {
    // Check if it's a trajectory file
    return key.includes('trajectory') || key.includes('TRAJECTORY')
  }

  const isLogFile = (key: string) => {
    // Check if it's a log file
    return key.includes('log') || key.includes('LOG')
  }

  const renderOutputFilesSection = (outputFiles?: Record<string, string | undefined>) => {
    if (!outputFiles || Object.keys(outputFiles).length === 0) return null

    const validFiles = Object.entries(outputFiles).filter(([, path]) => path)
    if (validFiles.length === 0) return null

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Output Files:</h4>
        <div className="space-y-2">
          {validFiles.map(([key, path]) => {
            if (!path) return null
            const cleanPath = String(path).split(':')[0].trim()
            const filename = cleanPath.split('/').pop() || `${key}.pdb`
            const canView = isPDBFile(key)
            const isViewing = viewingFile === key
            const isTrajectory = isTrajectoryFile(key)
            const isProductionTrajectory = key.toLowerCase().includes('production') && isTrajectory
            const canViewTrajectory = isTrajectory && !isProductionTrajectory
            const isLog = isLogFile(key)
            const canViewLog = isLog

            return (
              <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-gray-800">
                <span className="text-sm text-gray-300">{key.replace(/_/g, ' ').toUpperCase()}</span>
                <div className="flex gap-2">
                  {(canView || canViewTrajectory || canViewLog) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-blue-900/20 border-blue-700/50 hover:bg-blue-900/40 hover:border-blue-600"
                      onClick={() => handleView(cleanPath, filename, key)}
                      disabled={isViewing}
                    >
                      {isViewing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isTrajectory ? (
                        <Play className="w-4 h-4 mr-1" />
                      ) : isLog ? (
                        <FileText className="w-4 h-4 mr-1" />
                      ) : (
                        <Eye className="w-4 h-4 mr-1" />
                      )}
                      {isTrajectory ? 'View Trajectory' : isLog ? 'View Log' : 'View'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-gray-700 hover:bg-gray-600"
                    onClick={() => handleDownload(cleanPath, filename)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {result?.status === 'preview_ready' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold mb-4">System Preview Ready</h3>
          <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded">
            <div className="flex items-center mb-3">
              <CheckCircle className="w-6 h-6 text-blue-400 mr-2" />
              <div>
                <p className="font-semibold text-blue-100">System prepared for inspection</p>
                <p className="text-sm text-blue-200">{result.message}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Load <span className="text-blue-200 font-semibold">SYSTEM_PDB</span> below to inspect the solvated complex. When you&apos;re ready,
              continue to minimization and equilibration.
            </p>
            {!isReadOnly && onResumePreview && (
              <div className="mt-4 flex gap-3">
                <Button
                  className="bg-green-600 hover:bg-green-500"
                  onClick={onResumePreview}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resuming...
                    </>
                  ) : (
                    'Continue to Equilibration'
                  )}
                </Button>
              </div>
            )}
          </div>
          {renderOutputFilesSection(result.output_files)}
        </div>
      )}

      {result?.status === 'minimized_ready' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold mb-4">Minimization Complete (Paused)</h3>
          <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded">
            <div className="flex items-center mb-3">
              <CheckCircle className="w-6 h-6 text-blue-400 mr-2" />
              <div>
                <p className="font-semibold text-blue-100">Minimization Paused</p>
                <p className="text-sm text-blue-200">{result.message}</p>
              </div>
            </div>
            {result.final_energy && (
              <div className="mb-3 p-2 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-400">Minimized Energy</p>
                <p className="text-lg font-semibold text-blue-400">{result.final_energy.toFixed(2)} kJ/mol</p>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Load <span className="text-blue-200 font-semibold">MINIMIZED_PDB</span> below to inspect the structure.
            </p>
            {!isReadOnly && onResumeMinimized && (
              <div className="mt-4 flex gap-3">
                <Button
                  className="bg-green-600 hover:bg-green-500"
                  onClick={onResumeMinimized}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resuming...
                    </>
                  ) : (
                    'Continue to Equilibration'
                  )}
                </Button>
              </div>
            )}
          </div>
          {renderOutputFilesSection(result.output_files)}
        </div>
      )}

      {result?.success && result.status !== 'preview_ready' && result.status !== 'minimized_ready' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold mb-4">MD Results</h3>
          {/* Status */}
          <div className={`p-4 rounded border ${result.success ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
            <div className="flex items-center">
              {result.success ? (
                <CheckCircle className="w-6 h-6 text-green-400 mr-2" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400 mr-2" />
              )}
              <span className={`font-semibold ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                {result.success
                  ? ((result.minimization_only || parameters?.minimization_only) ? 'MD Minimization Complete' : 'MD Optimization Complete')
                  : 'MD Optimization Failed'}
              </span>
            </div>
            {result.message && <p className="text-sm text-gray-300 mt-2">{result.message}</p>}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            {result.final_energy !== undefined && (
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-400">Final Energy</p>
                <p className="text-lg font-semibold text-blue-400">{result.final_energy.toFixed(2)} kJ/mol</p>
              </div>
            )}
            {result.average_rmsd !== undefined && (
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-400">Average RMSD</p>
                <p className="text-lg font-semibold text-blue-400">{result.average_rmsd.toFixed(3)} Å</p>
              </div>
            )}
            {result.execution_time !== undefined && (
              <div className="p-3 bg-gray-800 rounded">
                <p className="text-xs text-gray-400">Execution Time</p>
                <p className="text-lg font-semibold text-blue-400">{result.execution_time.toFixed(1)}s</p>
              </div>
            )}
          </div>

          {/* Analytics — shown when post-hoc KPI data is available */}
          {(() => {
            const analytics = recomputedAnalytics ?? result.analytics
            const missing = !analytics || analytics.error
            return (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  Equilibration Diagnostics
                  <button
                    onClick={handleRecomputeAnalytics}
                    disabled={isRecomputing}
                    className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-blue-400 disabled:opacity-50 transition-colors"
                  >
                    {isRecomputing ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart2 className="w-3 h-3" />}
                    {isRecomputing ? 'Computing…' : missing ? 'Compute Analytics' : 'Recompute'}
                  </button>
                </h4>
                {analytics && <MDAnalyticsPanel analytics={analytics} />}
                {!analytics && !isRecomputing && (
                  <p className="text-xs text-gray-500">
                    Analytics not available for this run. Click "Compute Analytics" to generate them (requires trajectory files on disk).
                  </p>
                )}
              </div>
            )
          })()}

          {renderOutputFilesSection(result.output_files)}

          {/* Trajectory Analysis — only for equilibration (not production) */}
          {result.output_files?.trajectory && !result.output_files?.production_trajectory && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Trajectory Analysis</h4>
              <MDTrajectoryAnalysis trajectoryPath={String(result.output_files.trajectory).split(':')[0].trim()} />
            </div>
          )}

          {/* ABFE Action Button - only for equilibration jobs */}
          {isEquilibrationJob() && getEquilibratedStructurePath() && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
                    <Flame className="w-4 h-4" />
                    Continue to Free Energy Calculation
                  </h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Use the equilibrated structure as input for ABFE binding free energy calculation
                  </p>
                </div>
                <Button
                  onClick={handleSetupABFE}
                  disabled={settingUpABFE || isRunning}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {settingUpABFE ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Flame className="w-4 h-4 mr-2" />
                      Run ABFE
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {result?.error && (
        <div className="p-4 bg-red-900/20 border border-red-700/50 rounded mt-4">
          <p className="text-sm text-red-400">{result.error}</p>
        </div>
      )}
    </div>
  )
}
