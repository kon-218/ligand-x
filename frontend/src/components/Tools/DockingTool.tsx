'use client'

import React, { useState, useEffect } from 'react'
import { Target, Loader2, Play, Layers, Check, FlaskConical } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { useMDStore } from '@/store/md-store'
import { api } from '@/lib/api-client'
import {
  WorkflowContainer,
  StructureSelector,
  ParameterSection,
  SliderParameter,
  SelectParameter,
  ToggleParameter,
  NumberParameter,
  ExecutionPanel,
  InfoBox,
  ResultsContainer,
  ResultMetric,
  ResultsTable,
} from './shared'
import type { WorkflowStep, StructureOption } from './shared'
import { convertPDBQTtoPDB, parsePDBQT, parseSDF, convertSDFtoPDB, calculateBindingStrength } from './Docking/utils'
import { DockingStepResults } from './Docking/DockingStepResults'
import { useBatchDockingStore } from '@/store/batch-docking-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import type { GridBox, DockingParams, DockingResults, LigandOption, BatchDockingJob } from '@/types/docking'

// Define workflow steps
const DOCKING_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Selection', description: 'Choose protein and ligand' },
  { id: 2, label: 'Parameters', description: 'Configure docking settings' },
  { id: 3, label: 'Grid Box', description: 'Define search space' },
  { id: 4, label: 'Results', description: 'View docking results' },
]

// Chain IDs assigned to docked poses so Mol* can select them distinctly from native cofactors.
// Letters chosen backwards from Z to avoid colliding with typical protein chains (A-H).
const POSE_CHAINS = ['Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R']

// Assign a specific chain ID to all HETATM records in a PDB string.
// PDB col 22 (0-indexed char 21) is the chain ID.
// Layout: HETATM(6) + serial(5) + space(1) + name(4) + altloc(1) + resname(3) + space(1) = 21 chars before chain.
const assignPoseChain = (pdbStr: string, chainId: string): string => {
  return pdbStr.replace(/^(HETATM.{15}).(.*)$/gm, `$1${chainId}$2`)
}

