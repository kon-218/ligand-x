"""
Shared proxy request handler for gateway routers.

This module consolidates the duplicated _proxy_request function that appears
in 10+ gateway router files, reducing code duplication by ~500 lines.

Usage:
    from gateway.utils.proxy import proxy_request
    
    @router.post("/api/service/endpoint")
    async def endpoint(request: Request):
        return await proxy_request("POST", SERVICE_URL + "/endpoint", request, {})
"""

import logging
from typing import Dict, Union
from fastapi import HTTPException, Request
from fastapi.responses import Response
import httpx

logger = logging.getLogger(__name__)

# Service-specific timeout configuration
SERVICE_TIMEOUTS = {
    'md': 3600.0,          # 1 hour for MD simulations
    'abfe': 3600.0,        # 1 hour for ABFE calculations
    'docking': 1800.0,     # 30 minutes for docking
    'boltz2': 1800.0,      # 30 minutes for boltz2
    'qc': 1800.0,          # 30 minutes for QC calculations
    'alignment': 600.0,    # 10 minutes for alignment
    'msa': 600.0,          # 10 minutes for MSA
    'structure': 300.0,    # 5 minutes for structure operations
    'admet': 300.0,        # 5 minutes for ADMET
    'ketcher': 300.0,      # 5 minutes for ketcher
}


def _get_timeout_for_url(url: str) -> float:
    """
    Determine appropriate timeout for a given service URL.
    
    Args:
        url: The target URL being proxied to
        
    Returns:
        Timeout in seconds
    """
    for service, timeout in SERVICE_TIMEOUTS.items():
        if service in url.lower():
            return timeout
    return 300.0  # Default 5 minutes


async def proxy_request(
    method: str,
    url: str,
    request: Request,
    params: Dict = None,
    timeout: float = None
) -> Union[Dict, Response]:
    """
    Proxy an HTTP request to a backend service with proper error handling.
    
    Handles different content types (JSON, multipart form data, binary) and
    returns responses in the appropriate format.
    
    Args:
        method: HTTP method (GET, POST, PUT, DELETE)
        url: Target URL to proxy to
        request: FastAPI Request object
        params: Query parameters (optional)
        timeout: Request timeout in seconds. If not provided, auto-detected
                 based on service type from URL.
    
    Returns:
        Response data (dict for JSON, Response object for binary/other)
        
    Raises:
        HTTPException: If the proxied request fails
    
    Example:
        @router.post("/api/md/optimize")
        async def optimize(request: Request):
            url = f"{MD_URL}/api/md/optimize"
            return await proxy_request("POST", url, request, {})
    """
    if params is None:
        params = {}
    
    if timeout is None:
        timeout = _get_timeout_for_url(url)
    
    content_type = request.headers.get("content-type", "")
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method == "GET":
                response = await client.get(url, params=params)
            
            elif method == "POST":
                if "multipart/form-data" in content_type:
                    # Handle file uploads
                    body = await request.body()
                    headers = dict(request.headers)
                    headers.pop("host", None)
                    response = await client.post(url, content=body, headers=headers, params=params)
                
                elif "application/json" in content_type:
                    # Handle JSON requests
                    try:
                        json_data = await request.json()
                        response = await client.post(url, json=json_data, params=params)
                    except Exception:
                        # Fallback to raw body if JSON parsing fails
                        body = await request.body()
                        response = await client.post(
                            url,
                            content=body,
                            headers={"Content-Type": content_type},
                            params=params
                        )
                else:
                    # Handle other content types
                    body = await request.body()
                    response = await client.post(
                        url,
                        content=body,
                        headers={"Content-Type": content_type},
                        params=params
                    )
            
            elif method == "PUT":
                if "application/json" in content_type:
                    json_data = await request.json()
                    response = await client.put(url, json=json_data, params=params)
                else:
                    body = await request.body()
                    response = await client.put(
                        url,
                        content=body,
                        headers={"Content-Type": content_type},
                        params=params
                    )
            
            elif method == "DELETE":
                response = await client.delete(url, params=params)
            
            else:
                raise HTTPException(status_code=405, detail="Method not allowed")
            
            # Handle error responses
            if response.status_code >= 400:
                logger.error(f"Proxy request failed: {method} {url} -> {response.status_code}")
                logger.error(f"Response body: {response.text[:500]}")
                raise HTTPException(status_code=response.status_code, detail=response.text)
            
            # Return response in appropriate format
            response_content_type = response.headers.get("content-type", "")
            
            if "application/json" in response_content_type:
                return response.json()
            else:
                # Return binary/other content as Response object
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response_content_type
                )
    
    except httpx.TimeoutException:
        logger.error(f"Proxy request timeout: {method} {url}")
        raise HTTPException(
            status_code=504,
            detail=f"Service timeout after {timeout} seconds"
        )
    
    except httpx.RequestError as e:
        logger.error(f"Proxy request error: {method} {url} - {str(e)}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to service: {str(e)}"
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"Unexpected error in proxy_request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
