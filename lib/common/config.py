"""Shared configuration for all services."""
import os
from typing import Dict

# Service ports
SERVICE_PORTS = {
    'gateway': int(os.getenv('GATEWAY_PORT', '8000')),
    'structure': int(os.getenv('STRUCTURE_PORT', '8001')),
    'docking': int(os.getenv('DOCKING_PORT', '8002')),
    'md': int(os.getenv('MD_PORT', '8003')),
    'admet': int(os.getenv('ADMET_PORT', '8004')),
    'boltz2': int(os.getenv('BOLTZ2_PORT', '8005')),
    'qc': int(os.getenv('QC_PORT', '8006')),
    'alignment': int(os.getenv('ALIGNMENT_PORT', '8007')),
    'ketcher': int(os.getenv('KETCHER_PORT', '8008')),
    'msa': int(os.getenv('MSA_PORT', '8009')),
    'abfe': int(os.getenv('ABFE_PORT', '8010')),
    'rbfe': int(os.getenv('RBFE_PORT', '8011')),
}

# Service URLs (for inter-container communication in Docker)
# Use Docker service names by default, can be overridden with environment variables
SERVICE_URLS = {
    'structure': os.getenv('STRUCTURE_URL', 'http://structure:8001'),
    'docking': os.getenv('DOCKING_URL', 'http://docking:8002'),
    'md': os.getenv('MD_URL', 'http://md:8003'),
    'admet': os.getenv('ADMET_URL', 'http://admet:8004'),
    'boltz2': os.getenv('BOLTZ2_URL', 'http://boltz2:8005'),
    'qc': os.getenv('QC_URL', 'http://qc:8006'),
    'alignment': os.getenv('ALIGNMENT_URL', 'http://alignment:8007'),
    'ketcher': os.getenv('KETCHER_URL', 'http://ketcher:8008'),
    'msa': os.getenv('MSA_URL', 'http://msa:8009'),
    'abfe': os.getenv('ABFE_URL', 'http://abfe:8010'),
    'rbfe': os.getenv('RBFE_URL', 'http://rbfe:8011'),
}

# File upload settings
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'data/uploads')
ALLOWED_EXTENSIONS = {'pdb', 'cif', 'mmcif', 'sdf'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB

# CORS settings
CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000,http://0.0.0.0:3000,http://127.0.0.1:36501').split(',')



