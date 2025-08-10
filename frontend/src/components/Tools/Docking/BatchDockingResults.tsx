'use client'

import { Trash2, Eye, EyeOff, Save, Activity, Loader2, RefreshCw, X } from 'lucide-react'
import { useBatchDockingStore } from '@/store/batch-docking-store'
import { useMDStore } from '@/store/md-store'
import { useUIStore } from '@/store/ui-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { api } from '@/lib/api-client'
import { convertPDBQTtoPDB, parsePDBQT, parseSDF, convertSDFtoPDB } from './utils'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useMolecularStore } from '@/store/molecular-store'

// Color palette for different ligands (distinct, visually pleasing colors)
const LIGAND_COLORS = [
  { name: 'Cyan', hex: '#00FFFF', rgb: [0, 255, 255] },
  { name: 'Magenta', hex: '#FF00FF', rgb: [255, 0, 255] },
  { name: 'Yellow', hex: '#FFFF00', rgb: [255, 255, 0] },
  { name: 'Lime', hex: '#00FF00', rgb: [0, 255, 0] },
  { name: 'Orange', hex: '#FF8000', rgb: [255, 128, 0] },
  { name: 'Pink', hex: '#FF69B4', rgb: [255, 105, 180] },
  { name: 'Coral', hex: '#FF7F50', rgb: [255, 127, 80] },
  { name: 'Aqua', hex: '#7FFFD4', rgb: [127, 255, 212] },
]

// Track which poses are currently visualized: { jobId: poseIndex }
interface VisualizedPose {
  jobId: string
  poseIndex: number
  ligandName: string
  affinity: number
  colorIndex: number
}

interface BatchDockingResultsProps {
  currentStructure: any
  onVisualizePose?: (jobId: string, poseIndex: number) => void
  originalProteinPDB?: string | null
}

