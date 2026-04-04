'use client'

import { useState, useEffect } from 'react'
import { Loader2, Copy, Check, FlaskConical } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { useBaseColor } from '@/hooks/use-base-color'
import { api } from '@/lib/api-client'
import { isValidPdbId, isValidSmiles, cn } from '@/lib/utils'
import { saveLigandsToLibrary } from '@/lib/structure-utils'
import { FileUpload } from '@/components/ui/FileUpload'
import { Button } from '@/components/ui/button'

const API_BASE_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') : ''

export function InputTool() {
  const [activeTab, setActiveTab] = useState<'pdb' | 'upload' | 'smiles' | 'hetid'>('pdb')
  const [pdbId, setPdbId] = useState('')
  const [smiles, setSmiles] = useState('')
  const [hetid, setHetid] = useState('')
  const [hetidError, setHetidError] = useState<string | null>(null)
  const [cleanAndKeepLigands, setCleanAndKeepLigands] = useState(false)
  const [tautomers, setTautomers] = useState<{ smiles: string; score: number; is_canonical: boolean }[] | null>(null)
  const [tautomerLoading, setTautomerLoading] = useState(false)
  const [tautomerError, setTautomerError] = useState<string | null>(null)
  const [tautomerTabIds, setTautomerTabIds] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [using, setUsing] = useState<string | null>(null)
  const { currentStructure, addStructureTab, setCurrentStructure, setIsLoading, setError, structureTabs, setActiveTab: setViewerActiveTab, pendingTautomerSmiles, setPendingTautomerSmiles } = useMolecularStore()
  const { addNotification, recentPdbIds, addRecentPdbId } = useUIStore()
  const bc_active = useBaseColor()

  // Consume pendingTautomerSmiles set by LibraryTool
  useEffect(() => {
    if (pendingTautomerSmiles) {
      setActiveTab('smiles')
      setSmiles(pendingTautomerSmiles)
      setTautomers(null)
      setTautomerError(null)
      setTautomerTabIds({})
      setPendingTautomerSmiles(null)
      // Trigger enumeration after state settles
      setTimeout(async () => {
        setTautomerLoading(true)
        try {
          const data = await api.enumerateTautomers(pendingTautomerSmiles)
          setTautomers(data.tautomers)
        } catch (err: any) {
          setTautomerError(err?.response?.data?.detail || err.message || 'Enumeration failed')
        } finally {
          setTautomerLoading(false)
        }
      }, 0)
    }
  }, [pendingTautomerSmiles])

  const handleFetchPDB = async (overridePdbId?: string) => {
    const targetPdbId = (overridePdbId || pdbId).toUpperCase()
    if (!isValidPdbId(targetPdbId)) {
      setError('Invalid PDB ID format')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const structure = await api.fetchPDB(targetPdbId)
      let structureName = targetPdbId.toUpperCase()

      // If cleaning is enabled, clean the protein while keeping ligands
      if (cleanAndKeepLigands && structure.pdb_data) {
        addNotification('info', 'Cleaning protein structure...')
        try {
          const cleanResult = await api.cleanProteinStaged(structure.pdb_data, {
            remove_heterogens: true,
            remove_water: true,
            add_missing_residues: true,
            add_missing_atoms: true,
            add_missing_hydrogens: true,
            ph: 7.4,
            keep_ligands: true,
          })

          // Update structure with cleaned PDB data
          // Backend returns stages: final_with_ligands, after_hydrogens, after_missing_atoms, after_water, after_heterogens, original
          const cleanedPdb = cleanResult.stages?.final_with_ligands ||
            cleanResult.stages?.after_hydrogens ||
            cleanResult.stages?.after_missing_atoms
          if (cleanedPdb) {
            structure.pdb_data = cleanedPdb
            // Update structure ID so viewer treats it as a new structure
            structure.structure_id = `${pdbId.toUpperCase()}_cleaned`
            structureName = `${pdbId.toUpperCase()} (cleaned)`
            // Restore ligands if they were extracted
            if (cleanResult.ligands) {
              structure.ligands = cleanResult.ligands
            }
            addNotification('success', 'Protein cleaned successfully (ligands preserved)')
          }
        } catch (cleanError) {
          console.error('Failed to clean protein:', cleanError)
          addNotification('warning', 'Protein cleaning failed, using original structure')
        }
      }

      // Add the structure as a new tab
      addStructureTab(structure, structureName)
      addNotification('success', `Loaded structure: ${structureName}`)

      // Automatically save ligands to library if present
      if (structure.ligands && Object.keys(structure.ligands).length > 0) {
        const result = await saveLigandsToLibrary(structure)
        if (result.saved > 0) {
          addNotification('success', `Saved ${result.saved} ligand(s) to library`)
        } else if (result.duplicates > 0) {
          addNotification('info', `Ligand(s) already exist in library`)
        }
        if (result.errors.length > 0) {
          console.warn('Some ligands could not be saved:', result.errors)
        }
      }

      // Add to recent PDB IDs
      addRecentPdbId(targetPdbId)
    } catch (error: any) {
      setError(error.message || 'Failed to fetch PDB structure')
      addNotification('error', 'Failed to fetch PDB structure')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(null)
    try {
      const structure = await api.uploadStructure(file)
      addStructureTab(structure, file.name)
      addNotification('success', `Uploaded structure: ${file.name}`)

      // Automatically save ligands to library if present
      if (structure.ligands && Object.keys(structure.ligands).length > 0) {
        const result = await saveLigandsToLibrary(structure)
        if (result.saved > 0) {
          addNotification('success', `Saved ${result.saved} ligand(s) to library`)
        } else if (result.duplicates > 0) {
          addNotification('info', `Ligand(s) already exist in library`)
        }
        if (result.errors.length > 0) {
          console.warn('Some ligands could not be saved:', result.errors)
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to upload structure')
      addNotification('error', 'Failed to upload structure')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSMILES = async () => {
    if (!isValidSmiles(smiles)) {
      setError('Invalid SMILES string')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const structure = await api.uploadSmiles(smiles, smiles)
      addStructureTab(structure, smiles)
      addNotification('success', 'Generated 3D structure from SMILES')

      // Check if molecule was saved to library
      if (structure.library_save) {
        if (structure.library_save.saved) {
          addNotification('success', `Saved to library: ${structure.structure_id}`)
        } else if (structure.library_save.already_exists) {
          addNotification('info', 'Molecule already exists in library')
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to process SMILES')
      addNotification('error', 'Failed to process SMILES')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHETID = async () => {
    if (!hetid.trim()) {
      setHetidError('HET ID cannot be empty')
      return
    }

    setIsLoading(true)
    setHetidError(null)
    setError(null)
    try {
      // Fetch structure from PDB database containing this HET ID
      const structure = await api.fetchLigandByHETID(hetid.toUpperCase())
      const sourcePdbId = (structure as any).source_pdb_id || 'Unknown'
      const structureName = `${hetid.toUpperCase()} (from ${sourcePdbId})`

      addStructureTab(structure, structureName)
      addNotification('success', `Fetched structure with HET ID ${hetid.toUpperCase()} from PDB ${sourcePdbId}`)

      setHetid('')
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to fetch structure'
      setHetidError(errorMsg)
      setError(errorMsg)
      addNotification('error', errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEnumerateTautomers = async () => {
    if (!smiles.trim()) return
    setTautomerLoading(true)
    setTautomers(null)
    setTautomerError(null)
    setTautomerTabIds({})
    try {
      const data = await api.enumerateTautomers(smiles.trim())
      setTautomers(data.tautomers)
    } catch (err: any) {
      setTautomerError(err?.response?.data?.detail || err.message || 'Enumeration failed')
    } finally {
      setTautomerLoading(false)
    }
  }

  const handleUseTautomer = async (t: { smiles: string; score: number; is_canonical: boolean }) => {
    // Check if we already opened a viewer tab for this tautomer in the current session
    const existingTabId = tautomerTabIds[t.smiles]
    if (existingTabId && structureTabs.find(tab => tab.id === existingTabId)) {
      setViewerActiveTab(existingTabId)
      return
    }
    const label = t.is_canonical
      ? 'Tautomer (canonical)'
      : `Tautomer ${t.smiles.length > 20 ? t.smiles.slice(0, 20) + '…' : t.smiles}`
    setUsing(t.smiles)
    try {
      const structure = await api.uploadSmiles(t.smiles, t.smiles)
      addStructureTab(structure, label)
      const newTabId = useMolecularStore.getState().activeTabId
      if (newTabId) setTautomerTabIds(prev => ({ ...prev, [t.smiles]: newTabId }))
      addNotification('success', 'Tautomer opened in new viewer tab')
    } catch (err: any) {
      addNotification('error', err?.response?.data?.detail || 'Failed to load tautomer')
    } finally {
      setUsing(null)
    }
  }

  const handleCopySmiles = (s: string) => {
    navigator.clipboard.writeText(s).then(() => {
      setCopied(s)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800/50">
        {(['pdb', 'upload', 'smiles', 'hetid'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent',
              activeTab !== tab && 'text-gray-400 hover:text-gray-300',
            )}
            style={activeTab === tab ? {
              color: bc_active.hexValue,
              borderBottomColor: bc_active.hexValue,
            } : undefined}
          >
            {tab === 'hetid' ? 'HET ID' : tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'pdb' && (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">PDB ID</label>
            <input
              type="text"
              value={pdbId}
              onChange={(e) => setPdbId(e.target.value.toUpperCase())}
              placeholder="e.g., 1CRN"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleFetchPDB()}
            />
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={cleanAndKeepLigands}
                onChange={(e) => setCleanAndKeepLigands(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-gray-900"
                style={{ accentColor: bc_active.hexValue }}
              />
              Clean Protein + Keep Ligands
            </label>
            {cleanAndKeepLigands && (
              <p className="text-xs text-gray-500 ml-6">
                Fixes missing atoms, adds hydrogens, removes water
              </p>
            )}

            {/* Quick Options */}
            {recentPdbIds.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs text-gray-500 w-full mb-1">Recent:</span>
                {recentPdbIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setPdbId(id)
                      handleFetchPDB(id)
                    }}
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border rounded transition-all"
                    style={{
                      color: bc_active.hexValue,
                      borderColor: `rgba(${bc_active.rgbString}, 0.3)`,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget).style.borderColor = `rgba(${bc_active.rgbString}, 0.5)`
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget).style.borderColor = `rgba(${bc_active.rgbString}, 0.3)`
                    }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => handleFetchPDB()}
              className="w-full"
              style={{
                backgroundColor: bc_active.hexValue,
                color: 'white',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `rgba(${bc_active.rgbString}, 0.85)`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = bc_active.hexValue
              }}
            >
              Fetch Structure
            </Button>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="space-y-3">
            <FileUpload
              onFileSelect={(file) => {
                // Create a synthetic event to match the expected handler signature or update the handler
                const syntheticEvent = { target: { files: [file] } } as any
                handleFileUpload(syntheticEvent)
              }}
              accept=".pdb,.cif,.mmcif,.sdf"
              label="Upload Structure"
              description="Drag and drop a PDB, CIF, or SDF file"
            />
          </div>
        )}

        {activeTab === 'smiles' && (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">SMILES String</label>
            <input
              type="text"
              value={smiles}
              onChange={(e) => { setSmiles(e.target.value); setTautomers(null); setTautomerError(null); setTautomerTabIds({}) }}
              placeholder="e.g., CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleSMILES()}
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={handleSMILES}
                className="flex-1"
                style={{
                  backgroundColor: bc_active.hexValue,
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `rgba(${bc_active.rgbString}, 0.85)`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = bc_active.hexValue
                }}
              >
                Generate 3D Structure
              </Button>
              <Button
                variant="secondary"
                onClick={handleEnumerateTautomers}
                disabled={!smiles.trim() || tautomerLoading}
                className="flex-1"
              >
                {tautomerLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4 mr-2" />
                )}
                Enumerate Tautomers
              </Button>
            </div>

            {tautomerError && (
              <p className="text-xs text-red-400">{tautomerError}</p>
            )}

            {tautomers && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">{tautomers.length} tautomer{tautomers.length !== 1 ? 's' : ''} found</p>
                <div className="grid grid-cols-1 gap-3">
                  {tautomers.map((t) => (
                    <div
                      key={t.smiles}
                      className={`rounded-lg border p-3 space-y-2 ${t.is_canonical ? 'border-amber-500/50 bg-amber-900/10' : 'border-gray-700 bg-gray-800/50'}`}
                    >
                      <div className="flex items-center gap-2">
                        {t.is_canonical && (
                          <span className="text-xs bg-amber-600/30 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded">
                            Canonical
                          </span>
                        )}
                        <span className="ml-auto text-xs text-gray-400">Score: {t.score.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-center bg-white rounded overflow-hidden" style={{ height: 100 }}>
                        <img
                          src={`${API_BASE_URL}/api/structure/render_smiles?smiles=${encodeURIComponent(t.smiles)}&width=200&height=100`}
                          alt={t.smiles}
                          className="object-contain"
                          style={{ maxHeight: 100 }}
                          loading="lazy"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <p className="flex-1 text-xs font-mono text-gray-300 truncate" title={t.smiles}>{t.smiles}</p>
                        <button
                          onClick={() => handleCopySmiles(t.smiles)}
                          className="p-1 text-gray-500 hover:text-white transition-colors"
                          title="Copy SMILES"
                        >
                          {copied === t.smiles ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <button
                        onClick={() => handleUseTautomer(t)}
                        disabled={using === t.smiles}
                        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs border border-gray-600 rounded transition-colors disabled:opacity-50 text-gray-300"
                        onMouseEnter={(e) => {
                          const el = e.currentTarget
                          el.style.borderColor = `rgba(${bc_active.rgbString}, 0.8)`
                          el.style.color = bc_active.hexValue
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget
                          el.style.borderColor = '#4b5563'
                          el.style.color = '#d1d5db'
                        }}
                      >
                        {using === t.smiles && <Loader2 className="w-3 h-3 animate-spin" />}
                        Use This Tautomer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hetid' && (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">HET ID</label>
            <p className="text-xs text-gray-500">
              Search PDB database for structures containing a specific ligand (e.g., LIG, ATP, GTP)
            </p>
            <input
              type="text"
              value={hetid}
              onChange={(e) => setHetid(e.target.value.toUpperCase())}
              placeholder="e.g., LIG, ATP, GTP"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleHETID()}
            />
            {hetidError && (
              <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-sm text-red-400">
                {hetidError}
              </div>
            )}
            <Button
              variant="primary"
              onClick={handleHETID}
              className="w-full"
              style={{
                backgroundColor: bc_active.hexValue,
                color: 'white',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `rgba(${bc_active.rgbString}, 0.85)`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = bc_active.hexValue
              }}
            >
              Fetch Structure
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
