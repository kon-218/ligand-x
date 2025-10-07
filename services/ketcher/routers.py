"""Ketcher service routers."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from services.ketcher.service import KetcherService

router = APIRouter(prefix="/api/ketcher", tags=["Ketcher"])

ketcher_service = KetcherService()


class KetcherRequest(BaseModel):
    struct: str
    input_format: str = "mol"
    output_format: Optional[str] = None
    options: Optional[Dict[str, Any]] = {}


@router.get("/info")
async def ketcher_info():
    """Get Ketcher service info."""
    try:
        return ketcher_service.get_info()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/convert")
async def ketcher_convert(request: KetcherRequest):
    """Convert molecular structure."""
    try:
        if not request.struct or not request.struct.strip():
            raise HTTPException(status_code=400, detail="Empty structure provided")
        result = ketcher_service.convert(
            request.struct,
            request.input_format,
            request.output_format or request.input_format,
            request.options or {}
        )
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Conversion failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate")
async def ketcher_validate(request: KetcherRequest):
    """Validate structure."""
    try:
        result = ketcher_service.validate(request.struct, request.input_format)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean2d")
async def ketcher_clean_2d(request: KetcherRequest):
    """Clean 2D structure."""
    try:
        result = ketcher_service.clean_2d(request.struct, request.input_format)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Cleaning failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate3d")
async def ketcher_generate_3d(request: KetcherRequest):
    """Generate 3D coordinates."""
    try:
        result = ketcher_service.generate_3d(request.struct, request.input_format)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', '3D generation failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/aromatize")
async def ketcher_aromatize(request: KetcherRequest):
    """Aromatize structure."""
    try:
        result = ketcher_service.aromatize(request.struct, request.input_format)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Aromatization failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dearomatize")
async def ketcher_dearomatize(request: KetcherRequest):
    """Dearomatize structure."""
    try:
        result = ketcher_service.dearomatize(request.struct, request.input_format)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Dearomatization failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/properties")
async def ketcher_properties(request: KetcherRequest):
    """Get molecular properties."""
    try:
        result = ketcher_service.get_properties(request.struct, request.input_format)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sdf")
async def ketcher_sdf(request: KetcherRequest):
    """Convert to SDF."""
    try:
        result = ketcher_service.convert_to_sdf(request.struct, request.input_format)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ket-to-smiles")
async def ketcher_ket_to_smiles(request: dict):
    """Convert KET format to SMILES."""
    try:
        ket_data = request.get('ket_data')
        if not ket_data:
            raise HTTPException(status_code=400, detail="ket_data is required")
        result = ketcher_service.ket_to_smiles(ket_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Indigo-compatible endpoints
@router.get("/indigo/info")
async def ketcher_indigo_info():
    """Indigo-compatible info endpoint."""
    return await ketcher_info()


@router.post("/indigo/convert")
async def ketcher_indigo_convert(request: KetcherRequest):
    """Indigo-compatible convert endpoint."""
    return await ketcher_convert(request)


@router.post("/indigo/layout")
async def ketcher_indigo_layout(request: KetcherRequest):
    """Indigo-compatible layout endpoint."""
    return await ketcher_clean_2d(request)


@router.post("/indigo/clean")
async def ketcher_indigo_clean(request: KetcherRequest):
    """Indigo-compatible clean endpoint."""
    return await ketcher_clean_2d(request)


@router.post("/indigo/aromatize")
async def ketcher_indigo_aromatize(request: KetcherRequest):
    """Indigo-compatible aromatize endpoint."""
    return await ketcher_aromatize(request)


@router.post("/indigo/dearomatize")
async def ketcher_indigo_dearomatize(request: KetcherRequest):
    """Indigo-compatible dearomatize endpoint."""
    return await ketcher_dearomatize(request)



