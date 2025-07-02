"""Shared Pydantic models for request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class ErrorResponse(BaseModel):
    """Standard error response model."""
    error: str
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    message: str
    version: str = "3.0"


class FileUploadResponse(BaseModel):
    """File upload response model."""
    structure_id: str
    format: str
    pdb_data: Optional[str] = None
    sdf_data: Optional[str] = None
    components: Dict[str, Any] = Field(default_factory=dict)


class SMILESRequest(BaseModel):
    """SMILES string request model."""
    smiles: str = Field(..., description="SMILES string")


class SMILESResponse(BaseModel):
    """SMILES conversion response model."""
    sdf_data: Optional[str] = None
    pdb_data: Optional[str] = None
    molfile: Optional[str] = None
    format: str = "sdf"


class MoleculeModel(BaseModel):
    """Molecule data model."""
    id: Optional[int] = None
    name: str
    smiles: Optional[str] = None
    canonical_smiles: Optional[str] = None
    molfile: Optional[str] = None
    inchi: Optional[str] = None
    molecular_weight: Optional[float] = None
    logp: Optional[float] = None
    num_atoms: Optional[int] = None
    num_bonds: Optional[int] = None
    source: Optional[str] = None


class MoleculeListResponse(BaseModel):
    """List of molecules response."""
    molecules: List[MoleculeModel]
    total: int




