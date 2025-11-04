"""
Configuration for Quantum Chemistry Service

This module contains all configuration settings for the ORCA quantum chemistry
integration, including Flask, Celery, Redis, and ORCA-specific paths.
"""

import os
from pathlib import Path
import multiprocessing

class QCConfig:
    """Configuration for Quantum Chemistry calculations using ORCA."""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'qc_secret_key_change_in_production')
    
    # Celery settings
    CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
    CELERY_TASK_TRACK_STARTED = True
    CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
    
    # ORCA settings
    # This is the path to the ORCA executable on the worker machine
    # Example: '/opt/orca_6_1_0/orca'    # ORCA executable path
    ORCA_PATH = os.environ.get('ORCA_PATH', '/home/konstantin-nomerotski/orca_6_1_0/orca')
    
    # Job storage settings
    # Directory where all QC job files will be stored (each job gets a subdirectory)
    JOB_STORAGE_PATH = os.environ.get('QC_JOB_STORAGE_PATH', 
                                      str(Path(__file__).parent.parent.parent / 'data' / 'qc_jobs'))
    
    # Computational settings (defaults)
    # Get max available CPU cores on the machine
    MAX_N_PROCS = multiprocessing.cpu_count()
    DEFAULT_N_PROCS = int(os.environ.get('QC_DEFAULT_N_PROCS', str(min(4, MAX_N_PROCS))))
    DEFAULT_MEMORY_MB = int(os.environ.get('QC_DEFAULT_MEMORY_MB', '4000'))
    
    # Method presets for common calculations
    # Based on ORCA Manual Section 7.4 - Choice of Computational Model
    METHOD_PRESETS = {
        # =================================================================
        # RECOMMENDED PRESETS (Modern, well-tested combinations)
        # =================================================================
        'r2scan-3c': {
            'method': 'r2SCAN-3c',
            'basis': '',  # Composite method with built-in def2-mTZVPP basis
            'extra_keywords': '',
            'description': 'Modern "Swiss army knife" composite method (Section 7.4.2.13)',
            'use_case': 'General Purpose - Recommended'
        },
        'b97-3c': {
            'method': 'B97-3c',
            'basis': '',  # Composite method with built-in def2-mTZVP basis
            'extra_keywords': '',
            'description': 'Fast, accurate GGA composite method',
            'use_case': 'Fast Calculations'
        },
        'wb97x-3c': {
            'method': 'wB97X-3c',
            'basis': '',  # Composite method with built-in vDZP basis
            'extra_keywords': '',
            'description': 'Range-separated hybrid composite method (Section 7.4.2.14)',
            'use_case': 'High Accuracy'
        },
        
        # =================================================================
        # DFT PRESETS (Hybrid functionals with recommended settings)
        # =================================================================
        'dft-b3lyp': {
            'method': 'B3LYP',
            'basis': 'def2-SVP',
            'extra_keywords': 'D3BJ RIJCOSX def2/J TightSCF',
            'description': 'Standard B3LYP with dispersion and RIJCOSX acceleration',
            'use_case': 'General DFT'
        },
        'dft-pbe0': {
            'method': 'PBE0',
            'basis': 'def2-SVP',
            'extra_keywords': 'D3BJ RIJCOSX def2/J TightSCF',
            'description': 'PBE0 hybrid functional with dispersion',
            'use_case': 'General DFT'
        },
        'dft-wb97x-d3': {
            'method': 'wB97X-D3',
            'basis': 'def2-SVP',
            'extra_keywords': 'RIJCOSX def2/J TightSCF',
            'description': 'Range-separated hybrid with built-in D3 dispersion',
            'use_case': 'Non-covalent Interactions'
        },
        
        # =================================================================
        # FAST METHODS (For large systems or quick tests)
        # =================================================================
        'gfn2-xtb': {
            'method': 'GFN2-xTB',
            'basis': '',  # xTB methods don't use basis sets
            'extra_keywords': '',
            'description': 'Extended tight-binding for large systems (Section 7.4.3.1)',
            'use_case': 'Large Systems'
        },

        # =================================================================
        # COUPLED CLUSTER METHODS
        # =================================================================
        'ccsd-t': {
            'method': 'CCSD(T)',
            'basis': 'cc-pVTZ',
            'extra_keywords': 'TightSCF',
            'description': 'Canonical CCSD(T) — gold standard of quantum chemistry. Basis-set sensitive; use large basis or extrapolation.',
            'use_case': 'High Accuracy Reference'
        },
        'dlpno-ccsd-t': {
            'method': 'DLPNO-CCSD(T)',
            'basis': 'cc-pVTZ',
            'extra_keywords': 'cc-pVTZ/C RIJCOSX def2/J TightSCF',
            'description': 'Domain-based local pair natural orbital CCSD(T). Recommended for larger systems. Requires /C auxiliary basis.',
            'use_case': 'Large Molecule High Accuracy'
        },
        'dlpno-ccsd-t1': {
            'method': 'DLPNO-CCSD(T1)',
            'basis': 'cc-pVTZ',
            'extra_keywords': 'cc-pVTZ/C RIJCOSX def2/J TightSCF',
            'description': 'Iterative triples variant of DLPNO-CCSD(T). More accurate than DLPNO-CCSD(T) for open-shell systems.',
            'use_case': 'Open-Shell High Accuracy'
        },
    }
    
    # Database settings (for persistent storage of results)
    # For now, we'll use JSON files, but this can be upgraded to PostgreSQL/MongoDB
    RESULTS_DB_PATH = os.environ.get('QC_RESULTS_DB_PATH',
                                     str(Path(__file__).parent.parent.parent / 'data' / 'qc_results_db'))
    
    # File retention settings
    KEEP_INPUT_FILES = True
    KEEP_OUTPUT_FILES = True
    KEEP_INTERMEDIATE_FILES = False  # .tmp, .tmp_* files
    
    # Timeout settings (in seconds)
    TASK_SOFT_TIME_LIMIT = int(os.environ.get('QC_TASK_SOFT_LIMIT', '3600'))  # 1 hour
    TASK_HARD_TIME_LIMIT = int(os.environ.get('QC_TASK_HARD_LIMIT', '7200'))  # 2 hours
    
    @classmethod
    def ensure_directories(cls):
        """Create necessary directories if they don't exist."""
        Path(cls.JOB_STORAGE_PATH).mkdir(parents=True, exist_ok=True)
        Path(cls.RESULTS_DB_PATH).mkdir(parents=True, exist_ok=True)
    
    @classmethod
    def validate_orca_installation(cls):
        """Validate that ORCA is installed and accessible."""
        orca_path = Path(cls.ORCA_PATH)
        if not orca_path.exists():
            raise FileNotFoundError(
                f"ORCA executable not found at {cls.ORCA_PATH}. "
                f"Please install ORCA and set the ORCA_PATH environment variable."
            )
        return True
