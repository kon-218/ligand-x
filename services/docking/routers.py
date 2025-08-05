"""Docking service routers."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import uuid
import logging
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from lib.services.runner import call_service
from lib.structure.validator import validate_structure_for_service, StructureValidationError
from services.docking.service import DockingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/docking", tags=["Docking"])

docking_service = DockingService()

# DEPRECATED: In-memory job storage for batch docking
# Use /api/jobs/* endpoints with Celery/PostgreSQL for new implementations
# This is kept for backward compatibility with existing frontend code
batch_jobs: Dict[str, Dict[str, Any]] = {}


@router.get("/jobs")
async def list_jobs():
    """List all docking jobs."""
    return {"jobs": docking_service.list_jobs()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get docking job details."""
    job = docking_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete docking job."""
    success = docking_service.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete job {job_id}")
    return {"success": True}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel docking job."""
    success = docking_service.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to cancel job {job_id}")
    return {"success": True}


class PrepareDockingRequest(BaseModel):
    protein_pdb: str
    ligand_data: str
    ligand_format: str = "pdb"
    ligand_resname: Optional[str] = None
    grid_padding: float = 5.0
    complex_pdb: Optional[str] = None
    grid_box: Optional[Dict[str, Any]] = None  # Pre-calculated grid box from UI (if provided, skips recalculation)


class RunDockingRequest(BaseModel):
    receptor_pdbqt: str
    ligand_pdbqt: str
    grid_box: Dict[str, Any]
    docking_params: Optional[Dict[str, Any]] = {}
    use_api: bool = True


class DockProteinLigandRequest(BaseModel):
    protein_pdb: str
    ligand_data: str
    ligand_format: str = "pdb"
    ligand_resname: Optional[str] = None
    grid_padding: float = 5.0
    docking_params: Optional[Dict[str, Any]] = {}
    use_api: bool = True
    complex_pdb: Optional[str] = None
    protein_id: Optional[str] = None
    ligand_id: Optional[str] = None


