"""
Quantum Chemistry Service

This service provides RESTful API endpoints for submitting and managing
ORCA quantum chemistry calculations.

It follows the asynchronous "job" pattern:
1. POST /api/qc/jobs - Submit a new calculation
2. GET /api/qc/jobs/status/<job_id> - Check job status
3. GET /api/qc/jobs/results/<job_id> - Get final results
4. GET /api/qc/jobs/files/<job_id>/<filename> - Download output files
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from celery.result import AsyncResult
from fastapi.responses import FileResponse

from services.qc.config import QCConfig
from services.qc.tasks import celery_app, run_orca_job_opi, load_results_from_db, calculate_fukui_indices, perform_conformer_search
from services.qc.opi_helper import generate_preview
from lib.structure.validator import validate_structure_for_service, StructureValidationError

logger = logging.getLogger(__name__)


class QuantumChemistryService:
    """Service for managing quantum chemistry calculations."""
    
    def __init__(self):
        """Initialize the QC service."""
        self.config = QCConfig
        # Ensure directories exist
        self.config.ensure_directories()
    
    def submit_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit a new QC calculation job.
        
        This endpoint validates the input, queues the job with Celery,
        and immediately returns with a job ID.
        
        Args:
            job_data: Dictionary containing job parameters
            
        Returns:
            Dictionary with job_id, status, and links
        """
        # Validate required fields
        if not job_data:
            return {
                "error": "Missing request body"
            }, 400
        
        molecule_xyz = job_data.get('molecule_xyz')
        if not molecule_xyz:
            return {
                "error": "Missing required field: molecule_xyz"
            }, 400
        
        # Validate structure type for QC service (requires small molecule)
        # IMPORTANT: Don't pass format='xyz' here - let the validator detect the actual type
        # The data might be PDB converted to XYZ format, and we need to detect it's a protein
        try:
            validation_result = validate_structure_for_service(
                'qc',
                molecule_xyz,
                format=None  # Let validator auto-detect
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                if validation_result['warnings']:
                    error_msg += '; ' + '; '.join(validation_result['warnings'])
                logger.error(f"QC validation failed: {error_msg}")
                return {
                    "error": error_msg
                }, 400
            # Log successful validation for debugging
            logger.info(f"QC structure validation passed: type={validation_result.get('structure_type')}, format={validation_result.get('detected_format')}")
        except StructureValidationError as e:
            logger.error(f"QC structure validation error: {e}")
            return {
                "error": str(e)
            }, 400
        except Exception as e:
            logger.error(f"Structure validation exception: {e}", exc_info=True)
            # Don't continue - fail the validation
            return {
                "error": f"Structure validation failed: {str(e)}"
            }, 400
        
        # Validate XYZ format (basic check)
        try:
            lines = molecule_xyz.strip().split('\n')
            if len(lines) < 3:
                return {
                    "error": "Invalid XYZ format: too few lines"
                }, 400
        except Exception as e:
            return {
                "error": f"Invalid XYZ format: {str(e)}"
            }, 400
        
        # Set defaults for optional parameters
        job_data.setdefault('charge', 0)
        job_data.setdefault('multiplicity', 1)
        job_data.setdefault('n_procs', self.config.DEFAULT_N_PROCS)
        job_data.setdefault('memory_mb', self.config.DEFAULT_MEMORY_MB)
        job_data.setdefault('job_type', 'OPT')
        job_data.setdefault('calculate_properties', True)
        
        # Validate preset if provided
        preset = job_data.get('preset')
        if preset and preset not in self.config.METHOD_PRESETS:
            return {
                "error": f"Unknown preset: {preset}. Available presets: {list(self.config.METHOD_PRESETS.keys())}"
            }, 400
        
        # Validate method/basis/keyword combinations
        # Based on ORCA Manual Section 7.4
        try:
            from services.qc.validation import validate_job_parameters
            is_valid, errors, warnings = validate_job_parameters(job_data)
            
            if not is_valid:
                error_msg = '; '.join(errors)
                logger.error(f"QC parameter validation failed: {error_msg}")
                return {
                    "error": f"Invalid calculation parameters: {error_msg}"
                }, 400
            
            # Log warnings but don't fail
            for warning in warnings:
                logger.warning(f"QC parameter warning: {warning}")
                
        except Exception as e:
            logger.warning(f"Parameter validation skipped due to error: {e}")
        
        try:
            # Submit job to Celery queue
            logger.info(f"Submitting QC job with parameters: {job_data.keys()}")
            task = run_orca_job_opi.delay(job_data)
            
            # Return 202 Accepted with job info
            response = {
                "job_id": task.id,
                "status": "PENDING",
                "message": "Job submitted successfully and is queued for execution",
                "links": {
                    "status": f"/api/qc/jobs/status/{task.id}",
                    "results": f"/api/qc/jobs/results/{task.id}"
                }
            }
            
            logger.info(f"Job submitted successfully: {task.id}")
            return response, 202
            
        except Exception as e:
            logger.error(f"Error submitting job: {e}", exc_info=True)
            return {
                "error": f"Failed to submit job: {str(e)}"
            }, 500
            
    def submit_fukui_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a Fukui Index calculation job."""
        if not job_data:
            return {"error": "Missing request body"}, 400
        
        molecule_xyz = job_data.get('molecule_xyz')
        if not molecule_xyz:
            return {"error": "Missing required field: molecule_xyz"}, 400
        
        # Validate structure type for QC service (requires small molecule)
        try:
            validation_result = validate_structure_for_service(
                'qc',
                molecule_xyz,
                format=None  # Let validator auto-detect
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                logger.error(f"Fukui QC validation failed: {error_msg}")
                return {"error": error_msg}, 400
        except StructureValidationError as e:
            logger.error(f"Fukui QC structure validation error: {e}")
            return {"error": str(e)}, 400
        except Exception as e:
            logger.error(f"Fukui structure validation exception: {e}", exc_info=True)
            return {"error": f"Structure validation failed: {str(e)}"}, 400
            
        try:
            logger.info(f"Submitting Fukui job with parameters: {job_data.keys()}")
            task = calculate_fukui_indices.delay(job_data)
            
            response = {
                "job_id": task.id,
                "status": "PENDING",
                "message": "Fukui calculation submitted successfully",
                "links": {
                    "status": f"/api/qc/jobs/status/{task.id}",
                    "results": f"/api/qc/jobs/results/{task.id}"
                }
            }
            return response, 202
            
        except Exception as e:
            logger.error(f"Error submitting Fukui job: {e}", exc_info=True)
            return {"error": f"Failed to submit job: {str(e)}"}, 500

    def submit_conformer_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a Conformer Search job."""
        if not job_data:
            return {"error": "Missing request body"}, 400
        
        smiles = job_data.get('smiles')
        molecule_xyz = job_data.get('molecule_xyz')
        
        # If SMILES is missing but we have XYZ, try to generate SMILES
        if not smiles and molecule_xyz:
            try:
                from rdkit import Chem
                # Convert XYZ to RDKit molecule
                # We need to write to a temporary block or handle manually since RDKit doesn't read XYZ string directly easily
                # But we can use MolFromXYZBlock if available, or parse it
                
                # Check if it is actually XYZ block
                if not molecule_xyz.strip():
                     return {"error": "Empty molecule_xyz"}, 400

                # Use RDKit to parse XYZ
                # Note: RDKit's XYZ parser needs atomic numbers or symbols.
                # Assuming standard XYZ format
                try:
                    mol = Chem.MolFromXYZBlock(molecule_xyz)
                    if mol is not None:
                        # MolFromXYZBlock reads atoms but does NOT infer bonds.
                        # DetermineBonds infers connectivity from 3D coordinates.
                        from rdkit.Chem import rdDetermineBonds
                        rdDetermineBonds.DetermineBonds(mol, charge=0)
                except Exception as bond_e:
                    logger.warning(f"XYZ bond determination failed: {bond_e}")
                    mol = None
                
                if mol is None:
                    # Try creating from MolBlock (SDF/V2000/V3000)
                    try:
                        mol = Chem.MolFromMolBlock(molecule_xyz)
                    except Exception as e:
                        logger.debug(f"MolFromMolBlock failed: {e}")
                        mol = None

                if mol is None:
                    # Try creating from PDB block if it looks like PDB
                    if "ATOM" in molecule_xyz or "HETATM" in molecule_xyz:
                        try:
                            mol = Chem.MolFromPDBBlock(molecule_xyz)
                        except Exception as e:
                            logger.debug(f"MolFromPDBBlock failed: {e}")
                            mol = None

                        # If standard parse failed (e.g. bad valences in protein), try without sanitization
                        if mol is None:
                            try:
                                mol = Chem.MolFromPDBBlock(molecule_xyz, sanitize=False)
                                if mol:
                                    mol.UpdatePropertyCache(strict=False)
                            except Exception as e:
                                logger.debug(f"MolFromPDBBlock (no sanitize) failed: {e}")
                                mol = None
                
                if mol:
                    # Generate SMILES
                    smiles = Chem.MolToSmiles(mol, canonical=True)
                    logger.info(f"Generated SMILES from 3D structure: {smiles}")
                    # Update job_data with generated SMILES
                    job_data['smiles'] = smiles
            except Exception as e:
                logger.warning(f"Failed to generate SMILES from structure: {e}")
                # Continue and let the next check fail if smiles is still empty

        if not smiles:
            return {"error": "Missing required field: smiles (and could not generate from molecule_xyz)"}, 400
            
        try:
            logger.info(f"Submitting Conformer job with parameters: {job_data.keys()}")
            task = perform_conformer_search.delay(job_data)
            
            response = {
                "job_id": task.id,
                "status": "PENDING",
                "message": "Conformer search submitted successfully",
                "links": {
                    "status": f"/api/qc/jobs/status/{task.id}",
                    "results": f"/api/qc/jobs/results/{task.id}"
                }
            }
            return response, 202
            
        except Exception as e:
            logger.error(f"Error submitting Conformer job: {e}", exc_info=True)
            return {"error": f"Failed to submit job: {str(e)}"}, 500
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get the current status of a job.
        
        Celery statuses are normalized for frontend compatibility:
        - PENDING -> pending
        - STARTED -> running
        - SUCCESS -> completed
        - FAILURE -> failed
        - REVOKED -> failed
        
        Args:
            job_id: Celery task ID
            
        Returns:
            Dictionary with job status information
        """
        try:
            task_result = AsyncResult(job_id, app=celery_app)
            celery_status = task_result.status
            
            # Normalize Celery status to frontend-compatible lowercase status
            status_map = {
                'PENDING': 'pending',
                'STARTED': 'running',
                'SUCCESS': 'completed',
                'FAILURE': 'failed',
                'REVOKED': 'failed',
            }
            normalized_status = status_map.get(celery_status, celery_status.lower())
            
            response = {
                "job_id": job_id,
                "status": normalized_status,
                "celery_status": celery_status  # Keep original for debugging
            }
            
            # Add additional info based on status
            if celery_status == 'PENDING':
                response["message"] = "Job is queued and waiting to start"
            
            elif celery_status == 'STARTED':
                response["message"] = "Job is currently running"
            
            elif celery_status == 'SUCCESS':
                response["message"] = "Job completed successfully"
                response["links"] = {
                    "results": f"/api/qc/jobs/results/{job_id}"
                }
            
            elif celery_status == 'FAILURE':
                # Get error information
                try:
                    result = task_result.get(timeout=0.1)
                    if isinstance(result, dict) and 'error' in result:
                        response["error"] = result['error']
                    else:
                        response["error"] = str(task_result.info)
                except Exception:
                    response["error"] = "Job failed (error details unavailable)"
            
            elif celery_status == 'REVOKED':
                response["message"] = "Job was cancelled"
            
            return response, 200
            
        except Exception as e:
            logger.error(f"Error getting job status: {e}", exc_info=True)
            return {
                "error": f"Failed to get job status: {str(e)}"
            }, 500
    
    def get_job_results(self, job_id: str) -> Dict[str, Any]:
        """
        Get the final results of a completed job.
        
        This first checks the persistent database, then falls back
        to the Celery result backend.
        
        Args:
            job_id: Celery task ID
            
        Returns:
            Dictionary with job_id, status, and results in a format expected by frontend
        """
        try:
            # First, try to load from persistent storage
            result = load_results_from_db(job_id)
            
            if result:
                logger.info(f"Loaded results from database for job {job_id}")
                # Ensure the response has the expected structure
                if 'job_id' not in result:
                    result['job_id'] = job_id
                if 'status' not in result:
                    result['status'] = 'completed'
                # Back-fill orca_task_type for jobs that predate the field
                if not result.get('orca_task_type'):
                    result['orca_task_type'] = self._infer_orca_task_type(job_id, result)
                # Re-parse electrostatics for completed jobs that are missing CHELPG/dipole
                # (handles jobs run before the regex fallback parsers were added)
                result = self._backfill_electrostatics(job_id, result)
                result = self._backfill_missing_kpis(job_id, result)
                return result, 200
            
            # Fallback to Celery backend
            task_result = AsyncResult(job_id, app=celery_app)
            
            if task_result.status != 'SUCCESS':
                return {
                    "job_id": job_id,
                    "status": task_result.status.lower(),
                    "error": f"Job not yet completed. Current status: {task_result.status}"
                }, 404
            
            # Get result from Celery
            result = task_result.get()
            
            if not isinstance(result, dict):
                return {
                    "job_id": job_id,
                    "status": "failed",
                    "error": "Invalid result format"
                }, 500
            
            # Ensure proper structure
            if 'job_id' not in result:
                result['job_id'] = job_id
            if 'status' not in result:
                result['status'] = 'completed'
            
            return result, 200
            
        except Exception as e:
            logger.error(f"Error getting job results: {e}", exc_info=True)
            return {
                "job_id": job_id,
                "status": "failed",
                "error": f"Failed to get job results: {str(e)}"
            }, 500
    
    def list_job_files(self, job_id: str) -> Dict[str, Any]:
        """
        List all files in the job directory.
        
        Args:
            job_id: Celery task ID
            
        Returns:
            Dictionary with list of filenames
        """
        try:
            job_dir = Path(self.config.JOB_STORAGE_PATH) / job_id
            
            if not job_dir.exists():
                return {
                    "error": f"Job directory not found: {job_id}"
                }, 404
            
            files = [f.name for f in job_dir.iterdir() if f.is_file()]
            # Sort files for consistent ordering
            files.sort()
            
            return {
                "job_id": job_id,
                "files": files
            }, 200
            
        except Exception as e:
            logger.error(f"Error listing job files: {e}", exc_info=True)
            return {
                "error": f"Failed to list job files: {str(e)}"
            }, 500

    def get_job_file(self, job_id: str, filename: str) -> Any:
        """
        Download a specific output file from a job.
        
        This allows users to download:
        - Output files (.out)
        - Optimized structures (.xyz)
        - IR spectrum data (.dat)
        - Wave function files (.gbw)
        - etc.
        
        Args:
            job_id: Celery task ID
            filename: Name of file to download
            
        Returns:
            File download response or error
        """
        try:
            # Security: Validate filename to prevent directory traversal
            if '..' in filename or '/' in filename or '\\' in filename:
                return {
                    "error": "Invalid filename"
                }, 400
            
            # Construct file path
            job_dir = Path(self.config.JOB_STORAGE_PATH) / job_id
            
            if not job_dir.exists():
                return {
                    "error": f"Job directory not found: {job_id}"
                }, 404
            
            file_path = job_dir / filename
            
            if not file_path.exists():
                return {
                    "error": f"File not found: {filename}"
                }, 404
            
            # Security: Ensure file is within job directory
            if not file_path.resolve().is_relative_to(job_dir.resolve()):
                return {
                    "error": "Access denied"
                }, 403
            
            # Return file path for FastAPI FileResponse
            return (str(file_path), filename), 200
            
        except Exception as e:
            logger.error(f"Error serving file: {e}", exc_info=True)
            return {
                "error": f"Failed to serve file: {str(e)}"
            }, 500
    
    @staticmethod
    def _infer_orca_task_type(job_id: str, result: Dict[str, Any]) -> str:
        """
        Infer the ORCA task type for jobs that predate the orca_task_type field.

        Strategy (in priority order):
        1. Read the stored ORCA input file (job.inp) and parse the keyword line.
        2. Infer from computed result fields (ir_frequencies → OPT_FREQ).
        3. Default to OPT (the most common calculation type).

        Side-effect: writes the inferred value back into the result JSON so
        subsequent calls skip the file read.
        """
        import json, re

        # --- 1. Read job.inp and look for task keywords in the ! line ---
        job_dir = Path(QCConfig.JOB_STORAGE_PATH) / job_id
        inp_file = job_dir / "job.inp"
        if inp_file.exists():
            try:
                content = inp_file.read_text(encoding='utf-8', errors='ignore').upper()
                # Collect all simple-keyword tokens from lines starting with '!'
                tokens: set = set()
                for line in content.splitlines():
                    stripped = line.strip()
                    if stripped.startswith('!'):
                        tokens.update(stripped[1:].split())

                if 'OPT' in tokens and ('FREQ' in tokens or 'NUMFREQ' in tokens):
                    task = 'OPT_FREQ'
                elif 'OPTTS' in tokens:
                    task = 'OPTTS'
                elif 'FREQ' in tokens or 'NUMFREQ' in tokens:
                    task = 'FREQ'
                elif 'OPT' in tokens:
                    task = 'OPT'
                elif 'SP' in tokens:
                    task = 'SP'
                else:
                    # No explicit task keyword → SP is the ORCA default
                    task = 'SP'

                # Cache the inferred value so we don't re-read the file next time
                result['orca_task_type'] = task
                try:
                    db_file = Path(QCConfig.RESULTS_DB_PATH) / f"{job_id}.json"
                    if db_file.exists():
                        with open(db_file, 'w') as f:
                            json.dump(result, f, indent=2)
                except Exception:
                    pass  # Cache write failure is non-fatal
                return task
            except Exception as e:
                logger.warning(f"Could not read job.inp for {job_id}: {e}")

        # --- 2. Infer from result fields ---
        computed = result.get('results', {})
        if computed.get('ir_frequencies') or computed.get('gibbs_free_energy_hartree'):
            return 'OPT_FREQ'

        # --- 3. Default ---
        return 'OPT'

    def _backfill_electrostatics(self, job_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Re-parse CHELPG charges and dipole moment for completed jobs that are
        missing these fields in their stored results (jobs run before the regex
        fallback parsers were added).

        Only triggers when both chelpg_charges AND dipole_magnitude_debye are
        absent AND the ORCA output file still exists on disk.
        Updates the stored JSON so the next fetch is instant.
        """
        computed = result.get('results', {})
        if not isinstance(computed, dict):
            return result

        # Only re-parse if electrostatics are genuinely missing
        already_has = computed.get('chelpg_charges') or computed.get('dipole_magnitude_debye')
        if already_has:
            return result

        job_dir = Path(self.config.JOB_STORAGE_PATH) / job_id
        output_file = job_dir / "job.out"
        if not output_file.exists():
            return result

        try:
            from services.qc.parsers import parse_electrostatics
            electro = parse_electrostatics(output_file)
            if electro and 'error' not in electro:
                computed.update(electro)
                result['results'] = computed
                # Persist the enriched result so next load is instant
                import json
                db_file = Path(self.config.RESULTS_DB_PATH) / f"{job_id}.json"
                with open(db_file, 'w') as f:
                    json.dump(result, f, indent=2)
                logger.info(f"Back-filled electrostatics for job {job_id}: "
                            f"chelpg={bool(electro.get('chelpg_charges'))}, "
                            f"dipole={electro.get('dipole_magnitude_debye')}")
        except Exception as e:
            logger.warning(f"Electrostatics back-fill failed for job {job_id}: {e}")

        return result

    def _backfill_missing_kpis(self, job_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Re-parse all KPIs for jobs missing data due to OPI version check crashes.

        The OPI output.parse() call can fail with an unsupported-version error even
        though ORCA itself completed normally. When that happens the task handler
        stores status=FAILED before running any parsers. This method detects that
        situation (key results absent + valid ORCA output on disk) and runs the
        file-based parsers retroactively, then promotes the job to COMPLETED.

        Covers: final_energy, FMO, thermochemistry, IR spectrum, final structure.
        Only triggers when key data is missing to avoid re-running on good jobs.
        """
        computed = result.get('results', {})
        if not isinstance(computed, dict):
            return result

        missing_energy = 'final_energy_hartree' not in computed
        orca_type = result.get('orca_task_type', '')
        missing_ir = orca_type == 'OPT_FREQ' and 'ir_frequencies' not in computed

        if not missing_energy and not missing_ir:
            return result

        job_dir = Path(self.config.JOB_STORAGE_PATH) / job_id
        output_file = job_dir / 'job.out'
        if not output_file.exists():
            return result

        from services.qc.parsers import check_orca_termination
        term = check_orca_termination(output_file)
        if not term.get('success'):
            return result

        try:
            from services.qc.parsers import (
                parse_final_energy, parse_fmo_data, parse_electrostatics,
                parse_thermo, parse_ir_spectrum
            )
            from services.qc.tasks import generate_ir_dat_file
            changed = False

            if missing_energy:
                energy = parse_final_energy(output_file)
                if energy is not None:
                    computed['final_energy_hartree'] = energy
                    changed = True

                fmo = parse_fmo_data(output_file)
                if 'error' not in fmo:
                    computed.update(fmo)
                    changed = True

                if not computed.get('chelpg_charges') and not computed.get('dipole_magnitude_debye'):
                    elec = parse_electrostatics(output_file)
                    if 'error' not in elec:
                        computed.update(elec)
                        changed = True

            if missing_ir or (orca_type == 'OPT_FREQ' and 'gibbs_free_energy_hartree' not in computed):
                thermo = parse_thermo(output_file)
                if 'error' not in thermo:
                    computed.update(thermo)
                    changed = True

                ir = parse_ir_spectrum(output_file)
                if 'error' not in ir:
                    if 'frequencies' in ir:
                        computed['ir_frequencies'] = ir['frequencies']
                    if 'intensities' in ir:
                        computed['ir_intensities'] = ir['intensities']
                    for field in ('modes', 'eps', 't_squared', 'tx', 'ty', 'tz'):
                        if field in ir:
                            computed[f'ir_{field}'] = ir[field]
                    try:
                        generate_ir_dat_file(job_dir, ir)
                        computed['ir_spectrum_file'] = str(job_dir / 'job.ir.dat')
                        result.setdefault('files', {})['ir_spectrum'] = str(job_dir / 'job.ir.dat')
                    except Exception:
                        pass
                    changed = True

            if 'final_structure_xyz' not in computed:
                xyz_path = job_dir / 'job.xyz'
                if xyz_path.exists():
                    computed['final_structure_xyz'] = xyz_path.read_text()
                    result.setdefault('files', {})['final_structure'] = str(xyz_path)
                    changed = True

            if changed:
                result['results'] = computed
                if result.get('status', '').upper() == 'FAILED' and computed.get('final_energy_hartree'):
                    result['status'] = 'COMPLETED'
                    result.pop('error', None)
                import json as _json
                db_file = Path(self.config.RESULTS_DB_PATH) / f"{job_id}.json"
                with open(db_file, 'w') as f:
                    _json.dump(result, f, indent=2)
                logger.info(f"Back-filled missing KPIs for job {job_id}")

        except Exception as e:
            logger.warning(f"KPI back-fill failed for job {job_id}: {e}")

        return result

    def list_jobs(self, limit: int = 50) -> Dict[str, Any]:
        """
        List recent jobs.
        
        Args:
            limit: Maximum number of jobs to return
            
        Returns:
            List of job summaries
        """
        logger.debug(f"list_jobs called with limit={limit}")
        try:
            results_dir = Path(self.config.RESULTS_DB_PATH)
            
            if not results_dir.exists():
                return {"jobs": []}, 200
            
            # Get all result files, sorted by modification time
            result_files = sorted(
                results_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )[:limit]
            
            jobs = []
            for result_file in result_files:
                try:
                    import json
                    with open(result_file, 'r') as f:
                        result = json.load(f)
                    
                    # Create summary with all required fields for frontend
                    # Normalize status to lowercase for frontend compatibility
                    status = result.get("status", "unknown")
                    if isinstance(status, str):
                        status = status.lower()
                        # Map Celery statuses to frontend statuses
                        if status in ["pending", "queued"]:
                            status = "pending"
                        elif status in ["running", "started"]:
                            status = "running"
                        elif status in ["completed", "success"]:
                            status = "completed"
                        elif status in ["failed", "failure", "revoked", "cancelled"]:
                            status = "failed"
                    
                    # Resolve orca_task_type — new jobs have it stored; infer for old ones
                    job_id = result.get("job_id", "")
                    orca_task_type = result.get("orca_task_type") or ""
                    if not orca_task_type and job_id and status == "completed":
                        orca_task_type = self._infer_orca_task_type(job_id, result)

                    job_summary = {
                        "id": result.get("job_id"),  # Frontend expects 'id', not 'job_id'
                        "job_id": result.get("job_id"),  # Keep for backward compatibility
                        "molecule_id": result.get("molecule_name") or "unknown",  # Use molecule_name from result
                        "status": status,
                        "job_type": result.get("job_type", "standard"),  # For frontend filtering
                        "orca_task_type": orca_task_type,  # Actual ORCA task: SP, OPT, OPT_FREQ
                        "method": result.get("method", "Unknown"),
                        "basis_set": result.get("basis_set", "Unknown"),
                        "created_at": result.get("timestamp_start", ""),
                        "updated_at": result.get("timestamp_end") or result.get("timestamp_start", ""),
                    }
                    
                    # Add key results if available
                    if "results" in result:
                        results = result["results"]
                        job_summary["final_energy"] = results.get("final_energy_hartree")
                        job_summary["homo_lumo_gap"] = results.get("gap_eV")
                    
                    jobs.append(job_summary)
                    
                except Exception as e:
                    logger.warning(f"Could not parse result file {result_file}: {e}")
                    continue
            
            # Return dictionary with 'jobs' key for frontend compatibility
            return {"jobs": jobs}, 200
            
        except Exception as e:
            logger.error(f"Error listing jobs: {e}", exc_info=True)
            return {
                "error": f"Failed to list jobs: {str(e)}"
            }, 500
    
    def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """
        Cancel a running or pending job.
        
        Args:
            job_id: Celery task ID
            
        Returns:
            Confirmation message
        """
        try:
            # Revoke the Celery task
            celery_app.control.revoke(job_id, terminate=True)
            
            # Update the persistent job status
            # This is crucial because list_jobs reads from these files, 
            # and the worker might not be able to update the file if it's killed hard.
            result = load_results_from_db(job_id)
            if result:
                # Update status to failed (which covers cancelled/revoked in frontend)
                result['status'] = 'CANCELLED'
                result['error'] = 'Job cancelled by user'
                
                # Update timestamp if not present
                if 'timestamp_end' not in result:
                    from datetime import datetime
                    result['timestamp_end'] = datetime.now().isoformat()
                
                # Save back to database
                from services.qc.tasks import save_results_to_db
                save_results_to_db(job_id, result)
                logger.info(f"Updated job {job_id} status to CANCELLED in database")
            
            return {
                "message": f"Job {job_id} has been cancelled"
            }, 200
            
        except Exception as e:
            logger.error(f"Error cancelling job: {e}", exc_info=True)
            return {
                "error": f"Failed to cancel job: {str(e)}"
            }, 500
    
    def get_method_presets(self) -> Dict[str, Any]:
        """
        Get available method presets.
        
        Returns:
            Dictionary of available calculation presets
        """
        return {
            "presets": self.config.METHOD_PRESETS
        }, 200
    
    def get_mo_data(self, job_id: str) -> Dict[str, Any]:
        """
        Get molecular orbital data for client-side visualization.
        
        This endpoint serves the ORCA JSON file which contains:
        - Molecular geometry (atom positions)
        - Basis set information (shells, exponents, coefficients)
        - MO coefficients and energies
        
        This data can be used for client-side orbital visualization
        using Molstar's alpha-orbitals approach.
        
        Args:
            job_id: Celery task ID
            
        Returns:
            Dictionary with MO data or error
        """
        try:
            import json
            
            # Get job directory
            job_dir = Path(self.config.JOB_STORAGE_PATH) / job_id
            
            if not job_dir.exists():
                return {
                    "error": f"Job directory not found: {job_id}"
                }, 404
            
            # Load the main ORCA JSON file
            json_file = job_dir / "job.json"
            if not json_file.exists():
                return {
                    "error": "MO data not available (job.json not found)"
                }, 404
            
            with open(json_file, 'r') as f:
                orca_data = json.load(f)
            
            # Load property JSON for additional info
            prop_file = job_dir / "job.property.json"
            prop_data = None
            if prop_file.exists():
                with open(prop_file, 'r') as f:
                    prop_data = json.load(f)
            
            # Extract key information for easier frontend consumption
            molecule = orca_data.get("Molecule", {})
            atoms_data = molecule.get("Atoms", [])
            
            # Build geometry data in expected format
            # ORCA stores coords in Atoms[].Coords, not in separate Geometry object
            cartesians = []
            for atom in atoms_data:
                element = atom.get("ElementLabel", "X")
                coords = atom.get("Coords", [0, 0, 0])
                cartesians.append([element, coords[0], coords[1], coords[2]])
            
            # Get coordinate units from molecule level
            coord_units = molecule.get("CoordinateUnits", "a.u.")
            
            # Calculate total electrons from atomic numbers minus charge
            total_electrons = sum(atom.get("ElementNumber", 0) for atom in atoms_data)
            charge = molecule.get("Charge", 0)
            n_electrons = total_electrons - charge
            
            mo_data = {
                "geometry": {
                    "Coordinates": {
                        "Cartesians": cartesians,
                        "Type": "Cartesians",
                        "Units": coord_units
                    },
                    "NAtoms": len(atoms_data)
                },
                "atoms": atoms_data,
                "molecular_orbitals": molecule.get("MolecularOrbitals", {}),
                "n_electrons": n_electrons
            }
            
            return {
                "job_id": job_id,
                "mo_data": mo_data
            }, 200
            
        except Exception as e:
            logger.error(f"Error serving MO data: {e}", exc_info=True)
            return {
                "error": f"Failed to serve MO data: {str(e)}"
            }, 500


    def get_normal_modes(self, job_id: str) -> Tuple[Dict[str, Any], int]:
        """
        Get normal mode data for a completed job.
        
        Args:
            job_id: Job ID
            
        Returns:
            Tuple of (data dictionary, status_code)
        """
        try:
            from services.qc.parsers import parse_normal_modes
            from services.qc.config import QCConfig
            
            # Get job directory
            job_dir = Path(QCConfig.JOB_STORAGE_PATH) / job_id
            if not job_dir.exists():
                return {
                    "error": f"Job {job_id} not found"
                }, 404
            
            # Find output file
            output_file = job_dir / "job.out"
            if not output_file.exists():
                return {
                    "error": "Output file not found"
                }, 404
            
            # Parse normal modes
            normal_modes = parse_normal_modes(output_file)
            
            if "error" in normal_modes:
                return normal_modes, 400

            # Classify modes using internal coordinate displacement analysis
            if (normal_modes.get("displacements") and
                    normal_modes.get("equilibrium_geometry") and
                    normal_modes.get("atom_symbols")):
                try:
                    from services.qc.parsers import classify_normal_modes
                    normal_modes["classifications"] = classify_normal_modes(
                        normal_modes["displacements"],
                        normal_modes["equilibrium_geometry"],
                        normal_modes["atom_symbols"],
                    )
                except Exception as cls_err:
                    logger.warning(f"Mode classification failed for {job_id}: {cls_err}")
                    normal_modes["classifications"] = None
            else:
                normal_modes["classifications"] = None

            return {
                "job_id": job_id,
                "normal_modes": normal_modes
            }, 200
            
        except Exception as e:
            logger.error(f"Error getting normal modes: {e}", exc_info=True)
            return {
                "error": f"Failed to get normal modes: {str(e)}"
            }, 500

    def generate_mode_trajectory(
        self, 
        job_id: str, 
        mode_index: int, 
        num_frames: int = 60,
        amplitude: float = 0.5
    ) -> Tuple[Dict[str, Any], int]:
        """
        Generate trajectory for a specific normal mode.
        
        Creates a multi-model PDB trajectory by displacing atoms along
        the normal mode vector in a sinusoidal pattern.
        
        Args:
            job_id: Job ID
            mode_index: Index of the normal mode (0-based)
            num_frames: Number of frames to generate (default: 60)
            amplitude: Amplitude of displacement in Angstroms (default: 0.5)
            
        Returns:
            Tuple of (data dictionary with pdb_data, status_code)
        """
        try:
            import numpy as np
            from services.qc.parsers import parse_normal_modes, _build_connectivity
            from services.qc.config import QCConfig
            
            # Get job directory
            job_dir = Path(QCConfig.JOB_STORAGE_PATH) / job_id
            if not job_dir.exists():
                return {
                    "error": f"Job {job_id} not found"
                }, 404
            
            # Find output file
            output_file = job_dir / "job.out"
            if not output_file.exists():
                return {
                    "error": "Output file not found"
                }, 404
            
            # Parse normal modes
            normal_modes_data = parse_normal_modes(output_file)
            
            if "error" in normal_modes_data:
                return normal_modes_data, 400
            
            frequencies = normal_modes_data.get("frequencies", [])
            displacements = normal_modes_data.get("displacements")
            equilibrium_geometry = normal_modes_data.get("equilibrium_geometry")
            atom_symbols = normal_modes_data.get("atom_symbols")
            
            if not frequencies:
                return {
                    "error": "No frequencies found"
                }, 400
            
            if mode_index < 0 or mode_index >= len(frequencies):
                return {
                    "error": f"Mode index {mode_index} out of range (0-{len(frequencies)-1})"
                }, 400
            
            if displacements is None:
                return {
                    "error": "Displacement vectors not available for this job"
                }, 400
            
            if equilibrium_geometry is None:
                return {
                    "error": "Equilibrium geometry not available"
                }, 400
            
            if atom_symbols is None:
                return {
                    "error": "Atom symbols not available"
                }, 400
            
            # Get the specific mode's displacement vector
            mode_displacement = np.array(displacements[mode_index])  # [atom][x,y,z]
            equilibrium = np.array(equilibrium_geometry)  # [atom][x,y,z]

            # ORCA normal modes are mass-weighted eigenvectors.
            # Convert to Cartesian displacements: Δr_i = q_i / sqrt(m_i)
            _ATOMIC_MASSES = {
                'H': 1.008, 'He': 4.003, 'Li': 6.941, 'Be': 9.012,
                'B': 10.81, 'C': 12.011, 'N': 14.007, 'O': 15.999,
                'F': 18.998, 'Ne': 20.180, 'Na': 22.990, 'Mg': 24.305,
                'Al': 26.982, 'Si': 28.086, 'P': 30.974, 'S': 32.065,
                'Cl': 35.453, 'Ar': 39.948, 'K': 39.098, 'Ca': 40.078,
                'Fe': 55.845, 'Co': 58.933, 'Ni': 58.693, 'Cu': 63.546,
                'Zn': 65.38, 'Br': 79.904, 'Se': 78.971, 'I': 126.904,
            }
            masses = np.array([
                _ATOMIC_MASSES.get(s, 12.0) for s in atom_symbols
            ])  # shape (n_atoms,)
            sqrt_masses = np.sqrt(masses)[:, np.newaxis]  # shape (n_atoms, 1) for broadcasting
            mode_displacement = mode_displacement / sqrt_masses

            # Normalize displacement vector (scale to unit magnitude)
            # Calculate magnitude for each atom's displacement
            atom_displacements_magnitude = np.linalg.norm(mode_displacement, axis=1)
            max_displacement = np.max(atom_displacements_magnitude)
            
            if max_displacement < 1e-10:
                return {
                    "error": f"Mode {mode_index} has zero displacement (likely translational/rotational mode)"
                }, 400
            
            # Normalize so maximum displacement is 1.0
            normalized_displacement = mode_displacement / max_displacement
            
            # Generate trajectory frames
            # r(t) = r0 + A * cos(2πft) * d
            # where A is amplitude, f is frequency (we'll use frame index as time), d is normalized displacement
            pdb_lines = []
            
            for frame_idx in range(num_frames):
                # Calculate phase: 0 to 2π for one complete cycle
                phase = 2.0 * np.pi * frame_idx / num_frames
                cos_phase = np.cos(phase)
                
                # Calculate displaced coordinates
                displacement_vectors = amplitude * cos_phase * normalized_displacement
                frame_coords = equilibrium + displacement_vectors
                
                # Write MODEL record
                pdb_lines.append(f"MODEL        {frame_idx + 1:4d}")
                
                # Write HETATM records (HETATM lets Mol* recognise the residue as a
                # small-molecule ligand so the 'ligand' component selector picks it up)
                for atom_idx, (symbol, coords) in enumerate(zip(atom_symbols, frame_coords)):
                    x, y, z = coords
                    # PDB HETATM: cols 1-6 record, 7-11 serial, 12 blank,
                    # 13-16 name, 17 altLoc, 18-20 resName, 22 chain,
                    # 23-26 resSeq, 31-38 x, 39-46 y, 47-54 z,
                    # 55-60 occ, 61-66 bfac, 77-78 element
                    name = f" {symbol:<3s}" if len(symbol) == 1 else f"{symbol:<4s}"
                    pdb_lines.append(
                        f"HETATM{atom_idx+1:5d} {name} MOL A   1    "
                        f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {symbol:>2s}"
                    )
                
                pdb_lines.append("ENDMDL")
            
            # Add CONECT records so Mol* uses explicit connectivity instead of
            # distance-based bond detection — bonds won't disappear during animation
            # when atoms swing past the distance threshold.
            bonds = _build_connectivity(equilibrium, atom_symbols)
            for i, j in bonds:
                pdb_lines.append(f"CONECT{i+1:5d}{j+1:5d}")
            pdb_lines.append("END")
            pdb_content = "\n".join(pdb_lines)
            
            return {
                "job_id": job_id,
                "mode_index": mode_index,
                "frequency": frequencies[mode_index],
                "num_frames": num_frames,
                "pdb_data": pdb_content
            }, 200
            
        except Exception as e:
            logger.error(f"Error generating mode trajectory: {e}", exc_info=True)
            return {
                "error": f"Failed to generate trajectory: {str(e)}"
            }, 500

    def add_hydrogens(self, molecule_data: str) -> Dict[str, Any]:
        """
        Add hydrogens to a molecule using RDKit.
        Supports PDB, SDF, and XYZ formats (auto-detected).
        
        Args:
            molecule_data: Molecule in PDB, SDF, or XYZ format
            
        Returns:
            Dictionary with molecule_xyz or error
        """
        try:
            from rdkit import Chem
            from rdkit.Chem import AllChem
            
            mol = None
            input_format = None
            
            # Try to detect format and parse molecule
            # 1. Try PDB format
            if 'ATOM' in molecule_data or 'HETATM' in molecule_data:
                try:
                    mol = Chem.MolFromPDBBlock(molecule_data, removeHs=False)
                    if mol is not None:
                        input_format = 'PDB'
                        logger.info("Detected PDB format")
                except Exception as e:
                    logger.debug(f"Failed to parse as PDB: {e}")
            
            # 2. Try SDF format
            if mol is None and ('$$$$' in molecule_data or 'V2000' in molecule_data or 'V3000' in molecule_data):
                try:
                    mol = Chem.MolFromMolBlock(molecule_data, removeHs=False)
                    if mol is not None:
                        input_format = 'SDF'
                        logger.info("Detected SDF/MOL format")
                except Exception as e:
                    logger.debug(f"Failed to parse as SDF: {e}")
            
            # 3. Try XYZ format
            if mol is None:
                try:
                    lines = molecule_data.strip().split('\n')
                    if len(lines) >= 3:
                        # Check if first line is a number (atom count)
                        try:
                            n_atoms = int(lines[0].strip())
                            input_format = 'XYZ'
                            logger.info("Detected XYZ format")
                            
                            # Parse XYZ manually
                            mol = Chem.RWMol()
                            coords = []
                            
                            for i, line in enumerate(lines[2:2+n_atoms]):
                                parts = line.strip().split()
                                if len(parts) < 4:
                                    return {"error": f"Invalid XYZ format at line {i+3}: expected element and 3 coordinates"}, 400
                                
                                element = parts[0]
                                try:
                                    x, y, z = float(parts[1]), float(parts[2]), float(parts[3])
                                except ValueError:
                                    return {"error": f"Invalid XYZ format at line {i+3}: coordinates must be numbers"}, 400
                                
                                # Add atom
                                atom = Chem.Atom(element)
                                mol.AddAtom(atom)
                                coords.append((x, y, z))
                            
                            # Set 3D coordinates
                            conf = Chem.Conformer(n_atoms)
                            for i, (x, y, z) in enumerate(coords):
                                conf.SetAtomPosition(i, (x, y, z))
                            mol.AddConformer(conf)
                            
                        except (ValueError, IndexError):
                            pass
                except Exception as e:
                    logger.debug(f"Failed to parse as XYZ: {e}")
            
            # If we still don't have a molecule, return error
            if mol is None:
                return {
                    "error": "Could not parse molecule. Supported formats: PDB, SDF/MOL, XYZ. "
                           "Please ensure the input is in one of these formats."
                }, 400
            
            # Add hydrogens
            mol_with_h = Chem.AddHs(mol, addCoords=True)
            
            # If molecule already has a conformer, use it; otherwise embed
            if mol_with_h.GetNumConformers() == 0:
                AllChem.EmbedMolecule(mol_with_h, useRandomCoords=False, randomSeed=42)
            else:
                # Generate coordinates only for the new hydrogens
                AllChem.EmbedMolecule(mol_with_h, useRandomCoords=False, randomSeed=42)
            
            # Convert to XYZ format for output
            conf_with_h = mol_with_h.GetConformer()
            n_atoms_with_h = mol_with_h.GetNumAtoms()
            
            xyz_lines = [
                str(n_atoms_with_h),
                f"Generated by RDKit with hydrogens added (from {input_format} format)"
            ]
            for i in range(n_atoms_with_h):
                atom = mol_with_h.GetAtomWithIdx(i)
                pos = conf_with_h.GetAtomPosition(i)
                symbol = atom.GetSymbol()
                xyz_lines.append(f"{symbol:2s} {pos.x:12.6f} {pos.y:12.6f} {pos.z:12.6f}")
            
            new_xyz = '\n'.join(xyz_lines)
            return {"molecule_xyz": new_xyz}, 200
                    
        except Exception as e:
            logger.error(f"Error adding hydrogens: {e}", exc_info=True)
            return {"error": f"Failed to add hydrogens: {str(e)}"}, 500


    def preview_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a preview of the ORCA input file.
        
        Args:
            job_data: Dictionary containing job parameters
            
        Returns:
            Dictionary with input_file_content or error
        """
        try:
            # Validate required fields
            if not job_data:
                return {"error": "Missing request body"}, 400
            
            molecule_xyz = job_data.get('molecule_xyz')
            if not molecule_xyz:
                return {"error": "Missing required field: molecule_xyz"}, 400
            
            # Validate structure type for QC service (requires small molecule)
            try:
                validation_result = validate_structure_for_service(
                    'qc',
                    molecule_xyz,
                    format=None  # Let validator auto-detect
                )
                if not validation_result['valid']:
                    error_msg = '; '.join(validation_result['errors'])
                    logger.error(f"Preview QC validation failed: {error_msg}")
                    return {"error": error_msg}, 400
            except StructureValidationError as e:
                logger.error(f"Preview QC structure validation error: {e}")
                return {"error": str(e)}, 400
            except Exception as e:
                logger.error(f"Preview structure validation exception: {e}", exc_info=True)
                return {"error": f"Structure validation failed: {str(e)}"}, 400
            
            # Generate preview
            input_content = generate_preview(job_data)
            
            return {
                "input_file_content": input_content
            }, 200
            
        except Exception as e:
            logger.error(f"Error generating preview: {e}", exc_info=True)
            return {
                "error": f"Failed to generate preview: {str(e)}"
            }, 500


# Create singleton instance
qc_service = QuantumChemistryService()


# Flask route registration removed - routes are now in services/qc/routers.py (FastAPI)
