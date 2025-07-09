"""Structure service router - proxies requests to structure service."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="", tags=["Structure"])

STRUCTURE_URL = SERVICE_URLS['structure']


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Proxy requests to Structure service."""
    return await proxy_request(method, url, request, params)


# Explicit routes for common structure endpoints (priority over catch-all)
@router.post("/fetch_pdb")
async def fetch_pdb(request: Request):
    """Explicit route for fetch_pdb endpoint."""
    url = f"{STRUCTURE_URL}/fetch_pdb"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/upload_structure")
async def upload_structure(request: Request):
    """Explicit route for upload_structure endpoint."""
    url = f"{STRUCTURE_URL}/upload_structure"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/upload_smiles")
async def upload_smiles(request: Request):
    """Explicit route for upload_smiles endpoint."""
    url = f"{STRUCTURE_URL}/upload_smiles"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/combine_protein_ligand")
async def combine_protein_ligand(request: Request):
    """Explicit route for combine_protein_ligand endpoint."""
    url = f"{STRUCTURE_URL}/combine_protein_ligand"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_structure(request: Request, path: str):
    """Proxy all structure service requests."""
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    
    # Exclude paths that belong to other services (they have their own routers with prefixes)
    # These should be handled by their respective routers, not the structure catch-all
    excluded_prefixes = ['api/md/', 'api/admet/', 'api/boltz2/', 'api/qc/', 'api/alignment/', 'api/ketcher/']
    if any(path.startswith(prefix) for prefix in excluded_prefixes):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not Found")
    
    method = request.method
    params = dict(request.query_params)
    url = f"{STRUCTURE_URL}/{path}" if path else STRUCTURE_URL
    return await _proxy_request(method, url, request, params)

