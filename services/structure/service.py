"""Structure service business logic."""
import os
import traceback
from typing import Dict, Any, Optional, List
from rdkit import Chem
from rdkit.Chem import Descriptors, AllChem
from io import StringIO

# Conditional Bio import
try:
    from Bio.PDB import PDBParser, PDBIO, Select
    BIO_AVAILABLE = True
except ImportError:
    BIO_AVAILABLE = False
    PDBParser = None
    PDBIO = None
    Select = None

from services.structure.pdb_service import PDBService
from services.structure.hetid_service import HETIDService
from services.structure.processor import StructureProcessor
from lib.common.utils import allowed_file, ensure_upload_dir, secure_filename, convert_numpy_types
from lib.chemistry import get_ligand_preparer
from lib.structure.validator import validate_structure_for_service, StructureValidationError

# Initialize services
pdb_service = PDBService()
hetid_service = HETIDService()
structure_processor = StructureProcessor()

# In-memory storage (will be moved to service instance)
molecules: Dict[int, Dict[str, Any]] = {}
molecule_counter = 0


class StructureService:
    """Service for structure processing operations."""
    
    def __init__(self):
        """Initialize structure service."""
        ensure_upload_dir()
        self.molecules = {}
        self.molecule_counter = 0
    
    def smiles_to_3d(self, smiles: str) -> Dict[str, Any]:
        """Convert SMILES to 3D structure."""
        if not smiles:
            raise ValueError("SMILES string cannot be empty")
        
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Invalid SMILES string provided")
        
        mol = Chem.AddHs(mol)
        AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
        
        sdf_data = Chem.MolToMolBlock(mol, confId=0)
        pdb_data = Chem.MolToPDBBlock(mol)
        
        return {
            "sdf_data": sdf_data,
            "pdb_data": pdb_data,
            "format": "sdf"
        }
    
    def smiles_to_mol(self, smiles: str) -> Dict[str, Any]:
        """Convert SMILES to Molfile."""
        if not smiles:
            raise ValueError("SMILES string cannot be empty")
        
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Invalid SMILES string")
        
        AllChem.Compute2DCoords(mol)
        molfile = Chem.MolToMolBlock(mol, confId=0)
        
        return {"molfile": molfile}
    
    def upload_smiles(self, smiles: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload and process SMILES string."""
        if not smiles:
            raise ValueError("SMILES string cannot be empty")
        
        molecule_name = name or f"SMILES_molecule_{smiles[:10]}"
        
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Invalid SMILES string")
        
        mol = Chem.AddHs(mol)
        AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
        AllChem.MMFFOptimizeMolecule(mol)
        
        sdf_data = Chem.MolToMolBlock(mol, confId=0)
        pdb_data = Chem.MolToPDBBlock(mol)
        
        processed_data = structure_processor.process_structure(pdb_data)
        canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
        
        # Save to library
        library_save_result = self._save_molecule_to_library(
            name=molecule_name,
            smiles=smiles,
            canonical_smiles=canonical_smiles,
            molfile=sdf_data,
            source='smiles_upload'
        )
        
        result = {
            "structure_id": molecule_name,
            "format": "sdf",
            "sdf_data": sdf_data,
            "pdb_data": pdb_data,
            "components": processed_data['components'],
            "smiles": smiles,
            "source": "smiles_upload",
            "library_save": library_save_result
        }
        
        # SMILES are always small molecules
        result['structure_type'] = 'small_molecule'
        
        return result
    
    def fetch_pdb(self, pdb_id: str) -> Dict[str, Any]:
        """Fetch structure from PDB."""
        pdb_id = pdb_id.strip().lower()
        if not pdb_id:
            raise ValueError("PDB ID cannot be empty")
        
        structure_data = pdb_service.fetch_structure(pdb_id)
        processed_data = structure_processor.process_structure_with_ligands(
            structure_data['pdb_data'],
            clean_protein=False,
            include_2d_images=True,
            target_pdb_id=pdb_id,
            target_structure_id=structure_data['structure_id']
        )
        
        result = {
            "structure_id": structure_data['structure_id'],
            "format": structure_data['format'],
            "metadata": structure_data['metadata'],
            "pdb_data": processed_data['processed_structure'],
            "components": processed_data['components'],
            "ligands": processed_data.get('ligands', {})
        }
        
        # Detect structure type (PDB structures are typically proteins)
        try:
            from lib.structure.validator import detect_structure_type
            structure_type = detect_structure_type(
                result['pdb_data'],
                format_hint='pdb'
            )
            result['structure_type'] = structure_type
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not detect structure type: {e}")
            result['structure_type'] = 'protein'  # Default for PDB
        
        # Convert numpy types to native Python types for JSON serialization
        return convert_numpy_types(result)
    
    def fetch_hetid(self, het_id: str) -> Dict[str, Any]:
        """Fetch structure from PDB database containing a specific HET ID (ligand)."""
        het_id = het_id.strip().upper()
        if not het_id:
            raise ValueError("HET ID cannot be empty")
        
        # Search PDB database for structures containing this HET ID
        best_pdb_id = hetid_service.get_best_structure_for_hetid(het_id)
        
        # Fetch the structure using the found PDB ID
        structure_data = pdb_service.fetch_structure(best_pdb_id)
        processed_data = structure_processor.process_structure_with_ligands(
            structure_data['pdb_data'],
            clean_protein=False,
            include_2d_images=True,
            target_pdb_id=best_pdb_id,
            target_structure_id=structure_data['structure_id']
        )
        
        result = {
            "structure_id": structure_data['structure_id'],
            "format": structure_data['format'],
            "metadata": structure_data['metadata'],
            "pdb_data": processed_data['processed_structure'],
            "components": processed_data['components'],
            "ligands": processed_data.get('ligands', {}),
            "source_het_id": het_id,
            "source_pdb_id": best_pdb_id
        }
        
        # Detect structure type (PDB structures are typically proteins)
        try:
            from lib.structure.validator import detect_structure_type
            structure_type = detect_structure_type(
                result['pdb_data'],
                format_hint='pdb'
            )
            result['structure_type'] = structure_type
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not detect structure type: {e}")
            result['structure_type'] = 'protein'  # Default for PDB
        
        # Convert numpy types to native Python types for JSON serialization
        return convert_numpy_types(result)
    
    def upload_structure_file(self, file_content: str, filename: str) -> Dict[str, Any]:
        """Upload and process structure file."""
        if not allowed_file(filename):
            raise ValueError(f"Invalid file format. Allowed: {', '.join(['pdb', 'cif', 'mmcif', 'sdf'])}")
        
        filename = secure_filename(filename)
        file_ext = os.path.splitext(filename)[1].lower().lstrip('.')
        
        # Process the file
        if file_ext == 'sdf':
            result = self._process_sdf_file(file_content, filename)
        else:
            result = self._process_pdb_file(file_content, filename)
        
        # Detect structure type and add to result
        try:
            from lib.structure.validator import detect_structure_type
            structure_data = result.get('pdb_data') or result.get('sdf_data') or file_content
            structure_type = detect_structure_type(structure_data, format_hint=file_ext if file_ext else None)
            result['structure_type'] = structure_type
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not detect structure type: {e}")
            result['structure_type'] = 'unknown'
        
        return result
    
    def _process_sdf_file(self, file_content: str, filename: str) -> Dict[str, Any]:
        """Process SDF file."""
        mol_supplier = Chem.SDMolSupplier()
        mol_supplier.SetData(file_content)
        mols = [m for m in mol_supplier if m is not None]
        
        if len(mols) == 0:
            raise ValueError("No valid molecules found in SDF file")
        
        mol = mols[0]
        if mol is None:
            raise ValueError("Could not parse SDF file")
        
        # Check for 2D structure (all Z coords are 0)
        needs_3d = mol.GetNumConformers() == 0
        if not needs_3d and mol.GetNumConformers() > 0:
            conf = mol.GetConformer(0)
            z_coords = [conf.GetAtomPosition(i).z for i in range(mol.GetNumAtoms())]
            needs_3d = all(abs(z) < 0.001 for z in z_coords)
        
        if needs_3d:
            if mol.GetNumConformers() > 0:
                mol.RemoveAllConformers()
            try:
                AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
            except:
                AllChem.Compute2DCoords(mol)
        
        mol = Chem.AddHs(mol, addCoords=True)
        sdf_data = Chem.MolToMolBlock(mol, confId=0)
        pdb_data = Chem.MolToPDBBlock(mol)
        processed_data = structure_processor.process_structure(pdb_data)
        
        structure_id = os.path.splitext(filename)[0]
        
        result = {
            "structure_id": structure_id,
            "format": "sdf",
            "sdf_data": sdf_data,
            "pdb_data": pdb_data,
            "components": processed_data['components']
        }
        
        # SDF files are always small molecules
        result['structure_type'] = 'small_molecule'
        
        return result
    
    def _process_pdb_file(self, file_content: str, filename: str) -> Dict[str, Any]:
        """Process PDB/CIF file."""
        processed_data = structure_processor.process_structure(file_content)
        structure_id = os.path.splitext(filename)[0]
        
        result = {
            "structure_id": structure_id,
            "format": "pdb",
            "pdb_data": file_content,
            "components": processed_data['components']
        }
        
        # Detect structure type for PDB files
        try:
            from lib.structure.validator import detect_structure_type
            structure_type = detect_structure_type(file_content, format_hint='pdb')
            result['structure_type'] = structure_type
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not detect structure type: {e}")
            result['structure_type'] = 'protein'  # Default for PDB
        
        return result
    
    def process_pdb_with_ligands(
        self,
        pdb_id: Optional[str] = None,
        pdb_data: Optional[str] = None,
        structure_id: Optional[str] = None,
        clean_protein: bool = True,
        include_2d_images: bool = True
    ) -> Dict[str, Any]:
        """Process PDB with ligand extraction."""
        if pdb_id:
            structure_data = pdb_service.fetch_structure(pdb_id)
            pdb_data = structure_data['pdb_data']
            structure_id = structure_data['structure_id']
        elif pdb_data:
            structure_id = structure_id or 'custom_structure'
        else:
            raise ValueError("Either 'pdb_id' or 'pdb_data' must be provided")
        
        processed_data = structure_processor.process_structure_with_ligands(
            pdb_data,
            clean_protein=clean_protein,
            include_2d_images=include_2d_images,
            target_pdb_id=pdb_id if pdb_id else None,
            target_structure_id=structure_id
        )
        
        return {
            "structure_id": structure_id,
            "format": "pdb",
            "original_structure": processed_data["original_structure"],
            "cleaned_structure": processed_data["processed_structure"],
            "components": processed_data["components"],
            "ligands": processed_data["ligands"],
            "protein_cleaned": processed_data.get("protein_cleaned", False)
        }
    
    def extract_ligand_by_hetid(self, pdb_data: str, het_id: str, ligand_name: Optional[str] = None) -> Dict[str, Any]:
        """Extract a specific ligand by HET ID from PDB structure."""
        if not pdb_data:
            raise ValueError("PDB data is required")
        if not het_id:
            raise ValueError("HET ID is required")
        
        het_id = het_id.strip().upper()
        
        # Parse the PDB structure
        from Bio.PDB import PDBParser
        from io import StringIO
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure('structure', StringIO(pdb_data))
        
        # Find the ligand residue with matching HET ID
        found_ligand = None
        for model in structure:
            for chain in model:
                for residue in chain:
                    res_name = residue.get_resname().strip().upper()
                    if res_name == het_id:
                        found_ligand = residue
                        break
                if found_ligand:
                    break
            if found_ligand:
                break
        
        if not found_ligand:
            raise ValueError(f"Ligand with HET ID '{het_id}' not found in structure")
        
        # Extract the ligand using the processor
        ligand_pdb = structure_processor.pdb_parser.extract_residues_as_string(structure, [found_ligand])
        
        # Convert to SDF format
        ligand_sdf = None
        try:
            sanitized_pdb = structure_processor.sanitize_pdb_for_rdkit(ligand_pdb)
            mol = Chem.MolFromPDBBlock(sanitized_pdb, removeHs=True)
            if mol is not None:
                mol = Chem.AddHs(mol, addCoords=True)
                if mol.GetNumConformers() == 0:
                    AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
                ligand_sdf = Chem.MolToMolBlock(mol, confId=0)
        except Exception as e:
            print(f"Warning: Could not convert ligand to SDF: {e}")
        
        # Prepare ligand name
        if not ligand_name:
            ligand_name = het_id
        
        # Save to library
        library_result = self._save_molecule_to_library(
            name=ligand_name,
            molfile=ligand_sdf or ligand_pdb,
            source='hetid_extraction'
        )
        
        result = {
            "structure_id": het_id,
            "format": "sdf" if ligand_sdf else "pdb",
            "pdb_data": ligand_pdb,
            "sdf_data": ligand_sdf,
            "ligand_name": ligand_name,
            "het_id": het_id,
            "library_save": library_result
        }
        
        # Small molecule type
        result['structure_type'] = 'small_molecule'
        
        return result
    
    def download_sdf(
        self,
        pdb_data: str,
        generate_conformers: bool = False,
        num_conformers: int = 10
    ) -> Dict[str, Any]:
        """Convert PDB to SDF format."""
        mol = Chem.MolFromPDBBlock(pdb_data)
        if mol is None:
            raise ValueError("Could not convert PDB data to molecule")
        
        if generate_conformers:
            mol = Chem.Mol(mol)
            mol = Chem.AddHs(mol)
            params = AllChem.ETKDGv2()
            params.numThreads = 0
            params.randomSeed = 42
            
            atom_count = mol.GetNumAtoms()
            if atom_count > 50:
                num_conformers = min(num_conformers, 5)
            
            cids = AllChem.EmbedMultipleConfs(mol, numConfs=num_conformers, params=params)
            if len(cids) == 0:
                AllChem.EmbedMolecule(mol, AllChem.ETKDGv2())
            else:
                for cid in cids:
                    try:
                        AllChem.UFFOptimizeMolecule(mol, confId=cid, maxIters=200)
                    except:
                        pass
        
        sdf_data = ""
        conf_count = mol.GetNumConformers()
        
        if conf_count == 0:
            mol.SetProp('ID', 'structure')
            sdf_data = Chem.MolToMolBlock(mol, confId=-1) + "$$$$\n"
            conf_count = 1
        else:
            for cid in range(conf_count):
                mol.SetProp('ID', f'conformer_{cid}')
                sdf_data += Chem.MolToMolBlock(mol, confId=cid) + "$$$$\n"
        
        return {
            "sdf_data": sdf_data,
            "conformer_count": conf_count
        }
    
    def _save_molecule_to_library(
        self,
        name: str,
        smiles: Optional[str] = None,
        canonical_smiles: Optional[str] = None,
        molfile: Optional[str] = None,
        source: str = "editor",
        target_pdb_id: Optional[str] = None,
        target_structure_id: Optional[str] = None,
        original_coordinates: Optional[list] = None,
        binding_site_info: Optional[dict] = None
    ) -> Dict[str, Any]:
        """Save molecule to library (internal method) with optional target information."""
        # Calculate properties
        if molfile:
            mol = Chem.MolFromMolBlock(molfile)
        elif smiles:
            mol = Chem.MolFromSmiles(smiles)
        else:
            return {'saved': False, 'error': 'No molecule data provided'}
        
        if mol is None:
            return {'saved': False, 'error': 'Invalid molecule structure'}
        
        if not canonical_smiles:
            canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
        
        # Check for duplicates after we have canonical_smiles
        for existing_molecule in self.molecules.values():
            if existing_molecule.get('canonical_smiles') == canonical_smiles:
                return {
                    'already_exists': True,
                    'molecule_id': existing_molecule['id']
                }

        # Check for duplicate names
        for existing_molecule in self.molecules.values():
            if existing_molecule.get('name', '').strip().lower() == name.strip().lower():
                return {
                    'saved': False, 
                    'error': f"Molecule with name '{name}' already exists", 
                    'error_code': 409
                }

        if not molfile:
            molfile = Chem.MolToMolBlock(mol, confId=0)
        
        molecular_weight = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        num_atoms = mol.GetNumAtoms()
        num_bonds = mol.GetNumBonds()
        
        # Create new molecule with target information if provided
        self.molecule_counter += 1
        new_molecule = {
            'id': self.molecule_counter,
            'name': name,
            'smiles': smiles,
            'canonical_smiles': canonical_smiles,
            'molfile': molfile,
            'molecular_weight': molecular_weight,
            'logp': logp,
            'num_atoms': num_atoms,
            'num_bonds': num_bonds,
            'source': source
        }
        
        # Add target information if provided
        if target_pdb_id:
            new_molecule['target_pdb_id'] = target_pdb_id
        if target_structure_id:
            new_molecule['target_structure_id'] = target_structure_id
        if original_coordinates:
            new_molecule['original_coordinates'] = original_coordinates
        if binding_site_info:
            new_molecule['binding_site_info'] = binding_site_info
        
        self.molecules[self.molecule_counter] = new_molecule
        
        return {
            'saved': True,
            'molecule_id': self.molecule_counter
        }
    
    def get_molecules(self) -> List[Dict[str, Any]]:
        """Get all molecules."""
        return list(self.molecules.values())
    
    def get_molecule(self, molecule_id: int) -> Optional[Dict[str, Any]]:
        """Get molecule by ID."""
        return self.molecules.get(molecule_id)
    
    def add_molecule(self, molfile: str, name: str = "Untitled", original_name: Optional[str] = None) -> Dict[str, Any]:
        """Add molecule to library."""
        mol = Chem.MolFromMolBlock(molfile, sanitize=True)
        if mol is None:
            raise ValueError("Invalid Molfile data provided")
        
        canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
        
        # Check for duplicates
        for existing_molecule in self.molecules.values():
            if existing_molecule['canonical_smiles'] == canonical_smiles:
                raise ValueError("Molecule already exists")
        
        molecular_weight = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        
        self.molecule_counter += 1
        new_molecule = {
            'id': self.molecule_counter,
            'name': name,
            'original_name': original_name,  # Original ligand name (e.g. residue name from PDB)
            'molfile': molfile,
            'canonical_smiles': canonical_smiles,
            'molecular_weight': molecular_weight,
            'logp': logp
        }
        
        self.molecules[self.molecule_counter] = new_molecule
        return new_molecule
    
    def update_molecule(self, molecule_id: int, name: Optional[str] = None, molfile: Optional[str] = None) -> Dict[str, Any]:
        """Update molecule."""
        molecule = self.molecules.get(molecule_id)
        if not molecule:
            raise ValueError("Molecule not found")
        
        if name:
            molecule['name'] = name
        
        if molfile:
            mol = Chem.MolFromMolBlock(molfile, sanitize=True)
            if mol is None:
                raise ValueError("Invalid Molfile data provided")
            
            canonical_smiles = Chem.MolToSmiles(mol, canonical=True)
            molecule['molfile'] = molfile
            molecule['canonical_smiles'] = canonical_smiles
            molecule['molecular_weight'] = Descriptors.MolWt(mol)
            molecule['logp'] = Descriptors.MolLogP(mol)
        
        self.molecules[molecule_id] = molecule
        return molecule
    
    def delete_molecule(self, molecule_id: int) -> None:
        """Delete molecule."""
        if molecule_id not in self.molecules:
            raise ValueError("Molecule not found")
        del self.molecules[molecule_id]
    
    def clear_molecules(self) -> None:
        """Clear all molecules."""
        self.molecules.clear()
        self.molecule_counter = 0
    
    def combine_protein_ligand(self, protein_pdb: str, ligand_pdb: str) -> Dict[str, Any]:
        if not protein_pdb:
            raise ValueError("Protein PDB data cannot be empty")
        if not ligand_pdb:
            raise ValueError("Ligand PDB data cannot be empty")
        
        # Create a combined structure by appending ligand data to protein
        combined_pdb_lines = []
        
        # Add protein lines (excluding END)
        protein_lines = protein_pdb.strip().split('\n')
        for line in protein_lines:
            if line.strip() and not line.startswith('END'):
                combined_pdb_lines.append(line)
        
        # Add ligand lines (only ATOM and HETATM records)
        ligand_lines = ligand_pdb.strip().split('\n')
        for line in ligand_lines:
            if line.startswith(('ATOM', 'HETATM')) and not line.startswith('END'):
                combined_pdb_lines.append(line)
        
        # Add END record
        combined_pdb_lines.append('END')
        
        combined_pdb = '\n'.join(combined_pdb_lines)
        
        return {
            "success": True,
            "pdb_data": combined_pdb,
            "format": "pdb"
        }
    
    def clean_protein_staged(
        self,
        pdb_data: str,
        remove_heterogens: bool = True,
        remove_water: bool = True,
        add_missing_residues: bool = True,
        add_missing_atoms: bool = True,
        add_missing_hydrogens: bool = True,
        ph: float = 7.4,
        add_solvation: bool = False,
        solvation_box_size: float = 10.0,
        solvation_box_shape: str = 'cubic',
        keep_ligands: bool = False
    ) -> Dict[str, Any]:
        """Clean protein with step-by-step control."""
        if not pdb_data:
            raise ValueError("PDB data cannot be empty")
        
        # Validate protein structure for protein cleaning service
        try:
            validation_result = validate_structure_for_service(
                'protein_cleaning',
                pdb_data,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise ValueError(error_msg)
        except StructureValidationError as e:
            raise ValueError(str(e))
        except Exception as e:
            # Log but continue - validation is best effort
            import logging
            logging.getLogger(__name__).warning(f"Structure validation error (continuing): {e}")
        
        from lib.chemistry import get_protein_preparer
        protein_preparer = get_protein_preparer()
        result = protein_preparer.clean_structure_staged(
            pdb_data=pdb_data,
            remove_heterogens=remove_heterogens,
            remove_water=remove_water,
            add_missing_residues=add_missing_residues,
            add_missing_atoms=add_missing_atoms,
            add_missing_hydrogens=add_missing_hydrogens,
            ph=ph,
            add_solvation=add_solvation,
            solvation_box_size=solvation_box_size,
            solvation_box_shape=solvation_box_shape,
            keep_ligands=keep_ligands
        )
        
        return result