@router.post("/prepare_docking")
async def prepare_docking(request: PrepareDockingRequest):
    """Prepare structures for docking."""
    try:
        # Validate protein structure for docking service
        try:
            validation_result = validate_structure_for_service(
                'docking',
                request.protein_pdb,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Structure validation error (continuing): {e}")
        
        receptor_pdbqt = docking_service.prepare_receptor_pdbqt(request.protein_pdb)
        ligand_pdbqt = docking_service.prepare_ligand_pdbqt(request.ligand_data, request.ligand_format)
        
        # Use pre-calculated grid_box from request if provided, otherwise calculate it
        if request.grid_box:
            grid_box = request.grid_box
            logger.info(f"Using pre-calculated grid box from request")
        else:
            grid_structure = request.complex_pdb or request.protein_pdb
            grid_box = docking_service.calculate_grid_box(
                grid_structure,
                ligand_resname=request.ligand_resname,
                padding=request.grid_padding
            )
        
        return {
            "success": True,
            "receptor_pdbqt": receptor_pdbqt,
            "ligand_pdbqt": ligand_pdbqt,
            "grid_box": grid_box
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run_docking")
async def run_docking(request: RunDockingRequest):
    """Execute docking."""
    try:
        input_data = {
            'receptor_pdbqt': request.receptor_pdbqt,
            'ligand_pdbqt': request.ligand_pdbqt,
            'grid_box': request.grid_box,
            'docking_params': request.docking_params,
            'use_api': request.use_api
        }
        service_result = call_service('docking', input_data, timeout=1800)
        if not service_result.get('success'):
            raise HTTPException(status_code=500, detail=service_result.get('error', 'Docking failed'))
        return service_result.get('result', {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dock_protein_ligand")
async def dock_protein_ligand(request: DockProteinLigandRequest):
    """Complete docking workflow."""
    try:
        # Validate protein structure for docking service
        try:
            validation_result = validate_structure_for_service(
                'docking',
                request.protein_pdb,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Structure validation error (continuing): {e}")
        
        receptor_pdbqt = docking_service.prepare_receptor_pdbqt(request.protein_pdb)
        ligand_pdbqt = docking_service.prepare_ligand_pdbqt(request.ligand_data, request.ligand_format)
        grid_structure = request.complex_pdb or request.protein_pdb
        grid_box = docking_service.calculate_grid_box(
            grid_structure,
            ligand_resname=request.ligand_resname,
            padding=request.grid_padding
        )
        
        input_data = {
            'receptor_pdbqt': receptor_pdbqt,
            'ligand_pdbqt': ligand_pdbqt,
            'grid_box': grid_box,
            'docking_params': request.docking_params,
            'use_api': request.use_api
        }
        
        job_id = str(uuid.uuid4())
        job_data = {
            "job_id": job_id,
            "status": "running",
            "created_at": datetime.datetime.utcnow().isoformat(),
            "metadata": {
                "protein_id": "receptor", # Default or extract from request if possible
                "ligand_id": "ligand", # Default or extract from request if possible
                "grid_box": grid_box
            }
        }
        docking_service.save_job(job_id, job_data)
        
        service_result = call_service('docking', input_data, timeout=1800)
        if not service_result.get('success'):
            error_msg = service_result.get('error', 'Docking failed')
            job_data["status"] = "failed"
            job_data["error"] = error_msg
            docking_service.save_job(job_id, job_data)
            raise HTTPException(status_code=500, detail=error_msg)
        
        results = service_result.get('result', {})
        if results.get('success', False):
            analysis = docking_service.analyze_results(results)
            
            # Update job status
            job_data["status"] = "completed"
            job_data["results"] = {
                "docking": results,
                "analysis": analysis
            }
            docking_service.save_job(job_id, job_data)
            
            return {
                "success": True,
                "job_id": job_id,
                "preparation": {
                    "receptor_pdbqt": receptor_pdbqt,
                    "ligand_pdbqt": ligand_pdbqt,
                    "grid_box": grid_box
                },
                "docking": results,
                "analysis": analysis
            }
        else:
            error_msg = results.get('error', 'Docking failed')
            job_data["status"] = "failed"
            job_data["error"] = error_msg
            docking_service.save_job(job_id, job_data)
            raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream_dock_protein_ligand")
async def stream_dock_protein_ligand(request: DockProteinLigandRequest):
    """Streaming docking workflow with Server-Sent Events (SSE)."""
    async def generate():
        job_id = str(uuid.uuid4())
        job_data = {
            "job_id": job_id,
            "status": "running",
            "created_at": datetime.datetime.utcnow().isoformat(),
            "metadata": {
                "protein_id": request.protein_id or "receptor",
                "ligand_id": request.ligand_id or "ligand",
                "grid_box": None # Will be updated later
            }
        }
        docking_service.save_job(job_id, job_data)
        
        try:
            # Validate protein structure for docking service
            try:
                validation_result = validate_structure_for_service(
                    'docking',
                    request.protein_pdb,
                    format='pdb'
                )
                if not validation_result['valid']:
                    error_msg = '; '.join(validation_result['errors'])
                    job_data["status"] = "failed"
                    job_data["error"] = error_msg
                    docking_service.save_job(job_id, job_data)
                    yield f"data: {json.dumps({'success': False, 'error': error_msg})}\n\n"
                    return
            except StructureValidationError as e:
                job_data["status"] = "failed"
                job_data["error"] = str(e)
                docking_service.save_job(job_id, job_data)
                yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"
                return
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Structure validation error (continuing): {e})")
            
            yield f"data: {json.dumps({'progress': 10, 'status': 'Preparing structures...', 'job_id': job_id})}\n\n"
            
            receptor_pdbqt = docking_service.prepare_receptor_pdbqt(request.protein_pdb)
            ligand_pdbqt = docking_service.prepare_ligand_pdbqt(request.ligand_data, request.ligand_format)
            
            # Store original ligand data for bond preservation in output
            original_ligand_data = request.ligand_data
            original_ligand_format = request.ligand_format
            
            yield f"data: {json.dumps({'progress': 20, 'status': 'Calculating grid box...', 'job_id': job_id})}\n\n"
            
            grid_structure = request.complex_pdb or request.protein_pdb
            grid_box = docking_service.calculate_grid_box(
                grid_structure,
                ligand_resname=request.ligand_resname,
                padding=request.grid_padding
            )
            
            # Update job with grid box
            job_data["metadata"]["grid_box"] = grid_box
            docking_service.save_job(job_id, job_data)
            
            yield f"data: {json.dumps({'progress': 30, 'status': 'Running docking...', 'job_id': job_id})}\n\n"
            
            progress_updates = []
            def send_progress(progress, status):
                progress_updates.append({'progress': progress, 'status': status, 'job_id': job_id})
            
            docking_results = docking_service.dock_with_progress(
                receptor_pdbqt=receptor_pdbqt,
                ligand_pdbqt=ligand_pdbqt,
                grid_box=grid_box,
                docking_params=request.docking_params,
                progress_callback=send_progress
            )
            
            for update in progress_updates:
                yield f"data: {json.dumps(update)}\n\n"
            
            if docking_results.get('success', False):
                analysis = docking_service.analyze_results(docking_results)
                
                # Convert PDBQT poses to SDF and PDB formats using proper chemistry libraries
                poses_pdbqt = docking_results.get('poses_pdbqt', '')
                poses_sdf = ''
                poses_pdb = ''
                
                if poses_pdbqt:
                    # Convert to SDF with bond preservation if template available
                    if original_ligand_format.lower() in ['sdf', 'mol']:
                        # Use original SDF as template for bond preservation
                        poses_sdf = docking_service.convert_pdbqt_poses_to_sdf(poses_pdbqt, original_ligand_data)
                    else:
                        # For PDB input, use OpenBabel conversion (bonds inferred)
                        poses_sdf = docking_service.convert_pdbqt_poses_to_sdf_obabel(poses_pdbqt)
                    
                    # Always convert to PDB using OpenBabel for visualization
                    # This properly handles AutoDock atom types -> element symbols
                    poses_pdb = docking_service.convert_pdbqt_poses_to_pdb(poses_pdbqt)
                    if not poses_pdb:
                        logger.warning("Failed to convert PDBQT to PDB via OpenBabel")
                
                complete_results = {
                    "success": True,
                    "job_id": job_id,
                    "poses_pdbqt": poses_pdbqt,
                    "poses_sdf": poses_sdf,  # SDF format with preserved bond orders
                    "poses_pdb": poses_pdb,  # PDB format converted via OpenBabel
                    "scores": docking_results.get('scores', []),
                    "best_score": docking_results.get('best_score'),
                    "best_affinity": docking_results.get('best_score'),  # Alias for compatibility
                    "binding_strength": analysis.get('binding_strength') if analysis else None,
                    "grid_box": grid_box,
                    "analysis": analysis
                }
                
                # Update job with results
                job_data["status"] = "completed"
                job_data["results"] = {
                    "docking": docking_results,
                    "analysis": analysis,
                    "poses_sdf": poses_sdf,  # Include SDF in stored results
                    "poses_pdb": poses_pdb   # Include PDB in stored results
                }
                docking_service.save_job(job_id, job_data)
                
                yield f"data: {json.dumps(complete_results)}\n\n"
            else:
                error_msg = docking_results.get('error', 'Docking failed')
                job_data["status"] = "failed"
                job_data["error"] = error_msg
                docking_service.save_job(job_id, job_data)
                yield f"data: {json.dumps({'success': False, 'error': error_msg, 'job_id': job_id})}\n\n"
        except Exception as e:
            job_data["status"] = "failed"
            job_data["error"] = str(e)
            docking_service.save_job(job_id, job_data)
            yield f"data: {json.dumps({'success': False, 'error': str(e), 'job_id': job_id})}\n\n"
    
    return StreamingResponse(
        generate(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@router.post("/calculate_grid_box")
async def calculate_grid_box(request: dict):
    """Calculate grid box."""
    try:
        pdb_data = request.get('pdb_data')
        padding = request.get('padding', 5.0)
        ligand_resname = request.get('ligand_resname')
        
        if not pdb_data:
            raise HTTPException(status_code=400, detail="No PDB data provided")
        
        # Validate protein structure for docking service
        try:
            validation_result = validate_structure_for_service(
                'docking',
                pdb_data,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Structure validation error (continuing): {e}")
        
        grid_box = docking_service.calculate_grid_box(
            pdb_data=pdb_data,
            padding=padding,
            ligand_resname=ligand_resname
        )
        
        return {
            'success': True,
            'grid_box': grid_box
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate_whole_protein_grid_box")
async def calculate_whole_protein_grid_box(request: dict):
    """Calculate grid box for entire protein."""
    try:
        pdb_data = request.get('pdb_data')
        
        if not pdb_data:
            raise HTTPException(status_code=400, detail="No PDB data provided")
        
        # Validate protein structure for docking service
        try:
            validation_result = validate_structure_for_service(
                'docking',
                pdb_data,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Structure validation error (continuing): {e}")
        
        grid_box = docking_service.calculate_whole_protein_grid_box(pdb_data=pdb_data)
        
        return {
            'success': True,
            'grid_box': grid_box
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ValidateRedockingRequest(BaseModel):
    """Request model for redocking validation."""
    complex_pdb: str
    ligand_resname: Optional[str] = None
    exhaustiveness: int = 32


@router.post("/validate_redocking")
async def validate_redocking(request: ValidateRedockingRequest):
    """
    Validate the docking pipeline by redocking a co-crystallized ligand.

    Extracts the ligand from the protein-ligand complex, docks it back,
    and computes RMSD between the docked and crystal poses. RMSD < 2.0 A
    indicates successful reproduction of the binding mode.
    """
    try:
        result = docking_service.validate_redocking(
            complex_pdb=request.complex_pdb,
            ligand_resname=request.ligand_resname,
            exhaustiveness=request.exhaustiveness,
        )

        if not result.get('success') and 'error' in result:
            raise HTTPException(status_code=500, detail=result['error'])

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Redocking validation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BatchDockingLigand(BaseModel):
    """Single ligand in a batch docking request."""
    id: str
    name: Optional[str] = None
    data: str
    format: str = "sdf"


class BatchDockingRequest(BaseModel):
    """Request model for batch docking."""
    protein_pdb: str
    ligands: List[BatchDockingLigand]
    grid_box: Optional[Dict[str, Any]] = None
    exhaustiveness: int = 16
    num_poses: int = 9
    parallel_workers: int = 4
    use_meeko: bool = True
    protein_id: Optional[str] = None


class BatchDockProteinLigandsRequest(BaseModel):
    """Request model for batch docking with streaming."""
    protein_pdb: str
    ligands: List[BatchDockingLigand]
    grid_padding: float = 5.0
    docking_params: Optional[Dict[str, Any]] = {}
    use_api: bool = True
    grid_box: Optional[Dict[str, Any]] = None
    protein_id: Optional[str] = None


@router.post("/batch_dock_protein_ligands")
async def batch_dock_protein_ligands(request: BatchDockProteinLigandsRequest):
    """
    Perform batch docking with SSE streaming.
    Yields events for each ligand's docking progress and result.
    Jobs are persisted to disk for later retrieval.
    """
    # Generate a batch ID to group all jobs in this batch
    batch_id = str(uuid.uuid4())
    batch_created_at = datetime.datetime.utcnow().isoformat()
    
    async def generate():
        total_ligands = len(request.ligands)
        # Yield start event with batch_id
        yield f"data: {json.dumps({'type': 'start', 'batch_id': batch_id, 'total': total_ligands, 'message': f'Starting batch docking for {total_ligands} ligands'})}\n\n"
        
        try:
            # Validate protein structure
            try:
                validation_result = validate_structure_for_service(
                    'docking',
                    request.protein_pdb,
                    format='pdb'
                )
                if not validation_result['valid']:
                    error_msg = '; '.join(validation_result['errors'])
                    yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                    return
            except Exception as e:
                logger.warning(f"Structure validation error (continuing): {e}")

            # Prepare receptor (once for all ligands)
            receptor_pdbqt = docking_service.prepare_receptor_pdbqt(request.protein_pdb)
            
            # Determine grid box
            grid_box = request.grid_box
            if not grid_box:
                try:
                    grid_box = docking_service.calculate_grid_box(
                        request.protein_pdb,
                        padding=request.grid_padding
                    )
                except Exception:
                    # Fallback to whole protein box
                    grid_box = docking_service.calculate_whole_protein_grid_box(request.protein_pdb)
            
            if not grid_box:
                 yield f"data: {json.dumps({'type': 'error', 'error': 'Could not determine grid box. Please define a grid box.'})}\n\n"
                 return

            # Process each ligand
            for i, ligand_input in enumerate(request.ligands):
                job_id = str(uuid.uuid4())
                
                # Get ligand name from input or use ID
                ligand_name = getattr(ligand_input, 'name', None) or ligand_input.id
                
                # Create job record immediately
                job_data = {
                    "job_id": job_id,
                    "batch_id": batch_id,
                    "batch_index": i,
                    "batch_total": total_ligands,
                    "status": "running",
                    "progress": 0,
                    "created_at": batch_created_at,
                    "molecule_name": ligand_name,
                    "protein_id": request.protein_id or "receptor",
                    "config": {
                        "ligand_id": ligand_input.id,
                        "ligand_name": ligand_name,
                        "grid_box": grid_box,
                        "docking_params": request.docking_params,
                    }
                }
                docking_service.save_job(job_id, job_data)
                
                # Notify start of this ligand
                yield f"data: {json.dumps({'job_id': job_id, 'batch_id': batch_id, 'progress': 0, 'status': 'running', 'ligand_id': ligand_input.id, 'ligand_name': ligand_name})}\n\n"
                
                try:
                    # Prepare ligand
                    ligand_pdbqt = docking_service.prepare_ligand_pdbqt(
                        ligand_input.data,
                        ligand_input.format
                    )
                    
                    # Update progress
                    job_data["progress"] = 20
                    job_data["status"] = "running"
                    docking_service.save_job(job_id, job_data)
                    yield f"data: {json.dumps({'job_id': job_id, 'batch_id': batch_id, 'progress': 20, 'status': 'running', 'ligand_id': ligand_input.id})}\n\n"
                    
                    # Run docking
                    result = docking_service.dock(
                        receptor_pdbqt=receptor_pdbqt,
                        ligand_pdbqt=ligand_pdbqt,
                        grid_box=grid_box,
                        docking_params=request.docking_params,
                        use_api=request.use_api
                    )
                    
                    if result.get('success'):
                        # Analyze
                        analysis = docking_service.analyze_results(result)
                        
                        # Convert PDBQT poses to SDF and PDB formats using proper chemistry libraries
                        poses_pdbqt = result.get('poses_pdbqt', '')
                        poses_sdf = ''
                        poses_pdb = ''
                        
                        if poses_pdbqt:
                            # Convert to SDF with bond preservation if template available
                            if ligand_input.format.lower() in ['sdf', 'mol']:
                                # Use original SDF as template for bond preservation
                                poses_sdf = docking_service.convert_pdbqt_poses_to_sdf(poses_pdbqt, ligand_input.data)
                            else:
                                # For other formats, use OpenBabel conversion
                                poses_sdf = docking_service.convert_pdbqt_poses_to_sdf_obabel(poses_pdbqt)
                            
                            # Always convert to PDB using OpenBabel for visualization
                            poses_pdb = docking_service.convert_pdbqt_poses_to_pdb(poses_pdbqt)
                        
                        # Update job with results
                        job_data["status"] = "completed"
                        job_data["progress"] = 100
                        job_data["completed_at"] = datetime.datetime.utcnow().isoformat()
                        job_data["results"] = {
                            "docking": result,
                            "analysis": analysis,
                            "poses_sdf": poses_sdf,  # Include SDF in stored results
                            "poses_pdb": poses_pdb   # Include PDB in stored results
                        }
                        docking_service.save_job(job_id, job_data)
                        
                        # Prepare result payload
                        payload = {
                            'job_id': job_id,
                            'batch_id': batch_id,
                            'success': True,
                            'progress': 100,
                            'status': 'completed',
                            'ligand_id': ligand_input.id,
                            'ligand_name': ligand_name,
                            'result': {
                                'docking': result,
                                'analysis': analysis
                            },
                            'best_affinity': result.get('best_score'),
                            'poses': result.get('poses', []),
                            'poses_pdbqt': poses_pdbqt,
                            'poses_sdf': poses_sdf,  # SDF format with preserved bond orders
                            'poses_pdb': poses_pdb   # PDB format converted via OpenBabel
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
                    else:
                        error_msg = result.get('error', 'Docking failed')
                        job_data["status"] = "failed"
                        job_data["progress"] = 100
                        job_data["error"] = error_msg
                        job_data["completed_at"] = datetime.datetime.utcnow().isoformat()
                        docking_service.save_job(job_id, job_data)
                        yield f"data: {json.dumps({'job_id': job_id, 'batch_id': batch_id, 'success': False, 'progress': 100, 'status': 'failed', 'error': error_msg, 'ligand_id': ligand_input.id, 'ligand_name': ligand_name})}\n\n"
                        
                except Exception as e:
                    logger.error(f"Error processing ligand {ligand_input.id}: {e}")
                    job_data["status"] = "failed"
                    job_data["progress"] = 100
                    job_data["error"] = str(e)
                    job_data["completed_at"] = datetime.datetime.utcnow().isoformat()
                    docking_service.save_job(job_id, job_data)
                    yield f"data: {json.dumps({'job_id': job_id, 'batch_id': batch_id, 'success': False, 'progress': 100, 'status': 'failed', 'error': str(e), 'ligand_id': ligand_input.id, 'ligand_name': ligand_name})}\n\n"
            
            # Final event
            yield f"data: {json.dumps({'type': 'complete', 'batch_id': batch_id, 'message': 'Batch docking finished'})}\n\n"
            
        except Exception as e:
            logger.error(f"Batch docking error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'batch_id': batch_id, 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


def dock_single_ligand(
    receptor_pdbqt: str,
    ligand: BatchDockingLigand,
    grid_box: Dict[str, Any],
    docking_params: Dict[str, Any]
) -> Dict[str, Any]:
    """Dock a single ligand and return results."""
    try:
        # Prepare ligand PDBQT
        ligand_pdbqt = docking_service.prepare_ligand_pdbqt(
            ligand.data, 
            ligand.format
        )
        
        # Run docking
        result = docking_service.dock(
            receptor_pdbqt=receptor_pdbqt,
            ligand_pdbqt=ligand_pdbqt,
            grid_box=grid_box,
            docking_params=docking_params,
            use_api=True
        )
        
        return {
            'ligand_id': ligand.id,
            'success': result.get('success', False),
            'best_score': result.get('best_score'),
            'scores': result.get('scores', []),
            'poses_pdbqt': result.get('poses_pdbqt', ''),
            'num_poses': result.get('num_poses', 0),
            'error': result.get('error') if not result.get('success') else None
        }
    except Exception as e:
        logger.error(f"Error docking ligand {ligand.id}: {e}")
        return {
            'ligand_id': ligand.id,
            'success': False,
            'error': str(e)
        }


@router.post("/batch")
async def batch_docking(request: BatchDockingRequest):
    """
    Perform batch docking of multiple ligands against a protein.
    
    This endpoint processes all ligands synchronously and returns results
    immediately. For very large batches, consider using async processing.
    """
    job_id = str(uuid.uuid4())
    logger.info(f"Starting batch docking job {job_id} with {len(request.ligands)} ligands")
    
    job_data = {
        "job_id": job_id,
        "status": "running",
        "created_at": datetime.datetime.utcnow().isoformat(),
        "metadata": {
            "protein_id": request.protein_id or "receptor",
            "num_ligands": len(request.ligands),
            "grid_box": request.grid_box
        }
    }
    docking_service.save_job(job_id, job_data)
    
    try:
        # Validate protein structure
        try:
            validation_result = validate_structure_for_service(
                'docking',
                request.protein_pdb,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.warning(f"Structure validation error (continuing): {e}")
        
        # Prepare receptor once
        receptor_pdbqt = docking_service.prepare_receptor_pdbqt(request.protein_pdb)
        
        # Calculate grid box if not provided
        grid_box = request.grid_box
        if not grid_box:
            grid_box = docking_service.calculate_grid_box(
                request.protein_pdb,
                padding=5.0
            )
        
        # Docking parameters
        docking_params = {
            'exhaustiveness': request.exhaustiveness,
            'num_modes': request.num_poses
        }

        results = []
        completed = 0
        failed = 0

        # Try batch map reuse (computes affinity maps once, reuses for all ligands)
        try:
            from services.docking.service import VINA_PACKAGE_AVAILABLE
            if VINA_PACKAGE_AVAILABLE and len(request.ligands) > 1:
                logger.info(f"Using batch map reuse for {len(request.ligands)} ligands")
                # Prepare all ligand PDBQTs
                ligand_pdbqts = []
                ligand_ids = []
                prep_failed = []
                for ligand in request.ligands:
                    try:
                        pdbqt = docking_service.prepare_ligand_pdbqt(ligand.data, ligand.format)
                        ligand_pdbqts.append(pdbqt)
                        ligand_ids.append(ligand.id)
                    except Exception as e:
                        logger.error(f"Ligand prep failed for {ligand.id}: {e}")
                        prep_failed.append({'ligand_id': ligand.id, 'success': False, 'error': str(e)})

                # Dock all prepared ligands with map reuse
                batch_results = docking_service.dock_batch_with_map_reuse(
                    receptor_pdbqt, ligand_pdbqts, grid_box, docking_params
                )

                # Combine results
                for lid, res in zip(ligand_ids, batch_results):
                    res['ligand_id'] = lid
                    results.append(res)
                    if res.get('success'):
                        completed += 1
                    else:
                        failed += 1

                results.extend(prep_failed)
                failed += len(prep_failed)
            else:
                raise ImportError("Falling back to per-ligand docking")
        except (ImportError, Exception) as e:
            if results:
                pass  # Map reuse partially succeeded, keep results
            else:
                # Fallback: process ligands in parallel with separate Vina instances
                logger.info(f"Using parallel per-ligand docking ({e})")
                with ThreadPoolExecutor(max_workers=request.parallel_workers) as executor:
                    future_to_ligand = {
                        executor.submit(
                            dock_single_ligand,
                            receptor_pdbqt,
                            ligand,
                            grid_box,
                            docking_params
                        ): ligand
                        for ligand in request.ligands
                    }

                    for future in as_completed(future_to_ligand):
                        ligand = future_to_ligand[future]
                        try:
                            result = future.result()
                            results.append(result)
                            if result.get('success'):
                                completed += 1
                            else:
                                failed += 1
                        except Exception as exc:
                            logger.error(f"Exception docking ligand {ligand.id}: {exc}")
                            results.append({
                                'ligand_id': ligand.id,
                                'success': False,
                                'error': str(exc)
                            })
                            failed += 1
        
        # Store job results
        job_data.update({
            'status': 'completed',
            'completed': completed,
            'failed': failed,
            'total': len(request.ligands),
            'results': results,
            'updated_at': datetime.datetime.utcnow().isoformat()
        })
        docking_service.save_job(job_id, job_data)
        
        # Keep in-memory for backward compatibility
        batch_jobs[job_id] = job_data
        
        logger.info(f"Batch docking job {job_id} completed: {completed} succeeded, {failed} failed")
        
        return {
            'status': 'completed',
            'job_id': job_id,
            'completed': completed,
            'failed': failed,
            'total': len(request.ligands),
            'message': f'Batch docking completed: {completed}/{len(request.ligands)} successful'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch docking failed: {e}")
        batch_jobs[job_id] = {
            'status': 'failed',
            'error': str(e),
            'results': []
        }
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch/status/{job_id}")
async def get_batch_status(job_id: str):
    """
    Get the status and results of a batch docking job.
    """
    if job_id not in batch_jobs:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    job = batch_jobs[job_id]
    return {
        'job_id': job_id,
        'status': job.get('status', 'unknown'),
        'completed': job.get('completed', 0),
        'failed': job.get('failed', 0),
        'total': job.get('total', 0),
        'results': job.get('results', []),
        'grid_box': job.get('grid_box'),
        'error': job.get('error')
    }


class BatchDockingAsyncRequest(BaseModel):
    """Request model for async batch docking via Celery."""
    protein_pdb_data: str
    ligands: List[Dict[str, Any]]  # List of {name, smiles?, sdf_data?}
    box_center: Optional[List[float]] = None  # [x, y, z]
    box_size: Optional[List[float]] = None  # [x, y, z]
    exhaustiveness: int = 8


@router.post("/submit_batch_async")
async def submit_batch_async(request: BatchDockingAsyncRequest):
    """
    Submit batch docking as async Celery task.
    
    This endpoint submits the job to the CPU worker queue and returns immediately.
    Use /api/jobs/stream/{job_id} to track progress via SSE.
    
    Returns:
        job_id: Celery task ID
        status: 'submitted'
        stream_url: URL for SSE progress streaming
    """
    try:
        # Validate protein structure
        try:
            validation_result = validate_structure_for_service(
                'docking',
                request.protein_pdb_data,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.warning(f"Structure validation error (continuing): {e}")
        
        # Prepare job data
        job_data = {
            'protein_pdb_data': request.protein_pdb_data,
            'ligands': request.ligands,
            'box_center': request.box_center,
            'box_size': request.box_size,
            'exhaustiveness': request.exhaustiveness,
        }
        
        # Submit to Celery
        try:
            from lib.tasks.cpu_tasks import docking_batch
            task = docking_batch.delay(job_data)
            job_id = task.id
            
            logger.info(f"Submitted async batch docking job {job_id} with {len(request.ligands)} ligands")
            
            return {
                "job_id": job_id,
                "status": "submitted",
                "job_type": "docking_batch",
                "stream_url": f"/api/jobs/stream/{job_id}",
                "message": f"Batch docking submitted to CPU queue ({len(request.ligands)} ligands)"
            }
        except ImportError:
            logger.warning("Celery not available, falling back to synchronous execution")
            raise HTTPException(
                status_code=503,
                detail="Async job submission not available. Use /api/docking/batch instead."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit async batch docking job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

