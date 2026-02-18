"""Configuration for benchmark scripts."""

import os
from pathlib import Path
from typing import Dict, Any
import json

# Base paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
BENCHMARK_DATA_DIR = PROJECT_ROOT / "data" / "benchmarks"
BENCHMARK_OUTPUTS_DIR = PROJECT_ROOT / "data" / "benchmark_outputs"

# API configuration
API_BASE_URL = os.getenv("LIGANDX_API_URL", "http://localhost:8000")
API_TIMEOUT = 300  # 5 minutes for API calls

# Job monitoring
MONITORING_INTERVAL = 10  # Check job status every 10 seconds
MAX_JOB_WAIT_TIME = 86400  # 24 hours max wait for job completion

# Database
DB_CONNECTION_STRING = os.getenv(
    "DATABASE_URL",
    "postgresql://ligandx:ligandx@localhost:5432/ligandx"
)


class BenchmarkConfig:
    """Configuration for a specific benchmark system."""

    def __init__(self, benchmark_name: str):
        self.name = benchmark_name
        self.data_dir = BENCHMARK_DATA_DIR / benchmark_name

        if not self.data_dir.exists():
            raise ValueError(f"Benchmark data directory not found: {self.data_dir}")

        # Load configuration files
        self.experimental_data = self._load_json("experimental_data.json")
        self.crystal_structures = self._load_json("crystal_structures.json")
        self.protocol_settings = self._load_json("protocol_settings.json")

        # Create output directory
        self.output_dir = BENCHMARK_OUTPUTS_DIR / benchmark_name
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Reference poses directory
        self.reference_poses_dir = self.data_dir / "reference_poses"
        self.reference_poses_dir.mkdir(exist_ok=True)

    def _load_json(self, filename: str) -> Dict[str, Any]:
        """Load JSON configuration file."""
        filepath = self.data_dir / filename
        if not filepath.exists():
            raise FileNotFoundError(f"Required file not found: {filepath}")

        with open(filepath, "r") as f:
            return json.load(f)

    def get_ligands(self):
        """Get list of ligand data."""
        return self.experimental_data["ligands"]

    def get_structures(self):
        """Get list of crystal structures (excluding apo)."""
        return [
            s for s in self.crystal_structures["structures"]
            if s["ligand_name"] is not None
        ]

    def get_protein_info(self):
        """Get protein metadata."""
        return self.crystal_structures["protein"]

    def get_docking_settings(self):
        """Get docking protocol settings."""
        return self.protocol_settings["docking"]

    def get_rbfe_settings(self):
        """Get RBFE protocol settings."""
        return self.protocol_settings["rbfe"]

    def get_abfe_settings(self):
        """Get ABFE protocol settings."""
        return self.protocol_settings["abfe"]

    def get_reference_ligand(self):
        """Get the reference ligand for ΔΔG calculations."""
        for ligand in self.get_ligands():
            if ligand.get("reference_ligand", False):
                return ligand
        # Default to first ligand if no reference specified
        return self.get_ligands()[0]


# Available benchmarks
AVAILABLE_BENCHMARKS = {
    "t4l99a_benzene": {
        "name": "T4 Lysozyme L99A Benzene Series",
        "description": "Benzene and n-alkylbenzene congeneric series",
        "ligand_count": 7,
        "has_crystal_structures": True,
        "supports_docking": True,
        "supports_rbfe": True,
        "supports_abfe": True,
    },
    "t4l99a_benzene_minimal": {
        "name": "T4 Lysozyme L99A Minimal Test (3 ligands)",
        "description": "Minimal 3-ligand test for quick workflow validation (MST = 2 edges = 4 transformations)",
        "ligand_count": 3,
        "has_crystal_structures": True,
        "supports_docking": True,
        "supports_rbfe": True,
        "supports_abfe": True,
    },
    "t4l99a_benzene_production": {
        "name": "T4 Lysozyme L99A Production (3 ligands + phenol)",
        "description": "Production settings with 3 ligands for accurate results in 6-12 hours (MST = 2 edges = 4 transformations)",
        "ligand_count": 3,
        "has_crystal_structures": False,  # Phenol has no crystal structure
        "supports_docking": True,
        "supports_rbfe": True,
        "supports_abfe": True,
    }
}


def list_available_benchmarks():
    """Print available benchmark systems."""
    print("\n=== Available Benchmark Systems ===\n")
    for key, info in AVAILABLE_BENCHMARKS.items():
        print(f"{key}:")
        print(f"  Name: {info['name']}")
        print(f"  Description: {info['description']}")
        print(f"  Ligands: {info['ligand_count']}")
        print(f"  Supports: ", end="")
        supports = []
        if info['supports_docking']:
            supports.append("Docking")
        if info['supports_rbfe']:
            supports.append("RBFE")
        if info['supports_abfe']:
            supports.append("ABFE")
        print(", ".join(supports))
        print()
