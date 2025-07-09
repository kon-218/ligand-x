"""Intelligent proxy router that routes requests to the correct service based on URL patterns."""
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import httpx
from gateway.config import SERVICE_URLS

router = APIRouter(prefix="", tags=["Proxy"])

# Service routing patterns - order matters (most specific first)
# Root-level explicit routes (exact matches)
ROOT_ROUTES = {
    # Structure routes
    "fetch_pdb": "structure",
    "upload_structure": "structure",
    "upload_smiles": "structure",
    "smiles_to_3d": "structure",
    "smiles_to_mol": "structure",
    "combine_protein_ligand": "structure",
    
    # ADMET routes
    "predict_admet": "admet",
}

# API prefix routes (routes starting with /api/{service})
API_PREFIX_ROUTES = {
    "api/md": "md",
    "api/boltz2": "boltz2",
    "api/qc": "qc",
    "api/alignment": "alignment",
    "api/ketcher": "ketcher",
    "api/admet": "admet",
    "api/docking": "docking",
    "api/structure": "structure",
    "api/molecules": "structure",  # Molecules API is part of structure service
    "api/library": "structure",  # Library API is part of structure service
    "api/abfe": "abfe",  # ABFE calculations
    "api/rbfe": "rbfe",  # RBFE calculations
}


def _get_service_for_path(path: str):
    """Determine which service should handle a given path.
    
    Returns:
        tuple: (service_name, target_path)
        - service_name: Name of the service to route to
        - target_path: The path to send to the service (may be modified)
    """
    # Remove leading slash for matching
    path = path.lstrip('/')
    
    # Check root-level explicit routes first (exact matches)
    if path in ROOT_ROUTES:
        service = ROOT_ROUTES[path]
        return service, path
    
    # Check API prefix routes
    for prefix, service in API_PREFIX_ROUTES.items():
        if path == prefix or path.startswith(prefix + '/'):
            # Preserve the full path for API routes
            return service, path
    
    # Check if path starts with any API prefix (for sub-routes)
    for prefix, service in API_PREFIX_ROUTES.items():
        if path.startswith(prefix):
            return service, path
    
    # Default to structure service for unknown root-level routes
    # This maintains backward compatibility
    if not path.startswith('api/'):
        return "structure", path
    
    # If it starts with /api/ but doesn't match any service, return None
    return None, None


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Helper to proxy requests with proper content type handling."""
    import logging
    logger = logging.getLogger(__name__)
    
    content_type = request.headers.get("content-type", "")
    
    # Determine timeout based on service type
    timeout = 300.0  # Default 5 minutes
    if "md" in url.lower() or "abfe" in url.lower() or "rbfe" in url.lower():
        timeout = 3600.0  # 1 hour for MD, ABFE, and RBFE (can take very long)
    elif "docking" in url.lower() or "boltz2" in url.lower():
        timeout = 1800.0  # 30 minutes for docking/boltz2
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method == "GET":
                response = await client.get(url, params=params)
            elif method == "POST":
                if "multipart/form-data" in content_type:
                    body = await request.body()
                    headers = dict(request.headers)
                    headers.pop("host", None)
                    response = await client.post(url, content=body, headers=headers, params=params)
                elif "application/json" in content_type:
                    try:
                        json_data = await request.json()
                        response = await client.post(url, json=json_data, params=params)
                    except Exception as e:
                        logger.error(f"Error parsing JSON request body: {e}", exc_info=True)
                        body = await request.body()
                        response = await client.post(url, content=body, headers={"Content-Type": content_type}, params=params)
                else:
                    body = await request.body()
                    response = await client.post(url, content=body, headers={"Content-Type": content_type}, params=params)
            elif method == "PUT":
                if "application/json" in content_type:
                    json_data = await request.json()
                    response = await client.put(url, json=json_data, params=params)
                else:
                    body = await request.body()
                    response = await client.put(url, content=body, headers={"Content-Type": content_type}, params=params)
            elif method == "DELETE":
                response = await client.delete(url, params=params)
            else:
                raise HTTPException(status_code=405, detail="Method not allowed")
            
            if response.status_code >= 400:
                # Log the error response for debugging
                error_body = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get('detail', error_json.get('error', error_body))
                except:
                    error_detail = error_body
                
                logger.error(
                    f"Service error: {method} {url} returned {response.status_code}",
                    extra={
                        'status_code': response.status_code,
                        'url': url,
                        'method': method,
                        'error_detail': error_detail[:500]  # Limit length
                    }
                )
                raise HTTPException(status_code=response.status_code, detail=error_detail)
            
            # Handle successful responses
            content_type_resp = response.headers.get("content-type", "")
            if "text/event-stream" in content_type_resp or "text/plain" in content_type_resp or "stream" in content_type_resp.lower():
                async def generate():
                    async for chunk in response.aiter_bytes():
                        yield chunk
                return StreamingResponse(
                    generate(), 
                    media_type=content_type_resp or "text/event-stream",
                    headers={
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "X-Accel-Buffering": "no"
                    }
                )
            elif "application/json" in content_type_resp:
                return response.json()
            else:
                from fastapi.responses import Response
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=content_type_resp
                )
    except httpx.TimeoutException as e:
        logger.error(f"Timeout error proxying {method} {url}: {e}", exc_info=True)
        raise HTTPException(status_code=504, detail=f"Service timeout: {str(e)}")
    except httpx.RequestError as e:
        logger.error(f"Request error proxying {method} {url}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service connection error: {str(e)}")


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def proxy_request(request: Request, path: str):
    """Intelligent proxy that routes requests to the correct service based on path."""
    import logging
    from fastapi.responses import Response
    logger = logging.getLogger(__name__)
    
    method = request.method
    params = dict(request.query_params)
    
    # Handle CORS preflight requests - return empty 200 response
    # The CORS middleware will add the appropriate headers
    if method == "OPTIONS":
        return Response(status_code=200)
    
    # Log the incoming request at INFO level for visibility
    logger.info(f"Proxy request: {method} /{path}")
    
    # Determine which service should handle this request
    service, target_path = _get_service_for_path(path)
    
    if service is None:
        logger.warning(f"No service found for path: /{path}")
        raise HTTPException(status_code=404, detail=f"No service found for path: /{path}")
    
    service_url = SERVICE_URLS.get(service)
    if not service_url:
        logger.error(f"Service URL not configured for: {service}")
        raise HTTPException(status_code=500, detail=f"Service URL not configured for: {service}")
    
    # Build the target URL
    # For API routes, preserve the full path since services define routes with /api/{service} prefix
    # Root-level routes (like /predict_admet) are forwarded as-is
    if target_path:
        # Check if this is an API-prefixed route
        url = None
        for api_prefix, svc in API_PREFIX_ROUTES.items():
            if svc == service and target_path.startswith(api_prefix):
                # Preserve the full path for API routes since services have the prefix in their routers
                url = f"{service_url}/{target_path}"
                logger.info(f"Routing {path} -> {service} -> {url} (preserved full path for {api_prefix})")
                break
        
        if url is None:
            # Root-level route, send as-is
            url = f"{service_url}/{target_path}"
            logger.info(f"Routing {path} -> {service} -> {url} (root-level)")
    else:
        url = service_url
        logger.info(f"Routing {path} -> {service} -> {url} (root)")
    
    try:
        return await _proxy_request(method, url, request, params)
    except HTTPException as e:
        # Re-raise HTTP exceptions (they already have proper status codes)
        logger.error(
            f"HTTP error proxying {method} {path} to {url}: {e.status_code} - {e.detail}",
            extra={'status_code': e.status_code, 'path': path, 'url': url, 'method': method}
        )
        raise
    except Exception as e:
        logger.error(f"Unexpected error proxying request to {url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

