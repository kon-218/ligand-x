"""
RBFE Service API Routers
FastAPI endpoints for relative binding free energy calculations.
"""
import os
import uuid
import logging
import json
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from pathlib import Path

from .service import RBFEService

logger = logging.getLogger(__name__)

# Initialize RBFE service
rbfe_service = RBFEService()

router = APIRouter(prefix="/api/rbfe")


def _run_rbfe_calculation_in_process(
    protein_pdb_data: str,
    ligands_data: List[Dict[str, Any]],
    job_id: str,
    network_topology: str,
    central_ligand_name: Optional[str],
    atom_mapper: str,
    atom_map_hydrogens: bool,
    lomap_max3d: float,
    simulation_settings: Optional[Dict[str, Any]],
    protein_id: str
) -> None:
    """
    Run RBFE calculation in a separate process.
    This function must be at module level to be picklable for multiprocessing.
    """
    import sys
    from pathlib import Path
    from datetime import datetime
    
    log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
    
    # Create job-specific console log file
    output_dir = os.getenv('RBFE_OUTPUT_DIR', 'data/rbfe_outputs')
    job_dir = Path(output_dir) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    console_log_file = job_dir / 'console.log'
    
    # Create a tee stream for logging
    class TeeStream:
        def __init__(self, original_stream, log_file_path):
            self.original_stream = original_stream
            self.log_file = open(log_file_path, 'w', buffering=1)
            self.log_file.write(f"=== RBFE Calculation Console Log ===\n")
            self.log_file.write(f"Job ID: {job_id}\n")
            self.log_file.write(f"Started: {datetime.now().isoformat()}\n")
            self.log_file.write(f"Network Topology: {network_topology}\n")
            self.log_file.write(f"Num Ligands: {len(ligands_data)}\n")
            self.log_file.write(f"Atom Mapper: {atom_mapper}\n")
            self.log_file.write(f"Map Hydrogens: {atom_map_hydrogens}\n")
            self.log_file.write(f"LOMAP max3d: {lomap_max3d}\n")
            self.log_file.write(f"{'=' * 40}\n\n")
            
        def write(self, message):
            self.original_stream.write(message)
            self.log_file.write(message)
            self.log_file.flush()
            
        def flush(self):
            self.original_stream.flush()
            self.log_file.flush()
            
        def close(self):
            self.log_file.write(f"\n{'=' * 40}\n")
            self.log_file.write(f"Completed: {datetime.now().isoformat()}\n")
            self.log_file.close()
    
    # Redirect stdout and stderr
    tee_stdout = TeeStream(sys.stdout, console_log_file)
    tee_stderr = TeeStream(sys.stderr, job_dir / 'console_errors.log')
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = tee_stdout
    sys.stderr = tee_stderr
    
    try:
        # Set up logging
        logging.basicConfig(
            level=getattr(logging, log_level, logging.INFO),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[logging.StreamHandler(sys.stdout)],
            force=True
        )
        
        logging.getLogger('services.rbfe').setLevel(getattr(logging, log_level, logging.INFO))
        
        subprocess_logger = logging.getLogger(__name__)
        subprocess_logger.info(f"Starting RBFE calculation for job {job_id}")
        
        # Create service instance and run
        service = RBFEService(output_dir=output_dir)
        service.run_rbfe_calculation(
            protein_pdb=protein_pdb_data,
            ligands_data=ligands_data,
            job_id=job_id,
            network_topology=network_topology,
            central_ligand_name=central_ligand_name,
            atom_mapper=atom_mapper,
            atom_map_hydrogens=atom_map_hydrogens,
            lomap_max3d=lomap_max3d,
            simulation_settings=simulation_settings,
            protein_id=protein_id
        )
        
        subprocess_logger.info(f"Completed RBFE calculation for job {job_id}")
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        tee_stdout.close()
        tee_stderr.close()


