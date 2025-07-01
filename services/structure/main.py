"""Structure Service - FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from lib.common.config import CORS_ORIGINS
from lib.common.utils import convert_numpy_types
from services.structure import routers
import logging
import sys
import os

# Configure logging
log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)
logger.info("Structure service starting up...")

app = FastAPI(
    title="Structure Service",
    description="PDB processing, SMILES conversion, and molecule library",
    version="3.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(routers.router)


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "structure"}


if __name__ == "__main__":
    import uvicorn
    from lib.common.config import SERVICE_PORTS
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORTS['structure'])

