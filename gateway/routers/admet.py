"""ADMET service router."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="", tags=["ADMET"])

ADMET_URL = SERVICE_URLS['admet']


# Explicit routes for ADMET endpoints (priority over catch-all)
@router.api_route("/predict_admet", methods=["POST"])
async def predict_admet(request: Request):
    """Predict ADMET properties for a molecule."""
    url = f"{ADMET_URL}/predict_admet"
    params = dict(request.query_params)
    return await proxy_request("POST", url, request, params)


@router.api_route("/api/admet/results", methods=["GET"])
async def get_admet_results(request: Request):
    """Get all stored ADMET results."""
    url = f"{ADMET_URL}/api/admet/results"
    params = dict(request.query_params)
    return await proxy_request("GET", url, request, params)


@router.api_route("/api/admet/results/{smiles:path}", methods=["GET"])
async def get_admet_result_by_smiles(request: Request, smiles: str):
    """Get ADMET result by SMILES string."""
    url = f"{ADMET_URL}/api/admet/results/{smiles}"
    params = dict(request.query_params)
    return await proxy_request("GET", url, request, params)


@router.api_route("/api/admet/results/{result_id}", methods=["DELETE"])
async def delete_admet_result(request: Request, result_id: int):
    """Delete ADMET result by ID."""
    url = f"{ADMET_URL}/api/admet/results/{result_id}"
    params = dict(request.query_params)
    return await proxy_request("DELETE", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admet(request: Request, path: str):
    """Proxy all ADMET service requests."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{ADMET_URL}/{path}" if path else ADMET_URL
    return await proxy_request(method, url, request, params)

