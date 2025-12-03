"""Boltz2 service routers."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal, List
import json
import logging
from lib.services.runner import call_service
from lib.structure.validator import validate_structure_for_service, StructureValidationError
import numpy as np

# Use existing logging configuration from main.py
# Don't call basicConfig here to avoid overriding file handler setup
logger = logging.getLogger(__name__)

import uuid
import datetime
from .service import Boltz2Service

router = APIRouter(prefix="/api/boltz2", tags=["Boltz2"])

# Memory requirements per residue (approximate)
GPU_MEMORY_PER_RESIDUE_MB = 50  # Rough estimate
MAX_RESIDUES_16GB_GPU = 300  # Conservative limit for 16GB GPU


class Boltz2PredictRequest(BaseModel):
    protein_pdb_data: str
    ligand_data: str
    prediction_params: Optional[Dict[str, Any]] = {}
    num_poses: int = 5
    alignment_options: Optional[Dict[str, Any]] = {}
    accelerator: Literal['gpu', 'cpu'] = Field(default='gpu', description="Use 'gpu' for faster predictions or 'cpu' for larger proteins")
    # MSA options
    msa_sequence_hash: Optional[str] = Field(default=None, description="Hash of pre-computed MSA to use")
    generate_msa: bool = Field(default=False, description="Generate MSA before prediction if not cached")
    msa_method: Optional[str] = Field(default=None, description="MSA generation method (ncbi_blast, mmseqs2_server, mmseqs2_local)")
    protein_id: Optional[str] = None
    ligand_id: Optional[str] = None


class Boltz2ValidateRequest(BaseModel):
    protein_pdb_data: str
    ligand_data: str


@router.get("/jobs")
async def list_jobs():
    """List all Boltz2 jobs."""
    service = Boltz2Service()
    return {"jobs": service.list_jobs()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get Boltz2 job details."""
    service = Boltz2Service()
    job = service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


