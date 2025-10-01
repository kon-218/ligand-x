// Type definitions for ADMET workflow

export interface MoleculeOption {
    id: string
    name: string
    smiles?: string
    pdb_data?: string
    source: 'structure' | 'library'
}

export interface StoredADMETResult {
    id: number
    canonical_smiles: string
    smiles: string
    molecule_name: string
    timestamp: string
    has_results: boolean
}
