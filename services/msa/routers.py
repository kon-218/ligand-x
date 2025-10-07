"""MSA service routers."""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
import logging

from services.msa.service import MSAService, MSAMethod

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/msa", tags=["MSA"])

# Initialize service
msa_service = MSAService()


class MSAGenerateRequest(BaseModel):
    """Request model for MSA generation."""
    sequence: str = Field(..., description="Protein sequence (amino acid letters)")
    sequence_id: str = Field(default="query", description="Identifier for the sequence")
    method: Optional[str] = Field(
        default=None, 
        description="MSA generation method (e.g., 'mmseqs2_server'). If not specified, uses default."
    )
    force_regenerate: bool = Field(default=False, description="Force regeneration even if cached")


class MSACheckRequest(BaseModel):
    """Request model for cache check."""
    sequence: str = Field(..., description="Protein sequence to check")
    method: Optional[str] = Field(default=None, description="Specific method to check")


@router.get("/status")
async def msa_status():
    """Get MSA service status including available methods."""
    return msa_service.get_service_status()


@router.get("/methods")
async def list_methods():
    """
    List all MSA generation methods and their availability.
    
    Returns information about each supported method, including whether
    it is currently available for use.
    """
    return {
        'default_method': msa_service._default_method.value,
        'available_methods': [m.value for m in msa_service.get_available_methods()],
        'all_methods': msa_service.get_all_methods()
    }


@router.post("/generate")
async def generate_msa(request: MSAGenerateRequest):
    """
    Generate MSA for a protein sequence.
    
    If the MSA is already cached and force_regenerate is False, returns
    the cached version. Otherwise, generates using the specified method.
    
    This can take several minutes for longer sequences when using remote servers.
    
    Supported methods:
    - ncbi_blast: NCBI BLAST API + Biopython alignment (default if available, reliable)
    - mmseqs2_server: ColabFold MMSeqs2 server (remote, may be slow/unreliable)
    - mmseqs2_local: Local MMSeqs2 installation (if available, requires large databases)
    """
    try:
        logger.info(f"MSA generation request: sequence_id={request.sequence_id}, "
                   f"length={len(request.sequence)}, method={request.method}")
        
        # Convert method string to enum if provided
        method = None
        if request.method:
            try:
                method = MSAMethod(request.method)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={
                        'success': False,
                        'error': f"Unknown method: {request.method}. Available: {[m.value for m in MSAMethod]}"
                    }
                )
        
        result = msa_service.generate_msa(
            sequence=request.sequence,
            sequence_id=request.sequence_id,
            method=method,
            force_regenerate=request.force_regenerate
        )
        
        if not result.get('success'):
            return JSONResponse(
                status_code=500,
                content={
                    'success': False,
                    'error': result.get('error', 'MSA generation failed'),
                    'sequence_hash': result.get('sequence_hash'),
                    'method': result.get('method')
                }
            )
        
        logger.info(f"MSA generation successful: hash={result['sequence_hash']}, "
                   f"method={result['method']}, cached={result['cached']}")
        return result
        
    except Exception as e:
        logger.error(f"MSA generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check")
async def check_msa_cache(request: MSACheckRequest):
    """
    Check if MSA is cached for a sequence.
    
    Returns the sequence hash and cache status without generating a new MSA.
    Optionally specify a method to check only that specific method's cache.
    """
    try:
        method = None
        if request.method:
            try:
                method = MSAMethod(request.method)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={
                        'success': False,
                        'error': f"Unknown method: {request.method}"
                    }
                )
        
        result = msa_service.check_cache(request.sequence, method)
        return result
        
    except Exception as e:
        logger.error(f"Cache check error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{sequence_hash}")
async def get_msa_status(
    sequence_hash: str,
    method: Optional[str] = Query(default=None, description="Specific method to check")
):
    """
    Get status of a cached MSA by sequence hash.
    
    Returns information about whether the MSA exists and its metadata.
    """
    try:
        method_enum = None
        if method:
            try:
                method_enum = MSAMethod(method)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown method: {method}")
        
        result = msa_service.get_msa_status(sequence_hash, method_enum)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status check error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{sequence_hash}")
async def download_msa(
    sequence_hash: str,
    method: Optional[str] = Query(default=None, description="Specific method to download")
):
    """
    Download the MSA file for a sequence hash.
    
    Returns the .a3m file as a downloadable attachment.
    """
    try:
        method_enum = None
        if method:
            try:
                method_enum = MSAMethod(method)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown method: {method}")
        
        msa_path = msa_service.get_msa_path(sequence_hash, method_enum)
        
        if not msa_path:
            raise HTTPException(
                status_code=404,
                detail=f"MSA not found for hash: {sequence_hash}"
            )
        
        # Get metadata for filename
        metadata = msa_service.get_msa_metadata(sequence_hash, method_enum)
        method_suffix = f"_{metadata['method']}" if metadata and 'method' in metadata else ""
        
        return FileResponse(
            path=str(msa_path),
            filename=f"msa_{sequence_hash}{method_suffix}.a3m",
            media_type="application/octet-stream"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metadata/{sequence_hash}")
async def get_msa_metadata(
    sequence_hash: str,
    method: Optional[str] = Query(default=None, description="Specific method")
):
    """
    Get metadata for a cached MSA.
    
    Returns information about when the MSA was generated, number of sequences, etc.
    """
    try:
        method_enum = None
        if method:
            try:
                method_enum = MSAMethod(method)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown method: {method}")
        
        metadata = msa_service.get_msa_metadata(sequence_hash, method_enum)
        
        if not metadata:
            raise HTTPException(
                status_code=404,
                detail=f"Metadata not found for hash: {sequence_hash}"
            )
        
        return metadata
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Metadata fetch error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_cached_msas():
    """
    List all cached MSAs.
    
    Returns a list of all MSAs in the cache with their metadata.
    """
    try:
        cached = msa_service.list_cached_msas()
        return {
            'count': len(cached),
            'cached_msas': cached
        }
        
    except Exception as e:
        logger.error(f"List error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{sequence_hash}")
async def delete_cached_msa(
    sequence_hash: str,
    method: Optional[str] = Query(default=None, description="Specific method to delete (None deletes all)")
):
    """
    Delete a cached MSA.
    
    Removes the MSA and its metadata from the cache.
    If method is specified, only deletes that method's cache.
    Otherwise, deletes all cached MSAs for this sequence hash.
    """
    try:
        method_enum = None
        if method:
            try:
                method_enum = MSAMethod(method)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown method: {method}")
        
        deleted = msa_service.delete_cached_msa(sequence_hash, method_enum)
        
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail=f"MSA not found for hash: {sequence_hash}"
            )
        
        return {'success': True, 'deleted': sequence_hash, 'method': method}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
