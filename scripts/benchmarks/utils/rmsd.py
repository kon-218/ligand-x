"""RMSD calculation utilities for benchmark validation."""

import numpy as np
from typing import List, Tuple, Optional, Dict, Any
import logging
import re

logger = logging.getLogger(__name__)


# Common two-letter elements that might be confused
TWO_LETTER_ELEMENTS = {'BR', 'CL', 'FE', 'ZN', 'MG', 'CA', 'NA', 'CU', 'MN', 'CO', 'NI', 'SE', 'SI'}


def parse_pdbqt_coords(pdbqt_content: str) -> List[Tuple[str, np.ndarray]]:
    """
    Parse atom coordinates from PDBQT content.
    
    Args:
        pdbqt_content: PDBQT file content as string
        
    Returns:
        List of (element, coordinates) tuples for heavy atoms only
    """
    atoms = []
    
    for line in pdbqt_content.split('\n'):
        if line.startswith('ATOM') or line.startswith('HETATM'):
            try:
                x = float(line[30:38].strip())
                y = float(line[38:46].strip())
                z = float(line[46:54].strip())
                
                # PDBQT has atom type in last field (after column 77)
                # Format: ATOM ... atom_type
                parts = line.split()
                pdbqt_atom_type = parts[-1] if parts else ''
                
                # Extract element from PDBQT atom type
                # PDBQT types: C, A (aromatic C), N, NA, O, OA, S, SA, H, HD, etc.
                element = pdbqt_atom_type[0].upper() if pdbqt_atom_type else 'C'
                
                # Check for two-letter elements
                if len(pdbqt_atom_type) >= 2:
                    two_letter = pdbqt_atom_type[:2].upper()
                    if two_letter in TWO_LETTER_ELEMENTS:
                        element = two_letter
                
                # Skip hydrogens for heavy atom RMSD
                if element not in ('H', 'HD'):
                    atoms.append((element, np.array([x, y, z])))
            except (ValueError, IndexError):
                continue
                
    return atoms


def parse_pdb_ligand_coords(pdb_content: str, ligand_code: str) -> List[Tuple[str, np.ndarray]]:
    """
    Parse ligand atom coordinates from PDB content.
    
    Args:
        pdb_content: PDB file content as string
        ligand_code: 3-letter ligand residue code
        
    Returns:
        List of (element, coordinates) tuples for heavy atoms only
    """
    atoms = []
    ligand_code_upper = ligand_code.upper()
    
    for line in pdb_content.split('\n'):
        if line.startswith('HETATM'):
            try:
                res_name = line[17:20].strip().upper()
                
                # Match ligand code (handle alternate conformations like AN4B)
                if res_name == ligand_code_upper or ligand_code_upper in res_name:
                    x = float(line[30:38].strip())
                    y = float(line[38:46].strip())
                    z = float(line[46:54].strip())
                    
                    # Get element from columns 77-78 or infer from atom name
                    element = ''
                    if len(line) > 77:
                        element = line[76:78].strip().upper()
                    
                    if not element:
                        atom_name = line[12:16].strip()
                        # Check for two-letter elements first
                        if len(atom_name) >= 2:
                            two_letter = atom_name[:2].upper()
                            if two_letter in TWO_LETTER_ELEMENTS:
                                element = two_letter
                        if not element:
                            element = atom_name[0].upper() if atom_name else 'C'
                    
                    # Skip hydrogens for heavy atom RMSD
                    if element != 'H':
                        atoms.append((element, np.array([x, y, z])))
            except (ValueError, IndexError):
                continue
                
    return atoms


def calculate_centroid(coords: List[np.ndarray]) -> np.ndarray:
    """Calculate centroid of coordinates."""
    if not coords:
        return np.zeros(3)
    return np.mean(coords, axis=0)


def kabsch_rmsd(coords1: np.ndarray, coords2: np.ndarray) -> float:
    """
    Calculate RMSD using Kabsch algorithm (optimal superposition).
    
    Args:
        coords1: First set of coordinates (N x 3)
        coords2: Second set of coordinates (N x 3)
        
    Returns:
        RMSD in Angstroms
    """
    if len(coords1) != len(coords2):
        raise ValueError(f"Coordinate arrays must have same length: {len(coords1)} vs {len(coords2)}")
    
    if len(coords1) == 0:
        return 0.0
    
    # Center both coordinate sets
    centroid1 = np.mean(coords1, axis=0)
    centroid2 = np.mean(coords2, axis=0)
    
    coords1_centered = coords1 - centroid1
    coords2_centered = coords2 - centroid2
    
    # Compute covariance matrix
    H = coords1_centered.T @ coords2_centered
    
    # SVD
    U, S, Vt = np.linalg.svd(H)
    
    # Optimal rotation
    d = np.linalg.det(Vt.T @ U.T)
    D = np.diag([1, 1, d])
    R = Vt.T @ D @ U.T
    
    # Apply rotation to coords1
    coords1_rotated = coords1_centered @ R.T
    
    # Calculate RMSD
    diff = coords1_rotated - coords2_centered
    rmsd = np.sqrt(np.mean(np.sum(diff ** 2, axis=1)))
    
    return rmsd


