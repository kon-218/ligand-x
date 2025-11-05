'use client'

import React from 'react'
import { QCResults } from '@/store/qc-store'
import { useMolecularStore } from '@/store/molecular-store'
import { Eye } from 'lucide-react'

interface ConformerListProps {
  conformers: NonNullable<QCResults['conformers']>
  className?: string
}

export function ConformerList({ conformers, className = "" }: ConformerListProps) {
  const { addStructureTab } = useMolecularStore()

  const handleView = (conf: typeof conformers[0]) => {
    addStructureTab({
      structure_id: `conf_${conf.conf_id}`,
      pdb_data: '', // Required by type but unused for XYZ
      xyz_data: conf.xyz_content,
      format: 'xyz'
    }, `Conformer ${conf.conf_id}`)
  }

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-700 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
        <h3 className="text-sm font-medium text-white">Conformer Search Results</h3>
        <span className="text-xs text-gray-400">{conformers.length} conformers found</span>
      </div>
      
      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">ID</th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">Energy (Hartree)</th>
              <th className="px-4 py-3 bg-gray-800/95 backdrop-blur-sm">Relative Energy (kcal/mol)</th>
              <th className="px-4 py-3 text-right bg-gray-800/95 backdrop-blur-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {conformers.map((conf) => (
              <tr key={conf.conf_id} className="hover:bg-gray-800/50 transition-colors group">
                <td className="px-4 py-3 font-medium text-gray-300">{conf.conf_id}</td>
                <td className="px-4 py-3 text-gray-400 font-mono">{conf.energy_hartree.toFixed(6)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    conf.rel_energy_kcal < 1.0 
                      ? 'bg-green-500/10 text-green-400'
                      : conf.rel_energy_kcal < 3.0 
                        ? 'bg-yellow-500/10 text-yellow-400'
                        : 'bg-gray-700 text-gray-400'
                  }`}>
                    {conf.rel_energy_kcal.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleView(conf)}
                    className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="View Conformer"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}




