"""Alignment service router."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="/api/alignment", tags=["Alignment"])

ALIGNMENT_URL = SERVICE_URLS['alignment']


# Explicit routes for Alignment endpoints (priority over catch-all)
@router.api_route("/pairwise", methods=["POST"])
async def pairwise_alignment(request: Request):
    """Perform pairwise structure alignment."""
    url = f"{ALIGNMENT_URL}/api/alignment/pairwise"
    params = dict(request.query_params)
    return await proxy_request("POST", url, request, params)


@router.api_route("/multi_pose", methods=["POST"])
async def multi_pose_alignment(request: Request):
    """Perform multi-pose structure alignment."""
    url = f"{ALIGNMENT_URL}/api/alignment/multi_pose"
    params = dict(request.query_params)
    return await proxy_request("POST", url, request, params)


@router.api_route("/status", methods=["GET"])
async def alignment_status(request: Request):
    """Get alignment service status."""
    url = f"{ALIGNMENT_URL}/api/alignment/status"
    params = dict(request.query_params)
    return await proxy_request("GET", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_alignment(request: Request, path: str):
    """Proxy all alignment service requests."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{ALIGNMENT_URL}/api/alignment/{path}" if path else f"{ALIGNMENT_URL}/api/alignment"
    return await proxy_request(method, url, request, params)
