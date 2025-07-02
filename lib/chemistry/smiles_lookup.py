#!/usr/bin/env python3
"""
SMILES Lookup Utility
Provides functions to retrieve canonical SMILES strings for ligands from various sources.
"""

import requests
import logging

logger = logging.getLogger(__name__)

def get_ligand_smiles_from_rcsb(ligand_id):
    """
    Retrieves the canonical SMILES string for a given ligand ID from the RCSB PDB.
    
    Args:
        ligand_id: 3-letter ligand code (e.g., 'P30', 'ATP', 'HEM')
        
    Returns:
        str or None: Canonical SMILES string if found, None otherwise
    """
    url = f"https://data.rcsb.org/rest/v1/core/chemcomp/{ligand_id.upper()}"
    
    logger.info(f"Fetching SMILES for ligand: {ligand_id}")
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Try to find canonical SMILES in descriptors
        descriptors = data.get("rcsb_chem_comp_descriptor", {}).get("Descriptors", [])
        for desc in descriptors:
            if desc.get("type") == "SMILES_CANONICAL":
                smiles = desc.get("descriptor")
                if smiles:
                    logger.info(f"Found canonical SMILES for {ligand_id}: {smiles}")
                    return smiles
        
        # Fallback to regular SMILES if canonical not found
        smiles = data.get("rcsb_chem_comp_descriptor", {}).get("smiles")
        if smiles:
            logger.info(f"Found regular SMILES for {ligand_id}: {smiles}")
            return smiles
            
        # Fallback to stereo SMILES
        smiles_stereo = data.get("rcsb_chem_comp_descriptor", {}).get("smilesstereo")
        if smiles_stereo:
            logger.info(f"Found stereo SMILES for {ligand_id}: {smiles_stereo}")
            return smiles_stereo
        
        logger.warning(f"No SMILES found for ligand {ligand_id}")
        return None
        
    except requests.exceptions.HTTPError as http_err:
        logger.error(f"HTTP error for ligand {ligand_id}: {http_err}")
        return None
    except requests.exceptions.RequestException as req_err:
        logger.error(f"Request error for ligand {ligand_id}: {req_err}")
        return None
    except Exception as err:
        logger.error(f"Unexpected error for ligand {ligand_id}: {err}")
        return None

def extract_ligand_id_from_pdb(pdb_data):
    """
    Extract ligand residue names from PDB data.
    
    Args:
        pdb_data: PDB format string
        
    Returns:
        list: List of unique ligand residue names found
    """
    ligand_ids = set()
    
    # Standard amino acids and nucleotides to exclude
    standard_residues = {
        'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLU', 'GLN', 'GLY', 'HIS', 'ILE',
        'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
        'A', 'T', 'G', 'C', 'U', 'DA', 'DT', 'DG', 'DC', 'DU',
        'HOH', 'WAT'  # Water
    }
    
    try:
        for line in pdb_data.split('\n'):
            if line.startswith('HETATM'):
                # Extract residue name from HETATM record
                if len(line) >= 20:
                    resname = line[17:20].strip()
                    if resname and resname not in standard_residues:
                        ligand_ids.add(resname)
        
        return list(ligand_ids)
        
    except Exception as e:
        logger.error(f"Error extracting ligand IDs from PDB: {e}")
        return []

def get_best_ligand_smiles(ligand_id, pdb_data=None):
    """
    Get the best available SMILES for a ligand, trying multiple sources.
    
    Args:
        ligand_id: Ligand identifier
        pdb_data: Optional PDB data for context
        
    Returns:
        dict: Result with 'smiles', 'source', and 'confidence' keys
    """
    result = {
        'smiles': None,
        'source': None,
        'confidence': 'none',
        'ligand_id': ligand_id
    }
    
    # Try RCSB PDB first (most reliable)
    smiles = get_ligand_smiles_from_rcsb(ligand_id)
    if smiles:
        result['smiles'] = smiles
        result['source'] = 'RCSB_PDB'
        result['confidence'] = 'high'
        return result
    
    # Could add other sources here (ChEMBL, PubChem, etc.)
    logger.warning(f"Could not find SMILES for ligand {ligand_id} from any source")
    return result

# Known ligand SMILES database for common cases
KNOWN_LIGANDS = {
    'P30': 'CC(C)(C)c1cc(no1)NC(=O)Nc2ccc(cc2)c3cn4c5ccc(cc5sc4n3)OCCN6CCOCC6',  # Quizartinib
    'ATP': 'C1=NC(=C2C(=N1)N(C=N2)C3C(C(C(O3)COP(=O)(O)OP(=O)(O)OP(=O)(O)O)O)O)N',
    'ADP': 'C1=NC(=C2C(=N1)N(C=N2)C3C(C(C(O3)COP(=O)(O)OP(=O)(O)O)O)O)N',
    'AMP': 'C1=NC(=C2C(=N1)N(C=N2)C3C(C(C(O3)COP(=O)(O)O)O)O)N',
    'NAD': 'C1=CC(=C[N+](=C1)C2C(C(C(O2)COP(=O)([O-])OP(=O)([O-])OCC3C(C(C(O3)N4C=NC5=C(N=CN=C54)N)O)O)O)O)C(=O)N',
    'FAD': 'CC1=CC2=C(C=C1C)N(C3=NC(=O)NC(=O)C3=N2)CC(C(C(COP(=O)([O-])OP(=O)([O-])OCC4C(C(C(O4)N5C=NC6=C5N=C(NC6=O)N)O)O)O)O)O',
    'HEM': 'CC1=C(C2=CC3=NC(=CC4=NC(=CC5=NC(=C2)C(=C5C)C=C)C(=C4CCC(=O)[O-])C)C(=C3CCC(=O)[O-])C)C=C.[Fe+2]',
    'QTB': 'CC(C)(C)c1cc(no1)NC(=O)Nc2ccc(cc2)c3cn4c5ccc(cc5sc4n3)OCCN6CCOCC6',  # Alternative name for Quizartinib
    'AC220': 'CC(C)(C)c1cc(no1)NC(=O)Nc2ccc(cc2)c3cn4c5ccc(cc5sc4n3)OCCN6CCOCC6'  # Alternative name for Quizartinib
}

def get_ligand_smiles_with_fallback(ligand_id):
    """
    Get ligand SMILES with fallback to known database.
    
    Args:
        ligand_id: Ligand identifier
        
    Returns:
        dict: Result with SMILES and metadata
    """
    # First try online lookup
    result = get_best_ligand_smiles(ligand_id)
    
    if result['smiles']:
        return result
    
    # Fallback to known ligands database
    if ligand_id.upper() in KNOWN_LIGANDS:
        result['smiles'] = KNOWN_LIGANDS[ligand_id.upper()]
        result['source'] = 'KNOWN_DATABASE'
        result['confidence'] = 'high'
        logger.info(f"Found {ligand_id} in known ligands database")
        return result
    
    return result
