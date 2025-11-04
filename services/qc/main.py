"""QC Service - FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from lib.common.config import CORS_ORIGINS
from services.qc import routers

app = FastAPI(title="QC Service", description="Quantum chemistry calculations", version="3.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(routers.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "qc"}

if __name__ == "__main__":
    import uvicorn
    from lib.common.config import SERVICE_PORTS
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORTS['qc'])





