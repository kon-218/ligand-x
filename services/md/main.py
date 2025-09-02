"""MD Service - FastAPI application."""
import logging
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from lib.common.config import CORS_ORIGINS
from services.md import routers

# Configure logging to be visible
import os
log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
log_file = Path('/tmp/md.log')
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
logging.getLogger('services.md').setLevel(logging.DEBUG)  # Very verbose for MD service
logging.getLogger('lib.services').setLevel(logging.DEBUG)  # Verbose for service runner
logger = logging.getLogger(__name__)
logger.info("MD service starting up...")

# Check GPU availability at startup (must be before FastAPI imports to ensure it runs)
def check_gpu_availability():
    """Check and log GPU (CUDA/OpenCL) availability at service startup."""
    logger.info("=== GPU AVAILABILITY CHECK ===")
    try:
        from openmm import Platform
        logger.info("OpenMM imported successfully")
        
        # Check CUDA - try to create a simple context to verify it works
        cuda_available = False
        try:
            cuda_platform = Platform.getPlatformByName('CUDA')
            logger.info("CUDA platform object created")
            # Try to create a simple context to verify CUDA works
            try:
                from openmm import System, Context, LangevinMiddleIntegrator
                system = System()
                system.addParticle(1.0)  # Add a dummy particle (mass=1.0) to make the system valid
                integrator = LangevinMiddleIntegrator(300, 1, 0.002)
                context = Context(system, integrator, cuda_platform)
                logger.info("[COMPLETE] CUDA platform is functional - can create contexts")
                logger.info("  GPU acceleration will be used for MD simulations")
                del context
                cuda_available = True
            except Exception as e:
                logger.info(f"CUDA platform exists but cannot create context: {e}")
        except Exception as e:
            logger.info(f"CUDA platform not available: {e}")
        
        if cuda_available:
            return True
        
        # Check OpenCL - try to create a simple context
        try:
            opencl_platform = Platform.getPlatformByName('OpenCL')
            try:
                from openmm import System, Context, LangevinMiddleIntegrator
                system = System()
                system.addParticle(1.0)  # Add a dummy particle (mass=1.0) to make the system valid
                integrator = LangevinMiddleIntegrator(300, 1, 0.002)
                context = Context(system, integrator, opencl_platform)
                logger.info("[COMPLETE] OpenCL platform is functional - can create contexts")
                logger.info("  GPU acceleration will be used for MD simulations")
                del context
                return True
            except Exception as e:
                logger.info(f"OpenCL platform exists but cannot create context: {e}")
        except Exception as e:
            logger.info(f"OpenCL platform not available: {e}")
        
        logger.info("⚠ No GPU platforms available - MD simulations will use CPU")
        logger.info("  (This is slower but will still work correctly)")
        return False
        
    except ImportError as e:
        logger.error(f"[ERROR] OpenMM not available - cannot check GPU: {e}")
        return False
    except Exception as e:
        logger.error(f"Error checking GPU availability: {e}", exc_info=True)
        return False

app = FastAPI(title="MD Service", description="Molecular dynamics optimization", version="3.0")

@app.on_event("startup")
async def startup_event():
    """Run GPU availability check on service startup."""
    check_gpu_availability()

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(routers.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "md"}

if __name__ == "__main__":
    import uvicorn
    from lib.common.config import SERVICE_PORTS
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=SERVICE_PORTS['md'],
        log_level="info",  # Uvicorn log level
        access_log=True,  # Enable access logs
        use_colors=False  # Disable colors for better log readability in docker
    )




