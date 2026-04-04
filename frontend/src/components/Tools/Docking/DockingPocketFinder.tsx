'use client'

import React, { useState } from 'react'
import { Loader2, Target, Eye, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

interface Pocket {
  pocket_id: number
  center: { x: number; y: number; z: number }
  size: number
  score: number
  druggability: number
  volume: number
}

interface DockingPocketFinderProps {
  proteinPdbData: string | null
  onPocketPreviewed: (center: { x: number; y: number; z: number }, size: number) => void
  onPocketSelected: (center: { x: number; y: number; z: number }, size: number) => void
}

export function DockingPocketFinder({ proteinPdbData, onPocketPreviewed, onPocketSelected }: DockingPocketFinderProps) {
  const [loading, setLoading] = useState(false)
  const [pockets, setPockets] = useState<Pocket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewedPocket, setPreviewedPocket] = useState<Pocket | null>(null)

  const handleFind = async () => {
    if (!proteinPdbData) return
    setLoading(true)
    setError(null)
    setPockets(null)
    setPreviewedPocket(null)
    try {
      const result = await api.findPockets(proteinPdbData)
      setPockets(result.pockets)
      if (result.pockets.length === 0) setError('No pockets detected in this structure.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Pocket detection failed')
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = (pocket: Pocket) => {
    setPreviewedPocket(pocket)
    onPocketPreviewed(pocket.center, pocket.size)
  }

  const handleConfirm = () => {
    if (!previewedPocket) return
    onPocketSelected(previewedPocket.center, previewedPocket.size)
  }

  return (
    <div className="space-y-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Detect binding pockets using fpocket</p>
        <Button
          size="sm"
          onClick={handleFind}
          disabled={!proteinPdbData || loading}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              Analyzing...
            </>
          ) : (
            <>
              <Target className="w-3.5 h-3.5 mr-1.5" />
              Find Pockets
            </>
          )}
        </Button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {pockets && pockets.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-1.5 px-2 text-left">#</th>
                  <th className="py-1.5 px-2 text-right">Score</th>
                  <th className="py-1.5 px-2 text-right">Druggability</th>
                  <th className="py-1.5 px-2 text-right">Vol (Å³)</th>
                  <th className="py-1.5 px-2 text-center">Preview</th>
                </tr>
              </thead>
              <tbody>
                {pockets.map((pocket) => {
                  const isPreviewed = previewedPocket?.pocket_id === pocket.pocket_id
                  return (
                    <tr
                      key={pocket.pocket_id}
                      className={`border-b border-gray-800 transition-colors ${isPreviewed ? 'bg-indigo-900/30 border-indigo-500/50' : 'hover:bg-gray-700/30'}`}
                    >
                      <td className="py-1.5 px-2 text-gray-300">{pocket.pocket_id}</td>
                      <td className="py-1.5 px-2 text-right text-gray-200">{pocket.score.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-200">{pocket.druggability.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-200">{pocket.volume.toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          onClick={() => handlePreview(pocket)}
                          className={`text-xs px-2 py-0.5 rounded transition-colors flex items-center gap-1 mx-auto ${
                            isPreviewed
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          {isPreviewed ? 'Viewing' : 'Preview'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-500">
              {previewedPocket
                ? `Pocket ${previewedPocket.pocket_id} shown in viewer`
                : 'Click Preview to inspect a pocket in the 3D viewer'}
            </p>
            <button
              onClick={handleConfirm}
              disabled={!previewedPocket}
              className="flex items-center gap-1.5 text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Use Pocket {previewedPocket ? `#${previewedPocket.pocket_id}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
