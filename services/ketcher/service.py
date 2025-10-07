"""
Ketcher Service - RDKit-based backend for Ketcher molecule editor
Replaces the Indigo service with local Flask/RDKit processing
"""

from rdkit import Chem
from rdkit.Chem import AllChem, Draw, inchi
from rdkit.Chem.MolStandardize import rdMolStandardize
import json
import base64
from io import BytesIO
from typing import Dict, Any, Optional, List


class KetcherService:
    """Service to handle Ketcher molecule editor operations using RDKit"""
    
    def __init__(self):
        self.version = "1.0.0"
        self.supported_formats = [
            "smiles", "mol", "sdf", "inchi", "inchikey", 
            "smarts", "cml", "ket"
        ]
        # Initialize chemistry utilities
        from lib.chemistry import get_ligand_preparer
        self.ligand_preparer = get_ligand_preparer()
    
    def get_info(self) -> Dict[str, Any]:
        """Get service information (replaces /indigo/info endpoint)"""
        return {
            "service": "Ketcher RDKit Service",
            "version": self.version,
            "formats": self.supported_formats,
            "backend": "RDKit",
            "features": [
                "format_conversion",
                "structure_validation",
                "2d_coordinates",
                "3d_coordinates",
                "aromatization",
                "dearomatization",
                "clean_2d",
                "molecular_properties"
            ]
        }
    
    def convert(self, struct: str, input_format: str, output_format: str, 
                options: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Convert molecular structure between formats
        
        Args:
            struct: Input structure string
            input_format: Format of input (smiles, mol, sdf, inchi, etc.)
            output_format: Desired output format
            options: Optional conversion options
        
        Returns:
            Dictionary with converted structure and metadata
        """
        try:
            # Parse input structure
            mol = self._parse_structure(struct, input_format)
            
            if mol is None:
                return {
                    "success": False,
                    "error": f"Failed to parse structure from {input_format} format"
                }
            
            # Apply options if provided
            if options:
                mol = self._apply_options(mol, options)
            
            # Convert to output format
            output_struct = self._format_structure(mol, output_format)
            
            if output_struct is None:
                return {
                    "success": False,
                    "error": f"Failed to convert to {output_format} format"
                }
            
            return {
                "success": True,
                "struct": output_struct,
                "format": output_format,
                "properties": self._get_properties(mol)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def validate(self, struct: str, input_format: str) -> Dict[str, Any]:
        """
        Validate a molecular structure
        
        Args:
            struct: Structure string to validate
            input_format: Format of the structure
        
        Returns:
            Validation result with any errors or warnings
        """
        try:
            mol = self._parse_structure(struct, input_format)
            
            if mol is None:
                return {
                    "valid": False,
                    "errors": ["Invalid molecular structure"]
                }
            
            # Check for common issues
            issues = []
            warnings = []
            
            # Check for disconnected fragments
            frags = Chem.GetMolFrags(mol, asMols=True)
            if len(frags) > 1:
                warnings.append(f"Structure contains {len(frags)} disconnected fragments")
            
            # Check for unusual valences
            problems = Chem.DetectChemistryProblems(mol)
            if problems:
                for problem in problems:
                    issues.append(problem.Message())
            
            # Check for radicals
            for atom in mol.GetAtoms():
                if atom.GetNumRadicalElectrons() > 0:
                    warnings.append(f"Atom {atom.GetIdx()} has radical electrons")
            
            return {
                "valid": len(issues) == 0,
                "errors": issues,
                "warnings": warnings,
                "properties": self._get_properties(mol)
            }
            
        except Exception as e:
            return {
                "valid": False,
                "errors": [str(e)]
            }
    
    def clean_2d(self, struct: str, input_format: str = "mol") -> Dict[str, Any]:
        """
        Generate clean 2D coordinates for a structure
        
        Args:
            struct: Input structure
            input_format: Format of input structure
        
        Returns:
            Structure with clean 2D coordinates
        """
        try:
            mol = self._parse_structure(struct, input_format)
            
            if mol is None:
                return {
                    "success": False,
                    "error": "Failed to parse structure"
                }
            
            # Generate 2D coordinates
            AllChem.Compute2DCoords(mol)
            
            # Convert back to MOL format - use confId=0 to write only first conformer
            output_struct = Chem.MolToMolBlock(mol, confId=0)
            
            return {
                "success": True,
                "struct": output_struct,
                "format": "mol"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def generate_3d(self, struct: str, input_format: str = "mol") -> Dict[str, Any]:
        """
        Generate 3D coordinates for a structure
        
        Args:
            struct: Input structure
            input_format: Format of input structure
        
        Returns:
            Structure with 3D coordinates
        """
        try:
            mol = self._parse_structure(struct, input_format)
            
            if mol is None:
                return {
                    "success": False,
                    "error": "Failed to parse structure"
                }
            
            # Add hydrogens
            mol = Chem.AddHs(mol)
            
            # Generate 3D coordinates
            result = AllChem.EmbedMolecule(mol, randomSeed=42)
            
            if result != 0:
                # Try with random coordinates if embedding fails
                AllChem.EmbedMolecule(mol, useRandomCoords=True, randomSeed=42)
            
            # Optimize geometry
            AllChem.MMFFOptimizeMolecule(mol, maxIters=200)
            
            # Remove hydrogens for cleaner output
            mol = Chem.RemoveHs(mol)
            
            # Convert to PDB format for 3D
            output_struct = Chem.MolToPDBBlock(mol)
            
            return {
                "success": True,
                "struct": output_struct,
                "format": "pdb"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def aromatize(self, struct: str, input_format: str = "mol") -> Dict[str, Any]:
        """Aromatize a structure"""
        try:
            mol = self._parse_structure(struct, input_format)
            if mol is None:
                return {"success": False, "error": "Failed to parse structure"}
            
            Chem.SanitizeMol(mol)
            Chem.SetAromaticity(mol)
            
            # Use confId=0 to write only first conformer
            output_struct = Chem.MolToMolBlock(mol, confId=0)
            
            return {
                "success": True,
                "struct": output_struct,
                "format": "mol"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def dearomatize(self, struct: str, input_format: str = "mol") -> Dict[str, Any]:
        """Dearomatize a structure"""
        try:
            mol = self._parse_structure(struct, input_format)
            if mol is None:
                return {"success": False, "error": "Failed to parse structure"}
            
            Chem.Kekulize(mol, clearAromaticFlags=True)
            
            # Use confId=0 to write only first conformer
            output_struct = Chem.MolToMolBlock(mol, confId=0)
            
            return {
                "success": True,
                "struct": output_struct,
                "format": "mol"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def calculate_properties(self, struct: str, input_format: str = "mol") -> Dict[str, Any]:
        """Calculate molecular properties"""
        try:
            mol = self._parse_structure(struct, input_format)
            if mol is None:
                return {"success": False, "error": "Failed to parse structure"}
            
            return {
                "success": True,
                "properties": self._get_properties(mol)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _clean_mol_block(self, mol_block: str) -> str:
        """Clean and fix common issues in MOL files"""
        lines = mol_block.split('\n')
        if len(lines) < 4:
            return mol_block
        
        # Debug: Print the first few lines to see what we're dealing with
        print(f"DEBUG: MOL file has {len(lines)} lines")
        for i in range(min(6, len(lines))):
            print(f"DEBUG: Line {i}: '{lines[i]}'")
        
        # Fix the counts line (line 3, 0-indexed) - this is often where the error occurs
        if len(lines) > 3:
            counts_line = lines[3]
            print(f"DEBUG: Original counts line: '{counts_line}'")
            
            # The counts line should be: aaabbblllfffcccsssxxxrrrpppiiimmmvvvvvv
            # where aaa = number of atoms (3 chars), bbb = number of bonds (3 chars)
            # The error "Cannot convert '   ' to int" means there are spaces where numbers should be
            
            # Try to extract atom and bond counts
            try:
                # Method 1: Try to read fixed-width format (positions 0-3 and 3-6)
                if len(counts_line) >= 6:
                    atom_str = counts_line[0:3].strip()
                    bond_str = counts_line[3:6].strip()
                    
                    # If empty, try to count from the actual atom/bond blocks
                    if not atom_str or not bond_str:
                        # Count atom lines (after line 3, before bond block)
                        atom_count = 0
                        bond_count = 0
                        
                        # Find M  END line
                        m_end_idx = len(lines)
                        for i, line in enumerate(lines[4:], start=4):
                            if line.strip().startswith('M  END'):
                                m_end_idx = i
                                break
                        
                        # Count atoms and bonds
                        in_atom_block = True
                        for i in range(4, m_end_idx):
                            line = lines[i].strip()
                            if not line:
                                continue
                            parts = line.split()
                            if len(parts) >= 4 and in_atom_block:
                                # Atom line has at least: x y z element
                                try:
                                    float(parts[0])  # x coordinate
                                    atom_count += 1
                                except:
                                    in_atom_block = False
                            elif len(parts) >= 3 and not in_atom_block:
                                # Bond line has: atom1 atom2 type
                                try:
                                    int(parts[0])  # atom1 index
                                    bond_count += 1
                                except:
                                    pass
                        
                        atom_str = str(atom_count)
                        bond_str = str(bond_count)
                    
                    atom_count = int(atom_str) if atom_str else 0
                    bond_count = int(bond_str) if bond_str else 0
                    
                    # Reconstruct the counts line with proper formatting
                    lines[3] = f"{atom_count:3d}{bond_count:3d}  0  0  0  0  0  0  0  0999 V2000"
                    
            except (ValueError, IndexError) as e:
                print(f"Error cleaning MOL counts line: {e}")
                # If all else fails, try to use default values
                lines[3] = "  0  0  0  0  0  0  0  0  0  0999 V2000"
        
        return '\n'.join(lines)
    
    def _extract_smiles_from_mol(self, mol_block: str) -> Optional[str]:
        """Try to extract SMILES from a potentially malformed MOL file by parsing atom/bond data directly"""
        try:
            lines = mol_block.split('\n')
            if len(lines) < 5:
                return None
            
            # Try to find atom and bond counts from the structure itself
            # Skip header lines (0-3) and look for atom block
            atoms = []
            bonds = []
            
            i = 4  # Start after header
            # Read atoms until we hit a bond line or M  END
            while i < len(lines):
                line = lines[i].strip()
                if not line or line.startswith('M  END'):
                    break
                
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        # Try to parse as atom line: x y z element
                        x, y, z = float(parts[0]), float(parts[1]), float(parts[2])
                        element = parts[3]
                        atoms.append(element)
                        i += 1
                    except (ValueError, IndexError):
                        # Not an atom line, might be start of bonds
                        break
                else:
                    break
            
            # Read bonds
            while i < len(lines):
                line = lines[i].strip()
                if not line or line.startswith('M  END'):
                    break
                
                parts = line.split()
                if len(parts) >= 3:
                    try:
                        # Bond line: atom1 atom2 type
                        a1, a2, btype = int(parts[0]), int(parts[1]), int(parts[2])
                        bonds.append((a1-1, a2-1, btype))  # Convert to 0-indexed
                        i += 1
                    except (ValueError, IndexError):
                        break
                else:
                    break
            
            if not atoms:
                return None
            
            # Build a simple SMILES from atoms and bonds
            # This is a simplified approach - for complex molecules, use RDKit's reconstruction
            if len(atoms) == 1:
                return atoms[0]  # Single atom
            
            # For simple cases, try to construct SMILES
            # This is very basic and won't work for complex molecules
            return None  # Let RDKit handle it with reconstruction
            
        except Exception as e:
            print(f"Error extracting SMILES from MOL: {e}")
            return None
    
    def _parse_structure(self, struct: str, format_type: str) -> Optional[Chem.Mol]:
        """Parse structure from various formats"""
        if not struct or not struct.strip():
            return None
        
        format_type = format_type.lower()
        
        try:
            if format_type == "smiles":
                mol = Chem.MolFromSmiles(struct)
            elif format_type in ["mol", "sdf", "mdl"]:
                # For SDF format, try SDMolSupplier which is more robust
                if format_type == "sdf" or "$$$$" in struct:
                    try:
                        # Use SDMolSupplier for SDF files
                        from io import StringIO
                        sdf_io = StringIO(struct)
                        supplier = Chem.SDMolSupplier()
                        supplier.SetData(struct, sanitize=False)
                        mol = next(supplier) if supplier else None
                        
                        if mol is not None:
                            try:
                                Chem.SanitizeMol(mol, catchErrors=True)
                            except:
                                pass
                    except:
                        # Fallback to MolFromMolBlock
                        mol = Chem.MolFromMolBlock(struct, sanitize=False)
                        if mol is not None:
                            try:
                                Chem.SanitizeMol(mol, catchErrors=True)
                            except:
                                pass
                else:
                    # For MOL format, clean and parse
                    cleaned_struct = self._clean_mol_block(struct)
                    
                    # Try parsing with sanitize=False for more lenient parsing
                    mol = Chem.MolFromMolBlock(cleaned_struct, sanitize=False)
                    
                    if mol is not None:
                        try:
                            # Try to sanitize the molecule
                            Chem.SanitizeMol(mol)
                        except:
                            # If sanitization fails, try with catchErrors
                            try:
                                Chem.SanitizeMol(mol, catchErrors=True)
                            except:
                                # Last resort: return unsanitized molecule
                                pass
                    else:
                        # If still None, try original struct with very lenient parsing
                        mol = Chem.MolFromMolBlock(struct, sanitize=False, removeHs=False)
                        if mol is not None:
                            try:
                                Chem.SanitizeMol(mol, catchErrors=True)
                            except:
                                pass
            elif format_type == "inchi":
                mol = Chem.MolFromInchi(struct)
            elif format_type == "smarts":
                mol = Chem.MolFromSmarts(struct)
            elif format_type == "pdb":
                mol = Chem.MolFromPDBBlock(struct)
            else:
                # Default to MOL format with lenient parsing
                cleaned_struct = self._clean_mol_block(struct)
                mol = Chem.MolFromMolBlock(cleaned_struct, sanitize=False)
                if mol is not None:
                    try:
                        Chem.SanitizeMol(mol, catchErrors=True)
                    except:
                        pass
            
            return mol
        except Exception as e:
            print(f"Error parsing structure: {e}")
            return None
    
    def _format_structure(self, mol: Chem.Mol, format_type: str) -> Optional[str]:
        """Convert RDKit mol to various formats"""
        if mol is None:
            return None
        
        format_type = format_type.lower()
        
        # Handle MIME type format names that Ketcher uses
        format_mapping = {
            'chemical/x-daylight-smiles': 'smiles',
            'chemical/x-mdl-molfile': 'mol',
            'chemical/x-mdl-sdfile': 'sdf',
            'chemical/x-inchi': 'inchi',
            'chemical/x-daylight-smarts': 'smarts',
            'chemical/x-pdb': 'pdb',
        }
        
        # Map MIME types to simple format names
        format_type = format_mapping.get(format_type, format_type)
        
        try:
            if format_type == "smiles":
                return Chem.MolToSmiles(mol)
            elif format_type == "sdf":
                # For SDF format, use SDWriter for proper formatting
                from io import StringIO
                output = StringIO()
                writer = Chem.SDWriter(output)
                # Write only the first conformer (confId=0) to avoid overlapping structures
                writer.write(mol, confId=0)
                writer.close()
                return output.getvalue()
            elif format_type in ["mol", "mdl"]:
                # Use confId=0 to write only first conformer
                return Chem.MolToMolBlock(mol, confId=0)
            elif format_type == "inchi":
                return Chem.MolToInchi(mol)
            elif format_type == "inchikey":
                return Chem.MolToInchiKey(mol)
            elif format_type == "smarts":
                return Chem.MolToSmarts(mol)
            elif format_type == "pdb":
                return Chem.MolToPDBBlock(mol)
            else:
                # Default to SDF format for small molecules (more robust than MOL)
                from io import StringIO
                output = StringIO()
                writer = Chem.SDWriter(output)
                writer.write(mol)
                writer.close()
                return output.getvalue()
        except Exception:
            return None
    
    def _apply_options(self, mol: Chem.Mol, options: Dict) -> Chem.Mol:
        """Apply various options to the molecule"""
        if options.get("aromatize"):
            Chem.SetAromaticity(mol)
        
        if options.get("dearomatize"):
            Chem.Kekulize(mol, clearAromaticFlags=True)
        
        if options.get("clean_2d"):
            AllChem.Compute2DCoords(mol)
        
        if options.get("add_hydrogens"):
            mol = Chem.AddHs(mol)
        
        if options.get("remove_hydrogens"):
            mol = Chem.RemoveHs(mol)
        
        return mol
    
    def _get_properties(self, mol: Chem.Mol) -> Dict[str, Any]:
        """Calculate molecular properties"""
        if mol is None:
            return {}
        
        try:
            # Calculate properties using LigandPreparer
            props = self.ligand_preparer.calculate_properties(mol)
            
            # Map to Ketcher expected format
            return {
                "molecular_formula": props.get("molecular_formula", ""),
                "molecular_weight": props.get("molecular_weight", 0.0),
                "exact_mass": props.get("exact_mass", 0.0),
                "num_atoms": props.get("num_atoms", 0),
                "num_bonds": props.get("num_bonds", 0),
                "num_heavy_atoms": props.get("num_heavy_atoms", 0),
                "num_rotatable_bonds": props.get("num_rotatable_bonds", 0),
                "num_h_donors": props.get("hydrogen_bond_donors", 0),
                "num_h_acceptors": props.get("hydrogen_bond_acceptors", 0),
                "num_rings": props.get("num_rings", 0),
                "num_aromatic_rings": props.get("num_aromatic_rings", 0),
                "logp": props.get("logp", 0.0),
                "tpsa": props.get("tpsa", 0.0),
                "smiles": Chem.MolToSmiles(mol)
            }
        except Exception:
            return {}