@router.get("/jobs/{job_id}/poses/{pose_index}/pae")
async def get_pose_pae(job_id: str, pose_index: int):
    """
    Get PAE (Predicted Aligned Error) matrix for a specific pose.
    Returns the 2D matrix as a JSON array of arrays.
    
    This endpoint tries to get job data from:
    1. Local Boltz2 service JSON files (for backward compatibility)
    2. PostgreSQL via gateway (for jobs submitted through gateway)
    """
    try:
        service = Boltz2Service()
        
        # Try to get job from local Boltz2 service first
        job = service.get_job(job_id)
        
        # If not found locally, try to get from gateway's PostgreSQL
        if not job:
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.get(f"http://gateway:8000/api/jobs/{job_id}")
                    if response.status_code == 200:
                        gateway_job = response.json()
                        # Convert gateway job format to expected format
                        job = {
                            'job_id': gateway_job.get('id'),
                            'result': gateway_job.get('result'),
                            'status': gateway_job.get('status')
                        }
                    else:
                        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
            except Exception as e:
                logger.warning(f"Failed to fetch job from gateway: {e}")
                raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        # Check if job has results
        results = job.get('result') or job.get('results')
        if not results or 'poses' not in results:
            raise HTTPException(status_code=404, detail="Job has no poses")
            
        poses = results['poses']
        if pose_index < 0 or pose_index >= len(poses):
            raise HTTPException(status_code=404, detail=f"Pose index {pose_index} out of range")
            
        pose = poses[pose_index]
        pae_path = pose.get('pae_path')
        
        if not pae_path:
            raise HTTPException(status_code=404, detail="PAE file path not found for this pose")
            
        # Load NPZ file
        try:
            data = np.load(pae_path)
            
            # Try to find the PAE key
            # Standard keys often used: 'predicted_aligned_error', 'pae', 'max_predicted_aligned_error'
            pae_matrix = None
            for key in ['predicted_aligned_error', 'pae']:
                if key in data:
                    pae_matrix = data[key]
                    break
            
            if pae_matrix is None:
                # If keys not found, log available keys
                keys = list(data.keys())
                logger.warning(f"PAE keys not found in {pae_path}. Available keys: {keys}")
                raise HTTPException(status_code=500, detail=f"PAE data not found in file. Keys: {keys}")
                
            # Convert to list for JSON serialization
            # PAE matrix is typically (N, N)
            return {"pae": pae_matrix.tolist()}
            
        except Exception as e:
            logger.error(f"Failed to load PAE file {pae_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to load PAE data: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_pose_pae: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete Boltz2 job."""
    service = Boltz2Service()
    success = service.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to delete job {job_id}")
    return {"success": True}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel Boltz2 job."""
    service = Boltz2Service()
    success = service.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to cancel job {job_id}")
    return {"success": True}


@router.get("/status")
async def boltz2_status():
    """Get Boltz2 service status."""
    # Check GPU availability at runtime
    gpu_available = False
    gpu_name = None
    cuda_version = None
    try:
        import torch
        gpu_available = torch.cuda.is_available()
        if gpu_available:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3  # GB
            cuda_version = torch.version.cuda
            logger.info(f"GPU detected: {gpu_name} ({gpu_memory:.1f} GB, CUDA {cuda_version})")
    except Exception as e:
        logger.warning(f"Could not check GPU availability: {e}")
    
    return {
        'available': True,
        'service': 'Boltz-2 Binding Affinity Prediction',
        'gpu_available': gpu_available,
        'gpu_name': gpu_name,
        'cuda_version': cuda_version
    }


def _estimate_residue_count(pdb_data: str) -> int:
    """Estimate the number of residues from PDB data."""
    residue_count = 0
    seen_residues = set()
    for line in pdb_data.split('\n'):
        if line.startswith('ATOM') or line.startswith('HETATM'):
            # Extract chain, residue number, and residue name
            try:
                chain = line[21]
                res_num = line[22:26].strip()
                res_name = line[17:20].strip()
                residue_key = f"{chain}_{res_num}_{res_name}"
                if residue_key not in seen_residues:
                    seen_residues.add(residue_key)
                    # Only count standard amino acids
                    if res_name in ['ALA', 'CYS', 'ASP', 'GLU', 'PHE', 'GLY', 'HIS', 'ILE', 
                                   'LYS', 'LEU', 'MET', 'ASN', 'PRO', 'GLN', 'ARG', 'SER',
                                   'THR', 'VAL', 'TRP', 'TYR', 'MSE', 'SEC']:
                        residue_count += 1
            except (IndexError, ValueError):
                continue
    return residue_count


class Boltz2BatchLigand(BaseModel):
    """Single ligand configuration for batch prediction."""
    id: str
    name: str
    data: str  # SMILES, SDF, or PDB data
    format: Literal['smiles', 'sdf', 'pdb'] = 'smiles'


class Boltz2BatchRequest(BaseModel):
    """Request model for batch Boltz2 compound screening."""
    protein_pdb_data: str
    ligands: List[Boltz2BatchLigand]
    prediction_params: Optional[Dict[str, Any]] = {}
    accelerator: Literal['gpu', 'cpu'] = Field(default='gpu', description="Use 'gpu' for faster predictions or 'cpu' for larger proteins")
    # MSA options - generate once and reuse for all ligands
    generate_msa: bool = Field(default=True, description="Generate MSA once for the protein (recommended)")
    msa_method: Optional[str] = Field(default=None, description="MSA generation method (ncbi_blast, mmseqs2_server, mmseqs2_local)")
    msa_sequence_hash: Optional[str] = Field(default=None, description="Hash of pre-computed MSA to use")
    protein_id: Optional[str] = None
    alignment_options: Optional[Dict[str, Any]] = {}


@router.post("/batch_predict")
async def batch_boltz2_predict(request: Boltz2BatchRequest):
    """
    Run batch Boltz2 predictions for compound screening.
    
    This endpoint processes multiple ligands against a single protein target.
    Key optimization: MSA is generated once and reused for all ligands,
    following Boltz-2 best practices for virtual screening.
    
    Returns a batch_id and individual job_ids for tracking progress.
    """
    batch_id = str(uuid.uuid4())
    created_at = datetime.datetime.utcnow().isoformat()
    
    service = Boltz2Service()
    warnings = []
    
    try:
        logger.info(f"Starting batch Boltz2 prediction (Batch ID: {batch_id}) with {len(request.ligands)} ligands")
        
        # Validate protein structure once for all ligands
        try:
            validation_result = validate_structure_for_service(
                'boltz2',
                request.protein_pdb_data,
                format='pdb'
            )
            if not validation_result['valid']:
                error_msg = '; '.join(validation_result['errors'])
                raise HTTPException(status_code=400, detail=error_msg)
        except StructureValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Estimate protein size
        residue_count = _estimate_residue_count(request.protein_pdb_data)
        logger.info(f"Protein size: {residue_count} residues")
        
        if request.accelerator == 'gpu' and residue_count > MAX_RESIDUES_16GB_GPU:
            warnings.append(
                f"Warning: Large protein detected ({residue_count} residues). "
                f"GPU may run out of memory. Consider using CPU mode."
            )
        
        # Generate MSA once for the protein (key optimization for batch screening)
        msa_path = None
        msa_sequence_hash = request.msa_sequence_hash
        
        if msa_sequence_hash or request.generate_msa:
            try:
                from services.msa.service import MSAService
                msa_service = MSAService()
                
                if msa_sequence_hash:
                    # Use pre-computed MSA
                    msa_path = msa_service.get_msa_path(msa_sequence_hash)
                    if msa_path:
                        msa_path = str(msa_path)
                        logger.info(f"Using pre-computed MSA: {msa_path}")
                    else:
                        logger.warning(f"MSA not found for hash: {msa_sequence_hash}")
                
                # Generate MSA if not found and requested
                if request.generate_msa and not msa_path:
                    # Extract sequence from first ligand validation (just to get protein sequence)
                    first_ligand = request.ligands[0] if request.ligands else None
                    if first_ligand:
                        ligand_data = first_ligand.data
                        validation = service.validate_input_structures(
                            request.protein_pdb_data, ligand_data
                        )
                        if validation['valid'] and validation['protein_info'].get('sequence'):
                            sequence = validation['protein_info']['sequence']
                            normalized_sequence = service._normalize_sequence(sequence)
                            logger.info(f"Generating MSA for protein sequence ({len(normalized_sequence)} residues)...")
                            
                            msa_result = msa_service.generate_msa(
                                normalized_sequence,
                                sequence_id="protein_A",
                                method=request.msa_method
                            )
                            if msa_result.get('success'):
                                msa_path = msa_result.get('msa_path')
                                msa_sequence_hash = msa_result.get('sequence_hash')
                                logger.info(f"MSA generated successfully: {msa_path}")
                            else:
                                warnings.append(f"MSA generation failed: {msa_result.get('error')}. Jobs will use MSA server during prediction.")
            except ImportError:
                logger.warning("MSA service not available")
            except Exception as e:
                logger.warning(f"MSA handling failed: {e}")
                warnings.append(f"MSA generation failed: {e}. Jobs will use MSA server during prediction.")
        
        # Create individual jobs for each ligand
        job_ids = []
        
        for idx, ligand in enumerate(request.ligands):
            job_id = str(uuid.uuid4())
            job_ids.append(job_id)
            
            # Save initial job state
            job_data = {
                "job_id": job_id,
                "batch_id": batch_id,
                "batch_index": idx,
                "batch_total": len(request.ligands),
                "status": "pending",
                "created_at": created_at,
                "ligand_id": ligand.id,
                "ligand_name": ligand.name,
                "protein_id": request.protein_id,
                "request": {
                    "accelerator": request.accelerator,
                    "has_protein_data": True,
                    "ligand_format": ligand.format,
                    "msa_path": msa_path,
                }
            }
            service.save_job(job_id, job_data)
            logger.info(f"Created job {job_id} for ligand {ligand.name} ({idx + 1}/{len(request.ligands)})")
        
        # Process jobs sequentially (Boltz-2 is GPU-bound, parallel would OOM)
        results = []
        
        for idx, (ligand, job_id) in enumerate(zip(request.ligands, job_ids)):
            try:
                # Update job status to running
                service.save_job(job_id, {"status": "running", "updated_at": datetime.datetime.utcnow().isoformat()})
                logger.info(f"Processing ligand {ligand.name} ({idx + 1}/{len(request.ligands)})")
                
                # Convert ligand data to appropriate format
                ligand_data = ligand.data
                if ligand.format == 'smiles':
                    # SMILES can be passed directly to Boltz2
                    pass
                
                # Call the prediction service
                input_data = {
                    'protein_data': request.protein_pdb_data,
                    'ligand_data': ligand_data,
                    'prediction_params': {
                        **(request.prediction_params or {}),
                        'accelerator': request.accelerator
                    },
                    'num_poses': 1,  # Single pose per ligand for screening
                    'msa_path': msa_path,  # Reuse MSA for all ligands
                    'alignment_options': request.alignment_options
                }
                
                service_result = call_service(
                    'boltz2', 
                    input_data, 
                    timeout=3600 if request.accelerator == 'cpu' else 1800
                )
                
                if service_result.get('success'):
                    result = service_result.get('result', {})
                    
                    # Check if the prediction itself was successful
                    if not result.get('success', False):
                        error_msg = result.get('error', 'Prediction failed')
                        results.append({
                            "success": False,
                            "ligand_id": ligand.id,
                            "ligand_name": ligand.name,
                            "error": error_msg
                        })
                        service.save_job(job_id, {
                            "status": "failed",
                            "updated_at": datetime.datetime.utcnow().isoformat(),
                            "error": error_msg
                        })
                        logger.error(f"Failed ligand {ligand.name}: {error_msg}")
                        continue
                    
                    # Extract key metrics
                    job_result = {
                        "success": True,
                        "ligand_id": ligand.id,
                        "ligand_name": ligand.name,
                        "affinity_pred_value": result.get('affinity_pred_value'),
                        "binding_free_energy": result.get('binding_free_energy'),
                        "affinity_probability_binary": result.get('affinity_probability_binary'),
                        "prediction_confidence": result.get('prediction_confidence'),
                        "processing_time": result.get('processing_time'),
                        "poses": result.get('poses', []),
                    }
                    
                    # Extract additional metrics from first pose if available
                    poses = result.get('poses', [])
                    if poses:
                        first_pose = poses[0]
                        job_result.update({
                            "aggregate_score": first_pose.get('aggregate_score'),
                            "confidence_score": first_pose.get('confidence_score'),
                            "ptm": first_pose.get('ptm'),
                            "iptm": first_pose.get('iptm'),
                            "complex_plddt": first_pose.get('complex_plddt'),
                        })
                    
                    results.append(job_result)
                    
                    # Update job with results
                    service.save_job(job_id, {
                        "status": "completed",
                        "updated_at": datetime.datetime.utcnow().isoformat(),
                        "results": job_result
                    })
                    
                    logger.info(f"Completed ligand {ligand.name}: affinity={job_result.get('affinity_pred_value')}")
                else:
                    error_msg = service_result.get('error', 'Prediction failed')
                    results.append({
                        "success": False,
                        "ligand_id": ligand.id,
                        "ligand_name": ligand.name,
                        "error": error_msg
                    })
                    service.save_job(job_id, {
                        "status": "failed",
                        "updated_at": datetime.datetime.utcnow().isoformat(),
                        "error": error_msg
                    })
                    logger.error(f"Failed ligand {ligand.name}: {error_msg}")
                    
            except Exception as e:
                logger.error(f"Error processing ligand {ligand.name}: {e}")
                results.append({
                    "success": False,
                    "ligand_id": ligand.id,
                    "ligand_name": ligand.name,
                    "error": str(e)
                })
                service.save_job(job_id, {
                    "status": "failed",
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                    "error": str(e)
                })
        
        # Count successful and failed
        successful = sum(1 for r in results if r.get('success'))
        failed = len(results) - successful
        
        logger.info(f"Batch {batch_id} completed: {successful} successful, {failed} failed")
        
        return {
            "success": True,
            "batch_id": batch_id,
            "job_ids": job_ids,
            "total_ligands": len(request.ligands),
            "completed": successful,
            "failed": failed,
            "msa_sequence_hash": msa_sequence_hash,
            "warnings": warnings,
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {str(e)}")


@router.get("/batch/{batch_id}")
async def get_batch_status(batch_id: str):
    """Get status of a batch prediction job."""
    service = Boltz2Service()
    all_jobs = service.list_jobs()
    
    # Filter jobs belonging to this batch
    batch_jobs = [j for j in all_jobs if j.get('batch_id') == batch_id]
    
    if not batch_jobs:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    
    # Sort by batch_index
    batch_jobs.sort(key=lambda x: x.get('batch_index', 0))
    
    # Calculate summary
    total = len(batch_jobs)
    completed = sum(1 for j in batch_jobs if j.get('status') == 'completed')
    failed = sum(1 for j in batch_jobs if j.get('status') == 'failed')
    running = sum(1 for j in batch_jobs if j.get('status') == 'running')
    pending = sum(1 for j in batch_jobs if j.get('status') == 'pending')
    
    return {
        "batch_id": batch_id,
        "total": total,
        "completed": completed,
        "failed": failed,
        "running": running,
        "pending": pending,
        "progress": (completed + failed) / total * 100 if total > 0 else 0,
        "jobs": batch_jobs
    }


@router.post("/predict")
async def boltz2_predict(request: Boltz2PredictRequest):
    """Run Boltz2 prediction."""
    warnings = []
    
    # Initialize service and job
    service = Boltz2Service()
    job_id = str(uuid.uuid4())
    
    # Save initial job state
    job_data = {
        "job_id": job_id,
        "status": "running",
        "created_at": datetime.datetime.utcnow().isoformat(),
        "request": {
            "num_poses": request.num_poses,
            "accelerator": request.accelerator,
            # Don't store large structure data in request log
            "has_protein_data": bool(request.protein_pdb_data),
            "has_ligand_data": bool(request.ligand_data)
        },
        "metadata": {
            "protein_id": request.protein_id,
            "ligand_id": request.ligand_id
        }
    }
    service.save_job(job_id, job_data)
    
    try:
        logger.info(f"Starting Boltz2 prediction request (Job ID: {job_id})")
        logger.debug(f"Request params: num_poses={request.num_poses}, accelerator={request.accelerator}")
        
        # Validate protein structure for Boltz2 service
        try:
            validation_result = validate_structure_for_service(
                'boltz2',
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
        
        # Estimate protein size and check for potential memory issues
        residue_count = _estimate_residue_count(request.protein_pdb_data)
        logger.info(f"Estimated protein size: {residue_count} residues")
        
        if request.accelerator == 'gpu' and residue_count > MAX_RESIDUES_16GB_GPU:
            warnings.append(
                f"Warning: Large protein detected ({residue_count} residues). "
                f"GPU may run out of memory. Consider using CPU mode for proteins >300 residues."
            )
            logger.warning(f"Large protein ({residue_count} residues) with GPU mode - may OOM")
        
        if request.accelerator == 'cpu':
            warnings.append(
                "Note: CPU mode selected. Prediction will be slower but can handle larger proteins."
            )
            logger.info("CPU mode selected for prediction")
        
        # Handle MSA path resolution
        msa_path = None
        msa_sequence_hash = request.msa_sequence_hash
        
        if msa_sequence_hash or request.generate_msa:
            try:
                from services.msa.service import MSAService
                msa_service = MSAService()
                
                if msa_sequence_hash:
                    # Resolve hash to path
                    msa_path = msa_service.get_msa_path(msa_sequence_hash)
                    if msa_path:
                        msa_path = str(msa_path)
                        logger.info(f"Using pre-computed MSA: {msa_path}")
                    else:
                        logger.warning(f"MSA not found for hash: {msa_sequence_hash}")
                
                # If generate_msa is true and no MSA path found, generate one
                if request.generate_msa and not msa_path:
                    # Extract sequence from protein for MSA generation
                    # This sequence will be validated to match what's used in YAML config
                    # Reuse existing service instance
                    validation = service.validate_input_structures(
                        request.protein_pdb_data, request.ligand_data
                    )
                    if validation['valid'] and validation['protein_info'].get('sequence'):
                        sequence = validation['protein_info']['sequence']
                        # Normalize sequence for consistent use
                        normalized_sequence = service._normalize_sequence(sequence)
                        logger.info(
                            f"Extracted protein sequence for MSA generation: "
                            f"{len(normalized_sequence)} residues "
                            f"(first 50: {normalized_sequence[:50]}...)"
                        )
                        msa_method = request.msa_method or None  # Use requested method or default
                        logger.info(f"Generating MSA for sequence (length={len(normalized_sequence)}) using method: {msa_method or 'default'}...")
                        msa_result = msa_service.generate_msa(
                            normalized_sequence,  # Use normalized sequence
                            sequence_id="protein_A",
                            method=msa_method  # Pass the method to MSA service
                        )
                        if msa_result.get('success'):
                            msa_path = msa_result.get('msa_path')
                            msa_sequence_hash = msa_result.get('sequence_hash')
                            logger.info(f"MSA generated successfully: {msa_path} ({msa_result.get('num_sequences', 'unknown')} sequences)")
                        else:
                            logger.warning(f"MSA generation failed: {msa_result.get('error')}")
                            warnings.append(f"MSA generation failed: {msa_result.get('error')}. Using MSA server during prediction.")
                    else:
                        logger.warning("Could not extract sequence for MSA generation")
                        warnings.append("Could not extract protein sequence. Using MSA server during prediction.")
            except ImportError:
                logger.warning("MSA service not available, skipping MSA")
            except Exception as e:
                logger.warning(f"MSA handling failed: {e}")
                warnings.append(f"MSA handling failed: {e}. Using MSA server during prediction.")
        
        input_data = {
            'protein_data': request.protein_pdb_data,
            'ligand_data': request.ligand_data,
            'prediction_params': {
                **(request.prediction_params or {}),
                'accelerator': request.accelerator  # Pass accelerator to service
            },
            'num_poses': request.num_poses,
            'msa_path': msa_path,  # Pass MSA path to service
            'alignment_options': request.alignment_options
        }
        
        logger.info(f"Calling Boltz2 service with accelerator={request.accelerator}, msa_path={msa_path is not None}...")
        service_result = call_service('boltz2', input_data, timeout=3600 if request.accelerator == 'cpu' else 1800)
        
        if not service_result.get('success'):
            error_msg = service_result.get('error', 'Boltz-2 prediction failed')
            logger.error(f"Boltz2 service returned error: {error_msg}")
            if 'traceback' in service_result:
                logger.error(f"Service traceback: {service_result.get('traceback')}")
            
            # Update job status
            job_data["status"] = "failed"
            job_data["error"] = error_msg
            job_data["warnings"] = warnings
            service.save_job(job_id, job_data)
            
            # Return detailed error with warnings
            return JSONResponse(
                status_code=500,
                content={
                    'success': False,
                    'job_id': job_id,
                    'error': error_msg,
                    'warnings': warnings,
                    'details': {
                        'residue_count': residue_count,
                        'accelerator': request.accelerator,
                        'suggestion': 'Try using CPU mode for large proteins' if request.accelerator == 'gpu' else None
                    }
                }
            )
        
        results = service_result.get('result', {})
        if not results.get('success', False):
            error_msg = results.get('error', 'Prediction failed')
            logger.error(f"Prediction failed: {error_msg}")
            
            # Update job status
            job_data["status"] = "failed"
            job_data["error"] = error_msg
            job_data["warnings"] = warnings
            service.save_job(job_id, job_data)
            
            return JSONResponse(
                status_code=500,
                content={
                    'success': False,
                    'job_id': job_id,
                    'error': error_msg,
                    'warnings': warnings,
                    'details': {
                        'residue_count': residue_count,
                        'accelerator': request.accelerator,
                        'suggestion': 'Try using CPU mode for large proteins' if 'memory' in error_msg.lower() else None
                    }
                }
            )
        
        logger.info(f"Boltz2 prediction completed successfully (Job ID: {job_id})")
        
        # Build response with MSA info if available
        response_results = {
            'affinity_pred_value': results.get('affinity_pred_value'),
            'affinity_probability_binary': results.get('affinity_probability_binary'),
            'structure_data': results.get('structure_data'),
            'prediction_confidence': results.get('prediction_confidence'),
            'processing_time': results.get('processing_time'),
            'poses': results.get('poses', []),
            'num_poses_generated': len(results.get('poses', []))
        }
        
        # Add MSA info for frontend download
        if msa_sequence_hash:
            response_results['msa_sequence_hash'] = msa_sequence_hash
        if msa_path:
            response_results['msa_used'] = True
            
        # Update job status
        job_data["status"] = "completed"
        job_data["results"] = response_results
        job_data["warnings"] = warnings
        service.save_job(job_id, job_data)
        
        return {
            'success': True,
            'job_id': job_id,
            'warnings': warnings,
            'results': response_results
        }
    except HTTPException as e:
        # Update job status to failed before re-raising
        job_data["status"] = "failed"
        job_data["error"] = e.detail
        job_data["warnings"] = warnings
        service.save_job(job_id, job_data)
        raise
    except Exception as e:
        logger.error(f"Unexpected error in Boltz2 prediction: {e}", exc_info=True)
        
        # Update job status
        job_data["status"] = "failed"
        job_data["error"] = str(e)
        job_data["warnings"] = warnings
        service.save_job(job_id, job_data)
        
        return JSONResponse(
            status_code=500,
            content={
                'success': False,
                'job_id': job_id,
                'error': f"Internal server error: {str(e)}",
                'warnings': warnings
            }
        )


@router.post("/validate")
async def boltz2_validate(request: Boltz2ValidateRequest):
    """Validate structures for Boltz2."""
    try:
        logger.info("Starting Boltz2 validation request")
        logger.debug(f"Request has protein_data: {bool(request.protein_pdb_data)}, ligand_data: {bool(request.ligand_data)}")
        
        from services.boltz2.service import Boltz2Service
        boltz2_service = Boltz2Service()
        
        logger.info("Calling validate_input_structures...")
        validation_result = boltz2_service.validate_input_structures(
            request.protein_pdb_data, request.ligand_data
        )
        
        logger.info(f"Validation completed: valid={validation_result.get('valid', False)}")
        if not validation_result.get('valid', False):
            logger.warning(f"Validation failed: {validation_result.get('error', 'Unknown error')}")
        
        return validation_result
    except Exception as e:
        logger.error(f"Error in boltz2_validate endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class Boltz2AsyncRequest(BaseModel):
    """Request model for async Boltz2 prediction via Celery."""
    protein_pdb_data: str
    ligand_data: str
    num_poses: int = 5
    accelerator: Literal['gpu', 'cpu'] = 'gpu'
    msa_sequence_hash: Optional[str] = None


@router.post("/submit_async")
async def submit_async_boltz2(request: Boltz2AsyncRequest):
    """
    Submit Boltz2 prediction as async Celery task.
    
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
                'boltz2',
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
            'sequence': None,  # Will be extracted from PDB
            'protein_pdb_data': request.protein_pdb_data,
            'ligand_smiles': request.ligand_data,
            'num_poses': request.num_poses,
            'accelerator': request.accelerator,
            'msa_data': request.msa_sequence_hash,
        }
        
        # Submit to Celery
        try:
            from lib.tasks.gpu_tasks import boltz_predict
            task = boltz_predict.delay(job_data)
            job_id = task.id
            
            logger.info(f"Submitted async Boltz2 job {job_id}")
            
            return {
                "job_id": job_id,
                "status": "submitted",
                "job_type": "boltz2",
                "stream_url": f"/api/jobs/stream/{job_id}",
                "message": "Boltz2 prediction submitted to GPU queue"
            }
        except ImportError:
            logger.warning("Celery not available, falling back to synchronous execution")
            raise HTTPException(
                status_code=503,
                detail="Async job submission not available. Use /api/boltz2/predict instead."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to submit async Boltz2 job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream_predict")
async def stream_predict(request: Boltz2PredictRequest):
    """Streaming Boltz2 prediction workflow with Server-Sent Events (SSE)."""
    async def generate():
        try:
            yield f"data: {json.dumps({'progress': 5, 'status': 'Initializing Boltz-2 prediction...'})}\n\n"
            
            yield f"data: {json.dumps({'progress': 10, 'status': 'Validating input structures...'})}\n\n"
            
            # Validate protein structure for Boltz2 service
            try:
                validation_result = validate_structure_for_service(
                    'boltz2',
                    request.protein_pdb_data,
                    format='pdb'
                )
                if not validation_result['valid']:
                    error_msg = '; '.join(validation_result['errors'])
                    yield f"data: {json.dumps({'success': False, 'error': error_msg})}\n\n"
                    return
            except StructureValidationError as e:
                yield f"data: {json.dumps({'success': False, 'error': str(e)})}\n\n"
                return
            except Exception as e:
                logger.warning(f"Structure validation error (continuing): {e}")
            
            # Validate structures with Boltz2 service (additional validation)
            # Reuse existing service instance
            validation = service.validate_input_structures(
                request.protein_pdb_data, request.ligand_data
            )
            
            if not validation.get('valid', False):
                yield f"data: {json.dumps({'success': False, 'error': validation.get('error', 'Validation failed')})}\n\n"
                return
            
            yield f"data: {json.dumps({'progress': 20, 'status': 'Preparing input configuration...'})}\n\n"
            
            input_data = {
                'protein_data': request.protein_pdb_data,
                'ligand_data': request.ligand_data,
                'prediction_params': request.prediction_params,
                'num_poses': request.num_poses,
                'alignment_options': request.alignment_options
            }
            
            yield f"data: {json.dumps({'progress': 30, 'status': 'Running Boltz-2 prediction (this may take a few minutes)...'})}\n\n"
            
            # Run service
            service_result = call_service('boltz2', input_data, timeout=1800)
            
            yield f"data: {json.dumps({'progress': 80, 'status': 'Processing prediction results...'})}\n\n"
            
            if not service_result.get('success'):
                yield f"data: {json.dumps({'success': False, 'error': service_result.get('error', 'Boltz-2 prediction failed')})}\n\n"
                return
            
            results = service_result.get('result', {})
            if results.get('success', False):
                complete_results = {
                    'success': True,
                    'results': {
                        'affinity_pred_value': results.get('affinity_pred_value'),
                        'affinity_probability_binary': results.get('affinity_probability_binary'),
                        'structure_data': results.get('structure_data'),
                        'prediction_confidence': results.get('prediction_confidence'),
                        'processing_time': results.get('processing_time'),
                        'poses': results.get('poses', []),
                        'num_poses_generated': len(results.get('poses', []))
                    },
                    'progress': 100,
                    'status': 'Prediction completed'
                }
                yield f"data: {json.dumps(complete_results)}\n\n"
            else:
                yield f"data: {json.dumps({'success': False, 'error': results.get('error', 'Prediction failed')})}\n\n"
        except Exception as e:
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

