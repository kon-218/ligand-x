"""
Quantum Chemistry Celery Tasks

This module defines asynchronous Celery tasks for running ORCA quantum
chemistry calculations using the official orca-pi (OPI) library.

Key features:
- Job isolation via unique working directories
- Comprehensive error handling and validation
- Multi-step pipeline (pre-opt, opt, freq, properties)
- Result parsing and persistence
"""

import os
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import logging

from celery import Celery, Task
from celery.exceptions import SoftTimeLimitExceeded

from services.qc.config import QCConfig

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Celery app FIRST (before other imports that might fail)
# This ensures celery_app is always available even if other imports fail
celery_app = Celery(
    'qc_tasks',
    broker=QCConfig.CELERY_BROKER_URL,
    backend=QCConfig.CELERY_RESULT_BACKEND
)

# Configure Celery
# Determine if we're in development mode
IS_DEVELOPMENT = os.getenv('NODE_ENV', 'production') == 'development' or os.getenv('LOG_LEVEL', 'INFO') == 'DEBUG'

celery_app.conf.update(
    task_track_started=QCConfig.CELERY_TASK_TRACK_STARTED,
    broker_connection_retry_on_startup=QCConfig.CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP,
    task_soft_time_limit=QCConfig.TASK_SOFT_TIME_LIMIT,
    task_hard_time_limit=QCConfig.TASK_HARD_TIME_LIMIT,
    # Eager mode settings (for development)
    task_always_eager=False,
    task_eager_propagates=False,
    # Route all QC tasks to the 'qc' queue
    task_routes={
        'qc_tasks.*': {'queue': 'qc'},
    },

    # Worker settings
    worker_prefetch_multiplier=1,  # Prefetch only 1 task (QC tasks are long-running)
    task_acks_late=True,
    task_reject_on_worker_lost=False,

    # RabbitMQ broker options
    broker_connection_retry=True,
    broker_connection_max_retries=10,
    broker_transport_options={
        'visibility_timeout': QCConfig.TASK_HARD_TIME_LIMIT + 600,  # Task limit + 10 min buffer
        'confirm_publish': True,
        'max_retries': 3,
        'interval_start': 0,
        'interval_step': 2,
        'interval_max': 30,
        'client_properties': {'connection_name': 'QC Worker Tasks'},
    },

    # Queue durability - Development: non-durable (don't persist across restarts)
    #                   Production: durable (survive broker restart)
    task_queue_durable=not IS_DEVELOPMENT,
    task_queue_auto_delete=IS_DEVELOPMENT,  # Auto-delete queues in dev after all consumers disconnect
)

# Export as 'celery' for Celery CLI compatibility (celery -A services.qc.tasks worker)
# This allows the worker to find the app using the default attribute name
celery = celery_app

logger.info("[PROCESS] Celery running in normal mode - requires separate worker process")

# Import parsers (may fail if dependencies not available, but celery_app is already defined)
try:
    from services.qc.parsers import (
        parse_fmo_data,
        parse_electrostatics,
        parse_thermo,
        parse_smd_solvation_energy,
        parse_ir_spectrum,
        check_orca_termination,
        parse_final_energy
    )
    PARSERS_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Parsers not available: {e}")
    PARSERS_AVAILABLE = False
    # Define dummy functions to prevent NameError
    def parse_fmo_data(*args, **kwargs):
        raise RuntimeError("Parsers not available")
    def parse_electrostatics(*args, **kwargs):
        raise RuntimeError("Parsers not available")
    def parse_thermo(*args, **kwargs):
        raise RuntimeError("Parsers not available")
    def parse_smd_solvation_energy(*args, **kwargs):
        raise RuntimeError("Parsers not available")
    def parse_ir_spectrum(*args, **kwargs):
        raise RuntimeError("Parsers not available")
    def check_orca_termination(*args, **kwargs):
        raise RuntimeError("Parsers not available")
    def parse_final_energy(*args, **kwargs):
        raise RuntimeError("Parsers not available")

# Set ORCA path environment variable BEFORE importing OPI
# OPI checks for ORCA at import time
if 'ORCA_PATH' not in os.environ:
    os.environ['ORCA_PATH'] = QCConfig.ORCA_PATH

# Also add ORCA directory to PATH so OPI can find the executable
orca_dir = os.path.dirname(QCConfig.ORCA_PATH)
if orca_dir not in os.environ.get('PATH', ''):
    os.environ['PATH'] = f"{orca_dir}:{os.environ.get('PATH', '')}"

logger.info(f"ORCA_PATH set to: {os.environ.get('ORCA_PATH')}")
logger.info(f"ORCA directory added to PATH: {orca_dir}")

# Try to import orca-pi (OPI) with all required modules from the tutorial
try:
    from opi.core import Calculator
    from opi.output.core import Output
    from opi.input.simple_keywords import (
        Dft,
        Task as OrcaTask,
        BasisSet,
        Approximation,
        AuxBasisSet,
        DispersionCorrection
    )
    from opi.input.structures.structure import Structure
    from opi.input.blocks.block_freq import BlockFreq
    from opi.input.blocks.block_cpcm import BlockCpcm
    OPI_AVAILABLE = True
    logger.info("[SUCCESS] orca-pi (OPI) imported successfully")
    # Patch OPI version check to support ORCA 6.1.0 (OPI 2.0.0 requires >= 6.1.1-f.0
    # but ORCA 6.1.0 is functionally compatible for our use case)
    try:
        import opi.execution.core as _opi_exec
        _opi_exec.check_minimal_version = lambda _: True
        logger.info("Applied OPI version check patch for ORCA 6.1.0 compatibility")
    except Exception as _patch_err:
        logger.warning(f"Could not patch OPI version check: {_patch_err}")
    # Also patch version checks in OPI output parsing (added in newer OPI versions)
    try:
        import opi.output.core as _opi_out_core
        if hasattr(_opi_out_core, 'check_minimal_version'):
            _opi_out_core.check_minimal_version = lambda _: True
        try:
            import opi.output.property_file as _opi_prop
            if hasattr(_opi_prop, 'check_minimal_version'):
                _opi_prop.check_minimal_version = lambda _: True
        except ImportError:
            pass
        logger.info("Applied OPI output version check patch for ORCA 6.1.0 compatibility")
    except Exception as _patch_err2:
        logger.warning(f"Could not patch OPI output version check: {_patch_err2}")
except ImportError as e:
    OPI_AVAILABLE = False
    logger.error(f"orca-pi not installed. Install with: pip install orca-pi. Error: {e}")

# Try to import RDKit for molecular conversion
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False
    logger.warning("RDKit not available. Molecular format conversion may fail.")


# Try to import opi_helper functions (may fail if dependencies not available)
try:
    from services.qc.opi_helper import convert_to_simple_xyz, configure_calculator, compute_fukui_charge, inject_robust_scf_settings, inject_robust_scf_settings_fukui, inject_mdci_settings
    OPI_HELPER_AVAILABLE = True
except ImportError as e:
    logger.warning(f"opi_helper not available: {e}")
    OPI_HELPER_AVAILABLE = False
    # Define dummy functions to prevent NameError
    def convert_to_simple_xyz(*args, **kwargs):
        raise RuntimeError("opi_helper not available")
    def configure_calculator(*args, **kwargs):
        raise RuntimeError("opi_helper not available")
    def compute_fukui_charge(*args, **kwargs):
        raise RuntimeError("opi_helper not available")
    def inject_robust_scf_settings(*args, **kwargs):
        raise RuntimeError("opi_helper not available")
    def inject_robust_scf_settings_fukui(*args, **kwargs):
        raise RuntimeError("opi_helper not available")
    def inject_mdci_settings(*args, **kwargs):
        raise RuntimeError("opi_helper not available")

try:
    import pandas as pd
    import numpy as np
except ImportError:
    pass

try:
    from opi.input.simple_keywords import SimpleKeyword, ForceField, Scf
except ImportError:
    pass


class QCTask(Task):
    """Base task class with error handling."""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log task failures."""
        logger.error(f"Task {task_id} failed: {exc}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Log task successes."""
        logger.info(f"Task {task_id} completed successfully")


