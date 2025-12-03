"""Boltz2 Service - FastAPI application."""
import logging
import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from lib.common.config import CORS_ORIGINS
from services.boltz2 import routers

# Configure logging to be visible
# Allow LOG_LEVEL to be set via environment variable for better debugging
log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),  # Log to stdout (visible in console/logs)
        logging.FileHandler('/tmp/boltz2.log', mode='a')  # Also log to file
    ]
)
logger = logging.getLogger(__name__)
logger.info("Boltz2 service starting up...")

app = FastAPI(title="Boltz2 Service", description="Binding affinity predictions", version="3.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(routers.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "boltz2"}

if __name__ == "__main__":
    import uvicorn
    from lib.common.config import SERVICE_PORTS
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORTS['boltz2'])


