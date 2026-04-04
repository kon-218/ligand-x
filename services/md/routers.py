"""MD service routers."""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import os
import logging
import traceback
import uuid
import datetime
from lib.services.runner import call_service, call_service_with_progress
from lib.structure.validator import validate_structure_for_service, StructureValidationError
from .service import MDOptimizationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/md", tags=["MD"])


class OptimizeRequest(BaseModel):
    protein_pdb_data: str
    protein_id: Optional[str] = "protein"
    protein_name: Optional[str] = "protein"
    ligand_id: Optional[str] = "ligand"
    ligand_name: Optional[str] = "ligand"
    ligand_smiles: Optional[str] = None
    ligand_structure_data: Optional[str] = None
    ligand_data_format: Optional[str] = None
    preserve_ligand_pose: Optional[bool] = True
    generate_conformer: Optional[bool] = True
    nvt_steps: int = 25000
    npt_steps: int = 175000
    temperature: float = 300.0
    pressure: float = 1.0
    # Thermal heating protocol runs as 6 temperature stages (50K increments) with 1 fs timestep.
    # Total heating duration (ps) = 6 * heating_steps_per_stage * 0.001
    heating_steps_per_stage: int = 2500
    ionic_strength: float = 0.15
    charge_method: str = "am1bcc"
    forcefield_method: str = "openff-2.2.0"
    box_shape: str = "dodecahedron"
    production_steps: int = 0
    production_report_interval: int = 2500
    padding_nm: float = 1.0
    preview_before_equilibration: bool = False
    preview_acknowledged: bool = False
    pause_at_minimized: bool = False
    minimization_only: bool = False
    minimized_acknowledged: bool = False


