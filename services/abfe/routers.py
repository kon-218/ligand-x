"""
ABFE Service API Routers
FastAPI endpoints for absolute binding free energy calculations.
"""
import os
import uuid
import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from .service import ABFEService

logger = logging.getLogger(__name__)

# Initialize ABFE service
abfe_service = ABFEService()

router = APIRouter(prefix="/api/abfe")


def _run_abfe_calculation_in_process(
    protein_pdb_data: str,
    ligand_sdf_data: str,
    job_id: str,
    simulation_settings: Optional[Dict[str, Any]],
    ligand_id: str,
    protein_id: str
) -> None:
    """
    Run ABFE calculation in a separate process.
    This function must be at module level to be picklable for multiprocessing.
    
    Args:
        protein_pdb_data: PDB data for protein
        ligand_sdf_data: SDF data for ligand
        job_id: Unique identifier for this job
        simulation_settings: Optional custom simulation settings
        ligand_id: Identifier for ligand
        protein_id: Identifier for protein
    """
    # Configure logging in the subprocess
    # This is necessary because subprocesses don't inherit logging configuration
    import sys
    import os

    log_level = os.getenv('LOG_LEVEL', 'INFO').upper()

    # Set up logging for the subprocess
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
        force=True  # Force reconfiguration in case logging was already configured
    )

    # Set logger levels
    logging.getLogger('services.abfe').setLevel(getattr(logging, log_level, logging.INFO))
    logging.getLogger('openfe').setLevel(logging.INFO)
    logging.getLogger('gufekey').setLevel(logging.INFO)
    
    subprocess_logger = logging.getLogger(__name__)
    subprocess_logger.info(f"Starting ABFE calculation in subprocess for job {job_id}")
    
    # Create a new service instance in the subprocess
    # This is necessary because service instances can't be pickled for multiprocessing
    service = ABFEService()
    service.run_abfe_calculation(
        protein_pdb=protein_pdb_data,
        ligand_sdf=ligand_sdf_data,
        job_id=job_id,
        simulation_settings=simulation_settings,
        ligand_id=ligand_id,
        protein_id=protein_id
    )
    
    subprocess_logger.info(f"Completed ABFE calculation in subprocess for job {job_id}")


# Request/Response models
class ABFECalculationRequest(BaseModel):
    """Request model for ABFE calculation."""
    ligand_id: Optional[str] = Field(default="ligand", description="Ligand identifier")
    protein_id: Optional[str] = Field(default="protein", description="Protein identifier")
    simulation_settings: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom simulation settings (e.g., simulation time, lambda windows)"
    )


class ABFECalculationResponse(BaseModel):
    """Response model for ABFE calculation submission."""
    job_id: str
    status: str
    message: str


class ABFEStatusResponse(BaseModel):
    """Response model for ABFE job status."""
    job_id: str
    status: str
    results: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ABFEResultsResponse(BaseModel):
    """Response model for ABFE results."""
    job_id: str
    binding_free_energy_kcal_mol: Optional[float]
    ligand_id: str
    protein_id: str
    job_dir: str


class ABFEParsedResultsResponse(BaseModel):
    """Response model for parsed ABFE results with detailed analysis."""
    job_id: str
    dg_results: List[Dict[str, Any]] = Field(default_factory=list, description="Overall DG values per ligand")
    dg_raw: List[Dict[str, Any]] = Field(default_factory=list, description="Individual leg contributions")
    ligands: List[str] = Field(default_factory=list, description="List of ligand names found")
    job_dir: Optional[str] = None
    error: Optional[str] = None


