# services/docking_service.py
import os
import tempfile
import subprocess
import numpy as np
from io import StringIO
import traceback
import json
import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from lib.chemistry import get_pdb_parser, get_component_analyzer

# Valid element symbols for PDB files
VALID_ELEMENTS = {
    'H', 'HE', 'LI', 'BE', 'B', 'C', 'N', 'O', 'F', 'NE',
    'NA', 'MG', 'AL', 'SI', 'P', 'S', 'CL', 'AR',
    'K', 'CA', 'SC', 'TI', 'V', 'CR', 'MN', 'FE', 'CO', 'NI', 'CU', 'ZN',
    'GA', 'GE', 'AS', 'SE', 'BR', 'KR',
    'RB', 'SR', 'Y', 'ZR', 'NB', 'MO', 'RU', 'RH', 'PD', 'AG', 'CD',
    'IN', 'SN', 'SB', 'TE', 'I', 'XE',
    'CS', 'BA', 'LA', 'PT', 'AU', 'HG', 'TL', 'PB', 'BI'
}

# Two-letter elements that are commonly confused with single-letter ones
TWO_LETTER_PRIORITY = {'BR', 'CL', 'FE', 'ZN', 'MG', 'CA', 'NA', 'MN', 'CO', 'CU', 'NI', 'SE', 'SI'}


def infer_element_from_atom_name(atom_name: str) -> str:
    """
    Infer element symbol from PDB atom name with priority for two-letter elements.
    
    Args:
        atom_name: Atom name from PDB (columns 13-16)
        
    Returns:
        Properly formatted element symbol (right-justified in 2 chars)
    """
    name = (atom_name or '').strip()
    name_alpha = ''.join(ch for ch in name if ch.isalpha()).upper()
    
    if not name_alpha:
        return '  '
    
    # Check for two-letter elements first (e.g., BR, CL, FE)
    if len(name_alpha) >= 2:
        two_char = name_alpha[:2]
        if two_char in TWO_LETTER_PRIORITY or two_char in VALID_ELEMENTS:
            return two_char[0] + two_char[1].lower()  # e.g., 'Br', 'Cl'
    
    # Single-letter element - return right-justified
    first_char = name_alpha[0]
    if first_char in VALID_ELEMENTS:
        return ' ' + first_char  # Right-justified, e.g., ' N', ' C'
    
    return ' ' + first_char


def sanitize_pdb_element_columns(pdb_data: str) -> str:
    """
    Sanitize PDB data by ensuring element columns (77-78) are properly formatted.

    OpenBabel and RDKit read element symbols from columns 77-78 per the PDB format
    specification. This function only ensures proper right-justification (e.g., ' N' not 'N '),
    trusting the element symbols already present in the PDB file.

    Previous versions attempted to infer elements from atom names, which caused bugs like
    "O1S" (oxygen with positional suffix) being misidentified as "Os" (osmium). We now
    trust the element column from the source PDB file.

    Args:
        pdb_data: Raw PDB format string

    Returns:
        Sanitized PDB string with properly right-justified element columns
    """
    sanitized_lines = []
    fixed_count = 0

    for line in pdb_data.split('\n'):
        if line.startswith(('ATOM', 'HETATM')):
            # Ensure line is at least 78 characters
            padded_line = line.ljust(80)

            # Current element from columns 77-78 (0-indexed: 76-78)
            current_element = padded_line[76:78].strip() if len(padded_line) >= 78 else ''

            # Only ensure proper right-justification if element exists
            if current_element:
                needs_fix = False
                if len(current_element) == 1:
                    # Single letter element should be right-justified: ' N' not 'N '
                    if padded_line[76:78] != ' ' + current_element:
                        needs_fix = True
                elif len(current_element) == 2:
                    # Two-letter element - check if left-justified (e.g., 'Br ' instead of 'Br')
                    if padded_line[76] == current_element[0] and padded_line[77] == ' ':
                        needs_fix = True

                if needs_fix:
                    # Fix the justification (columns 77-78, 0-indexed: 76-78)
                    # Element symbols should be right-justified
                    element_formatted = current_element.rjust(2)
                    padded_line = padded_line[:76] + element_formatted + padded_line[78:]
                    fixed_count += 1

            sanitized_lines.append(padded_line.rstrip())
        else:
            sanitized_lines.append(line)

    if fixed_count > 0:
        print(f"[DockingService] Fixed element column justification for {fixed_count} atoms in PDB")

    return '\n'.join(sanitized_lines)

# Try to import the official vina package (recommended approach)
try:
    from vina import Vina
    VINA_PACKAGE_AVAILABLE = True
except ImportError:
    print("Warning: Official vina package not available. Falling back to command-line execution.")
    VINA_PACKAGE_AVAILABLE = False

# Try to import Open Babel for PDBQT preparation
try:
    from openbabel import pybel
    OPENBABEL_AVAILABLE = True
except ImportError:
    print("Warning: Open Babel not available. PDBQT preparation will use command-line tools.")
    OPENBABEL_AVAILABLE = False

# Try to import RDKit for SDF conversion with bond preservation
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem, rdDistGeom, rdMolAlign
    RDKIT_AVAILABLE = True
except ImportError:
    print("Warning: RDKit not available. SDF conversion with bond preservation will be disabled.")
    RDKIT_AVAILABLE = False

# Try to import Meeko for modern PDBQT preparation (recommended by Vina developers)
try:
    from meeko import MoleculePreparation, PDBQTWriterLegacy, PDBQTMolecule, RDKitMolCreate
    MEEKO_AVAILABLE = True
except ImportError:
    print("Warning: Meeko not available. Falling back to Open Babel for PDBQT preparation.")
    MEEKO_AVAILABLE = False

