'use client'

import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface AtomicChargesTableProps {
    chelpgCharges?: number[]
    mullikenCharges?: number[]
    finalStructureXyz?: string
}

function parseAtomsFromXyz(xyz: string): string[] {
    if (!xyz) return []
    const lines = xyz.trim().split('\n')
    if (lines.length < 3) return []
    try {
        const nAtoms = parseInt(lines[0].trim(), 10)
        if (isNaN(nAtoms)) return []
        const atoms: string[] = []
        for (let i = 2; i < 2 + nAtoms && i < lines.length; i++) {
            const parts = lines[i].trim().split(/\s+/)
            if (parts.length >= 1) {
                // Capitalize properly: first char upper, rest lower
                const sym = parts[0]
                atoms.push(sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase())
            }
        }
        return atoms
    } catch {
        return []
    }
}

function getChargeColor(charge: number): string {
    if (charge > 0.3) return 'text-red-400'
    if (charge > 0.1) return 'text-orange-300'
    if (charge < -0.3) return 'text-blue-400'
    if (charge < -0.1) return 'text-cyan-300'
    return 'text-gray-300'
}

export function AtomicChargesTable({ chelpgCharges, mullikenCharges, finalStructureXyz }: AtomicChargesTableProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const atoms = useMemo(() => parseAtomsFromXyz(finalStructureXyz || ''), [finalStructureXyz])

    const charges = chelpgCharges || mullikenCharges
    const chargeLabel = chelpgCharges ? 'CHELPG' : 'Mulliken'
    const hasBoth = !!(chelpgCharges && mullikenCharges)

    if (!charges || charges.length === 0) return null

    const totalCharge = charges.reduce((a, b) => a + b, 0)
    const rowCount = charges.length
    const PREVIEW_ROWS = 8

    const rows = Array.from({ length: rowCount }, (_, i) => ({
        idx: i,
        symbol: atoms[i] || `Atom ${i + 1}`,
        chelpg: chelpgCharges?.[i],
        mulliken: mullikenCharges?.[i],
    }))

    const displayRows = isExpanded ? rows : rows.slice(0, PREVIEW_ROWS)

    return (
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
                <h4 className="text-sm font-semibold text-purple-400">
                    Atomic Charges
                    {hasBoth ? ' (CHELPG & Mulliken)' : ` (${chargeLabel})`}
                </h4>
                <span className="text-xs text-gray-500">
                    Total: <span className={getChargeColor(totalCharge)}>{totalCharge.toFixed(3)} e</span>
                    {' · '}{rowCount} atoms
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-gray-700/40">
                            <th className="px-3 py-2 text-left text-gray-500 font-medium w-10">#</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-medium w-16">Atom</th>
                            {chelpgCharges && (
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">CHELPG (e)</th>
                            )}
                            {mullikenCharges && (
                                <th className="px-3 py-2 text-right text-gray-500 font-medium">Mulliken (e)</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((row) => (
                            <tr key={row.idx} className="border-b border-gray-700/20 last:border-0 hover:bg-gray-700/20 transition-colors">
                                <td className="px-3 py-1.5 text-gray-600">{row.idx + 1}</td>
                                <td className="px-3 py-1.5 font-medium text-gray-300">{row.symbol}</td>
                                {chelpgCharges && (
                                    <td className={`px-3 py-1.5 text-right font-mono font-semibold ${getChargeColor(row.chelpg ?? 0)}`}>
                                        {row.chelpg !== undefined ? (row.chelpg >= 0 ? '+' : '') + row.chelpg.toFixed(4) : '—'}
                                    </td>
                                )}
                                {mullikenCharges && (
                                    <td className={`px-3 py-1.5 text-right font-mono font-semibold ${getChargeColor(row.mulliken ?? 0)}`}>
                                        {row.mulliken !== undefined ? (row.mulliken >= 0 ? '+' : '') + row.mulliken.toFixed(4) : '—'}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {rowCount > PREVIEW_ROWS && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/30 transition-colors border-t border-gray-700/40"
                >
                    {isExpanded ? (
                        <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                    ) : (
                        <><ChevronDown className="w-3.5 h-3.5" /> Show all {rowCount} atoms</>
                    )}
                </button>
            )}
        </div>
    )
}
