/**
 * Structure utility functions
 */

import type { VisualizationStyle, MolecularStructure, Ligand } from '@/types/molecular'
import { api, apiClient } from './api-client'

/**
 * Detect structure type from structure data
 */
export function detectStructureType(structureData: string): 'protein' | 'small-molecule' | 'complex' {
  const lines = structureData.split('\n')

  // Count ATOM lines and HETATM lines
  let atomCount = 0
  let hetAtomCount = 0
  let hasProteinResidues = false

  const proteinResidues = ['ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
    'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL']

  for (const line of lines) {
    if (line.startsWith('ATOM  ')) {
      atomCount++
      const resName = line.substring(17, 20).trim()
      if (proteinResidues.includes(resName)) {
        hasProteinResidues = true
      }
    } else if (line.startsWith('HETATM')) {
      hetAtomCount++
    }
  }

  // If has protein residues and ATOM lines, it's a protein or complex
  if (hasProteinResidues && atomCount > 0) {
    // If also has HETATM (ligands), it's a complex
    return hetAtomCount > 10 ? 'complex' : 'protein'
  }

  // Otherwise, it's a small molecule
  return 'small-molecule'
}

/**
 * Get default visualization settings based on structure type
 */
export function getDefaultVisualizationSettings(structureType: 'protein' | 'small-molecule' | 'complex') {
  if (structureType === 'small-molecule') {
    return {
      style: 'ball-stick' as VisualizationStyle,
      colorTheme: 'default'
    }
  }

  // For proteins and complexes, use cartoon style
  return {
    style: 'cartoon' as VisualizationStyle,
    colorTheme: 'default'
  }
}

/**
 * Save ligands from a loaded structure to the molecule library
 * This automatically extracts and saves all ligands when a complex is loaded
 */
export async function saveLigandsToLibrary(structure: MolecularStructure): Promise<{ saved: number; duplicates: number; errors: string[] }> {
  if (!structure.ligands || Object.keys(structure.ligands).length === 0) {
    return { saved: 0, duplicates: 0, errors: [] }
  }

  const errors: string[] = []
  let savedCount = 0
  let duplicateCount = 0

  // Iterate through all ligands in the structure
  for (const [ligandId, ligand] of Object.entries(structure.ligands)) {
    try {
      // Skip if ligand doesn't have necessary data
      if (!ligand.smiles && !ligand.pdb_data && !ligand.sdf_data) {
        errors.push(`Ligand ${ligandId}: No molecular data available`)
        continue
      }

      // Extract the original residue name (e.g., "NAG", "ATP")
      const originalName = ligand.residue_name || ligand.name || null

      // Use ligand ID format as the display name (e.g., "Ligand (undefined:500)")
      const moleculeName = `Ligand (${ligand.chain_id || 'undefined'}:${ligand.residue_number})`

      // Try to save using SMILES first (preferred), then fall back to converting from PDB/SDF
      let molfile: string | null = null

      if (ligand.sdf_data) {
        // SDF data can be used as molfile
        molfile = ligand.sdf_data
      } else if (ligand.smiles) {
        // Convert SMILES to molfile using the backend
        try {
          const response = await apiClient.post('/api/structure/smiles_to_mol', { smiles: ligand.smiles })
          molfile = response.data.molfile
        } catch (err) {
          console.warn(`Failed to convert SMILES to molfile for ${moleculeName}:`, err)
        }
      }

      // If we have molfile, save it to the library
      if (molfile) {
        try {
          const saveResult = await api.saveMolecule({
            name: moleculeName,
            molfile: molfile,
            original_name: originalName,  // Pass the original residue name
          })

          if (saveResult.already_exists) {
            duplicateCount++
            console.log(`Ligand ${moleculeName} already exists in library`)
          } else {
            savedCount++
            console.log(`Saved ligand to library: ${moleculeName} (original: ${originalName})`)
          }
        } catch (err: any) {
          // Check if it's a duplicate error (409)
          if (err.response?.status === 409) {
            duplicateCount++
            console.log(`Ligand ${moleculeName} already exists in library (409)`)
          } else {
            errors.push(`${moleculeName}: ${err.response?.data?.error || err.message}`)
          }
        }
      } else {
        errors.push(`${moleculeName}: Could not generate molfile`)
      }
    } catch (err: any) {
      errors.push(`${ligandId}: ${err.message}`)
    }
  }

  return { saved: savedCount, duplicates: duplicateCount, errors }
}
