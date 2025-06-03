"""Shared utility functions."""
import os
import re
import numpy as np
from typing import Any
from lib.common.config import ALLOWED_EXTENSIONS


def convert_numpy_types(obj: Any) -> Any:
    """Convert numpy types to native Python types for JSON serialization."""
    # Check if it's a numpy type by module
    if type(obj).__module__ == 'numpy':
        # Handle numpy scalar types
        if isinstance(obj, (np.integer, np.int8, np.int16, np.int32, np.int64,
                            np.uint8, np.uint16, np.uint32, np.uint64)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float16, np.float32, np.float64)):
            return float(obj)
        elif isinstance(obj, np.bool_):
            return bool(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        # Fallback for other numpy types
        try:
            if hasattr(obj, 'item'):
                return obj.item()
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.integer):
                return int(obj)
        except (ValueError, TypeError):
            return str(obj)
    
    # Handle dictionaries
    if isinstance(obj, dict):
        return {str(key): convert_numpy_types(value) for key, value in obj.items()}
    # Handle lists and tuples
    elif isinstance(obj, (list, tuple)):
        return [convert_numpy_types(item) for item in obj]
    # Handle sets
    elif isinstance(obj, set):
        return [convert_numpy_types(item) for item in obj]
    # Handle objects that might have numpy attributes
    elif hasattr(obj, '__dict__'):
        try:
            return {str(key): convert_numpy_types(value) for key, value in vars(obj).items()}
        except (TypeError, AttributeError):
            return str(obj)
    
    return obj


def secure_filename(filename: str) -> str:
    """Sanitize filename for safe file system usage (replaces werkzeug)."""
    filename = filename.strip()
    filename = re.sub(r'[^\w\s-]', '', filename)
    filename = re.sub(r'[-\s]+', '-', filename)
    return filename


def allowed_file(filename: str) -> bool:
    """Check if the file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def ensure_upload_dir():
    """Ensure upload directory exists."""
    from lib.common.config import UPLOAD_FOLDER
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

