"""
Standardized API Response Models

This module provides consistent response patterns across all backend services,
addressing the API consistency issues identified in the refactoring analysis.

Usage:
    from lib.common.responses import ServiceResponse, success_response, error_response
    
    # In a router:
    @router.get("/status")
    async def get_status():
        return success_response(data={"status": "ready"})
    
    # Error case:
    return error_response(error="Job not found", error_code="JOB_NOT_FOUND", status_code=404)
"""

from typing import TypeVar, Generic, Optional, Any, Dict, List
from pydantic import BaseModel, Field
from datetime import datetime


T = TypeVar('T')


class ServiceResponse(BaseModel, Generic[T]):
    """
    Standard response wrapper for all API endpoints.
    
    Attributes:
        success: Whether the operation succeeded
        data: The response payload (generic type)
        error: Error message if success is False
        error_code: Machine-readable error code for frontend handling
        timestamp: When the response was generated
    """
    success: bool = True
    data: Optional[T] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PaginatedResponse(ServiceResponse[List[T]], Generic[T]):
    """
    Response wrapper for paginated list endpoints.
    
    Attributes:
        total: Total number of items across all pages
        page: Current page number (1-indexed)
        page_size: Number of items per page
        has_more: Whether there are more pages
    """
    total: int = 0
    page: int = 1
    page_size: int = 50
    has_more: bool = False


class JobStatus(BaseModel):
    """
    Standardized job status model for all async job-based services.
    
    This provides consistency across MD, QC, ABFE, and other job-running services.
    """
    job_id: str
    status: str  # 'pending', 'running', 'completed', 'failed', 'cancelled'
    progress: Optional[float] = None  # 0.0 to 1.0
    message: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# Helper functions for creating responses

def success_response(
    data: Any = None,
    message: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a successful response dictionary.
    
    Args:
        data: The response payload
        message: Optional success message
        
    Returns:
        Dictionary matching ServiceResponse schema
    """
    response = {
        "success": True,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    }
    if message:
        response["message"] = message
    return response


def error_response(
    error: str,
    error_code: Optional[str] = None,
    status_code: int = 500
) -> tuple[Dict[str, Any], int]:
    """
    Create an error response dictionary with HTTP status code.
    
    Args:
        error: Human-readable error message
        error_code: Machine-readable error code (e.g., 'JOB_NOT_FOUND')
        status_code: HTTP status code
        
    Returns:
        Tuple of (response dict, status code) for service layer compatibility
    """
    response = {
        "success": False,
        "error": error,
        "timestamp": datetime.utcnow().isoformat()
    }
    if error_code:
        response["error_code"] = error_code
    return response, status_code


# Common error codes for consistency
class ErrorCodes:
    """Standard error codes for frontend handling."""
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"
    JOB_FAILED = "JOB_FAILED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    TIMEOUT = "TIMEOUT"
    UNAUTHORIZED = "UNAUTHORIZED"
    RATE_LIMITED = "RATE_LIMITED"
    INVALID_FORMAT = "INVALID_FORMAT"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
