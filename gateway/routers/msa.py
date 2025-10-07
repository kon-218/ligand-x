"""MSA service router (gateway proxy)."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="/api/msa", tags=["MSA"])

MSA_URL = SERVICE_URLS['msa']

# MSA generation can take up to 10 minutes
MSA_TIMEOUT = 660.0


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Proxy requests to MSA service with 11-minute timeout."""
    return await proxy_request(method, url, request, params, timeout=MSA_TIMEOUT)


@router.api_route("/status", methods=["GET"])
async def msa_status(request: Request):
    """Get MSA service status."""
    url = f"{MSA_URL}/api/msa/status"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/methods", methods=["GET"])
async def list_methods(request: Request):
    """List available MSA methods."""
    url = f"{MSA_URL}/api/msa/methods"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/generate", methods=["POST"])
async def generate_msa(request: Request):
    """Generate MSA for a protein sequence."""
    url = f"{MSA_URL}/api/msa/generate"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/check", methods=["POST"])
async def check_msa_cache(request: Request):
    """Check if MSA is cached for a sequence."""
    url = f"{MSA_URL}/api/msa/check"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/status/{sequence_hash}", methods=["GET"])
async def get_msa_status(request: Request, sequence_hash: str):
    """Get status of a cached MSA by sequence hash."""
    url = f"{MSA_URL}/api/msa/status/{sequence_hash}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/download/{sequence_hash}", methods=["GET"])
async def download_msa(request: Request, sequence_hash: str):
    """Download the MSA file for a sequence hash."""
    url = f"{MSA_URL}/api/msa/download/{sequence_hash}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/metadata/{sequence_hash}", methods=["GET"])
async def get_msa_metadata(request: Request, sequence_hash: str):
    """Get metadata for a cached MSA."""
    url = f"{MSA_URL}/api/msa/metadata/{sequence_hash}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/list", methods=["GET"])
async def list_cached_msas(request: Request):
    """List all cached MSAs."""
    url = f"{MSA_URL}/api/msa/list"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/{sequence_hash}", methods=["DELETE"])
async def delete_cached_msa(request: Request, sequence_hash: str):
    """Delete a cached MSA."""
    url = f"{MSA_URL}/api/msa/{sequence_hash}"
    params = dict(request.query_params)
    return await _proxy_request("DELETE", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_msa(request: Request, path: str):
    """Proxy all MSA service requests."""
    method = request.method
    params = dict(request.query_params)
    
    path = path.lstrip('/')
    url = f"{MSA_URL}/api/msa/{path}" if path else f"{MSA_URL}/api/msa"
    return await _proxy_request(method, url, request, params)
