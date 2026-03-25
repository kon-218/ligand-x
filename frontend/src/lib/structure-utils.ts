/**
 * Structure utility functions
 */

import type { VisualizationStyle, MolecularStructure, Ligand } from '@/types/molecular'
import { api, apiClient } from './api-client'

/**
 * Extract atom count from XYZ format string
 */
export function getAtomCountFromXyz(xyzData: string): number | null {
  if (!xyzData) return null
  const lines = xyzData.trim().split('\n')
  if (lines.length < 1) return null
  const firstLine = lines[0].trim()
  const count = parseInt(firstLine, 10)
  return isNaN(count) ? null : count
}

/**
 * Extract atom symbols from XYZ format string
 */
export function getAtomSymbolsFromXyz(xyzData: string): string[] | null {
  if (!xyzData) return null
  const lines = xyzData.trim().split('\n')
  if (lines.length < 3) return null
  
  const atomCount = parseInt(lines[0].trim(), 10)
  if (isNaN(atomCount)) return null
  
  const symbols: string[] = []
  for (let i = 2; i < Math.min(2 + atomCount, lines.length); i++) {
    const parts = lines[i].trim().split(/\s+/)
    if (parts.length >= 1) {
      symbols.push(parts[0])
    }
  }
  return symbols.length > 0 ? symbols : null
}

/**
 * Extract atom count from PDB format string
 */
export function getAtomCountFromPdb(pdbData: string): number | null {
  if (!pdbData) return null
  const lines = pdbData.split('\n')
  let count = 0
  for (const line of lines) {
    if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
      count++
    }
  }
  return count > 0 ? count : null
}

/**
 * Extract atom count from SDF/MOL format string
 */
export function getAtomCountFromSdf(sdfData: string): number | null {
  if (!sdfData) return null
  const lines = sdfData.split('\n')
  // SDF counts line is typically line 4 (0-indexed: line 3)
  // Format: "  N  M  0  0  0  0  0  0  0  0999 V2000" where N is atom count
  if (lines.length < 4) return null
  const countsLine = lines[3].trim()
  const parts = countsLine.split(/\s+/)
  if (parts.length >= 1) {
    const count = parseInt(parts[0], 10)
    return isNaN(count) ? null : count
  }
  return null
}

/**
 * Get atom count from a MolecularStructure
 */
export function getAtomCountFromStructure(structure: MolecularStructure | null): number | null {
  if (!structure) return null
  
  // Try XYZ first (most common for QC)
  if (structure.xyz_data) {
    const count = getAtomCountFromXyz(structure.xyz_data)
    if (count !== null) return count
  }
  
  // Try SDF
  if (structure.sdf_data) {
    const count = getAtomCountFromSdf(structure.sdf_data)
    if (count !== null) return count
  }
  
  // Try PDB
  if (structure.pdb_data) {
    const count = getAtomCountFromPdb(structure.pdb_data)
    if (count !== null) return count
  }
  
  // Try ligands
  if (structure.ligands) {
    const ligandValues = Object.values(structure.ligands) as Ligand[]
    if (ligandValues.length > 0) {
      const firstLigand = ligandValues[0]
      if (firstLigand.sdf_data) {
        return getAtomCountFromSdf(firstLigand.sdf_data)
      }
      if (firstLigand.pdb_data) {
        return getAtomCountFromPdb(firstLigand.pdb_data)
      }
    }
  }
  
  return null
}

export interface MoleculeValidationResult {
  isValid: boolean
  reason?: string
  viewerAtomCount?: number | null
  jobAtomCount?: number | null
}

/**
 * Validate that QC results match the currently viewed molecule.
 * This prevents applying orbitals, charges, or vibrational modes to the wrong structure.
 * 
 * @param currentStructure - The currently viewed molecular structure
 * @param jobAtomCount - Atom count from the QC job (e.g., from charges array length or MO data)
 * @returns Validation result with isValid flag and reason if invalid
 */
export function validateMoleculeMatch(
  currentStructure: MolecularStructure | null,
  jobAtomCount: number | null
): MoleculeValidationResult {
  if (!currentStructure) {
    return { 
      isValid: false, 
      reason: 'No molecule is currently loaded in the viewer',
      viewerAtomCount: null,
      jobAtomCount
    }
  }
  
  if (jobAtomCount === null || jobAtomCount === undefined) {
    // Can't validate without job atom count, allow it but warn
    return { 
      isValid: true, 
      reason: 'Could not determine atom count from QC job',
      viewerAtomCount: getAtomCountFromStructure(currentStructure),
      jobAtomCount: null
    }
  }
  
  const viewerAtomCount = getAtomCountFromStructure(currentStructure)
  
  if (viewerAtomCount === null) {
    // Can't validate without viewer atom count, allow it but warn
    return { 
      isValid: true, 
      reason: 'Could not determine atom count from current structure',
      viewerAtomCount: null,
      jobAtomCount
    }
  }
  
  if (viewerAtomCount !== jobAtomCount) {
    return {
      isValid: false,
      reason: `Molecule mismatch: viewer has ${viewerAtomCount} atoms, but QC job was run on ${jobAtomCount} atoms. Load the correct structure first.`,
      viewerAtomCount,
      jobAtomCount
    }
  }
  
  return { 
    isValid: true,
    viewerAtomCount,
    jobAtomCount
  }
}

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

      // Extract the original residue name (e.g., "NAG", "ATP", "BNZ")
      const originalName = ligand.residue_name || ligand.name || null

      // Use residue name as the display name when available (e.g., "BNZ", "P30")
      // Fall back to chain:residue format if no residue name is known
      const chain = ligand.chain_id || (ligand as any).chain || 'unknown'
      const moleculeName = originalName || `Ligand (${chain}:${ligand.residue_number})`

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