export function BatchDockingResults({
  currentStructure,
  onVisualizePose,
  originalProteinPDB: propOriginalProteinPDB
}: BatchDockingResultsProps) {
  const { jobs, activeJobId, setActiveJobId, removeJob, setJobs } = useBatchDockingStore()
  const mdStore = useMDStore()
  const uiStore = useUIStore()
  const { setCurrentStructure, originalProteinPDB: storeOriginalProteinPDB, setOriginalProteinPDB } = useMolecularStore()
  const [savingPoseJobId, setSavingPoseJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Track visualized poses from multiple ligands
  const [visualizedPoses, setVisualizedPoses] = useState<VisualizedPose[]>([])
  
  // Use prop or store for original protein PDB
  const originalProteinPDB = propOriginalProteinPDB ?? storeOriginalProteinPDB

  const fetchJobs = async () => {
    setIsLoading(true)
    try {
      const response = await api.listDockingJobs()
      if (response.jobs) {
        // Map API jobs to store Jobs
        const mappedJobs = response.jobs.map((job: any) => {
           // Extract results if successful
           // PostgreSQL stores result in job.result, but docking service wraps it in another 'result' field
           // So actual data is at job.result.result
           let processedResults = undefined
           const rawResult = job.result
           const results = rawResult?.result || rawResult // Handle both nested and flat structures
           if (results && results.success) {
             processedResults = {
                success: true,
                poses: results.scores?.map((score: any, idx: number) => ({
                  mode: score.mode || idx + 1,
                  affinity: typeof score === 'number' ? score : (score.affinity || 0),
                  rmsd_lb: typeof score === 'number' ? 0 : (score.rmsd_lb || 0),
                  rmsd_ub: typeof score === 'number' ? 0 : (score.rmsd_ub || 0),
                })) || [],
                best_affinity: results.best_score || results.best_affinity,
                num_poses: results.num_poses || results.scores?.length || 0,
                log: results.log || results.poses_pdbqt, 
                binding_strength: results.binding_strength
             }
           }

           return {
             id: job.job_id,
             type: 'batch',
             status: job.status,
             progress: job.status === 'completed' ? 100 : (job.progress || 0),
             ligandName: job.config?.ligand_name || job.config?.ligand_resname || job.molecule_name || (job.config?.ligand_id ? `Ligand ${job.config.ligand_id}` : 'Unknown Ligand'),
             receptorName: job.config?.protein_name || job.config?.protein_id || job.config?.pdb_id || (job.config?.protein_pdb ? 'Receptor from PDB' : 'Unknown Receptor'),
             ligandId: job.config?.ligand_id || 'unknown',
             batchId: job.batch_id || null,
             batchIndex: job.batch_index,
             batchTotal: job.batch_total,
             results: processedResults,
             createdAt: new Date(job.created_at).getTime(),
             completedAt: job.completed_at ? new Date(job.completed_at).getTime() : undefined
           }
        })
        
        // Sort by date desc
        mappedJobs.sort((a: any, b: any) => b.createdAt - a.createdAt)
        
        setJobs(mappedJobs)
      }
    } catch (err) {
      console.error("Failed to fetch jobs", err)
    } finally {
      setIsLoading(false)
    }
  }

  // Get WebSocket connection state from unified store
  const wsConnected = useUnifiedResultsStore(state => state.wsConnected)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Fetch jobs on mount and poll with adaptive interval
  // When WebSocket is connected, poll less frequently (30s as backup)
  // When disconnected, poll more frequently (5s)
  useEffect(() => {
    fetchJobs()
    
    // Clear existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    
    // Set new interval based on WebSocket state
    const interval = wsConnected ? 30000 : 5000
    pollIntervalRef.current = setInterval(fetchJobs, interval)
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [setJobs, wsConnected])

  const activeJob = jobs.find(j => j.id === activeJobId)

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this job?')) return
    
    // Optimistically remove from UI
    removeJob(jobId)
    
    try {
      await api.deleteJob(jobId, 'docking')
    } catch (err) {
      console.error('Failed to delete job', err)
      // Re-fetch to restore if failed
      fetchJobs()
    }
  }

  // Group jobs by batch_id (or by timestamp for legacy jobs without batch_id)
  const groupedJobs = jobs.reduce((acc, job) => {
    const batchId = (job as any).batchId
    let key: string
    
    if (batchId) {
      key = batchId
    } else {
      // Legacy fallback: group by timestamp
      const date = new Date(job.createdAt)
      key = `legacy_${date.toLocaleString(undefined, {
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit'
      })}`
    }
    
    if (!acc[key]) acc[key] = []
    acc[key].push(job)
    return acc
  }, {} as Record<string, typeof jobs>)

  // Sort jobs within each batch by batch_index
  Object.values(groupedJobs).forEach(batchJobs => {
    batchJobs.sort((a: any, b: any) => {
      if (a.batchIndex !== undefined && b.batchIndex !== undefined) {
        return a.batchIndex - b.batchIndex
      }
      return a.createdAt - b.createdAt
    })
  })

  const sortedGroups = Object.entries(groupedJobs).sort((a, b) => {
    // Sort by the timestamp of the first job in the group (newest first)
    return b[1][0].createdAt - a[1][0].createdAt
  })

  // Helper to get batch summary
  const getBatchSummary = (batchJobs: typeof jobs) => {
    const total = batchJobs.length
    const completed = batchJobs.filter(j => j.status === 'completed').length
    const failed = batchJobs.filter(j => j.status === 'failed').length
    const running = batchJobs.filter(j => j.status === 'running').length
    const bestAffinity = Math.min(...batchJobs
      .filter(j => j.results?.best_affinity !== undefined)
      .map(j => j.results!.best_affinity as number)
    )
    return { total, completed, failed, running, bestAffinity: isFinite(bestAffinity) ? bestAffinity : null }
  }

  // Format batch header
  const formatBatchHeader = (batchId: string, batchJobs: typeof jobs) => {
    const firstJob = batchJobs[0]
    const date = new Date(firstJob.createdAt)
    const dateStr = date.toLocaleString(undefined, {
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit'
    })
    
    if (batchId.startsWith('legacy_')) {
      return dateStr
    }
    
    const summary = getBatchSummary(batchJobs)
    return `Batch (${summary.completed}/${summary.total}) - ${dateStr}`
  }

  // Get the base protein PDB (without any ligands)
  const getCleanProteinPDB = useCallback(() => {
    // Prefer stored original protein PDB
    if (originalProteinPDB) {
      return originalProteinPDB.replace(/END\s*$/, '').replace(/ENDMDL\s*$/, '').trim()
    }
    
    // Fallback: try to extract from current structure
    let proteinPDB = currentStructure?.pdb_data || ''
    if (currentStructure?.metadata?.is_docked_pose) {
      // Remove all ligand parts (everything after first TER)
      const parts = proteinPDB.split(/\nTER\n/)
      proteinPDB = parts[0]
    }
    return proteinPDB.replace(/END\s*$/, '').replace(/ENDMDL\s*$/, '').trim()
  }, [originalProteinPDB, currentStructure])

  // Build combined PDB with all visualized poses
  const buildCombinedPDB = useCallback((poses: VisualizedPose[]) => {
    const proteinPDB = getCleanProteinPDB()
    if (!proteinPDB) return null
    
    let combinedPDB = proteinPDB
    
    for (const vizPose of poses) {
      const job = jobs.find(j => j.id === vizPose.jobId)
      if (!job?.results) continue
      
      try {
        // Prefer backend-converted PDB format (properly converted via OpenBabel)
        let pdbData: string = ''
        
        // Option 1: Use backend-converted PDB (preferred)
        if (job.results.poses_pdb) {
          const pdbPoses = parsePDBQT(job.results.poses_pdb)
          if (pdbPoses[vizPose.poseIndex]) {
            pdbData = pdbPoses[vizPose.poseIndex]
          }
        }
        
        // Option 2: Fallback to SDF format
        if (!pdbData && job.results.poses_sdf) {
          const sdfPoses = parseSDF(job.results.poses_sdf)
          if (sdfPoses[vizPose.poseIndex]) {
            pdbData = convertSDFtoPDB(sdfPoses[vizPose.poseIndex])
          }
        }
        
        // Option 3: Last resort - use raw PDBQT with frontend conversion (legacy)
        if (!pdbData && job.results.log) {
          const jobPoses = parsePDBQT(job.results.log)
          if (jobPoses[vizPose.poseIndex]) {
            pdbData = convertPDBQTtoPDB(jobPoses[vizPose.poseIndex])
          }
        }
        
        if (!pdbData) continue
        
        // Modify residue name to include color index for differentiation
        // This helps Mol* distinguish between different ligands
        const colorSuffix = String.fromCharCode(65 + vizPose.colorIndex) // A, B, C, etc.
        pdbData = pdbData.replace(/HETATM(.{11})(...)/g, `HETATM$1L${colorSuffix}${vizPose.colorIndex}`)
        
        combinedPDB += '\nTER\n' + pdbData.trim()
      } catch (err) {
        console.error('Failed to add pose to combined PDB:', err)
      }
    }
    
    return combinedPDB + '\nEND'
  }, [getCleanProteinPDB, jobs])

  // Update the visualization when poses change
  const updateVisualization = useCallback((newPoses: VisualizedPose[]) => {
    if (!currentStructure) return
    
    // Save original protein PDB if not already saved
    if (!originalProteinPDB && !currentStructure.metadata?.is_docked_pose) {
      setOriginalProteinPDB(currentStructure.pdb_data)
    }
    
    if (newPoses.length === 0) {
      // Clear all poses - restore original protein
      const cleanPDB = getCleanProteinPDB()
      if (cleanPDB) {
        setCurrentStructure({
          ...currentStructure,
          structure_id: currentStructure.structure_id.split('_pose_')[0],
          pdb_data: cleanPDB + '\nEND',
          metadata: {
            ...currentStructure.metadata,
            is_docked_pose: false,
            visualized_poses: [],
          } as any,
        })
      }
      return
    }
    
    const combinedPDB = buildCombinedPDB(newPoses)
    if (!combinedPDB) return
    
    const poseNames = newPoses.map(p => p.ligandName).join(', ')
    
    setCurrentStructure({
      ...currentStructure,
      structure_id: `${currentStructure.structure_id.split('_pose_')[0]}_poses_${newPoses.length}`,
      pdb_data: combinedPDB,
      metadata: {
        ...currentStructure.metadata,
        is_docked_pose: true,
        visualized_poses: newPoses,
        pose_names: poseNames,
      } as any,
    })
  }, [currentStructure, originalProteinPDB, getCleanProteinPDB, buildCombinedPDB, setCurrentStructure, setOriginalProteinPDB])

  // Toggle pose visualization (add or remove)
  const handleTogglePose = useCallback((jobId: string, poseIndex: number) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job?.results) return
    
    setVisualizedPoses(prev => {
      // Check if this job already has a pose visualized
      const existingIndex = prev.findIndex(p => p.jobId === jobId)
      
      if (existingIndex >= 0) {
        // If same pose, remove it (toggle off)
        if (prev[existingIndex].poseIndex === poseIndex) {
          const newPoses = prev.filter((_, i) => i !== existingIndex)
          updateVisualization(newPoses)
          return newPoses
        }
        // If different pose from same job, replace it
        const newPoses = [...prev]
        newPoses[existingIndex] = {
          ...newPoses[existingIndex],
          poseIndex,
          affinity: job.results?.poses?.[poseIndex]?.affinity || 0,
        }
        updateVisualization(newPoses)
        return newPoses
      }
      
      // Add new pose with next available color
      const usedColors = new Set(prev.map(p => p.colorIndex))
      let colorIndex = 0
      while (usedColors.has(colorIndex) && colorIndex < LIGAND_COLORS.length) {
        colorIndex++
      }
      if (colorIndex >= LIGAND_COLORS.length) colorIndex = prev.length % LIGAND_COLORS.length
      
      const newPose: VisualizedPose = {
        jobId,
        poseIndex,
        ligandName: job.ligandName,
        affinity: job.results?.poses?.[poseIndex]?.affinity || 0,
        colorIndex,
      }
      
      const newPoses = [...prev, newPose]
      updateVisualization(newPoses)
      return newPoses
    })
  }, [jobs, updateVisualization])

  // Remove a specific pose from visualization
  const handleRemovePose = useCallback((jobId: string) => {
    setVisualizedPoses(prev => {
      const newPoses = prev.filter(p => p.jobId !== jobId)
      updateVisualization(newPoses)
      return newPoses
    })
  }, [updateVisualization])

  // Clear all visualized poses
  const handleClearAllPoses = useCallback(() => {
    setVisualizedPoses([])
    updateVisualization([])
  }, [updateVisualization])

  // Check if a pose is currently visualized
  const isJobVisualized = useCallback((jobId: string) => {
    return visualizedPoses.some(p => p.jobId === jobId)
  }, [visualizedPoses])

  // Get the visualized pose for a job
  const getVisualizedPose = useCallback((jobId: string) => {
    return visualizedPoses.find(p => p.jobId === jobId)
  }, [visualizedPoses])

  // Legacy handler for backward compatibility
  const handleVisualizePose = async (jobId: string, poseIndex: number) => {
    if (onVisualizePose) {
      onVisualizePose(jobId, poseIndex)
      return
    }
    handleTogglePose(jobId, poseIndex)
  }

  const handleSavePose = async (jobId: string, poseIndex: number) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job?.results) return

    setSavingPoseJobId(jobId)
    try {
      // Prefer backend-converted PDB format (properly converted via OpenBabel)
      let pdbData: string = ''
      
      // Option 1: Use backend-converted PDB (preferred)
      if (job.results.poses_pdb) {
        const pdbPoses = parsePDBQT(job.results.poses_pdb)
        if (pdbPoses[poseIndex]) {
          pdbData = pdbPoses[poseIndex]
        }
      }
      
      // Option 2: Fallback to SDF format
      if (!pdbData && job.results.poses_sdf) {
        const sdfPoses = parseSDF(job.results.poses_sdf)
        if (sdfPoses[poseIndex]) {
          pdbData = convertSDFtoPDB(sdfPoses[poseIndex])
        }
      }
      
      // Option 3: Last resort - use raw PDBQT with frontend conversion (legacy)
      if (!pdbData) {
        const pdbqtPoses = parsePDBQT(job.results.log || '')
        if (!pdbqtPoses[poseIndex]) throw new Error('Pose not found')
        pdbData = convertPDBQTtoPDB(pdbqtPoses[poseIndex])
      }

      const affinity = job.results.poses?.[poseIndex]?.affinity?.toFixed(2) || 'N/A'
      await api.saveStructureToLibrary(pdbData, `Batch Docked Pose - ${job.ligandName} (${affinity} kcal/mol)`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingPoseJobId(null)
    }
  }

  const handleOptimizeWithMD = async (jobId: string, poseIndex: number) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job?.results) return

    try {
      // Prefer backend-converted PDB format (properly converted via OpenBabel)
      let pdbData: string = ''
      
      // Option 1: Use backend-converted PDB (preferred)
      if (job.results.poses_pdb) {
        const pdbPoses = parsePDBQT(job.results.poses_pdb)
        if (pdbPoses[poseIndex]) {
          pdbData = pdbPoses[poseIndex]
        }
      }
      
      // Option 2: Fallback to SDF format
      if (!pdbData && job.results.poses_sdf) {
        const sdfPoses = parseSDF(job.results.poses_sdf)
        if (sdfPoses[poseIndex]) {
          pdbData = convertSDFtoPDB(sdfPoses[poseIndex])
        }
      }
      
      // Option 3: Last resort - use raw PDBQT with frontend conversion (legacy)
      if (!pdbData) {
        const pdbqtPoses = parsePDBQT(job.results.log || '')
        if (!pdbqtPoses[poseIndex]) throw new Error('Pose not found')
        pdbData = convertPDBQTtoPDB(pdbqtPoses[poseIndex])
      }

      const affinity = job.results.poses?.[poseIndex]?.affinity?.toFixed(2) || 'N/A'

      mdStore.reset()
      mdStore.setSelectedProtein('current')
      mdStore.setSelectedLigandMethod('structure')
      mdStore.setLigandInput({
        method: 'structure',
        file_data: pdbData,
        file_name: `batch_docked_pose_${poseIndex + 1}_${affinity}.pdb`,
        preserve_pose: true,
        generate_conformer: false,
      })
      uiStore.setActiveTool('md-optimization')
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Visualized Poses Panel */}
      {visualizedPoses.length > 0 && (
        <div className="p-3 bg-gray-800/80 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-300">
              Showing {visualizedPoses.length} Pose{visualizedPoses.length > 1 ? 's' : ''}
            </h4>
            <button
              onClick={handleClearAllPoses}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              title="Clear all poses"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {visualizedPoses.map((pose) => (
              <div
                key={pose.jobId}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                style={{ 
                  backgroundColor: `${LIGAND_COLORS[pose.colorIndex]?.hex}20`,
                  border: `1px solid ${LIGAND_COLORS[pose.colorIndex]?.hex}80`
                }}
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: LIGAND_COLORS[pose.colorIndex]?.hex }}
                />
                <span className="text-white truncate max-w-[100px]" title={pose.ligandName}>
                  {pose.ligandName}
                </span>
                <span className="text-gray-400">P{pose.poseIndex + 1}</span>
                <span className="text-gray-400">({pose.affinity.toFixed(1)})</span>
                <button
                  onClick={() => handleRemovePose(pose.jobId)}
                  className="ml-0.5 p-0.5 hover:bg-gray-600 rounded transition-colors"
                  title="Remove pose"
                >
                  <X className="w-3 h-3 text-gray-400 hover:text-white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jobs List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white">Batch Jobs ({jobs.length})</h4>
          <button 
            onClick={() => fetchJobs()}
            className={`p-1 hover:bg-gray-700 rounded transition-colors ${isLoading ? 'animate-spin' : ''}`}
            title="Refresh Jobs"
          >
            <RefreshCw className="w-4 h-4 text-gray-400 hover:text-white" />
          </button>
        </div>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No batch jobs running or completed.</p>
          ) : (
            sortedGroups.map(([batchId, groupJobs]) => {
              const summary = getBatchSummary(groupJobs)
              return (
              <div key={batchId} className="space-y-2">
                <div className="sticky top-0 bg-gray-900/90 py-1 z-10 pl-1 border-b border-gray-800 flex items-center justify-between pr-2">
                  <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {formatBatchHeader(batchId, groupJobs)}
                  </h5>
                  {summary.bestAffinity !== null && (
                    <span className="text-xs text-green-400 font-medium">
                      Best: {summary.bestAffinity.toFixed(2)} kcal/mol
                    </span>
                  )}
                </div>
                {groupJobs.map((job) => {
                  const vizPose = getVisualizedPose(job.id)
                  const isVisualized = !!vizPose
                  const colorHex = vizPose ? LIGAND_COLORS[vizPose.colorIndex]?.hex : undefined
                  
                  return (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      activeJobId === job.id
                        ? 'bg-blue-900/30 border-blue-500'
                        : isVisualized
                        ? 'bg-gray-800 hover:bg-gray-750'
                        : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                    }`}
                    style={isVisualized ? { borderColor: colorHex, borderWidth: '2px' } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isVisualized && (
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: colorHex }}
                              title={`Showing Pose ${vizPose.poseIndex + 1}`}
                            />
                          )}
                          <p className="text-sm font-medium text-white truncate">{job.ligandName}</p>
                          {job.receptorName && (
                             <span className="text-xs text-gray-500 ml-auto truncate max-w-[80px]" title={job.receptorName}>
                               {job.receptorName}
                             </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-gray-400">
                            Status: <span className={`font-medium ${
                              job.status === 'completed' ? 'text-green-400' :
                              job.status === 'failed' ? 'text-red-400' :
                              job.status === 'running' ? 'text-blue-400' :
                              'text-gray-400'
                            }`}>
                              {job.status}
                            </span>
                          </p>
                          {isVisualized && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${colorHex}30`, color: colorHex }}>
                              Pose {vizPose.poseIndex + 1}
                            </span>
                          )}
                        </div>
                        {job.status === 'running' && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{job.progress}%</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {isVisualized && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemovePose(job.id) }}
                            className="p-1 hover:bg-gray-700 rounded transition-colors"
                            title="Hide pose"
                          >
                            <EyeOff className="w-4 h-4 text-gray-400 hover:text-yellow-400" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteJob(job.id, e)}
                          className="p-1 hover:bg-gray-700 rounded transition-colors"
                          title="Delete job"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
              )
            })
          )}
        </div>
      </div>

      {/* Active Job Results */}
      {activeJob?.results?.success && (() => {
        const activeVizPose = getVisualizedPose(activeJob.id)
        const activeColorHex = activeVizPose ? LIGAND_COLORS[activeVizPose.colorIndex]?.hex : undefined
        
        return (
        <div 
          className="space-y-4 p-4 bg-gray-800 rounded-lg border"
          style={activeVizPose ? { borderColor: activeColorHex, borderWidth: '2px' } : { borderColor: '#374151' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeVizPose && (
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: activeColorHex }}
                />
              )}
              <h4 className="text-sm font-medium text-white">Results: {activeJob.ligandName}</h4>
            </div>
            {activeVizPose && (
              <button
                onClick={() => handleRemovePose(activeJob.id)}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1"
                title="Hide this pose"
              >
                <EyeOff className="w-3 h-3" />
                Hide
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-700 rounded">
              <p className="text-xs text-gray-400">Best Affinity</p>
              <p className="text-lg font-semibold text-white mt-1">
                {activeJob.results.best_affinity?.toFixed(2) || 'N/A'}
              </p>
            </div>
            <div className="p-3 bg-gray-700 rounded">
              <p className="text-xs text-gray-400">Poses Found</p>
              <p className="text-lg font-semibold text-white mt-1">
                {activeJob.results.num_poses || 0}
              </p>
            </div>
          </div>

          {activeJob.results.poses && activeJob.results.poses.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-400 mb-2">
                Click a pose to {activeVizPose ? 'switch or toggle off' : 'add to viewer'}. Multiple ligands can be shown simultaneously.
              </p>
              <table className="w-full text-xs">
                <thead className="border-b border-gray-700">
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-400">Pose</th>
                    <th className="text-right py-2 px-2 text-gray-400">Affinity</th>
                    <th className="text-center py-2 px-2 text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeJob.results.poses.map((pose, idx) => {
                    const isThisPoseVisualized = activeVizPose?.poseIndex === idx
                    
                    return (
                    <tr 
                      key={idx} 
                      className={`border-b border-gray-700 hover:bg-gray-700/50 cursor-pointer transition-colors ${
                        isThisPoseVisualized ? 'bg-gray-700/70' : ''
                      }`}
                      style={isThisPoseVisualized ? { backgroundColor: `${activeColorHex}15` } : undefined}
                      onClick={() => handleTogglePose(activeJob.id, idx)}
                    >
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {isThisPoseVisualized && (
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: activeColorHex }}
                            />
                          )}
                          <span className="text-white">{pose.mode}</span>
                          {isThisPoseVisualized && (
                            <span 
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: `${activeColorHex}30`, color: activeColorHex }}
                            >
                              Showing
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right text-white">{pose.affinity.toFixed(2)}</td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleTogglePose(activeJob.id, idx)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              isThisPoseVisualized 
                                ? 'bg-yellow-600 hover:bg-yellow-700' 
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                            title={isThisPoseVisualized ? 'Hide pose' : 'Show pose'}
                          >
                            {isThisPoseVisualized ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => handleSavePose(activeJob.id, idx)}
                            disabled={savingPoseJobId === activeJob.id}
                            className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 rounded disabled:opacity-50"
                            title="Save"
                          >
                            {savingPoseJobId === activeJob.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            onClick={() => handleOptimizeWithMD(activeJob.id, idx)}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded"
                            title="Optimize with MD"
                          >
                            <Activity className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )
      })()}
    </div>
  )
}
