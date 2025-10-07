"""
Iterative Alignment Helper

This module provides helper functions for performing iterative alignments
until a target RMSD threshold is achieved.
"""

import numpy as np
import logging
from typing import Dict, Any, List, Optional

# Conditional Bio imports
try:
    from Bio.PDB.Superimposer import Superimposer
    from Bio.SVDSuperimposer import SVDSuperimposer
    BIO_AVAILABLE = True
except ImportError:
    BIO_AVAILABLE = False
    Superimposer = None
    SVDSuperimposer = None

logger = logging.getLogger(__name__)


def iterative_alignment_until_threshold(
    ref_atoms: List,
    mob_atoms: List,
    target_rmsd: float = 0.05,
    max_iterations: int = 100,
    method: str = 'superimposer'
) -> Dict[str, Any]:
    """
    Perform iterative alignment with progressive outlier removal until RMSD is below target threshold.
    
    This algorithm uses iterative refinement:
    1. Start with all atoms
    2. In each iteration, identify and remove worst outliers (atoms with highest deviations)
    3. Re-align with remaining "core" atoms
    4. Continue until target RMSD is achieved or convergence
    
    Args:
        ref_atoms: Reference atoms
        mob_atoms: Mobile atoms
        target_rmsd: Target RMSD threshold (default: 0.05)
        max_iterations: Maximum number of iterations (default: 100)
        method: Alignment method ('superimposer' or 'svd')
    
    Returns:
        Dictionary with alignment results including final RMSD and iterations performed
    """
    if len(ref_atoms) != len(mob_atoms) or len(ref_atoms) < 3:
        raise ValueError("Invalid atom lists for alignment")
    
    logger.info(f"Starting iterative alignment: target RMSD = {target_rmsd}, max iterations = {max_iterations}")
    
    # Initialize with all atoms
    current_ref_atoms = ref_atoms[:]
    current_mob_atoms = mob_atoms[:]
    min_atoms = max(3, int(0.3 * len(ref_atoms)))  # Keep at least 30% of atoms or 3 atoms minimum
    
    best_rmsd = float('inf')
    best_rotation = None
    best_translation = None
    iterations = 0
    converged = False
    cumulative_rotation = np.eye(3)
    cumulative_translation = np.zeros(3)
    
    while iterations < max_iterations and not converged:
        iterations += 1
        
        # Perform alignment with current atom set
        if method == 'svd':
            svd_super_imposer = SVDSuperimposer()
            ref_coords = np.array([atom.get_coord() for atom in current_ref_atoms])
            mob_coords = np.array([atom.get_coord() for atom in current_mob_atoms])
            svd_super_imposer.set(ref_coords, mob_coords)
            svd_super_imposer.run()
            rotation, translation = svd_super_imposer.get_rotran()
            current_rmsd = svd_super_imposer.get_rms()
        else:
            super_imposer = Superimposer()
            super_imposer.set_atoms(current_ref_atoms, current_mob_atoms)
            rotation, translation = super_imposer.rotran
            current_rmsd = super_imposer.rms
        
        # Apply transformation to ALL mobile atoms (not just the subset used for alignment)
        for atom in mob_atoms:
            atom.transform(rotation, translation)
        
        # Update cumulative transformation
        cumulative_rotation = rotation @ cumulative_rotation
        cumulative_translation = rotation @ cumulative_translation + translation
        
        # Check if we've achieved target RMSD
        if current_rmsd <= target_rmsd:
            best_rmsd = current_rmsd
            best_rotation = cumulative_rotation
            best_translation = cumulative_translation
            converged = True
            logger.info(f"Converged to target RMSD {current_rmsd:.6f} in {iterations} iterations")
            break
        
        # Update best result if improved
        if current_rmsd < best_rmsd:
            best_rmsd = current_rmsd
            best_rotation = cumulative_rotation
            best_translation = cumulative_translation
        
        # If we haven't converged and have more atoms than minimum, remove outliers
        if len(current_ref_atoms) > min_atoms:
            # Calculate per-atom deviations after alignment
            deviations = []
            for i, (ref_atom, mob_atom) in enumerate(zip(current_ref_atoms, current_mob_atoms)):
                ref_coord = np.array(ref_atom.get_coord())
                mob_coord = np.array(mob_atom.get_coord())
                deviation = np.linalg.norm(ref_coord - mob_coord)
                deviations.append((i, deviation))
            
            # Sort by deviation (highest first) and remove worst outliers
            deviations.sort(key=lambda x: x[1], reverse=True)
            outliers_to_remove = max(1, int(0.1 * len(current_ref_atoms)))  # Remove 10% of atoms each iteration
            outliers_to_remove = min(outliers_to_remove, len(current_ref_atoms) - min_atoms)
            
            if outliers_to_remove > 0:
                # Remove indices of worst outliers
                indices_to_remove = set(deviations[i][0] for i in range(outliers_to_remove))
                current_ref_atoms = [atom for i, atom in enumerate(current_ref_atoms) if i not in indices_to_remove]
                current_mob_atoms = [atom for i, atom in enumerate(current_mob_atoms) if i not in indices_to_remove]
                
                logger.debug(f"Iteration {iterations}: RMSD = {current_rmsd:.6f}, removed {outliers_to_remove} outliers, {len(current_ref_atoms)} atoms remaining")
            else:
                # No more atoms to remove, stop iterating
                logger.debug(f"Iteration {iterations}: RMSD = {current_rmsd:.6f}, minimum atom count reached")
                break
        else:
            # Minimum atom count reached, stop iterating
            logger.debug(f"Iteration {iterations}: RMSD = {current_rmsd:.6f}, minimum atom count reached")
            break
    
    logger.info(f"Iterative alignment completed: {iterations} iterations, final RMSD = {best_rmsd:.6f}")
    
    return {
        'success': best_rmsd <= target_rmsd,
        'rmsd': best_rmsd,
        'iterations': iterations,
        'rotation': best_rotation if best_rotation is not None else np.eye(3),
        'translation': best_translation if best_translation is not None else np.zeros(3),
        'converged': converged,
        'max_iterations_reached': iterations >= max_iterations,
        'core_atoms_used': len(current_ref_atoms)
    }


def apply_transformation_to_structure(structure, rotation, translation):
    """
    Apply a transformation to all atoms in a structure.
    
    Args:
        structure: Bio.PDB Structure object
        rotation: Rotation matrix
        translation: Translation vector
    """
    for atom in structure.get_atoms():
        atom.transform(rotation, translation)
