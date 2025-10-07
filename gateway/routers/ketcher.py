"""Ketcher service router."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="/api/ketcher", tags=["Ketcher"])

KETCHER_URL = SERVICE_URLS['ketcher']


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Proxy requests to Ketcher service."""
    return await proxy_request(method, url, request, params)


# Explicit routes for Ketcher endpoints (priority over catch-all)
@router.api_route("/info", methods=["GET"])
async def ketcher_info(request: Request):
    """Get Ketcher service information."""
    url = f"{KETCHER_URL}/api/ketcher/info"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/convert", methods=["POST"])
async def ketcher_convert(request: Request):
    """Convert molecule format."""
    url = f"{KETCHER_URL}/api/ketcher/convert"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/validate", methods=["POST"])
async def ketcher_validate(request: Request):
    """Validate molecule structure."""
    url = f"{KETCHER_URL}/api/ketcher/validate"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/clean2d", methods=["POST"])
async def ketcher_clean2d(request: Request):
    """Clean 2D molecule structure."""
    url = f"{KETCHER_URL}/api/ketcher/clean2d"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/generate3d", methods=["POST"])
async def ketcher_generate3d(request: Request):
    """Generate 3D coordinates from 2D structure."""
    url = f"{KETCHER_URL}/api/ketcher/generate3d"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/aromatize", methods=["POST"])
async def ketcher_aromatize(request: Request):
    """Aromatize molecule structure."""
    url = f"{KETCHER_URL}/api/ketcher/aromatize"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/dearomatize", methods=["POST"])
async def ketcher_dearomatize(request: Request):
    """Dearomatize molecule structure."""
    url = f"{KETCHER_URL}/api/ketcher/dearomatize"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/properties", methods=["POST"])
async def ketcher_properties(request: Request):
    """Get molecule properties."""
    url = f"{KETCHER_URL}/api/ketcher/properties"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/sdf", methods=["POST"])
async def ketcher_sdf(request: Request):
    """Convert to SDF format."""
    url = f"{KETCHER_URL}/api/ketcher/sdf"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/ket-to-smiles", methods=["POST"])
async def ketcher_ket_to_smiles(request: Request):
    """Convert Ketcher format to SMILES."""
    url = f"{KETCHER_URL}/api/ketcher/ket-to-smiles"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/indigo/info", methods=["GET"])
async def ketcher_indigo_info(request: Request):
    """Get Indigo library information."""
    url = f"{KETCHER_URL}/api/ketcher/indigo/info"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/indigo/convert", methods=["POST"])
async def ketcher_indigo_convert(request: Request):
    """Convert using Indigo library."""
    url = f"{KETCHER_URL}/api/ketcher/indigo/convert"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/indigo/layout", methods=["POST"])
async def ketcher_indigo_layout(request: Request):
    """Layout molecule using Indigo library."""
    url = f"{KETCHER_URL}/api/ketcher/indigo/layout"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/indigo/clean", methods=["POST"])
async def ketcher_indigo_clean(request: Request):
    """Clean molecule using Indigo library."""
    url = f"{KETCHER_URL}/api/ketcher/indigo/clean"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/indigo/aromatize", methods=["POST"])
async def ketcher_indigo_aromatize(request: Request):
    """Aromatize molecule using Indigo library."""
    url = f"{KETCHER_URL}/api/ketcher/indigo/aromatize"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/indigo/dearomatize", methods=["POST"])
async def ketcher_indigo_dearomatize(request: Request):
    """Dearomatize molecule using Indigo library."""
    url = f"{KETCHER_URL}/api/ketcher/indigo/dearomatize"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_ketcher(request: Request, path: str):
    """Proxy all Ketcher service requests."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{KETCHER_URL}/api/ketcher/{path}" if path else f"{KETCHER_URL}/api/ketcher"
    return await _proxy_request(method, url, request, params)