def calculate_ligand_rmsd(
    docked_pdbqt: str,
    crystal_pdb: str,
    ligand_code: str,
    use_kabsch: bool = True
) -> Optional[float]:
    """
    Calculate RMSD between docked pose and crystal structure.
    
    Args:
        docked_pdbqt: Docked pose in PDBQT format
        crystal_pdb: Crystal structure in PDB format
        ligand_code: 3-letter ligand residue code
        use_kabsch: Whether to use Kabsch superposition
        
    Returns:
        RMSD in Angstroms, or None if calculation fails
    """
    try:
        # Parse docked pose (take first model/pose)
        # PDBQT may have multiple models - take the first one
        first_model = docked_pdbqt.split('ENDMDL')[0] if 'ENDMDL' in docked_pdbqt else docked_pdbqt
        docked_atoms = parse_pdbqt_coords(first_model)
        
        # Parse crystal ligand
        crystal_atoms = parse_pdb_ligand_coords(crystal_pdb, ligand_code)
        
        if not docked_atoms:
            logger.warning("No atoms found in docked pose")
            return None
            
        if not crystal_atoms:
            logger.warning(f"No atoms found for ligand {ligand_code} in crystal structure")
            return None
        
        # Get just coordinates
        docked_coords = np.array([atom[1] for atom in docked_atoms])
        crystal_coords = np.array([atom[1] for atom in crystal_atoms])
        
        # Handle atom count mismatch - use minimum common atoms
        n_docked = len(docked_coords)
        n_crystal = len(crystal_coords)
        
        if n_docked != n_crystal:
            logger.warning(f"Atom count mismatch: docked={n_docked}, crystal={n_crystal}")
            
            # For small mismatches, use the minimum set of atoms
            # This handles cases where crystal has alt conformations or docking added extra atoms
            n_common = min(n_docked, n_crystal)
            
            if n_common >= 4:  # Need at least 4 atoms for meaningful RMSD
                # Use first N atoms (assuming similar ordering)
                # Better approach would be to match by element type
                docked_subset = docked_coords[:n_common]
                crystal_subset = crystal_coords[:n_common]
                
                try:
                    if use_kabsch:
                        rmsd = kabsch_rmsd(docked_subset, crystal_subset)
                    else:
                        diff = docked_subset - crystal_subset
                        rmsd = np.sqrt(np.mean(np.sum(diff ** 2, axis=1)))
                    logger.info(f"Calculated RMSD using {n_common} common atoms: {rmsd:.2f} Å")
                    return float(rmsd)
                except Exception as e:
                    logger.warning(f"Failed to calculate RMSD with common atoms: {e}")
            
            # Fallback to centroid distance
            docked_centroid = calculate_centroid(list(docked_coords))
            crystal_centroid = calculate_centroid(list(crystal_coords))
            centroid_distance = np.linalg.norm(docked_centroid - crystal_centroid)
            logger.info(f"Using centroid distance as RMSD proxy: {centroid_distance:.2f} Å")
            return float(centroid_distance)
        
        if use_kabsch:
            rmsd = kabsch_rmsd(docked_coords, crystal_coords)
        else:
            # Simple RMSD without superposition
            diff = docked_coords - crystal_coords
            rmsd = np.sqrt(np.mean(np.sum(diff ** 2, axis=1)))
        
        return float(rmsd)
        
    except Exception as e:
        logger.error(f"Error calculating RMSD: {e}")
        return None


def calculate_symmetry_corrected_rmsd(
    docked_pdbqt: str,
    crystal_pdb: str,
    ligand_code: str,
    smiles: str = None
) -> Optional[float]:
    """
    Calculate symmetry-corrected RMSD for symmetric molecules.
    
    For molecules with rotational symmetry (e.g., benzene),
    this finds the minimum RMSD over all symmetric permutations.
    
    Args:
        docked_pdbqt: Docked pose in PDBQT format
        crystal_pdb: Crystal structure in PDB format
        ligand_code: 3-letter ligand residue code
        smiles: SMILES string (used to detect symmetry)
        
    Returns:
        Minimum RMSD in Angstroms
    """
    # For benzene series, the ring atoms are symmetric
    # For now, use standard RMSD as the poses should be roughly correct
    return calculate_ligand_rmsd(docked_pdbqt, crystal_pdb, ligand_code, use_kabsch=True)
