"""MSA Service - FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from lib.common.config import CORS_ORIGINS
from services.msa import routers

app = FastAPI(
    title="MSA Service",
    description="Multiple Sequence Alignment generation using MMSeqs2",
    version="1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(routers.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "msa"}


if __name__ == "__main__":
    import uvicorn
    from lib.common.config import SERVICE_PORTS
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORTS['msa'])

