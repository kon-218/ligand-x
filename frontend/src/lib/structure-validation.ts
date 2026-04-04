/**
 * Structure validation utilities
 */

export interface MolecularStructure {
  structure_id?: string
  pdb_data?: string
  source?: string
  metadata?: any
}

/** Standard proteinogenic + common PDB placeholders (for ATOM record residue name checks). */
const STANDARD_AMINO_ACID_RESIDUES = new Set([
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE', 'LEU', 'LYS', 'MET',
  'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL', 'SEC', 'PYL', 'ASX', 'GLX', 'UNK',
])

const MIN_DISTINCT_PROTEIN_RESIDUES = 3

/**
 * True if PDB text has enough ATOM records with standard amino-acid residue names (polymer heuristic).
 * Does not handle mmCIF; use {@link getProteinCleaningSourceError} for upload path.
 */
export function isPdbTextLikelyProtein(pdbData: string | null | undefined): boolean {
  if (!pdbData?.trim()) return false
  const lines = pdbData.split('\n')
  const residueKeys = new Set<string>()
  for (const line of lines) {
    if (!line.startsWith('ATOM  ')) continue
    if (line.length < 27) continue
    const resName = line.slice(17, 20).trim()
    if (!STANDARD_AMINO_ACID_RESIDUES.has(resName)) continue
    const chain = line[21] || ' '
    const resSeq = line.slice(22, 26).trim()
    residueKeys.add(`${resName}_${chain}_${resSeq}`)
  }
  return residueKeys.size >= MIN_DISTINCT_PROTEIN_RESIDUES
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

/**
 * Validation for protein cleaning: current viewer structure or uploaded coordinates.
 */
export function getProteinCleaningSourceError(
  inputSource: 'current' | 'upload',
  currentStructure: MolecularStructure | null | undefined,
  uploadedPdbData: string | null | undefined
): string | null {
  if (inputSource === 'current') {
    return getProteinValidationError(currentStructure)
  }
  const raw = uploadedPdbData?.trim()
  if (!raw) return null
  // mmCIF / STAR — skip polymer heuristic; backend will reject if inappropriate
  if (raw.startsWith('data_') || raw.includes('_atom_site')) {
    return null
  }
  if (!isPdbTextLikelyProtein(raw)) {
    return (
      'This file does not look like a protein structure (expected multiple standard amino-acid residues in PDB ATOM records). ' +
      'Small molecules and SMILES-based structures are not supported here — load a protein from PDB or upload a biomolecular structure file.'
    )
  }
  return null
}
