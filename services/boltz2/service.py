"""
Boltz-2 Binding Affinity Prediction Service

This service integrates Boltz-2 (biomolecular foundation model) for predicting
protein-ligand binding affinities and complex structures. Boltz-2 is the first
deep learning model to approach FEP accuracy while running 1000x faster.

Key Capabilities:
- Binding affinity prediction (log(IC50) values)
- Binary binding probability (0-1 probability of binding)
- 3D structure prediction of protein-ligand complexes
- High-throughput screening support

Technical Details:
- Requires: pip install boltz[cuda] (GPU recommended)
- Input: YAML configuration files describing biomolecules
- Output: Affinity values, probabilities, and 3D coordinates
"""

import os
import sys
import json
import yaml
import tempfile
import subprocess
import logging
from contextlib import suppress
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List, Union
import shutil
import time
import datetime
from rdkit import Chem
from rdkit.Chem import Descriptors, AllChem
from services.alignment.service import ProteinAlignmentService

# Set up logging - configure to stderr if running as subprocess (no handlers set)
# This ensures logs are visible when called via runner.py
logger = logging.getLogger(__name__)

# If no handlers configured, add stderr handler for subprocess visibility
if not logger.handlers and not logging.getLogger().handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

class Boltz2Service:
    """Service class for Boltz-2 binding affinity and structure prediction."""
    
    def __init__(self, work_dir: Optional[str] = None):
        """
        Initialize the Boltz-2 service.
        
        Args:
            work_dir: Working directory for temporary files. If None, uses data/boltz_results_input.
        """
        if work_dir is None:
            # Use data directory for outputs
            project_root = Path(__file__).parent.parent.parent
            work_dir = str(project_root / "data" / "boltz_results_input")
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        
        # Check Boltz-2 installation status
        self.is_available = self._check_boltz2_installation()
        self.gpu_available = self._check_gpu_availability()
        
        logger.info(f"Boltz-2 Service initialized:")
        logger.info(f"  - Available: {self.is_available}")
        logger.info(f"  - GPU Available: {self.gpu_available}")
        logger.info(f"  - Work Directory: {self.work_dir}")
        
        # Initialize chemistry utilities
        from lib.chemistry import get_component_analyzer
        self.component_analyzer = get_component_analyzer()
        
        # Initialize alignment service
        try:
            self.alignment_service = ProteinAlignmentService()
        except ImportError:
            logger.warning("ProteinAlignmentService not available (BioPython missing?)")
            self.alignment_service = None
    
    def _check_boltz2_installation(self) -> bool:
        """Check if Boltz-2 is properly installed."""
        # First try to import the Python package
        try:
            import boltz
            logger.info("Boltz-2 Python package found")
        except ImportError:
            logger.error("Boltz-2 not installed. Install with: pip install boltz[cuda]")
            return False
        
        # If Python package is importable, consider it available
        # The CLI check is optional - we can use Python API if CLI fails
        try:
            result = subprocess.run(['boltz', '--help'], 
                                  capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
            if result.returncode == 0:
                logger.info("Boltz-2 CLI accessible")
            else:
                logger.warning("Boltz-2 CLI not working properly, but Python package is available")
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError) as e:
            logger.warning(f"Boltz-2 CLI check failed: {e}, but Python package is available")
        
        # If Python package exists, consider it available (we can use Python API)
        return True
    
    def _check_gpu_availability(self) -> bool:
        """Check if GPU is available for Boltz-2."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def _get_jobs_dir(self) -> Path:
        """Get the directory where job metadata is stored."""
        jobs_dir = self.work_dir / "outputs" / "jobs"
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
                logger.warning(f"Failed to read existing job data for {job_id}: {e}")

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
            logger.error(f"Failed to read job {job_id}: {e}")
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
                logger.warning(f"Failed to read job file {file_path}: {e}")
        
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
            job_output_dir = self.work_dir / "outputs" / job_id
            if job_output_dir.exists() and job_output_dir.is_dir():
                import shutil
                shutil.rmtree(job_output_dir)
            
            return True
        except Exception as e:
            logger.error(f"Failed to delete job {job_id}: {e}")
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

    @staticmethod
    def _parse_bool_flag(value: Optional[Any]) -> Optional[bool]:
        """
        Normalize different representations of boolean flags.

        Returns:
            True/False if the value can be coerced, otherwise None.
        """
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "y", "on"}:
                return True
            if normalized in {"false", "0", "no", "n", "off"}:
                return False
        return None

    def _should_use_msa_server(self, prediction_params: Optional[Dict[str, Any]] = None) -> bool:
        """
        Decide whether to rely on the remote MSA server.

        Priority order:
            1. Explicit prediction_params['use_msa_server']
            2. Environment variable BOLTZ2_USE_MSA_SERVER
            3. Default (True - MSA is required for Boltz-2 predictions without precomputed alignments)
        """
        prediction_params = prediction_params or {}
        explicit_flag = self._parse_bool_flag(prediction_params.get('use_msa_server'))
        if explicit_flag is not None:
            return explicit_flag

        env_flag = self._parse_bool_flag(os.getenv('BOLTZ2_USE_MSA_SERVER'))
        if env_flag is not None:
            return env_flag

        return True  # Default: enable MSA server since it's required for predictions without precomputed MSAs

    def _get_msa_authentication(self, prediction_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Collect MSA server authentication parameters.
        
        Supports two authentication methods:
        1. Basic Authentication: username/password
        2. API Key Authentication: header name and value
        
        Priority order (CLI options take precedence over environment variables):
        - Basic Auth: CLI options > Environment variables
        - API Key: CLI options > Environment variables
        
        Args:
            prediction_params: Optional dictionary with authentication parameters
            
        Returns:
            Dictionary with authentication configuration:
            - auth_type: 'basic', 'api_key', or None
            - username: str (for basic auth)
            - password: str (for basic auth)
            - api_key_header: str (for API key auth, default: 'X-API-Key')
            - api_key_value: str (for API key auth)
            
        Raises:
            ValueError: If both authentication methods are provided
        """
        prediction_params = prediction_params or {}
        
        # Placeholder values to filter out
        PLACEHOLDER_VALUES = {'', 'your_username', 'your_password', 'username', 'password'}
        
        # Helper function to check if a value is valid (not empty, None, or placeholder)
        def is_valid_auth_value(value: Any) -> bool:
            if not value:
                return False
            value_str = str(value).strip()
            return bool(value_str) and value_str.lower() not in PLACEHOLDER_VALUES
        
        # Collect basic authentication parameters
        # Priority: CLI option > Environment variable
        basic_username_raw = prediction_params.get('msa_server_username') or os.getenv('BOLTZ_MSA_USERNAME')
        basic_password_raw = prediction_params.get('msa_server_password') or os.getenv('BOLTZ_MSA_PASSWORD')
        
        # Filter out placeholder/empty values
        basic_username = basic_username_raw if is_valid_auth_value(basic_username_raw) else None
        basic_password = basic_password_raw if is_valid_auth_value(basic_password_raw) else None
        
        # Collect API key authentication parameters
        # Priority: CLI option > Environment variable
        api_key_header_raw = prediction_params.get('api_key_header')
        api_key_value_raw = prediction_params.get('api_key_value') or os.getenv('MSA_API_KEY_VALUE')
        
        # Filter out placeholder/empty values
        api_key_header = api_key_header_raw if is_valid_auth_value(api_key_header_raw) else 'X-API-Key'  # Default header
        api_key_value = api_key_value_raw if is_valid_auth_value(api_key_value_raw) else None
        
        # Determine which authentication method is being used
        # Only consider it valid if we have complete credentials (both username AND password for basic, or api_key_value for API key)
        has_basic_auth = bool(basic_username and basic_password)
        has_api_key_auth = bool(api_key_value)
        
        # Validate that only one method is used
        if has_basic_auth and has_api_key_auth:
            raise ValueError(
                "Cannot use both basic authentication and API key authentication. "
                "Please provide either basic auth credentials (username/password) "
                "or API key credentials, but not both. "
                f"Detected: basic auth (username: {basic_username}), API key auth (header: {api_key_header})"
            )
        
        # Return authentication configuration
        if has_basic_auth:
            return {
                'auth_type': 'basic',
                'username': basic_username,
                'password': basic_password
            }
        elif has_api_key_auth:
            return {
                'auth_type': 'api_key',
                'api_key_header': api_key_header,
                'api_key_value': api_key_value
            }
        else:
            return {
                'auth_type': None
            }

    @staticmethod
    def _is_msa_error(message: str) -> bool:
        """Detect when boltz CLI failed due to MSA-related issues."""
        if not message:
            return False
        lower_msg = message.lower()
        # Check for specific MSA error patterns - be careful not to match
        # normal informational messages like "MSA server authentication: no credentials provided"
        msa_error_patterns = [
            'missing msa',
            'msa file not found',
            'failed to fetch msa',
            'msa generation failed',
            '--use_msa_server flag not set',
            'error fetching msa',
            'could not retrieve msa',
        ]
        return any(pattern in lower_msg for pattern in msa_error_patterns)
    
    @staticmethod
    def _is_oom_error(message: str) -> bool:
        """Detect when boltz CLI failed due to out of memory errors."""
        if not message:
            return False
        lower_msg = message.lower()
        oom_patterns = [
            'out of memory',
            'cuda out of memory',
            'ran out of memory',
            'oom',
            'failed examples: 1',  # Boltz reports failed batches this way
        ]
        return any(pattern in lower_msg for pattern in oom_patterns)
    
    @staticmethod
    def _normalize_sequence(sequence: str) -> str:
        """
        Normalize protein sequence for consistent comparison.
        
        Removes whitespace, converts to uppercase, and ensures consistent formatting.
        
        Args:
            sequence: Protein sequence string (may contain whitespace, mixed case, etc.)
            
        Returns:
            Normalized sequence (uppercase, no whitespace)
        """
        if not sequence:
            return ""
        # Remove all whitespace (spaces, newlines, tabs)
        normalized = ''.join(sequence.split())
        # Convert to uppercase
        normalized = normalized.upper()
        return normalized
    
    def _validate_msa_sequence(self, msa_path: str, expected_sequence: str) -> Tuple[bool, Optional[str]]:
        """
        Validate that the first sequence in an MSA file matches the expected sequence.
        
        Reads the A3M format MSA file and extracts the first sequence, then compares
        it with the expected sequence after normalization.
        
        Args:
            msa_path: Path to A3M format MSA file
            expected_sequence: Expected protein sequence (will be normalized)
            
        Returns:
            Tuple of (is_valid, error_message)
            - is_valid: True if sequences match, False otherwise
            - error_message: None if valid, error description if invalid
        """
        if not msa_path or not Path(msa_path).exists():
            return False, f"MSA file not found: {msa_path}"
        
        try:
            # Normalize expected sequence
            expected_normalized = self._normalize_sequence(expected_sequence)
            
            # Read MSA file and extract first sequence
            with open(msa_path, 'r') as f:
                lines = f.readlines()
            
            if not lines:
                return False, "MSA file is empty"
            
            # Parse A3M format: first sequence starts after first '>' header
            # The query sequence should be the exact input sequence (no gaps)
            first_sequence_lines = []
            found_header = False
            
            for i, line in enumerate(lines):
                line = line.rstrip()  # Keep leading spaces, remove trailing
                if not line:
                    continue
                
                if line.startswith('>'):
                    if found_header:
                        # We've reached the second sequence, stop
                        break
                    found_header = True
                    continue
                
                if found_header:
                    # This is sequence data for the first sequence (query)
                    # For the query sequence, we extract all amino acid letters
                    # A3M format notes:
                    # - Uppercase = match columns (standard amino acids)
                    # - Lowercase = insertions (should be removed for comparison)
                    # - '-' or '.' = gaps (should be removed)
                    # - Standard amino acids: A-Z uppercase
                    # The query sequence should contain only standard amino acids
                    cleaned_line = ''.join(c for c in line if c.isupper() and c.isalpha() and c in 'ACDEFGHIKLMNPQRSTVWYX')
                    if cleaned_line:
                        first_sequence_lines.append(cleaned_line)
            
            if not first_sequence_lines:
                return False, "Could not extract sequence from MSA file"
            
            # Combine sequence lines and normalize (should already be uppercase, but normalize anyway)
            msa_sequence = ''.join(first_sequence_lines)
            msa_normalized = self._normalize_sequence(msa_sequence)
            
            logger.debug(
                f"Extracted MSA query sequence: {len(msa_normalized)} residues "
                f"(first 50: {msa_normalized[:50]}...)"
            )
            
            # Compare sequences
            if msa_normalized == expected_normalized:
                logger.info(
                    f"MSA sequence validation passed: {len(expected_normalized)} residues match exactly. "
                    f"MSA file: {msa_path}"
                )
                return True, None
            else:
                # Find where sequences differ for better debugging
                diff_index = None
                for i, (e, m) in enumerate(zip(expected_normalized, msa_normalized)):
                    if e != m:
                        diff_index = i
                        break
                
                # Log detailed mismatch information for debugging
                logger.warning(
                    f"MSA sequence mismatch detected in {msa_path}:\n"
                    f"  Expected length: {len(expected_normalized)} residues\n"
                    f"  MSA length: {len(msa_normalized)} residues\n"
                    f"  First difference at position: {diff_index if diff_index is not None else 'N/A (length mismatch)'}\n"
                    f"  Expected first 100: {expected_normalized[:100]}\n"
                    f"  MSA first 100: {msa_normalized[:100]}\n"
                    f"  Expected last 50: {expected_normalized[-50:]}\n"
                    f"  MSA last 50: {msa_normalized[-50:]}"
                )
                return False, (
                    f"MSA sequence does not match expected sequence "
                    f"(expected {len(expected_normalized)} residues, found {len(msa_normalized)} residues"
                    f"{', first difference at position ' + str(diff_index) if diff_index is not None else ''})"
                )
                
        except Exception as e:
            logger.error(f"Error validating MSA sequence: {e}", exc_info=True)
            return False, f"Error reading/validating MSA file: {str(e)}"
    
    def _sanitize_pdb_data(self, pdb_data: str) -> str:
        """
        Attempt to sanitize PDB data by fixing common formatting issues.
        
        Fixes issues like:
        - Non-numeric residue sequence numbers (e.g., 'A000')
        """
        lines = []
        modified = False
        
        for line in pdb_data.split('\n'):
            if (line.startswith('ATOM') or line.startswith('HETATM')) and len(line) >= 26:
                res_num_str = line[22:26]
                try:
                    # Check if it's a valid integer (spaces allowed)
                    if res_num_str.strip():
                        int(res_num_str)
                except ValueError:
                    # Invalid integer found
                    modified = True
                    # Extract digits if any
                    digits = ''.join(c for c in res_num_str if c.isdigit())
                    if digits:
                        # Reformat as right-aligned integer
                        # Ensure we don't exceed 4 chars (though digits came from 4 chars so likely safe)
                        new_res_num = f"{int(digits):4d}"[-4:]
                        # Pad with spaces if needed (though :4d does it)
                        if len(new_res_num) < 4:
                            new_res_num = f"{new_res_num:>4}"
                        line = line[:22] + new_res_num + line[26:]
                    else:
                        # No digits, default to 0
                        line = line[:22] + "   0" + line[26:]
            
            lines.append(line)
            
        if modified:
            return '\n'.join(lines)
        return pdb_data
    
    def validate_input_structures(self, protein_data: str, ligand_data: str) -> Dict[str, Any]:
        """
        Validate input protein and ligand structures.
        
        Args:
            protein_data: PDB format protein structure
            ligand_data: SDF/MOL format ligand structure or SMILES string
            
        Returns:
            Dictionary containing validation results and processed data
        """
        validation_result = {
            'valid': False,
            'protein_info': None,
            'ligand_info': None,
            'errors': []
        }
        
        try:
            # Validate protein structure using ComponentAnalyzer
            from lib.chemistry import get_pdb_parser
            pdb_parser = get_pdb_parser()
            
            try:
                structure = pdb_parser.parse_string(protein_data, "protein")
            except ValueError as e:
                # Catch PDB parsing errors and try to sanitize
                logger.warning(f"Initial PDB parsing failed: {e}. Attempting sanitization...")
                
                # Check for common PDB formatting issues
                sanitized_data = self._sanitize_pdb_data(protein_data)
                if sanitized_data != protein_data:
                    try:
                        structure = pdb_parser.parse_string(sanitized_data, "protein")
                        # If successful, use sanitized data but log warning
                        logger.info("PDB sanitization successful")
                        protein_data = sanitized_data
                    except ValueError as e2:
                        validation_result['errors'].append(f"Protein structure parsing failed: {str(e2)}")
                        return validation_result
                else:
                    validation_result['errors'].append(f"Protein structure parsing failed: {str(e)}")
                    return validation_result

            protein_info = self.component_analyzer.validate_protein_structure(structure, protein_data)
            if protein_info['valid']:
                validation_result['protein_info'] = protein_info
            else:
                validation_result['errors'].extend(protein_info['errors'])
            
            # Validate ligand structure
            ligand_info = self._validate_ligand(ligand_data)
            if ligand_info['valid']:
                validation_result['ligand_info'] = ligand_info
            else:
                validation_result['errors'].extend(ligand_info['errors'])
            
            # Overall validation
            validation_result['valid'] = (protein_info['valid'] and ligand_info['valid'])
            
        except Exception as e:
            validation_result['errors'].append(f"Validation error: {str(e)}")
            logger.error(f"Input validation failed: {e}")
        
        return validation_result
    
    # _validate_protein method removed - replaced by ComponentAnalyzer.validate_protein_structure
    
    def _validate_ligand(self, ligand_data: str) -> Dict[str, Any]:
        """Validate ligand structure data or SMILES."""
        result = {'valid': False, 'errors': [], 'smiles': None, 'mol_weight': 0}
        
        try:
            mol = None
            
            # Try to parse as SMILES first
            if len(ligand_data.strip()) < 200 and '\n' not in ligand_data.strip():
                try:
                    mol = Chem.MolFromSmiles(ligand_data.strip())
                except Exception as e:
                    logger.debug("SMILES parsing failed: %s", e)

            # If SMILES parsing failed, try SDF/MOL format
            if mol is None:
                try:
                    mol = Chem.MolFromMolBlock(ligand_data)
                except Exception as e:
                    logger.debug("MOL block parsing failed: %s", e)
            
            # If SDF/MOL parsing failed, try PDB format (for ligands extracted from complexes)
            if mol is None:
                try:
                    mol = Chem.MolFromPDBBlock(ligand_data)
                    if mol is not None:
                        logger.info("Successfully parsed ligand from PDB format")
                except Exception as e:
                    logger.debug(f"PDB parsing failed: {e}")
                    pass
            
            if mol is not None:
                # Pre-process the molecule to avoid Boltz-2 RDKit errors
                # The error "getNumImplicitHs() called without preceding call to 
                # calcImplicitValence()" occurs when Boltz-2's LARGEST_FRAGMENT_CHOOSER
                # encounters molecules that haven't been fully processed
                
                # Step 1: Remove explicit hydrogens and re-add implicit ones
                # This ensures a clean molecule state
                try:
                    mol = Chem.RemoveHs(mol)
                except Exception as e:
                    logger.debug("RemoveHs failed: %s", e)
                
                # Step 2: Handle multi-fragment molecules (salts, etc.)
                # Choose largest fragment ourselves to avoid Boltz-2's internal error
                try:
                    from rdkit.Chem.MolStandardize import rdMolStandardize
                    # Get largest fragment
                    largest_frag = rdMolStandardize.LargestFragmentChooser()
                    mol = largest_frag.choose(mol)
                except Exception as e:
                    logger.debug(f"Fragment selection not needed or failed: {e}")
                
                # Step 3: Full sanitization to ensure proper valence calculation
                try:
                    Chem.SanitizeMol(mol)
                except Exception as e:
                    logger.warning(f"Molecule sanitization warning: {e}")
                    # Try partial sanitization if full sanitization fails
                    try:
                        Chem.SanitizeMol(mol, sanitizeOps=Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_PROPERTIES)
                    except Exception as partial_err:
                        logger.debug("Partial sanitization also failed: %s", partial_err)
                
                # Step 4: Generate canonical SMILES from the processed molecule
                # This ensures consistent, valid input for Boltz-2
                result['smiles'] = Chem.MolToSmiles(mol, canonical=True)
                
                # Calculate basic properties
                result['mol_weight'] = Descriptors.MolWt(mol)
                result['valid'] = True
            else:
                result['errors'].append("Unable to parse ligand data as SMILES or SDF/MOL format")
                
        except Exception as e:
            result['errors'].append(f"Ligand validation error: {str(e)}")
            logger.error(f"Ligand validation failed: {e}")
        
        return result
    
    def prepare_boltz2_input(self, protein_data: str, ligand_data: str, 
                           prediction_params: Dict[str, Any],
                           msa_path: Optional[str] = None) -> str:
        """
        Prepare YAML input file for Boltz-2 prediction.
        
        Args:
            protein_data: PDB format protein structure
            ligand_data: SDF/MOL format ligand or SMILES string
            prediction_params: Prediction configuration parameters
            msa_path: Optional path to pre-computed MSA file (.a3m format)
            
        Returns:
            Path to generated YAML input file
        """
        # Validate inputs first
        validation = self.validate_input_structures(protein_data, ligand_data)
        if not validation['valid']:
            raise ValueError(f"Input validation failed: {validation['errors']}")
        
        # Generate unique complex ID
        import uuid
        complex_id = f"complex_{int(time.time())}_{str(uuid.uuid4())[:8]}"
        
        # Store complex_id for later use in parsing
        self._current_complex_id = complex_id
        
        # Store sequence for MSA operations (normalized for consistency)
        extracted_sequence = validation['protein_info']['sequence']
        # Normalize sequence to ensure consistency with MSA generation
        normalized_sequence = self._normalize_sequence(extracted_sequence)
        self._current_sequence = normalized_sequence
        
        logger.info(
            f"Extracted and normalized protein sequence: {len(normalized_sequence)} residues "
            f"(first 50: {normalized_sequence[:50]}...)"
        )
        
        # Prepare protein config (use normalized sequence)
        protein_config = {
            'id': 'A',
            'sequence': normalized_sequence
        }
        
        # Validate and add MSA path if provided
        if msa_path:
            # Validate that MSA sequence matches the normalized extracted sequence
            is_valid, error_msg = self._validate_msa_sequence(msa_path, normalized_sequence)
            
            if is_valid:
                protein_config['msa'] = msa_path
                logger.info(f"Using pre-computed MSA: {msa_path} (sequence validated)")
            else:
                # Log warning but don't fail - let Boltz2 use its MSA server as fallback
                logger.warning(
                    f"MSA validation failed for {msa_path}: {error_msg}. "
                    f"Will proceed without pre-computed MSA (Boltz2 will use MSA server)."
                )
                # Don't add MSA to config - Boltz2 will use server instead
        
        # Prepare YAML structure following official Boltz-2 schema
        yaml_data = {
            'version': 1,
            'sequences': [
                {'protein': protein_config},
                {
                    'ligand': {
                        'id': 'B',
                        'smiles': validation['ligand_info']['smiles']
                    }
                }
            ],
            'properties': [
                {
                    'affinity': {
                        'binder': 'B'  # Ligand chain ID
                    }
                }
            ]
        }
        
        # Note: Structure prediction is handled automatically by Boltz-2
        # Confidence threshold is not part of the official YAML schema
        # These parameters are handled via CLI flags instead
        
        # Write YAML file
        yaml_file = self.work_dir / f"{complex_id}.yaml"
        with open(yaml_file, 'w') as f:
            yaml.dump(yaml_data, f, default_flow_style=False)
        
        logger.info(f"Created Boltz-2 input file: {yaml_file}")
        return str(yaml_file)
    
    def run_boltz2_prediction(self, yaml_config: Dict[str, Any], 
                            output_subdir: str = "output",
                            num_poses: int = 5,
                            prediction_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute Boltz-2 prediction using CLI or Python API.
        
        Args:
            yaml_config: YAML configuration dictionary
            output_subdir: Output subdirectory name
            num_poses: Number of poses to generate
            
        Returns:
            Dictionary containing prediction results
        """
        if not self.is_available:
            raise RuntimeError("Boltz-2 is not installed. Install with: pip install boltz[cuda]")
        
        output_dir = self.work_dir / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Clean up old result directories to avoid stale cache issues
        # Only remove directories older than 1 hour to prevent interfering with concurrent jobs
        try:
            current_time = time.time()
            for old_dir in output_dir.glob('boltz_results_tmp*'):
                if old_dir.is_dir():
                    # Check age
                    mtime = old_dir.stat().st_mtime
                    age = current_time - mtime
                    if age > 3600:  # 1 hour
                        logger.info(f"Cleaning up old result directory: {old_dir} (age: {age:.0f}s)")
                        shutil.rmtree(old_dir)
        except Exception as e:
            logger.warning(f"Failed to clean up old directories: {e}")
        
        # Create temporary YAML file from config
        import tempfile
        import yaml
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            yaml.dump(yaml_config, f)
            yaml_input_file = f.name
        
        prediction_params = prediction_params or {}
        
        # Check if MSA is already in the YAML config (from pre-computed MSA)
        # If MSA path is in YAML, we should NOT use the MSA server (to avoid duplicate MSA generation)
        has_msa_in_yaml = False
        if 'sequences' in yaml_config:
            for seq in yaml_config['sequences']:
                if 'protein' in seq and 'msa' in seq['protein']:
                    has_msa_in_yaml = True
                    break
        
        # Only use MSA server if no MSA is already in the YAML
        if has_msa_in_yaml:
            use_msa_server = False
            logger.info("Pre-computed MSA found in YAML config - skipping MSA server to avoid duplicate generation")
        else:
            use_msa_server = self._should_use_msa_server(prediction_params)

        def _invoke_boltz(enable_msa: bool) -> Dict[str, Any]:
            # Use wrapper script to configure torch backend (fix for cusolver errors)
            wrapper_path = Path(__file__).parent / "boltz_wrapper.py"
            cmd = [sys.executable, str(wrapper_path), 'predict', yaml_input_file]
            
            cmd.extend(['--out_dir', str(output_dir)])

            # Check for user-specified accelerator preference
            user_accelerator = prediction_params.get('accelerator', 'gpu') if prediction_params else 'gpu'
            use_cpu = False
            
            if user_accelerator == 'cpu':
                use_cpu = True
                cmd.extend(['--accelerator', 'cpu'])
                cmd.extend(['--no_kernels'])  # Required for CPU mode - disables Triton GPU kernels
                logger.info("Using CPU mode (user selected) - this will be slower but handles larger proteins")
            elif self.gpu_available:
                cmd.extend(['--accelerator', 'gpu'])
                logger.info("Using GPU acceleration for Boltz-2 prediction")
            else:
                use_cpu = True
                cmd.extend(['--accelerator', 'cpu'])
                cmd.extend(['--no_kernels'])  # Required for CPU mode - disables Triton GPU kernels
                logger.warning("GPU not available, using CPU (this will be slower)")

            cmd.extend(['--diffusion_samples', str(num_poses)])
            cmd.extend(['--output_format', 'pdb'])
            cmd.extend(['--affinity_mw_correction'])
            cmd.extend(['--sampling_steps_affinity', '200'])
            cmd.extend(['--diffusion_samples_affinity', str(num_poses)])
            cmd.extend(['--model', 'boltz2'])

            if enable_msa:
                logger.info("Enabling remote MSA server integration for Boltz-2 run")
                cmd.extend(['--use_msa_server'])
                
                # Add authentication if provided
                # IMPORTANT: Only one authentication method can be used (basic auth OR API key, not both)
                try:
                    auth_config = self._get_msa_authentication(prediction_params)
                    auth_type = auth_config.get('auth_type')
                    
                    if auth_type == 'basic':
                        logger.info("Using basic authentication for MSA server")
                        # Only add basic auth flags
                        cmd.extend(['--msa_server_username', auth_config['username']])
                        cmd.extend(['--msa_server_password', auth_config['password']])
                        # Ensure API key flags are NOT added
                        logger.debug("Skipping API key authentication (using basic auth)")
                    elif auth_type == 'api_key':
                        logger.info(f"Using API key authentication for MSA server (header: {auth_config['api_key_header']})")
                        # Only add API key flags
                        cmd.extend(['--api_key_header', auth_config['api_key_header']])
                        cmd.extend(['--api_key_value', auth_config['api_key_value']])
                        # Ensure basic auth flags are NOT added
                        logger.debug("Skipping basic authentication (using API key)")
                    else:
                        logger.debug("No MSA server authentication credentials provided")
                except ValueError as e:
                    error_msg = (
                        f"MSA authentication configuration error: {e}. "
                        "Please ensure only one authentication method is configured. "
                        "Remove either basic auth credentials (BOLTZ_MSA_USERNAME/BOLTZ_MSA_PASSWORD) "
                        "or API key credentials (MSA_API_KEY_VALUE), but not both."
                    )
                    logger.error(error_msg)
                    raise ValueError(error_msg) from e
            else:
                logger.info("Skipping remote MSA server; expecting precomputed MSAs")

            # Handle affinity checkpoint - Boltz-2 will auto-download if not present
            affinity_checkpoint = Path.home() / '.boltz' / 'boltz2_aff.ckpt'
            boltz_cache_dir = Path.home() / '.boltz'
            
            if affinity_checkpoint.exists():
                cmd.extend(['--affinity_checkpoint', str(affinity_checkpoint)])
                logger.info(f"Using explicit affinity checkpoint: {affinity_checkpoint}")
            else:
                logger.info(f"Affinity checkpoint not found at: {affinity_checkpoint}")
                logger.info("Boltz-2 will attempt to download the checkpoint automatically...")
                # Ensure cache directory exists
                boltz_cache_dir.mkdir(parents=True, exist_ok=True)
                # Note: Boltz-2 CLI will auto-download missing checkpoints

            cmd.extend(['--recycling_steps', '3'])  # Reduced from 4 to save memory
            cmd.extend(['--step_scale', '1.5'])
            
            # Always override to avoid stale cached results from failed runs
            cmd.extend(['--override'])

            logger.info(f"Running Boltz-2 prediction: {' '.join(cmd)}")
            logger.info("=== Starting Boltz-2 CLI execution ===")

            # Sanitize environment to prevent conflicting authentication methods
            # Boltz2 CLI reads environment variables directly, so we must ensure
            # no conflicting auth env vars exist when we're passing auth via command-line flags
            env = os.environ.copy()
            
            # Since we're passing authentication via command-line flags (if any),
            # we must remove ALL authentication environment variables to prevent conflicts.
            # Boltz2 will see both the flags AND env vars, causing the "both methods" error.
            removed_vars = []
            for var_name in ['BOLTZ_MSA_USERNAME', 'BOLTZ_MSA_PASSWORD', 'MSA_API_KEY_VALUE', 'API_KEY_HEADER']:
                if var_name in env:
                    env.pop(var_name)
                    removed_vars.append(var_name)
            
            if removed_vars:
                logger.debug(f"Sanitized environment: removed auth environment variables {removed_vars} to prevent conflicts with command-line flags")
            
            start_time = time.time()
            last_progress_time = start_time
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                bufsize=1,
                universal_newlines=True,
                env=env  # Use sanitized environment
            )

            stdout_lines: List[str] = []
            line_count = 0
            
            # Read output in real-time with progress updates
            # Print directly to stderr so runner.py can capture it (don't use logger to avoid duplicate formatting)
            while True:
                # Check if process is still running
                poll_result = process.poll()
                
                # Try to read a line (non-blocking would be ideal, but we'll use readline)
                line = process.stdout.readline()
                
                if line:
                    line_stripped = line.strip()
                    if line_stripped:
                        # Print directly to stderr for runner.py to capture
                        # Don't use logger.info() as that adds formatting and causes duplication
                        print(f"[Boltz2] {line_stripped}", file=sys.stderr, flush=True)
                    stdout_lines.append(line)
                    line_count += 1
                
                # Periodic progress update
                current_time = time.time()
                if current_time - last_progress_time > 30:  # Every 30 seconds
                    elapsed = current_time - start_time
                    print(f"Boltz-2 prediction in progress... ({elapsed:.0f}s elapsed, {line_count} lines processed)", file=sys.stderr, flush=True)
                    last_progress_time = current_time
                
                # Exit if process finished and no more output
                if poll_result is not None and not line:
                    break
                    
                # Check timeout (1800s = 30 minutes for long predictions)
                if current_time - start_time > 1800:
                    process.kill()
                    process.wait()
                    raise RuntimeError("Boltz-2 prediction timed out (1800s limit)")
            
            returncode = process.returncode

            processing_time = time.time() - start_time
            full_output = "".join(stdout_lines)
            
            if returncode != 0:
                raise RuntimeError(f"Boltz-2 prediction failed: {full_output}")
            
            # Check for OOM errors - this is the most common failure mode
            if self._is_oom_error(full_output):
                raise RuntimeError(
                    "Boltz-2 prediction failed: GPU ran out of memory. "
                    "The protein may be too large for your GPU. "
                    "Try with a smaller protein (recommended <500 residues for 16GB VRAM) "
                    "or use CPU mode (much slower)."
                )
            
            # Check for MSA errors even if returncode is 0 (Boltz-2 may skip failed inputs gracefully)
            if self._is_msa_error(full_output):
                raise RuntimeError(
                    "Boltz-2 prediction failed: Missing MSA data. "
                    "The MSA server may not be accessible or authentication failed. "
                    "Please check your network connection and try again."
                )

            logger.info(f"Boltz-2 prediction completed in {processing_time:.2f} seconds")
            yaml_path = Path(yaml_input_file)
            complex_id = yaml_path.stem
            return self.parse_boltz2_output(str(output_dir), processing_time, complex_id)

        try:
            try:
                return _invoke_boltz(use_msa_server)
            except RuntimeError as err:
                error_msg = str(err)
                if use_msa_server and self._is_msa_error(error_msg):
                    logger.warning("MSA server authentication failed, retrying without remote server")
                    return _invoke_boltz(False)
                raise
        except Exception as e:
            logger.error(f"Boltz-2 prediction failed: {e}")
            raise RuntimeError(f"Prediction execution failed: {str(e)}")
        finally:
            with suppress(Exception):
                os.unlink(yaml_input_file)
    
    @staticmethod
    def _calculate_delta_g(affinity_log_ic50: Optional[float]) -> Optional[float]:
        """
        Convert affinity (log10(IC50) in uM) to Delta G (kcal/mol).
        Formula: Delta G approx (6 - affinity) * 1.364
        """
        if affinity_log_ic50 is None:
            return None
        return (6.0 - float(affinity_log_ic50)) * 1.364

    @staticmethod
    def _calculate_aggregate_score(plddt: Optional[float], iptm: Optional[float]) -> Optional[float]:
        """
        Calculate Aggregate Confidence Score.
        Formula: 0.8 * pLDDT + 0.2 * ipTM
        
        Args:
            plddt: pLDDT score (0-100 or 0-1). Will be normalized to 0-1.
            iptm: ipTM score (0-1).
        """
        if plddt is None or iptm is None:
            return None
            
        # Normalize pLDDT to 0-1 if it looks like 0-100
        plddt_norm = plddt
        if plddt > 1.0:
            plddt_norm = plddt / 100.0
            
        return 0.8 * plddt_norm + 0.2 * iptm

    def _align_pose_to_reference(self, pose_data: str, reference_pdb: str, options: Optional[Dict[str, Any]] = None) -> Tuple[str, Dict[str, Any]]:
        """
        Align a predicted pose to the reference protein structure.
        
        Args:
            pose_data: Predicted pose PDB data
            reference_pdb: Reference protein PDB data
            options: Alignment options
            
        Returns:
            Tuple of (aligned_pdb_data, alignment_metrics)
        """
        if not self.alignment_service:
            return pose_data, {'error': 'Alignment service not available'}
            
        options = options or {}
        method = options.get('alignment_method', 'binding_site')
        
        if method == 'none':
            return pose_data, {'method': 'none'}
            
        try:
            # Configure alignment parameters
            use_binding_site = method == 'binding_site'
            radius = float(options.get('binding_site_radius', 8.0))
            iterative = options.get('iterative_until_threshold', False)
            target_rmsd = float(options.get('target_rmsd', 0.05))
            
            # Perform alignment
            # Note: Boltz-2 outputs complex (protein + ligand), so we align the protein part
            # effectively superposing the complex onto the reference frame
            result = self.alignment_service.align_protein_structures(
                reference_data=reference_pdb,
                mobile_data=pose_data,
                ref_format='pdb',
                mob_format='pdb',
                # If binding site alignment requested, use iterative pruning to focus on core
                use_iterative_pruning=True,
                iterative_until_threshold=iterative,
                target_rmsd=target_rmsd
            )
            
            if result.get('success') and result.get('aligned_structure'):
                logger.info(f"Pose aligned successfully (RMSD: {result.get('rmsd'):.3f} Å)")
                return result['aligned_structure'], result
            else:
                logger.warning(f"Alignment failed: {result.get('error')}")
                return pose_data, result
                
        except Exception as e:
            logger.error(f"Error during pose alignment: {e}")
            return pose_data, {'error': str(e)}

    def parse_boltz2_output(self, output_dir: Union[str, Path], processing_time: float, complex_id: str = None) -> Dict[str, Any]:
        """
        Parse Boltz-2 prediction output files.
        
        Args:
            output_dir: Directory containing Boltz-2 output files
            processing_time: Time taken for prediction in seconds
            
        Returns:
            Dictionary containing parsed results
        """
        # Initialize result dictionary with defaults
        result = {
            'affinity_pred_value': None,
            'binding_free_energy': None,  # Delta G in kcal/mol
            'affinity_probability_binary': None,
            'structure_data': None,
            'prediction_confidence': None,
            'processing_time': processing_time,
            'success': False,
            'error': None
        }
        
        try:
            # Convert to Path object if string
            output_dir = Path(output_dir)
            
            # Find the result directory (should be named boltz_results_*)
            result_dirs = list(output_dir.glob('boltz_results_*'))
            
            if not result_dirs:
                logger.warning(f"No boltz_results_* directories found in {output_dir}")
                return result
            
            # Use the most recent directory if multiple exist
            result_dir = max(result_dirs, key=lambda x: x.stat().st_mtime)
            logger.info(f"Found {len(result_dirs)} result directories, using most recent: {result_dir}")
            
            # Try to find directory for current complex if complex_id is available
            # Use provided complex_id parameter if available, otherwise fall back to self._current_complex_id
            complex_id_to_use = complex_id or self._current_complex_id
            if complex_id_to_use:
                matching_dirs = [d for d in result_dirs if complex_id_to_use in str(d)]
                if matching_dirs:
                    result_dir = matching_dirs[0]
                    logger.info(f"Found matching directory for complex {complex_id_to_use}: {result_dir}")
                else:
                    logger.warning(f"Could not find directory for complex {complex_id_to_use}, using most recent: {result_dir}")
            if result_dir is None:
                result_dirs.sort(key=lambda x: x.stat().st_mtime)  # Sort by modification time
                result_dir = result_dirs[-1]
                logger.warning(f"Could not find directory for complex {complex_id}, using most recent: {result_dir}")
            
            logger.info(f"Using result directory: {result_dir}")
            
            # Look for manifest.json in processed directory
            manifest_file = result_dir / "processed" / "manifest.json"
            if manifest_file.exists():
                with open(manifest_file, 'r') as f:
                    manifest_data = json.load(f)
                logger.info(f"Manifest data: {manifest_data}")
                
                # Try to extract specific affinity and confidence data from dedicated files
                affinity_pred_value = None
                affinity_probability_binary = None
                prediction_confidence = None
                
                # Look for affinity prediction file
                complex_name = result_dir.name.replace('boltz_results_', '')
                affinity_file = result_dir / 'predictions' / complex_name / f'affinity_{complex_name}.json'
                
                if affinity_file.exists():
                    try:
                        with open(affinity_file, 'r') as f:
                            affinity_data = json.load(f)
                        
                        affinity_pred_value = affinity_data.get('affinity_pred_value')
                        affinity_probability_binary = affinity_data.get('affinity_probability_binary')
                        
                        logger.info(f"Extracted affinity values: pred_value={affinity_pred_value}, probability={affinity_probability_binary}")
                    except Exception as e:
                        logger.warning(f"Failed to parse affinity file {affinity_file}: {e}")
                
                # Look for confidence prediction file
                confidence_file = result_dir / 'predictions' / complex_name / f'confidence_{complex_name}_model_0.json'
                
                if confidence_file.exists():
                    try:
                        with open(confidence_file, 'r') as f:
                            confidence_data = json.load(f)
                        
                        prediction_confidence = confidence_data.get('confidence_score')
                        logger.info(f"Extracted confidence score: {prediction_confidence}")
                    except Exception as e:
                        logger.warning(f"Failed to parse confidence file {confidence_file}: {e}")
                
                # Assign extracted values to result dictionary
                if affinity_pred_value is not None:
                    result['affinity_pred_value'] = float(affinity_pred_value)
                    result['binding_free_energy'] = self._calculate_delta_g(float(affinity_pred_value))
                
                if affinity_probability_binary is not None:
                    result['affinity_probability_binary'] = float(affinity_probability_binary)
                
                if prediction_confidence is not None:
                    result['prediction_confidence'] = float(prediction_confidence)
            
            # Look for structure files (PDB, CIF, mmCIF)
            structure_files = []
            for pattern in ["*.pdb", "*.cif", "*.mmcif"]:
                structure_files.extend(result_dir.rglob(pattern))
            
            # Sort structure files by name to ensure consistent ordering
            structure_files.sort(key=lambda x: x.name)
            
            # Initialize poses array
            poses = []
            
            if structure_files:
                logger.info(f"Found {len(structure_files)} structure file(s)")
                
                # Process each structure file as a separate pose
                for i, structure_file in enumerate(structure_files):
                    logger.info(f"Processing pose {i+1} from file: {structure_file}")
                    
                    # Use utf-8 encoding with error handling to avoid ASCII codec errors
                    with open(structure_file, 'r', encoding='utf-8', errors='replace') as f:
                        structure_data = f.read()
                    
                    # Extract pose index from filename (e.g., model_0, model_1)
                    pose_index = i
                    if '_model_' in structure_file.name:
                        try:
                            pose_index = int(structure_file.name.split('_model_')[1].split('.')[0])
                        except (ValueError, IndexError):
                            pose_index = i
                    
                    # Look for individual confidence file for this pose
                    confidence_file = result_dir / 'predictions' / complex_name / f'confidence_{complex_name}_model_{pose_index}.json'
                    pose_confidence_data = {}
                    
                    if confidence_file.exists():
                        try:
                            with open(confidence_file, 'r') as f:
                                pose_confidence_data = json.load(f)
                            logger.info(f"Loaded confidence data for pose {pose_index}: {pose_confidence_data}")
                        except Exception as e:
                            logger.warning(f"Failed to parse confidence file {confidence_file}: {e}")
                    
                    # Extract individual affinity values for this specific pose
                    individual_affinity = None
                    individual_probability = None
                    
                    if affinity_file.exists():
                        try:
                            with open(affinity_file, 'r') as f:
                                affinity_data = json.load(f)
                            
                            # Extract and average all affinity values
                            pred_values = []
                            prob_values = []
                            
                            for key, value in affinity_data.items():
                                if key.startswith('affinity_pred_value'):
                                    try:
                                        pred_values.append(float(value))
                                    except (ValueError, TypeError):
                                        pass
                                elif key.startswith('affinity_probability_binary'):
                                    try:
                                        prob_values.append(float(value))
                                    except (ValueError, TypeError):
                                        pass
                            
                            if pred_values:
                                individual_affinity = sum(pred_values) / len(pred_values)
                                logger.info(f"Averaged {len(pred_values)} affinity values: {individual_affinity}")
                            else:
                                individual_affinity = None
                                
                            if prob_values:
                                individual_probability = sum(prob_values) / len(prob_values)
                                logger.info(f"Averaged {len(prob_values)} probability values: {individual_probability}")
                            else:
                                individual_probability = None
                        except Exception as e:
                            logger.warning(f"Failed to parse individual affinity for pose {pose_index}: {e}")
                            # No fallback - if parsing fails, we don't have data for this pose
                            individual_affinity = None
                            individual_probability = None
                    else:
                        # If affinity file doesn't exist, we only have global data if it was a single-pose run
                        # But to be safe and avoid "repeating values", we'll leave it as None for multi-pose runs
                        # unless we are sure. For now, default to None.
                        individual_affinity = None
                        individual_probability = None
                    
                    # Calculate derived metrics
                    delta_g = self._calculate_delta_g(float(individual_affinity)) if individual_affinity is not None else None
                    
                    complex_plddt = pose_confidence_data.get('complex_plddt', 0.0)
                    iptm = pose_confidence_data.get('iptm', 0.0)
                    aggregate_score = self._calculate_aggregate_score(complex_plddt, iptm)
                    
                    # Look for PAE/PDE files
                    # Typical name: pae_{complex_name}_model_{pose_index}.npz
                    pae_file = result_dir / 'predictions' / complex_name / f'pae_{complex_name}_model_{pose_index}.npz'
                    pde_file = result_dir / 'predictions' / complex_name / f'pde_{complex_name}_model_{pose_index}.npz'
                    
                    # Create pose data with individual metrics
                    pose = {
                        'structure_data': structure_data,
                        'pose_id': f"pose_{pose_index}",
                        'name': f"Pose {pose_index + 1}",
                        'id': f"model_{pose_index}",
                        # Individual affinity data for this specific pose
                        'affinity': individual_affinity or 0.0,
                        'affinity_pred_value': individual_affinity,
                        'binding_free_energy': delta_g,
                        'affinity_probability_binary': individual_probability,
                        'binary_probability': individual_probability or 0.0,
                        # Individual confidence metrics for this pose
                        'confidence_score': pose_confidence_data.get('confidence_score', 0.0),
                        'aggregate_score': aggregate_score,
                        'ptm': pose_confidence_data.get('ptm', 0.0),
                        'iptm': iptm,
                        'ligand_iptm': pose_confidence_data.get('ligand_iptm', 0.0),
                        'protein_iptm': pose_confidence_data.get('protein_iptm', 0.0),
                        'complex_plddt': complex_plddt,
                        'complex_iplddt': pose_confidence_data.get('complex_iplddt', 0.0),
                        'complex_pde': pose_confidence_data.get('complex_pde', 0.0),
                        'complex_ipde': pose_confidence_data.get('complex_ipde', 0.0),
                        'chains_ptm': pose_confidence_data.get('chains_ptm', {}),
                        'pair_chains_iptm': pose_confidence_data.get('pair_chains_iptm', {}),
                        # File format detection
                        'format': 'mmcif' if structure_file.suffix.lower() in ['.cif', '.mmcif'] else 'pdb',
                        'structure': structure_data,
                        # Analysis files availability
                        'has_pae': pae_file.exists(),
                        'has_pde': pde_file.exists(),
                        'pae_path': str(pae_file) if pae_file.exists() else None,
                        'pde_path': str(pde_file) if pde_file.exists() else None
                    }
                    
                    poses.append(pose)
                
                # Store all poses in the result
                result['poses'] = poses
                
                # For backward compatibility, also store the first pose data directly
                if poses:
                    result['structure_data'] = poses[0]['structure_data']
            
            # Check if we actually have results - empty manifest or no poses means failure
            has_poses = bool(result.get('poses'))
            has_structure = bool(result.get('structure_data'))
            
            if result_dir.exists() and (result_dir / "processed").exists():
                if has_poses or has_structure:
                    result['success'] = True
                    logger.info(f"Boltz-2 prediction completed successfully with {len(result.get('poses', []))} pose(s)")
                    
                    # If no affinity data but structure exists, that's still a success
                    if has_structure and not result['affinity_pred_value']:
                        logger.info("Structure prediction successful, affinity data may not have been requested")
                else:
                    # Directory exists but no results - check manifest for clues
                    result['success'] = False
                    # Check if it's an OOM or other specific issue
                    error_hint = ""
                    try:
                        # Look for any error indicators in the output directory
                        manifest_file = result_dir / "processed" / "manifest.json"
                        if manifest_file.exists():
                            with open(manifest_file, 'r') as f:
                                manifest = json.load(f)
                            if not manifest.get('records'):
                                error_hint = " The input may have failed preprocessing (check MSA or input format)."
                    except Exception:
                        pass
                    
                    result['error'] = (
                        "Boltz-2 prediction produced no results. Possible causes:\n"
                        "1. GPU out of memory - try with a smaller protein (<500 residues recommended for 16GB VRAM)\n"
                        "2. MSA generation failed - check MSA server connectivity\n"
                        "3. Invalid input format - verify protein/ligand data" + error_hint
                    )
                    logger.error(f"Boltz-2 prediction failed: no poses or structure data generated.")
            else:
                result['success'] = False
                result['error'] = "Boltz-2 prediction completed but no valid results found"
            
        except Exception as e:
            result['error'] = f"Error parsing Boltz-2 output: {str(e)}"
            logger.error(f"Output parsing failed: {e}")
        
        return result
    
    def predict_binding_affinity(self, protein_data: str, ligand_data: str, 
                               prediction_params: Optional[Dict[str, Any]] = None,
                               num_poses: int = 5,
                               msa_path: Optional[str] = None,
                               alignment_options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Complete workflow for Boltz-2 binding affinity prediction.
        
        Args:
            protein_data: PDB format protein structure
            ligand_data: SDF/MOL format ligand or SMILES string
            prediction_params: Optional prediction parameters
            num_poses: Number of poses to generate (default: 5)
            msa_path: Optional path to pre-computed MSA file (.a3m format)
            alignment_options: Optional alignment configuration
            
        Returns:
            Dictionary containing complete prediction results
        """
        if prediction_params is None:
            prediction_params = {}
        
        # Default alignment to True for batch consistency if not specified
        if alignment_options is None:
            alignment_options = {'use_alignment': True, 'alignment_method': 'binding_site'}
        
        try:
            logger.info(f"Starting Boltz-2 binding affinity prediction with {num_poses} poses...")
            if msa_path:
                logger.info(f"Using pre-computed MSA: {msa_path}")
            
            # Prepare input (with optional MSA path)
            yaml_file = self.prepare_boltz2_input(protein_data, ligand_data, prediction_params, msa_path)
            
            # Read yaml config for the updated method
            with open(yaml_file, 'r') as f:
                import yaml
                yaml_config = yaml.safe_load(f)
            
            # Run prediction with configurable pose count
            results = self.run_boltz2_prediction(
                yaml_config,
                num_poses=num_poses,
                prediction_params=prediction_params,
            )
            
            # Add MSA info to results for frontend download
            if msa_path and hasattr(self, '_current_sequence'):
                results['msa_info'] = {
                    'msa_path': msa_path,
                    'sequence_used': True
                }
            
            # Perform structural alignment if requested
            if results.get('success') and alignment_options.get('use_alignment', True):
                try:
                    logger.info("Aligning predicted poses to reference structure...")
                    if 'poses' in results:
                        for i, pose in enumerate(results['poses']):
                            if pose.get('structure_data'):
                                aligned_data, metrics = self._align_pose_to_reference(
                                    pose['structure_data'], 
                                    protein_data, 
                                    alignment_options
                                )
                                results['poses'][i]['structure_data'] = aligned_data
                                results['poses'][i]['alignment_metrics'] = metrics
                                
                                # Update top-level structure data if this is the first pose
                                if i == 0:
                                    results['structure_data'] = aligned_data
                                    results['alignment_results'] = metrics
                    elif results.get('structure_data'):
                        # Fallback for single structure result
                        aligned_data, metrics = self._align_pose_to_reference(
                            results['structure_data'], 
                            protein_data, 
                            alignment_options
                        )
                        results['structure_data'] = aligned_data
                        results['alignment_results'] = metrics
                        
                except Exception as e:
                    logger.error(f"Post-prediction alignment failed: {e}")
                    # Continue without alignment rather than failing the whole job
            
            # Cleanup temporary files
            try:
                os.unlink(yaml_file)
            except OSError as e:
                logger.debug("Temp file cleanup failed: %s", e)
            
            logger.info("Boltz-2 prediction completed successfully")
            return results
            
        except Exception as e:
            logger.error(f"Boltz-2 prediction workflow failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'affinity_pred_value': None,
                'affinity_probability_binary': None,
                'structure_data': None,
                'prediction_confidence': None,
                'processing_time': 0
            }
    
    def get_service_status(self) -> Dict[str, Any]:
        """
        Get the current status of the Boltz-2 service.
        
        Returns:
            Dictionary containing service status information
        """
        return {
            'service': 'Boltz-2 Binding Affinity Prediction',
            'available': self.is_available,
            'gpu_available': self.gpu_available,
            'work_directory': str(self.work_dir),
            'version': self._get_boltz2_version(),
            'capabilities': [
                'Binding affinity prediction (log(IC50))',
                'Binary binding probability',
                '3D structure prediction',
                'High-throughput screening'
            ]
        }
    
    def _get_boltz2_version(self) -> Optional[str]:
        """Get Boltz-2 version information."""
        try:
            result = subprocess.run(['boltz', '--version'],
                                  capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.debug("Boltz version check failed: %s", e)
        return None
    
    def cleanup(self):
        """Clean up temporary files and resources."""
        try:
            if self.work_dir.exists():
                shutil.rmtree(self.work_dir)
            logger.info("Boltz-2 service cleanup completed")
        except Exception as e:
            logger.warning(f"Cleanup failed: {e}")