@router.post("/calculate", response_model=ABFECalculationResponse)
async def submit_abfe_calculation(
    protein_pdb: UploadFile = File(..., description="Protein structure in PDB format"),
    ligand_sdf: UploadFile = File(..., description="Ligand structure in SDF format"),
    ligand_id: str = Form(default="ligand"),
    protein_id: str = Form(default="protein"),
    simulation_settings: Optional[str] = Form(default=None)
):
    """
    Submit a new ABFE calculation.
    
    Args:
        protein_pdb: Protein PDB file
        ligand_sdf: Ligand SDF file
        ligand_id: Identifier for the ligand
        protein_id: Identifier for the protein
        simulation_settings: Optional JSON string with custom simulation settings
        
    Returns:
        Job ID and initial status
    """
    try:
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Read uploaded files
        protein_pdb_data = (await protein_pdb.read()).decode('utf-8')
        ligand_sdf_data = (await ligand_sdf.read()).decode('utf-8')
        
        # Parse simulation settings if provided
        settings_dict = None
        if simulation_settings:
            import json
            settings_dict = json.loads(simulation_settings)
        
        logger.info(f"Received ABFE calculation request with job_id: {job_id}")
        logger.info(f"Ligand ID: {ligand_id}, Protein ID: {protein_id}")
        
        # Use multiprocessing instead of threading to avoid signal handler issues
        # OpenMMTools signal handlers require running in the main process
        # Note: In production, this should be handled asynchronously (e.g., using Celery)
        import multiprocessing
        
        # Start calculation in background process
        # Use 'spawn' start method for better compatibility (especially in Docker)
        # This ensures each process has its own Python interpreter
        if multiprocessing.get_start_method(allow_none=True) != 'spawn':
            try:
                multiprocessing.set_start_method('spawn', force=True)
            except RuntimeError:
                # Start method already set, continue with current method
                pass
        
        # Use module-level function that can be pickled
        calc_process = multiprocessing.Process(
            target=_run_abfe_calculation_in_process,
            args=(
                protein_pdb_data,
                ligand_sdf_data,
                job_id,
                settings_dict,
                ligand_id,
                protein_id
            )
        )
        calc_process.daemon = True
        calc_process.start()
        
        return ABFECalculationResponse(
            job_id=job_id,
            status="submitted",
            message=f"ABFE calculation submitted successfully. Job ID: {job_id}"
        )
        
    except Exception as e:
        logger.error(f"Error submitting ABFE calculation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{job_id}", response_model=ABFEStatusResponse)
async def get_calculation_status(job_id: str):
    """
    Get the status of an ABFE calculation.
    
    If the job is marked as completed but has no results, this endpoint will
    attempt to re-extract results from the job directory.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Job status and results if available
    """
    try:
        job_info = abfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        # If job is completed but has no results, try to re-extract
        if job_info.get('status') == 'completed' and not job_info.get('results', {}).get('binding_free_energy_kcal_mol'):
            logger.info(f"Job {job_id} is completed but missing results. Attempting to re-extract...")
            try:
                # Try to parse results from job directory
                parsed_results = abfe_service.parse_results_from_job(job_id)
                
                if parsed_results.get('dg_results') and len(parsed_results['dg_results']) > 0:
                    # Extract binding free energy from parsed results
                    dg_value = parsed_results['dg_results'][0].get('dg_kcal_mol')
                    if dg_value is not None:
                        # Update job status with extracted results
                        job_info['results'] = {
                            'binding_free_energy_kcal_mol': dg_value,
                            'ligand_id': job_info.get('ligand_id', 'unknown'),
                            'protein_id': job_info.get('protein_id', 'unknown'),
                            'job_dir': job_info.get('job_dir', ''),
                            'uncertainty_kcal_mol': parsed_results['dg_results'][0].get('uncertainty_kcal_mol')
                        }
                        # Save updated status
                        abfe_service._update_job_status(job_id, {
                            'results': job_info['results']
                        })
                        logger.info(f"Successfully re-extracted results for job {job_id}: {dg_value} kcal/mol")
            except Exception as re_extract_error:
                logger.warning(f"Failed to re-extract results for job {job_id}: {re_extract_error}")
        
        return ABFEStatusResponse(
            job_id=job_id,
            status=job_info['status'],
            results=job_info.get('results'),
            error=job_info.get('error')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete ABFE job."""
    success = abfe_service.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete job {job_id}")
    return {"success": True}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel ABFE job."""
    success = abfe_service.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to cancel job {job_id}")
    return {"success": True}


@router.get("/results/{job_id}", response_model=ABFEResultsResponse)
async def get_calculation_results(job_id: str):
    """
    Get the results of a completed ABFE calculation.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Binding free energy and related data
    """
    try:
        job_info = abfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        if job_info['status'] != 'completed':
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} is not completed yet. Current status: {job_info['status']}"
            )
        
        results = job_info.get('results', {})
        
        return ABFEResultsResponse(
            job_id=job_id,
            binding_free_energy_kcal_mol=results.get('binding_free_energy_kcal_mol'),
            ligand_id=results.get('ligand_id', 'unknown'),
            protein_id=results.get('protein_id', 'unknown'),
            job_dir=results.get('job_dir', '')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job results: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ABFEDetailedAnalysisResponse(BaseModel):
    """Response model for detailed ABFE analysis."""
    job_id: str
    legs: List[Dict[str, Any]] = Field(default_factory=list)
    convergence_data: Optional[Dict[str, Any]] = None
    thermodynamic_cycle: Optional[Dict[str, Any]] = None
    output_files: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    error: Optional[str] = None


@router.get("/detailed-analysis/{job_id}", response_model=ABFEDetailedAnalysisResponse)
async def get_detailed_analysis(job_id: str):
    """
    Get detailed analysis data for an ABFE job.
    
    This endpoint provides comprehensive analysis including:
    - Overlap matrices for each leg (paths to PNG files)
    - Replica exchange statistics
    - Convergence data from MBAR analysis
    - Thermodynamic cycle breakdown
    - List of all output files (logs, structures, trajectories, plots)
    
    Args:
        job_id: Job identifier
        
    Returns:
        Detailed analysis data
    """
    try:
        analysis = abfe_service.get_detailed_analysis(job_id)
        
        if analysis.get('error'):
            return ABFEDetailedAnalysisResponse(
                job_id=job_id,
                error=analysis.get('error'),
                legs=analysis.get('legs', []),
                convergence_data=analysis.get('convergence_data'),
                thermodynamic_cycle=analysis.get('thermodynamic_cycle'),
                output_files=analysis.get('output_files', {})
            )
        
        return ABFEDetailedAnalysisResponse(
            job_id=job_id,
            legs=analysis.get('legs', []),
            convergence_data=analysis.get('convergence_data'),
            thermodynamic_cycle=analysis.get('thermodynamic_cycle'),
            output_files=analysis.get('output_files', {})
        )
        
    except Exception as e:
        logger.error(f"Error getting detailed analysis for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file/{job_id}/{leg_name}/{filename}")
async def get_analysis_file(job_id: str, leg_name: str, filename: str):
    """
    Serve analysis files (plots, logs, etc.) from a job directory.
    
    Args:
        job_id: Job identifier
        leg_name: Name of the leg directory (e.g., 'complex', 'solvent')
        filename: Name of the file to retrieve
        
    Returns:
        File content with appropriate media type
    """
    from fastapi.responses import FileResponse
    
    file_path = abfe_service.get_file_path(job_id, leg_name, filename)
    
    if not file_path:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    
    # Determine media type
    ext = file_path.suffix.lower()
    media_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.log': 'text/plain',
        '.txt': 'text/plain',
        '.yaml': 'text/yaml',
        '.yml': 'text/yaml',
        '.json': 'application/json',
        '.pdb': 'chemical/x-pdb',
        '.sdf': 'chemical/x-mdl-sdfile',
    }
    
    media_type = media_types.get(ext, 'application/octet-stream')
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )


@router.get("/download-log/{job_id}")
async def download_combined_log(job_id: str):
    """
    Download combined simulation log for all legs.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Combined log file as text
    """
    from fastapi.responses import Response
    
    try:
        analysis = abfe_service.get_detailed_analysis(job_id)
        
        if analysis.get('error'):
            raise HTTPException(status_code=404, detail=analysis.get('error'))
        
        combined_log = []
        combined_log.append(f"=== ABFE Calculation Log for Job {job_id} ===\n")
        combined_log.append(f"Generated at: {__import__('datetime').datetime.now().isoformat()}\n\n")
        
        output_files = analysis.get('output_files', {})
        for log_file in output_files.get('logs', []):
            file_path = log_file.get('path')
            if file_path:
                try:
                    from pathlib import Path
                    with open(Path(file_path), 'r') as f:
                        combined_log.append(f"\n{'='*60}\n")
                        combined_log.append(f"Log: {log_file.get('description', log_file.get('filename'))}\n")
                        combined_log.append(f"File: {log_file.get('filename')}\n")
                        combined_log.append(f"Leg: {log_file.get('leg')}\n")
                        combined_log.append(f"{'='*60}\n\n")
                        combined_log.append(f.read())
                except Exception as e:
                    combined_log.append(f"\n[Error reading {log_file.get('filename')}: {e}]\n")
        
        return Response(
            content=''.join(combined_log),
            media_type='text/plain',
            headers={'Content-Disposition': f'attachment; filename="abfe_{job_id}_combined.log"'}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading combined log for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/parse-results/{job_id}", response_model=ABFEParsedResultsResponse)
async def parse_results(job_id: str):
    """
    Parse ABFE results from a job directory.
    
    This endpoint searches for OpenFE result JSON files in the job directory
    and extracts detailed binding free energy data including:
    - Overall binding free energy (DG) for each ligand
    - Individual leg contributions (complex, solvent, standard_state_correction)
    - Uncertainty estimates
    
    Args:
        job_id: Job identifier
        
    Returns:
        Parsed results with DG values and leg contributions
    """
    try:
        parsed_results = abfe_service.parse_results_from_job(job_id)
        
        if parsed_results.get('error'):
            # Return error in response rather than raising exception
            # This allows frontend to handle partial results
            return ABFEParsedResultsResponse(
                job_id=job_id,
                error=parsed_results.get('error'),
                dg_results=parsed_results.get('dg_results', []),
                dg_raw=parsed_results.get('dg_raw', []),
                ligands=parsed_results.get('ligands', []),
                job_dir=parsed_results.get('job_dir')
            )
        
        return ABFEParsedResultsResponse(
            job_id=job_id,
            dg_results=parsed_results.get('dg_results', []),
            dg_raw=parsed_results.get('dg_raw', []),
            ligands=parsed_results.get('ligands', []),
            job_dir=parsed_results.get('job_dir')
        )
        
    except Exception as e:
        logger.error(f"Error parsing results for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs")
async def list_all_jobs():
    """
    List all ABFE calculation jobs.
    
    Returns:
        List of all jobs with their status
    """
    try:
        jobs = abfe_service.list_jobs()
        return {"jobs": jobs}
        
    except Exception as e:
        logger.error(f"Error listing jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ABFEAsyncRequest(BaseModel):
    """Request model for async ABFE calculation via Celery."""
    protein_pdb_data: str = Field(..., description="Protein PDB data as string")
    ligand_sdf_data: str = Field(..., description="Ligand SDF data as string")
    ligand_id: Optional[str] = Field(default="ligand", description="Ligand identifier")
    protein_id: Optional[str] = Field(default="protein", description="Protein identifier")
    simulation_settings: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom simulation settings"
    )


@router.post("/submit_async")
async def submit_async_abfe(request: ABFEAsyncRequest):
    """
    Submit ABFE calculation as async Celery task.
    
    This endpoint submits the job to the GPU worker queue and returns immediately.
    Use /api/jobs/stream/{job_id} to track progress via SSE.
    
    Returns:
        job_id: Celery task ID
        status: 'submitted'
        stream_url: URL for SSE progress streaming
    """
    try:
        # Prepare job data
        job_data = {
            'protein_pdb_data': request.protein_pdb_data,
            'ligand_sdf_data': request.ligand_sdf_data,
            'ligand_id': request.ligand_id,
            'protein_id': request.protein_id,
            'ligand_name': request.ligand_id,
        }
        
        if request.simulation_settings:
            job_data['protocol_settings'] = request.simulation_settings
        
        # Submit to Celery
        try:
            from lib.tasks.gpu_tasks import abfe_calculate
            task = abfe_calculate.delay(job_data)
            job_id = task.id
            
            logger.info(f"Submitted async ABFE job {job_id}")
            
            return {
                "job_id": job_id,
                "status": "submitted",
                "job_type": "abfe",
                "stream_url": f"/api/jobs/stream/{job_id}",
                "message": "ABFE calculation submitted to GPU queue"
            }
        except ImportError:
            logger.warning("Celery not available, falling back to multiprocessing")
            raise HTTPException(
                status_code=503,
                detail="Async job submission not available. Use /api/abfe/calculate instead."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit async ABFE job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{job_id}")
async def list_job_files(job_id: str):
    """
    List all output files for an ABFE job.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Dictionary with categorized file lists
    """
    from pathlib import Path
    import os
    
    try:
        # Get job directory
        job_dir = Path(f"/app/data/abfe_outputs/jobs/{job_id}")
        
        if not job_dir.exists():
            raise HTTPException(status_code=404, detail=f"Job directory not found: {job_id}")
        
        files = {
            'logs': [],
            'structures': [],
            'trajectories': [],
            'analysis': [],
            'other': []
        }
        
        # Recursively find all files
        for file_path in job_dir.rglob('*'):
            if file_path.is_file():
                rel_path = str(file_path.relative_to(job_dir))
                file_info = {
                    'filename': file_path.name,
                    'path': rel_path,
                    'size': file_path.stat().st_size,
                    'modified': file_path.stat().st_mtime
                }
                
                # Categorize by extension
                ext = file_path.suffix.lower()
                if ext in ['.log', '.out', '.err']:
                    files['logs'].append(file_info)
                elif ext in ['.pdb', '.sdf', '.mol2']:
                    files['structures'].append(file_info)
                elif ext in ['.xtc', '.nc', '.dcd', '.trr']:
                    files['trajectories'].append(file_info)
                elif ext in ['.png', '.pdf', '.svg', '.yaml', '.yml', '.json']:
                    files['analysis'].append(file_info)
                else:
                    files['other'].append(file_info)
        
        return {
            'job_id': job_id,
            'files': files
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing files for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files/{job_id}/{filename:path}")
async def get_job_file(job_id: str, filename: str):
    """
    Get a specific file from an ABFE job directory.
    
    Args:
        job_id: Job identifier
        filename: Relative path to file within job directory
        
    Returns:
        File content with appropriate media type
    """
    from fastapi.responses import FileResponse, Response
    from pathlib import Path
    
    try:
        # Get job directory
        job_dir = Path(f"/app/data/abfe_outputs/jobs/{job_id}")
        file_path = job_dir / filename
        
        # Security check: ensure file is within job directory
        if not file_path.resolve().is_relative_to(job_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        
        # Determine media type
        ext = file_path.suffix.lower()
        media_types = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf',
            '.log': 'text/plain',
            '.out': 'text/plain',
            '.err': 'text/plain',
            '.txt': 'text/plain',
            '.yaml': 'text/yaml',
            '.yml': 'text/yaml',
            '.json': 'application/json',
            '.pdb': 'chemical/x-pdb',
            '.sdf': 'chemical/x-mdl-sdfile',
        }
        
        media_type = media_types.get(ext, 'application/octet-stream')
        
        # For text files, return content directly
        if media_type.startswith('text/') or media_type in ['application/json', 'text/yaml']:
            with open(file_path, 'r') as f:
                content = f.read()
            return Response(content=content, media_type=media_type)
        
        # For binary files, use FileResponse
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=file_path.name
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting file {filename} for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/{job_id}")
async def get_job_logs(job_id: str):
    """
    Get all log files for an ABFE job.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Dictionary mapping log file names to their content
    """
    from pathlib import Path
    
    try:
        job_dir = Path(f"/app/data/abfe_outputs/jobs/{job_id}")
        
        if not job_dir.exists():
            raise HTTPException(status_code=404, detail=f"Job directory not found: {job_id}")
        
        logs = {}
        
        # Find all log files
        for log_file in job_dir.rglob('*.log'):
            try:
                with open(log_file, 'r') as f:
                    logs[str(log_file.relative_to(job_dir))] = f.read()
            except Exception as e:
                logger.warning(f"Failed to read log file {log_file}: {e}")
                logs[str(log_file.relative_to(job_dir))] = f"[Error reading file: {e}]"
        
        # Also check for .out files
        for out_file in job_dir.rglob('*.out'):
            try:
                with open(out_file, 'r') as f:
                    logs[str(out_file.relative_to(job_dir))] = f.read()
            except Exception as e:
                logger.warning(f"Failed to read output file {out_file}: {e}")
                logs[str(out_file.relative_to(job_dir))] = f"[Error reading file: {e}]"
        
        return {
            'job_id': job_id,
            'logs': logs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting logs for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/console-log/{job_id}")
async def get_console_log(job_id: str):
    """
    Get the main console log for an ABFE job.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Console log content
    """
    from pathlib import Path
    
    try:
        # Try to find the main log file
        job_dir = Path(f"/app/data/abfe_outputs/jobs/{job_id}")
        
        if not job_dir.exists():
            raise HTTPException(status_code=404, detail=f"Job directory not found: {job_id}")
        
        # Look for common log file names
        log_candidates = [
            job_dir / 'abfe.log',
            job_dir / 'console.log',
            job_dir / 'output.log',
        ]
        
        # Also check for any .log file in the root
        for log_file in job_dir.glob('*.log'):
            log_candidates.append(log_file)
        
        for log_file in log_candidates:
            if log_file.exists():
                with open(log_file, 'r') as f:
                    return {
                        'job_id': job_id,
                        'console_log': f.read()
                    }
        
        # If no log file found, return empty
        return {
            'job_id': job_id,
            'console_log': 'No console log available'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting console log for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/details/{job_id}")
async def get_job_details(job_id: str):
    """
    Get detailed information about an ABFE job.
    
    This is similar to detailed-analysis but returns more comprehensive information.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Detailed job information
    """
    try:
        # Get job status
        job_info = abfe_service.get_job_status(job_id)
        
        if job_info.get('status') == 'not_found':
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        # Get detailed analysis
        analysis = abfe_service.get_detailed_analysis(job_id)
        
        # Combine job info and analysis
        details = {
            'job_id': job_id,
            'status': job_info.get('status'),
            'results': job_info.get('results'),
            'error': job_info.get('error') or analysis.get('error'),
            'legs': analysis.get('legs', []),
            'convergence_data': analysis.get('convergence_data'),
            'thermodynamic_cycle': analysis.get('thermodynamic_cycle'),
            'output_files': analysis.get('output_files', {}),
            'ligand_id': job_info.get('ligand_id'),
            'protein_id': job_info.get('protein_id'),
            'job_dir': job_info.get('job_dir'),
        }
        
        return details
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting details for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