@celery_app.task(bind=True, base=QCTask, name='qc_tasks.run_orca_job_opi')
def run_orca_job_opi(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run an ORCA quantum chemistry calculation using the official OPI library.
    
    This is the main Celery task that executes long-running QC calculations.
    It runs on a worker machine, NOT on the Flask web server.
    
    Job Isolation:
    Each job gets a unique working directory based on the Celery task ID.
    This prevents file collisions when running concurrent calculations.
    
    Args:
        job_data: Dictionary containing:
            - molecule_xyz: XYZ coordinate string
            - charge: Molecular charge (default: 0)
            - multiplicity: Spin multiplicity (default: 1)
            - method: QC method (e.g., 'B3LYP', default from preset)
            - basis: Basis set (e.g., 'def2-SVP', default from preset)
            - job_type: 'SP', 'OPT', 'FREQ', 'OPT_FREQ' (default: 'OPT')
            - n_procs: Number of CPU cores (default: from config)
            - memory_mb: Memory limit in MB (default: from config)
            - preset: Use a method preset (e.g., 'standard_opt')
            - solvation: Solvent name for implicit solvation (e.g., 'WATER')
            - calculate_properties: If True, calculate CHELPG, orbitals, etc.
    
    Returns:
        Dictionary containing:
        - status: 'COMPLETED' or 'FAILED'
        - job_id: Celery task ID
        - results: Dictionary of all calculated KPIs
        - files: Paths to output files for visualization
        - timestamp: Completion time
        - error: Error message if failed
    """
    
    if not OPI_AVAILABLE:
        return {
            "status": "FAILED",
            "error": "orca-pi library not installed. Please install with: pip install orca-pi"
        }
    
    # Get job ID from Celery
    job_id = self.request.id
    logger.info(f"Starting QC job {job_id}")
    
    # Create unique working directory
    QCConfig.ensure_directories()
    job_dir = Path(QCConfig.JOB_STORAGE_PATH) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize result dictionary
    result = {
        "job_id": job_id,
        "status": "RUNNING",
        "timestamp_start": datetime.now().isoformat(),
        "results": {},
        "files": {}
    }
    
    # Store job metadata for frontend compatibility
    result["method"] = None
    result["basis_set"] = None
    result["molecule_name"] = job_data.get('molecule_name')  # Store molecule name for display
    result["input_smiles"] = job_data.get('smiles')  # Preserve original SMILES for downstream conformer jobs
    
    # Determine job_type for frontend filtering
    raw_job_type = job_data.get('job_type', 'OPT').upper()
    if 'FREQ' in raw_job_type:
        result["job_type"] = "ir"  # IR spectrum calculation
    else:
        result["job_type"] = "standard"  # Standard QC calculation
    # Store the raw ORCA task type so frontend can distinguish OPT from SP
    result["orca_task_type"] = raw_job_type  # "SP", "OPT", "OPT_FREQ", etc.
    
    try:
        # Extract and validate input parameters
        molecule_data = job_data.get('molecule_xyz')
        if not molecule_data:
            raise ValueError("Missing required parameter: molecule_xyz")
        
        # Convert to simple XYZ format (handles PDB, SDF, SMILES)
        logger.info("Converting molecular data to simple XYZ format...")
        xyz_string = convert_to_simple_xyz(molecule_data)
        
        charge = int(job_data.get('charge') or 0)
        mult = int(job_data.get('multiplicity') or 1)
        n_procs = int(job_data.get('n_procs') or QCConfig.DEFAULT_N_PROCS)
        memory_mb = int(job_data.get('memory_mb') or QCConfig.DEFAULT_MEMORY_MB)
        
        # Get calculation settings (from preset or explicit)
        preset = job_data.get('preset')
        if preset and preset in QCConfig.METHOD_PRESETS:
            preset_data = QCConfig.METHOD_PRESETS[preset]
            method = preset_data['method']
            basis = preset_data.get('basis', '')
        else:
            method = job_data.get('method', 'B3LYP')
            # Import validation module for method categorization
            # Based on ORCA Manual Section 7.4
            from services.qc.validation import METHODS_WITHOUT_BASIS, normalize_method_name
            
            method_normalized = normalize_method_name(method)
            
            # For methods that don't use basis sets (xTB, semi-empirical, composite methods),
            # default to empty string if not explicitly provided
            if method_normalized in METHODS_WITHOUT_BASIS:
                basis = job_data.get('basis_set') or job_data.get('basis', '')
            else:
                basis = job_data.get('basis_set') or job_data.get('basis', 'def2-SVP')
        
        # Store method and basis_set in result for frontend
        result["method"] = method
        result["basis_set"] = basis
        
        # Save initial job metadata immediately so it appears in job list
        save_results_to_db(job_id, result)
        logger.info(f"Saved initial job metadata for {job_id} (status: RUNNING)")
        
        job_type = job_data.get('job_type', 'OPT').upper()
        compute_frequencies = job_data.get('compute_frequencies', False)
        solvation = job_data.get('solvation')
        calculate_properties = job_data.get('calculate_properties', True)
        
        # Calculate memory per core (ORCA uses %maxcore per core)
        memory_per_core = memory_mb // n_procs
        
        # Save input XYZ to file
        xyz_file = job_dir / "input.xyz"
        xyz_file.write_text(xyz_string)
        
        # Create OPI Structure
        logger.info(f"Creating structure from XYZ (charge={charge}, mult={mult})")
        structure = Structure.from_xyz(str(xyz_file))
        structure.charge = charge
        structure.multiplicity = mult
        
        # Set up OPI Calculator
        calc = Calculator(basename="job", working_dir=str(job_dir))
        calc.structure = structure
        calc.input.ncores = n_procs
        calc.input.maxcore = memory_per_core
        
        # Configure Calculator using helper
        logger.info("Configuring OPI Calculator from parameters...")
        configure_calculator(calc, job_data)
        
        # Write input and run calculation using OPI
        logger.info("Writing ORCA input file...")
        calc.write_input()
        
        # For OPT+FREQ jobs (IR spectra) or larger molecules, inject robust SCF settings.
        # Skip for CC methods — they use HF reference which doesn't need DFT damping heuristics,
        # and the aggressive damping can slow HF convergence.
        job_type = job_data.get('job_type', 'OPT').upper()
        input_file_path = job_dir / "job.inp"
        from services.qc.validation import COUPLED_CLUSTER_METHODS, normalize_method_name as _norm
        _is_cc = _norm(job_data.get('method', '')).upper() in COUPLED_CLUSTER_METHODS
        if not _is_cc and ('FREQ' in job_type or job_data.get('compute_frequencies', False)):
            # Count atoms from XYZ for logging (first line is atom count)
            xyz_lines = xyz_string.strip().split('\n')
            n_atoms = int(xyz_lines[0].strip()) if xyz_lines else 0
            logger.info(f"Injecting robust SCF settings for {job_type} calculation ({n_atoms} atoms)")
            inject_robust_scf_settings(str(input_file_path), n_atoms)

        # Inject %mdci block for coupled cluster calculations if CC params were set
        cc_params = getattr(calc, '_cc_params', None)
        if cc_params:
            logger.info(f"Injecting %mdci settings for coupled cluster calculation: {cc_params}")
            inject_mdci_settings(str(input_file_path), cc_params)

        logger.info("Starting ORCA calculation...")
        calc.run()
        
        # Get output using OPI and check for normal termination
        logger.info(f"ORCA calculation finished, parsing output...")
        output = calc.get_output()
        
        # Check for normal termination using OPI method
        if not output.terminated_normally():
            # Capture the last 50 lines of the output file for debugging
            output_file = job_dir / "job.out"
            error_context = ""
            
            # Add input file content
            input_file = job_dir / "job.inp"
            if input_file.exists():
                try:
                    input_content = input_file.read_text()
                    error_context += "\n" + "="*60 + "\n"
                    error_context += "ORCA INPUT FILE:\n"
                    error_context += "="*60 + "\n"
                    error_context += input_content
                    error_context += "\n" + "="*60 + "\n"
                except Exception as e:
                    logger.warning(f"Could not read input file for error context: {e}")

            if output_file.exists():
                try:
                    with open(output_file, 'r') as f:
                        lines = f.readlines()
                        tail_lines = lines[-50:] if len(lines) > 50 else lines
                        error_context += "\n" + "="*60 + "\n"
                        error_context += "ORCA OUTPUT (last 50 lines):\n"
                        error_context += "="*60 + "\n"
                        error_context += "".join(tail_lines)
                        error_context += "="*60
                        logger.error(f"ORCA failed for job {job_id}. Output tail:{error_context}")
                except Exception as e:
                    logger.warning(f"Could not read output file for error context: {e}")
            
            raise RuntimeError(f"ORCA did not terminate normally. Check output file for errors.{error_context}")
        
        # Parse the output with OPI (version-check errors are non-fatal since
        # all KPI parsers read directly from output files, not the OPI output object)
        try:
            output.parse()
        except Exception as e:
            logger.warning(
                f"OPI output.parse() failed for {job_id} "
                f"(will use file-based parsers): {e}"
            )
            # Continue — file-based parsers don't need the OPI output object
        
        # Get basic results
        output_file = job_dir / "job.out"
        
        # Check termination status
        term_check = check_orca_termination(output_file)
        if not term_check['success']:
            raise RuntimeError(term_check.get('error', 'Unknown termination error'))
        
        # Parse all KPIs with graceful degradation
        logger.info("Extracting KPIs from output...")
        parsing_errors = []
        
        # Final energy (critical - if this fails, the job is likely invalid)
        final_energy = parse_final_energy(output_file)
        if final_energy is not None:
            result['results']['final_energy_hartree'] = final_energy
        else:
            parsing_errors.append("Final energy could not be parsed")
        
        # FMO data (HOMO/LUMO/Gap) - important but not critical
        fmo_data = parse_fmo_data(output_file)
        if 'error' not in fmo_data:
            result['results'].update(fmo_data)
        else:
            parsing_errors.append(f"FMO data: {fmo_data['error']}")
            logger.warning(f"FMO parsing failed for job {job_id}: {fmo_data['error']}")
        
        # Electrostatics (CHELPG, dipole) - optional properties
        if calculate_properties:
            electro_data = parse_electrostatics(output_file)
            if 'error' not in electro_data:
                result['results'].update(electro_data)
            else:
                parsing_errors.append(f"Electrostatics: {electro_data['error']}")
                logger.warning(f"Electrostatics parsing failed for job {job_id}: {electro_data['error']}")
        
        # Thermochemistry (if frequency calculation) - optional
        if 'FREQ' in job_type or 'NUMFREQ' in job_type:
            thermo_data = parse_thermo(output_file)
            if 'error' not in thermo_data:
                result['results'].update(thermo_data)
            else:
                parsing_errors.append(f"Thermochemistry: {thermo_data['error']}")
                logger.warning(f"Thermochemistry parsing failed for job {job_id}: {thermo_data['error']}")
            
            # IR spectrum - optional
            ir_data = parse_ir_spectrum(output_file)
            if 'error' not in ir_data:
                # Store frequencies and intensities at top level for frontend
                if 'frequencies' in ir_data:
                    result['results']['ir_frequencies'] = ir_data['frequencies']
                if 'intensities' in ir_data:
                    result['results']['ir_intensities'] = ir_data['intensities']
                # Store additional IR data (modes, eps, transition dipoles) if available
                if 'modes' in ir_data:
                    result['results']['ir_modes'] = ir_data['modes']
                if 'eps' in ir_data:
                    result['results']['ir_eps'] = ir_data['eps']  # Molar absorption coefficient
                if 't_squared' in ir_data:
                    result['results']['ir_t_squared'] = ir_data['t_squared']  # T**2 in a.u.
                if 'tx' in ir_data:
                    result['results']['ir_tx'] = ir_data['tx']
                if 'ty' in ir_data:
                    result['results']['ir_ty'] = ir_data['ty']
                if 'tz' in ir_data:
                    result['results']['ir_tz'] = ir_data['tz']
                # Generate IR spectrum .dat file for plotting
                try:
                    generate_ir_dat_file(job_dir, ir_data)
                    result['results']['ir_spectrum_file'] = str(job_dir / "job.ir.dat")
                    result['files']['ir_spectrum'] = str(job_dir / "job.ir.dat")
                except Exception as e:
                    logger.warning(f"Could not generate IR .dat file: {e}")
            else:
                parsing_errors.append(f"IR spectrum: {ir_data['error']}")
                logger.warning(f"IR spectrum parsing failed for job {job_id}: {ir_data['error']}")
        
        # Solvation energy - optional
        if solvation:
            solv_data = parse_smd_solvation_energy(output_file)
            if 'error' not in solv_data:
                result['results'].update(solv_data)
            else:
                parsing_errors.append(f"Solvation energy: {solv_data['error']}")
                logger.warning(f"Solvation energy parsing failed for job {job_id}: {solv_data['error']}")
        
        # Add parsing warnings to result if any (but don't fail the job)
        if parsing_errors:
            result['parsing_warnings'] = parsing_errors
            if len(parsing_errors) == 1:
                result['warning'] = f"Partial results: {parsing_errors[0]}"
            else:
                result['warning'] = f"Partial results: {len(parsing_errors)} properties could not be parsed"
            logger.info(f"Job {job_id} completed with {len(parsing_errors)} parsing warnings")
        
        # Get final geometry
        try:
            final_xyz = None
            # Try getting it from OPI output first
            if hasattr(output, 'structure') and output.structure:
                final_xyz = output.structure.to_xyz()
            
            # Fallback: check for job.xyz (ORCA standard output for coordinates)
            if not final_xyz:
                xyz_file_path = job_dir / "job.xyz"
                if xyz_file_path.exists():
                    final_xyz = xyz_file_path.read_text()
            
            # Fallback 2: check for input.xyz (if job failed or didn't update coords)
            if not final_xyz:
                 inp_xyz = job_dir / "input.xyz"
                 if inp_xyz.exists():
                     final_xyz = inp_xyz.read_text()
            
            if final_xyz:
                xyz_out_file = job_dir / "final_structure.xyz"
                xyz_out_file.write_text(final_xyz)
                result['results']['final_structure_xyz'] = final_xyz
                result['files']['final_structure'] = str(xyz_out_file)
            else:
                logger.warning("Could not find final geometry in output or job.xyz")
                
        except Exception as e:
            logger.warning(f"Could not extract final geometry: {e}")
        
        # Store paths to key files
        result['files']['output'] = str(output_file)
        result['files']['input'] = str(job_dir / "job.inp")
        
        if (job_dir / "job.gbw").exists():
            result['files']['gbw'] = str(job_dir / "job.gbw")
        if (job_dir / "job.scfp").exists():
            result['files']['scfp'] = str(job_dir / "job.scfp")
        # Expose ORCA JSON outputs that include MO coefficients, energies, basis, properties
        if (job_dir / "job.json").exists():
            result['files']['json'] = str(job_dir / "job.json")
        if (job_dir / "job.property.json").exists():
            result['files']['property_json'] = str(job_dir / "job.property.json")
        
        # Mark as completed
        result['status'] = 'COMPLETED'
        result['timestamp_end'] = datetime.now().isoformat()
        
        logger.info(f"Job {job_id} completed successfully")
        
        # Save results to persistent storage
        save_results_to_db(job_id, result)
        
        return result
        
    except SoftTimeLimitExceeded:
        error_msg = f"Job exceeded time limit of {QCConfig.TASK_SOFT_TIME_LIMIT}s"
        logger.error(error_msg)
        result['status'] = 'FAILED'
        result['error'] = error_msg
        result['timestamp_end'] = datetime.now().isoformat()
        # Save failed job to database so it appears in job list
        save_results_to_db(job_id, result)
        logger.info(f"Saved timeout job metadata for {job_id}")
        return result
        
    except Exception as e:
        error_msg = f"Job failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        result['status'] = 'FAILED'
        result['error'] = error_msg
        result['timestamp_end'] = datetime.now().isoformat()
        # Save failed job to database so it appears in job list
        save_results_to_db(job_id, result)
        logger.info(f"Saved failed job metadata for {job_id}")
        return result


def generate_ir_dat_file(job_dir: Path, ir_data: Dict[str, Any]) -> None:
    """
    Generate a .dat file for IR spectrum plotting.
    
    This creates a simple two-column text file with frequency and intensity
    that can be easily plotted in the frontend.
    
    Args:
        job_dir: Job working directory
        ir_data: Dictionary with 'frequencies' and 'intensities' lists
    """
    frequencies = ir_data.get('frequencies', [])
    intensities = ir_data.get('intensities', [])
    
    if not frequencies or not intensities:
        raise ValueError("Missing frequency or intensity data")
    
    dat_file = job_dir / "job.ir.dat"
    with open(dat_file, 'w') as f:
        f.write("# IR Spectrum Data\n")
        f.write("# Frequency (cm^-1)    Intensity (km/mol)\n")
        for freq, intensity in zip(frequencies, intensities):
            f.write(f"{freq:.2f}    {intensity:.4f}\n")
    
    logger.info(f"Generated IR spectrum data file: {dat_file}")


def save_results_to_db(job_id: str, result: Dict[str, Any]) -> None:
    """
    Save job results to persistent storage.
    
    Currently uses JSON files, but can be upgraded to PostgreSQL/MongoDB.
    
    Args:
        job_id: Unique job identifier
        result: Results dictionary to save
    """
    QCConfig.ensure_directories()
    db_file = Path(QCConfig.RESULTS_DB_PATH) / f"{job_id}.json"
    
    with open(db_file, 'w') as f:
        json.dump(result, f, indent=2)
    
    logger.info(f"Saved results to database: {db_file}")


def load_results_from_db(job_id: str) -> Optional[Dict[str, Any]]:
    """
    Load job results from persistent storage.
    
    Args:
        job_id: Unique job identifier
        
    Returns:
        Results dictionary if found, None otherwise
    """
    db_file = Path(QCConfig.RESULTS_DB_PATH) / f"{job_id}.json"
    
    if not db_file.exists():
        return None
    
    with open(db_file, 'r') as f:
        return json.load(f)



def parse_mulliken_charges_from_output(output_file: Path) -> list:
    """
    Parse Mulliken atomic charges from ORCA output file.
    
    Fallback parser when OPI doesn't extract charges properly.
    
    Args:
        output_file: Path to ORCA .out file
        
    Returns:
        List of atomic charges
    """
    import re
    
    charges = []
    
    try:
        with open(output_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Look for MULLIKEN ATOMIC CHARGES section
        # Format:
        # MULLIKEN ATOMIC CHARGES
        # -----------------------
        #    0 C :   -0.123456
        #    1 H :    0.234567
        mulliken_pattern = re.compile(
            r'MULLIKEN ATOMIC CHARGES\s*\n-+\s*\n((?:\s*\d+\s+\w+\s*:\s*-?\d+\.\d+\s*\n)+)',
            re.MULTILINE
        )
        
        match = mulliken_pattern.search(content)
        if match:
            charges_block = match.group(1)
            # Extract individual charges
            charge_pattern = re.compile(r'\s*\d+\s+\w+\s*:\s*(-?\d+\.\d+)')
            for line in charges_block.strip().split('\n'):
                charge_match = charge_pattern.match(line)
                if charge_match:
                    charges.append(float(charge_match.group(1)))
        
        if not charges:
            logger.warning(f"No Mulliken charges found in {output_file}")
            
    except Exception as e:
        logger.error(f"Error parsing Mulliken charges from output: {e}")
    
    return charges


def parse_atoms_from_xyz(xyz_file: Path) -> list:
    """
    Parse atom symbols from XYZ file.
    
    Args:
        xyz_file: Path to XYZ file
        
    Returns:
        List of atom symbols
    """
    atoms = []
    try:
        with open(xyz_file, 'r') as f:
            lines = f.readlines()
        
        # XYZ format: first line is atom count, second is comment, rest are atoms
        if len(lines) > 2:
            for line in lines[2:]:
                parts = line.strip().split()
                if parts:
                    atoms.append(parts[0])
    except Exception as e:
        logger.error(f"Error parsing atoms from XYZ: {e}")
    
    return atoms


@celery_app.task(bind=True, base=QCTask, name='qc_tasks.calculate_fukui_indices')
def calculate_fukui_indices(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate Atomic Fukui Indices (Neutral, Anion, Cation).
    
    Fukui indices predict reactivity sites:
    - f⁺ (nucleophilic attack): where molecule accepts electrons
    - f⁻ (electrophilic attack): where molecule donates electrons  
    - f⁰ (radical attack): average of f⁺ and f⁻
    
    Uses finite difference approximation with Mulliken charges.
    """
    if not OPI_AVAILABLE:
        return {"status": "FAILED", "error": "orca-pi not installed"}

    job_id = self.request.id
    logger.info(f"Starting Fukui calculation {job_id}")
    
    QCConfig.ensure_directories()
    job_dir = Path(QCConfig.JOB_STORAGE_PATH) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine basis_set based on method
    method_str = job_data.get('method', 'B3LYP').upper()
    methods_without_basis = [
        'GFN0-XTB', 'GFN-XTB', 'GFN2-XTB', 'GFN-FF', 'XTB0', 'XTB1', 'XTB2', 'XTBFF',
        'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
        'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
        'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
        'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
        'AM1', 'PM3', 'PM6', 'MNDO',
        'HF-3C', 'R2SCAN-3C', 'PBEH-3C', 'B97-3C', 'B3LYP-3C'
    ]
    
    if method_str in methods_without_basis:
        basis_set_display = ''
    else:
        basis_set_display = job_data.get('basis_set') or job_data.get('basis', 'def2-SVP')
    
    result = {
        "job_id": job_id,
        "status": "RUNNING",
        "timestamp_start": datetime.now().isoformat(),
        "job_type": "fukui",  # For frontend filtering
        "method": job_data.get('method', 'B3LYP'),
        "basis_set": basis_set_display,
        "molecule_name": job_data.get('molecule_name'),  # Store molecule name for display
        "results": {},
        "files": {}
    }
    save_results_to_db(job_id, result)
    
    try:
        molecule_data = job_data.get('molecule_xyz')
        if not molecule_data:
            raise ValueError("Missing required parameter: molecule_xyz")
            
        xyz_string = convert_to_simple_xyz(molecule_data)
        xyz_file = job_dir / "struc.xyz"
        xyz_file.write_text(xyz_string)
        
        method_str = job_data.get('method', 'B3LYP')
        
        # Check if this is an external xTB method - these don't support Mulliken population analysis
        # Native xTB methods CAN support Mulliken charges when using ORCA's standard SCF infrastructure
        external_xtb_methods = [
            # External xTB methods (via otool_xtb) - these don't support Mulliken charges
            'GFN0-XTB', 'GFN-XTB', 'GFN2-XTB', 'GFN-FF', 'XTB0', 'XTB1', 'XTB2', 'XTBFF',
        ]
        
        if method_str.upper() in external_xtb_methods:
            # Instead of hard blocking, try to proceed with a warning and use alternative approach
            logger.warning(f"External xTB method {method_str} may not provide Mulliken charges for Fukui indices")
            # Store warning in result for frontend display
            result["warning"] = (
                f"External xTB methods may provide incomplete Fukui indices. "
                f"For complete results, consider using: (1) Native xTB methods (Native-GFN-xTB, Native-GFN2-xTB), "
                f"(2) DFT methods (B3LYP, PBE0, ωB97X-D3), or (3) Fast composite methods (HF-3C, r2SCAN-3C)."
            )
            # Continue with the calculation - parser will handle missing data gracefully
        
        # For methods that don't use basis sets
        # Methods that don't use basis sets: semiempirical (xTB, NDO) and composite methods
        methods_without_basis = [
            # External xTB methods
            'GFN0-XTB', 'GFN-XTB', 'GFN2-XTB', 'GFN-FF', 'XTB0', 'XTB1', 'XTB2', 'XTBFF',
            # Native xTB methods
            'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
            'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
            'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
            'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
            # NDO-based semiempirical methods
            'AM1', 'PM3', 'PM6', 'MNDO',
            'ZINDO/1', 'ZINDO/2', 'ZINDO/S', 'ZINDO_1', 'ZINDO_2', 'ZINDO_S',
            'ZNDDO/1', 'ZNDDO/2', 'ZNDDO_1', 'ZNDDO_2',
            'INDO/1', 'INDO/2', 'INDO/S', 'INDO_1', 'INDO_2', 'INDO_S',
            'CNDO/1', 'CNDO/2', 'CNDO/S', 'CNDO_1', 'CNDO_2', 'CNDO_S',
            'INDO', 'CNDO', 'NDDO',
            # Composite methods
            'HF-3C', 'R2SCAN-3C', 'PBEH-3C', 'B97-3C', 'B3LYP-3C'
        ]
        if method_str.upper() in methods_without_basis:
            basis_str = ''
        else:
            basis_str = job_data.get('basis_set') or job_data.get('basis', 'def2-SVP')
        dispersion_str = job_data.get('dispersion', 'D3BJ')
        
        n_procs = int(job_data.get('n_procs') or QCConfig.DEFAULT_N_PROCS)
        memory_mb = int(job_data.get('memory_mb') or QCConfig.DEFAULT_MEMORY_MB)
        memory_per_core = memory_mb // n_procs

        def is_scf_convergence_error(content: str) -> bool:
            """Check if the error is related to SCF convergence issues."""
            content_upper = content.upper()
            scf_indicators = [
                'SCF NOT CONVERGED',
                'LEANSCF',
                'SCF CONVERGENCE',
                'DIIS',
                'TRAH',
                'HOMO-LUMO',
                'SMALL HOMO'
            ]
            return any(indicator in content_upper for indicator in scf_indicators)
        
        def get_scf_error_suggestions(name: str, charge: int, aggressive: bool) -> str:
            """Generate actionable suggestions for SCF convergence failures."""
            suggestions = []
            
            if charge < 0:
                # Anion-specific suggestions
                suggestions.append("Anionic species detected - consider using implicit solvation (e.g., CPCM)")
                suggestions.append("Try a larger basis set with diffuse functions (e.g., aug-cc-pVDZ)")
            
            if charge > 0:
                # Cation-specific suggestions
                suggestions.append("Cationic species detected - ensure geometry is reasonable")
            
            if not aggressive:
                suggestions.append("Retrying with more aggressive SCF settings (higher damping, level shifting)")
            else:
                suggestions.append("Already using aggressive settings - consider:")
                suggestions.append("  • Using a different initial guess (Huckel for anions, PAtom for cations)")
                suggestions.append("  • Checking molecular geometry for unrealistic bond lengths/angles")
                suggestions.append("  • Trying an alternative method/basis set combination")
                suggestions.append("  • Using a smaller basis set initially to get converged orbitals")
            
            if suggestions:
                return " Suggestions: " + "; ".join(suggestions)
            return ""

        def run_sp(name, charge, mult, aggressive: bool = False):
            """Run single-point calculation with Mulliken population analysis.
            
            Args:
                name: Name identifier for the calculation (neutral, anion, cation)
                charge: Molecular charge
                mult: Spin multiplicity
                aggressive: If True, use more aggressive SCF convergence settings
            """
            logger.info(f"Running {name} calculation (charge={charge}, mult={mult}, aggressive={aggressive})...")
            
            out_file = job_dir / f"{name}.out"
            inp_file = job_dir / f"{name}.inp"
            
            try:
                calc = Calculator(basename=name, working_dir=str(job_dir))
                calc.structure = Structure.from_xyz(str(xyz_file))
                calc.structure.charge = charge
                calc.structure.multiplicity = mult
                calc.input.ncores = n_procs
                calc.input.maxcore = memory_per_core
                
                # Check if this is a native xTB method
                is_native_xtb = method_str.upper() in [
                    'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
                    'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
                    'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
                    'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
                ]
                
                calc.input.add_simple_keywords(SimpleKeyword(method_str))
                # Only add basis set if it's not empty (xTB methods don't use basis sets)
                if basis_str:
                    calc.input.add_simple_keywords(SimpleKeyword(basis_str))
                # Native xTB methods use internal D4 correction, don't add external dispersion
                if dispersion_str and dispersion_str.lower() != 'none' and not is_native_xtb:
                    calc.input.add_simple_keywords(SimpleKeyword(dispersion_str))
                
                # IMPORTANT: Request Mulliken population analysis for Fukui indices
                calc.input.add_simple_keywords(SimpleKeyword('Mulliken'))
                
                calc.write_input()
                
                # Log the input file for debugging
                if inp_file.exists():
                    logger.info(f"Generated input file {inp_file}")
                
                # For native xTB methods, we need to use ORCA's standard SCF infrastructure
                # instead of the special xTB SCF mixer to get Mulliken population analysis
                is_native_xtb = method_str.upper() in [
                    'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
                    'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
                    'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
                    'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
                ]
                
                if is_native_xtb:
                    # For native xTB, disable the xTB mixer to use standard ORCA SCF
                    # This enables Mulliken population analysis
                    try:
                        with open(inp_file, 'r') as f:
                            content = f.read()
                        
                        # Add %scf block to disable xTB mixer if not already present
                        if '%scf' not in content.lower():
                            # Insert %scf block before the coordinates
                            scf_block = "\n%scf\n    UseXTBMixer false\nend\n\n"
                            # Find where to insert (before * xyz or * int)
                            if '* xyz' in content:
                                content = content.replace('* xyz', scf_block + '* xyz')
                            elif '* int' in content:
                                content = content.replace('* int', scf_block + '* int')
                            else:
                                # Fallback: add before the last line
                                lines = content.split('\n')
                                content = '\n'.join(lines[:-1]) + scf_block + lines[-1] + '\n'
                            
                            with open(inp_file, 'w') as f:
                                f.write(content)
                            logger.info(f"Configured native xTB to use standard ORCA SCF for Mulliken charges")
                    except Exception as e:
                        logger.warning(f"Could not configure native xTB SCF settings: {e}")
                
                # Inject robust SCF settings for Fukui calculations
                # These settings are charge-aware and help with convergence for anions/cations
                try:
                    inject_robust_scf_settings_fukui(str(inp_file), charge, mult, aggressive=aggressive)
                    logger.info(f"Applied robust SCF settings for {name} calculation (charge={charge}, mult={mult}, aggressive={aggressive})")
                except Exception as e:
                    logger.warning(f"Failed to inject robust SCF settings: {e}")
                    # Continue with calculation even if injection fails
                
                calc.run()
                
                out = calc.get_output()
                
                # Check if this is a semiempirical method - they don't generate JSON files
                # This includes: NDO-based methods (AM1, PM3, MNDO, ZINDO, INDO, CNDO) and xTB methods
                is_semiempirical = method_str.upper() in [
                    # External xTB methods (via otool_xtb)
                    'GFN0-XTB', 'GFN-XTB', 'GFN2-XTB', 'GFN-FF', 'XTB0', 'XTB1', 'XTB2', 'XTBFF',
                    # Native xTB methods (ORCA's own implementation)
                    'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB', 
                    'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
                    'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
                    'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
                    # NDO-based methods (MNDO, AM1, PM3, etc.)
                    'AM1', 'PM3', 'MNDO',
                    'ZINDO/1', 'ZINDO/2', 'ZINDO/S', 'ZINDO_1', 'ZINDO_2', 'ZINDO_S',
                    'ZNDDO/1', 'ZNDDO/2', 'ZNDDO_1', 'ZNDDO_2',
                    'INDO/1', 'INDO/2', 'INDO/S', 'INDO_1', 'INDO_2', 'INDO_S',
                    'CNDO/1', 'CNDO/2', 'CNDO/S', 'CNDO_1', 'CNDO_2', 'CNDO_S',
                    'INDO', 'CNDO', 'NDDO'
                ]
                
                # For semiempirical methods, check termination by parsing output file directly
                # For other methods, use out.terminated_normally() which requires JSON
                terminated_normally = False
                if is_semiempirical:
                    # Check termination by reading the output file
                    if out_file.exists():
                        try:
                            with open(out_file, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            terminated_normally = '****ORCA TERMINATED NORMALLY****' in content
                        except Exception as e:
                            logger.warning(f"Could not read output file to check termination: {e}")
                            terminated_normally = False
                else:
                    # For non-xTB methods, use the OPI library's termination check
                    try:
                        terminated_normally = out.terminated_normally()
                    except Exception as e:
                        logger.warning(f"Error checking termination status: {e}")
                        terminated_normally = False
                
                if not terminated_normally:
                    # Check the output file for error details
                    error_msg = f"ORCA {name} calculation failed"
                    scf_error = False
                    
                    if out_file.exists():
                        try:
                            with open(out_file, 'r') as f:
                                content = f.read()
                            # Log last 50 lines for debugging
                            last_lines = content.split('\n')[-50:]
                            logger.error(f"ORCA output (last 50 lines):\n" + '\n'.join(last_lines))
                            
                            # Check if this is an SCF convergence error
                            scf_error = is_scf_convergence_error(content)
                            
                            # Check for specific error patterns (in order of specificity)
                            if 'ORCA finished by error termination' in content:
                                # Extract the error termination reason - prioritize this
                                termination_msg = None
                                for line in content.split('\n'):
                                    if 'ORCA finished by error termination' in line:
                                        termination_msg = line.strip()
                                        # Look for additional context on nearby lines
                                        lines_list = content.split('\n')
                                        idx = lines_list.index(line)
                                        context_parts = []
                                        # Check previous and next lines for context
                                        for check_idx in [idx-1, idx+1, idx+2]:
                                            if 0 <= check_idx < len(lines_list):
                                                check_line = lines_list[check_idx].strip()
                                                if check_line and not check_line.startswith('---') and len(check_line) > 5:
                                                    if 'LEANSCF' in check_line or 'SCF' in check_line:
                                                        context_parts.append(check_line)
                                                        scf_error = True  # Set flag if SCF-related context found
                                        if context_parts:
                                            error_msg += f" - {termination_msg} ({', '.join(context_parts[:2])})"
                                        else:
                                            error_msg += f" - {termination_msg}"
                                        
                                        # Add suggestions if this is an SCF error
                                        if scf_error:
                                            error_msg += get_scf_error_suggestions(name, charge, aggressive)
                                        break
                            elif 'LEANSCF' in content and ('error' in content.lower() or 'termination' in content.lower()):
                                error_msg += " - SCF convergence failed in LEANSCF algorithm"
                                scf_error = True
                                error_msg += get_scf_error_suggestions(name, charge, aggressive)
                            elif 'SCF NOT CONVERGED' in content:
                                error_msg += " - SCF did not converge"
                                scf_error = True
                                error_msg += get_scf_error_suggestions(name, charge, aggressive)
                            elif 'error termination' in content.lower():
                                # Generic error termination
                                error_msg += " - Error termination"
                                # Try to find the error message
                                lines = content.split('\n')
                                for i, line in enumerate(lines):
                                    if 'error termination' in line.lower():
                                        # Look for error details nearby
                                        for j in range(max(0, i-2), min(len(lines), i+5)):
                                            if lines[j].strip() and ('error' in lines[j].lower() or 'aborting' in lines[j].lower()):
                                                if lines[j].strip() not in error_msg:
                                                    error_msg += f" - {lines[j].strip()}"
                                        break
                            elif 'multiplicity' in content.lower() and 'odd' in content.lower() and 'electrons' in content.lower() and 'impossible' in content.lower():
                                error_msg += " - Electron count mismatch (odd electrons with even multiplicity or vice versa). Your molecule might be missing hydrogens."
                            elif 'ORCA TERMINATED NORMALLY' not in content:
                                # Find error messages
                                error_found = False
                                for line in content.split('\n'):
                                    line_upper = line.upper()
                                    if 'ERROR' in line_upper or 'ABORTING' in line_upper or 'FAILED' in line_upper:
                                        error_msg += f" - {line.strip()}"
                                        error_found = True
                                        break
                                if not error_found:
                                    error_msg += " - Calculation terminated abnormally (check ORCA output for details)"
                        except Exception as read_err:
                            logger.error(f"Could not read output file: {read_err}")
                    else:
                        error_msg += " - No output file generated (ORCA may not be installed)"
                        logger.error(f"Output file not found: {out_file}")
                    
                    # Raise RuntimeError with SCF error flag for retry logic
                    error = RuntimeError(error_msg)
                    error.is_scf_error = scf_error  # Attach flag for retry detection
                    raise error
                    
                # For semiempirical methods, parsing may fail because they don't generate JSON files
                # We already detected is_semiempirical earlier, so reuse that variable
                if is_semiempirical:
                    # For semiempirical methods, try to parse but handle missing JSON gracefully
                    try:
                        out.parse()
                    except FileNotFoundError as json_err:
                        # Semiempirical methods may not generate JSON files - this is expected
                        if 'json' in str(json_err).lower():
                            logger.warning(f"Semiempirical method {method_str} does not generate JSON files - parsing output file directly")
                            # The output object is still valid, we just can't parse JSON
                            # We'll extract data from the .out file directly later
                        else:
                            raise
                    except Exception as parse_err:
                        # For other parsing errors, log but continue
                        logger.warning(f"Could not fully parse semiempirical output: {parse_err}")
                        # Continue anyway - we can still extract data from .out file
                else:
                    # For non-semiempirical methods, parsing is required
                    out.parse()
                
                return out, out_file
                
            except RuntimeError as e:
                # Re-raise RuntimeError with is_scf_error flag if it exists
                raise
            except Exception as e:
                # Catch any other errors during calculation setup/run
                error_msg = f"ORCA {name} calculation failed: {str(e)}"
                logger.error(error_msg, exc_info=True)
                
                # Try to get more info from output file if it exists
                scf_error = False
                if out_file.exists():
                    try:
                        with open(out_file, 'r') as f:
                            content = f.read()
                        last_lines = content.split('\n')[-30:]
                        logger.error(f"ORCA output (last 30 lines):\n" + '\n'.join(last_lines))
                        scf_error = is_scf_convergence_error(content)
                    except:
                        pass
                
                error = RuntimeError(error_msg)
                error.is_scf_error = scf_error
                raise error
        
        def run_sp_with_retry(name, charge, mult):
            """Run single-point calculation with automatic retry on SCF convergence failure."""
            max_attempts = 2
            
            for attempt in range(max_attempts):
                aggressive = (attempt > 0)  # Use aggressive settings on retry
                try:
                    return run_sp(name, charge, mult, aggressive=aggressive)
                except RuntimeError as e:
                    is_scf_error = getattr(e, 'is_scf_error', False)
                    
                    # Only retry if it's an SCF convergence error and we haven't exhausted attempts
                    if is_scf_error and attempt < max_attempts - 1:
                        logger.warning(f"{name} calculation failed with SCF convergence error. Retrying with more aggressive settings...")
                        # Clean up failed calculation files before retry
                        inp_file = job_dir / f"{name}.inp"
                        out_file = job_dir / f"{name}.out"
                        for f in [inp_file, out_file]:
                            if f.exists():
                                try:
                                    f.unlink()
                                except:
                                    pass
                        continue
                    else:
                        # Not an SCF error or out of attempts - raise the error
                        raise

        # Run 3 calculations: neutral, anion (N+1), cation (N-1)
        # Use retry wrapper to automatically retry with aggressive settings if SCF convergence fails
        out_neutral, out_neutral_file = run_sp_with_retry("neutral", 0, 1)
        out_anion, out_anion_file = run_sp_with_retry("anion", -1, 2)
        out_cation, out_cation_file = run_sp_with_retry("cation", 1, 2)
        
        def get_charges(out, out_file):
            """Extract Mulliken charges from OPI output or fallback to parsing .out file."""
            charges = []
            
            # Try OPI parsing first
            try:
                geoms = out.results_properties.geometries
                if geoms:
                    mull = geoms[-1].mulliken_population_analysis
                    if mull and mull[-1].atomiccharges:
                        charges = [c[0] for c in mull[-1].atomiccharges]
                        logger.info(f"Extracted {len(charges)} Mulliken charges via OPI")
            except Exception as e:
                logger.warning(f"OPI charge extraction failed: {e}")
            
            # Fallback to parsing output file directly
            if not charges:
                logger.info(f"Falling back to parsing Mulliken charges from {out_file}")
                charges = parse_mulliken_charges_from_output(out_file)
                if charges:
                    logger.info(f"Extracted {len(charges)} Mulliken charges from output file")
            
            if not charges:
                raise ValueError(f"Could not extract Mulliken charges from {out_file}")
            
            return charges

        charges_neutral = get_charges(out_neutral, out_neutral_file)
        charges_anion = get_charges(out_anion, out_anion_file)
        charges_cation = get_charges(out_cation, out_cation_file)
        
        # Validate charge arrays have same length
        if not (len(charges_neutral) == len(charges_anion) == len(charges_cation)):
            raise ValueError(
                f"Charge array length mismatch: neutral={len(charges_neutral)}, "
                f"anion={len(charges_anion)}, cation={len(charges_cation)}"
            )
        
        # Compute Fukui indices
        f_plus = compute_fukui_charge(charges1=charges_anion, charges2=charges_neutral, mode='plus/minus')
        f_minus = compute_fukui_charge(charges1=charges_neutral, charges2=charges_cation, mode='plus/minus')
        f_zero = compute_fukui_charge(charges1=charges_anion, charges2=charges_cation, mode='zero')
        
        # Get atom symbols from XYZ file (most reliable source)
        atoms = parse_atoms_from_xyz(xyz_file)
        
        # Fallback to OPI structure if XYZ parsing failed
        if not atoms:
            try:
                if hasattr(out_neutral, 'structure') and out_neutral.structure:
                    atoms = [a.symbol for a in out_neutral.structure.atoms]
            except Exception as e:
                logger.warning(f"Could not get atoms from OPI structure: {e}")
        
        # Final fallback: generate generic labels
        if not atoms:
            atoms = [f"Atom{i}" for i in range(len(charges_neutral))]
            logger.warning("Using generic atom labels")
        
        logger.info(f"Fukui calculation complete: {len(atoms)} atoms processed")
        
        result['results']['fukui'] = {
            'atoms': atoms,
            'f_plus': f_plus,
            'f_minus': f_minus,
            'f_zero': f_zero,
            'charges_neutral': charges_neutral
        }
        
        # Store file paths
        result['files']['neutral_output'] = str(out_neutral_file)
        result['files']['anion_output'] = str(out_anion_file)
        result['files']['cation_output'] = str(out_cation_file)
        result['files']['structure'] = str(xyz_file)
        
        # Ensure job_type and method are preserved
        result['job_type'] = 'fukui'  # Ensure it's set
        result['method'] = job_data.get('method', 'B3LYP')
        
        # For methods without basis sets (xTB, semiempirical), don't show basis_set
        method_str = result['method'].upper()
        methods_without_basis = [
            'GFN0-XTB', 'GFN-XTB', 'GFN2-XTB', 'GFN-FF', 'XTB0', 'XTB1', 'XTB2', 'XTBFF',
            'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
            'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
            'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
            'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
            'AM1', 'PM3', 'PM6', 'MNDO',
            'HF-3C', 'R2SCAN-3C', 'PBEH-3C', 'B97-3C', 'B3LYP-3C'
        ]
        
        if method_str in methods_without_basis:
            result['basis_set'] = ''  # No basis set for these methods
        else:
            result['basis_set'] = job_data.get('basis_set') or job_data.get('basis', 'def2-SVP')
        
        result['status'] = 'COMPLETED'
        result['timestamp_end'] = datetime.now().isoformat()
        save_results_to_db(job_id, result)
        return result
        
    except Exception as e:
        logger.error(f"Fukui task failed: {e}", exc_info=True)
        # Ensure job_type and method are preserved even on failure
        result['job_type'] = 'fukui'
        result['method'] = job_data.get('method', 'B3LYP')
        
        # For methods without basis sets, don't show basis_set
        method_str = result['method'].upper()
        methods_without_basis = [
            'GFN0-XTB', 'GFN-XTB', 'GFN2-XTB', 'GFN-FF', 'XTB0', 'XTB1', 'XTB2', 'XTBFF',
            'NATIVE-GFN-XTB', 'NATIVE-GFN1-XTB', 'NATIVE-GFN2-XTB',
            'NATIVE-XTB', 'NATIVE-XTB1', 'NATIVE-XTB2',
            'NATIVE-SPGFN-XTB', 'NATIVE-SPGFN1-XTB', 'NATIVE-SPGFN2-XTB',
            'NATIVE-SPXTB', 'NATIVE-SPXTB1', 'NATIVE-SPXTB2',
            'AM1', 'PM3', 'PM6', 'MNDO',
            'HF-3C', 'R2SCAN-3C', 'PBEH-3C', 'B97-3C', 'B3LYP-3C'
        ]
        
        if method_str in methods_without_basis:
            result['basis_set'] = ''
        else:
            result['basis_set'] = job_data.get('basis_set') or job_data.get('basis', 'def2-SVP')
        result['status'] = 'FAILED'
        result['error'] = str(e)
        result['timestamp_end'] = datetime.now().isoformat()
        save_results_to_db(job_id, result)
        return result

def _robust_conformer_generation(mol, n_confs: int, rms_thresh: float, smiles: str) -> tuple:
    """
    Robust conformer generation with advanced diagnostics and staged fallbacks.
    
    Returns:
        Tuple of (conformer_ids, generation_info_dict)
    """
    generation_info = {
        'method_used': None,
        'attempts': [],
        'failure_causes': {},
        'warnings': []
    }
    
    # Define embedding parameter sets for staged fallback
    # Note: EmbedMultipleConfs uses maxAttempts (not maxIterations)
    embed_params_sequence = [
        {
            'name': 'ETKDGv3_default',
            'params': {
                'useExpTorsionAnglePrefs': True,
                'useBasicKnowledge': True,
                'useRandomCoords': False,
                'maxAttempts': 50,
                'randomSeed': 42,
            }
        },
        {
            'name': 'ETKDGv3_random_coords',
            'params': {
                'useExpTorsionAnglePrefs': True,
                'useBasicKnowledge': True,
                'useRandomCoords': True,
                'maxAttempts': 200,
                'randomSeed': 42,
            }
        },
        {
            'name': 'KDG_gas_phase',
            'params': {
                'useExpTorsionAnglePrefs': False,
                'useBasicKnowledge': False,
                'useRandomCoords': True,
                'maxAttempts': 500,
                'randomSeed': 42,
            }
        },
        {
            'name': 'ETKDGv3_relaxed_pruning',
            'params': {
                'useExpTorsionAnglePrefs': True,
                'useBasicKnowledge': True,
                'useRandomCoords': True,
                'maxAttempts': 500,
                'randomSeed': 42,
                'pruneRmsThresh': -1.0,  # Disable pruning to get all unique conformers
            }
        },
    ]
    
    cids = []
    
    for attempt in embed_params_sequence:
        attempt_name = attempt['name']
        params = attempt['params'].copy()
        
        # Use provided rms_thresh unless this attempt overrides it
        if 'pruneRmsThresh' not in params:
            # For the first few methods, use a relaxed pruning threshold to get more conformers
            # Only the last method (ETKDGv3_relaxed_pruning) disables pruning entirely
            if 'relaxed_pruning' in attempt_name:
                params['pruneRmsThresh'] = -1.0  # Disable pruning
            else:
                # Use a more relaxed threshold for the first attempts (1.0 Å instead of rms_thresh)
                # This helps generate more diverse conformers for small molecules
                params['pruneRmsThresh'] = max(1.0, rms_thresh)
        
        logger.info(f"Attempting conformer generation with method: {attempt_name} (pruneRmsThresh={params.get('pruneRmsThresh', 'default')})")
        
        # Track failures for diagnostics
        failure_counts = {}
        
        try:
            cids = AllChem.EmbedMultipleConfs(
                mol,
                numConfs=n_confs,
                **params
            )
        except Exception as e:
            logger.warning(f"Method {attempt_name} raised exception: {e}")
            generation_info['attempts'].append({
                'method': attempt_name,
                'success': False,
                'conformers': 0,
                'error': str(e)
            })
            continue
        
        # Log failure causes if any
        if failure_counts:
            logger.info(f"Failure causes for {attempt_name}: {failure_counts}")
            for fail_type, count in failure_counts.items():
                generation_info['failure_causes'][fail_type] = generation_info['failure_causes'].get(fail_type, 0) + count
        
        generation_info['attempts'].append({
            'method': attempt_name,
            'success': len(cids) > 0,
            'conformers': len(cids),
            'failure_causes': dict(failure_counts) if failure_counts else None
        })
        
        if len(cids) >= n_confs:
            logger.info(f"[COMPLETE] Successfully generated {len(cids)} conformers with {attempt_name} (target: {n_confs})")
            generation_info['method_used'] = attempt_name
            return cids, generation_info
        elif len(cids) > 0:
            # Got some conformers but not enough - continue to next method
            logger.info(f"[COMPLETE] Generated {len(cids)} conformers with {attempt_name} (target: {n_confs}, continuing...)")
            generation_info['method_used'] = attempt_name
            # Don't return yet - try next method to get more conformers
            continue
    
    # All standard methods failed - try force field fallback
    logger.warning("All distance geometry methods failed. Attempting force field fallback...")
    
    try:
        cids = _forcefield_fallback_embedding(mol, n_confs)
        if len(cids) > 0:
            logger.info(f"[COMPLETE] Force field fallback generated {len(cids)} conformers")
            generation_info['method_used'] = 'forcefield_fallback'
            generation_info['attempts'].append({
                'method': 'forcefield_fallback',
                'success': True,
                'conformers': len(cids)
            })
            return cids, generation_info
    except Exception as e:
        logger.error(f"Force field fallback failed: {e}")
        generation_info['attempts'].append({
            'method': 'forcefield_fallback',
            'success': False,
            'conformers': 0,
            'error': str(e)
        })
    
    # All methods failed
    return [], generation_info


def _forcefield_fallback_embedding(mol, num_confs: int = 10):
    """
    Fallback conformer generation using force field minimization.
    
    This is a last resort when distance geometry fails completely.
    Generates conformers by embedding with random coords and optimizing.
    """
    from rdkit.Chem import AllChem
    import random
    
    conformer_ids = []
    
    for i in range(num_confs):
        # Create a copy of the molecule for each conformer
        mol_copy = Chem.Mol(mol)
        
        # Embed with random coordinates
        result = AllChem.EmbedMolecule(
            mol_copy,
            useRandomCoords=True,
            maxAttempts=100,
            randomSeed=42 + i
        )
        
        if result == 0:  # Success
            # Optimize with MMFF
            try:
                AllChem.MMFFOptimizeMolecule(mol_copy, maxIters=500)
            except Exception:
                try:
                    AllChem.UFFOptimizeMolecule(mol_copy, maxIters=500)
                except Exception:
                    pass  # Keep unoptimized conformer
            
            # Copy conformer to original molecule
            conf = mol_copy.GetConformer(0)
            new_conf_id = mol.AddConformer(conf, assignId=True)
            conformer_ids.append(new_conf_id)
    
    return conformer_ids


def _preprocess_molecule_for_conformers(smiles: str) -> tuple:
    """
    Pre-process molecule for conformer generation with validation and diagnostics.
    
    Returns:
        Tuple of (mol, preprocessing_info_dict)
    """
    preprocessing_info = {
        'original_smiles': smiles,
        'warnings': [],
        'chiral_centers': [],
        'unassigned_stereo': []
    }
    
    # 1. Parse SMILES
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Failed to parse SMILES: {smiles}")
    
    logger.info(f"Parsed SMILES: {mol.GetNumAtoms()} heavy atoms, {mol.GetNumBonds()} bonds")
    
    # 2a. Handle disconnected molecules (mixture SMILES like "C.O.[HH].[HH]")
    fragments = Chem.GetMolFrags(mol, asMols=True)
    if len(fragments) > 1:
        largest = max(fragments, key=lambda m: m.GetNumHeavyAtoms())
        warning_msg = (
            f"SMILES contains {len(fragments)} disconnected fragments. "
            f"Using the largest fragment ({largest.GetNumHeavyAtoms()} heavy atoms) for conformer generation."
        )
        logger.warning(warning_msg)
        preprocessing_info['warnings'].append(warning_msg)
        preprocessing_info['original_smiles'] = smiles
        mol = largest
    
    # 2. Check for undefined stereocenters
    try:
        chiral_centers = Chem.FindMolChiralCenters(mol, includeUnassigned=True)
        preprocessing_info['chiral_centers'] = chiral_centers
        
        unassigned = [center for center in chiral_centers if center[1] == '?']
        preprocessing_info['unassigned_stereo'] = unassigned
        
        if unassigned:
            warning_msg = f"Molecule has {len(unassigned)} unassigned chiral centers at atoms: {[c[0] for c in unassigned]}"
            logger.warning(warning_msg)
            preprocessing_info['warnings'].append(warning_msg)
    except Exception as e:
        logger.warning(f"Could not analyze stereocenters: {e}")
    
    # 3. Add hydrogens (critical for correct geometry)
    mol = Chem.AddHs(mol)
    logger.info(f"Added hydrogens: {mol.GetNumAtoms()} total atoms")
    
    # 4. Check for problematic substructures
    num_rings = mol.GetRingInfo().NumRings()
    if num_rings > 5:
        warning_msg = f"Molecule has {num_rings} rings - may be challenging for conformer generation"
        logger.warning(warning_msg)
        preprocessing_info['warnings'].append(warning_msg)
    
    # 5. Check for bridged/fused ring systems
    ring_info = mol.GetRingInfo()
    if ring_info.NumRings() > 1:
        # Check for shared atoms between rings (fused/bridged)
        atom_ring_counts = {}
        for ring in ring_info.AtomRings():
            for atom_idx in ring:
                atom_ring_counts[atom_idx] = atom_ring_counts.get(atom_idx, 0) + 1
        
        bridgehead_atoms = [idx for idx, count in atom_ring_counts.items() if count > 1]
        if len(bridgehead_atoms) > 2:
            warning_msg = f"Molecule has {len(bridgehead_atoms)} bridgehead atoms - complex ring system"
            logger.warning(warning_msg)
            preprocessing_info['warnings'].append(warning_msg)
    
    return mol, preprocessing_info


@celery_app.task(bind=True, base=QCTask, name='qc_tasks.perform_conformer_search')
def perform_conformer_search(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Perform conformer search (RDKit + DFT ranking) with robust error handling.
    
    Features:
    - Advanced failure diagnostics with trackFailures
    - Staged fallback with multiple embedding strategies
    - Pre-processing validation for problematic molecules
    - Force field fallback for difficult cases
    """
    if not OPI_AVAILABLE:
        return {"status": "FAILED", "error": "orca-pi not installed"}
    if not RDKIT_AVAILABLE:
        return {"status": "FAILED", "error": "rdkit not installed"}

    job_id = self.request.id
    logger.info(f"Starting Conformer Search {job_id}")
    
    QCConfig.ensure_directories()
    job_dir = Path(QCConfig.JOB_STORAGE_PATH) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    result = {
        "job_id": job_id,
        "status": "RUNNING",
        "timestamp_start": datetime.now().isoformat(),
        "job_type": "conformer",
        "method": job_data.get('method', 'r2SCAN-3c'),
        "basis_set": "",
        "molecule_name": job_data.get('molecule_name'),
        "results": {},
        "files": {},
        "diagnostics": {}  # Store diagnostic info for debugging
    }
    save_results_to_db(job_id, result)
    
    try:
        smiles = job_data.get('smiles')
        if not smiles:
            raise ValueError("Missing required parameter: smiles")
        
        logger.info(f"Input SMILES: {smiles}")
        
        n_confs = int(job_data.get('n_confs', 50))
        rms_thresh = float(job_data.get('rms_thresh', 0.5))
        energy_window = float(job_data.get('energy_window', 5.0))  # kcal/mol
        
        # Step 1: Pre-process molecule with validation
        logger.info("Step 1: Pre-processing molecule...")
        mol, preprocessing_info = _preprocess_molecule_for_conformers(smiles)
        result['diagnostics']['preprocessing'] = preprocessing_info
        
        # Step 2: Robust conformer generation with fallbacks
        logger.info(f"Step 2: Generating up to {n_confs} conformers with RDKit...")
        cids, generation_info = _robust_conformer_generation(mol, n_confs, rms_thresh, smiles)
        result['diagnostics']['generation'] = generation_info
        
        # Check if any conformers were generated
        if len(cids) == 0:
            # Build detailed error message from diagnostics
            error_parts = ["RDKit failed to generate any conformers for this molecule."]
            
            if generation_info['failure_causes']:
                main_failures = sorted(generation_info['failure_causes'].items(), key=lambda x: -x[1])[:3]
                error_parts.append(f"Main failure causes: {', '.join([f'{k}({v})' for k, v in main_failures])}")
            
            if preprocessing_info['warnings']:
                error_parts.append(f"Molecule warnings: {'; '.join(preprocessing_info['warnings'])}")
            
            error_parts.append("This can happen with complex ring systems, undefined stereochemistry, or strained geometries.")
            
            error_msg = ' '.join(error_parts)
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        
        logger.info(f"[COMPLETE] Generated {len(cids)} initial conformers using {generation_info['method_used']}")  
        
        # Optimize with MMFF
        props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant='MMFF94s')
        conformers = []
        
        for cid in cids:
            ff = AllChem.MMFFGetMoleculeForceField(mol, props, confId=cid)
            if ff:
                ff.Minimize()
                energy = ff.CalcEnergy()
                conformers.append((energy, cid))
        
        conformers.sort()
        if not conformers:
            raise RuntimeError("No conformers generated")
            
        min_e = conformers[0][0]
        selected_cids = [c[1] for c in conformers if (c[0] - min_e) <= energy_window]
        logger.info(f"Selected {len(selected_cids)} conformers within {energy_window} kcal/mol window")
        
        # 2. DFT Re-ranking
        method_str = job_data.get('method', 'r2SCAN-3c') 
        n_procs = int(job_data.get('n_procs') or 4)
        memory_mb = int(job_data.get('memory_mb') or QCConfig.DEFAULT_MEMORY_MB)
        
        # Calculate memory per core (ORCA uses %maxcore per core)
        memory_per_core = memory_mb // n_procs
        logger.info(f"DFT re-ranking settings: {n_procs} cores, {memory_per_core} MB per core (total: {memory_mb} MB)")
        
        dft_results = []
        
        # Limit number of DFT calculations
        max_dft_confs = 10
        if len(selected_cids) > max_dft_confs:
             logger.info(f"Limiting DFT re-ranking to top {max_dft_confs} conformers")
             selected_cids = selected_cids[:max_dft_confs]
             
        dft_failures = []
        for i, cid in enumerate(selected_cids):
            conf_name = f"conf_{i}"
            xyz_block = Chem.MolToXYZBlock(mol, confId=cid)
            xyz_file = job_dir / f"{conf_name}.xyz"
            xyz_file.write_text(xyz_block)
            
            logger.info(f"Running DFT calculation for conformer {i+1}/{len(selected_cids)}: {conf_name}")
            
            try:
                # Run ORCA
                calc = Calculator(basename=conf_name, working_dir=str(job_dir))
                calc.structure = Structure.from_xyz(str(xyz_file))
                calc.structure.charge = 0
                calc.structure.multiplicity = 1
                calc.input.ncores = n_procs
                calc.input.maxcore = memory_per_core
                
                calc.input.add_simple_keywords(SimpleKeyword(method_str))
                calc.input.add_simple_keywords(Scf.NOAUTOSTART)
                
                calc.write_input()
                calc.run()
                
                out = calc.get_output()
                if out.terminated_normally():
                    out.parse()
                    e_h = parse_final_energy(job_dir / f"{conf_name}.out")
                    if e_h is not None:
                        logger.info(f"[COMPLETE] Conformer {i}: E = {e_h:.6f} Hartree")
                        dft_results.append({
                            "conf_id": i,
                            "energy_hartree": e_h,
                            "xyz_file": str(xyz_file),
                            "xyz_content": xyz_block
                        })
                    else:
                        logger.warning(f"[ERROR] Conformer {i}: ORCA completed but could not parse energy")
                        dft_failures.append(f"conf_{i}: energy parse failed")
                else:
                    logger.warning(f"[ERROR] Conformer {i}: ORCA did not terminate normally")
                    dft_failures.append(f"conf_{i}: ORCA failed")
            except Exception as e:
                logger.error(f"[ERROR] Conformer {i}: DFT calculation error: {e}")
                dft_failures.append(f"conf_{i}: {str(e)}")
        
        # Log summary
        logger.info(f"DFT re-ranking complete: {len(dft_results)}/{len(selected_cids)} successful")
        if dft_failures:
            logger.warning(f"DFT failures: {dft_failures}")
        
        # Sort by DFT energy
        dft_results.sort(key=lambda x: x['energy_hartree'])
        
        # Calculate relative energies
        if dft_results:
            min_dft_e = dft_results[0]['energy_hartree']
            for res in dft_results:
                res['rel_energy_kcal'] = (res['energy_hartree'] - min_dft_e) * 627.509
                
        result['results']['conformers'] = dft_results
        result['status'] = 'COMPLETED'
        result['timestamp_end'] = datetime.now().isoformat()
        save_results_to_db(job_id, result)
        return result
        
    except Exception as e:
        logger.error(f"Conformer search failed: {e}", exc_info=True)
        result['status'] = 'FAILED'
        result['error'] = str(e)
        result['timestamp_end'] = datetime.now().isoformat()
        save_results_to_db(job_id, result)
        return result
