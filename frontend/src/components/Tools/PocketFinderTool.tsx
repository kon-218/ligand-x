'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ScanSearch, Check, AlertCircle } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import {
  WorkflowContainer,
  ParameterSection,
  SliderParameter,
  InfoBox,
} from './shared'
import type { WorkflowStep } from './shared'

interface Pocket {
  pocket_id: number
  center: { x: number; y: number; z: number }
  size: number
  score: number
  druggability: number
  volume: number
  residues?: string[] // strings like "ALA_A_123"
}

const POCKET_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Setup', description: 'Configure detection' },
  { id: 2, label: 'Results', description: 'Explore pockets' },
]

/** Parse "ALA_A_123" → { name: "ALA", chain: "A", resnum: "123" } */
function parseResidue(s: string): { name: string; chain: string; resnum: string } {
  const parts = s.split('_')
  if (parts.length >= 3) {
    return { name: parts[0], chain: parts[1], resnum: parts.slice(2).join('_') }
  }
  return { name: s, chain: '', resnum: '' }
}

function getDruggabilityColor(score: number) {
  if (score >= 0.7) return 'text-green-400'
  if (score >= 0.4) return 'text-yellow-400'
  return 'text-red-400'
}

function getDruggabilityBg(score: number) {
  if (score >= 0.7) return 'bg-green-500'
  if (score >= 0.4) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getGridBoxParams(pocket: Pocket) {
  return {
    center_x: pocket.center.x,
    center_y: pocket.center.y,
    center_z: pocket.center.z,
    size_x: pocket.size,
    size_y: pocket.size,
    size_z: pocket.size,
  }
}

export function PocketFinderTool() {
  const { currentStructure, setPendingDockingGridBox, viewerRef } = useMolecularStore()
  const { setActiveTool, addNotification } = useUIStore()

  const [currentStep, setCurrentStep] = useState(1)
  const [topN, setTopN] = useState(5)
  const [isRunning, setIsRunning] = useState(false)
  const [pockets, setPockets] = useState<Pocket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPocketId, setSelectedPocketId] = useState<number | null>(null)

  // Keep a stable ref to viewerRef so event handlers always see the latest value
  // without needing it in their closure
  const viewerRefSnapshot = useRef<typeof viewerRef>(viewerRef)
  useEffect(() => {
    viewerRefSnapshot.current = viewerRef
  })

  const hasProtein = !!(
    currentStructure?.pdb_data &&
    currentStructure.source !== 'smiles_upload' &&
    !currentStructure.structure_id?.startsWith('SMILES_molecule')
  )

  // Hide grid box when unmounting
  useEffect(() => {
    return () => {
      const viewer = viewerRefSnapshot.current as any
      viewer?.gridBox?.toggle?.(null, false)
    }
  }, [])

  const showPocketBox = (pocket: Pocket) => {
    const viewer = viewerRefSnapshot.current as any
    if (!viewer?.gridBox?.toggle) return
    viewer.gridBox.toggle(getGridBoxParams(pocket), true)
  }

  const hidePocketBox = () => {
    const viewer = viewerRefSnapshot.current as any
    viewer?.gridBox?.toggle?.(null, false)
  }

  const handlePocketClick = (pocket: Pocket) => {
    if (selectedPocketId === pocket.pocket_id) {
      setSelectedPocketId(null)
      hidePocketBox()
    } else {
      setSelectedPocketId(pocket.pocket_id)
      showPocketBox(pocket)
    }
  }

  const handleRun = async () => {
    if (!currentStructure?.pdb_data) return
    setIsRunning(true)
    setError(null)
    setPockets(null)
    setSelectedPocketId(null)
    hidePocketBox()
    try {
      const result = await api.findPockets(currentStructure.pdb_data, topN)
      setPockets(result.pockets ?? [])
      if (!result.pockets?.length) {
        setError('No pockets detected in this structure.')
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Pocket detection failed')
    } finally {
      setIsRunning(false)
      setCurrentStep(2)
    }
  }

  const handleSendToDocking = (pocket: Pocket) => {
    setPendingDockingGridBox(getGridBoxParams(pocket))
    setActiveTool('docking')
    addNotification('success', `Pocket #${pocket.pocket_id} sent to Docking`)
  }

  const selectedPocket = pockets?.find(p => p.pocket_id === selectedPocketId)

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Protein Structure</label>
            <div className={`p-3 rounded-lg border ${hasProtein ? 'bg-gray-800 border-gray-700' : 'bg-gray-800/50 border-gray-700/50'}`}>
              <div className="flex items-center gap-2">
                {hasProtein ? (
                  <>
                    <div className="p-1 rounded-full bg-purple-500/20">
                      <Check className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-gray-300">{currentStructure?.structure_id || 'Structure loaded'}</span>
                  </>
                ) : (
                  <>
                    <div className="p-1 rounded-full bg-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                    </div>
                    <span className="text-gray-400">No protein structure loaded. Please load a structure first.</span>
                  </>
                )}
              </div>
            </div>
            </div>

            <ParameterSection title="Detection Settings" accentColor="purple">
              <SliderParameter
                label="Max Pockets"
                value={topN}
                onChange={setTopN}
                min={1}
                max={15}
                step={1}
                description="Number of top-scoring pockets to return"
                accentColor="purple"
              />
            </ParameterSection>

            <InfoBox variant="tip" title="About fpocket">
              Binding site detection uses fpocket, an open-source Voronoi tessellation algorithm.
              Pockets are ranked by score (higher is better) and druggability (0–1 scale).
            </InfoBox>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700/50 text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {pockets && pockets.length > 0 && (
              <>
                <p className="text-xs text-gray-500">
                  Click a row to preview the pocket in the 3D viewer. Click again to deselect.
                </p>

                <div className="overflow-x-auto rounded-lg border border-gray-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/80 text-gray-400 border-b border-gray-700">
                        <th className="py-2 px-3 text-left">#</th>
                        <th className="py-2 px-3 text-right">Score</th>
                        <th className="py-2 px-3 text-right">Druggability</th>
                        <th className="py-2 px-3 text-right">Vol (Å³)</th>
                        <th className="py-2 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pockets.map((pocket) => {
                        const isSelected = selectedPocketId === pocket.pocket_id
                        return (
                          <tr
                            key={pocket.pocket_id}
                            onClick={() => handlePocketClick(pocket)}
                            className={`border-b border-gray-800 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-purple-900/30 border-purple-500/50'
                                : 'hover:bg-gray-800/50'
                            }`}
                          >
                            <td className="py-2 px-3 text-gray-300 font-medium">{pocket.pocket_id}</td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-purple-500 rounded-full"
                                    style={{ width: `${Math.min(100, pocket.score * 10)}%` }}
                                  />
                                </div>
                                <span className="text-gray-200 w-10 text-right">{pocket.score.toFixed(2)}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${getDruggabilityBg(pocket.druggability)}`}
                                    style={{ width: `${pocket.druggability * 100}%` }}
                                  />
                                </div>
                                <span className={`w-10 text-right ${getDruggabilityColor(pocket.druggability)}`}>
                                  {pocket.druggability.toFixed(2)}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right text-gray-200">
                              {pocket.volume.toFixed(0)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSendToDocking(pocket)
                                }}
                                className="text-xs px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded transition-colors whitespace-nowrap"
                              >
                                → Dock
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Residue detail panel for selected pocket */}
                {selectedPocket && selectedPocket.residues && selectedPocket.residues.length > 0 && (
                  <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-gray-300">
                      Pocket #{selectedPocket.pocket_id} — lining residues
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPocket.residues.map((res, i) => {
                        const { name, chain, resnum } = parseResidue(res)
                        return (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded border border-gray-600"
                          >
                            {name} {chain}{resnum ? `:${resnum}` : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {!error && (!pockets || pockets.length === 0) && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No pockets to display. Run detection first.
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="Pocket Finder"
      description="Detect druggable binding sites with fpocket"
      icon={<ScanSearch className="w-5 h-5 text-purple-400" />}
      showHeader={false}
      steps={POCKET_STEPS}
      currentStep={currentStep}
      onStepClick={(step) => {
        if (step === 2 && pockets === null && !error) return
        setCurrentStep(step)
      }}
      onBack={() => setCurrentStep(s => Math.max(1, s - 1))}
      onNext={() => setCurrentStep(s => Math.min(2, s + 1))}
      onReset={() => {
        setCurrentStep(1)
        setPockets(null)
        setError(null)
        setSelectedPocketId(null)
        hidePocketBox()
        setTopN(5)
      }}
      onExecute={handleRun}
      canProceed={hasProtein && !isRunning}
      isRunning={isRunning}
      executeLabel="Find Pockets"
      showExecuteOnStep={1}
      accentColor="purple"
      error={null}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}
