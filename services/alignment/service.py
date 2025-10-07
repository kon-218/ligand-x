"""
Protein Structure Alignment Service

This service performs structural superposition of protein poses using the Kabsch algorithm
to enable consistent orientation comparison in molecular viewers. It follows best practices
from structural bioinformatics for robust sequence-based atom correspondence.

Key Features:
- Robust sequence alignment for atom correspondence
- Kabsch algorithm via Biopython's Superimposer
- 4x4 homogeneous transformation matrix output
- Support for both PDB and mmCIF formats
- Error handling for missing residues/atoms

Technical Implementation:
- Uses Bio.PDB for structure parsing and manipulation
- Performs global sequence alignment with BLOSUM62
- Returns transformation matrices in row-major order for WebGL compatibility
"""

import os
import json
import io
import numpy as np
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List, Union
# Conditional Bio imports
try:
    from Bio.PDB import PDBParser, MMCIFParser, PDBIO
    from Bio.PDB.Superimposer import Superimposer
    BIO_AVAILABLE = True
except ImportError:
    BIO_AVAILABLE = False
    PDBParser = None
    MMCIFParser = None
    PDBIO = None
    Superimposer = None

# Additional Bio imports (conditional)
try:
    from Bio.SVDSuperimposer import SVDSuperimposer
    from Bio.PDB.Polypeptide import is_aa
    from Bio.SeqUtils import seq1
    from Bio import pairwise2
    from Bio.Align import substitution_matrices
except ImportError:
    SVDSuperimposer = None
    is_aa = None
    seq1 = None
    pairwise2 = None
    substitution_matrices = None
