"""QC service router."""
from fastapi import APIRouter, Request
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request

router = APIRouter(prefix="/api/qc", tags=["QC"])

QC_URL = SERVICE_URLS['qc']

# QC calculations can take 30 minutes
QC_TIMEOUT = 1800.0


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Proxy requests to QC service with 30-minute timeout."""
    return await proxy_request(method, url, request, params, timeout=QC_TIMEOUT)


# Explicit routes for QC endpoints (priority over catch-all)
@router.api_route("/jobs", methods=["POST"])
async def create_qc_job(request: Request):
    """Create a new QC calculation job."""
    url = f"{QC_URL}/api/qc/jobs"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/jobs/ir", methods=["POST"])
async def create_ir_job(request: Request):
    """Create an IR spectrum calculation job."""
    url = f"{QC_URL}/api/qc/jobs/ir"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/jobs/fukui", methods=["POST"])
async def create_fukui_job(request: Request):
    """Create a Fukui indices calculation job."""
    url = f"{QC_URL}/api/qc/jobs/fukui"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/jobs/conformer", methods=["POST"])
async def create_conformer_job(request: Request):
    """Create a conformer search job."""
    url = f"{QC_URL}/api/qc/jobs/conformer"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/jobs", methods=["GET"])
async def list_qc_jobs(request: Request):
    """List all QC calculation jobs."""
    url = f"{QC_URL}/api/qc/jobs"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/jobs/status/{job_id}", methods=["GET"])
async def get_qc_job_status(request: Request, job_id: str):
    """Get status of a QC calculation job."""
    url = f"{QC_URL}/api/qc/jobs/status/{job_id}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/jobs/results/{job_id}", methods=["GET"])
async def get_qc_job_results(request: Request, job_id: str):
    """Get results of a QC calculation job."""
    url = f"{QC_URL}/api/qc/jobs/results/{job_id}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/jobs/files/{job_id}/{filename:path}", methods=["GET"])
async def get_qc_job_file(request: Request, job_id: str, filename: str):
    """Get a file from a QC calculation job."""
    url = f"{QC_URL}/api/qc/jobs/files/{job_id}/{filename}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/jobs/{job_id}", methods=["DELETE"])
async def delete_qc_job(request: Request, job_id: str):
    """Delete a QC calculation job."""
    url = f"{QC_URL}/api/qc/jobs/{job_id}"
    params = dict(request.query_params)
    return await _proxy_request("DELETE", url, request, params)


@router.api_route("/presets", methods=["GET"])
async def get_qc_presets(request: Request):
    """Get available QC calculation presets."""
    url = f"{QC_URL}/api/qc/presets"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/jobs/mo-data/{job_id}", methods=["GET"])
async def get_qc_mo_data(request: Request, job_id: str):
    """Get molecular orbital data from a QC calculation job."""
    url = f"{QC_URL}/api/qc/jobs/mo-data/{job_id}"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/add-hydrogens", methods=["POST"])
async def add_hydrogens(request: Request):
    """Add hydrogens to a molecular structure."""
    url = f"{QC_URL}/api/qc/add-hydrogens"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_qc(request: Request, path: str):
    """Proxy all QC service requests."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{QC_URL}/api/qc/{path}" if path else f"{QC_URL}/api/qc"
    return await _proxy_request(method, url, request, params)
