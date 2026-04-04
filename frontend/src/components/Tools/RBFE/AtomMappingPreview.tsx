'use client'

import { useState } from 'react'
import { CheckCircle, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MappingPreviewResult, MappingPairResult } from '@/types/rbfe-types'

interface AtomMappingPreviewProps {
  result: MappingPreviewResult
  onClear: () => void
}

function qualityLabel(score: number): { label: string; color: string } {
  if (score >= 0.7) return { label: 'Excellent', color: 'text-green-400' }
  if (score >= 0.5) return { label: 'Good', color: 'text-blue-400' }
  if (score >= 0.3) return { label: 'Moderate', color: 'text-yellow-400' }
  return { label: 'Poor', color: 'text-red-400' }
}

function QualityBadge({ score }: { score: number }) {
  const { label, color } = qualityLabel(score)
  return (
    <span className={`text-xs font-medium ${color}`}>
      {label} ({score.toFixed(2)})
    </span>
  )
}

function PairDetail({ pair }: { pair: MappingPairResult }) {
  const hasSvgs = pair.svgs && pair.svgs.length >= 2

  return (
    <div className="space-y-3">
      {/* SVG renders */}
      {hasSvgs ? (
        <div className="grid grid-cols-2 gap-4">
          {[0, 1].map((idx) => (
            <div key={idx} className="rounded border border-gray-700 bg-gray-900 p-2">
              <div className="text-xs text-gray-400 mb-1 text-center">
                {idx === 0 ? pair.ligand_a : pair.ligand_b}
              </div>
              <div
                className="flex justify-center"
                dangerouslySetInnerHTML={{ __html: pair.svgs[idx] }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-gray-700 bg-gray-900 p-3 text-sm text-gray-400 text-center">
          SVG rendering not available for this pair.
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-gray-300">
          <span className="font-medium text-white">{pair.num_mapped}</span> mapped atoms
        </span>
        <span className="text-gray-300">
          <span className="font-medium text-white">{pair.num_unique_a}</span> unique in {pair.ligand_a}
        </span>
        <span className="text-gray-300">
          <span className="font-medium text-white">{pair.num_unique_b}</span> unique in {pair.ligand_b}
        </span>
      </div>

      {/* Color legend */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-500 opacity-80" />
          Mapped atoms
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500 opacity-80" />
          Unique atoms
        </span>
      </div>
    </div>
  )
}

export function AtomMappingPreview({ result, onClear }: AtomMappingPreviewProps) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [qualitySummaryOpen, setQualitySummaryOpen] = useState(false)

  const pairs = result.pairs ?? []
  const selectedPair = pairs[selectedIdx]

  const avgScore = pairs.length > 0
    ? pairs.reduce((s, p) => s + p.score, 0) / pairs.length
    : 0
  const minScore = pairs.length > 0 ? Math.min(...pairs.map((p) => p.score)) : 0
  const maxScore = pairs.length > 0 ? Math.max(...pairs.map((p) => p.score)) : 0
  const worstPair = pairs.length > 0 ? pairs.reduce((a, b) => a.score < b.score ? a : b) : null
  const hasLowQuality = worstPair !== null && worstPair.score < 0.5

  const mapperDisplay =
    result.atom_mapper === 'kartograf' ? 'Kartograf'
    : result.atom_mapper === 'lomap' ? 'LOMAP'
    : result.atom_mapper === 'lomap_relaxed' ? 'LOMAP Relaxed'
    : result.atom_mapper

  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="flex items-center justify-between rounded-lg border border-green-800 bg-green-900/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
          <div>
            <span className="text-sm font-medium text-green-300">Atom Mappings Computed</span>
            <span className="text-xs text-gray-400 ml-2">
              {mapperDisplay} · {pairs.length} pair{pairs.length !== 1 ? 's' : ''} · {result.num_ligands} ligands
            </span>
          </div>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Clear / Redo
        </button>
      </div>

      {/* Compact pair navigator */}
      {pairs.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 bg-gray-900/50">
          {/* Previous button */}
          <button
            onClick={() => setSelectedIdx((prev) => Math.max(0, prev - 1))}
            disabled={selectedIdx === 0}
            className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous transformation"
          >
            <ChevronLeft className="h-4 w-4 text-gray-300" />
          </button>

          {/* Dropdown selector */}
          <div className="flex-1 relative">
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-600 text-gray-200 text-sm focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              {pairs.map((pair, idx) => {
                const { label, color } = qualityLabel(pair.score)
                return (
                  <option key={idx} value={idx}>
                    {idx + 1}/{pairs.length}: {pair.ligand_a} → {pair.ligand_b} ({label} - {pair.score.toFixed(2)})
                  </option>
                )
              })}
            </select>
          </div>

          {/* Next button */}
          <button
            onClick={() => setSelectedIdx((prev) => Math.min(pairs.length - 1, prev + 1))}
            disabled={selectedIdx === pairs.length - 1}
            className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next transformation"
          >
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>

          {/* Counter display */}
          <div className="text-sm text-gray-400 whitespace-nowrap">
            {selectedIdx + 1} / {pairs.length}
          </div>
        </div>
      )}

      {/* Selected pair detail */}
      {selectedPair && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              {selectedPair.ligand_a} → {selectedPair.ligand_b}
            </span>
            <QualityBadge score={selectedPair.score} />
          </div>
          <PairDetail pair={selectedPair} />
        </div>
      )}

      {/* Overall quality summary (collapsible) */}
      {pairs.length > 1 && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/30">
          <button
            onClick={() => setQualitySummaryOpen((v) => !v)}
            className="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            <span>Overall Quality Summary</span>
            {qualitySummaryOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {qualitySummaryOpen && (
            <div className="px-4 pb-3 space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Avg Score</div>
                  <QualityBadge score={avgScore} />
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Min Score</div>
                  <QualityBadge score={minScore} />
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Max Score</div>
                  <QualityBadge score={maxScore} />
                </div>
              </div>
              {hasLowQuality && worstPair && (
                <div className="rounded border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
                  Worst pair: <strong>{worstPair.ligand_a} → {worstPair.ligand_b}</strong> (score {worstPair.score.toFixed(2)}).
                  Consider adding intermediate ligands or switching to LOMAP Relaxed.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
