"""
ABFE Service Main Application
FastAPI application for absolute binding free energy calculations.
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import router

# Configure logging to be visible
import sys
import os
from pathlib import Path

log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
log_file = Path('/tmp/abfe.log')
log_file.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),  # Log to stdout (visible in console/logs)
        logging.FileHandler(str(log_file), mode='a')  # Also log to file
    ]
)

# Set specific loggers to appropriate levels
logging.getLogger('uvicorn').setLevel(logging.INFO)
logging.getLogger('uvicorn.access').setLevel(logging.INFO)
logging.getLogger('fastapi').setLevel(logging.INFO)
logging.getLogger('services.abfe').setLevel(logging.DEBUG)  # Verbose for ABFE service
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="ABFE Service",
    description="Absolute Binding Free Energy calculation service using OpenFE",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers (prefix is already defined in routers.py)
app.include_router(router, tags=["ABFE"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "ABFE Service",
        "description": "Absolute Binding Free Energy calculations using OpenFE",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