export function DockingTool() {
  const {
    currentStructure,
    setCurrentStructure,
    viewerRef,
    dockingResults,
    setDockingResults,
    selectedPoseIndex,
    setSelectedPoseIndex,
    isDockingRunning,
    setIsDockingRunning,
    dockingProgress,
    setDockingProgress,
    dockingStatus,
    setDockingStatus,
    originalProteinPDB,
    setOriginalProteinPDB
  } = useMolecularStore()

  const uiStore = useUIStore()
  const mdStore = useMDStore()
  const { isBatchMode, setIsBatchMode, activeJobId, setActiveJobId, updateJob } = useBatchDockingStore()
  const { loadAllJobs } = useUnifiedResultsStore()

  const [currentStep, setCurrentStep] = useState(1)
  const [proteinLoaded, setProteinLoaded] = useState(false)
  const [selectedLigand, setSelectedLigand] = useState('')
  const [batchLigands, setBatchLigands] = useState<string[]>([])
  const [availableLigands, setAvailableLigands] = useState<LigandOption[]>([])

  // Ligand Input State
  const [ligandInputMethod, setLigandInputMethod] = useState<'existing' | 'smiles' | 'structure'>('existing')
  const [smilesInput, setSmilesInput] = useState('')
  const [uploadedFile, setUploadedFile] = useState<{ name: string, data: string } | null>(null)
  const [uploadedLigandsData, setUploadedLigandsData] = useState<Record<string, { data: string, format: 'pdb' | 'sdf', name: string }>>({})

  const [dockingParams, setDockingParams] = useState<DockingParams>({
    gridPadding: 5.0,
    exhaustiveness: 32,
    scoringFunction: 'vina',
    numPoses: 9,
    maxPosesReturned: 5,
    energyRange: 100.0,
    useVinaApi: true,
  })
  const [gridBox, setGridBox] = useState<GridBox | null>(null)
  const [showManualGrid, setShowManualGrid] = useState(false)
  const [previewGridBox, setPreviewGridBox] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingPose, setSavingPose] = useState<number | null>(null)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isValidatingRedock, setIsValidatingRedock] = useState(false)
  const [redockResult, setRedockResult] = useState<{
    passed?: boolean
    rmsd?: number
    best_affinity?: number
    message?: string
    error?: string
  } | null>(null)

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = e.target?.result as string
      const extension = file.name.split('.').pop()?.toLowerCase()
      const format = extension === 'pdb' ? 'pdb' : 'sdf'

      const id = `upload_${Date.now()}`
      setUploadedLigandsData(prev => ({
        ...prev,
        [id]: { data, format, name: file.name }
      }))

      const newLigand: LigandOption = {
        id,
        name: `${file.name} (Uploaded)`
      }

      setAvailableLigands(prev => [...prev, newLigand])

      if (isBatchMode) {
        setBatchLigands(prev => [...prev, id])
      } else {
        setLigandInputMethod('existing')
        setSelectedLigand(id)
      }

      setUploadedFile({ name: file.name, data })
    }
    reader.readAsText(file)
  }

  const handleValidateSmiles = async () => {
    if (!smilesInput) return

    try {
      setDockingStatus('Validating SMILES...')
      // Upload SMILES to get 3D structure
      const result = await api.uploadSmiles(smilesInput, `SMILES_${Date.now()}`)

      const id = `smiles_${Date.now()}`
      const name = `SMILES: ${smilesInput.substring(0, 15)}...`
      const data = result.sdf_data || result.pdb_data || ''
      const format = result.sdf_data ? 'sdf' : 'pdb'

      setUploadedLigandsData(prev => ({
        ...prev,
        [id]: { data, format, name }
      }))

      const newLigand: LigandOption = {
        id,
        name
      }

      setAvailableLigands(prev => [...prev, newLigand])

      if (isBatchMode) {
        setBatchLigands(prev => [...prev, id])
      } else {
        setLigandInputMethod('existing')
        setSelectedLigand(id)
      }

      setDockingStatus('')
    } catch (err: any) {
      setError(err.message || 'Invalid SMILES')
    }
  }

  const handleSelectBatchLigand = (ligandId: string) => {
    setBatchLigands(prev =>
      prev.includes(ligandId)
        ? prev.filter(id => id !== ligandId)
        : [...prev, ligandId]
    )
  }

  const handleRunBatchDocking = async () => {
    if (!currentStructure || !gridBox || batchLigands.length === 0) {
      setError('Please select protein, ligands, and configure grid box')
      return
    }

    try {
      setError(null)
      setIsDockingRunning(true)
      setCurrentStep(4)
      setDockingStatus('Initializing batch docking...')

      // Prepare ligand data for batch
      const ligandConfigs = await Promise.all(
        batchLigands.map(async (ligandId) => {
          let ligandData = ''
          let ligandFormat: 'sdf' | 'pdb' = 'sdf'
          let ligandResname = 'LIG'
          let ligandName = ''

          if (ligandId.startsWith('library_')) {
            const molecules = await api.getMolecules()
            const moleculeId = parseInt(ligandId.replace('library_', ''))
            const libraryMolecule = molecules?.find((m: any) => m.id === moleculeId)
            if (!libraryMolecule) throw new Error('Library molecule not found')

            const smilesResult = await api.uploadSmiles(libraryMolecule.canonical_smiles, libraryMolecule.name)
            ligandData = smilesResult.sdf_data || smilesResult.pdb_data || ''
            ligandFormat = smilesResult.sdf_data ? 'sdf' : 'pdb'
            ligandResname = libraryMolecule.name.substring(0, 3).toUpperCase()
            ligandName = libraryMolecule.name
          } else if (uploadedLigandsData[ligandId]) {
            const uploaded = uploadedLigandsData[ligandId]
            ligandData = uploaded.data
            ligandFormat = uploaded.format
            ligandResname = 'LIG'
            ligandName = uploaded.name
          } else {
            const ligand = currentStructure.ligands?.[ligandId]
            if (!ligand) throw new Error('Ligand not found')
            ligandData = ligand.sdf_data || ligand.pdb_data || ''
            ligandFormat = ligand.sdf_data ? 'sdf' : 'pdb'
            ligandResname = ligand.residue_name || 'LIG'
            ligandName = (ligand as any).name || ligand.residue_name || 'Unknown'
          }

          return {
            id: ligandId,
            name: ligandName,
            data: ligandData,
            format: ligandFormat,
            resname: ligandResname,
          }
        })
      )

      // Create batch config
      const batchConfig = {
        protein_pdb: currentStructure.pdb_data,
        ligands: ligandConfigs,
        grid_padding: dockingParams.gridPadding,
        grid_box: gridBox, // Pass the manually defined grid box
        docking_params: {
          exhaustiveness: dockingParams.exhaustiveness,
          num_modes: dockingParams.numPoses,
          energy_range: dockingParams.energyRange,
          scoring_function: dockingParams.scoringFunction,
        },
        use_api: dockingParams.useVinaApi,
        protein_id: currentStructure.structure_id,
      }

      setDockingStatus('Submitting batch job...')

      // Submit batch docking
      const result = await api.batchDockProteinLigands(batchConfig)

      if (result.success) {
        console.log('[DockingTool] Batch job submitted:', result.job_id)
        // For docking, we rely on the UnifiedJobList to show progress
      }

      setDockingStatus('Batch docking started')
      setBatchLigands([]) // Clear selection after start
    } catch (err: any) {
      setError(err.message || 'Batch docking failed')
    } finally {
      setIsDockingRunning(false)
    }
  }

  // Check if current structure is a valid protein (not a SMILES-generated small molecule)
  const isValidProtein = (structure: typeof currentStructure): boolean => {
    if (!structure) return false
    // Filter out SMILES-generated molecules - they are small molecules, not proteins
    if (structure.source === 'smiles_upload') return false
    if (structure.structure_id?.startsWith('SMILES_molecule')) return false
    // Must have PDB data
    if (!structure.pdb_data) return false
    return true
  }

  // Fetch library molecules
  useEffect(() => {
    const fetchLibraryMolecules = async () => {
      try {
        const molecules = await api.getMolecules()
        const libraryLigands: LigandOption[] = Array.isArray(molecules)
          ? molecules.map((mol: any) => ({
            id: `library_${mol.id}`,
            name: `${mol.name} (Library)`,
          }))
          : []

        if (currentStructure && isValidProtein(currentStructure)) {
          setProteinLoaded(true)
          const structureLigands: LigandOption[] = currentStructure.ligands
            ? Object.entries(currentStructure.ligands).map(([id, ligand]: [string, any]) => ({
              id,
              name: `${ligand.name || ligand.residue_name} (Chain ${ligand.chain || ligand.chain_id})`,
            }))
            : []

          const allLigands = [...structureLigands, ...libraryLigands]
          setAvailableLigands(allLigands)
          if (allLigands.length === 1) setSelectedLigand(allLigands[0].id)
        } else {
          setProteinLoaded(false)
          setAvailableLigands(libraryLigands)
        }
      } catch (err) {
        console.error('Failed to fetch library molecules:', err)
      }
    }
    fetchLibraryMolecules()
  }, [currentStructure])

  // Auto-navigate removed to allow concurrent workflows
  // useEffect(() => {
  //   if (isDockingRunning || (dockingResults && dockingResults.success)) {
  //     setCurrentStep(4)
  //   }
  // }, [isDockingRunning, dockingResults])

  // Grid box preview
  useEffect(() => {
    if (!viewerRef || !gridBox) return
    const viewer = viewerRef as any
    if (viewer.gridBox?.toggle) {
      viewer.gridBox.toggle(gridBox, previewGridBox)
    }
  }, [viewerRef, gridBox, previewGridBox])

  const handleAutoCalculateGridBox = async () => {
    // Determine which ligand to use for calculation
    let ligandToUse = selectedLigand

    // In batch mode, if no single ligand is selected but we have batch ligands, use the first one
    if (isBatchMode && !selectedLigand && batchLigands.length > 0) {
      ligandToUse = batchLigands[0]
    }

    if (!currentStructure || !ligandToUse) {
      setError('Please select a protein and at least one ligand first')
      return
    }

    try {
      setError(null)
      setDockingStatus('Calculating grid box...')

      if (ligandToUse.startsWith('library_')) {
        const molecules = await api.getMolecules()
        const moleculeId = parseInt(ligandToUse.replace('library_', ''))
        const libraryMolecule = molecules?.find((m: any) => m.id === moleculeId)
        if (!libraryMolecule) throw new Error('Library molecule not found')

        setDockingStatus('Converting SMILES to 3D...')
        const smilesResult = await api.uploadSmiles(libraryMolecule.canonical_smiles, libraryMolecule.name)
        const ligandData = smilesResult.sdf_data || smilesResult.pdb_data || ''
        const ligandFormat = smilesResult.sdf_data ? 'sdf' : 'pdb'

        setDockingStatus('Calculating grid box...')
        const preparation = await api.prepareDocking(
          currentStructure.pdb_data || '',
          ligandData,
          ligandFormat as 'sdf' | 'pdb',
          libraryMolecule.name.substring(0, 3).toUpperCase(),
          dockingParams.gridPadding
        )

        if (preparation.grid_box) {
          setGridBox({
            center_x: Number(preparation.grid_box.center_x.toFixed(2)),
            center_y: Number(preparation.grid_box.center_y.toFixed(2)),
            center_z: Number(preparation.grid_box.center_z.toFixed(2)),
            size_x: Number(preparation.grid_box.size_x.toFixed(2)),
            size_y: Number(preparation.grid_box.size_y.toFixed(2)),
            size_z: Number(preparation.grid_box.size_z.toFixed(2)),
          })
          setShowManualGrid(true)
        }
      } else if (uploadedLigandsData[ligandToUse]) {
        const uploaded = uploadedLigandsData[ligandToUse]

        setDockingStatus('Calculating grid box...')
        const preparation = await api.prepareDocking(
          currentStructure.pdb_data || '',
          uploaded.data,
          uploaded.format,
          'LIG',
          dockingParams.gridPadding
        )

        if (preparation.grid_box) {
          setGridBox({
            center_x: Number(preparation.grid_box.center_x.toFixed(2)),
            center_y: Number(preparation.grid_box.center_y.toFixed(2)),
            center_z: Number(preparation.grid_box.center_z.toFixed(2)),
            size_x: Number(preparation.grid_box.size_x.toFixed(2)),
            size_y: Number(preparation.grid_box.size_y.toFixed(2)),
            size_z: Number(preparation.grid_box.size_z.toFixed(2)),
          })
          setShowManualGrid(true)
        }
      } else {
        const ligand = currentStructure.ligands?.[ligandToUse]
        if (!ligand?.center_of_mass) {
          setError('Ligand center of mass not available')
          return
        }
        const [x, y, z] = ligand.center_of_mass
        setGridBox({
          center_x: Number(x.toFixed(2)),
          center_y: Number(y.toFixed(2)),
          center_z: Number(z.toFixed(2)),
          size_x: dockingParams.gridPadding * 4,
          size_y: dockingParams.gridPadding * 4,
          size_z: dockingParams.gridPadding * 4,
        })
        setShowManualGrid(true)
      }
      setDockingStatus('Grid box calculated')
    } catch (err: any) {
      setError(err.message || 'Failed to calculate grid box')
    }
  }

  const handleCalculateWholeProteinGridBox = async () => {
    if (!currentStructure) {
      setError('Please select a protein first')
      return
    }

    try {
      setError(null)
      setDockingStatus('Calculating whole protein grid box...')

      const result = await api.calculateWholeProteinGridBox(currentStructure.pdb_data || '')

      if (result.grid_box) {
        setGridBox({
          center_x: Number(result.grid_box.center_x.toFixed(2)),
          center_y: Number(result.grid_box.center_y.toFixed(2)),
          center_z: Number(result.grid_box.center_z.toFixed(2)),
          size_x: Number(result.grid_box.size_x.toFixed(2)),
          size_y: Number(result.grid_box.size_y.toFixed(2)),
          size_z: Number(result.grid_box.size_z.toFixed(2)),
        })
        setShowManualGrid(true)
      }
      setDockingStatus('Grid box calculated')
    } catch (err: any) {
      setError(err.message || 'Failed to calculate whole protein grid box')
    }
  }

  const handleRunDocking = async () => {
    if (!currentStructure || !selectedLigand || !gridBox) {
      setError('Please complete all previous steps')
      return
    }

    let ligandData = ''
    let ligandFormat: 'sdf' | 'pdb' = 'sdf'
    let ligandResname = 'LIG'
    let ligandName = selectedLigand

    try {
      if (selectedLigand.startsWith('library_')) {
        const molecules = await api.getMolecules()
        const moleculeId = parseInt(selectedLigand.replace('library_', ''))
        const libraryMolecule = molecules?.find((m: any) => m.id === moleculeId)
        if (!libraryMolecule) throw new Error('Library molecule not found')

        const smilesResult = await api.uploadSmiles(libraryMolecule.canonical_smiles, libraryMolecule.name)
        ligandData = smilesResult.sdf_data || smilesResult.pdb_data || ''
        ligandFormat = smilesResult.sdf_data ? 'sdf' : 'pdb'
        ligandResname = libraryMolecule.name.substring(0, 3).toUpperCase()
        ligandName = libraryMolecule.name
      } else if (uploadedLigandsData[selectedLigand]) {
        const uploaded = uploadedLigandsData[selectedLigand]
        ligandData = uploaded.data
        ligandFormat = uploaded.format
        ligandResname = 'LIG'
        ligandName = uploaded.name
      } else {
        const ligand = currentStructure.ligands?.[selectedLigand]
        if (!ligand) throw new Error('Ligand not found')
        ligandData = ligand.sdf_data || ligand.pdb_data || ''
        ligandFormat = ligand.sdf_data ? 'sdf' : 'pdb'
        ligandResname = ligand.residue_name || 'LIG'
        ligandName = (ligand as any).name || ligand.residue_name || selectedLigand
      }

      setIsDockingRunning(true)
      setCurrentStep(4)
      setError(null)
      setDockingProgress(0)
      setDockingStatus('Initializing...')
      setDockingResults(null)
      setOriginalProteinPDB(null)
      setPreviewGridBox(false)

      const result = await api.dockProteinLigand({
        protein_pdb: currentStructure.pdb_data,
        ligand_data: ligandData,
        ligand_format: ligandFormat,
        ligand_resname: ligandResname,
        grid_padding: dockingParams.gridPadding,
        grid_box: gridBox || undefined,  // Pass pre-calculated grid box from UI
        docking_params: {
          exhaustiveness: dockingParams.exhaustiveness,
          num_modes: dockingParams.numPoses,
          energy_range: dockingParams.energyRange,
          scoring_function: dockingParams.scoringFunction,
        },
        use_api: dockingParams.useVinaApi,
        protein_id: currentStructure.structure_id,
        ligand_id: ligandName,
      }, (progress, status, jobId) => {
        setDockingProgress(progress)
        setDockingStatus(status)

        // If we get a job ID and haven't set it as active yet, do so and refresh list
        if (jobId && activeJobId !== jobId) {
          setActiveJobId(jobId)
          // Refresh the job list to show the new running job
          loadAllJobs()
        }
      })

      setDockingProgress(100)
      setDockingStatus('Docking completed!')

      const processedResults: DockingResults = {
        success: true,
        poses: result.poses?.map((pose: any, idx: number) => ({
          mode: idx + 1,
          affinity: pose.affinity || 0,
          rmsd_lb: pose.rmsd_lb || 0,
          rmsd_ub: pose.rmsd_ub || 0,
        })) || [],
        best_affinity: result.best_affinity,
        num_poses: result.poses?.length || 0,
        log: result.log || result.poses_pdbqt,  // PDBQT data
        poses_sdf: result.poses_sdf,  // SDF data with preserved bond orders
      }

      if (processedResults.best_affinity !== undefined) {
        processedResults.binding_strength = calculateBindingStrength(processedResults.best_affinity)
      }

      setDockingResults(processedResults)
      setOriginalProteinPDB(currentStructure.pdb_data)

      if (processedResults.poses && processedResults.poses.length > 0) {
        await handleVisualizePose(0)
      }
    } catch (err: any) {
      setError(err.message || 'Docking failed')
      setDockingProgress(0)
      setDockingStatus('')
    } finally {
      setIsDockingRunning(false)
    }
  }

  const handleVisualizePose = async (poseIndex: number) => {
    if (!dockingResults || !currentStructure) return

    try {
      console.log('Visualizing pose', poseIndex)
      // Prefer backend-converted PDB format (properly converted via OpenBabel)
      let pdbData: string = ''

      // Option 1: Use backend-converted PDB (preferred - proper element symbols and bonds)
      if (dockingResults.poses_pdb) {
        try {
          const pdbPoses = parsePDBQT(dockingResults.poses_pdb) // Same MODEL/ENDMDL parsing works for multi-model PDB
          if (pdbPoses[poseIndex]) {
            pdbData = pdbPoses[poseIndex]
            console.log(`Using backend-converted PDB pose ${poseIndex + 1}`)
          }
        } catch (e) {
          console.error('Error parsing backend PDB pose:', e)
        }
      }

      // Option 2: Fallback to SDF format (has bond information)
      if (!pdbData && dockingResults.poses_sdf) {
        try {
          const sdfPoses = parseSDF(dockingResults.poses_sdf)
          if (sdfPoses[poseIndex]) {
            pdbData = convertSDFtoPDB(sdfPoses[poseIndex])
            console.log(`Using SDF pose ${poseIndex + 1} with preserved bonds`)
          }
        } catch (e) {
          console.error('Error parsing SDF pose:', e)
        }
      }

      // Option 3: Last resort - use raw PDBQT with frontend conversion (legacy)
      if (!pdbData) {
        try {
          const logData = dockingResults.poses_pdbqt || dockingResults.log || ''
          const pdbqtPoses = parsePDBQT(logData)
          if (!pdbqtPoses[poseIndex]) {
            setError(`Pose ${poseIndex + 1} not found`)
            return
          }
          pdbData = convertPDBQTtoPDB(pdbqtPoses[poseIndex])
          console.log(`Using PDBQT pose ${poseIndex + 1} with frontend conversion (legacy fallback)`)
        } catch (e) {
          console.error('Error parsing PDBQT pose:', e)
          throw e
        }
      }

      // Ensure we have the original protein PDB preserved
      let proteinPDB = originalProteinPDB
      if (!proteinPDB) {
        // If current structure is clean (not a docked pose), save it as original
        if (!currentStructure.metadata?.is_docked_pose) {
          proteinPDB = currentStructure.pdb_data
          setOriginalProteinPDB(proteinPDB)
        } else {
          // Fallback: If we don't have original and current is already docked, 
          // we should ideally try to strip the ligand or warn. 
          // For now, we'll use current but this might result in stacking if original was lost.
          console.warn('Visualizing pose on top of potentially already docked structure')
          proteinPDB = currentStructure.pdb_data
        }
      }

      // Use the clean protein PDB
      let cleanProtein = proteinPDB || currentStructure.pdb_data
      if (cleanProtein) {
        cleanProtein = cleanProtein.replace(/END\s*$/, '').replace(/ENDMDL\s*$/, '').trim()
      }

      const taggedPose = assignPoseChain(pdbData.trim(), POSE_CHAINS[0])
      const combinedPDB = cleanProtein + '\nTER\n' + taggedPose + '\nEND'
      const poseAffinity = dockingResults.poses?.[poseIndex]?.affinity?.toFixed(2) || 'N/A'

      const structureId = currentStructure.structure_id || 'structure'
      const baseId = structureId.split('_pose_')[0]

      setCurrentStructure({
        ...currentStructure,
        structure_id: `${baseId}_pose_${poseIndex + 1}_${poseAffinity}`,
        pdb_data: combinedPDB,
        metadata: {
          ...currentStructure.metadata,
          pose_index: poseIndex + 1,
          pose_affinity: dockingResults.poses?.[poseIndex]?.affinity,
          is_docked_pose: true,
          pose_chain_ids: [POSE_CHAINS[0]],
        } as any,
      })
      setSelectedPoseIndex(poseIndex)
    } catch (err: any) {
      console.error('Visualization error:', err)
      setError(`Failed to visualize pose: ${err.message}`)
    }
  }

  const handleVisualizeMultiplePoses = async (poseIndices: number[]) => {
    if (!dockingResults || !currentStructure || poseIndices.length === 0) return

    try {
      // Ensure original protein PDB is saved
      let proteinPDB = originalProteinPDB
      if (!proteinPDB) {
        if (!currentStructure.metadata?.is_docked_pose) {
          proteinPDB = currentStructure.pdb_data
          setOriginalProteinPDB(proteinPDB)
        } else {
          const parts = currentStructure.pdb_data.split(/\nTER\n/)
          proteinPDB = parts[0]
          if (!proteinPDB.includes('END')) proteinPDB += '\nEND'
        }
      }

      let cleanProtein = (proteinPDB || currentStructure.pdb_data).replace(/END\s*$/, '').replace(/ENDMDL\s*$/, '').trim()
      let combinedPDB = cleanProtein
      const usedChainIds: string[] = []

      for (let i = 0; i < poseIndices.length; i++) {
        const poseIndex = poseIndices[i]
        let pdbData = ''

        // Option 1: backend-converted PDB
        if (dockingResults.poses_pdb) {
          try {
            const pdbPoses = parsePDBQT(dockingResults.poses_pdb)
            if (pdbPoses[poseIndex]) pdbData = pdbPoses[poseIndex]
          } catch (e) { /* continue */ }
        }
        // Option 2: SDF
        if (!pdbData && dockingResults.poses_sdf) {
          try {
            const sdfPoses = parseSDF(dockingResults.poses_sdf)
            if (sdfPoses[poseIndex]) pdbData = convertSDFtoPDB(sdfPoses[poseIndex])
          } catch (e) { /* continue */ }
        }
        // Option 3: raw PDBQT
        if (!pdbData) {
          try {
            const pdbqtPoses = parsePDBQT(dockingResults.poses_pdbqt || dockingResults.log || '')
            if (pdbqtPoses[poseIndex]) pdbData = convertPDBQTtoPDB(pdbqtPoses[poseIndex])
          } catch (e) { /* continue */ }
        }

        if (!pdbData) {
          console.warn(`Pose ${poseIndex + 1} not found, skipping`)
          continue
        }

        const chainId = POSE_CHAINS[i % POSE_CHAINS.length]
        const taggedPose = assignPoseChain(pdbData.trim(), chainId)
        combinedPDB += '\nTER\n' + taggedPose
        usedChainIds.push(chainId)
      }

      combinedPDB += '\nEND'

      const structureId = currentStructure.structure_id || 'structure'
      const baseId = structureId.split('_pose_')[0]

      setCurrentStructure({
        ...currentStructure,
        structure_id: `${baseId}_compare_${poseIndices.map(i => i + 1).join('_')}`,
        pdb_data: combinedPDB,
        metadata: {
          ...currentStructure.metadata,
          is_docked_pose: true,
          pose_chain_ids: usedChainIds,
        } as any,
      })
      setSelectedPoseIndex(poseIndices[0])
    } catch (err: any) {
      console.error('Multi-pose visualization error:', err)
      setError(`Failed to visualize poses: ${err.message}`)
    }
  }

  const handleSavePose = async (poseIndex: number) => {
    setSavingPose(poseIndex)
    setSaveMessage(null)
    try {
      // Prefer backend-converted PDB format (properly converted via OpenBabel)
      let pdbData: string = ''

      // Option 1: Use backend-converted PDB (preferred)
      if (dockingResults?.poses_pdb) {
        const pdbPoses = parsePDBQT(dockingResults.poses_pdb)
        if (pdbPoses[poseIndex]) {
          pdbData = pdbPoses[poseIndex]
        }
      }

      // Option 2: Fallback to SDF format
      if (!pdbData && dockingResults?.poses_sdf) {
        const sdfPoses = parseSDF(dockingResults.poses_sdf)
        if (sdfPoses[poseIndex]) {
          pdbData = convertSDFtoPDB(sdfPoses[poseIndex])
        }
      }

      // Option 3: Last resort - use raw PDBQT with frontend conversion (legacy)
      if (!pdbData) {
        const pdbqtPoses = parsePDBQT(dockingResults?.poses_pdbqt || dockingResults?.log || '')
        if (!pdbqtPoses[poseIndex]) throw new Error('Pose not found')
        pdbData = convertPDBQTtoPDB(pdbqtPoses[poseIndex])
      }

      const affinity = dockingResults?.poses?.[poseIndex]?.affinity?.toFixed(2) || 'N/A'
      await api.saveStructureToLibrary(pdbData, `Docked Pose ${poseIndex + 1} (${affinity} kcal/mol)`)
      setSaveMessage({ type: 'success', text: 'Pose saved to library' })
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err: any) {
      setError(err.message)
      setSaveMessage({ type: 'error', text: err.message })
    } finally {
      setSavingPose(null)
    }
  }

  const handleOptimizeWithMD = async (poseIndex: number) => {
    try {
      if (!dockingResults) {
        throw new Error('No docking results available')
      }

      console.log('[DockingTool] handleOptimizeWithMD - poseIndex:', poseIndex)
      console.log('[DockingTool] handleOptimizeWithMD - poses_pdb available:', !!dockingResults.poses_pdb)
      console.log('[DockingTool] handleOptimizeWithMD - poses_sdf available:', !!dockingResults.poses_sdf)

      // Prefer backend-converted PDB format (properly converted via OpenBabel)
      let pdbData: string = ''

      // Option 1: Use backend-converted PDB (preferred)
      if (dockingResults?.poses_pdb) {
        try {
          const pdbPoses = parsePDBQT(dockingResults.poses_pdb)
          console.log('[DockingTool] handleOptimizeWithMD - Backend PDB poses parsed:', pdbPoses.length)
          if (pdbPoses[poseIndex]) {
            pdbData = pdbPoses[poseIndex]
            console.log('[DockingTool] handleOptimizeWithMD - Using backend-converted PDB, length:', pdbData.length)
          }
        } catch (e) {
          console.error('[DockingTool] handleOptimizeWithMD - Error parsing backend PDB:', e)
        }
      }

      // Option 2: Fallback to SDF format
      if (!pdbData && dockingResults?.poses_sdf) {
        try {
          const sdfPoses = parseSDF(dockingResults.poses_sdf)
          console.log('[DockingTool] handleOptimizeWithMD - SDF poses parsed:', sdfPoses.length)
          if (sdfPoses[poseIndex]) {
            pdbData = convertSDFtoPDB(sdfPoses[poseIndex])
            console.log('[DockingTool] handleOptimizeWithMD - Converted SDF to PDB, length:', pdbData.length)
          }
        } catch (e) {
          console.error('[DockingTool] handleOptimizeWithMD - Error parsing SDF:', e)
        }
      }

      // Option 3: Last resort - use raw PDBQT with frontend conversion (legacy)
      if (!pdbData) {
        console.log('[DockingTool] handleOptimizeWithMD - Falling back to PDBQT (legacy)')
        const logData = dockingResults?.poses_pdbqt || dockingResults?.log || ''
        console.log('[DockingTool] handleOptimizeWithMD - PDBQT data length:', logData?.length || 0)

        const pdbqtPoses = parsePDBQT(logData)
        console.log('[DockingTool] handleOptimizeWithMD - PDBQT poses parsed:', pdbqtPoses.length)

        if (!pdbqtPoses[poseIndex]) {
          throw new Error(`Pose ${poseIndex} not found. Available poses: ${pdbqtPoses.length}`)
        }

        pdbData = convertPDBQTtoPDB(pdbqtPoses[poseIndex])
        console.log('[DockingTool] handleOptimizeWithMD - Converted PDBQT to PDB (frontend), length:', pdbData.length)
      }

      if (!pdbData) {
        throw new Error('Failed to convert pose to PDB format')
      }

      const affinity = dockingResults?.poses?.[poseIndex]?.affinity?.toFixed(2) || 'N/A'

      const structureId = currentStructure?.structure_id || 'current'
      // If it's a pose, extract the base ID (which should be the protein ID)
      const proteinId = structureId.includes('_pose_') ? structureId.split('_pose_')[0] : structureId

      mdStore.reset()
      mdStore.setSelectedProtein(proteinId)
      mdStore.setSelectedLigandMethod('structure')
      mdStore.setLigandInput({
        method: 'structure',
        file_data: pdbData,
        file_name: `docked_pose_${poseIndex + 1}_${affinity}.pdb`,
        preserve_pose: true,
        generate_conformer: false,
      })
      uiStore.setActiveTool('md-optimization')
    } catch (err: any) {
      console.error('[DockingTool] handleOptimizeWithMD error:', err)
      setError(err.message)
    }
  }

  const handleReset = () => {
    setDockingResults(null)
    setSelectedPoseIndex(null)
    setIsDockingRunning(false)
    setDockingProgress(0)
    setDockingStatus('')
    setCurrentStep(1)
    setGridBox(null)
    setShowManualGrid(false)
    setOriginalProteinPDB(null)
    setError(null)
    setSaveMessage(null)
  }

  const handleJobSelected = async (jobId: string) => {
    try {
      const job = await api.getDockingJob(jobId)
      // PostgreSQL stores result in job.result, but docking service wraps it in another 'result' field
      // So actual data is at job.result.result
      const rawResult = job?.result
      const results = rawResult?.result || rawResult // Handle both nested and flat structures

      console.log('[DockingTool] handleJobSelected - rawResult:', rawResult)
      console.log('[DockingTool] handleJobSelected - results:', results)
      console.log('[DockingTool] handleJobSelected - poses_pdbqt exists:', !!results?.poses_pdbqt)
      console.log('[DockingTool] handleJobSelected - poses_sdf exists:', !!results?.poses_sdf)

      if (job && results && results.success) {
        // Extract PDBQT data - check multiple possible locations
        const pdbqtData = results.poses_pdbqt || results.log || rawResult?.poses_pdbqt || ''
        const sdfData = results.poses_sdf || rawResult?.poses_sdf || ''

        console.log('[DockingTool] handleJobSelected - pdbqtData length:', pdbqtData?.length || 0)
        console.log('[DockingTool] handleJobSelected - sdfData length:', sdfData?.length || 0)

        const processedResults: DockingResults = {
          success: true,
          poses: results.scores?.map((score: any, idx: number) => ({
            mode: score.mode || idx + 1,
            affinity: typeof score === 'number' ? score : (score.affinity || 0),
            rmsd_lb: typeof score === 'number' ? 0 : (score.rmsd_lb || 0),
            rmsd_ub: typeof score === 'number' ? 0 : (score.rmsd_ub || 0),
          })) || [],
          best_affinity: results.best_score || results.best_affinity,
          num_poses: results.num_poses || results.scores?.length || 0,
          log: pdbqtData, // PDBQT data for pose visualization
          poses_sdf: sdfData, // SDF data with preserved bond orders
          binding_strength: results.binding_strength
        }

        if (processedResults.best_affinity !== undefined && !processedResults.binding_strength) {
          processedResults.binding_strength = calculateBindingStrength(processedResults.best_affinity)
        }

        setDockingResults(processedResults)

        // If we have the protein structure stored in the job, we might want to load it?
        // For now, we assume the user might need to reload the protein if it's different.
        // But DockingStepResults handles the visualization request.
      }
    } catch (err) {
      console.error("Failed to load job results:", err)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        if (isBatchMode) {
          return proteinLoaded && batchLigands.length > 0
        }
        return proteinLoaded && selectedLigand !== ''
      case 2: return true
      case 3: return gridBox !== null
      default: return true
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Workflow Mode Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">Docking Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIsBatchMode(false)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${!isBatchMode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Target className={`w-4 h-4 ${!isBatchMode ? 'text-blue-400' : 'text-gray-400'}`} />
                    <div className="font-medium text-white">Single Ligand</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Dock one ligand against the protein. Best for detailed analysis.
                  </div>
                </button>
                <button
                  onClick={() => setIsBatchMode(true)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${isBatchMode
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className={`w-4 h-4 ${isBatchMode ? 'text-blue-400' : 'text-gray-400'}`} />
                    <div className="font-medium text-white">Batch Mode</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Dock multiple ligands sequentially. Efficient for virtual screening.
                  </div>
                </button>
              </div>
            </div>

            <StructureSelector
              selectedProtein={proteinLoaded ? 'current' : null}
              onProteinSelect={() => { }}
              hasProtein={proteinLoaded}
              proteinName={currentStructure?.structure_id}
              selectedLigand={!isBatchMode ? selectedLigand : null}
              onLigandSelect={(id: string | null) => setSelectedLigand(id || '')}
              availableLigands={availableLigands.map(l => ({ id: l.id, name: l.name, source: l.id?.startsWith('library_') ? 'library' as const : 'current_structure' as const }))}
              accentColor="blue"
              showLigandInput={!isBatchMode}
              ligandInputMethod={ligandInputMethod}
              onLigandMethodChange={setLigandInputMethod}
              showSmilesInput={true}
              smilesValue={smilesInput}
              onSmilesChange={setSmilesInput}
              onValidateSmiles={handleValidateSmiles}
              showFileUpload={true}
              onFileUpload={handleFileUpload}
              uploadedFileName={uploadedFile?.name}
            />

            {isBatchMode && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Select Ligands for Batch Docking</h4>
                  <div className="flex gap-2">
                    <label className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors">
                      Upload Ligand
                      <input
                        type="file"
                        accept=".pdb,.sdf,.mol2"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  {batchLigands.length} selected
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableLigands.length === 0 ? (
                    <InfoBox variant="warning" title="No Ligands Available">
                      Please load a structure with ligands or add molecules to the library.
                    </InfoBox>
                  ) : (
                    availableLigands.map((ligand) => (
                      <label
                        key={ligand.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all group ${batchLigands.includes(ligand.id)
                          ? 'bg-blue-500/10 border-blue-500/50'
                          : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                          }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${batchLigands.includes(ligand.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-gray-900 border-gray-600 group-hover:border-gray-500'
                          }`}>
                          {batchLigands.includes(ligand.id) && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          checked={batchLigands.includes(ligand.id)}
                          onChange={() => handleSelectBatchLigand(ligand.id)}
                          className="hidden"
                        />
                        <span className={`text-sm transition-colors ${batchLigands.includes(ligand.id) ? 'text-white' : 'text-gray-300 group-hover:text-white'
                          }`}>
                          {ligand.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <ParameterSection title="Docking Algorithm" collapsible defaultExpanded>
              <SelectParameter
                label="Scoring Function"
                value={dockingParams.scoringFunction}
                onChange={(v: string) => setDockingParams({ ...dockingParams, scoringFunction: v as 'vina' | 'ad4' | 'vinardo' })}
                options={[
                  { value: 'vina', label: 'Vina (Default)' },
                  { value: 'vinardo', label: 'Vinardo' },
                  { value: 'ad4', label: 'AutoDock 4' },
                ]}
              />
              <SliderParameter
                label="Exhaustiveness"
                value={dockingParams.exhaustiveness}
                onChange={(v: number) => setDockingParams({ ...dockingParams, exhaustiveness: v })}
                min={1}
                max={64}
                step={1}
                description="Higher = more thorough but slower (32 recommended)"
                accentColor="blue"
              />
              <SliderParameter
                label="Number of Poses"
                value={dockingParams.numPoses}
                onChange={(v: number) => setDockingParams({ ...dockingParams, numPoses: v })}
                min={1}
                max={20}
                step={1}
                description="Maximum poses to generate"
                accentColor="blue"
              />
            </ParameterSection>

            {/* Redocking Validation - only show when structure has co-crystallized ligands */}
            {currentStructure?.ligands && Object.keys(currentStructure.ligands).length > 0 && (
              <ParameterSection title="Pipeline Validation" collapsible defaultExpanded={false}>
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">
                    Validate the docking pipeline by redocking a co-crystallized ligand. RMSD &lt; 2.0 A indicates the pipeline can reproduce the experimental binding mode.
                  </p>
                  <button
                    onClick={async () => {
                      if (!currentStructure?.pdb_data) return
                      setIsValidatingRedock(true)
                      setRedockResult(null)
                      try {
                        const result = await api.validateRedocking(
                          currentStructure.pdb_data,
                          undefined,
                          dockingParams.exhaustiveness
                        )
                        setRedockResult(result)
                      } catch (err: any) {
                        setRedockResult({ error: err.message || 'Validation failed' })
                      } finally {
                        setIsValidatingRedock(false)
                      }
                    }}
                    disabled={isValidatingRedock}
                    className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isValidatingRedock ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Redocking...
                      </>
                    ) : (
                      <>
                        <FlaskConical className="w-4 h-4" />
                        Validate Redocking
                      </>
                    )}
                  </button>
                  {redockResult && (
                    <InfoBox
                      variant={redockResult.error ? 'error' : redockResult.passed ? 'success' : 'warning'}
                      title={
                        redockResult.error
                          ? 'Validation Error'
                          : redockResult.passed
                            ? 'Redocking Passed'
                            : 'Redocking Failed'
                      }
                    >
                      {redockResult.error ? (
                        <span>{redockResult.error}</span>
                      ) : (
                        <div className="space-y-1">
                          <div>RMSD: <strong>{redockResult.rmsd?.toFixed(2)} A</strong> {redockResult.passed ? '(< 2.0 A)' : '(>= 2.0 A)'}</div>
                          <div>Best affinity: <strong>{redockResult.best_affinity?.toFixed(2)} kcal/mol</strong></div>
                        </div>
                      )}
                    </InfoBox>
                  )}
                </div>
              </ParameterSection>
            )}

            <ParameterSection title="Grid Settings" collapsible defaultExpanded={false}>
              <SliderParameter
                label="Grid Padding"
                value={dockingParams.gridPadding}
                onChange={(v: number) => setDockingParams({ ...dockingParams, gridPadding: v })}
                min={2}
                max={15}
                step={0.5}
                unit="Å"
                description="Extra space around ligand"
                accentColor="blue"
              />
              <SliderParameter
                label="Energy Range"
                value={dockingParams.energyRange}
                onChange={(v: number) => setDockingParams({ ...dockingParams, energyRange: v })}
                min={1}
                max={100}
                step={1}
                unit="kcal/mol"
                description="Max energy difference from best pose"
                accentColor="blue"
              />
            </ParameterSection>
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleAutoCalculateGridBox}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Auto-Calculate (Ligand)
              </button>
              <button
                onClick={handleCalculateWholeProteinGridBox}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Whole Protein Box
              </button>
            </div>

            {gridBox && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-white">Grid Box Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <NumberParameter
                    label="Center X"
                    value={gridBox.center_x}
                    onChange={(v: number) => setGridBox({ ...gridBox, center_x: v })}
                    step={0.1}
                    unit="Å"
                  />
                  <NumberParameter
                    label="Size X"
                    value={gridBox.size_x}
                    onChange={(v: number) => setGridBox({ ...gridBox, size_x: v })}
                    min={5}
                    step={1}
                    unit="Å"
                  />
                  <NumberParameter
                    label="Center Y"
                    value={gridBox.center_y}
                    onChange={(v: number) => setGridBox({ ...gridBox, center_y: v })}
                    step={0.1}
                    unit="Å"
                  />
                  <NumberParameter
                    label="Size Y"
                    value={gridBox.size_y}
                    onChange={(v: number) => setGridBox({ ...gridBox, size_y: v })}
                    min={5}
                    step={1}
                    unit="Å"
                  />
                  <NumberParameter
                    label="Center Z"
                    value={gridBox.center_z}
                    onChange={(v: number) => setGridBox({ ...gridBox, center_z: v })}
                    step={0.1}
                    unit="Å"
                  />
                  <NumberParameter
                    label="Size Z"
                    value={gridBox.size_z}
                    onChange={(v: number) => setGridBox({ ...gridBox, size_z: v })}
                    min={5}
                    step={1}
                    unit="Å"
                  />
                </div>
                <ToggleParameter
                  label="Preview Grid Box"
                  value={previewGridBox}
                  onChange={setPreviewGridBox}
                  description="Show grid box in 3D viewer"
                  accentColor="blue"
                />
              </div>
            )}

            {!gridBox && (
              <InfoBox variant="warning" title="Grid Box Required">
                Click "Auto-Calculate Grid Box" to define the docking search space.
              </InfoBox>
            )}
          </div>
        )

      case 4:
        // Both single and batch jobs now use the same results component
        // Batch jobs appear in the JobList with "Batch" tags
        return (
          <DockingStepResults
            isDockingRunning={isDockingRunning}
            dockingProgress={dockingProgress}
            dockingStatus={dockingStatus}
            dockingResults={dockingResults}
            selectedPoseIndex={selectedPoseIndex}
            savingPose={savingPose}
            saveMessage={saveMessage}
            onRunDocking={handleRunDocking}
            onVisualizePose={handleVisualizePose}
            onVisualizeMultiplePoses={handleVisualizeMultiplePoses}
            onSavePose={handleSavePose}
            onOptimizeWithMD={handleOptimizeWithMD}
            onClearPoses={() => {
              setSelectedPoseIndex(null)
              if (currentStructure) {
                let originalPDB = originalProteinPDB
                // Fallback: if we lost the original PDB but are in a docked state, try to recover
                if (!originalPDB && currentStructure.metadata?.is_docked_pose) {
                  // Attempt to strip the ligand (assumes TER separator used in visualization)
                  const parts = currentStructure.pdb_data.split(/\nTER\n/)
                  if (parts.length > 1) {
                    originalPDB = parts[0]
                    // Ensure it ends correctly if we stripped it
                    if (!originalPDB.includes('END')) originalPDB += '\nEND'
                  }
                }

                if (originalPDB) {
                  // Strip _pose_N and _compare_N_M suffixes from structure_id
                  const cleanId = currentStructure.structure_id
                    .replace(/_pose_\d+$/, '')
                    .replace(/_compare_[\d_]+$/, '')
                  setCurrentStructure({
                    ...currentStructure,
                    structure_id: cleanId,
                    pdb_data: originalPDB,
                    metadata: {
                      ...currentStructure.metadata,
                      is_docked_pose: false,
                      pose_chain_ids: undefined,
                    } as any
                  })
                }
              }
            }}
            onJobSelected={handleJobSelected}
          />
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="Molecular Docking"
      description="Predict protein-ligand binding poses using AutoDock Vina"
      icon={<Target className="h-5 w-5 text-blue-400" />}
      showHeader={false}
      steps={DOCKING_STEPS}
      currentStep={currentStep}
      onStepClick={(step: number) => setCurrentStep(step)}
      onBack={() => setCurrentStep(Math.max(1, currentStep - 1))}
      onNext={() => setCurrentStep(Math.min(4, currentStep + 1))}
      onReset={handleReset}
      onExecute={currentStep === 3 ? (isBatchMode ? handleRunBatchDocking : handleRunDocking) : undefined}
      canProceed={canProceed()}
      isRunning={isDockingRunning && currentStep === 4}
      allowStepNavigationWhileRunning={true}
      executeLabel={isBatchMode ? "Start Batch Docking" : "Run Docking"}
      showExecuteOnStep={3}
      accentColor="blue"
      error={error}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}