# Request/Response models
class LigandData(BaseModel):
    """Individual ligand data."""
    id: str = Field(..., description="Ligand identifier")
    data: str = Field(..., description="Ligand structure data (SDF/MOL/PDB)")
    format: str = Field(default="sdf", description="Data format")
    has_docked_pose: bool = Field(default=False, description="Whether this is a docked pose")
    docking_affinity: Optional[float] = Field(default=None, description="Docking affinity if already docked (kcal/mol)")


class RBFECalculationRequest(BaseModel):
    """
    Request model for RBFE calculation following OpenFE best practices.

    WORKFLOW:
    1. Load ligands with 3D coordinates (from file or generate)
    2. Select atom mapper (Kartograf recommended for 3D, LOMAP for 2D)
    3. Atom mapper creates network AND handles alignment automatically
    4. Run FE calculations for each transformation

    ATOM MAPPERS:
    - kartograf (RECOMMENDED): Geometry-based, preserves 3D binding mode
      Use for docked poses (95% identical mappings, per research)
    - lomap: 2D MCS-based, may realign structures
      Use for 2D structures or when Kartograf fails
    - lomap_relaxed: Relaxed LOMAP settings for difficult pairs

    NO PRE-ALIGNMENT NEEDED: Atom mappers handle both mapping and alignment.

    Simulation settings:
    - robust_mode (bool): Enable conservative settings (default: True)
    - fast_mode (bool): Use shorter simulation lengths (default: True)
    - equilibration_length_ns (float): Equilibration time in nanoseconds
    - production_length_ns (float): Production time in nanoseconds
    - lambda_windows (int): Number of lambda windows
    - charge_method (str): Partial charge method ('am1bcc', etc.)

    References:
    - Kartograf paper: https://pubs.acs.org/doi/10.1021/acs.jctc.3c01206
    - OpenFE tutorial: https://docs.openfree.energy/en/latest/tutorials/rbfe_cli_tutorial.html
    """
    protein_pdb: str = Field(..., description="Protein PDB data")
    ligands: List[LigandData] = Field(..., description="List of ligand data with 3D coordinates")
    protein_id: str = Field(default="protein", description="Protein identifier")
    network_topology: str = Field(default="mst", description="Network topology (mst, radial, maximal)")
    central_ligand: Optional[str] = Field(default=None, description="Central ligand for radial networks")
    atom_mapper: str = Field(default="kartograf", description="Atom mapper (kartograf, lomap, lomap_relaxed)")
    atom_map_hydrogens: bool = Field(default=True, description="For Kartograf - include hydrogens in mapping")
    lomap_max3d: float = Field(default=1.0, description="For LOMAP - max 3D distance for mapping (Angstroms)")
    simulation_settings: Optional[Dict[str, Any]] = Field(default=None, description="Simulation settings (robust_mode, fast_mode, etc.)")


class RBFECalculationResponse(BaseModel):
    """Response model for RBFE calculation submission."""
    job_id: str
    status: str
    message: str
    num_ligands: int
    network_topology: str


class DockedPoseInfo(BaseModel):
    """Information about a docked pose."""
    ligand_id: str
    affinity_kcal_mol: float
    pose_pdb_path: str
    complex_pdb_path: str
    alignment_score: Optional[float] = None
    mcs_atoms: Optional[int] = None


class RBFEStatusResponse(BaseModel):
    """Response model for RBFE job status."""
    job_id: str
    status: str
    progress: Optional[float] = None
    message: Optional[str] = None
    network: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None
    alignment_info: Optional[Dict[str, Any]] = None
    docking_scores: Optional[Dict[str, float]] = None
    docked_poses: Optional[List[DockedPoseInfo]] = None
    docking_log: Optional[str] = None
    output_files: Optional[Dict[str, str]] = None
    reference_ligand: Optional[str] = None
    error: Optional[str] = None
    ligand_smiles: Optional[Dict[str, str]] = None


class RBFENetworkPreviewRequest(BaseModel):
    """Request model for previewing network topology."""
    ligand_names: List[str] = Field(..., description="List of ligand names")
    topology: str = Field(default="mst", description="Network topology")
    central_ligand: Optional[str] = Field(default=None, description="Central ligand for radial")


