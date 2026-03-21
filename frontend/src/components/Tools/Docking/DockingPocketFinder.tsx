'use client'

import React, { useState } from 'react'
import { Loader2, Target } from 'lucide-react'
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
  onPocketSelected: (center: { x: number; y: number; z: number }, size: number) => void
}

export function DockingPocketFinder({ proteinPdbData, onPocketSelected }: DockingPocketFinderProps) {
  const [loading, setLoading] = useState(false)
  const [pockets, setPockets] = useState<Pocket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const handleFind = async () => {
    if (!proteinPdbData) return
    setLoading(true)
    setError(null)
    setPockets(null)
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

  const handleSelect = (pocket: Pocket) => {
    setSelectedId(pocket.pocket_id)
    onPocketSelected(pocket.center, pocket.size)
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="py-1.5 px-2 text-left">#</th>
                <th className="py-1.5 px-2 text-right">Score</th>
                <th className="py-1.5 px-2 text-right">Druggability</th>
                <th className="py-1.5 px-2 text-right">Vol (Å³)</th>
                <th className="py-1.5 px-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {pockets.map((pocket) => (
                <tr
                  key={pocket.pocket_id}
                  className={`border-b border-gray-800 transition-colors ${selectedId === pocket.pocket_id ? 'bg-indigo-900/30 border-indigo-500/50' : 'hover:bg-gray-700/30'}`}
                >
                  <td className="py-1.5 px-2 text-gray-300">{pocket.pocket_id}</td>
                  <td className="py-1.5 px-2 text-right text-gray-200">{pocket.score.toFixed(3)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-200">{pocket.druggability.toFixed(3)}</td>
                  <td className="py-1.5 px-2 text-right text-gray-200">{pocket.volume.toFixed(0)}</td>
                  <td className="py-1.5 px-2 text-center">
                    <button
                      onClick={() => handleSelect(pocket)}
                      className="text-xs px-2 py-0.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded transition-colors"
                    >
                      Use
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
