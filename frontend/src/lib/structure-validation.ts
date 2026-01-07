/**
 * Structure validation utilities
 */

export interface MolecularStructure {
  structure_id?: string
  pdb_data?: string
  source?: string
  metadata?: any
}

/**
 * Check if a structure is a valid protein (not a SMILES-generated small molecule)
 * @param structure The molecular structure to validate
 * @returns true if the structure is a valid protein, false otherwise
 */
export const isValidProtein = (structure: MolecularStructure | null | undefined): boolean => {
  if (!structure) return false
  
  // Filter out SMILES-generated molecules - they are small molecules, not proteins
  if (structure.source === 'smiles_upload') return false
  if (structure.structure_id?.startsWith('SMILES_molecule')) return false
  
  // Must have PDB data to be considered a valid protein structure
  if (!structure.pdb_data) return false
  
  return true
}

/**
 * Get validation error message for protein selection
 * @param structure The molecular structure that failed validation
 * @returns User-friendly error message
 */
export const getProteinValidationError = (structure: MolecularStructure | null | undefined): string | null => {
  if (!structure) return 'No structure selected'
  
  if (structure.source === 'smiles_upload') {
    return 'SMILES-generated molecules cannot be used as proteins. Please select a protein structure from PDB or upload a protein file.'
  }
  
  if (structure.structure_id?.startsWith('SMILES_molecule')) {
    return 'SMILES molecules cannot be used as proteins. Please select a protein structure from PDB or upload a protein file.'
  }
  
  if (!structure.pdb_data) {
    return 'No structural data available. Please load a protein structure.'
  }
  
  return null
}