class RBFENetworkPreviewResponse(BaseModel):
    """Response model for network preview."""
    nodes: List[str]
    edges: List[Dict[str, Any]]
    topology: str
    quality: Dict[str, Any]


@router.post("/calculate", response_model=RBFECalculationResponse)
async def submit_rbfe_calculation(request: RBFECalculationRequest):
    """
    Submit a new RBFE calculation.
    
    Requires at least 2 ligands. Ligands should ideally have docked poses
    for accurate binding free energy predictions.
    """
    try:
        # Validate minimum ligands
        if len(request.ligands) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 ligands are required for RBFE calculations"
            )
        
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Prepare ligands data
        ligands_data = [
            {
                'id': lig.id,
                'data': lig.data,
                'format': lig.format,
                'has_docked_pose': lig.has_docked_pose
            }
            for lig in request.ligands
        ]
        
        logger.info(f"Received RBFE calculation request with job_id: {job_id}")
        logger.info(f"Num ligands: {len(ligands_data)}, Topology: {request.network_topology}")
        logger.info(f"Atom mapper: {request.atom_mapper}")

        # Start calculation in background process
        import multiprocessing

        if multiprocessing.get_start_method(allow_none=True) != 'spawn':
            try:
                multiprocessing.set_start_method('spawn', force=True)
            except RuntimeError:
                pass

        calc_process = multiprocessing.Process(
            target=_run_rbfe_calculation_in_process,
            args=(
                request.protein_pdb,
                ligands_data,
                job_id,
                request.network_topology,
                request.central_ligand,
                request.atom_mapper,
                request.atom_map_hydrogens,
                request.lomap_max3d,
                request.simulation_settings,
                request.protein_id
            )
        )
        calc_process.daemon = True
        calc_process.start()
        
        return RBFECalculationResponse(
            job_id=job_id,
            status="submitted",
            message=f"RBFE calculation submitted successfully. Job ID: {job_id}",
            num_ligands=len(ligands_data),
            network_topology=request.network_topology
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting RBFE calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class RBFEResumeRequest(BaseModel):
    """Request model for resuming an RBFE calculation after docking validation."""
    job_id: str = Field(..., description="Job ID to resume")


@router.post("/resume/{job_id}", response_model=RBFECalculationResponse)
async def resume_rbfe_calculation(job_id: str):
    """
    Resume an RBFE calculation after docking validation.
    
    Use this endpoint after reviewing docked poses when the job status is 'docking_ready'.
    This acknowledges the docked poses and continues with the RBFE calculation.
    """
    try:
        # Get job status to retrieve parameters
        job_info = rbfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        if job_info.get('status') != 'docking_ready':
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} is not ready for resume. Status: {job_info.get('status')}"
            )
        
        logger.info(f"Resuming RBFE calculation for job_id: {job_id}")
        
        # Load the saved job data
        job_dir = Path(rbfe_service.output_dir) / job_id
        
        # Load ligands data from saved docking results
        docked_poses_summary = job_dir / "docked_poses" / "docking_summary.json"
        if not docked_poses_summary.exists():
            raise HTTPException(
                status_code=400,
                detail="Docking data not found. Cannot resume calculation."
            )
        
        # Update job status to resuming
        rbfe_service._update_job_status(job_id, {
            'status': 'resuming',
            'message': 'Docking acknowledged. Continuing RBFE calculation...'
        })
        
        # We need to reload the original request parameters
        # For now, we'll read from job status and continue
        # This requires storing original parameters in job status
        
        # For simplicity, mark as docking_acknowledged and let frontend re-submit
        rbfe_service._update_job_status(job_id, {
            'status': 'docking_acknowledged',
            'message': 'Docking poses validated. Ready to continue. Please re-submit with docking_acknowledged=True.',
            'docking_acknowledged': True
        })
        
        return RBFECalculationResponse(
            job_id=job_id,
            status="docking_acknowledged",
            message="Docking poses validated. Please re-submit the calculation with docking_acknowledged=True to continue.",
            num_ligands=job_info.get('num_ligands', 0),
            network_topology=job_info.get('network_topology', 'mst')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming RBFE calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-form", response_model=RBFECalculationResponse)
async def submit_rbfe_calculation_form(
    protein_pdb: UploadFile = File(..., description="Protein structure in PDB format"),
    ligands_json: str = Form(..., description="JSON array of ligand data objects"),
    protein_id: str = Form(default="protein"),
    network_topology: str = Form(default="mst"),
    central_ligand: Optional[str] = Form(default=None),
    atom_mapper: str = Form(default="kartograf"),
    atom_map_hydrogens: str = Form(default="true"),
    lomap_max3d: str = Form(default="1.0"),
    simulation_settings: Optional[str] = Form(default=None)
):
    """
    Submit RBFE calculation with form data (alternative to JSON).
    Useful for file uploads.
    """
    try:
        # Parse ligands JSON
        ligands_data = json.loads(ligands_json)
        
        if len(ligands_data) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 ligands are required for RBFE calculations"
            )
        
        # Read protein PDB
        protein_pdb_data = (await protein_pdb.read()).decode('utf-8')
        
        # Parse simulation settings
        settings_dict = None
        if simulation_settings:
            settings_dict = json.loads(simulation_settings)

        # Parse numeric parameters from form strings
        atom_map_hydrogens_bool = atom_map_hydrogens.lower() in ('true', '1', 'yes')
        lomap_max3d_float = float(lomap_max3d)

        # Generate job ID
        job_id = str(uuid.uuid4())

        logger.info(f"Received RBFE form request with job_id: {job_id}")

        # Start background process
        import multiprocessing

        if multiprocessing.get_start_method(allow_none=True) != 'spawn':
            try:
                multiprocessing.set_start_method('spawn', force=True)
            except RuntimeError:
                pass

        calc_process = multiprocessing.Process(
            target=_run_rbfe_calculation_in_process,
            args=(
                protein_pdb_data,
                ligands_data,
                job_id,
                network_topology,
                central_ligand,
                atom_mapper,
                atom_map_hydrogens_bool,
                lomap_max3d_float,
                settings_dict,
                protein_id
            )
        )
        calc_process.daemon = True
        calc_process.start()
        
        return RBFECalculationResponse(
            job_id=job_id,
            status="submitted",
            message=f"RBFE calculation submitted successfully. Job ID: {job_id}",
            num_ligands=len(ligands_data),
            network_topology=network_topology
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting RBFE calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{job_id}", response_model=RBFEStatusResponse)
async def get_calculation_status(job_id: str):
    """Get the status of an RBFE calculation."""
    try:
        job_info = rbfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return RBFEStatusResponse(
            job_id=job_id,
            status=job_info['status'],
            progress=job_info.get('progress'),
            message=job_info.get('message'),
            network=job_info.get('network'),
            results=job_info.get('results'),
            alignment_info=job_info.get('alignment_info'),
            docking_scores=job_info.get('docking_scores'),
            docked_poses=job_info.get('docked_poses'),
            docking_log=job_info.get('docking_log'),
            output_files=job_info.get('output_files'),
            reference_ligand=job_info.get('reference_ligand'),
            error=job_info.get('error'),
            ligand_smiles=job_info.get('ligand_smiles'),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{job_id}")
async def get_calculation_results(job_id: str):
    """Get the results of a completed RBFE calculation."""
    try:
        job_info = rbfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        if job_info['status'] != 'completed':
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} is not completed. Status: {job_info['status']}"
            )
        
        return {
            'job_id': job_id,
            'results': job_info.get('results', {}),
            'alignment_info': job_info.get('alignment_info', {}),
            'reference_ligand': job_info.get('reference_ligand'),
            'docked_poses': job_info.get('docked_poses', []),
            'network': job_info.get('network', {})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting results: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/network/{job_id}")
async def get_network_data(job_id: str):
    """Get the network graph data for visualization."""
    try:
        job_info = rbfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        network = job_info.get('network', {})
        
        if not network:
            # Try to load from file
            job_dir = Path(rbfe_service.output_dir) / job_id
            network_file = job_dir / "network.json"
            if network_file.exists():
                with open(network_file, 'r') as f:
                    network = json.load(f)
        
        return {
            'job_id': job_id,
            'network': network
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs")
async def list_all_jobs():
    """List all RBFE calculation jobs."""
    try:
        jobs = rbfe_service.list_jobs()
        return {"jobs": jobs}
        
    except Exception as e:
        logger.error(f"Error listing jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class RBFEAsyncRequest(BaseModel):
    """Request model for async RBFE calculation via Celery."""
    protein_pdb_data: str = Field(..., description="Protein PDB data as string")
    ligands: List[Dict[str, Any]] = Field(..., description="List of ligand data")
    protein_id: Optional[str] = Field(default="protein", description="Protein identifier")
    network_topology: Optional[str] = Field(default="mst", description="Network topology")
    central_ligand: Optional[str] = Field(default=None, description="Central ligand for radial topology")
    atom_mapper: Optional[str] = Field(default="kartograf", description="Atom mapper: kartograf, lomap, lomap_relaxed")
    atom_map_hydrogens: Optional[bool] = Field(default=True, description="Include hydrogens in Kartograf mapping")
    lomap_max3d: Optional[float] = Field(default=1.0, description="LOMAP max 3D distance for mapping")
    simulation_settings: Optional[Dict[str, Any]] = Field(default=None, description="Custom settings")


@router.post("/submit_async")
async def submit_async_rbfe(request: RBFEAsyncRequest):
    """
    Submit RBFE calculation as async Celery task.
    
    This endpoint submits the job to the GPU worker queue and returns immediately.
    Use /api/jobs/stream/{job_id} to track progress via SSE.
    
    Returns:
        job_id: Celery task ID
        status: 'submitted'
        stream_url: URL for SSE progress streaming
    """
    try:
        # Prepare job data - flat structure matching run_rbfe_job.py expectations
        job_data = {
            'protein_pdb_data': request.protein_pdb_data,
            'ligands': request.ligands,
            'protein_id': request.protein_id,
            'network_topology': request.network_topology,
            'central_ligand': request.central_ligand,
            'atom_mapper': request.atom_mapper,
            'atom_map_hydrogens': request.atom_map_hydrogens,
            'lomap_max3d': request.lomap_max3d,
        }

        if request.simulation_settings:
            job_data['protocol_settings'] = request.simulation_settings
        
        # Submit to Celery
        try:
            from lib.tasks.gpu_tasks import rbfe_calculate
            task = rbfe_calculate.delay(job_data)
            job_id = task.id
            
            logger.info(f"Submitted async RBFE job {job_id}")
            
            return {
                "job_id": job_id,
                "status": "submitted",
                "job_type": "rbfe",
                "stream_url": f"/api/jobs/stream/{job_id}",
                "message": "RBFE calculation submitted to GPU queue"
            }
        except ImportError:
            logger.warning("Celery not available, falling back to multiprocessing")
            raise HTTPException(
                status_code=503,
                detail="Async job submission not available. Use /api/rbfe/calculate instead."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit async RBFE job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/cancel")
async def cancel_job_consistent(job_id: str):
    """Cancel RBFE job (consistent endpoint)."""
    try:
        result = rbfe_service.cancel_job(job_id)
        if result.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error cancelling job: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """
    Delete a job and all its files.
    
    WARNING: This permanently removes the job and all associated data.
    """
    try:
        deleted = rbfe_service.delete_job(job_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        return {
            "job_id": job_id,
            "deleted": True,
            "message": "Job and associated files deleted"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting job: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stale-jobs")
async def get_stale_jobs(threshold_minutes: int = 30):
    """
    Get list of jobs that appear to be stale (stuck in running state).
    
    Args:
        threshold_minutes: Minutes after which a running job is considered stale (default: 30)
    """
    try:
        stale_job_ids = rbfe_service.check_stale_jobs(threshold_minutes)
        return {
            "stale_jobs": stale_job_ids,
            "count": len(stale_job_ids),
            "threshold_minutes": threshold_minutes
        }
        
    except Exception as e:
        logger.error(f"Error checking stale jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel-stale-jobs")
async def cancel_stale_jobs(threshold_minutes: int = 30):
    """
    Cancel all stale jobs.
    
    Args:
        threshold_minutes: Minutes after which a running job is considered stale (default: 30)
    """
    try:
        stale_job_ids = rbfe_service.check_stale_jobs(threshold_minutes)
        
        cancelled = []
        for job_id in stale_job_ids:
            result = rbfe_service.cancel_job(job_id)
            if result.get('status') == 'cancelled':
                cancelled.append(job_id)
        
        return {
            "cancelled_jobs": cancelled,
            "count": len(cancelled),
            "message": f"Cancelled {len(cancelled)} stale jobs"
        }
        
    except Exception as e:
        logger.error(f"Error cancelling stale jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{job_id}")
async def list_job_files(job_id: str):
    """List all files generated by an RBFE calculation."""
    try:
        files = rbfe_service.get_job_files(job_id)
        return {"job_id": job_id, "files": files}
        
    except Exception as e:
        logger.error(f"Error listing files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{job_id}/{filename:path}")
async def get_job_file(job_id: str, filename: str):
    """Download a specific file from an RBFE calculation."""
    try:
        # Security: Validate filename
        if '..' in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        job_dir = Path(rbfe_service.output_dir) / job_id
        if not job_dir.exists():
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        file_path = job_dir / filename
        
        # Security: Ensure file is within job directory
        if not file_path.resolve().is_relative_to(job_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        
        # Determine media type
        suffix = file_path.suffix.lower()
        media_types = {
            '.json': 'application/json',
            '.pdb': 'chemical/x-pdb',
            '.sdf': 'chemical/x-mdl-sdfile',
            '.log': 'text/plain',
            '.txt': 'text/plain',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
        }
        media_type = media_types.get(suffix, 'application/octet-stream')
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type=media_type
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/{job_id}")
async def get_job_logs(job_id: str):
    """Get logs from an RBFE calculation."""
    try:
        logs = rbfe_service.get_job_logs(job_id)
        return {"job_id": job_id, "logs": logs}
        
    except Exception as e:
        logger.error(f"Error getting logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preview-network", response_model=RBFENetworkPreviewResponse)
async def preview_network(request: RBFENetworkPreviewRequest):
    """
    Preview network topology without running calculation.
    Returns estimated edges and quality metrics.

    Note: This is a simplified preview. Actual network may differ
    based on atom mapping results.
    """
    try:
        # Generate estimated edges based on topology
        nodes = request.ligand_names
        edges = []

        if request.topology == 'radial':
            central = request.central_ligand or nodes[0]
            for node in nodes:
                if node != central:
                    edges.append({
                        'ligand_a': central,
                        'ligand_b': node,
                        'score': 0.5  # Estimated
                    })
        elif request.topology == 'maximal':
            for i, node_a in enumerate(nodes):
                for node_b in nodes[i+1:]:
                    edges.append({
                        'ligand_a': node_a,
                        'ligand_b': node_b,
                        'score': 0.5
                    })
        else:  # MST - simple chain
            for i in range(len(nodes) - 1):
                edges.append({
                    'ligand_a': nodes[i],
                    'ligand_b': nodes[i + 1],
                    'score': 0.5
                })

        quality = {
            'num_nodes': len(nodes),
            'num_edges': len(edges),
            'avg_score': 0.5,
            'quality': 'estimated'
        }

        return RBFENetworkPreviewResponse(
            nodes=nodes,
            edges=edges,
            topology=request.topology,
            quality=quality
        )

    except Exception as e:
        logger.error(f"Error previewing network: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diagnostics/{job_id}")
async def get_job_diagnostics(job_id: str):
    """
    Get detailed diagnostic information for an RBFE calculation.

    Returns validation reports, warnings, and error diagnostics to help
    understand and troubleshoot RBFE calculation issues.

    Includes:
    - Alignment validation warnings
    - Force field compatibility checks
    - Structural validation issues
    - Transformation failure diagnostics
    """
    try:
        job_info = rbfe_service.get_job_status(job_id)

        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        # Collect diagnostic information
        diagnostics = {
            'job_id': job_id,
            'status': job_info.get('status'),
            'alignment_diagnostics': {},
            'transformation_diagnostics': {},
            'validation_summary': {}
        }

        # Extract alignment diagnostics
        alignment_info = job_info.get('alignment_info', {})
        if alignment_info:
            aligned_ligands = alignment_info.get('aligned_ligands', [])
            failed_ligands = alignment_info.get('failed_ligands', [])

            # Collect validation warnings from aligned ligands
            validation_warnings = []
            for lig in aligned_ligands:
                if lig.get('validation_warnings'):
                    validation_warnings.append({
                        'ligand_id': lig.get('id'),
                        'warnings': lig.get('validation_warnings')
                    })

            diagnostics['alignment_diagnostics'] = {
                'reference_ligand': alignment_info.get('reference_ligand'),
                'total_ligands': len(aligned_ligands) + len(failed_ligands),
                'aligned': len(aligned_ligands),
                'failed': len(failed_ligands),
                'failed_ligands': failed_ligands,
                'validation_warnings': validation_warnings,
                'statistics': alignment_info.get('statistics', {})
            }

        # Extract transformation diagnostics
        results = job_info.get('results', {})
        if results:
            transformation_results = results.get('transformation_results', [])

            failed_transformations = [t for t in transformation_results if t.get('status') == 'failed']
            completed_transformations = [t for t in transformation_results if t.get('status') == 'completed']

            # Categorize failures
            nan_errors = [t for t in failed_transformations if t.get('is_nan_error')]
            other_errors = [t for t in failed_transformations if not t.get('is_nan_error')]

            diagnostics['transformation_diagnostics'] = {
                'total_transformations': len(transformation_results),
                'completed': len(completed_transformations),
                'failed': len(failed_transformations),
                'nan_errors': len(nan_errors),
                'other_errors': len(other_errors),
                'failed_details': [
                    {
                        'name': t.get('name'),
                        'ligand_a': t.get('ligand_a'),
                        'ligand_b': t.get('ligand_b'),
                        'leg': t.get('leg'),
                        'error_type': t.get('error_type', 'Unknown'),
                        'error': t.get('error', ''),
                        'is_nan_error': t.get('is_nan_error', False)
                    }
                    for t in failed_transformations
                ]
            }

        # Generate validation summary
        diagnostics['validation_summary'] = {
            'has_alignment_issues': bool(diagnostics['alignment_diagnostics'].get('failed')),
            'has_validation_warnings': bool(diagnostics['alignment_diagnostics'].get('validation_warnings')),
            'has_nan_errors': diagnostics['transformation_diagnostics'].get('nan_errors', 0) > 0,
            'calculation_status': job_info.get('status'),
            'recommendations': []
        }

        # Generate recommendations
        recommendations = []
        if diagnostics['transformation_diagnostics'].get('nan_errors', 0) > 0:
            recommendations.append(
                "NaN errors detected. This typically indicates structural instabilities. "
                "Enable robust_mode (already default) or check alignment quality."
            )

        if diagnostics['alignment_diagnostics'].get('failed', 0) > 0:
            recommendations.append(
                f"{diagnostics['alignment_diagnostics']['failed']} ligands failed alignment. "
                "These ligands may be too dissimilar to the reference. "
                "Consider using a different reference ligand or excluding these ligands."
            )

        if diagnostics['alignment_diagnostics'].get('validation_warnings'):
            recommendations.append(
                "Structural validation warnings detected. Review alignment quality and "
                "check for atomic clashes or unusual geometries."
            )

        diagnostics['validation_summary']['recommendations'] = recommendations

        return diagnostics

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting diagnostics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ligand-image")
async def get_ligand_image(smiles: str):
    """Render a 2D ligand image from SMILES using RDKit and return as PNG."""
    import io
    try:
        from rdkit import Chem
        from rdkit.Chem import Draw
    except ImportError:
        raise HTTPException(status_code=500, detail="RDKit not available")

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Invalid SMILES string")

    img = Draw.MolToImage(mol, size=(200, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")








