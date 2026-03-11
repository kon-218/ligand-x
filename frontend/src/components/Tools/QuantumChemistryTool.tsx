'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Settings, BarChart3 } from 'lucide-react'
import { useQCStore } from '@/store/qc-store'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { qcService } from '@/lib/qc-service'
import { QCTabSetup } from './QuantumChemistry/QCTabSetup'
import { QCTabResults } from './QuantumChemistry/QCTabResults'
import { normalizeStatus } from './QuantumChemistry/utils'
import type { QCAdvancedParameters as QCAdvancedParametersType } from '@/components/Tools/QC/QCAdvancedParameters'
import { LoadingOverlay } from '@/components/ui/LoadingOverlay'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import type { Ligand } from '@/types/molecular'

export function QuantumChemistryTool() {
    const { addNotification } = useUIStore()
    const { currentStructure, addInputFileTab, addStructureTab, setCurrentStructure, viewerRef } = useMolecularStore()
    const {
        activeJobId,
        results,
        activeResults,
        advancedParameters,
        updateJob,
        setActiveJob,
        setIsRunning,
        setResults,
        setActiveResults,
        setAdvancedParameters,
    } = useQCStore()

    const {
        activeJobId: unifiedActiveJobId,
        setActiveJob: setUnifiedActiveJob,
        refreshJobs,
        getJobById,
        allJobs,
    } = useUnifiedResultsStore()

    const qcJobs = useMemo(() => allJobs.filter((j: any) => j.service === 'qc'), [allJobs])

    // Local State
    const [activeTab, setActiveTab] = useState<'setup' | 'results'>('setup')
    const [resultsSubtab, setResultsSubtab] = useState<'recent' | 'completed'>('completed')
    const [jobTypeFilter, setJobTypeFilter] = useState<'all' | 'standard' | 'ir' | 'fukui' | 'conformer'>('all')
    const [loadingResults, setLoadingResults] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [calculationType, setCalculationType] = useState<'standard' | 'fukui' | 'conformer'>('standard')
    const [fukuiMethod, setFukuiMethod] = useState<string>('B3LYP')
    const [fukuiBasisSet, setFukuiBasisSet] = useState<string>('def2-SVP')
    const [conformerCount, setConformerCount] = useState<number>(50)
    const [energyWindow, setEnergyWindow] = useState<number>(5.0)
    const [fukuiCores, setFukuiCores] = useState<number>(4)
    const [conformerCores, setConformerCores] = useState<number>(4)

    // Sync isRunning state
    useEffect(() => {
        const hasRunningJobs = qcJobs.some((job: any) =>
            job.status === 'running' || job.status === 'pending'
        )
        setIsRunning(hasRunningJobs)
    }, [qcJobs, setIsRunning])

    // Jobs are now loaded via WebSocket (JobWebSocketProvider) and Results Browser tab polling.
    // Individual tools no longer need to call startPolling() to avoid duplicate polling.
    // The store's allJobs is automatically updated via WebSocket or central polling.

    // Auto-add hydrogens to small molecules
    useEffect(() => {
        const autoAddHydrogens = async () => {
            if (!currentStructure) return
            if (currentStructure.structure_id?.endsWith('_h')) return

            const isSmallMolecule = currentStructure.sdf_data || currentStructure.xyz_data
            if (!isSmallMolecule) return

            try {
                const moleculeData = currentStructure.sdf_data || currentStructure.xyz_data ||
                    (currentStructure.ligands ? Object.values(currentStructure.ligands)[0]?.sdf_data : null)

                if (!moleculeData) return

                const response = await fetch('/api/qc/add-hydrogens', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ molecule_xyz: moleculeData })
                })

                const data = await response.json()
                if (!response.ok) return

                const newStructure = {
                    ...currentStructure,
                    xyz_data: data.molecule_xyz,
                    sdf_data: undefined,
                    pdb_data: '',
                    structure_id: `${currentStructure.structure_id}_h`
                }

                setCurrentStructure(newStructure)
                addNotification('info', 'Hydrogens added automatically for QC calculations')
            } catch (error) {
                console.error('Error auto-adding hydrogens:', error)
            }
        }

        autoAddHydrogens()
    }, [currentStructure?.structure_id])


    // Poll job results
    const pollJobResults = async (jobId: string) => {
        try {
            const { loadAllJobs } = useUnifiedResultsStore.getState()
            const result = await qcService.pollJobUntilComplete(
                jobId,
                (status) => {
                    updateJob(jobId, {
                        status: normalizeStatus(status.status),
                        progress: status.progress,
                        updated_at: new Date().toISOString(),
                    })
                }
            )

            if (result.results && Object.values(result.results).some(val => val !== null)) {
                // Store results but don't auto-display them - user must click on job
                setResults(jobId, result.results)
                addNotification('success', `Quantum chemistry calculation completed. Click on the job to view results.`)
            } else {
                addNotification('warning', `Calculation completed but no results were returned`)
            }

            updateJob(jobId, { status: 'completed', updated_at: new Date().toISOString() })
            // Switch to completed tab so user can see and click on the finished job
            setResultsSubtab('completed')
            // Clear job type filter so the job is visible
            setJobTypeFilter('all')
            // Refresh unified results store to show job in completed section
            loadAllJobs()

        } catch (error) {
            console.error('Job failed:', error)
            updateJob(jobId, {
                status: 'failed',
                error_message: error instanceof Error ? error.message : 'Job failed',
                updated_at: new Date().toISOString(),
            })
            addNotification('error', `Quantum chemistry job ${jobId} failed`)
            // Refresh unified results store to show failed job
            const { loadAllJobs } = useUnifiedResultsStore.getState()
            loadAllJobs()
        }
    }

    // Submit Standard Job (params passed from QCTabSetup or from custom advanced editor)
    const handleSubmitJob = async (params: QCAdvancedParametersType) => {
        if (!currentStructure) {
            addNotification('error', 'Please load a molecule first')
            return
        }

        setSubmitting(true)
        setAdvancedParameters(params)
        try {
            const ligands: Ligand[] = currentStructure.ligands ? Object.values(currentStructure.ligands) : []
            const ligandKeys = currentStructure.ligands ? Object.keys(currentStructure.ligands) : []

            const moleculeData = currentStructure.sdf_data ||
                               ligands[0]?.sdf_data ||
                               ligands[0]?.pdb_data ||
                               currentStructure.pdb_data ||
                               currentStructure.xyz_data || ''

            if (!moleculeData) {
                addNotification('error', 'No 3D molecular data available')
                return
            }

            // Determine molecule name: use ligand residue_name (het_id) if from protein, otherwise structure_id
            let moleculeName = currentStructure.structure_id || 'unknown'
            if (ligands.length > 0) {
                const firstLigand = ligands[0]
                // Use residue_name (3-letter het_id like 'BEN', 'ATP') or ligand name as the molecule name
                moleculeName = firstLigand.residue_name || firstLigand.name || ligandKeys[0] || moleculeName
            }

            let backendJobType = params.job_type
            if (params.job_type === 'OPT_FREQ') backendJobType = 'OPT_FREQ'
            else if (params.job_type === 'OPTTS') backendJobType = 'OPTTS'
            else if (params.compute_frequencies && params.job_type === 'OPT') backendJobType = 'OPT_FREQ'
            else if (params.compute_frequencies && params.job_type === 'SP') backendJobType = 'FREQ'

            // Use unified job submission endpoint
            const { api } = await import('@/lib/api-client')
            const submission = await api.submitJob('qc', {
                qc_job_type: 'standard',
                molecule_xyz: moleculeData,
                molecule_name: moleculeName,
                charge: params.charge,
                multiplicity: params.multiplicity,
                method: params.method,
                basis_set: params.basis_set,
                job_type: backendJobType,
                compute_frequencies: params.compute_frequencies,
                n_procs: params.n_procs,
                memory_mb: params.memory_mb,
                solvation: params.solvation || undefined,
                calculate_properties: params.calculate_properties,
                extra_keywords: params.extra_keywords || undefined,
                dispersion: params.dispersion,
                use_rijcosx: params.use_rijcosx,
                scf_convergence: params.scf_convergence,
                convergence_strategy: params.convergence_strategy,
                use_slow_conv: params.use_slow_conv,
                integration_grid: params.integration_grid,
                broken_symmetry_atoms: params.broken_symmetry_atoms || undefined,
                temperature: params.temperature,
                pressure: params.pressure,
            })

            const job_id = submission.job_id

            setUnifiedActiveJob(job_id, 'qc')
            setActiveJob(job_id)
            setIsRunning(true)
            setActiveTab('results')
            setResultsSubtab('recent')
            addNotification('success', `Job ${job_id} submitted successfully`)
            refreshJobs()
            pollJobResults(job_id)

        } catch (error) {
            console.error('Failed to submit QC job:', error)
            addNotification('error', error instanceof Error ? error.message : 'Failed to submit QC job')
        } finally {
            setSubmitting(false)
        }
    }

    // Submit Fukui Job
    const handleSubmitFukuiJob = async () => {
        if (!currentStructure) return
        setSubmitting(true)
        try {
            const ligands: Ligand[] = currentStructure.ligands ? Object.values(currentStructure.ligands) : []
            const ligandKeys = currentStructure.ligands ? Object.keys(currentStructure.ligands) : []

            // Prioritize ligand data (SDF/PDB) over the main structure PDB/XYZ
            // This prevents sending a full protein complex for Fukui calculations
            const moleculeData = currentStructure.sdf_data ||
                               ligands[0]?.sdf_data ||
                               ligands[0]?.pdb_data ||
                               currentStructure.pdb_data ||
                               currentStructure.xyz_data || ''

            if (!moleculeData) {
                addNotification('error', 'No 3D molecular data available')
                return
            }

            // Determine molecule name: use ligand residue_name (het_id) if from protein, otherwise structure_id
            let moleculeName = currentStructure.structure_id || 'unknown'
            if (ligands.length > 0) {
                const firstLigand = ligands[0]
                moleculeName = firstLigand.residue_name || firstLigand.name || ligandKeys[0] || moleculeName
            }

            // Use unified job submission endpoint
            const { api } = await import('@/lib/api-client')
            const submission = await api.submitJob('qc', {
                qc_job_type: 'fukui',  // Specify Fukui job type for gateway routing
                molecule_xyz: moleculeData,
                molecule_name: moleculeName,
                method: fukuiMethod,
                basis_set: fukuiBasisSet,
                job_type: 'SP',
                dispersion: advancedParameters?.dispersion || 'D3BJ',
                n_procs: fukuiCores,
                memory_mb: advancedParameters?.memory_mb || 4000,
            })

            const job_id = submission.job_id

            setUnifiedActiveJob(job_id, 'qc')
            setActiveJob(job_id)
            setIsRunning(true)
            setActiveTab('results')
            setResultsSubtab('recent')
            addNotification('success', `Fukui calculation ${job_id} submitted`)
            refreshJobs()
            pollJobResults(job_id)
        } catch (error) {
            addNotification('error', error instanceof Error ? error.message : 'Failed to submit Fukui job')
        } finally {
            setSubmitting(false)
        }
    }

    // Submit Conformer Job
    const handleSubmitConformerJob = async () => {
        if (!currentStructure) return
        setSubmitting(true)
        try {
            const ligands: Ligand[] = currentStructure.ligands ? Object.values(currentStructure.ligands) : []
            const ligandKeys = currentStructure.ligands ? Object.keys(currentStructure.ligands) : []
            const smiles = currentStructure.smiles || ligands[0]?.smiles
            
            // Prioritize ligand data (SDF/PDB) over the main structure PDB/XYZ
            // This prevents sending a full protein complex for conformer search
            const moleculeData = currentStructure.sdf_data || 
                               ligands[0]?.sdf_data || 
                               ligands[0]?.pdb_data || 
                               currentStructure.pdb_data || 
                               currentStructure.xyz_data || ''

            if (!smiles && !moleculeData) {
                addNotification('error', 'Conformer search requires a SMILES string or 3D structure')
                return
            }

            if (!smiles) {
                addNotification('info', 'No SMILES found, attempting to generate from structure...')
            }

            // Determine molecule name: use ligand residue_name (het_id) if from protein, otherwise structure_id
            let moleculeName = currentStructure.structure_id || 'unknown'
            if (ligands.length > 0) {
                const firstLigand = ligands[0]
                moleculeName = firstLigand.residue_name || firstLigand.name || ligandKeys[0] || moleculeName
            }

            // Use unified job submission endpoint
            const { api } = await import('@/lib/api-client')
            const submission = await api.submitJob('qc', {
                qc_job_type: 'conformer',  // Specify conformer job type for gateway routing
                smiles: smiles,
                molecule_xyz: moleculeData,
                molecule_name: moleculeName,
                n_confs: conformerCount,
                rms_thresh: 0.5,
                energy_window: energyWindow,
                method: 'r2SCAN-3c',
                n_procs: conformerCores,
            })

            const job_id = submission.job_id

            setUnifiedActiveJob(job_id, 'qc')
            setActiveJob(job_id)
            setIsRunning(true)
            setActiveTab('results')
            setResultsSubtab('recent')
            addNotification('success', `Conformer search ${job_id} submitted`)
            refreshJobs()
            pollJobResults(job_id)
        } catch (error) {
            addNotification('error', error instanceof Error ? error.message : 'Failed to submit Conformer job')
        } finally {
            setSubmitting(false)
        }
    }

    // Handle job selection
    const handleSelectJob = useCallback(async (jobId: string) => {
        setUnifiedActiveJob(jobId, 'qc')
        setActiveJob(jobId)
        setActiveTab('results')

        if (results[jobId]) {
            setActiveResults(results[jobId])
            return
        }

        const job = getJobById(jobId)
        if (job && ((job.status as string) === 'completed' || (job.status as string) === 'success')) {
            setLoadingResults(true)
            try {
                const response = await qcService.getJobResults(jobId)
                if (response.results) {
                    setResults(jobId, response.results)
                    setActiveResults(response.results)
                } else {
                    addNotification('warning', 'Job completed but no results found')
                }
            } catch (error) {
                console.error('Failed to fetch job results:', error)
                addNotification('error', 'Failed to load job results')
            } finally {
                setLoadingResults(false)
            }
        }
    }, [setActiveJob, setUnifiedActiveJob, results, getJobById, setResults, setActiveResults, addNotification])

    // Sync selection from unified store
    useEffect(() => {
        if (unifiedActiveJobId && unifiedActiveJobId !== activeJobId) {
            const job = getJobById(unifiedActiveJobId)
            if (job?.service === 'qc') {
                handleSelectJob(unifiedActiveJobId)
            }
        }
    }, [unifiedActiveJobId, activeJobId, handleSelectJob, getJobById])

    // Handle view log
    const handleViewLog = async (jobId: string, filename?: string, title?: string) => {
        try {
            // If filename is provided, use it directly
            if (filename) {
                const logContent = await qcService.getJobFileContent(jobId, filename)
                addInputFileTab(logContent, title || filename)
                return
            }

            // Otherwise, try to guess intelligently
            try {
                const filesResponse = await qcService.getJobFiles(jobId)
                let targetFile = 'orca.out'
                let targetTitle = 'ORCA Output Log'

                if (filesResponse.files && filesResponse.files.length > 0) {
                    const files = filesResponse.files
                    
                    if (files.includes('orca.out')) {
                        targetFile = 'orca.out'
                    } else if (files.includes('neutral.out')) {
                        targetFile = 'neutral.out' 
                        targetTitle = 'Neutral Species Log'
                    } else if (files.includes('conf_0.out')) {
                        targetFile = 'conf_0.out'
                        targetTitle = 'Conformer 0 Log'
                    } else {
                        // Find any .out file
                        const outFiles = files.filter(f => f.endsWith('.out'))
                        if (outFiles.length > 0) {
                            targetFile = outFiles[0]
                            targetTitle = `Log: ${targetFile}`
                        }
                    }
                }
                
                const logContent = await qcService.getJobFileContent(jobId, targetFile)
                addInputFileTab(logContent, targetTitle)
            } catch (error) {
                // Fallback to orca.out if auto-detection fails
                try {
                    const logContent = await qcService.getJobFileContent(jobId, 'orca.out')
                    addInputFileTab(logContent, 'ORCA Output Log')
                } catch (fallbackError) {
                    // If fallback also fails, likely no logs available yet
                    console.warn('No log files available yet')
                    addNotification('info', 'No output logs available yet. The calculation may still be initializing.')
                }
            }
        } catch (error) {
            console.error('View Log Error:', error)
            addNotification('error', error instanceof Error ? error.message : 'Failed to load log file')
        }
    }



    // Load optimized structure into a new Molstar viewer tab
    const handleLoadStructure = async (jobId: string) => {
        try {
            let xyzContent = (results[jobId] as any)?.final_structure_xyz as string | undefined
            if (!xyzContent) {
                xyzContent = await qcService.getJobFileContent(jobId, 'structure.xyz')
            }
            addStructureTab({
                structure_id: `QC-${jobId}`,
                pdb_data: '',
                xyz_data: xyzContent,
                smiles: (results[jobId] as any)?.input_smiles,
                format: 'xyz',
            }, `QC Opt: ${jobId.slice(0, 8)}`)
        } catch (error) {
            console.error('Failed to load optimized structure:', error)
            addNotification('error', 'Failed to load optimized structure into viewer')
        }
    }

    // Visualization handlers
    const handleVisualizeFukui = async (type: string, values: number[]) => {
        console.log('Visualizing Fukui:', type, values)

        // Check if viewerRef is a MolstarViewerHandle with coloring methods
        if (viewerRef && 'coloring' in viewerRef && typeof viewerRef.coloring?.applyFukuiTheme === 'function') {
            try {
                await viewerRef.coloring.applyFukuiTheme(values, type)
                addNotification('success', `Fukui ${type} visualization applied`)
            } catch (error) {
                console.error('Failed to apply Fukui theme:', error)
                addNotification('error', 'Failed to apply Fukui visualization')
            }
        } else {
            console.warn('Viewer ref not available or does not support Fukui themes', {
                hasViewerRef: !!viewerRef,
                hasColoring: viewerRef && 'coloring' in viewerRef
            })
            addNotification('warning', 'Molecular viewer not available for Fukui visualization')
        }
    }

    const handleClearFukui = async () => {
        if (viewerRef && 'coloring' in viewerRef && typeof viewerRef.coloring?.applyDefault === 'function') {
            try {
                await viewerRef.coloring.applyDefault()
                addNotification('success', 'Fukui colours cleared')
            } catch (error) {
                console.error('Failed to clear Fukui theme:', error)
                addNotification('error', 'Failed to clear Fukui colours')
            }
        }
    }

    const handleVisualizeCharges = async (values: number[], type: 'chelpg' | 'mulliken') => {
        if (viewerRef && 'coloring' in viewerRef && typeof (viewerRef.coloring as any)?.applyChargesTheme === 'function') {
            try {
                await (viewerRef.coloring as any).applyChargesTheme(values)
                addNotification('success', `${type === 'chelpg' ? 'CHELPG' : 'Mulliken'} charges visualised`)
            } catch (error) {
                console.error('Failed to apply charges theme:', error)
                addNotification('error', 'Failed to visualise charges')
            }
        } else {
            addNotification('warning', 'Molecular viewer not available for charge visualisation')
        }
    }

    const handleClearCharges = async () => {
        if (viewerRef && 'coloring' in viewerRef && typeof viewerRef.coloring?.applyDefault === 'function') {
            try {
                await viewerRef.coloring.applyDefault()
                addNotification('success', 'Charge colours cleared')
            } catch (error) {
                console.error('Failed to clear charges theme:', error)
                addNotification('error', 'Failed to clear charge colours')
            }
        }
    }



    return (
        <div className="h-full flex flex-col relative">
            {/* Header Tabs */}
            <div className="flex border-b border-gray-700">
                {[
                    { id: 'setup', label: 'Setup', icon: Settings },
                    { id: 'results', label: 'Results', icon: BarChart3 },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id as any)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === id
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'setup' && (
                    <QCTabSetup
                        currentStructure={currentStructure}
                        calculationType={calculationType}
                        onCalculationTypeChange={setCalculationType}
                        advancedParameters={advancedParameters}
                        onAdvancedParametersChange={setAdvancedParameters}
                        submitting={submitting}
                        fukuiMethod={fukuiMethod}
                        fukuiBasisSet={fukuiBasisSet}
                        onFukuiMethodChange={setFukuiMethod}
                        onFukuiBasisSetChange={setFukuiBasisSet}
                        fukuiCores={fukuiCores}
                        onFukuiCoresChange={setFukuiCores}
                        conformerCount={conformerCount}
                        onConformerCountChange={setConformerCount}
                        energyWindow={energyWindow}
                        onEnergyWindowChange={setEnergyWindow}
                        conformerCores={conformerCores}
                        onConformerCoresChange={setConformerCores}
                        onSubmitStandard={handleSubmitJob}
                        onSubmitFukui={handleSubmitFukuiJob}
                        onSubmitConformer={handleSubmitConformerJob}
                        onPreviewInput={(content) => {
                            addInputFileTab(content, 'ORCA Input Preview')
                        }}
                    />
                )}

                {activeTab === 'results' && (
                    <QCTabResults
                        activeJobId={activeJobId}
                        activeResults={activeResults}
                        loadingResults={loadingResults}
                        resultsSubtab={resultsSubtab}
                        jobTypeFilter={jobTypeFilter}
                        onResultsSubtabChange={setResultsSubtab}
                        onJobTypeFilterChange={setJobTypeFilter}
                        onSelectJob={handleSelectJob}
                        onViewLog={handleViewLog}
                        onVisualizeFukui={handleVisualizeFukui}
                        onClearFukui={handleClearFukui}
                        onVisualizeCharges={handleVisualizeCharges}
                        onClearCharges={handleClearCharges}
                        onLoadStructure={handleLoadStructure}
                        viewerRef={viewerRef && 'orbitals' in viewerRef ? viewerRef as any : null}
                    />
                )}

                {/* Loading Overlay */}
                <LoadingOverlay
                    isLoading={submitting}
                    message="Submitting Job..."
                    description="Please wait while your calculation is being queued."
                />
            </div>
        </div>

    )
}
