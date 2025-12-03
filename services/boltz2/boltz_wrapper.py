#!/usr/bin/env python
import sys
import os
import logging
import torch
from boltz.main import cli

# Configure logging to match boltz style
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("boltz_wrapper")

def main():
    """
    Wrapper for Boltz-2 CLI to configure PyTorch backend.
    
    This script sets the preferred linear algebra library to 'magma' 
    to avoid CUSOLVER_STATUS_INTERNAL_ERROR in certain environments.
    """
    try:
        # Check current backend
        current_backend = torch.backends.cuda.preferred_linalg_library()
        
        # Set to magma (more stable than cusolver for some operations)
        # torch.backends.cuda.preferred_linalg_library("magma")
        # Update: Boltz-2 uses torch.linalg.svd with driver= argument which requires cuSOLVER backend
        torch.backends.cuda.preferred_linalg_library("cusolver")
        
        new_backend = torch.backends.cuda.preferred_linalg_library()
        logger.info(f"PyTorch CUDA linalg backend configured: {current_backend} -> {new_backend}")
        
    except Exception as e:
        logger.warning(f"Failed to configure PyTorch linalg backend: {e}")

    # Invoke the original Boltz-2 CLI
    sys.exit(cli())

if __name__ == "__main__":
    main()
