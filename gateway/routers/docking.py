"""Docking service router."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="", tags=["Docking"])

DOCKING_URL = SERVICE_URLS['docking']

# Docking can take 30 minutes
DOCKING_TIMEOUT = 1800.0


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Proxy requests to Docking service with 30-minute timeout."""
    return await proxy_request(method, url, request, params, timeout=DOCKING_TIMEOUT)


# Explicit routes for docking endpoints (priority over catch-all)
# Note: These routes are now handled by the proxy router, but kept for backward compatibility
@router.post("/prepare_docking")
async def prepare_docking(request: Request):
    """Prepare structures for docking."""
    url = f"{DOCKING_URL}/api/docking/prepare_docking"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/run_docking")
async def run_docking(request: Request):
    """Execute docking."""
    url = f"{DOCKING_URL}/api/docking/run_docking"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/dock_protein_ligand")
async def dock_protein_ligand(request: Request):
    """Complete docking workflow."""
    url = f"{DOCKING_URL}/api/docking/dock_protein_ligand"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/stream_dock_protein_ligand")
async def stream_dock_protein_ligand(request: Request):
    """Streaming docking workflow with Server-Sent Events."""
    url = f"{DOCKING_URL}/api/docking/stream_dock_protein_ligand"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/calculate_grid_box")
async def calculate_grid_box(request: Request):
    """Calculate grid box for docking."""
    url = f"{DOCKING_URL}/api/docking/calculate_grid_box"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_docking(request: Request, path: str):
    """Proxy all docking service requests."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{DOCKING_URL}/{path}" if path else DOCKING_URL
    return await _proxy_request(method, url, request, params)

