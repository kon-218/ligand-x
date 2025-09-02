"""MD service router."""
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from gateway.config import SERVICE_URLS
from gateway.utils.proxy import proxy_request
import httpx

router = APIRouter(prefix="/api/md", tags=["MD"])

MD_URL = SERVICE_URLS['md']

# MD simulations can take 1 hour
MD_TIMEOUT = 3600.0


async def _proxy_request(method: str, url: str, request: Request, params: dict):
    """Proxy requests to MD service with 1-hour timeout."""
    return await proxy_request(method, url, request, params, timeout=MD_TIMEOUT)


# Explicit routes for MD endpoints (priority over catch-all)
@router.post("/optimize")
async def optimize(request: Request):
    """MD optimization workflow."""
    url = f"{MD_URL}/api/md/optimize"
    params = dict(request.query_params)
    return await _proxy_request("POST", url, request, params)


@router.post("/stream_optimize")
async def stream_optimize(request: Request):
    """Streaming MD optimization workflow with Server-Sent Events."""
    import logging
    logger = logging.getLogger(__name__)
    
    url = f"{MD_URL}/api/md/stream_optimize"
    logger.info(f"[Gateway SSE] Streaming request to: {url}")
    
    # Read the request body BEFORE creating the stream generator
    # (request body can only be read once)
    try:
        json_data = await request.json()
        logger.info(f"[Gateway SSE] Request body received")
    except Exception as e:
        logger.error(f"[Gateway SSE] Error reading request body: {str(e)}")
        async def error_generator():
            yield f"data: {{\"error\": \"Failed to read request body: {str(e)}\", \"success\": false}}\n\n".encode()
        return StreamingResponse(error_generator(), media_type="text/event-stream")
    
    async def stream_generator():
        """Stream SSE events from the MD service."""
        try:
            logger.info(f"[Gateway SSE] Connecting to backend...")
            # Use longer timeout for connect but allow streaming
            timeout = httpx.Timeout(connect=30.0, read=MD_TIMEOUT, write=30.0, pool=30.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, json=json_data) as response:
                    logger.info(f"[Gateway SSE] Backend response status: {response.status_code}")
                    chunk_count = 0
                    # Use aiter_lines for SSE which sends line-by-line
                    async for line in response.aiter_lines():
                        chunk_count += 1
                        if chunk_count <= 5:  # Log first 5 lines
                            logger.info(f"[Gateway SSE] Line {chunk_count}: {line[:200] if len(line) > 200 else line}")
                        # SSE format requires \n\n after each event
                        yield (line + "\n").encode()
                    logger.info(f"[Gateway SSE] Stream complete, {chunk_count} lines sent")
        except Exception as e:
            logger.error(f"[Gateway SSE] Error: {str(e)}", exc_info=True)
            yield f"data: {{\"error\": \"{str(e)}\", \"success\": false}}\n\n".encode()
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/status")
async def md_status(request: Request):
    """Get MD service status."""
    url = f"{MD_URL}/api/md/status"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.get("/environment_status")
async def md_environment_status(request: Request):
    """Check MD environment status."""
    url = f"{MD_URL}/api/md/environment_status"
    params = dict(request.query_params)
    return await _proxy_request("GET", url, request, params)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_md(request: Request, path: str):
    """Proxy all MD service requests with streaming support."""
    method = request.method
    params = dict(request.query_params)
    
    # Remove leading slash from path if present to avoid double slashes
    path = path.lstrip('/')
    url = f"{MD_URL}/api/md/{path}" if path else f"{MD_URL}/api/md"
    return await _proxy_request(method, url, request, params)

