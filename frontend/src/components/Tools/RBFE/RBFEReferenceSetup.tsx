'use client'

import { useState, useEffect } from 'react'
import { Loader2, FlaskConical, Upload, Beaker } from 'lucide-react'
import { useRBFEStore } from '@/store/rbfe-store'
import { useMolecularStore } from '@/store/molecular-store'
import { api } from '@/lib/api-client'
import { DockingPocketFinder } from '../Docking/DockingPocketFinder'
import {
  ParameterSection,
  SliderParameter,
  InfoBox,
} from '../shared'
import type { GridBox } from '@/types/docking'
import type { LigandSelection } from '@/types/rbfe-types'

interface HetatmResidue {
  residue_name: string
  chain_id: string
  pdb_string: string
}

interface DockingJob {
  id: string
  job_id?: string
  input_params?: {
    protein_id?: string
    ligand_id?: string
    ligand_name?: string
    ligand_smiles?: string
    ligand_input?: {
      smiles?: string
    }
  }
  molecule_name?: string
  result?: {
    best_affinity?: number
    best_score?: number
    poses_pdb?: string
    poses_sdf?: string
  }
  created_at?: string
  status?: string
}

type PoseTab = 'cocrystal' | 'vina' | 'prior_job'

export function RBFEReferenceSetup() {
  const rbfeStore = useRBFEStore()
  const { currentStructure, viewerRef } = useMolecularStore()

  const [activeTab, setActiveTab] = useState<PoseTab>(
    rbfeStore.referencePoseSource || 'cocrystal'
  )

  // Co-crystal tab state
  const [hetatmResidues, setHetatmResidues] = useState<HetatmResidue[]>([])
  const [hetatmLoading, setHetatmLoading] = useState(false)
  const [hetatmError, setHetatmError] = useState<string | null>(null)
  const [selectedResidue, setSelectedResidue] = useState<string | null>(null)

  // Prior job tab state
  const [dockingJobs, setDockingJobs] = useState<DockingJob[]>([])
  const [dockingJobsLoading, setDockingJobsLoading] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [previewGridBox, setPreviewGridBox] = useState(true)
  const [pocketSectionExpanded, setPocketSectionExpanded] = useState(true)
  const [manualGridBox, setManualGridBox] = useState<GridBox>({
    center_x: 0,
    center_y: 0,
    center_z: 0,
    size_x: 20,
    size_y: 20,
    size_z: 20,
  })

  const selectedLigands = rbfeStore.availableLigands.filter((lig) =>
    rbfeStore.selectedLigandIds.includes(lig.id)
  )
  const referenceLigandName =
    selectedLigands.find((l) => l.id === rbfeStore.referenceLigandId)?.name || 'Unknown ligand'

  // Load HETATM residues when co-crystal tab is active
  useEffect(() => {
    if (activeTab === 'cocrystal' && currentStructure?.pdb_data && hetatmResidues.length === 0 && !hetatmLoading) {
      loadHetatmResidues()
    }
  }, [activeTab, currentStructure?.structure_id])

  // Load docking jobs when prior_job tab is active
  useEffect(() => {
    if (activeTab === 'prior_job' && !dockingJobsLoading) {
      loadDockingJobs()
    }
  }, [activeTab, rbfeStore.referenceLigandId])

  useEffect(() => {
    if (rbfeStore.vinaGridBox) {
      setManualGridBox(rbfeStore.vinaGridBox)
    }
  }, [rbfeStore.vinaGridBox])

  // Keep RBFE Vina grid box preview synced to Mol* viewer.
  useEffect(() => {
    const viewer = viewerRef as any
    if (!viewer?.gridBox?.toggle) return

    if (activeTab === 'vina' && rbfeStore.vinaGridBox) {
      viewer.gridBox.toggle(rbfeStore.vinaGridBox, previewGridBox)
    } else {
      viewer.gridBox.toggle(null, false)
    }
  }, [viewerRef, activeTab, rbfeStore.vinaGridBox, previewGridBox])

  // Ensure Vina grid-box overlay never leaks into later RBFE steps.
  useEffect(() => {
    return () => {
      const viewer = viewerRef as any
      if (viewer?.gridBox?.toggle) {
        viewer.gridBox.toggle(null, false)
      }
    }
  }, [viewerRef])

  const loadHetatmResidues = async () => {
    if (!currentStructure?.pdb_data) return
    setHetatmLoading(true)
    setHetatmError(null)
    try {
      const residues = await api.extractCocrystalLigands(currentStructure.pdb_data)
      setHetatmResidues(residues)
      if (residues.length === 0) {
        setHetatmError('No bound ligands found in this structure.')
      }
    } catch (err: any) {
      setHetatmError(err.message || 'Failed to extract HETATM ligands')
    } finally {
      setHetatmLoading(false)
    }
  }

  const loadDockingJobs = async () => {
    setDockingJobsLoading(true)
    try {
      const response = await api.listUnifiedJobs({ job_type: 'docking', limit: 20 })
      const completed = (response.jobs || []).filter(
        (j: any) => j.status === 'completed'
      )
      const referenceLigand = selectedLigands.find((l) => l.id === rbfeStore.referenceLigandId)
      const normalizeSmiles = (s?: string) => (s || '').trim()
      const normalizeName = (s?: string) =>
        (s || '')
          .replace(/\s*\(library\)\s*$/i, '')
          .trim()
          .toLowerCase()

      const refSmiles = normalizeSmiles(referenceLigand?.smiles)
      const refName = normalizeName(referenceLigand?.name)

      const hasListMetadata = completed.some((j: DockingJob) =>
        Boolean(j.input_params?.ligand_smiles || j.input_params?.ligand_name || j.input_params?.ligand_id || j.molecule_name),
      )

      const jobsWithDetails: DockingJob[] = hasListMetadata
        ? (completed as DockingJob[])
        : (await Promise.all(
            completed.map(async (j: DockingJob) => {
              const jobId = j.id || j.job_id || ''
              if (!jobId) return j
              try {
                const details = await api.getJobDetails(jobId)
                return { ...j, input_params: details.input_params, result: details.result, molecule_name: details.molecule_name }
              } catch {
                return j
              }
            }),
          ))

      const filtered = jobsWithDetails.filter((j: DockingJob) => {
        const jobSmiles = normalizeSmiles(
          j.input_params?.ligand_smiles || j.input_params?.ligand_input?.smiles,
        )
        const jobName = normalizeName(
          j.input_params?.ligand_name || j.molecule_name || j.input_params?.ligand_id,
        )

        return Boolean(
          (refSmiles && jobSmiles && jobSmiles === refSmiles) ||
          (refName && jobName && jobName === refName),
        )
      })
      setDockingJobs(filtered)
    } catch (err) {
      console.error('Failed to load docking jobs:', err)
    } finally {
      setDockingJobsLoading(false)
    }
  }

  const extractFirstPose = (posesPdb: string): string => {
    const modelStart = posesPdb.indexOf('MODEL')
    const endmdlEnd = posesPdb.indexOf('ENDMDL')
    if (modelStart !== -1 && endmdlEnd !== -1 && endmdlEnd > modelStart) {
      return posesPdb.slice(modelStart, endmdlEnd + 'ENDMDL'.length).trim()
    }
    return posesPdb
  }

  const handleSelectReference = (ligandId: string) => {
    rbfeStore.setReferenceLigandId(ligandId)
  }

  const handleTabChange = (tab: PoseTab) => {
    setActiveTab(tab)
    // Clear pose source when switching tabs (user must confirm new selection)
    rbfeStore.setReferencePoseSource(null)
    rbfeStore.setReferencePosePdb(null)
  }

  const handleSelectCocrystal = (residueName: string) => {
    setSelectedResidue(residueName)
    const residue = hetatmResidues.find((r) => r.residue_name === residueName)
    if (residue) {
      rbfeStore.setReferencePoseSource('cocrystal')
      rbfeStore.setReferencePosePdb(residue.pdb_string)
    }
  }

  const handleSelectVina = () => {
    rbfeStore.setReferencePoseSource('vina')
    rbfeStore.setReferencePosePdb(null) // No PDB needed upfront
  }

  const updateManualGridBox = (field: keyof GridBox, value: number) => {
    const next = { ...manualGridBox, [field]: value }
    setManualGridBox(next)
    rbfeStore.setVinaGridBox(next)
  }

  const handlePocketSelected = (center: { x: number; y: number; z: number }, size: number) => {
    const box: GridBox = {
      center_x: Number(center.x.toFixed(2)),
      center_y: Number(center.y.toFixed(2)),
      center_z: Number(center.z.toFixed(2)),
      size_x: Number(size.toFixed(2)),
      size_y: Number(size.toFixed(2)),
      size_z: Number(size.toFixed(2)),
    }
    setManualGridBox(box)
    rbfeStore.setVinaGridBox(box)
    setPocketSectionExpanded(false)
  }

  const handlePocketPreviewed = (center: { x: number; y: number; z: number }, size: number) => {
    const box: GridBox = {
      center_x: Number(center.x.toFixed(2)),
      center_y: Number(center.y.toFixed(2)),
      center_z: Number(center.z.toFixed(2)),
      size_x: Number(size.toFixed(2)),
      size_y: Number(size.toFixed(2)),
      size_z: Number(size.toFixed(2)),
    }
    setManualGridBox(box)
    rbfeStore.setVinaGridBox(box)
    setPreviewGridBox(true)
  }

  const handleSelectPriorJob = async (job: DockingJob) => {
    setSelectedJobId(job.id || job.job_id || '')
    const posesPdb = job.result?.poses_pdb
    if (posesPdb) {
      rbfeStore.setReferencePoseSource('prior_job')
      rbfeStore.setReferencePosePdb(extractFirstPose(posesPdb))
    } else {
      // list endpoint may omit large payloads; fetch details as fallback
      try {
        const jobId = job.id || job.job_id || ''
        const details = await api.getJobDetails(jobId)
        const detailsPosePdb = details?.result?.poses_pdb
        if (detailsPosePdb) {
          rbfeStore.setReferencePoseSource('prior_job')
          rbfeStore.setReferencePosePdb(extractFirstPose(detailsPosePdb))
        }
      } catch (err) {
        console.error('Failed to fetch pose from job:', err)
      }
    }
  }

  const TABS: { id: PoseTab; label: string; icon: React.ReactNode }[] = [
    { id: 'cocrystal', label: 'Co-crystal from PDB', icon: <FlaskConical className="h-4 w-4" /> },
    { id: 'vina', label: 'Dock with Vina', icon: <Beaker className="h-4 w-4" /> },
    { id: 'prior_job', label: 'Import from job', icon: <Upload className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-6">
      {/* Panel A: Reference Ligand Picker */}
      <ParameterSection title="Reference Ligand" collapsible defaultExpanded>
        <p className="text-xs text-gray-400 mb-3">
          Select which ligand will serve as the reference binding pose. All other ligands will be aligned to it.
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {selectedLigands.map((lig) => (
            <button
              key={lig.id}
              onClick={() => handleSelectReference(lig.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                rbfeStore.referenceLigandId === lig.id
                  ? 'bg-cyan-900/40 border border-cyan-500/50 text-cyan-100'
                  : 'bg-gray-800/50 border border-transparent hover:bg-gray-700/50 text-gray-300'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  rbfeStore.referenceLigandId === lig.id
                    ? 'border-cyan-400 bg-cyan-400'
                    : 'border-gray-500'
                }`}
              />
              <span className="truncate">{lig.name}</span>
              {lig.source === 'current_structure' && (
                <span className="text-xs text-gray-500 ml-auto">structure</span>
              )}
              {lig.source === 'library' && (
                <span className="text-xs text-gray-500 ml-auto">library</span>
              )}
            </button>
          ))}
        </div>
        {selectedLigands.length === 0 && (
          <p className="text-xs text-yellow-400">No ligands selected. Go back to step 1.</p>
        )}
      </ParameterSection>

      {/* Panel B: Pose Source Picker (only shown when reference selected) */}
      {rbfeStore.referenceLigandId && (
        <ParameterSection title="Pose Source" collapsible defaultExpanded>
          <p className="text-xs text-gray-400 mb-3">
            How should the reference ligand&apos;s 3D binding pose be obtained?
          </p>

          {/* Tab buttons */}
          <div className="flex gap-1 mb-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-800/60 text-cyan-200 border border-cyan-600/50'
                    : 'bg-gray-800/50 text-gray-400 hover:text-gray-200 border border-transparent'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'cocrystal' && (
            <div className="space-y-3">
              {hetatmLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning structure for bound ligands...
                </div>
              )}
              {hetatmError && !hetatmLoading && (
                <InfoBox variant="warning" title="No Bound Ligands">
                  <p>{hetatmError}</p>
                </InfoBox>
              )}
              {!hetatmLoading && hetatmResidues.length > 0 && (
                <div className="space-y-1">
                  {hetatmResidues.map((res) => (
                    <button
                      key={`${res.residue_name}_${res.chain_id}`}
                      onClick={() => handleSelectCocrystal(res.residue_name)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                        selectedResidue === res.residue_name && rbfeStore.referencePoseSource === 'cocrystal'
                          ? 'bg-emerald-900/40 border border-emerald-500/50 text-emerald-100'
                          : 'bg-gray-800/50 border border-transparent hover:bg-gray-700/50 text-gray-300'
                      }`}
                    >
                      <span className="font-mono font-medium">{res.residue_name}</span>
                      <span className="text-xs text-gray-500">Chain {res.chain_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'vina' && (
            <div className="space-y-3">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                <p className="text-sm text-gray-300 mb-3">
                  Vina will dock the reference ligand at the start of the RBFE job. Define a docking box via fpocket or manual values.
                </p>
                <SliderParameter
                  label="Exhaustiveness"
                  value={rbfeStore.vinaExhaustiveness}
                  onChange={(v: number) => rbfeStore.setVinaExhaustiveness(v)}
                  min={4}
                  max={16}
                  step={1}
                  description="Higher = more thorough search (slower)"
                  accentColor="cyan"
                />
              </div>
              <ParameterSection
                title="Pocket Detection (fpocket)"
                collapsible
                expanded={pocketSectionExpanded}
                onExpandedChange={setPocketSectionExpanded}
              >
                <DockingPocketFinder
                  proteinPdbData={currentStructure?.pdb_data || null}
                  onPocketPreviewed={handlePocketPreviewed}
                  onPocketSelected={handlePocketSelected}
                />
              </ParameterSection>
              <ParameterSection title="Manual Grid Box" collapsible defaultExpanded>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(
                    [
                      ['center_x', 'Center X'],
                      ['center_y', 'Center Y'],
                      ['center_z', 'Center Z'],
                      ['size_x', 'Size X'],
                      ['size_y', 'Size Y'],
                      ['size_z', 'Size Z'],
                    ] as Array<[keyof GridBox, string]>
                  ).map(([field, label]) => (
                    <label key={field} className="flex flex-col gap-1 text-xs text-gray-400">
                      {label}
                      <input
                        type="number"
                        value={manualGridBox[field]}
                        step={0.1}
                        onChange={(e) => updateManualGridBox(field, Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={previewGridBox}
                      onChange={(e) => setPreviewGridBox(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Preview grid box in viewer
                  </label>
                </div>
              </ParameterSection>
              {rbfeStore.referencePoseSource !== 'vina' && (
                <button
                  onClick={handleSelectVina}
                  className="w-full px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-sm font-medium text-white transition-colors"
                >
                  Use Vina Docking
                </button>
              )}
              {rbfeStore.referencePoseSource === 'vina' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-900/30 border border-cyan-600/40 text-sm text-cyan-200">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  Vina docking selected — will run as part of the RBFE job
                </div>
              )}
            </div>
          )}

          {activeTab === 'prior_job' && (
            <div className="space-y-3">
              {dockingJobsLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading completed docking jobs...
                </div>
              )}
              {!dockingJobsLoading && dockingJobs.length === 0 && (
                <InfoBox variant="warning" title="No Docking Jobs">
                  <p>No matching completed docking jobs found for this reference ligand.</p>
                </InfoBox>
              )}
              {!dockingJobsLoading && dockingJobs.length > 0 && (
                <p className="text-xs text-gray-500">
                  Showing jobs matching the selected reference ligand by SMILES/name.
                </p>
              )}
              {!dockingJobsLoading && dockingJobs.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {dockingJobs.map((job) => {
                    const jobId = job.id || job.job_id || ''
                    const proteinName = job.input_params?.protein_id || 'Unknown protein'
                    const ligandName = job.input_params?.ligand_id || 'Unknown ligand'
                    const score = job.result?.best_affinity
                    const date = job.created_at
                      ? new Date(job.created_at).toLocaleDateString()
                      : ''
                    const isSelected = selectedJobId === jobId && rbfeStore.referencePoseSource === 'prior_job'

                    return (
                      <button
                        key={jobId}
                        onClick={() => handleSelectPriorJob(job)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                          isSelected
                            ? 'bg-emerald-900/40 border border-emerald-500/50 text-emerald-100'
                            : 'bg-gray-800/50 border border-transparent hover:bg-gray-700/50 text-gray-300'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{ligandName}</div>
                          <div className="text-xs text-gray-500 truncate">{proteinName}</div>
                        </div>
                        {score !== undefined && (
                          <span className="text-xs font-mono text-gray-400">{score.toFixed(1)} kcal/mol</span>
                        )}
                        <span className="text-xs text-gray-500 flex-shrink-0">{date}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </ParameterSection>
      )}

      {/* Status summary */}
      {rbfeStore.referenceLigandId && rbfeStore.referencePoseSource && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/30 text-sm text-emerald-300">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          Reference: {referenceLigandName}
          {' '}— Pose source: {rbfeStore.referencePoseSource === 'cocrystal' ? 'Co-crystal' : rbfeStore.referencePoseSource === 'vina' ? 'Vina docking' : 'Prior job'}
        </div>
      )}

      <InfoBox variant="info" title="Reference Pose Setup">
        <p className="text-sm">
          The reference ligand defines the binding pose orientation for your RBFE network.
          All other ligands are MCS-aligned to it. Choose a ligand with a reliable 3D pose
          (co-crystal is best when available).
        </p>
      </InfoBox>
    </div>
  )
}
