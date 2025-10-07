"""Alignment service routers."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from services.alignment.service import ProteinAlignmentService

router = APIRouter(prefix="/api/alignment", tags=["Alignment"])

# Lazy initialization of service
_protein_alignment_service = None

def get_alignment_service():
    """Get or create ProteinAlignmentService instance."""
    global _protein_alignment_service
    if _protein_alignment_service is None:
        _protein_alignment_service = ProteinAlignmentService()
    return _protein_alignment_service


class PairwiseAlignmentRequest(BaseModel):
    reference_structure: str
    mobile_structure: str
    reference_format: str = "auto"
    mobile_format: str = "auto"
    chain_id: Optional[str] = None
    use_iterative_pruning: bool = True
    rmsd_cutoff: float = 4.0
    max_iterations: int = 5
    atom_types: List[str] = ["CA"]
    iterative_until_threshold: bool = False
    target_rmsd: float = 0.05


class MultiPoseAlignmentRequest(BaseModel):
    pose_structures: List[str]
    formats: Optional[List[str]] = None
    chain_id: Optional[str] = None
    atom_types: List[str] = ["CA"]
    iterative_until_threshold: bool = False
    target_rmsd: float = 0.05
    use_binding_site: bool = False
    binding_site_radius: float = 8.0
    ligand_resname: Optional[str] = None


@router.post("/pairwise")
async def align_pairwise_structures(request: PairwiseAlignmentRequest):
    """Align two structures."""
    try:
        service = get_alignment_service()
        result = service.align_protein_structures(
            request.reference_structure, request.mobile_structure,
            request.reference_format, request.mobile_format, request.chain_id,
            request.use_iterative_pruning, request.rmsd_cutoff, request.max_iterations,
            atom_types=request.atom_types,
            iterative_until_threshold=request.iterative_until_threshold,
            target_rmsd=request.target_rmsd
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/multi_pose")
async def align_multiple_poses(request: MultiPoseAlignmentRequest):
    """Align multiple poses."""
    try:
        if len(request.pose_structures) < 2:
            return {
                'success': True,
                'alignments': [{'pose_index': 0, 'is_reference': True}],
                'reference_pose': 0,
                'message': 'Single pose provided, no alignment needed'
            }
        service = get_alignment_service()
        result = service.align_multiple_poses(
            request.pose_structures, request.formats, request.chain_id,
            atom_types=request.atom_types,
            iterative_until_threshold=request.iterative_until_threshold,
            target_rmsd=request.target_rmsd,
            use_binding_site=request.use_binding_site,
            binding_site_radius=request.binding_site_radius,
            ligand_resname=request.ligand_resname
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_alignment_service_status():
    """Get alignment service status."""
    try:
        service = get_alignment_service()
        status = service.get_service_status()
        return status
    except Exception as e:
        return {
            'service': 'Protein Structure Alignment',
            'available': False,
            'error': str(e)
        }