class DockingService:
    """Service for AutoDock Vina molecular docking operations."""
    
    def __init__(self):
        # Initialize chemistry utilities
        self.pdb_parser = get_pdb_parser()
        self.component_analyzer = get_component_analyzer()
        
        # Base directory for outputs
        self.base_dir = os.getenv('DOCKING_OUTPUT_DIR', 'data/docking_outputs')
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir, exist_ok=True)
        
        # Configuration for external tools (adjust paths as needed)
        self.vina_executable = os.path.join(os.path.dirname(os.path.dirname(__file__)), "vina")  # Local vina binary
        self.obabel_executable = "obabel"  # Assumes obabel is in PATH
        self.autogrid_executable = "autogrid4"  # AutoGrid4 for affinity map generation
        
        # Verify vina executable exists
        if not os.path.exists(self.vina_executable) or not os.access(self.vina_executable, os.X_OK):
            # Try to find vina in PATH
            import shutil
            vina_in_path = shutil.which("vina")
            if vina_in_path:
                self.vina_executable = vina_in_path
                print(f"[DockingService] Using vina from PATH: {self.vina_executable}")
            else:
                print(f"[DockingService] WARNING: Vina executable not found at {self.vina_executable} and not in PATH")
        
        # Default docking parameters
        self.default_params = {
            'exhaustiveness': 32,  # Tutorial standard for better sampling
            'num_modes': 10,       # Generate 10 poses
            'energy_range': 100.0,  # Large range to capture all poses like command-line
            'cpu': 0,              # Use all available CPUs
            'seed': 0,             # For reproducibility
            'scoring': 'vina'      # Default to Vina forcefield ('vina', 'ad4', 'vinardo')
        }
        
        # AutoDock4 atom types for GPF generation
        self.ad4_atom_types = ['A', 'C', 'HD', 'H', 'NA', 'N', 'OA', 'SA', 'S', 'P', 'F', 'Cl', 'Br', 'I']

    def _get_jobs_dir(self) -> Path:
        """Get the directory where job metadata is stored."""
        jobs_dir = Path(self.base_dir) / "jobs"
        jobs_dir.mkdir(parents=True, exist_ok=True)
        return jobs_dir

    def save_job(self, job_id: str, data: Dict[str, Any]):
        """Save job metadata to a JSON file."""
        file_path = self._get_jobs_dir() / f"{job_id}.json"
        
        # Ensure timestamp is present
        if 'updated_at' not in data:
            data['updated_at'] = datetime.datetime.utcnow().isoformat()
        if 'created_at' not in data and not file_path.exists():
            data['created_at'] = datetime.datetime.utcnow().isoformat()
            
        # If updating existing job, merge data
        if file_path.exists():
            try:
                with open(file_path, 'r') as f:
                    existing_data = json.load(f)
                existing_data.update(data)
                data = existing_data
            except Exception as e:
                print(f"Failed to read existing job data for {job_id}: {e}")

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve job metadata by ID."""
        file_path = self._get_jobs_dir() / f"{job_id}.json"
        if not file_path.exists():
            return None
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Failed to read job {job_id}: {e}")
            return None

    def list_jobs(self) -> List[Dict[str, Any]]:
        """List all persisted jobs."""
        jobs = []
        jobs_dir = self._get_jobs_dir()
        for file_path in jobs_dir.glob("*.json"):
            try:
                with open(file_path, 'r') as f:
                    jobs.append(json.load(f))
            except Exception as e:
                print(f"Failed to read job file {file_path}: {e}")
        
        # Sort by creation time (newest first)
        return sorted(jobs, key=lambda x: x.get('created_at', ''), reverse=True)

    def delete_job(self, job_id: str) -> bool:
        """Delete job metadata and associated files."""
        file_path = self._get_jobs_dir() / f"{job_id}.json"
        
        try:
            # Delete metadata file if it exists
            if file_path.exists():
                os.remove(file_path)
            
            # Delete output directory if it exists
            job_output_dir = Path(self.base_dir) / job_id
            if job_output_dir.exists() and job_output_dir.is_dir():
                import shutil
                shutil.rmtree(job_output_dir)
            
            return True
        except Exception as e:
            print(f"Failed to delete job {job_id}: {e}")
            return False

    def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a running job.
        For now, we just mark it as failed in the metadata.
        """
        job = self.get_job(job_id)
        if not job:
            return False
        
        if job.get('status') in ['running', 'submitted']:
            job['status'] = 'failed'
            job['error'] = 'Job cancelled by user'
            self.save_job(job_id, job)
            return True
        
        return False
    
    def prepare_receptor_pdbqt(self, pdb_data, output_path=None):
        """
        Convert receptor PDB to PDBQT format using Open Babel.
        
        Args:
            pdb_data (str): PDB format data as string
            output_path (str, optional): Path to save PDBQT file
            
        Returns:
            str: PDBQT format data as string
        """
        try:
            # Sanitize PDB element columns before OpenBabel processing
            # This fixes left-justified elements (e.g., 'N ') to be right-justified (' N')
            pdb_data = sanitize_pdb_element_columns(pdb_data)
            
            if OPENBABEL_AVAILABLE:
                # Use pybel for conversion
                mol = pybel.readstring("pdb", pdb_data)
                mol.addh()  # Add hydrogens
                pdbqt_data = mol.write("pdbqt")
                
                # Clean up PDBQT for receptor (remove ROOT/ENDROOT/BRANCH/ENDBRANCH/TORSDOF)
                pdbqt_data = self._clean_receptor_pdbqt(pdbqt_data)
                
                if output_path:
                    with open(output_path, 'w') as f:
                        f.write(pdbqt_data)
                
                return pdbqt_data
            else:
                # Fall back to command-line obabel
                return self._prepare_receptor_cmdline(pdb_data, output_path)
                
        except Exception as e:
            raise Exception(f"Error preparing receptor PDBQT: {str(e)}")
    
    def prepare_ligand_pdbqt_meeko(self, ligand_data, input_format="pdb"):
        """
        Convert ligand to PDBQT format using Meeko (recommended by Vina developers).

        Meeko produces superior torsion trees compared to Open Babel, preserves
        bond order information, and uses RDKit for reliable 3D coordinate generation.

        Args:
            ligand_data (str): Ligand data as string
            input_format (str): Input format ('pdb', 'sdf', 'mol', 'mol2')

        Returns:
            str: PDBQT format data as string

        Raises:
            Exception: If Meeko or RDKit is not available, or conversion fails
        """
        if not MEEKO_AVAILABLE:
            raise ImportError("Meeko not available")
        if not RDKIT_AVAILABLE:
            raise ImportError("RDKit not available (required by Meeko)")

        # Parse input with RDKit
        fmt = input_format.lower()
        if fmt in ('sdf', 'mol'):
            mol = Chem.MolFromMolBlock(ligand_data, removeHs=False)
        elif fmt == 'pdb':
            mol = Chem.MolFromPDBBlock(ligand_data, removeHs=False)
        else:
            raise ValueError(f"Unsupported input format for Meeko: {input_format}")

        if mol is None:
            raise ValueError(f"RDKit failed to parse ligand in {input_format} format")

        # Add hydrogens preserving existing coordinates
        mol = Chem.AddHs(mol, addCoords=True)

        # Check if 3D coordinates are present and valid
        needs_3d = True
        if mol.GetNumConformers() > 0:
            conf = mol.GetConformer()
            if conf.Is3D():
                # Verify coordinates are not all zeros
                coords = [conf.GetAtomPosition(i) for i in range(min(3, mol.GetNumAtoms()))]
                if any(abs(c.x) > 0.01 or abs(c.y) > 0.01 or abs(c.z) > 0.01 for c in coords):
                    needs_3d = False

        if needs_3d:
            print("[DockingService] Generating 3D coordinates via ETKDGv3")
            mol.RemoveAllConformers()
            params = rdDistGeom.ETKDGv3()
            result = AllChem.EmbedMolecule(mol, params)
            if result == -1:
                # Retry with random coords
                params.useRandomCoords = True
                result = AllChem.EmbedMolecule(mol, params)
                if result == -1:
                    raise ValueError("Failed to generate 3D coordinates for ligand")
            AllChem.MMFFOptimizeMolecule(mol)

        # Prepare with Meeko
        preparator = MoleculePreparation()
        mol_setups = preparator.prepare(mol)

        # Get first (and usually only) setup
        setup = mol_setups[0]

        # Write PDBQT string
        pdbqt_string, is_ok, error_msg = PDBQTWriterLegacy.write_string(setup)
        if not is_ok:
            raise ValueError(f"Meeko PDBQT writing failed: {error_msg}")

        print(f"[DockingService] Meeko ligand PDBQT prepared ({len(pdbqt_string)} bytes)")
        return pdbqt_string

    def prepare_ligand_pdbqt(self, ligand_data, input_format="pdb", output_path=None):
        """
        Convert ligand to PDBQT format with flexibility information.

        Prefers Meeko (modern, recommended by Vina developers) and falls back
        to Open Babel if Meeko is unavailable or fails.

        Args:
            ligand_data (str): Ligand data as string
            input_format (str): Input format ('pdb', 'sdf', 'mol2')
            output_path (str, optional): Path to save PDBQT file

        Returns:
            str: PDBQT format data as string
        """
        try:
            if not ligand_data or not ligand_data.strip():
                raise ValueError("Ligand data is empty")

            # Try Meeko first (produces superior torsion trees)
            if MEEKO_AVAILABLE and RDKIT_AVAILABLE and input_format.lower() in ('pdb', 'sdf', 'mol'):
                try:
                    pdbqt_data = self.prepare_ligand_pdbqt_meeko(ligand_data, input_format)
                    if output_path:
                        with open(output_path, 'w') as f:
                            f.write(pdbqt_data)
                    return pdbqt_data
                except Exception as e:
                    print(f"[DockingService] Meeko ligand prep failed, falling back to OpenBabel: {e}")

            # Sanitize PDB element columns before OpenBabel processing (if PDB format)
            if input_format.lower() == 'pdb':
                ligand_data = sanitize_pdb_element_columns(ligand_data)

            if OPENBABEL_AVAILABLE:
                # Use pybel for conversion
                mol = pybel.readstring(input_format, ligand_data)
                mol.addh()  # Add hydrogens

                # Generate 3D coordinates if needed
                if mol.dim != 3:
                    mol.make3D()

                pdbqt_data = mol.write("pdbqt")

                if output_path:
                    with open(output_path, 'w') as f:
                        f.write(pdbqt_data)

                return pdbqt_data
            else:
                # Fall back to command-line obabel
                return self._prepare_ligand_cmdline(ligand_data, input_format, output_path)

        except Exception as e:
            raise Exception(f"Error preparing ligand PDBQT: {str(e)}")
    
    def _prepare_receptor_cmdline(self, pdb_data, output_path=None):
        """Prepare receptor using command-line Open Babel."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pdb', delete=False) as temp_pdb:
            temp_pdb.write(pdb_data)
            temp_pdb_path = temp_pdb.name
        
        try:
            if output_path:
                pdbqt_path = output_path
            else:
                pdbqt_path = temp_pdb_path.replace('.pdb', '.pdbqt')
            
            # Run obabel command for receptor preparation
            cmd = [
                self.obabel_executable,
                temp_pdb_path,
                '-O', pdbqt_path,
                '-xr'  # Rigid receptor flag
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            # Read the generated PDBQT file
            with open(pdbqt_path, 'r') as f:
                pdbqt_data = f.read()
            
            # Clean up PDBQT for receptor (remove ROOT/ENDROOT/BRANCH/ENDBRANCH/TORSDOF)
            # The -xr flag doesn't always prevent these tags from being added
            pdbqt_data = self._clean_receptor_pdbqt(pdbqt_data)
            
            return pdbqt_data
            
        finally:
            # Clean up temporary files
            if os.path.exists(temp_pdb_path):
                os.unlink(temp_pdb_path)
            if not output_path and os.path.exists(pdbqt_path):
                os.unlink(pdbqt_path)
    
    def _prepare_ligand_cmdline(self, ligand_data, input_format, output_path=None):
        """Prepare ligand using command-line Open Babel."""
        file_ext = f'.{input_format}'
        with tempfile.NamedTemporaryFile(mode='w', suffix=file_ext, delete=False) as temp_input:
            temp_input.write(ligand_data)
            temp_input_path = temp_input.name
        
        try:
            if output_path:
                pdbqt_path = output_path
            else:
                pdbqt_path = temp_input_path.replace(file_ext, '.pdbqt')
            
            # Run obabel command for ligand preparation
            cmd = [
                self.obabel_executable,
                temp_input_path,
                '-O', pdbqt_path,
                '--gen3d',  # Generate 3D coordinates
                '-p', '7.4'  # Add hydrogens at pH 7.4
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            # Read the generated PDBQT file
            with open(pdbqt_path, 'r') as f:
                pdbqt_data = f.read()
            
            return pdbqt_data
            
        finally:
            # Clean up temporary files
            if os.path.exists(temp_input_path):
                os.unlink(temp_input_path)
            if not output_path and os.path.exists(pdbqt_path):
                os.unlink(pdbqt_path)
    
    def calculate_grid_box(self, pdb_data, ligand_resname=None, padding=5.0):
        """
        Calculate grid box parameters from a co-crystallized ligand or binding site.
        
        Args:
            pdb_data (str): PDB data containing protein and optionally a ligand
            ligand_resname (str, optional): Specific ligand residue name to use
            padding (float): Padding around ligand in Angstroms
            
        Returns:
            dict: Grid box parameters (center_x, center_y, center_z, size_x, size_y, size_z)
        """
        try:
            # Parse structure
            structure = self.pdb_parser.parse_string(pdb_data, "complex")
            
            # Identify components
            components = self.component_analyzer.identify_components(structure)
            
            # Get ligand residues
            ligand_residues = components.get('ligands', [])
            
            # Filter by resname if provided
            if ligand_resname:
                ligand_residues = [res for res in ligand_residues if res.get_resname().strip() == ligand_resname]
            
            ligand_atoms = []
            for residue in ligand_residues:
                ligand_atoms.extend(residue.get_list())
            
            if not ligand_atoms:
                # If no ligand found in the structure, try to use a default binding site
                # or center the grid box on the protein center
                print("Warning: No ligand found in structure, using protein center for grid box")
                
                # Get all protein atoms
                protein_residues = components.get('protein', [])
                protein_atoms = []
                for residue in protein_residues:
                    protein_atoms.extend(residue.get_list())
                
                if protein_atoms:
                    # Use protein center as fallback
                    coords = np.array([atom.get_coord() for atom in protein_atoms])
                    center = np.mean(coords, axis=0)
                    
                    # Use a reasonable default grid size
                    size = [20.0, 20.0, 20.0]
                    
                    return {
                        'center_x': float(center[0]),
                        'center_y': float(center[1]),
                        'center_z': float(center[2]),
                        'size_x': size[0],
                        'size_y': size[1],
                        'size_z': size[2]
                    }
                else:
                    raise ValueError("No ligand or protein atoms found in the structure for grid box calculation")
            
            # Calculate bounding box of ligand atoms
            coords = np.array([atom.get_coord() for atom in ligand_atoms])
            min_coords = np.min(coords, axis=0)
            max_coords = np.max(coords, axis=0)
            
            # Calculate center
            center = (min_coords + max_coords) / 2
            
            # Calculate size with padding
            size = max_coords - min_coords + 2 * padding
            
            # Ensure minimum box size
            min_size = 15.0  # Minimum 15 Angstroms
            size = np.maximum(size, min_size)
            
            # Ensure maximum box size (Vina recommendation)
            max_size = 30.0
            size = np.minimum(size, max_size)
            
            return {
                'center_x': float(center[0]),
                'center_y': float(center[1]),
                'center_z': float(center[2]),
                'size_x': float(size[0]),
                'size_y': float(size[1]),
                'size_z': float(size[2])
            }
            
        except Exception as e:
            raise Exception(f"Error calculating grid box: {str(e)}")

    def calculate_whole_protein_grid_box(self, pdb_data):
        """
        Calculate grid box parameters to encompass the entire protein.
        
        Args:
            pdb_data (str): PDB data containing protein
            
        Returns:
            dict: Grid box parameters (center_x, center_y, center_z, size_x, size_y, size_z)
        """
        try:
            # Parse structure
            structure = self.pdb_parser.parse_string(pdb_data, "complex")
            
            # Identify components
            components = self.component_analyzer.identify_components(structure)
            
            # Get all protein atoms
            protein_residues = components.get('protein', [])
            protein_atoms = []
            for residue in protein_residues:
                protein_atoms.extend(residue.get_list())
            
            if not protein_atoms:
                raise ValueError("No protein atoms found in the structure")
            
            # Calculate bounding box of all protein atoms
            coords = np.array([atom.get_coord() for atom in protein_atoms])
            min_coords = np.min(coords, axis=0)
            max_coords = np.max(coords, axis=0)
            
            # Calculate center
            center = (min_coords + max_coords) / 2
            
            # Calculate size (no padding for whole protein)
            size = max_coords - min_coords
            
            # Add small padding (1 Angstrom) for safety
            size = size + 2.0
            
            # Ensure minimum box size
            min_size = 15.0  # Minimum 15 Angstroms
            size = np.maximum(size, min_size)
            
            # Ensure maximum box size (Vina recommendation)
            max_size = 30.0
            size = np.minimum(size, max_size)
            
            return {
                'center_x': float(center[0]),
                'center_y': float(center[1]),
                'center_z': float(center[2]),
                'size_x': float(size[0]),
                'size_y': float(size[1]),
                'size_z': float(size[2])
            }
            
        except Exception as e:
            raise Exception(f"Error calculating whole protein grid box: {str(e)}")

    def generate_gpf(self, receptor_pdbqt_path, ligand_pdbqt_path, grid_box, gpf_path=None):
        """
        Generate a Grid Parameter File (GPF) for AutoGrid4.

        Args:
            receptor_pdbqt_path (str): Path to the receptor PDBQT file.
            ligand_pdbqt_path (str): Path to the ligand PDBQT file.
            grid_box (dict): Grid box parameters.
            gpf_path (str, optional): Path to save the GPF file.

        Returns:
            str: The path to the generated GPF file.
        """
        if gpf_path is None:
            gpf_path = receptor_pdbqt_path.replace('.pdbqt', '.gpf')

        # Get atom types from ligand
        ligand_atom_types = set()
        with open(ligand_pdbqt_path, 'r') as f:
            for line in f:
                if line.startswith("ATOM") or line.startswith("HETATM"):
                    atom_type = line.split()[-1]
                    ligand_atom_types.add(atom_type)

        gpf_content = (
            f"npts {int(grid_box['size_x'] / 0.375)} {int(grid_box['size_y'] / 0.375)} {int(grid_box['size_z'] / 0.375)}\n"
            f"gridfld {receptor_pdbqt_path.replace('.pdbqt', '.maps.fld')}\n"
            f"spacing 0.375\n"
            f"receptor_types {' '.join(self.ad4_atom_types)}\n"
            f"ligand_types {' '.join(sorted(list(ligand_atom_types)))}\n"
            f"receptor {receptor_pdbqt_path}\n"
            f"gridcenter {grid_box['center_x']:.3f} {grid_box['center_y']:.3f} {grid_box['center_z']:.3f}\n"
            f"smooth 0.5\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.A.map')}\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.C.map')}\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.H.map')}\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.HD.map')}\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.NA.map')}\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.N.map')}\n"
            f"map {receptor_pdbqt_path.replace('.pdbqt', '.OA.map')}\n"
            f"elecmap {receptor_pdbqt_path.replace('.pdbqt', '.e.map')}\n"
            f"dsolvmap {receptor_pdbqt_path.replace('.pdbqt', '.d.map')}\n"
            f"dielectric -0.1465\n"
        )

        with open(gpf_path, 'w') as f:
            f.write(gpf_content)

        return gpf_path

    def run_autogrid(self, gpf_path):
        """
        Run AutoGrid4 to generate affinity maps.

        Args:
            gpf_path (str): Path to the GPF file.

        Returns:
            str: The path to the AutoGrid log file (glg).
        """
        glg_path = gpf_path.replace('.gpf', '.glg')
        command = [
            self.autogrid_executable,
            '-p', gpf_path,
            '-l', glg_path
        ]

        try:
            process = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=True,
                cwd=os.path.dirname(gpf_path)  # Run in the same directory
            )
            return glg_path
        except FileNotFoundError:
            raise Exception(f"AutoGrid4 executable not found at '{self.autogrid_executable}'. Please install it and ensure it's in your PATH.")
        except subprocess.CalledProcessError as e:
            raise Exception(f"AutoGrid4 failed with error:\n{e.stderr}")
    
    def dock_with_vina_api(self, receptor_pdbqt, ligand_pdbqt, grid_box, 
                          docking_params=None):
        """
        Perform docking using the official vina Python API.
        
        Args:
            receptor_pdbqt (str): Receptor in PDBQT format
            ligand_pdbqt (str): Ligand in PDBQT format
            grid_box (dict): Grid box parameters
            docking_params (dict, optional): Docking parameters
            
        Returns:
            dict: Docking results with scores and poses
        """
        if not VINA_PACKAGE_AVAILABLE:
            raise ImportError("Official vina package not available. Please install it.")
        
        try:
            # Merge default parameters with user-provided ones
            params = {**self.default_params}
            if docking_params:
                params.update(docking_params)
            
            # Initialize Vina object
            v = Vina(sf_name='vina', cpu=params['cpu'], seed=params['seed'])

            # Receptor still requires a file path for the Vina API
            with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as receptor_file:
                receptor_file.write(receptor_pdbqt)
                receptor_path = receptor_file.name

            try:
                v.set_receptor(receptor_path)
                # Load ligand directly from string (no temp file needed)
                v.set_ligand_from_string(ligand_pdbqt)

                # Compute affinity maps
                center = [grid_box['center_x'], grid_box['center_y'], grid_box['center_z']]
                box_size = [grid_box['size_x'], grid_box['size_y'], grid_box['size_z']]
                v.compute_vina_maps(center=center, box_size=box_size)

                # Perform docking
                v.dock(exhaustiveness=params['exhaustiveness'], n_poses=params['num_modes'])

                # Get results
                energies = v.energies(n_poses=params['num_modes'])
                poses_pdbqt = v.poses(n_poses=params['num_modes'])
                
                # Parse RMSD values from PDBQT REMARK lines
                rmsd_values = self._parse_rmsd_from_pdbqt(poses_pdbqt)

                # Format results with detailed structure to match cmdline version
                detailed_scores = []
                for i, energy in enumerate(energies):
                    rmsd_lb, rmsd_ub = rmsd_values[i] if i < len(rmsd_values) else (0.0, 0.0)
                    detailed_scores.append({
                        'mode': i + 1,
                        'affinity': float(energy[0]),
                        'rmsd_lb': rmsd_lb,
                        'rmsd_ub': rmsd_ub
                    })

                results = {
                    'success': True,
                    'best_score': float(energies[0][0]) if len(energies) > 0 else None,
                    'scores': detailed_scores,
                    'poses_pdbqt': poses_pdbqt,
                    'num_poses': len(energies),
                    'grid_box': grid_box,
                    'parameters': params
                }

                return results

            finally:
                # Clean up receptor temp file
                if os.path.exists(receptor_path):
                    os.unlink(receptor_path)
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    def dock_with_vina_cmdline(self, receptor_pdbqt, ligand_pdbqt, grid_box, 
                              docking_params=None):
        """
        Perform docking using command-line Vina executable.
        
        Args:
            receptor_pdbqt (str): Receptor in PDBQT format
            ligand_pdbqt (str): Ligand in PDBQT format
            grid_box (dict): Grid box parameters
            docking_params (dict, optional): Docking parameters
            
        Returns:
            dict: Docking results with scores and poses
        """
        try:
            # Merge default parameters with user-provided ones
            params = {**self.default_params}
            if docking_params:
                params.update(docking_params)
            
            # Create temporary files - use NamedTemporaryFile to avoid deletion issues
            temp_dir = tempfile.mkdtemp()
            try:
                receptor_path = os.path.join(temp_dir, 'receptor.pdbqt')
                ligand_path = os.path.join(temp_dir, 'ligand.pdbqt')
                output_path = os.path.join(temp_dir, 'output.pdbqt')
                log_path = os.path.join(temp_dir, 'log.txt')
                
                # Write input files
                with open(receptor_path, 'w') as f:
                    f.write(receptor_pdbqt)
                with open(ligand_path, 'w') as f:
                    f.write(ligand_pdbqt)
                
                print(f"[DockingService] Using command-line vina: {self.vina_executable}")
                print(f"[DockingService] Working directory: {temp_dir}")
                
                # Build Vina command based on scoring function
                cmd = [self.vina_executable]

                if params['scoring'] == 'ad4':
                    # AutoDock4 forcefield requires pre-calculated affinity maps
                    gpf_path = self.generate_gpf(receptor_path, ligand_path, grid_box)
                    self.run_autogrid(gpf_path)
                    
                    maps_basename = os.path.splitext(os.path.basename(receptor_path))[0]
                    
                    cmd.extend([
                        '--ligand', ligand_path,
                        '--maps', maps_basename,
                        '--scoring', 'ad4',
                        '--out', output_path
                    ])
                else:
                    # Vina and Vinardo forcefields compute maps internally
                    cmd.extend([
                        '--receptor', receptor_path,
                        '--ligand', ligand_path,
                        '--out', output_path,
                        '--center_x', str(grid_box['center_x']),
                        '--center_y', str(grid_box['center_y']),
                        '--center_z', str(grid_box['center_z']),
                        '--size_x', str(grid_box['size_x']),
                        '--size_y', str(grid_box['size_y']),
                        '--size_z', str(grid_box['size_z'])
                    ])
                    # Add scoring if it's not the default 'vina'
                    if params['scoring'] != 'vina':
                        cmd.extend(['--scoring', params['scoring']])

                # Add common parameters
                cmd.extend([
                    '--cpu', str(params['cpu']),
                    '--exhaustiveness', str(params['exhaustiveness']),
                    '--num_modes', str(params['num_modes']),
                    '--energy_range', str(params['energy_range'])
                ])
                
                print(f"[DockingService] Running command: {' '.join(cmd)}")
                
                # Execute Vina with real-time output processing
                process = subprocess.Popen(
                    cmd, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE, 
                    text=True,
                    cwd=temp_dir  # Run in temp directory
                )
                
                # Process output in real-time
                stdout_lines = []
                stderr_lines = []
                
                # Read stdout line by line
                for line in iter(process.stdout.readline, ''):
                    stdout_lines.append(line)
                    print(f"[Vina stdout] {line.strip()}")
                
                # Read stderr line by line
                for line in iter(process.stderr.readline, ''):
                    stderr_lines.append(line)
                    print(f"[Vina stderr] {line.strip()}")
                
                # Wait for process to complete
                process.wait()
                
                # Check if process completed successfully
                if process.returncode != 0:
                    error_msg = f"Vina returned non-zero exit code {process.returncode}"
                    print(f"[DockingService] ERROR: {error_msg}")
                    print(f"[DockingService] stderr: {''.join(stderr_lines)}")
                    raise subprocess.CalledProcessError(process.returncode, cmd, output=''.join(stdout_lines), stderr=''.join(stderr_lines))

                # Combine outputs
                stdout_content = ''.join(stdout_lines)
                stderr_content = ''.join(stderr_lines)

                # Parse results
                poses_pdbqt = ""
                log_content = stdout_content
                
                # Parse scores from stdout
                parsed_results = self._parse_vina_log(log_content)
                print(f"[DockingService] Parsed {len(parsed_results)} scores from log")
                
                # Read output poses (must be done before temp_dir cleanup)
                if os.path.exists(output_path):
                    with open(output_path, 'r') as f:
                        poses_pdbqt = f.read()
                    print(f"[DockingService] Read {len(poses_pdbqt)} bytes from output file")
                else:
                    print(f"[DockingService] WARNING: Output file does not exist: {output_path}")
                
                # Ensure scores are a list of dicts as parsed
                scores_data = parsed_results if isinstance(parsed_results, list) else []
                best_score_value = scores_data[0]['affinity'] if scores_data else None
                
                # Validate that we have results
                if not scores_data or len(scores_data) == 0:
                    print(f"[DockingService] ERROR: No scores parsed from vina output!")
                    print(f"[DockingService] stdout preview: {stdout_content[:500]}")
                    return {
                        'success': False,
                        'error': 'Vina completed but returned no scores. Check grid box and ligand compatibility.',
                        'stdout': stdout_content,
                        'stderr': stderr_content
                    }
                
                if not poses_pdbqt or len(poses_pdbqt.strip()) == 0:
                    print(f"[DockingService] ERROR: No poses generated!")
                    return {
                        'success': False,
                        'error': 'Vina completed but generated no poses. Check ligand and grid box parameters.',
                        'stdout': stdout_content,
                        'stderr': stderr_content,
                        'scores': scores_data  # Still return scores if available
                    }

                result = {
                    'success': True,
                    'best_score': best_score_value,
                    'scores': scores_data,  # Return the full list of dicts
                    'poses_pdbqt': poses_pdbqt,
                    'num_poses': len(scores_data),
                    'grid_box': grid_box,
                    'parameters': params,
                    'log': log_content
                }
                
                print(f"[DockingService] Command-line docking successful: {len(scores_data)} poses, {len(poses_pdbqt)} bytes")
                return result
                
            finally:
                # Clean up temporary directory
                import shutil
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)

        except subprocess.CalledProcessError as e:
            return {
                'success': False,
                'error': f"Vina execution failed: {e.stderr}",
                'stdout': e.output,
                'stderr': e.stderr
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    def dock_with_progress(self, receptor_pdbqt, ligand_pdbqt, grid_box, 
                          docking_params=None, progress_callback=None):
        """
        Perform docking with progress updates using the best available method.
        
        Args:
            receptor_pdbqt (str): Receptor in PDBQT format
            ligand_pdbqt (str): Ligand in PDBQT format
            grid_box (dict): Grid box parameters
            docking_params (dict, optional): Docking parameters
            progress_callback (function, optional): Callback function for progress updates
            
        Returns:
            dict: Docking results with scores and poses
        """
        try:
            if progress_callback:
                progress_callback(10, "Initializing docking...")
            
            # Use API if available, otherwise fallback to command line
            if VINA_PACKAGE_AVAILABLE:
                if progress_callback:
                    progress_callback(25, "Setting up Vina API...")
                
                # Merge default parameters with user-provided ones
                params = {**self.default_params}
                if docking_params:
                    params.update(docking_params)
                
                # Initialize Vina object
                v = Vina(sf_name='vina', cpu=params['cpu'], seed=params['seed'])

                # Receptor still requires a file path for the Vina API
                with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as receptor_file:
                    receptor_file.write(receptor_pdbqt)
                    receptor_path = receptor_file.name

                try:
                    if progress_callback:
                        progress_callback(40, "Loading receptor and ligand...")

                    v.set_receptor(receptor_path)
                    # Load ligand directly from string (no temp file needed)
                    v.set_ligand_from_string(ligand_pdbqt)
                    
                    if progress_callback:
                        progress_callback(60, "Computing affinity maps...")
                    
                    # Compute affinity maps
                    center = [grid_box['center_x'], grid_box['center_y'], grid_box['center_z']]
                    box_size = [grid_box['size_x'], grid_box['size_y'], grid_box['size_z']]
                    v.compute_vina_maps(center=center, box_size=box_size)
                    
                    if progress_callback:
                        progress_callback(80, "Performing docking...")
                    
                    # Perform docking
                    v.dock(exhaustiveness=params['exhaustiveness'], n_poses=params['num_modes'])
                    
                    if progress_callback:
                        progress_callback(95, "Processing results...")
                    
                    # Get results
                    print("[DockingService] Getting energies from Vina...")
                    energies = v.energies(n_poses=params['num_modes'], energy_range=params['energy_range'])
                    print(f"[DockingService] Retrieved {len(energies)} energy scores")
                    
                    if len(energies) == 0:
                        print("[DockingService] WARNING: No energies returned from docking!")
                        return {
                            'success': False,
                            'error': 'Docking completed but returned no results. This may indicate the ligand failed to dock.',
                            'scores': [],
                            'poses_pdbqt': '',
                            'num_poses': 0
                        }
                    
                    # Use write_poses to a temporary file to get all poses
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as poses_file:
                        poses_file_path = poses_file.name
                    
                    print(f"[DockingService] Writing poses to {poses_file_path}...")
                    # Write poses to the file (must be done after file handle is closed)
                    try:
                        v.write_poses(poses_file_path, n_poses=params['num_modes'], energy_range=params['energy_range'], overwrite=True)
                    except Exception as write_error:
                        print(f"[DockingService] ERROR writing poses: {str(write_error)}")
                        raise
                    
                    # Read the poses back
                    print(f"[DockingService] Reading poses from file...")
                    with open(poses_file_path, 'r') as f:
                        poses_pdbqt = f.read()
                    
                    print(f"[DockingService] Read {len(poses_pdbqt)} bytes of PDBQT data")
                
                    # Clean up the temporary poses file
                    if os.path.exists(poses_file_path):
                        os.unlink(poses_file_path)

                    # Log the number of poses retrieved
                    num_poses_retrieved = poses_pdbqt.count('MODEL ')
                    print(f"[DockingService] Retrieved {len(energies)} scores and {num_poses_retrieved} poses.")
                    
                    if num_poses_retrieved == 0:
                        print(f"[DockingService] WARNING: No MODEL entries found in poses_pdbqt!")
                        print(f"[DockingService] First 500 chars of poses_pdbqt: {poses_pdbqt[:500]}")
                    
                    if progress_callback:
                        progress_callback(100, "Docking complete!")
                    
                    # Format results - ensure poses_pdbqt is not empty
                    if not poses_pdbqt or len(poses_pdbqt.strip()) == 0:
                        print(f"[DockingService] ERROR: poses_pdbqt is empty after docking!")
                        print(f"[DockingService] Energies count: {len(energies)}")
                        if len(energies) > 0:
                            print(f"[DockingService] First energy: {energies[0]}")
                        return {
                            'success': False,
                            'error': 'Docking completed but no poses were generated. This may indicate a problem with the ligand or grid box.',
                            'scores': [],
                            'poses_pdbqt': '',
                            'num_poses': 0
                        }
                    
                    # Format results - return scores as list of dicts for better data
                    # Frontend components handle both numbers and objects, but objects provide more info
                    # Parse RMSD values from PDBQT REMARK lines
                    rmsd_values = self._parse_rmsd_from_pdbqt(poses_pdbqt)
                    scores_data = []
                    for i, energy in enumerate(energies):
                        rmsd_lb, rmsd_ub = rmsd_values[i] if i < len(rmsd_values) else (0.0, 0.0)
                        scores_data.append({
                            'mode': i + 1,
                            'affinity': float(energy[0]),
                            'rmsd_lb': rmsd_lb,
                            'rmsd_ub': rmsd_ub
                        })

                    results = {
                        'success': True,
                        'best_score': float(energies[0][0]) if len(energies) > 0 else None,
                        'scores': scores_data,
                        'poses': scores_data,  # Add poses alias for frontend compatibility
                        'poses_pdbqt': poses_pdbqt,
                        'num_poses': len(energies),
                        'grid_box': grid_box,
                        'parameters': params
                    }
                    
                    print(f"[DockingService] Returning results: {len(energies)} scores, {len(poses_pdbqt)} bytes of poses")
                    return results
                    
                finally:
                    # Clean up receptor temp file
                    if os.path.exists(receptor_path):
                        os.unlink(receptor_path)
            
            else:
                # Fallback to command line method with progress updates
                if progress_callback:
                    progress_callback(50, "Using command-line Vina...")
                
                cmdline_results = self.dock_with_vina_cmdline(receptor_pdbqt, ligand_pdbqt, grid_box, docking_params)
                
                # Convert scores from list of dicts to list of numbers for consistency
                if cmdline_results.get('success') and cmdline_results.get('scores'):
                    scores_data = cmdline_results['scores']
                    if isinstance(scores_data, list) and len(scores_data) > 0:
                        if isinstance(scores_data[0], dict):
                            # Convert list of dicts to list of numbers
                            cmdline_results['scores'] = [float(score.get('affinity', 0)) for score in scores_data]
                        # If already numbers, keep as is
                
                if progress_callback:
                    progress_callback(100, "Docking complete!")
                
                return cmdline_results
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    def _clean_receptor_pdbqt(self, pdbqt_data):
        """Clean PDBQT data for receptor use by removing ligand-specific tags."""
        
        skip_tags = {'ROOT', 'ENDROOT', 'BRANCH', 'ENDBRANCH', 'TORSDOF'}
        lines = pdbqt_data.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Skip lines that start with ligand-specific tags
            if line.strip() and not any(line.strip().startswith(tag) for tag in skip_tags):
                cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def convert_pdbqt_poses_to_sdf_meeko(self, poses_pdbqt: str) -> str:
        """
        Convert PDBQT docking poses to SDF format using Meeko.

        Meeko preserves bond orders from the original ligand topology stored in
        the PDBQT torsion tree, producing more accurate SDF output than OpenBabel's
        bond inference approach.

        Args:
            poses_pdbqt: Multi-model PDBQT string from docking

        Returns:
            Multi-molecule SDF string with proper bond orders
        """
        if not MEEKO_AVAILABLE or not RDKIT_AVAILABLE:
            return ""

        try:
            poses = self._parse_pdbqt_models(poses_pdbqt)
            print(f"[DockingService] Converting {len(poses)} poses to SDF using Meeko")

            sdf_blocks = []
            for i, pose_pdbqt in enumerate(poses):
                try:
                    pdbqt_mol = PDBQTMolecule(pose_pdbqt, is_dlg=False, skip_typing=True)
                    for pose in pdbqt_mol:
                        result = RDKitMolCreate.from_pdbqt_mol(pose)
                        # from_pdbqt_mol returns a list in meeko 0.7+
                        if isinstance(result, list):
                            rd_mol = next((m for m in result if m is not None), None)
                        else:
                            rd_mol = result
                        if rd_mol is None:
                            continue
                        # Use first successfully converted molecule
                        sdf_block = Chem.MolToMolBlock(rd_mol)
                        if sdf_block and sdf_block.strip():
                            sdf_blocks.append(sdf_block.rstrip())
                        break  # Only take first pose from each model
                except Exception as e:
                    print(f"[DockingService] Meeko SDF conversion failed for pose {i+1}: {e}")
                    continue

            if sdf_blocks:
                result = '\n$$$$\n'.join(sdf_blocks) + '\n$$$$\n'
                print(f"[DockingService] Successfully converted {len(sdf_blocks)} poses to SDF via Meeko")
                return result
            return ""
        except Exception as e:
            print(f"[DockingService] Error in convert_pdbqt_poses_to_sdf_meeko: {e}")
            return ""

    def convert_pdbqt_poses_to_pdb_meeko(self, poses_pdbqt: str) -> str:
        """
        Convert PDBQT docking poses to PDB format using Meeko + RDKit.

        Args:
            poses_pdbqt: Multi-model PDBQT string from docking

        Returns:
            Multi-model PDB string with proper element symbols
        """
        if not MEEKO_AVAILABLE or not RDKIT_AVAILABLE:
            return ""

        try:
            poses = self._parse_pdbqt_models(poses_pdbqt)
            print(f"[DockingService] Converting {len(poses)} poses to PDB using Meeko")

            pdb_blocks = []
            for i, pose_pdbqt in enumerate(poses):
                try:
                    pdbqt_mol = PDBQTMolecule(pose_pdbqt, is_dlg=False, skip_typing=True)
                    for pose in pdbqt_mol:
                        result = RDKitMolCreate.from_pdbqt_mol(pose)
                        # from_pdbqt_mol returns a list in meeko 0.7+
                        if isinstance(result, list):
                            rd_mol = next((m for m in result if m is not None), None)
                        else:
                            rd_mol = result
                        if rd_mol is None:
                            continue
                        pdb_block = Chem.MolToPDBBlock(rd_mol)
                        if pdb_block and pdb_block.strip():
                            # Clean up and wrap in MODEL/ENDMDL
                            pdb_block = pdb_block.rstrip()
                            if pdb_block.endswith('END'):
                                pdb_block = pdb_block[:-3].rstrip()
                            # Convert ATOM to HETATM for ligand atoms (Mol* expects HETATM)
                            lines = []
                            for line in pdb_block.split('\n'):
                                if line.startswith('ATOM  '):
                                    line = 'HETATM' + line[6:]
                                lines.append(line)
                            model_block = f"MODEL     {i+1:4d}\n" + '\n'.join(lines) + "\nENDMDL"
                            pdb_blocks.append(model_block)
                        break
                except Exception as e:
                    print(f"[DockingService] Meeko PDB conversion failed for pose {i+1}: {e}")
                    continue

            if pdb_blocks:
                result = '\n'.join(pdb_blocks) + '\nEND\n'
                print(f"[DockingService] Successfully converted {len(pdb_blocks)} poses to PDB via Meeko")
                return result
            return ""
        except Exception as e:
            print(f"[DockingService] Error in convert_pdbqt_poses_to_pdb_meeko: {e}")
            return ""

    def convert_pdbqt_poses_to_sdf(self, poses_pdbqt: str, template_mol_block: str) -> str:
        """
        Convert PDBQT docking poses to SDF format.

        Prefers Meeko (preserves bond orders from torsion tree) and falls back
        to OpenBabel if Meeko is unavailable or fails.

        Args:
            poses_pdbqt: Multi-model PDBQT string from docking
            template_mol_block: Original ligand in MOL/SDF format (kept for API compatibility)

        Returns:
            Multi-molecule SDF string with proper bond orders
        """
        # Try Meeko first (preserves bond orders)
        if MEEKO_AVAILABLE and RDKIT_AVAILABLE:
            result = self.convert_pdbqt_poses_to_sdf_meeko(poses_pdbqt)
            if result:
                return result
            print("[DockingService] Meeko SDF conversion failed, falling back to OpenBabel")

        return self.convert_pdbqt_poses_to_sdf_obabel(poses_pdbqt)
    
    def _parse_pdbqt_models(self, pdbqt_data: str) -> List[str]:
        """Parse multi-model PDBQT into individual pose strings."""
        poses = []
        lines = pdbqt_data.strip().split('\n')
        current_pose = []
        in_model = False
        
        for line in lines:
            if line.startswith('MODEL'):
                in_model = True
                current_pose = []
            elif line.startswith('ENDMDL'):
                if current_pose:
                    poses.append('\n'.join(current_pose))
                in_model = False
                current_pose = []
            elif in_model:
                current_pose.append(line)
        
        # If no MODEL/ENDMDL tags, treat entire content as one pose
        if not poses and lines:
            poses.append(pdbqt_data)
        
        return poses
    
    def convert_pdbqt_poses_to_sdf_obabel(self, poses_pdbqt: str) -> str:
        """
        Convert PDBQT docking poses to SDF format using Open Babel.
        
        This is a fallback method when no template molecule is available.
        Open Babel can infer bonds from atom distances and chemistry rules.
        
        Args:
            poses_pdbqt: Multi-model PDBQT string from docking
            
        Returns:
            Multi-molecule SDF string
        """
        if not OPENBABEL_AVAILABLE:
            print("[DockingService] Open Babel not available, cannot convert PDBQT to SDF")
            return ""
        
        try:
            # Parse PDBQT poses
            poses = self._parse_pdbqt_models(poses_pdbqt)
            print(f"[DockingService] Converting {len(poses)} poses to SDF using Open Babel")
            
            sdf_blocks = []
            for i, pose_pdbqt in enumerate(poses):
                try:
                    # Create a temporary file with the pose PDBQT
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as f:
                        # Add ATOM records for proper parsing
                        f.write(pose_pdbqt)
                        temp_pdbqt = f.name
                    
                    try:
                        # Read PDBQT with pybel
                        mol = next(pybel.readfile('pdbqt', temp_pdbqt))
                        
                        # Add hydrogens if missing and perceive bonds
                        # Note: OBMol.PerceiveBondOrders() may help with bond orders
                        
                        # Convert to SDF format
                        sdf_block = mol.write('sdf')
                        if sdf_block and sdf_block.strip():
                            # Remove trailing $$$$ if present (we'll add it between molecules)
                            sdf_block = sdf_block.rstrip()
                            if sdf_block.endswith('$$$$'):
                                sdf_block = sdf_block[:-4].rstrip()
                            sdf_blocks.append(sdf_block)
                            
                    finally:
                        # Clean up temp file
                        if os.path.exists(temp_pdbqt):
                            os.unlink(temp_pdbqt)
                            
                except Exception as e:
                    print(f"[DockingService] Error converting pose {i+1} with Open Babel: {e}")
                    continue
            
            # Combine into multi-molecule SDF
            if sdf_blocks:
                result = '\n$$$$\n'.join(sdf_blocks) + '\n$$$$\n'
                print(f"[DockingService] Successfully converted {len(sdf_blocks)} poses to SDF via Open Babel")
                return result
            else:
                print("[DockingService] No poses could be converted to SDF via Open Babel")
                return ""
                
        except Exception as e:
            print(f"[DockingService] Error in convert_pdbqt_poses_to_sdf_obabel: {e}")
            traceback.print_exc()
            return ""

    def convert_pdbqt_poses_to_pdb(self, poses_pdbqt: str) -> str:
        """
        Convert PDBQT docking poses to PDB format.

        Prefers Meeko + RDKit (preserves bond orders) and falls back to Open Babel.

        Args:
            poses_pdbqt: Multi-model PDBQT string from docking

        Returns:
            Multi-model PDB string with proper element symbols
        """
        # Try Meeko first
        if MEEKO_AVAILABLE and RDKIT_AVAILABLE:
            result = self.convert_pdbqt_poses_to_pdb_meeko(poses_pdbqt)
            if result:
                return result
            print("[DockingService] Meeko PDB conversion failed, falling back to OpenBabel")

        if not OPENBABEL_AVAILABLE:
            print("[DockingService] Open Babel not available, cannot convert PDBQT to PDB")
            return ""
        
        try:
            # Parse PDBQT poses
            poses = self._parse_pdbqt_models(poses_pdbqt)
            print(f"[DockingService] Converting {len(poses)} poses to PDB using Open Babel")
            
            pdb_blocks = []
            for i, pose_pdbqt in enumerate(poses):
                try:
                    # Create a temporary file with the pose PDBQT
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as f:
                        f.write(pose_pdbqt)
                        temp_pdbqt = f.name
                    
                    try:
                        # Read PDBQT with pybel
                        mol = next(pybel.readfile('pdbqt', temp_pdbqt))
                        
                        # Convert to PDB format
                        # OpenBabel will properly set element symbols from AutoDock atom types
                        pdb_block = mol.write('pdb')
                        if pdb_block and pdb_block.strip():
                            # Clean up the PDB block - remove END and extra whitespace
                            pdb_block = pdb_block.rstrip()
                            # Remove trailing END if present (we'll add it at the very end)
                            if pdb_block.endswith('END'):
                                pdb_block = pdb_block[:-3].rstrip()
                            
                            # Add MODEL/ENDMDL tags for multi-pose output
                            model_block = f"MODEL     {i+1:4d}\n{pdb_block}\nENDMDL"
                            pdb_blocks.append(model_block)
                            
                    finally:
                        # Clean up temp file
                        if os.path.exists(temp_pdbqt):
                            os.unlink(temp_pdbqt)
                            
                except Exception as e:
                    print(f"[DockingService] Error converting pose {i+1} to PDB with Open Babel: {e}")
                    continue
            
            # Combine into multi-model PDB
            if pdb_blocks:
                result = '\n'.join(pdb_blocks) + '\nEND\n'
                print(f"[DockingService] Successfully converted {len(pdb_blocks)} poses to PDB via Open Babel")
                return result
            else:
                print("[DockingService] No poses could be converted to PDB via Open Babel")
                return ""
                
        except Exception as e:
            print(f"[DockingService] Error in convert_pdbqt_poses_to_pdb: {e}")
            traceback.print_exc()
            return ""

    def convert_pdbqt_single_pose_to_pdb(self, pose_pdbqt: str, pose_number: int = 1) -> str:
        """
        Convert a single PDBQT pose to PDB format using Open Babel.
        
        This is useful for converting individual poses for visualization.
        
        Args:
            pose_pdbqt: Single pose PDBQT string (without MODEL/ENDMDL tags)
            pose_number: Pose number for labeling
            
        Returns:
            PDB string with proper element symbols and HETATM records for ligands
        """
        if not OPENBABEL_AVAILABLE:
            print("[DockingService] Open Babel not available, cannot convert PDBQT to PDB")
            return ""
        
        try:
            # Create a temporary file with the pose PDBQT
            with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as f:
                f.write(pose_pdbqt)
                temp_pdbqt = f.name
            
            try:
                # Read PDBQT with pybel
                mol = next(pybel.readfile('pdbqt', temp_pdbqt))
                
                # Convert to PDB format
                pdb_block = mol.write('pdb')
                if pdb_block and pdb_block.strip():
                    # Clean up the PDB block
                    pdb_block = pdb_block.rstrip()
                    if pdb_block.endswith('END'):
                        pdb_block = pdb_block[:-3].rstrip()
                    
                    # Convert ATOM to HETATM for ligand atoms (Mol* expects HETATM for ligands)
                    lines = []
                    for line in pdb_block.split('\n'):
                        if line.startswith('ATOM  '):
                            line = 'HETATM' + line[6:]
                        lines.append(line)
                    
                    return '\n'.join(lines) + '\nEND\n'
                    
            finally:
                # Clean up temp file
                if os.path.exists(temp_pdbqt):
                    os.unlink(temp_pdbqt)
                    
            return ""
                
        except Exception as e:
            print(f"[DockingService] Error converting single pose to PDB: {e}")
            traceback.print_exc()
            return ""
    
    def _extract_coords_from_pdbqt(self, pdbqt_data: str) -> List[tuple]:
        """Extract atom coordinates from PDBQT data."""
        coords = []
        for line in pdbqt_data.split('\n'):
            if line.startswith('ATOM') or line.startswith('HETATM'):
                try:
                    # PDB/PDBQT format: columns 31-38 (x), 39-46 (y), 47-54 (z)
                    x = float(line[30:38].strip())
                    y = float(line[38:46].strip())
                    z = float(line[46:54].strip())
                    coords.append((x, y, z))
                except (ValueError, IndexError):
                    continue
        return coords
    
    def _parse_vina_log(self, log_content):
        """Parse Vina log file to extract binding scores, RMSD, and other data."""
        results = []
        lines = log_content.split('\n')
        
        parsing = False
        skip_next = False  # Skip the units line after header
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            
            # Detect the start of the results table
            # Vina 1.2.x format has header split across two lines:
            # "mode |   affinity | dist from best mode"
            # "| (kcal/mol) | rmsd l.b.| rmsd u.b."
            if 'mode |' in line_stripped and 'affinity' in line_stripped:
                parsing = True
                skip_next = True  # Next line is the units line
                continue
            
            # Skip the units line (second header line)
            if skip_next:
                skip_next = False
                continue
            
            # Skip separator line
            if parsing and line_stripped.startswith('-----'):
                continue
                
            if parsing and line_stripped:
                parts = line_stripped.split()
                # Check if this looks like a data line (starts with a number)
                if len(parts) >= 4 and parts[0].isdigit():
                    try:
                        mode_info = {
                            'mode': int(parts[0]),
                            'affinity': float(parts[1]),
                            'rmsd_lb': float(parts[2]),
                            'rmsd_ub': float(parts[3])
                        }
                        results.append(mode_info)
                    except (ValueError, IndexError) as e:
                        # If we've already parsed some results and hit an error, stop
                        if results:
                            print(f"[DockingService] Stopped parsing at line {i+1}: {line_stripped[:100]} (error: {e})")
                            break
                        # Otherwise, this might not be a data line yet
                        parsing = False
                elif results:
                    # If we've parsed results and hit a non-data line, we're done
                    break
                else:
                    # If no results yet and this isn't a data line, might not be in table yet
                    pass
            
        print(f"[DockingService] Parsed {len(results)} scores from log")
        if len(results) > 0:
            print(f"[DockingService] First score: mode={results[0]['mode']}, affinity={results[0]['affinity']}")
        
        return results
    
    def _parse_rmsd_from_pdbqt(self, poses_pdbqt):
        """Parse RMSD values from PDBQT poses string.
        
        Vina embeds RMSD data in REMARK lines within the PDBQT output:
        REMARK VINA RESULT:    -9.4      0.000      0.000
        (fields: affinity, rmsd_lb, rmsd_ub)
        
        Args:
            poses_pdbqt (str): PDBQT string containing one or more poses
            
        Returns:
            list: List of (rmsd_lb, rmsd_ub) tuples, one per pose
        """
        rmsd_values = []
        if not poses_pdbqt:
            return rmsd_values
        
        for line in poses_pdbqt.split('\n'):
            if line.startswith('REMARK VINA RESULT:'):
                parts = line.split()
                if len(parts) >= 5:
                    try:
                        rmsd_lb = float(parts[3])
                        rmsd_ub = float(parts[4])
                        rmsd_values.append((rmsd_lb, rmsd_ub))
                    except (ValueError, IndexError):
                        rmsd_values.append((0.0, 0.0))
        
        return rmsd_values
    
    def dock(self, receptor_pdbqt, ligand_pdbqt, grid_box, docking_params=None, 
             use_api=None):
        """
        Perform molecular docking using the best available method.
        
        Args:
            receptor_pdbqt (str): Receptor in PDBQT format
            ligand_pdbqt (str): Ligand in PDBQT format
            grid_box (dict): Grid box parameters
            docking_params (dict, optional): Docking parameters
            use_api (bool, optional): Force API or command-line usage
            
        Returns:
            dict: Docking results
        """
        # Determine which method to use
        if use_api is None:
            use_api = VINA_PACKAGE_AVAILABLE
        elif use_api and not VINA_PACKAGE_AVAILABLE:
            raise ImportError("Vina API requested but not available")
        
        if use_api:
            result = self.dock_with_vina_api(receptor_pdbqt, ligand_pdbqt, grid_box, docking_params)
            if result.get('success'):
                return result
            
            # If API failed, try falling back to command line
            print(f"[DockingService] Vina API failed: {result.get('error')}. Falling back to command line.")
            return self.dock_with_vina_cmdline(receptor_pdbqt, ligand_pdbqt, grid_box, docking_params)
        else:
            return self.dock_with_vina_cmdline(receptor_pdbqt, ligand_pdbqt, grid_box, docking_params)
    
    def dock_batch_with_map_reuse(self, receptor_pdbqt: str, ligand_pdbqts: List[str],
                                   grid_box: Dict, docking_params: Optional[Dict] = None) -> List[Dict]:
        """
        Dock multiple ligands reusing a single set of affinity maps.

        Computes the receptor maps once and reuses them for all ligands,
        significantly speeding up batch docking.

        Args:
            receptor_pdbqt: Receptor in PDBQT format
            ligand_pdbqts: List of ligand PDBQT strings
            grid_box: Grid box parameters
            docking_params: Optional docking parameters

        Returns:
            List of docking result dicts (one per ligand)
        """
        if not VINA_PACKAGE_AVAILABLE:
            raise ImportError("Vina Python API required for batch map reuse")

        params = {**self.default_params}
        if docking_params:
            params.update(docking_params)

        # Write receptor to temp file (Vina API requires file path)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as receptor_file:
            receptor_file.write(receptor_pdbqt)
            receptor_path = receptor_file.name

        try:
            # Create Vina instance and compute maps once
            v = Vina(sf_name='vina', cpu=params['cpu'], seed=params['seed'])
            v.set_receptor(receptor_path)

            center = [grid_box['center_x'], grid_box['center_y'], grid_box['center_z']]
            box_size = [grid_box['size_x'], grid_box['size_y'], grid_box['size_z']]
            v.compute_vina_maps(center=center, box_size=box_size)
            print(f"[DockingService] Affinity maps computed once for {len(ligand_pdbqts)} ligands")

            results = []
            for i, ligand_pdbqt in enumerate(ligand_pdbqts):
                try:
                    v.set_ligand_from_string(ligand_pdbqt)
                    v.dock(exhaustiveness=params['exhaustiveness'], n_poses=params['num_modes'])

                    energies = v.energies(n_poses=params['num_modes'])
                    poses_pdbqt = v.poses(n_poses=params['num_modes'])
                    
                    # Parse RMSD values from PDBQT REMARK lines
                    rmsd_values = self._parse_rmsd_from_pdbqt(poses_pdbqt)

                    scores_data = []
                    for j, energy in enumerate(energies):
                        rmsd_lb, rmsd_ub = rmsd_values[j] if j < len(rmsd_values) else (0.0, 0.0)
                        scores_data.append({
                            'mode': j + 1,
                            'affinity': float(energy[0]),
                            'rmsd_lb': rmsd_lb,
                            'rmsd_ub': rmsd_ub
                        })

                    results.append({
                        'success': True,
                        'best_score': float(energies[0][0]) if len(energies) > 0 else None,
                        'scores': scores_data,
                        'poses_pdbqt': poses_pdbqt,
                        'num_poses': len(energies),
                        'grid_box': grid_box,
                        'parameters': params
                    })
                    print(f"[DockingService] Ligand {i+1}/{len(ligand_pdbqts)} docked: {scores_data[0]['affinity']:.2f} kcal/mol")

                except Exception as e:
                    print(f"[DockingService] Ligand {i+1}/{len(ligand_pdbqts)} failed: {e}")
                    results.append({
                        'success': False,
                        'error': str(e),
                    })

            return results

        finally:
            if os.path.exists(receptor_path):
                os.unlink(receptor_path)

    def analyze_results(self, docking_results):
        """
        Analyze docking results and provide interpretation.

        Args:
            docking_results (dict): Results from docking

        Returns:
            dict: Analysis and interpretation
        """
        if not docking_results.get('success', False):
            return {'error': 'Cannot analyze failed docking results'}
        
        parsed_results = docking_results.get('scores', [])
        if not parsed_results:
            return {'error': 'No scores available for analysis'}

        # Extract affinity scores, supporting both dicts and floats
        if isinstance(parsed_results[0], dict):
            affinity_scores = [result['affinity'] for result in parsed_results]
        else:
            affinity_scores = [float(val) for val in parsed_results]
        
        best_score = min(affinity_scores)
        worst_score = max(affinity_scores)
        mean_score = np.mean(affinity_scores)
        std_score = np.std(affinity_scores)
        
        # Interpret binding strength (rough guidelines)
        if best_score <= -10.0:
            binding_strength = "Very Strong"
        elif best_score <= -8.0:
            binding_strength = "Strong"
        elif best_score <= -6.0:
            binding_strength = "Moderate"
        elif best_score <= -4.0:
            binding_strength = "Weak"
        else:
            binding_strength = "Very Weak"
        
        # Check for convergence (similar top poses)
        convergence = "Good" if len(affinity_scores) > 1 and abs(affinity_scores[0] - affinity_scores[1]) < 1.0 else "Poor"
        
        analysis = {
            'best_score': best_score,
            'worst_score': worst_score,
            'mean_score': mean_score,
            'std_score': std_score,
            'binding_strength': binding_strength,
            'convergence': convergence,
            'num_poses': len(affinity_scores),
            'score_range': worst_score - best_score,
            'interpretation': {
                'binding_affinity': f"Predicted binding affinity: {best_score:.2f} kcal/mol",
                'strength': f"Binding strength: {binding_strength}",
                'reliability': f"Convergence: {convergence}",
                'diversity': f"Pose diversity: {len(affinity_scores)} poses with {worst_score - best_score:.2f} kcal/mol range"
            }
        }

        return analysis

    def validate_redocking(self, complex_pdb: str, ligand_resname: Optional[str] = None,
                           exhaustiveness: int = 32) -> Dict[str, Any]:
        """
        Validate the docking pipeline by redocking a co-crystallized ligand.

        Extracts the ligand from the complex, separates the protein, docks the
        ligand back, and computes RMSD between the docked and crystal poses.
        An RMSD < 2.0 A indicates successful reproduction of the binding mode.

        Args:
            complex_pdb: PDB data containing protein + co-crystallized ligand
            ligand_resname: Specific ligand residue name (auto-detected if None)
            exhaustiveness: Docking exhaustiveness (default 32)

        Returns:
            Dict with rmsd, success (rmsd < 2.0), best_affinity, scores, message
        """
        if not RDKIT_AVAILABLE:
            return {'success': False, 'error': 'RDKit required for redocking validation'}

        try:
            # 1. Parse complex and identify components
            structure = self.pdb_parser.parse_string(complex_pdb, "complex")
            components = self.component_analyzer.identify_components(structure)

            ligand_residues = components.get('ligands', [])
            if ligand_resname:
                ligand_residues = [r for r in ligand_residues if r.get_resname().strip() == ligand_resname]

            if not ligand_residues:
                return {'success': False, 'error': f'No ligand found{" with resname " + ligand_resname if ligand_resname else ""}'}

            # Use the first (or specified) ligand
            target_resname = ligand_residues[0].get_resname().strip()
            print(f"[DockingService] Redocking validation for ligand: {target_resname}")

            # 2. Separate protein-only PDB (exclude the target ligand HETATM lines)
            protein_lines = []
            ligand_lines = []
            for line in complex_pdb.split('\n'):
                if line.startswith(('ATOM', 'HETATM')):
                    resname = line[17:20].strip()
                    if line.startswith('HETATM') and resname == target_resname:
                        ligand_lines.append(line)
                    else:
                        protein_lines.append(line)
                elif line.startswith(('TER', 'END', 'MODEL', 'ENDMDL')):
                    protein_lines.append(line)

            protein_pdb = '\n'.join(protein_lines) + '\nEND\n'
            ligand_pdb = '\n'.join(ligand_lines) + '\nEND\n'

            # 3. Parse crystal ligand with RDKit for reference RMSD
            crystal_mol = Chem.MolFromPDBBlock(ligand_pdb, removeHs=True, sanitize=True)
            if crystal_mol is None:
                return {'success': False, 'error': 'Failed to parse crystal ligand with RDKit'}

            # 4. Calculate grid box from crystal ligand position
            grid_box = self.calculate_grid_box(complex_pdb, ligand_resname=target_resname, padding=5.0)

            # 5. Prepare receptor and ligand PDBQT
            receptor_pdbqt = self.prepare_receptor_pdbqt(protein_pdb)
            ligand_pdbqt = self.prepare_ligand_pdbqt(ligand_pdb, input_format='pdb')

            # 6. Dock
            docking_params = {
                'exhaustiveness': exhaustiveness,
                'num_modes': 10,
                'energy_range': 100.0,
            }
            dock_result = self.dock(receptor_pdbqt, ligand_pdbqt, grid_box, docking_params)

            if not dock_result.get('success'):
                return {'success': False, 'error': f'Docking failed: {dock_result.get("error")}'}

            # 7. Convert best pose back to RDKit mol
            poses_pdbqt = dock_result.get('poses_pdbqt', '')
            poses = self._parse_pdbqt_models(poses_pdbqt)
            if not poses:
                return {'success': False, 'error': 'No poses generated from docking'}

            docked_mol = None

            # Try Meeko conversion first (preserves bond orders)
            if MEEKO_AVAILABLE:
                try:
                    pdbqt_mol = PDBQTMolecule(poses[0], is_dlg=False, skip_typing=True)
                    for pose in pdbqt_mol:
                        result = RDKitMolCreate.from_pdbqt_mol(pose)
                        # from_pdbqt_mol returns a list of mols in meeko 0.7+
                        if isinstance(result, list):
                            for mol in result:
                                if mol is not None:
                                    docked_mol = mol
                                    break
                        elif result is not None:
                            docked_mol = result
                        if docked_mol is not None:
                            break
                except Exception as e:
                    print(f"[DockingService] Meeko pose conversion failed: {e}")

            # Fallback: convert PDBQT → PDB via OpenBabel, then parse with RDKit
            if docked_mol is None and OPENBABEL_AVAILABLE:
                try:
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.pdbqt', delete=False) as f:
                        f.write(poses[0])
                        tmp_pdbqt = f.name
                    try:
                        ob_mol = next(pybel.readfile('pdbqt', tmp_pdbqt))
                        pdb_block = ob_mol.write('pdb')
                        docked_mol = Chem.MolFromPDBBlock(pdb_block, removeHs=True, sanitize=False)
                        if docked_mol is not None:
                            try:
                                Chem.SanitizeMol(docked_mol)
                            except Exception:
                                pass  # Keep unsanitized mol for coordinate comparison
                            print("[DockingService] Converted docked pose via OpenBabel fallback")
                    finally:
                        if os.path.exists(tmp_pdbqt):
                            os.unlink(tmp_pdbqt)
                except Exception as e:
                    print(f"[DockingService] OpenBabel pose conversion also failed: {e}")

            if docked_mol is None:
                return {'success': False, 'error': 'Failed to convert docked pose to RDKit mol (neither Meeko nor OpenBabel succeeded)'}

            # Remove Hs for RMSD comparison (match crystal_mol which has no Hs)
            docked_mol_noH = Chem.RemoveHs(docked_mol)

            # 8. Calculate symmetry-corrected RMSD
            try:
                rmsd = rdMolAlign.CalcRMS(docked_mol_noH, crystal_mol)
            except Exception as e:
                # If symmetry-corrected fails, try basic RMSD
                print(f"[DockingService] Symmetry-corrected RMSD failed ({e}), trying basic alignment")
                try:
                    rmsd = rdMolAlign.AlignMol(docked_mol_noH, crystal_mol)
                except Exception as e2:
                    return {'success': False, 'error': f'RMSD calculation failed: {e2}'}

            best_affinity = dock_result.get('best_score', 0)
            passed = rmsd < 2.0

            message = (
                f"Redocking RMSD: {rmsd:.2f} A "
                f"({'PASS' if passed else 'FAIL'} - threshold 2.0 A). "
                f"Best affinity: {best_affinity:.2f} kcal/mol."
            )
            print(f"[DockingService] {message}")

            return {
                'success': True,
                'passed': passed,
                'rmsd': round(rmsd, 3),
                'best_affinity': best_affinity,
                'scores': dock_result.get('scores', []),
                'ligand_resname': target_resname,
                'grid_box': grid_box,
                'message': message,
            }

        except Exception as e:
            return {'success': False, 'error': f'Redocking validation error: {str(e)}'}