from services.alignment.helpers import iterative_alignment_until_threshold, apply_transformation_to_structure

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProteinAlignmentService:
    """Service class for protein structure alignment and superposition."""
    
    def __init__(self):
        """Initialize the protein alignment service."""
        if not BIO_AVAILABLE or PDBParser is None:
            raise ImportError("BioPython is required for ProteinAlignmentService")
        self.pdb_parser = PDBParser(QUIET=True)
        self.mmcif_parser = MMCIFParser(QUIET=True) if MMCIFParser is not None else None
        logger.info("Protein alignment service initialized")
    
    def get_pdb_sequence(self, chain) -> List[Tuple]:
        """
        Extract the amino acid sequence from a Biopython Chain object.
        
        Args:
            chain: Bio.PDB Chain object
            
        Returns:
            List of tuples containing (residue_id, amino_acid_code)
        """
        seq = []
        for residue in chain:
            if is_aa(residue):
                try:
                    aa_code = seq1(residue.get_resname())
                    seq.append((residue.get_id(), aa_code))
                except (KeyError, ValueError):
                    # Handle non-standard amino acids
                    seq.append((residue.get_id(), 'X'))
        return seq
    
    def _iterative_core_alignment(self, ref_atoms, mob_atoms, rmsd_cutoff=4.0, max_iterations=5):
        """
        Perform iterative core-focused alignment with outlier pruning.
        
        This method progressively removes outlier atom pairs that contribute most
        to the RMSD, focusing the alignment on the structurally conserved core.
        
        Args:
            ref_atoms: List of reference C-alpha atoms
            mob_atoms: List of mobile C-alpha atoms
            rmsd_cutoff: RMSD threshold for excluding outliers (Angstroms)
            max_iterations: Maximum number of refinement iterations
            
        Returns:
            Dictionary with refined transformation, RMSD, and statistics
        """
        current_ref_atoms = ref_atoms.copy()
        current_mob_atoms = mob_atoms.copy()
        
        best_rmsd = float('inf')
        best_transformation = None
        iterations_performed = 0
        
        for iteration in range(max_iterations):
            # Perform superposition with current atom set
            super_imposer = Superimposer()
            super_imposer.set_atoms(current_ref_atoms, current_mob_atoms)
            
            current_rmsd = super_imposer.rms
            current_transformation = super_imposer.rotran
            
            logger.debug(f"Iteration {iteration + 1}: RMSD = {current_rmsd:.3f} Å "
                        f"with {len(current_ref_atoms)} atoms")
            
            # Check for convergence or if we have too few atoms
            if len(current_ref_atoms) < 10:
                logger.warning("Too few atoms remaining for reliable alignment")
                break
                
            if current_rmsd < rmsd_cutoff or current_rmsd >= best_rmsd:
                # Converged or no improvement
                break
                
            # Calculate per-atom deviations after transformation
            super_imposer.apply(current_mob_atoms)
            
            deviations = []
            for i, (ref_atom, mob_atom) in enumerate(zip(current_ref_atoms, current_mob_atoms)):
                ref_coord = ref_atom.get_coord()
                mob_coord = mob_atom.get_coord()
                deviation = np.linalg.norm(ref_coord - mob_coord)
                deviations.append((i, deviation))
            
            # Sort by deviation and remove worst outliers
            deviations.sort(key=lambda x: x[1], reverse=True)
            
            # Remove top 10% of outliers or atoms above cutoff
            outliers_to_remove = max(1, min(len(deviations) // 10, 
                                           sum(1 for _, dev in deviations if dev > rmsd_cutoff)))
            
            if outliers_to_remove == 0:
                break
                
            # Remove outliers
            outlier_indices = [idx for idx, _ in deviations[:outliers_to_remove]]
            outlier_indices.sort(reverse=True)  # Remove from end to preserve indices
            
            for idx in outlier_indices:
                current_ref_atoms.pop(idx)
                current_mob_atoms.pop(idx)
            
            best_rmsd = current_rmsd
            best_transformation = current_transformation
            iterations_performed = iteration + 1
        
        # Final alignment with pruned atom set
        if best_transformation is None:
            super_imposer = Superimposer()
            super_imposer.set_atoms(current_ref_atoms, current_mob_atoms)
            best_transformation = super_imposer.rotran
            best_rmsd = super_imposer.rms
        
        return {
            'transformation': best_transformation,
            'rmsd': best_rmsd,
            'core_atoms_used': len(current_ref_atoms),
            'initial_atoms': len(ref_atoms),
            'iterations': iterations_performed
        }
    
    def _get_ligand_heavy_atoms(self, structure, ligand_resname='LIG'):
        """
        Extract heavy atoms from ligand residues.
        
        Args:
            structure: Bio.PDB Structure object
            ligand_resname: Residue name for ligand (default: 'LIG')
            
        Returns:
            List of Atom objects for ligand heavy atoms
        """
        ligand_atoms = []
        for residue in structure.get_residues():
            if residue.get_resname() == ligand_resname:
                for atom in residue.get_atoms():
                    if atom.element != 'H':  # Exclude hydrogens
                        ligand_atoms.append(atom)
        return ligand_atoms
    
    def _get_binding_site_residues(self, structure, ligand_resname='LIG', radius=8.0):
        """
        Identify residues within a specified radius of any ligand atom.
        
        Args:
            structure: Bio.PDB Structure object
            ligand_resname: Residue name for ligand (default: 'LIG')
            radius: Distance cutoff in Angstroms (default: 8.0)
            
        Returns:
            Set of residue IDs within the binding site
        """
        ligand_atoms = self._get_ligand_heavy_atoms(structure, ligand_resname)
        
        if not ligand_atoms:
            logger.warning(f"No ligand atoms found with residue name '{ligand_resname}'")
            return set()
        
        binding_site_residues = set()
        
        # Get ligand coordinates
        ligand_coords = np.array([atom.get_coord() for atom in ligand_atoms])
        
        # Check all protein residues
        for residue in structure.get_residues():
            if is_aa(residue, standard=True):  # Only standard amino acids
                for atom in residue.get_atoms():
                    atom_coord = atom.get_coord()
                    # Calculate minimum distance to any ligand atom
                    distances = np.linalg.norm(ligand_coords - atom_coord, axis=1)
                    min_distance = np.min(distances)
                    
                    if min_distance <= radius:
                        binding_site_residues.add(residue.get_id())
                        break  # Found one atom within radius, include this residue
        
        return binding_site_residues
    
    def align_binding_sites(self, reference_data, mobile_data, 
                           ref_format='auto', mob_format='auto',
                           chain_id=None, ligand_resname='LIG', radius=8.0,
                           rmsd_cutoff=4.0, max_iterations=5,
                           atom_types=None,
                           iterative_until_threshold=False,
                           target_rmsd=0.05):
        """
        Align protein structures based on binding site residues around ligand.
        
        This method follows best practices for drug discovery applications by focusing
        alignment on the most relevant region - the ligand binding site.
        
        Args:
            reference_data: Reference structure data (PDB/mmCIF string)
            mobile_data: Mobile structure data (PDB/mmCIF string)
            ref_format: Reference structure format
            mob_format: Mobile structure format
            chain_id: Specific chain ID to align (if None, uses first chain)
            ligand_resname: Residue name for ligand (default: 'LIG')
            radius: Binding site radius in Angstroms (default: 8.0)
            rmsd_cutoff: RMSD cutoff for iterative refinement (default: 4.0)
            max_iterations: Maximum iterations for refinement (default: 5)
            atom_types: List of atom types to use for alignment (default: ['CA'] for C-alpha)
            iterative_until_threshold: Whether to continue aligning until target RMSD is reached
            target_rmsd: Target RMSD threshold for iterative alignment (default: 0.05)
            
        Returns:
            Dictionary containing alignment results and ligand RMSD analysis
        """
        try:
            # Parse structures
            ref_struct = self.parse_structure_data(reference_data, ref_format)
            mob_struct = self.parse_structure_data(mobile_data, mob_format)
            
            # Get chains to align
            ref_chains = list(ref_struct.get_chains())
            mob_chains = list(mob_struct.get_chains())
            
            if not ref_chains or not mob_chains:
                raise ValueError("No chains found in one or both structures")
            
            if chain_id:
                ref_chain = ref_struct[0][chain_id] if chain_id in [c.id for c in ref_chains] else None
                mob_chain = mob_struct[0][chain_id] if chain_id in [c.id for c in mob_chains] else None
                
                if not ref_chain or not mob_chain:
                    raise ValueError(f"Chain {chain_id} not found in one or both structures")
            else:
                ref_chain = ref_chains[0]
                mob_chain = mob_chains[0]
            
            logger.info(f"Performing binding site alignment (radius={radius}Å) for chains: {ref_chain.id} vs {mob_chain.id}")
            
            # Identify binding site residues in reference structure
            ref_binding_site = self._get_binding_site_residues(ref_struct, ligand_resname, radius)
            
            if not ref_binding_site:
                logger.warning(f"No binding site residues found within {radius}Å of ligand '{ligand_resname}' in reference structure")
                # Fallback to full structure alignment
                return self.align_protein_structures(
                    reference_data, mobile_data, ref_format, mob_format,
                    chain_id, use_iterative_pruning=True, rmsd_cutoff=rmsd_cutoff
                )
            
            # Perform sequence alignment to get residue mapping
            mapping = self.align_sequences(ref_chain, mob_chain)
            
            if not mapping:
                raise ValueError("No corresponding residues found for alignment")
            
            # Set default atom types if not specified
            if atom_types is None:
                atom_types = ['CA']  # Default to C-alpha atoms
            
            # Collect corresponding atoms from binding site only
            ref_atoms = []
            mob_atoms = []
            
            for ref_res_id, mob_res_id in mapping.items():
                if ref_res_id in ref_binding_site:  # Only use binding site residues
                    try:
                        # Get all atoms of specified types from both residues
                        for atom_type in atom_types:
                            if atom_type in ref_chain[ref_res_id] and atom_type in mob_chain[mob_res_id]:
                                ref_atom = ref_chain[ref_res_id][atom_type]
                                mob_atom = mob_chain[mob_res_id][atom_type]
                                ref_atoms.append(ref_atom)
                                mob_atoms.append(mob_atom)
                    except KeyError:
                        continue
            
            if len(ref_atoms) < 3:
                logger.warning(f"Insufficient binding site atoms for alignment: {len(ref_atoms)}")
                # Fallback to full structure alignment
                return self.align_protein_structures(
                    reference_data, mobile_data, ref_format, mob_format,
                    chain_id, use_iterative_pruning=True, rmsd_cutoff=rmsd_cutoff,
                    atom_types=atom_types
                )
            
            atom_description = ', '.join(atom_types) if len(atom_types) <= 3 else f"{len(atom_types)} atom types"
            logger.info(f"Using {len(ref_atoms)} binding site atoms ({atom_description}) for superposition")
            
            # Perform binding site-focused alignment
            if iterative_until_threshold:
                # Use iterative alignment until target RMSD is reached
                logger.info(f"Performing iterative alignment until RMSD < {target_rmsd}")
                alignment_result = iterative_alignment_until_threshold(
                    ref_atoms, mob_atoms, target_rmsd, max_iterations
                )
                rotation, translation = alignment_result['rotation'], alignment_result['translation']
                rmsd = alignment_result['rmsd']
                iterations_performed = alignment_result['iterations']
                logger.info(f"Iterative alignment completed in {iterations_performed} iterations with final RMSD: {rmsd:.3f}")
            else:
                # Perform standard SVD-based alignment
                svd_super_imposer = SVDSuperimposer()
                
                # Set coordinates arrays as recommended in the guide
                ref_coords = np.array([atom.get_coord() for atom in ref_atoms])
                mob_coords = np.array([atom.get_coord() for atom in mob_atoms])
                
                svd_super_imposer.set(ref_coords, mob_coords)
                svd_super_imposer.run()
                
                # Get rotation matrix and translation vector (following guide methodology)
                rotation, translation = svd_super_imposer.get_rotran()
                rmsd = svd_super_imposer.get_rms()
                iterations_performed = 0
            
            # Assemble 4x4 homogeneous transformation matrix
            transform_matrix = np.identity(4)
            transform_matrix[:3, :3] = rotation
            transform_matrix[:3, 3] = translation
            
            # Apply transformation to entire mobile complex (critical step from guide Section 9)
            for atom in mob_struct.get_atoms():
                atom.transform(rotation, translation)
            
            # Calculate ligand RMSD after alignment (following guide Section 10)
            ligand_rmsd = None
            ligand_rmsd_error = None
            try:
                ref_ligand_atoms = self._get_ligand_heavy_atoms(ref_struct, ligand_resname)
                mob_ligand_atoms = self._get_ligand_heavy_atoms(mob_struct, ligand_resname)
                
                if len(ref_ligand_atoms) == len(mob_ligand_atoms) and len(ref_ligand_atoms) > 0:
                    ref_ligand_coords = np.array([atom.get_coord() for atom in ref_ligand_atoms])
                    mob_ligand_coords = np.array([atom.get_coord() for atom in mob_ligand_atoms])
                    
                    # Direct RMSD calculation without additional superposition
                    diff = ref_ligand_coords - mob_ligand_coords
                    ligand_rmsd = np.sqrt(np.sum(diff * diff) / len(ref_ligand_atoms))
                    logger.info(f"Ligand heavy-atom RMSD after binding site alignment: {ligand_rmsd:.3f} Å")
                else:
                    ligand_rmsd_error = f"Ligand atom count mismatch: ref={len(ref_ligand_atoms)}, mob={len(mob_ligand_atoms)}"
                    logger.warning(ligand_rmsd_error)
            except Exception as e:
                ligand_rmsd_error = f"Ligand RMSD calculation failed: {str(e)}"
                logger.warning(ligand_rmsd_error)
            
            # Calculate TM-score for binding site atoms
            try:
                tm_score = self._calculate_tm_score(ref_atoms, mob_atoms, None)
            except Exception as e:
                logger.warning(f"TM-score calculation failed: {e}")
                tm_score = None
            
            # Generate aligned structure string
            pdb_io = PDBIO()
            pdb_io.set_structure(mob_struct)
            out_handle = io.StringIO()
            pdb_io.save(out_handle)
            aligned_structure = out_handle.getvalue()
            
            # Determine alignment method for result
            if iterative_until_threshold:
                alignment_method = 'binding_site_iterative'
            else:
                alignment_method = 'binding_site'
                
            result = {
                'success': True,
                'alignment_method': alignment_method,
                'binding_site_radius': radius,
                'binding_site_residues': len(ref_binding_site),
                'rmsd': float(rmsd),
                'ligand_rmsd': float(ligand_rmsd) if ligand_rmsd is not None else None,
                'ligand_rmsd_error': ligand_rmsd_error,
                'tm_score': float(tm_score) if tm_score is not None else None,
                'num_atoms': len(ref_atoms),
                'iterations_performed': iterations_performed if iterative_until_threshold else 0,
                'transformation_matrix': transform_matrix.flatten('C').tolist(),
                'aligned_structure': aligned_structure,
                'reference_chain': ref_chain.id,
                'mobile_chain': mob_chain.id,
                'ligand_resname': ligand_resname,
                'error': None
            }
            
            logger.info(f"Binding site alignment successful: RMSD = {rmsd:.3f} Å using {len(ref_atoms)} atoms")
            return result
            
        except Exception as e:
            logger.error(f"Binding site alignment failed: {e}")
            return {
                'success': False,
                'alignment_method': 'binding_site',
                'rmsd': None,
                'ligand_rmsd': None,
                'num_atoms': 0,
                'transformation_matrix': None,
                'aligned_structure': None,
                'reference_chain': None,
                'mobile_chain': None,
                'error': str(e)
            }
    
    def _calculate_tm_score(self, ref_atoms, mob_atoms, aligned_distance_matrix):
        """
        Calculate TM-score for more robust similarity assessment.
        
        TM-score is length-independent and less sensitive to outliers than RMSD.
        Score > 0.5 indicates same fold, < 0.17 suggests random similarity.
        
        Args:
            ref_atoms: Reference atoms
            mob_atoms: Mobile atoms (after alignment)
            aligned_distance_matrix: Distances between aligned atom pairs
            
        Returns:
            TM-score value between 0 and 1
        """
        n_atoms = len(ref_atoms)
        if n_atoms == 0:
            return 0.0
            
        # TM-score normalization factor
        d0 = 1.24 * ((n_atoms - 15) ** (1/3)) - 1.8 if n_atoms > 15 else 0.5
        
        # Calculate TM-score
        tm_sum = 0.0
        for i in range(n_atoms):
            ref_coord = ref_atoms[i].get_coord()
            mob_coord = mob_atoms[i].get_coord()
            distance = np.linalg.norm(ref_coord - mob_coord)
            tm_sum += 1.0 / (1.0 + (distance / d0) ** 2)
        
        tm_score = tm_sum / n_atoms
        return tm_score
    
    def align_sequences(self, chain_a, chain_b) -> Dict:
        """
        Perform global pairwise sequence alignment and return residue mapping.
        
        Args:
            chain_a: Reference chain (Bio.PDB Chain object)
            chain_b: Mobile chain to be aligned (Bio.PDB Chain object)
            
        Returns:
            Dictionary mapping residue IDs from chain_a to chain_b
        """
        resseq_a = self.get_pdb_sequence(chain_a)
        resseq_b = self.get_pdb_sequence(chain_b)
        
        if not resseq_a or not resseq_b:
            raise ValueError("One or both chains contain no valid amino acid residues")
        
        sequence_a = "".join([aa for _, aa in resseq_a])
        sequence_b = "".join([aa for _, aa in resseq_b])
        
        logger.debug(f"Aligning sequences: {len(sequence_a)} vs {len(sequence_b)} residues")
        
        # Perform global alignment with BLOSUM62 matrix
        try:
            alns = pairwise2.align.globalds(
                sequence_a,
                sequence_b,
                substitution_matrices.load("BLOSUM62"),
                -10.0,  # Gap open penalty
                -0.5,   # Gap extension penalty
                one_alignment_only=True
            )
            
            if not alns:
                raise ValueError("Sequence alignment failed")
                
            best_aln = alns[0]
            aligned_a, aligned_b, score, _, _ = best_aln
            
            logger.debug(f"Alignment score: {score}")
            
        except Exception as e:
            logger.error(f"Sequence alignment failed: {e}")
            raise ValueError(f"Sequence alignment error: {e}")
        
        # Build residue mapping from alignment
        mapping = {}
        idx_a, idx_b = 0, 0
        
        for aa_a, aa_b in zip(aligned_a, aligned_b):
            if aa_a != '-' and aa_b != '-':
                # Match or mismatch - map the residues
                mapping[resseq_a[idx_a][0]] = resseq_b[idx_b][0]
                idx_a += 1
                idx_b += 1
            elif aa_a == '-':
                # Gap in sequence A (reference)
                idx_b += 1
            elif aa_b == '-':
                # Gap in sequence B (mobile)
                idx_a += 1
        
        logger.debug(f"Mapped {len(mapping)} corresponding residues")
        return mapping
    
    def parse_structure_data(self, structure_data: str, file_format: str = 'auto'):
        """
        Parse structure data from string.
        
        Args:
            structure_data: Structure data as string
            file_format: Format ('pdb', 'mmcif', or 'auto')
            
        Returns:
            Bio.PDB Structure object
        """
        if file_format == 'auto':
            # Auto-detect format
            if 'data_' in structure_data[:100] or '_entry.id' in structure_data[:500]:
                file_format = 'mmcif'
            else:
                file_format = 'pdb'
        
        try:
            if file_format == 'mmcif':
                structure = self.mmcif_parser.get_structure("structure", io.StringIO(structure_data))
            else:
                structure = self.pdb_parser.get_structure("structure", io.StringIO(structure_data))
                
            return structure
            
        except Exception as e:
            logger.error(f"Structure parsing failed: {e}")
            raise ValueError(f"Failed to parse structure data: {e}")
    
    def align_protein_structures(self, reference_data: str, mobile_data: str, 
                               ref_format: str = 'auto', mob_format: str = 'auto',
                               chain_id: Optional[str] = None,
                               use_iterative_pruning: bool = True,
                               rmsd_cutoff: float = 4.0,
                               max_iterations: int = 5,
                               atom_types: List[str] = None,
                               iterative_until_threshold: bool = False,
                               target_rmsd: float = 0.05) -> Dict[str, Any]:
        """
        Align two protein structures using specified atom types for superposition.
        
        Args:
            reference_data: Reference structure data (PDB/mmCIF string)
            mobile_data: Mobile structure data to be aligned
            ref_format: Reference structure format
            mob_format: Mobile structure format  
            chain_id: Specific chain ID to align (if None, uses first chain)
            atom_types: List of atom types to use for alignment (default: ['CA'] for C-alpha)
            iterative_until_threshold: Whether to continue aligning until target RMSD is reached
            target_rmsd: Target RMSD threshold for iterative alignment (default: 0.05)
            
        Returns:
            Dictionary containing alignment results and transformation matrix
        """
        try:
            # Parse structures
            ref_struct = self.parse_structure_data(reference_data, ref_format)
            mob_struct = self.parse_structure_data(mobile_data, mob_format)
            
            # Get chains to align
            ref_chains = list(ref_struct.get_chains())
            mob_chains = list(mob_struct.get_chains())
            
            if not ref_chains or not mob_chains:
                raise ValueError("No chains found in one or both structures")
            
            if chain_id:
                # Use specific chain
                ref_chain = ref_struct[0][chain_id] if chain_id in [c.id for c in ref_chains] else None
                mob_chain = mob_struct[0][chain_id] if chain_id in [c.id for c in mob_chains] else None
                
                if not ref_chain or not mob_chain:
                    raise ValueError(f"Chain {chain_id} not found in one or both structures")
            else:
                # Use first protein chain
                ref_chain = ref_chains[0]
                mob_chain = mob_chains[0]
            
            logger.info(f"Aligning chains: {ref_chain.id} (reference) vs {mob_chain.id} (mobile)")
            
            # Perform sequence alignment to get residue mapping
            mapping = self.align_sequences(ref_chain, mob_chain)
            
            if not mapping:
                raise ValueError("No corresponding residues found for alignment")
            
            # Set default atom types if not specified
            if atom_types is None:
                atom_types = ['CA']  # Default to C-alpha atoms
            
            # Collect corresponding atoms based on specified atom types
            ref_atoms = []
            mob_atoms = []
            
            for ref_res_id, mob_res_id in mapping.items():
                try:
                    # Get all atoms of specified types from both residues
                    for atom_type in atom_types:
                        if atom_type in ref_chain[ref_res_id] and atom_type in mob_chain[mob_res_id]:
                            ref_atom = ref_chain[ref_res_id][atom_type]
                            mob_atom = mob_chain[mob_res_id][atom_type]
                            ref_atoms.append(ref_atom)
                            mob_atoms.append(mob_atom)
                except KeyError:
                    # Skip if specified atom type is missing
                    continue
            
            if len(ref_atoms) < 3:
                raise ValueError(f"Insufficient corresponding atoms for alignment: {len(ref_atoms)}")
            
            atom_description = ', '.join(atom_types) if len(atom_types) <= 3 else f"{len(atom_types)} atom types"
            logger.info(f"Using {len(ref_atoms)} atoms ({atom_description}) for superposition")
            
            # Perform alignment
            if iterative_until_threshold:
                # Use iterative alignment until target RMSD is reached
                alignment_result = iterative_alignment_until_threshold(
                    ref_atoms, mob_atoms, target_rmsd, max_iterations
                )
                rotation, translation = alignment_result['rotation'], alignment_result['translation']
                rmsd = alignment_result['rmsd']
                core_atoms_used = len(ref_atoms)
                iterations_performed = alignment_result['iterations']
                
                logger.info(f"Iterative alignment until threshold: {iterations_performed} iterations, "
                           f"RMSD: {rmsd:.6f} Å, converged: {alignment_result['converged']}")
            elif use_iterative_pruning and len(ref_atoms) > 10:
                # Perform iterative core-focused alignment with outlier pruning
                alignment_result = self._iterative_core_alignment(
                    ref_atoms, mob_atoms, rmsd_cutoff, max_iterations
                )
                rotation, translation = alignment_result['transformation']
                rmsd = alignment_result['rmsd']
                core_atoms_used = alignment_result['core_atoms_used']
                iterations_performed = alignment_result['iterations']
                
                logger.info(f"Core-focused alignment: {core_atoms_used}/{len(ref_atoms)} atoms, "
                           f"{iterations_performed} iterations, RMSD: {rmsd:.3f} Å")
            else:
                # Standard rigid-body alignment using all atoms
                super_imposer = Superimposer()
                super_imposer.set_atoms(ref_atoms, mob_atoms)
                rotation, translation = super_imposer.rotran
                rmsd = super_imposer.rms
                core_atoms_used = len(ref_atoms)
                iterations_performed = 0
                
            # Assemble 4x4 homogeneous transformation matrix
            transform_matrix = np.identity(4)
            transform_matrix[:3, :3] = rotation
            transform_matrix[:3, 3] = translation
            
            # Apply transformation to the mobile structure for output
            if iterative_until_threshold or (use_iterative_pruning and len(ref_atoms) > 10):
                # Apply the final transformation from iterative alignment
                final_super_imposer = Superimposer()
                final_super_imposer.rotran = (rotation, translation)
                final_super_imposer.apply(mob_struct.get_atoms())
            else:
                super_imposer.apply(mob_struct.get_atoms())
            
            # Calculate TM-score for additional similarity metric
            try:
                # Use the core atoms that were actually used in alignment
                if use_iterative_pruning and 'core_atoms_used' in locals():
                    # Get core atom subset for TM-score calculation
                    core_ref_atoms = ref_atoms[:core_atoms_used]
                    core_mob_atoms = mob_atoms[:core_atoms_used]
                else:
                    core_ref_atoms = ref_atoms
                    core_mob_atoms = mob_atoms
                    
                tm_score = self._calculate_tm_score(core_ref_atoms, core_mob_atoms, None)
            except Exception as e:
                logger.warning(f"TM-score calculation failed: {e}")
                tm_score = None
            
            # Generate aligned structure string
            pdb_io = PDBIO()
            pdb_io.set_structure(mob_struct)
            out_handle = io.StringIO()
            pdb_io.save(out_handle)
            aligned_structure = out_handle.getvalue()
            
            # Enhanced result with new alignment metrics
            if iterative_until_threshold:
                alignment_method = 'iterative_until_threshold'
                iterations_info = iterations_performed
            elif use_iterative_pruning and len(ref_atoms) > 10:
                alignment_method = 'iterative_core'
                iterations_info = iterations_performed
            else:
                alignment_method = 'rigid_body'
                iterations_info = 0
                
            result = {
                'success': True,
                'rmsd': float(rmsd),
                'tm_score': float(tm_score) if tm_score is not None else None,
                'num_atoms': len(ref_atoms),
                'core_atoms_used': core_atoms_used if use_iterative_pruning else len(ref_atoms),
                'iterations_performed': iterations_info,
                'alignment_method': alignment_method,
                'transformation_matrix': transform_matrix.flatten('C').tolist(),  # Row-major order
                'aligned_structure': aligned_structure,
                'reference_chain': ref_chain.id,
                'mobile_chain': mob_chain.id,
                'error': None
            }
            
            logger.info(f"Alignment successful: RMSD = {rmsd:.3f} Å using {len(ref_atoms)} atoms")
            return result
            
        except Exception as e:
            logger.error(f"Protein alignment failed: {e}")
            return {
                'success': False,
                'rmsd': None,
                'num_atoms': 0,
                'transformation_matrix': None,
                'aligned_structure': None,
                'reference_chain': None,
                'mobile_chain': None,
                'error': str(e)
            }
    
    def align_multiple_poses(self, pose_structures: List[str], 
                           formats: List[str] = None,
                           chain_id: str = None,
                           ligand_resname: str = 'LIG',
                           use_binding_site: bool = True,
                           binding_site_radius: float = 8.0,
                           use_iterative_pruning: bool = True,
                           rmsd_cutoff: float = 4.0,
                           max_iterations: int = 5,
                           atom_types: List[str] = None,
                           iterative_until_threshold: bool = False,
                           target_rmsd: float = 0.05) -> Dict[str, Any]:
        """
        Align multiple poses to the first pose as reference using binding site alignment.
        
        This method now defaults to binding site alignment for better drug discovery applications,
        focusing on the most relevant region around the ligand.
        
        Args:
            pose_structures: List of structure data strings
            formats: List of format strings for each structure
            chain_id: Specific chain ID to align
            ligand_resname: Residue name for ligand (default: 'LIG')
            use_binding_site: Use binding site alignment (default: True)
            binding_site_radius: Binding site radius in Angstroms (default: 8.0)
            use_iterative_pruning: Use iterative pruning for fallback method
            rmsd_cutoff: RMSD cutoff for refinement
            atom_types: List of atom types to use for alignment (default: ['CA'] for C-alpha)
            iterative_until_threshold: Whether to continue aligning until target RMSD is reached
            target_rmsd: Target RMSD threshold for iterative alignment (default: 0.05)
            
        Returns:
            Dictionary containing alignment results and ligand RMSD analysis for all poses
        """
        if not pose_structures:
            return {'success': False, 'error': 'No poses provided', 'alignments': []}
        
        if len(pose_structures) < 2:
            return {
                'success': True, 
                'alignments': [{
                    'pose_index': 0, 
                    'is_reference': True,
                    'alignment_method': 'reference'
                }],
                'reference_pose': 0
            }
        
        if formats is None:
            formats = ['auto'] * len(pose_structures)
        
        reference_structure = pose_structures[0]
        reference_format = formats[0]
        
        alignments = []
        
        # First pose is the reference (no transformation needed)
        alignments.append({
            'pose_index': 0,
            'is_reference': True,
            'alignment_method': 'reference',
            'rmsd': 0.0,
            'ligand_rmsd': 0.0,  # Ligand RMSD is 0 for reference
            'transformation_matrix': np.identity(4).flatten('C').tolist(),
            'success': True,
            'error': None
        })
        
        alignment_method = 'binding_site' if use_binding_site else 'full_structure'
        logger.info(f"Aligning {len(pose_structures)} poses to reference (pose 0) using {alignment_method} alignment")
        if use_binding_site:
            logger.info(f"Binding site parameters: ligand_resname='{ligand_resname}', radius={binding_site_radius}Å")
        
        # Align all other poses to the reference
        for i in range(1, len(pose_structures)):
            mobile_structure = pose_structures[i]
            mobile_format = formats[i]
            
            logger.info(f"Aligning pose {i} to reference...")
            
            # Use binding site alignment as default
            if use_binding_site:
                alignment_result = self.align_binding_sites(
                    reference_structure, mobile_structure,
                    reference_format, mobile_format,
                    chain_id, ligand_resname, binding_site_radius,
                    rmsd_cutoff, max_iterations,
                    atom_types=atom_types,
                    iterative_until_threshold=iterative_until_threshold,
                    target_rmsd=target_rmsd
                )
            else:
                # Fallback to traditional full structure alignment
                alignment_result = self.align_protein_structures(
                    reference_structure, mobile_structure,
                    reference_format, mobile_format,
                    chain_id, use_iterative_pruning, rmsd_cutoff, max_iterations,
                    atom_types=atom_types,
                    iterative_until_threshold=iterative_until_threshold,
                    target_rmsd=target_rmsd
                )
            
            pose_alignment = {
                'pose_index': i,
                'is_reference': False,
                'alignment_method': alignment_result.get('alignment_method', 'unknown'),
                'rmsd': alignment_result.get('rmsd'),
                'ligand_rmsd': alignment_result.get('ligand_rmsd'),
                'ligand_rmsd_error': alignment_result.get('ligand_rmsd_error'),
                'binding_site_residues': alignment_result.get('binding_site_residues'),
                'binding_site_radius': alignment_result.get('binding_site_radius'),
                'transformation_matrix': alignment_result.get('transformation_matrix'),
                'num_atoms': alignment_result.get('num_atoms', 0),
                'success': alignment_result.get('success', False),
                'error': alignment_result.get('error')
            }
            
            alignments.append(pose_alignment)
            
            if pose_alignment['success']:
                rmsd_info = f"RMSD = {pose_alignment['rmsd']:.3f} Å"
                if pose_alignment.get('ligand_rmsd') is not None:
                    rmsd_info += f", Ligand RMSD = {pose_alignment['ligand_rmsd']:.3f} Å"
                if pose_alignment.get('binding_site_residues') is not None:
                    rmsd_info += f" ({pose_alignment['binding_site_residues']} binding site residues)"
                logger.info(f"Pose {i} aligned successfully: {rmsd_info}")
            else:
                logger.warning(f"Pose {i} alignment failed: {pose_alignment['error']}")
        
        return {
            'success': True,
            'alignment_method': alignment_method,
            'alignments': alignments,
            'reference_pose': 0,
            'total_poses': len(pose_structures),
            'ligand_resname': ligand_resname,
            'binding_site_radius': binding_site_radius if use_binding_site else None
        }
    
    def get_service_status(self) -> Dict[str, Any]:
        """
        Get the current status of the alignment service.
        
        Returns:
            Dictionary containing service status information
        """
        return {
            'service': 'Protein Structure Alignment',
            'available': True,
            'capabilities': [
                'Pairwise protein structure alignment',
                'Multi-pose alignment to reference',
                'Sequence-based atom correspondence',
                'Kabsch algorithm superposition',
                '4x4 transformation matrix output',
                'PDB and mmCIF format support'
            ],
            'dependencies': [
                'Biopython (Bio.PDB)',
                'NumPy',
                'Bio.Align'
            ]
        }
