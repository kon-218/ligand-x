"""
Shared decorators for consistent error handling and logging across services.

This module provides reusable decorators that reduce boilerplate code in routers
and service methods, addressing the code duplication issues identified in the
backend refactoring analysis.

Usage:
    from lib.common.decorators import handle_service_errors
    import logging
    
    logger = logging.getLogger(__name__)
    
    @router.post("/endpoint")
    @handle_service_errors(logger)
    async def my_endpoint(request: Request):
        # Your code here
        return {"result": "success"}
"""

from functools import wraps
import traceback
import logging
from typing import Callable, Optional, Any
from fastapi import HTTPException


def handle_service_errors(logger: Optional[logging.Logger] = None):
    """
    Decorator for consistent error handling in async route handlers.
    
    Automatically catches exceptions and converts them to HTTPException with
    proper logging and traceback information. Re-raises HTTPException to
    preserve FastAPI's error handling.
    
    Args:
        logger: Optional logger instance. If provided, errors will be logged.
                If not provided, errors are logged to the function's module logger.
    
    Returns:
        Decorated async function that handles errors consistently.
    
    Example:
        @router.post("/optimize")
        @handle_service_errors(logger)
        async def optimize(request: OptimizeRequest):
            result = await some_service.run(request)
            return result
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            try:
                return await func(*args, **kwargs)
            except HTTPException:
                # Re-raise HTTPException to preserve FastAPI's error handling
                raise
            except Exception as e:
                # Get logger instance
                error_logger = logger or logging.getLogger(func.__module__)
                
                # Format error message with traceback
                error_traceback = traceback.format_exc()
                error_msg = f"{func.__name__} error: {str(e)}"
                
                # Log the error with full traceback
                error_logger.error(f"{error_msg}\n{error_traceback}")
                
                # Raise HTTPException with error details
                raise HTTPException(
                    status_code=500,
                    detail=f"{str(e)}"
                )
        return wrapper
    return decorator


def handle_service_errors_sync(logger: Optional[logging.Logger] = None):
    """
    Decorator for consistent error handling in synchronous route handlers.
    
    Same as handle_service_errors but for synchronous functions.
    
    Args:
        logger: Optional logger instance for error logging.
    
    Returns:
        Decorated function that handles errors consistently.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            try:
                return func(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as e:
                error_logger = logger or logging.getLogger(func.__module__)
                error_traceback = traceback.format_exc()
                error_msg = f"{func.__name__} error: {str(e)}"
                error_logger.error(f"{error_msg}\n{error_traceback}")
                raise HTTPException(status_code=500, detail=str(e))
        return wrapper
    return decorator


def validate_required_fields(required_fields: list[str]):
    """
    Decorator to validate that required fields are present in request data.
    
    Args:
        required_fields: List of field names that must be present.
    
    Returns:
        Decorated function that validates fields before execution.
    
    Example:
        @router.post("/process")
        @validate_required_fields(['input_data', 'format'])
        async def process(request: ProcessRequest):
            return {"result": "success"}
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Get the request object (usually first argument after self)
            request = args[0] if args else kwargs.get('request')
            
            if hasattr(request, 'dict'):
                data = request.dict()
            elif isinstance(request, dict):
                data = request
            else:
                # If we can't extract data, just call the function
                return await func(*args, **kwargs)
            
            # Check for missing fields
            missing_fields = [field for field in required_fields if field not in data or data[field] is None]
            
            if missing_fields:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required fields: {', '.join(missing_fields)}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator
