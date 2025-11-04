"""QC service routers - migrated from Flask."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
from services.qc.service import QuantumChemistryService
from services.qc.config import QCConfig

router = APIRouter(prefix="/api/qc", tags=["QC"])

qc_service = QuantumChemistryService()


class SubmitJobRequest(BaseModel):
    molecule_xyz: str
    molecule_name: Optional[str] = None  # Name of the molecule for display
    charge: int = 0
    multiplicity: int = 1
    n_procs: Optional[int] = None
    memory_mb: Optional[int] = None
    job_type: str = "OPT"
    compute_frequencies: Optional[bool] = None
    calculate_properties: bool = True
    preset: Optional[str] = None
    method: Optional[str] = None
    basis_set: Optional[str] = None
    solvation: Optional[str] = None
    extra_keywords: Optional[str] = None
    # Advanced parameters
    dispersion: Optional[str] = None
    use_rijcosx: Optional[bool] = None
    scf_convergence: Optional[str] = None
    convergence_strategy: Optional[str] = None
    use_slow_conv: Optional[bool] = None
    integration_grid: Optional[str] = None
    broken_symmetry_atoms: Optional[str] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    properties: Optional[Dict[str, Any]] = None
    input_file_content: Optional[str] = None
    # Frequency scaling factor for IR spectrum calculations (e.g., 0.970 for B3LYP/aug-cc-pVDZ)
    freq_scale_factor: Optional[float] = None


class SubmitFukuiRequest(BaseModel):
    molecule_xyz: str
    molecule_name: Optional[str] = None  # Name of the molecule for display
    method: Optional[str] = "B3LYP"
    basis_set: Optional[str] = "def2-SVP"
    dispersion: Optional[str] = "D3BJ"
    n_procs: Optional[int] = None
    memory_mb: Optional[int] = None


class SubmitConformerRequest(BaseModel):
    smiles: Optional[str] = None
    molecule_xyz: Optional[str] = None
    molecule_name: Optional[str] = None  # Name of the molecule for display
    n_confs: Optional[int] = 50
    rms_thresh: Optional[float] = 0.5
    energy_window: Optional[float] = 5.0
    method: Optional[str] = "r2SCAN-3c"
    n_procs: Optional[int] = None


class SubmitIRRequest(BaseModel):
    molecule_xyz: str
    molecule_name: Optional[str] = None  # Name of the molecule for display
    method: Optional[str] = "B3LYP"
    basis_set: Optional[str] = "def2-SVP"
    charge: int = 0
    multiplicity: int = 1
    n_procs: Optional[int] = None
    memory_mb: Optional[int] = None
    # Frequency scaling factor (e.g., 0.970 for B3LYP/aug-cc-pVDZ as per OPI tutorial)
    freq_scale_factor: Optional[float] = None
    # Optional: Use RIJCOSX approximation for faster calculations
    use_rijcosx: Optional[bool] = False
    # Optional: Dispersion correction (D3, D3BJ, D4)
    dispersion: Optional[str] = "D4"


@router.post("/jobs")
async def submit_qc_job(request: SubmitJobRequest):
    """Submit QC job."""
    job_data = request.dict()
    result, status_code = qc_service.submit_job(job_data)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Job submission failed'))
    return result


@router.post("/jobs/fukui")
async def submit_fukui_job(request: SubmitFukuiRequest):
    """Submit Atomic Fukui Indices calculation."""
    job_data = request.dict()
    result, status_code = qc_service.submit_fukui_job(job_data)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Job submission failed'))
    return result


@router.post("/jobs/conformer")
async def submit_conformer_job(request: SubmitConformerRequest):
    """Submit Conformer Search job."""
    job_data = request.dict()
    result, status_code = qc_service.submit_conformer_job(job_data)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Job submission failed'))
    return result


@router.post("/jobs/ir")
async def submit_ir_job(request: SubmitIRRequest):
    """
    Submit IR Spectrum calculation (Optimization + Frequency).
    
    This endpoint follows the OPI tutorial pattern for calculating IR spectra:
    - First optimizes the geometry to find the energy minimum
    - Then calculates analytical frequencies at the optimized geometry
    - Supports frequency scaling via freq_scale_factor (e.g., 0.970 for B3LYP/aug-cc-pVDZ)
    - Uses RIJCOSX approximation and D4 dispersion correction by default
    
    Note: Geometry optimization before frequency calculation is essential for
    accurate IR spectra. Frequencies at non-optimized geometries will have
    imaginary frequencies and incorrect intensities.
    """
    job_data = request.dict()
    # Use OPT_FREQ to optimize geometry first, then calculate frequencies
    # This is standard practice for IR spectrum calculations
    job_data['job_type'] = 'OPT_FREQ'
    job_data['compute_frequencies'] = True
    # Force property calculation for IR data
    job_data['calculate_properties'] = True
    
    # Default dispersion to D4 if not specified (following tutorial)
    if job_data.get('dispersion') is None:
        job_data['dispersion'] = 'D4'
    
    result, status_code = qc_service.submit_job(job_data)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Job submission failed'))
    return result


@router.post("/preview")
async def preview_qc_job(request: SubmitJobRequest):
    """Preview ORCA input file."""
    job_data = request.dict()
    result, status_code = qc_service.preview_job(job_data)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Preview failed'))
    return result


@router.get("/jobs")
async def list_qc_jobs(limit: int = 50):
    """List QC jobs."""
    result, status_code = qc_service.list_jobs(limit)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to list jobs'))
    return result


@router.get("/jobs/status/{job_id}")
async def get_qc_job_status(job_id: str):
    """Get job status."""
    result, status_code = qc_service.get_job_status(job_id)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to get status'))
    return result


@router.get("/jobs/results/{job_id}")
async def get_qc_job_results(job_id: str):
    """Get job results."""
    result, status_code = qc_service.get_job_results(job_id)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to get results'))
    return result


@router.get("/jobs/files/{job_id}")
async def list_qc_job_files(job_id: str):
    """List all files for a job."""
    result, status_code = qc_service.list_job_files(job_id)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to list files'))
    return result


@router.get("/jobs/files/{job_id}/{filename}")
async def get_qc_job_file(job_id: str, filename: str):
    """Download job file."""
    result, status_code = qc_service.get_job_file(job_id, filename)
    
    if status_code >= 400:
        # Error case - result is a dict with error message
        if isinstance(result, dict):
            raise HTTPException(status_code=status_code, detail=result.get('error', 'File not found'))
        else:
            raise HTTPException(status_code=status_code, detail='File not found')
    
    # Success case - result is (file_path, filename) tuple
    if isinstance(result, tuple):
        file_path, download_filename = result
        return FileResponse(file_path, filename=download_filename)
    
    # Fallback
    return result


@router.delete("/jobs/{job_id}")
async def cancel_qc_job(job_id: str):
    """Cancel job."""
    result, status_code = qc_service.cancel_job(job_id)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to cancel job'))
    return result


@router.post("/jobs/{job_id}/cancel")
async def cancel_qc_job_post(job_id: str):
    """Cancel job (POST alias for compatibility with unified api-client)."""
    return await cancel_qc_job(job_id)


@router.get("/presets")
async def get_qc_presets():
    """Get method presets."""
    result, status_code = qc_service.get_method_presets()
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to get presets'))
    return result


@router.get("/jobs/mo-data/{job_id}")
async def get_qc_mo_data(job_id: str):
    """Get molecular orbital data."""
    result = qc_service.get_mo_data(job_id)
    if isinstance(result, tuple):
        data, status_code = result
        if status_code >= 400:
            raise HTTPException(status_code=status_code, detail=data.get('error', 'Failed to get MO data'))
        return data
    return result


class ModeTrajectoryRequest(BaseModel):
    mode_index: int
    num_frames: int = 60
    amplitude: float = 0.5  # Amplitude in Angstroms


@router.get("/jobs/normal-modes/{job_id}")
async def get_normal_modes(job_id: str):
    """Get normal mode data including frequencies, intensities, and displacement vectors."""
    result, status_code = qc_service.get_normal_modes(job_id)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to get normal modes'))
    return result


@router.post("/jobs/mode-trajectory/{job_id}")
async def get_mode_trajectory(job_id: str, request: ModeTrajectoryRequest):
    """Generate trajectory for a specific normal mode for animation."""
    result, status_code = qc_service.generate_mode_trajectory(
        job_id, 
        request.mode_index, 
        request.num_frames,
        request.amplitude
    )
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to generate trajectory'))
    return result


@router.post("/add-hydrogens")
async def add_hydrogens(request: Dict[str, str]):
    """Add hydrogens to a molecule."""
    molecule_xyz = request.get('molecule_xyz')
    if not molecule_xyz:
        raise HTTPException(status_code=400, detail="Missing molecule_xyz")
        
    result, status_code = qc_service.add_hydrogens(molecule_xyz)
    if status_code >= 400:
        raise HTTPException(status_code=status_code, detail=result.get('error', 'Failed to add hydrogens'))
    return result


@router.get("/system-info")
async def get_system_info():
    """Get system information for QC calculations (CPU cores, memory, etc)."""
    return {
        "max_cpu_cores": QCConfig.MAX_N_PROCS,
        "default_cpu_cores": QCConfig.DEFAULT_N_PROCS,
        "default_memory_mb": QCConfig.DEFAULT_MEMORY_MB,
    }