@router.get("/jobs")
async def list_jobs():
    """List all MD jobs."""
    service = MDOptimizationService()
    return {"jobs": service.list_jobs()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get MD job details."""
    service = MDOptimizationService()
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


class AnalyticsRecomputeRequest(BaseModel):
    output_files: Dict[str, str]
    system_id: Optional[str] = None
    ligand_id: str = "ligand"
    is_protein_only: bool = False
    nvt_steps: int = 0
    npt_steps: int = 0
    production_steps: int = 0


@router.post("/jobs/{job_id}/analytics")
async def recompute_analytics(job_id: str, request: AnalyticsRecomputeRequest):
    """Re-run post-hoc analytics given output_files paths. Called by the gateway."""
    try:
        from .workflow.analytics import EquilibrationAnalytics
        
        # Fetch job to get parameters
        service = MDOptimizationService()
        job = service.get_job(job_id)
        
        # Extract step counts and report intervals from job request
        nvt_steps = 0
        npt_steps = 0
        production_steps = 0
        production_report_interval = 2500
        
        if job and 'request' in job:
            req = job['request']
            nvt_steps = req.get('nvt_steps', 0)
            npt_steps = req.get('npt_steps', 0)
            production_steps = req.get('production_steps', 0)
            production_report_interval = req.get('production_report_interval', 2500)
        
        output_files = request.output_files
        
        # Use production PDB if available, otherwise NPT PDB
        topology_pdb = output_files.get("production_pdb") or output_files.get("npt_pdb")
        
        # Use production log if available, otherwise equilibration log
        log_path = output_files.get("production_log") or output_files.get("equilibration_log")
        
        analytics = EquilibrationAnalytics().compute(
            output_dir="",
            system_id=request.system_id or job_id,
            topology_pdb=topology_pdb,
            nvt_traj=output_files.get("nvt_trajectory"),
            npt_traj=output_files.get("npt_trajectory"),
            production_traj=output_files.get("production_trajectory"),
            log_path=log_path,
            ligand_id=request.ligand_id if not request.is_protein_only else "",
            nvt_steps=nvt_steps,
            npt_steps=npt_steps,
            production_steps=production_steps,
            nvt_report_interval=1000,
            npt_report_interval=1000,
            production_report_interval=production_report_interval,
            dt_ps=0.004,
        )
        return {"success": True, "analytics": analytics}
    except Exception as e:
        logger.error(f"Analytics recompute failed for {job_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analytics computation failed: {str(e)}")


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete MD job."""
    service = MDOptimizationService()
    success = service.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete job {job_id}")
    return {"success": True}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel MD job."""
    service = MDOptimizationService()
    success = service.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to cancel job {job_id}")
    return {"success": True}


@router.post("/optimize")
async def optimize(request: OptimizeRequest):
    """MD optimization."""
    try:
        # Validate protein structure for MD service
        try:
            validation_result = validate_structure_for_service(
                'md',
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
        
        # Job tracking
        job_id = str(uuid.uuid4())
        service = MDOptimizationService(job_id=job_id)
        
        input_data = {
            'job_id': job_id,
            'protein_pdb_data': request.protein_pdb_data,
            'protein_id': request.protein_id,
            'ligand_id': request.ligand_id,
            'system_id': f"{request.protein_id}_{request.ligand_id}_md",
            'charge_method': request.charge_method,
            'forcefield_method': request.forcefield_method,
            'box_shape': request.box_shape,
            'nvt_steps': request.nvt_steps,
            'npt_steps': request.npt_steps,
            'production_steps': request.production_steps,
            'production_report_interval': request.production_report_interval,
            'heating_steps_per_stage': request.heating_steps_per_stage,
            'padding_nm': request.padding_nm,
            'temperature': request.temperature,
            'pressure': request.pressure,
            'ionic_strength': request.ionic_strength,
            'preview_before_equilibration': request.preview_before_equilibration,
            'preview_acknowledged': request.preview_acknowledged,
            'pause_at_minimized': request.pause_at_minimized,
            'minimization_only': request.minimization_only,
            'minimized_acknowledged': request.minimized_acknowledged
        }
        if request.ligand_structure_data:
            input_data.update({
                'ligand_structure_data': request.ligand_structure_data,
                'ligand_data_format': request.ligand_data_format,
                'preserve_ligand_pose': request.preserve_ligand_pose
            })
        else:
            input_data.update({
                'ligand_smiles': request.ligand_smiles,
                'generate_conformer': request.generate_conformer
            })
        
        job_data = {
            "job_id": job_id,
            "status": "running",
            "created_at": datetime.datetime.utcnow().isoformat(),
            "protein_id": request.protein_id,
            "protein_name": request.protein_name,
            "ligand_id": request.ligand_id,
            "ligand_name": request.ligand_name,
            "request": {
                "nvt_steps": request.nvt_steps,
                "npt_steps": request.npt_steps,
                "temperature": request.temperature,
                    "heating_steps_per_stage": request.heating_steps_per_stage,
                "protein_name": request.protein_name,
                "ligand_name": request.ligand_name
            }
        }
        service.save_job(job_id, job_data)
        
        try:
            service_result = call_service('md', input_data, timeout=3600)
            if not service_result.get('success'):
                error_msg = service_result.get('error', 'MD optimization failed')
                if 'traceback' in service_result:
                    error_msg += f"\n\nTraceback:\n{service_result.get('traceback', '')}"
                
                # Update job status
                job_data["status"] = "failed"
                job_data["error"] = error_msg
                service.save_job(job_id, job_data)
                
                logger.error(f"MD optimization failed: {error_msg}")
                raise HTTPException(status_code=500, detail=error_msg)
            
            result = service_result.get('result', {})
            
            # Update job status
            job_data["status"] = "completed"
            job_data["results"] = result
            service.save_job(job_id, job_data)
            
            logger.info(f"MD optimization completed successfully: system_id={input_data['system_id']}")
            return result
            
        except Exception as e:
            # Update job status
            job_data["status"] = "failed"
            job_data["error"] = str(e)
            service.save_job(job_id, job_data)
            raise
            
    except HTTPException:
        # Re-raise HTTPExceptions (already logged)
        raise
    except Exception as e:
        # Include full error details for debugging
        error_detail = f"{str(e)}"
        error_traceback = traceback.format_exc()
        logger.error(f"MD optimization error: {error_detail}\n{error_traceback}")
        raise HTTPException(status_code=500, detail=f"{error_detail}\n\nTraceback:\n{error_traceback}")


@router.get("/status")
async def md_status():
    """Get MD service status."""
    return {"available": True, "service": "MD Optimization Service", "status": "ready"}


@router.get("/environment_status")
async def md_environment_status():
    """Check MD environment status."""
    from lib.services.runner import check_env_exists
    return {"environment_installed": check_env_exists('biochem-md')}


@router.post("/submit_async")
async def submit_async_optimize(request: OptimizeRequest):
    """
    Submit MD optimization as async Celery task.
    
    This endpoint submits the job to the GPU worker queue and returns immediately.
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
                'md',
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
            'protein_id': request.protein_id,
            'ligand_id': request.ligand_id,
            'system_id': f"{request.protein_id}_{request.ligand_id}_md",
            'nvt_steps': request.nvt_steps,
            'npt_steps': request.npt_steps,
            'temperature': request.temperature,
            'pressure': request.pressure,
            'ionic_strength': request.ionic_strength,
            'charge_method': request.charge_method,
            'forcefield_method': request.forcefield_method,
            'box_shape': request.box_shape,
            'production_steps': request.production_steps,
            'production_report_interval': request.production_report_interval,
            'padding_nm': request.padding_nm,
            'preview_before_equilibration': request.preview_before_equilibration,
            'preview_acknowledged': request.preview_acknowledged,
            'pause_at_minimized': request.pause_at_minimized,
            'minimization_only': request.minimization_only,
            'minimized_acknowledged': request.minimized_acknowledged,
        }
        
        # Add ligand data
        if request.ligand_structure_data:
            job_data.update({
                'ligand_structure_data': request.ligand_structure_data,
                'ligand_data_format': request.ligand_data_format,
                'preserve_ligand_pose': request.preserve_ligand_pose
            })
        else:
            job_data.update({
                'ligand_smiles': request.ligand_smiles,
                'generate_conformer': request.generate_conformer
            })
        
        # Submit to Celery
        try:
            from lib.tasks.gpu_tasks import md_optimize
            task = md_optimize.delay(job_data)
            job_id = task.id
            
            logger.info(f"Submitted async MD job {job_id}")
            
            return {
                "job_id": job_id,
                "status": "submitted",
                "job_type": "md",
                "stream_url": f"/api/jobs/stream/{job_id}",
                "message": "MD optimization submitted to GPU queue"
            }
        except ImportError:
            # Celery not available, fall back to sync
            logger.warning("Celery not available, falling back to synchronous execution")
            raise HTTPException(
                status_code=503,
                detail="Async job submission not available. Use /api/md/stream_optimize instead."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        error_traceback = traceback.format_exc()
        logger.error(f"Failed to submit async MD job: {e}\n{error_traceback}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream_optimize")
async def stream_optimize(request: OptimizeRequest):
    """Streaming MD optimization workflow with Server-Sent Events (SSE)."""
    import asyncio
    import queue
    
    # Create job ID and save initial state
    job_id = str(uuid.uuid4())
    service = MDOptimizationService(job_id=job_id)
    job_data = {
        "job_id": job_id,
        "status": "running",
        "created_at": datetime.datetime.utcnow().isoformat(),
        "protein_id": request.protein_id,
        "protein_name": request.protein_name,
        "ligand_id": request.ligand_id,
        "ligand_name": request.ligand_name,
        "request": {
            "nvt_steps": request.nvt_steps,
            "npt_steps": request.npt_steps,
            "temperature": request.temperature,
            "protein_name": request.protein_name,
            "ligand_name": request.ligand_name
        }
    }
    service.save_job(job_id, job_data)
    
    async def generate():
        try:
            # Yield job_id at start so frontend can track it
            yield f"data: {json.dumps({'job_id': job_id, 'progress': 0, 'status': 'Job initialized'})}\n\n"
            
            # Validate protein structure for MD service
            try:
                validation_result = validate_structure_for_service(
                    'md',
                    request.protein_pdb_data,
                    format='pdb'
                )
                if not validation_result['valid']:
                    error_msg = '; '.join(validation_result['errors'])
                    
                    # Update job status
                    job_data["status"] = "failed"
                    job_data["error"] = error_msg
                    service.save_job(job_id, job_data)
                    
                    yield f"data: {json.dumps({'success': False, 'error': error_msg})}\n\n"
                    return
            except StructureValidationError as e:
                # Update job status
                job_data["status"] = "failed"
                job_data["error"] = str(e)
                service.save_job(job_id, job_data)
                
                yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"
                return
            except Exception as e:
                logger.warning(f"Structure validation error (continuing): {e}")
            
            logger.info(f"Streaming MD optimization request: protein_id={request.protein_id}, ligand_id={request.ligand_id}")
            yield f"data: {json.dumps({'progress': 5, 'status': 'Initializing MD optimization...', 'completed_stages': []})}\n\n"
            await asyncio.sleep(0)  # Force flush
            
            # Prepare input data
            input_data = {
                'job_id': job_id,
                'protein_pdb_data': request.protein_pdb_data,
                'protein_id': request.protein_id,
                'ligand_id': request.ligand_id,
                'system_id': f"{request.protein_id}_{request.ligand_id}_md",
                'charge_method': request.charge_method,
                'forcefield_method': request.forcefield_method,
                'box_shape': request.box_shape,
                'nvt_steps': request.nvt_steps,
                'npt_steps': request.npt_steps,
                'production_steps': request.production_steps,
                'production_report_interval': request.production_report_interval,
                'heating_steps_per_stage': request.heating_steps_per_stage,
                'padding_nm': request.padding_nm,
                'temperature': request.temperature,
                'pressure': request.pressure,
                'ionic_strength': request.ionic_strength,
                'preview_before_equilibration': request.preview_before_equilibration,
                'preview_acknowledged': request.preview_acknowledged,
                'pause_at_minimized': request.pause_at_minimized,
                'minimization_only': request.minimization_only,
                'minimized_acknowledged': request.minimized_acknowledged
            }
            
            if request.ligand_structure_data:
                input_data.update({
                    'ligand_structure_data': request.ligand_structure_data,
                    'ligand_data_format': request.ligand_data_format,
                    'preserve_ligand_pose': request.preserve_ligand_pose
                })
                yield f"data: {json.dumps({'progress': 10, 'status': 'Preparing ligand from structure data...', 'completed_stages': []})}\n\n"
                await asyncio.sleep(0)  # Force flush
            else:
                input_data.update({
                    'ligand_smiles': request.ligand_smiles,
                    'generate_conformer': request.generate_conformer
                })
                yield f"data: {json.dumps({'progress': 10, 'status': 'Preparing ligand from SMILES...', 'completed_stages': []})}\n\n"
                await asyncio.sleep(0)  # Force flush
            
            yield f"data: {json.dumps({'progress': 15, 'status': 'Preparing protein structure...', 'completed_stages': []})}\n\n"
            await asyncio.sleep(0)  # Force flush
            
            yield f"data: {json.dumps({'progress': 20, 'status': 'Building solvated system...', 'completed_stages': ['preparation']})}\n\n"
            await asyncio.sleep(0)  # Force flush
            
            # Run service with progress updates
            logger.info(f"Calling MD service with input_data keys: {list(input_data.keys())}")
            logger.info(f"MD parameters: nvt_steps={input_data.get('nvt_steps')}, npt_steps={input_data.get('npt_steps')}, temp={input_data.get('temperature')}, pressure={input_data.get('pressure')}")
            logger.info("Starting MD service execution with progress streaming...")
            
            # Use a queue to communicate between the service thread and async generator
            update_queue = queue.Queue()
            service_done = False
            service_result = None
            service_error = None
            
            def run_service_with_updates():
                nonlocal service_done, service_result, service_error
                try:
                    for update in call_service_with_progress('md', input_data, timeout=3600):
                        update_queue.put(update)
                except Exception as e:
                    import traceback as tb
                    service_error = {"error": str(e), "traceback": tb.format_exc()}
                finally:
                    service_done = True
            
            # Start service in a thread
            import concurrent.futures
            loop = asyncio.get_event_loop()
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            future = executor.submit(run_service_with_updates)
            
            # Poll for updates while service runs
            last_progress = 20
            while not service_done or not update_queue.empty():
                try:
                    # Check for updates with a short timeout
                    update = update_queue.get(timeout=0.1)
                    
                    if update['type'] == 'progress':
                        progress_data = update['data']
                        # Only yield if progress increased
                        if progress_data.get('progress', 0) > last_progress:
                            last_progress = progress_data['progress']
                            # Update job status with progress
                            job_data['progress'] = last_progress
                            job_data['status'] = 'running'
                            service.save_job(job_id, job_data)
                            
                            yield f"data: {json.dumps(progress_data)}\n\n"
                            await asyncio.sleep(0)  # Force flush
                    
                    elif update['type'] == 'result':
                        service_result = update['data']
                    
                    elif update['type'] == 'error':
                        service_error = update['data']
                
                except queue.Empty:
                    # No update available, yield control to event loop
                    await asyncio.sleep(0.1)
            
            # Wait for thread to complete
            future.result(timeout=5)
            executor.shutdown(wait=False)
            
            # Handle errors
            if service_error:
                error_msg = service_error.get('error', 'MD optimization failed')
                error_response = {'success': False, 'error': error_msg}
                if 'traceback' in service_error:
                    error_response['traceback'] = service_error['traceback']
                logger.error(f"Streaming MD optimization failed: {error_msg}")
                
                # Update job status
                job_data["status"] = "failed"
                job_data["error"] = error_msg
                service.save_job(job_id, job_data)
                
                yield f"data: {json.dumps(error_response)}\n\n"
                return
            
            if not service_result:
                error_msg = 'No result from service'
                
                # Update job status
                job_data["status"] = "failed"
                job_data["error"] = error_msg
                service.save_job(job_id, job_data)
                
                yield f"data: {json.dumps({'success': False, 'error': error_msg})}\n\n"
                return
            
            if not service_result.get('success'):
                error_msg = service_result.get('error', 'MD optimization failed')
                error_response = {'success': False, 'error': error_msg}
                if 'traceback' in service_result:
                    error_response['traceback'] = service_result.get('traceback', '')
                logger.error(f"Streaming MD optimization failed: {error_msg}")
                
                # Update job status
                job_data["status"] = "failed"
                job_data["error"] = error_msg
                service.save_job(job_id, job_data)
                
                yield f"data: {json.dumps(error_response)}\n\n"
                return
            
            logger.info(f"MD service execution completed. Success: {service_result.get('success', False)}")
            
            result = service_result.get('result', {})
            workflow_status = result.get('status')
            minimization_only = result.get('minimization_only', request.minimization_only)
            
            if workflow_status == 'preview_ready':
                result['success'] = True
                result['progress'] = 25
                result['completed_stages'] = ['preparation']
                result.setdefault('message', 'System prepared for preview. Re-run with preview_acknowledged=true to continue.')
                
                # Update job status (paused)
                job_data["status"] = "paused"
                job_data["results"] = result
                service.save_job(job_id, job_data)
                
                logger.info(f"Streaming MD optimization paused for preview: system_id={result.get('system_id', 'unknown')}")
            elif workflow_status == 'minimized_ready':
                result['success'] = True
                result['progress'] = 40
                result['completed_stages'] = ['preparation', 'minimization']
                result.setdefault('message', 'Minimization completed. Paused for inspection.')
                
                # Update job status (paused)
                job_data["status"] = "paused"
                job_data["results"] = result
                service.save_job(job_id, job_data)
                
                logger.info(f"Streaming MD optimization paused after minimization: system_id={result.get('system_id', 'unknown')}")
            elif minimization_only and workflow_status == 'success':
                # Minimization only mode completed
                result['success'] = True
                result['progress'] = 100
                result['completed_stages'] = ['preparation', 'minimization']
                result['workflow_message'] = 'Minimization completed'
                
                # Update job status
                job_data["status"] = "completed"
                job_data["results"] = result
                service.save_job(job_id, job_data)
                
                logger.info(f"Streaming MD minimization completed successfully: system_id={result.get('system_id', 'unknown')}")
            else:
                result['success'] = workflow_status == 'success'
                result['progress'] = 100
                stages = ['preparation', 'minimization', 'nvt', 'npt']
                if request.production_steps > 0:
                    stages.append('production')
                result['completed_stages'] = stages
                result['workflow_message'] = 'MD optimization completed'
                
                # Update job status
                job_data["status"] = "completed"
                job_data["results"] = result
                service.save_job(job_id, job_data)
                
                logger.info(f"Streaming MD optimization completed successfully: system_id={result.get('system_id', 'unknown')}")
            
            yield f"data: {json.dumps(result)}\n\n"
        except Exception as e:
            error_traceback = traceback.format_exc()
            logger.error(f"Streaming MD optimization exception: {str(e)}\n{error_traceback}")
            
            # Update job status
            job_data["status"] = "failed"
            job_data["error"] = str(e)
            service.save_job(job_id, job_data)
            
            yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


class TrajectoryRequest(BaseModel):
    trajectory_path: str
    frame_indices: Optional[list[int]] = None


@router.get("/trajectory/info")
async def get_trajectory_info(trajectory_path: str):
    """Get trajectory metadata (number of frames, duration, etc.)."""
    try:
        logger.info(f"Getting trajectory info for: {trajectory_path}")
        if not os.path.exists(trajectory_path):
            error_msg = f"Trajectory file not found: {trajectory_path}"
            logger.error(error_msg)
            raise HTTPException(status_code=404, detail=error_msg)
        
        # Import here to avoid circular dependencies
        from openmm.app import DCDReporter
        import mdtraj as md
        
        # Use MDTraj to read DCD file and get info
        try:
            traj = md.load_dcd(trajectory_path, top=None)  # We'll use the topology from PDB
            
            # Get topology PDB path (assuming naming convention)
            traj_dir = os.path.dirname(trajectory_path)
            traj_basename = os.path.basename(trajectory_path)
            system_id = traj_basename.replace('_nvt_equilibration.dcd', '').replace('_npt_equilibration.dcd', '')
            
            # Look for corresponding PDB topology
            topology_path = os.path.join(traj_dir, f"{system_id}_npt_final.pdb")
            if not os.path.exists(topology_path):
                topology_path = os.path.join(traj_dir, f"{system_id}_system.pdb")
            
            if os.path.exists(topology_path):
                top = md.load_topology(topology_path)
                traj.topology = top
            
            num_frames = traj.n_frames
            # Estimate timestep (typical MD: 2-4 fs, reported every 1000 steps = ~2-4 ps per frame)
            timestep = 0.002  # ps per step (assuming 2 fs timestep)
            frame_interval = 1000  # steps per frame (typical)
            duration = num_frames * timestep * frame_interval  # ps
            
            return {
                "num_frames": num_frames,
                "duration": duration,  # in ps
                "timestep": timestep,  # in ps
                "temperature": 300.0,  # default, could be extracted from metadata
                "pressure": 1.0,  # default, could be extracted from metadata
            }
        except ImportError:
            # Fallback: try to read DCD file size and estimate frames
            file_size = os.path.getsize(trajectory_path)
            # DCD header is ~84 bytes, each frame is roughly 3 * num_atoms * 4 bytes (float32)
            # We'll need topology to get exact num_atoms, but we can estimate
            estimated_atoms = 1000  # rough estimate
            bytes_per_frame = 84 + (3 * estimated_atoms * 4)  # header + coordinates
            estimated_frames = max(1, int((file_size - 84) / (3 * estimated_atoms * 4)))
            
            logger.warning(f"MDTraj not available, using estimated frame count for: {trajectory_path}")
            return {
                "num_frames": estimated_frames,
                "duration": estimated_frames * 2.0,  # estimated ps
                "timestep": 0.002,
                "temperature": 300.0,
                "pressure": 1.0,
            }
            
    except HTTPException:
        # Re-raise HTTPExceptions (already logged)
        raise
    except Exception as e:
        error_msg = f"Error reading trajectory info: {str(e)}"
        error_traceback = traceback.format_exc()
        logger.error(f"{error_msg}\n{error_traceback}")
        raise HTTPException(status_code=500, detail=f"{error_msg}\n{error_traceback}")


@router.post("/trajectory/frames")
async def get_trajectory_frames(request: TrajectoryRequest):
    """Convert DCD trajectory frames to multi-model PDB format for visualization."""
    try:
        logger.info(f"Processing trajectory conversion request: {request.trajectory_path}")
        if not os.path.exists(request.trajectory_path):
            error_msg = f"Trajectory file not found: {request.trajectory_path}"
            logger.error(error_msg)
            raise HTTPException(status_code=404, detail=error_msg)
        
        # Try using MDTraj first (preferred for reading DCD files)
        try:
            import mdtraj as md
            logger.info("Using MDTraj to read DCD trajectory")
            use_mdtraj = True
        except ImportError:
            logger.warning("MDTraj not available, falling back to OpenMM DCDFile")
            use_mdtraj = False
        
        # Get topology PDB path
        traj_dir = os.path.dirname(request.trajectory_path)
        traj_basename = os.path.basename(request.trajectory_path)
        system_id = traj_basename.replace('_nvt_equilibration.dcd', '').replace('_npt_equilibration.dcd', '')
        
        topology_path = os.path.join(traj_dir, f"{system_id}_npt_final.pdb")
        if not os.path.exists(topology_path):
            topology_path = os.path.join(traj_dir, f"{system_id}_system.pdb")
        if not os.path.exists(topology_path):
            error_msg = f"Topology file not found for trajectory. Looked for: {system_id}_npt_final.pdb and {system_id}_system.pdb in {traj_dir}"
            logger.error(error_msg)
            raise HTTPException(status_code=404, detail=error_msg)
        
        if use_mdtraj:
            # Use MDTraj for reading (much easier and more reliable)
            logger.info(f"Loading trajectory with MDTraj: {request.trajectory_path}")
            traj = md.load_dcd(request.trajectory_path, top=topology_path)
            frame_count = traj.n_frames
            logger.info(f"Loaded {frame_count} frames from trajectory")
            
            # Determine which frames to extract
            if request.frame_indices:
                frame_indices = sorted([idx for idx in request.frame_indices if 0 <= idx < frame_count])
            else:
                # Default: sample frames (max 100 frames)
                max_frames = 100
                step = max(1, frame_count // max_frames) if frame_count > max_frames else 1
                frame_indices = list(range(0, frame_count, step))
            
            if not frame_indices:
                frame_indices = [0]  # At least one frame
                
            # Create a sub-trajectory with only the requested frames for efficient processing
            sub_traj = traj[frame_indices]
            logger.info(f"Processing sub-trajectory with {sub_traj.n_frames} frames")
            
            # Apply robust PBC handling and alignment
            try:
                # Check for unit cell info first
                if sub_traj.unitcell_lengths is None:
                    logger.warning("No unit cell information found in trajectory. Skipping PBC imaging.")
                else:
                    # 1. Identify anchors (protein or largest molecule)
                    anchor_molecules = []
                    
                    # Try protein selection first
                    protein_sel = sub_traj.topology.select('protein')
                    molecules = sub_traj.topology.find_molecules()
                    
                    if len(protein_sel) > 10: # Threshold to ensure valid protein selection
                        protein_atom_set = set(protein_sel)
                        # Fix: check atom.index against protein_atom_set (which contains indices)
                        # Convert sets of Atoms to sorted lists of Atoms for image_molecules
                        anchor_molecules = [sorted(list(mol), key=lambda a: a.index) for mol in molecules if any(atom.index in protein_atom_set for atom in mol)]
                        if anchor_molecules:
                            logger.info(f"Anchoring PBC imaging to {len(anchor_molecules)} protein molecules")
                    
                    # Fallback to largest molecule if no protein found
                    if not anchor_molecules and len(molecules) > 0:
                        # Find largest molecule by atom count
                        largest_mol = max(molecules, key=len)
                        anchor_molecules = [sorted(list(largest_mol), key=lambda a: a.index)]
                        logger.info(f"Fallback: Anchoring PBC imaging to largest molecule ({len(largest_mol)} atoms)")
                    
                    # Apply imaging
                    if anchor_molecules:
                        # image_molecules accepts list of iterable of Atoms
                        sub_traj.image_molecules(inplace=True, anchor_molecules=anchor_molecules)
                    else:
                        # Last resort fallback
                        logger.info("No suitable anchor molecules found, using default imaging")
                        sub_traj.image_molecules(inplace=True)
                        
                    # 2. Superpose (Align)
                    # Try to align on protein CA, then protein, then largest molecule, then backbone/alpha carbons of largest
                    align_indices = []
                    
                    if len(protein_sel) > 0:
                        protein_ca = sub_traj.topology.select('protein and name CA')
                        if len(protein_ca) > 0:
                            align_indices = protein_ca
                            logger.info("Aligning trajectory on protein alpha carbons")
                        else:
                            align_indices = protein_sel
                            logger.info("Aligning trajectory on protein atoms")
                    elif anchor_molecules:
                        # Flatten anchor molecules to get atom indices
                        anchor_atoms = [atom.index for mol in anchor_molecules for atom in mol]
                        # Try to find backbone-like atoms in the anchor
                        # This is a bit manual, but safer than aligning on all atoms if there are floppy tails
                        align_indices = anchor_atoms
                        logger.info(f"Aligning trajectory on anchor molecule ({len(anchor_atoms)} atoms)")
                    
                    if len(align_indices) > 0:
                        sub_traj.superpose(sub_traj, 0, atom_indices=align_indices)
                    else:
                        sub_traj.superpose(sub_traj, 0)
                        
                    logger.info("PBC imaging and alignment applied successfully")
            except Exception as e:
                logger.warning(f"Failed to apply PBC correction/alignment: {e}")
                # Continue with raw coordinates if processing fails
            
            # Extract CRYST1 record from topology PDB for periodic boundary visualization
            cryst1_record = None
            try:
                with open(topology_path, 'r') as f:
                    for line in f:
                        if line.startswith('CRYST1'):
                            cryst1_record = line.rstrip('\n')
                            logger.info(f"Found CRYST1 record: {cryst1_record}")
                            break
            except Exception as e:
                logger.warning(f"Could not read CRYST1 from topology: {e}")
            
            # If no CRYST1 in topology, try to get unit cell from trajectory
            if not cryst1_record and hasattr(traj, 'unitcell_lengths') and traj.unitcell_lengths is not None:
                try:
                    # Get unit cell from first frame (assuming cubic box)
                    unitcell = traj.unitcell_lengths[0]  # in nm
                    # Convert nm to Angstrom and format as CRYST1 record
                    # CRYST1 format: a b c alpha beta gamma space_group z
                    a, b, c = unitcell[0] * 10, unitcell[1] * 10, unitcell[2] * 10  # nm to Angstrom
                    alpha, beta, gamma = 90.0, 90.0, 90.0  # Assume orthogonal box
                    cryst1_record = f"CRYST1{a:9.3f}{b:9.3f}{c:9.3f}{alpha:7.2f}{beta:7.2f}{gamma:7.2f} P 1           1 \n"
                    logger.info(f"Generated CRYST1 record from trajectory unit cell: {cryst1_record.strip()}")
                except Exception as e:
                    logger.warning(f"Could not generate CRYST1 from trajectory unit cell: {e}")
            
            # Convert processed sub-trajectory to multi-model PDB
            pdb_content = []
            
            # Add CRYST1 record at the beginning if available (before first MODEL)
            if cryst1_record:
                pdb_content.append(cryst1_record)
                if not cryst1_record.endswith('\n'):
                    pdb_content.append('\n')
            
            model_index = 0
            # Iterate through the processed sub-trajectory
            for i, frame in enumerate(sub_traj):
                try:
                    # Write MODEL header
                    pdb_content.append(f"MODEL        {model_index+1:8d}\n")
                    model_index += 1
                    
                    # Save frame to temporary PDB and read it
                    # Note: We use frame.save_pdb to get PDB formatting, then strip headers/footers
                    import tempfile
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.pdb', delete=False) as tmp:
                        frame.save_pdb(tmp.name)
                        with open(tmp.name, 'r') as f:
                            frame_pdb = f.read()
                        os.unlink(tmp.name)
                    
                    # Remove END from frame PDB and add MODEL/ENDMDL
                    # Also skip CRYST1/REMARK/etc if we handle them globally
                    frame_lines = [line for line in frame_pdb.split('\n') 
                                  if not line.strip().startswith('END') 
                                  and not line.strip().startswith('CRYST1')
                                  and not line.strip().startswith('REMARK')]
                                  
                    # Ensure each line ends with newline
                    for line in frame_lines:
                        if line and not line.endswith('\n'):
                            pdb_content.append(line + '\n')
                        elif line:
                            pdb_content.append(line)
                    pdb_content.append("ENDMDL\n")
                    
                except Exception as frame_error:
                    logger.warning(f"Failed to read frame {i} from processed trajectory: {str(frame_error)}")
                    continue
            
            if model_index == 0:
                error_msg = f"No frames could be successfully read from trajectory file: {request.trajectory_path}"
                logger.error(error_msg)
                raise HTTPException(status_code=500, detail=error_msg)
            
            # Add END marker at the end of the multi-model PDB file
            pdb_content.append("END\n")
            
            logger.info(f"Successfully converted {model_index} frames from trajectory using MDTraj")
            pdb_data = ''.join(pdb_content)
            
            # Log a sample of the PDB data to verify format
            logger.debug(f"PDB data sample (first 1000 chars): {pdb_data[:1000]}")
            logger.debug(f"PDB data contains MODEL markers: {'MODEL' in pdb_data}")
            logger.debug(f"PDB data contains ENDMDL markers: {'ENDMDL' in pdb_data}")
            
            return {"pdb_data": pdb_data, "num_frames": model_index}
        
        # Fallback to OpenMM DCDFile (more complex)
        from openmm.app import DCDFile, PDBFile
        from openmm import unit
        
        # Extract CRYST1 record from topology PDB for periodic boundary visualization
        cryst1_record = None
        try:
            with open(topology_path, 'r') as f:
                for line in f:
                    if line.startswith('CRYST1'):
                        cryst1_record = line.rstrip('\n')
                        logger.info(f"Found CRYST1 record: {cryst1_record}")
                        break
        except Exception as e:
            logger.warning(f"Could not read CRYST1 from topology: {e}")
        
        # Load topology from PDB
        topology_pdb = PDBFile(topology_path)
        topology = topology_pdb.getTopology()
        
        # Open DCD file - dt is required even for reading in OpenMM
        # Use a default timestep of 0.002 ps (2 fs)
        dt = 0.002 * unit.picoseconds
        
        # Check file size first - if file exists and has content, it should be readable
        file_size = os.path.getsize(request.trajectory_path)
        if file_size < 100:
            error_msg = f"DCD file appears to be empty or corrupted: {request.trajectory_path} (size: {file_size} bytes)"
            logger.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
        
        dcd_stream = open(request.trajectory_path, 'rb')
        try:
            # For reading existing files, dt is still required but file should already have header
            # We need to seek past any potential header write attempt
            dcd_file = DCDFile(dcd_stream, topology, dt)
            
            # Try to get frame count from file metadata
            try:
                frame_count = dcd_file.numFrames
            except AttributeError:
                # Count frames manually by reading through the file
                frame_count = 0
                try:
                    for frame_idx in range(100000):  # reasonable upper limit
                        dcd_file.readStep(frame_idx)
                        frame_count = frame_idx + 1
                except Exception as e:
                    logger.debug("DCD frame reading completed or failed: %s", e)
        finally:
            dcd_stream.close()
        
        if frame_count == 0:
            error_msg = f"No frames found in trajectory file: {request.trajectory_path}"
            logger.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
        
        logger.info(f"Found {frame_count} frames in trajectory file")
        
        # Determine which frames to extract
        if request.frame_indices:
            frame_indices = sorted([idx for idx in request.frame_indices if 0 <= idx < frame_count])
        else:
            # Default: sample frames (max 100 frames)
            max_frames = 100
            step = max(1, frame_count // max_frames) if frame_count > max_frames else 1
            frame_indices = list(range(0, frame_count, step))
        
        if not frame_indices:
            frame_indices = [0]  # At least one frame
        
        # Convert to multi-model PDB
        pdb_content = []
        
        # Add CRYST1 record at the beginning if available (before first MODEL)
        if cryst1_record:
            pdb_content.append(cryst1_record)
            if not cryst1_record.endswith('\n'):
                pdb_content.append('\n')
        
        # Re-open DCD file to read specific frames
        dcd_stream = open(request.trajectory_path, 'rb')
        try:
            # dt is required even for reading
            dcd_file = DCDFile(dcd_stream, topology, dt)
            
            model_index = 0
            for frame_idx in frame_indices:
                try:
                    # Read specific frame
                    positions = dcd_file.readStep(frame_idx)
                    
                    # Write MODEL header
                    pdb_content.append(f"MODEL        {model_index+1:8d}\n")
                    model_index += 1
                    
                    # Write positions as PDB format
                    atoms = list(topology.atoms())
                    for atom_idx, atom in enumerate(atoms):
                        if atom_idx >= len(positions):
                            break
                        pos = positions[atom_idx]
                        
                        # Handle different position formats (Vec3, tuple, array)
                        try:
                            # Try to access as Vec3 with value_in_unit
                            x = pos[0].value_in_unit(unit.angstrom)
                            y = pos[1].value_in_unit(unit.angstrom)
                            z = pos[2].value_in_unit(unit.angstrom)
                        except (AttributeError, TypeError):
                            # Fallback: assume it's in nm and convert to Angstrom
                            try:
                                # Try to get raw values
                                if hasattr(pos[0], '_value'):
                                    # It's a Quantity but without direct value_in_unit
                                    x_val = pos[0]._value
                                    y_val = pos[1]._value
                                    z_val = pos[2]._value
                                    # Assume nm, convert to Angstrom
                                    x = x_val * 10.0
                                    y = y_val * 10.0
                                    z = z_val * 10.0
                                else:
                                    # Direct numeric values (assume nm)
                                    x = float(pos[0]) * 10.0
                                    y = float(pos[1]) * 10.0
                                    z = float(pos[2]) * 10.0
                            except (AttributeError, TypeError, ValueError) as e:
                                # Last resort: direct conversion
                                logger.debug("Position conversion fallback: %s", e)
                                x = float(pos[0]) * 10.0
                                y = float(pos[1]) * 10.0
                                z = float(pos[2]) * 10.0
                        
                        # Get atom info
                        element = atom.element.symbol
                        residue = atom.residue
                        res_name = residue.name[:3] if len(residue.name) >= 3 else residue.name
                        chain_id = residue.chain.id if residue.chain.id else 'A'
                        res_seq = residue.id
                        
                        # Format PDB ATOM/HETATM line
                        record = "ATOM  " if res_name in ['ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 
                                                           'HIS', 'ILE', 'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 
                                                           'THR', 'TRP', 'TYR', 'VAL', 'A', 'C', 'G', 'U', 'T', 
                                                           'DA', 'DC', 'DG', 'DT', 'DU'] else "HETATM"
                        
                        line = f"{record:<6}{atom_idx+1:5d} {element:<2}{res_name:>3} {chain_id:1s}{res_seq:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {element:>2}\n"
                        pdb_content.append(line)
                    
                    # Write ENDMDL
                    pdb_content.append("ENDMDL\n")
                except Exception as frame_error:
                    # Skip frames that can't be read, but log the error
                    logger.warning(f"Failed to read frame {frame_idx} from trajectory: {str(frame_error)}")
                    continue
        finally:
            dcd_stream.close()
        
        if model_index == 0:
            error_msg = f"No frames could be successfully read from trajectory file: {request.trajectory_path}"
            logger.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Add END marker at the end of the multi-model PDB file
        pdb_content.append("END\n")
        
        logger.info(f"Successfully converted {model_index} frames from trajectory")
        pdb_data = ''.join(pdb_content)
        
        # Log a sample of the PDB data to verify format
        logger.debug(f"PDB data sample (first 1000 chars): {pdb_data[:1000]}")
        logger.debug(f"PDB data contains MODEL markers: {'MODEL' in pdb_data}")
        logger.debug(f"PDB data contains ENDMDL markers: {'ENDMDL' in pdb_data}")
        
        return {"pdb_data": pdb_data, "num_frames": model_index}
        
    except HTTPException:
        # Re-raise HTTPExceptions (already logged)
        raise
    except Exception as e:
        error_detail = f"Error converting trajectory: {str(e)}"
        error_traceback = traceback.format_exc()
        logger.error(f"{error_detail}\n{error_traceback}")
        raise HTTPException(status_code=500, detail=f"{error_detail}\n{error_traceback}")


class TrajectoryAnalysisRequest(BaseModel):
    trajectory_path: str


def _resolve_topology(trajectory_path: str) -> str:
    """Resolve topology PDB path from a trajectory DCD path."""
    traj_dir = os.path.dirname(trajectory_path)
    traj_basename = os.path.basename(trajectory_path)
    system_id = traj_basename.replace('_nvt_equilibration.dcd', '').replace('_npt_equilibration.dcd', '')
    topology_path = os.path.join(traj_dir, f"{system_id}_npt_final.pdb")
    if not os.path.exists(topology_path):
        topology_path = os.path.join(traj_dir, f"{system_id}_system.pdb")
    return topology_path


@router.post("/trajectory/analysis")
async def analyze_trajectory(request: TrajectoryAnalysisRequest):
    """Compute RMSD, RMSF, and radius of gyration for a trajectory."""
    try:
        if not os.path.exists(request.trajectory_path):
            raise HTTPException(status_code=404, detail=f"Trajectory file not found: {request.trajectory_path}")

        import mdtraj as md
        import numpy as np

        topology_path = _resolve_topology(request.trajectory_path)
        if not os.path.exists(topology_path):
            raise HTTPException(status_code=404, detail="Topology file not found for trajectory.")

        traj = md.load_dcd(request.trajectory_path, top=topology_path)
        traj.remove_solvent(inplace=True)
        traj.superpose(traj, 0)

        rmsd = (md.rmsd(traj, traj, 0) * 10).tolist()
        ca_idx = traj.topology.select('name CA')
        rmsf = (md.rmsf(traj, traj, 0, atom_indices=ca_idx) * 10).tolist() if len(ca_idx) > 0 else []
        rg = (md.compute_rg(traj) * 10).tolist()
        time_ns = (np.arange(len(rmsd)) * traj.timestep / 1000).tolist()
        residue_labels = [str(traj.topology.atom(i).residue) for i in ca_idx]

        return {
            "time_ns": time_ns,
            "rmsd_angstrom": rmsd,
            "rmsf_angstrom": rmsf,
            "rg_angstrom": rg,
            "residue_labels": residue_labels,
            "n_frames": traj.n_frames,
            "n_residues": len(ca_idx),
        }
    except HTTPException:
        raise
    except Exception as e:
        error_traceback = traceback.format_exc()
        logger.error(f"Trajectory analysis failed: {str(e)}\n{error_traceback}")
        raise HTTPException(status_code=500, detail=f"Trajectory analysis failed: {str(e)}")


@router.get("/trajectory/pdb")
async def get_trajectory_as_pdb(trajectory_path: str, max_frames: int = 100, background_tasks: BackgroundTasks = BackgroundTasks()):
    """Get trajectory as multi-model PDB file for direct download/viewing."""
    tmp_path = None
    try:
        logger.info(f"Generating PDB file from trajectory: {trajectory_path}, max_frames={max_frames}")
        if not os.path.exists(trajectory_path):
            error_msg = f"Trajectory file not found: {trajectory_path}"
            logger.error(error_msg)
            raise HTTPException(status_code=404, detail=error_msg)
        
        import mdtraj as md
        
        # Get topology PDB path
        traj_dir = os.path.dirname(trajectory_path)
        traj_basename = os.path.basename(trajectory_path)
        system_id = traj_basename.replace('_nvt_equilibration.dcd', '').replace('_npt_equilibration.dcd', '')
        
        topology_path = os.path.join(traj_dir, f"{system_id}_npt_final.pdb")
        if not os.path.exists(topology_path):
            topology_path = os.path.join(traj_dir, f"{system_id}_system.pdb")
        if not os.path.exists(topology_path):
            error_msg = f"Topology file not found for trajectory. Looked for: {system_id}_npt_final.pdb and {system_id}_system.pdb in {traj_dir}"
            logger.error(error_msg)
            raise HTTPException(status_code=404, detail=error_msg)
        
        # Load trajectory first
        traj = md.load_dcd(trajectory_path, top=topology_path)
        logger.info(f"Loaded trajectory with {traj.n_frames} frames")
        
        # Extract CRYST1 record from topology PDB for periodic boundary visualization
        cryst1_record = None
        try:
            with open(topology_path, 'r') as f:
                for line in f:
                    if line.startswith('CRYST1'):
                        cryst1_record = line.rstrip('\n')
                        logger.info(f"Found CRYST1 record: {cryst1_record}")
                        break
        except Exception as e:
            logger.warning(f"Could not read CRYST1 from topology: {e}")
        
        # If no CRYST1 in topology, try to get unit cell from trajectory
        if not cryst1_record and hasattr(traj, 'unitcell_lengths') and traj.unitcell_lengths is not None:
            try:
                # Get unit cell from first frame (assuming cubic box)
                unitcell = traj.unitcell_lengths[0]  # in nm
                # Convert nm to Angstrom and format as CRYST1 record
                a, b, c = unitcell[0] * 10, unitcell[1] * 10, unitcell[2] * 10  # nm to Angstrom
                alpha, beta, gamma = 90.0, 90.0, 90.0  # Assume orthogonal box
                cryst1_record = f"CRYST1{a:9.3f}{b:9.3f}{c:9.3f}{alpha:7.2f}{beta:7.2f}{gamma:7.2f} P 1           1 \n"
                logger.info(f"Generated CRYST1 record from trajectory unit cell: {cryst1_record.strip()}")
            except Exception as e:
                logger.warning(f"Could not generate CRYST1 from trajectory unit cell: {e}")
        
        # Sample frames
        step = max(1, traj.n_frames // max_frames) if traj.n_frames > max_frames else 1
        frame_indices = list(range(0, traj.n_frames, step))
        
        # Create a sub-trajectory with only the requested frames for efficient processing
        sub_traj = traj[frame_indices]
        logger.info(f"Processing sub-trajectory with {sub_traj.n_frames} frames")
        
        # Apply robust PBC handling and alignment
        try:
            # Check for unit cell info first
            if sub_traj.unitcell_lengths is None:
                logger.warning("No unit cell information found in trajectory. Skipping PBC imaging.")
            else:
                # 1. Identify anchors (protein or largest molecule)
                anchor_molecules = []
                
                # Try protein selection first
                protein_sel = sub_traj.topology.select('protein')
                molecules = sub_traj.topology.find_molecules()
                
                if len(protein_sel) > 10: # Threshold to ensure valid protein selection
                    protein_atom_set = set(protein_sel)
                    # Fix: check atom.index against protein_atom_set (which contains indices)
                    # Convert sets of Atoms to sorted lists of Atoms for image_molecules
                    anchor_molecules = [sorted(list(mol), key=lambda a: a.index) for mol in molecules if any(atom.index in protein_atom_set for atom in mol)]
                    if anchor_molecules:
                        logger.info(f"Anchoring PBC imaging to {len(anchor_molecules)} protein molecules")
                
                # Fallback to largest molecule if no protein found
                if not anchor_molecules and len(molecules) > 0:
                    # Find largest molecule by atom count
                    largest_mol = max(molecules, key=len)
                    anchor_molecules = [sorted(list(largest_mol), key=lambda a: a.index)]
                    logger.info(f"Fallback: Anchoring PBC imaging to largest molecule ({len(largest_mol)} atoms)")
                
                # Apply imaging
                if anchor_molecules:
                    # image_molecules accepts list of iterable of Atoms
                    sub_traj.image_molecules(inplace=True, anchor_molecules=anchor_molecules)
                else:
                    # Last resort fallback
                    logger.info("No suitable anchor molecules found, using default imaging")
                    sub_traj.image_molecules(inplace=True)
                    
                # 2. Superpose (Align)
                # Try to align on protein CA, then protein, then largest molecule, then backbone/alpha carbons of largest
                align_indices = []
                
                if len(protein_sel) > 0:
                    protein_ca = sub_traj.topology.select('protein and name CA')
                    if len(protein_ca) > 0:
                        align_indices = protein_ca
                        logger.info("Aligning trajectory on protein alpha carbons")
                    else:
                        align_indices = protein_sel
                        logger.info("Aligning trajectory on protein atoms")
                elif anchor_molecules:
                    # Flatten anchor molecules to get atom indices
                    anchor_atoms = [atom.index for mol in anchor_molecules for atom in mol]
                    # Try to find backbone-like atoms in the anchor
                    # This is a bit manual, but safer than aligning on all atoms if there are floppy tails
                    align_indices = anchor_atoms
                    logger.info(f"Aligning trajectory on anchor molecule ({len(anchor_atoms)} atoms)")
                
                if len(align_indices) > 0:
                    sub_traj.superpose(sub_traj, 0, atom_indices=align_indices)
                else:
                    sub_traj.superpose(sub_traj, 0)
                    
                logger.info("PBC imaging and alignment applied successfully")
        except Exception as e:
            logger.warning(f"Failed to apply PBC correction/alignment: {e}")
        
        # Convert to multi-model PDB
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pdb', delete=False) as tmp:
            tmp_path = tmp.name
            # Write CRYST1 record at the beginning if available
            if cryst1_record:
                tmp.write(cryst1_record)
                if not cryst1_record.endswith('\n'):
                    tmp.write('\n')
            
            # Iterate through processed sub-trajectory
            for i, frame in enumerate(sub_traj):
                tmp.write(f"MODEL        {i+1:8d}\n")
                # Save frame and read it
                with tempfile.NamedTemporaryFile(mode='w', suffix='.pdb', delete=False) as frame_tmp:
                    frame.save_pdb(frame_tmp.name)
                    with open(frame_tmp.name, 'r') as f:
                        frame_pdb = f.read()
                    os.unlink(frame_tmp.name)
                # Write frame without END and without CRYST1 (already written at top)
                for line in frame_pdb.split('\n'):
                    if not line.strip().startswith('END') and not line.strip().startswith('CRYST1'):
                        tmp.write(line + '\n')
                tmp.write("ENDMDL\n")
            tmp.write("END\n")
        
        # Schedule cleanup of temp file after response
        def cleanup():
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError as e:
                    logger.debug("Temp file cleanup failed: %s", e)
        
        background_tasks.add_task(cleanup)
        
        return FileResponse(
            tmp_path,
            media_type="chemical/x-pdb",
            filename=f"{system_id}_trajectory.pdb",
            background=background_tasks
        )
        
    except ImportError as e:
        error_msg = "MDTraj library is required. Install with: pip install mdtraj"
        logger.error(f"{error_msg}: {str(e)}")
        raise HTTPException(status_code=500, detail=error_msg)
    except HTTPException:
        # Re-raise HTTPExceptions (already logged)
        raise
    except Exception as e:
        # Cleanup on error
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError as cleanup_err:
                logger.debug("Temp file cleanup on error failed: %s", cleanup_err)
        error_msg = f"Error converting trajectory: {str(e)}"
        error_traceback = traceback.format_exc()
        logger.error(f"{error_msg}\n{error_traceback}")
        raise HTTPException(status_code=500, detail=f"{error_msg}\n{error_traceback}")


@router.get("/download_file")
async def download_file(filepath: str):
    """Download MD output file by path.
    
    This endpoint serves files from the MD service's data/md_outputs/ directory.
    Security: Only files within data/md_outputs/ can be accessed.
    """
    if not filepath:
        raise HTTPException(status_code=400, detail="File path is required")
    
    # Get project root (parent of services directory)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    
    # Resolve relative paths - check if path is relative and resolve it
    if not os.path.isabs(filepath):
        resolved_path = os.path.join(project_root, filepath)
    else:
        resolved_path = filepath
    
    # Normalize the path (resolve .. and .)
    resolved_path = os.path.normpath(resolved_path)
    
    # Security check: ensure the resolved path is within data/md_outputs/
    md_outputs_dir = os.path.join(project_root, 'data', 'md_outputs')
    resolved_abs = os.path.abspath(resolved_path)
    md_outputs_abs = os.path.abspath(md_outputs_dir)
    
    try:
        common_path = os.path.commonpath([md_outputs_abs, resolved_abs])
        if common_path != md_outputs_abs:
            logger.warning(f"Access denied: attempted to access file outside md_outputs: {filepath}")
            raise HTTPException(status_code=403, detail="Access denied: path outside MD outputs directory")
    except ValueError:
        # Paths on different drives (Windows) - deny access
        logger.warning(f"Access denied: invalid path: {filepath}")
        raise HTTPException(status_code=403, detail="Access denied: invalid path")
    
    if not os.path.exists(resolved_path):
        logger.error(f"File not found: {resolved_path} (requested: {filepath})")
        raise HTTPException(status_code=404, detail=f"File not found: {filepath}")
    
    logger.info(f"Serving MD output file: {resolved_path}")
    return FileResponse(resolved_path, filename=os.path.basename(resolved_path))

