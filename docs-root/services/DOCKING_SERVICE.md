# Docking Service Documentation

Molecular docking using AutoDock Vina to predict ligand binding poses and affinities in protein binding sites.

## Scientific Overview

Molecular docking predicts:
1. **Binding Pose**: 3D orientation of ligand in protein binding site
2. **Binding Affinity**: Estimated ΔG (kcal/mol) from scoring function
3. **Multiple Modes**: Ranked poses by predicted affinity

The service uses AutoDock Vina with:
- PDBQT format for receptor and ligand
- Grid-based search within defined box
- Scoring functions: Vina, AutoDock4, Vinardo

## Python Tools & Modules

### External Libraries

| Category | Module | Purpose |
|----------|--------|---------|
| **Docking** | `vina.Vina` | AutoDock Vina Python API |
| **Structure Prep** | `meeko.MoleculePreparation` | Modern PDBQT preparation |
| | `meeko.PDBQTWriterLegacy` | Write PDBQT format |
| | `meeko.PDBQTMolecule` | Parse PDBQT molecules |
| | `meeko.RDKitMolCreate` | Create RDKit mol from PDBQT |
| | `openbabel.pybel` | OpenBabel format conversion |
| **Chemistry** | `rdkit.Chem` | Molecule parsing |
| | `rdkit.Chem.AllChem` | Conformer generation |
| | `rdkit.Chem.rdDistGeom` | Distance geometry |
| | `rdkit.Chem.rdMolAlign` | Molecular alignment |
| **CLI Tools** | `vina` (executable) | Command-line docking |
| | `obabel` (executable) | Format conversions |

### Internal Modules

| Module | Purpose |
|--------|---------|
| `lib.chemistry.get_pdb_parser` | PDB parsing utilities |
| `lib.chemistry.get_component_analyzer` | Residue classification |

## File Structure

```
services/docking/
├── __init__.py
├── main.py              # FastAPI app entry point
├── routers.py           # API endpoints
├── service.py           # DockingService class (core logic)
└── run_docking_job.py   # Celery task entrypoint
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Docking Data Flow                                 │
└─────────────────────────────────────────────────────────────────────────────┘

1. Frontend submits job
   POST /api/jobs/submit/docking
   Body: { protein_pdb_data, ligand_data, grid_box, docking_params }
        │
        ▼
2. Gateway creates PostgreSQL record, submits to Celery
   Task: ligandx_cpu_tasks.docking_single or docking_batch
   Queue: cpu
        │
        ▼
3. Worker executes task (lib/tasks/cpu_tasks.py)
   docking_single() → call_service_with_progress('docking', job_data)
        │
        ▼
4. Runner executes in conda environment
   conda run -n biochem-docking python services/docking/run_docking_job.py
   Input: JSON via stdin
        │
        ▼
5. DockingService.dock()
   ├── prepare_receptor()    # PDB → PDBQT (Meeko/OpenBabel)
   ├── prepare_ligand()      # SDF/MOL → PDBQT
   ├── run_vina()            # AutoDock Vina execution
   └── convert_poses()       # PDBQT → SDF/PDB for visualization
        │
        ▼
6. Result returned via stdout (JSON)
   { success, poses_pdbqt, poses_sdf, poses_pdb, scores[] }
```

## Workflow Stages

### Stage 1: Receptor Preparation
```python
prepare_receptor(pdb_data: str) -> str  # Returns PDBQT
```
- Parse PDB structure
- Remove waters, ions (optional)
- Add polar hydrogens
- Assign Gasteiger charges
- Convert to PDBQT format

### Stage 2: Ligand Preparation
```python
prepare_ligand(ligand_data: str, format: str) -> str  # Returns PDBQT
```
- Parse SDF/MOL/PDB
- Add hydrogens
- Generate 3D coordinates if needed
- Assign Gasteiger charges
- Detect rotatable bonds
- Convert to PDBQT format

### Stage 3: Grid Box Definition
```python
grid_box = {
    "center_x": 10.0,
    "center_y": 20.0,
    "center_z": 30.0,
    "size_x": 20.0,
    "size_y": 20.0,
    "size_z": 20.0
}
```
- Define search space in binding site
- Auto-detect from ligand position (optional)
- Padding around ligand (default: 10 Å)

### Stage 4: Docking Execution
```python
dock(receptor_pdbqt, ligand_pdbqt, grid_box, params) -> Dict
```
- Configure Vina with parameters
- Run docking search
- Return ranked poses with scores

### Stage 5: Pose Conversion
```python
convert_pdbqt_poses_to_sdf_obabel(poses_pdbqt: str) -> str
convert_pdbqt_poses_to_pdb(poses_pdbqt: str) -> str
```
- Convert PDBQT to SDF (preserves bonds)
- Convert PDBQT to PDB (for Molstar)
- Handle two-letter elements (Br, Cl)

## API Endpoints

### Gateway (Primary)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/jobs/submit/docking` | Submit docking job |
| `GET` | `/api/jobs/stream/{job_id}` | SSE progress stream |
| `GET` | `/api/jobs/{job_id}` | Get job details + results |

### Service (Internal)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/docking/dock` | Single ligand docking |
| `POST` | `/api/docking/batch_dock_protein_ligands` | Batch docking |
| `POST` | `/api/docking/prepare_receptor` | Prepare receptor only |
| `POST` | `/api/docking/prepare_ligand` | Prepare ligand only |
| `GET` | `/api/docking/jobs` | List docking jobs |

## Key Functions

### DockingService Class (`services/docking/service.py`)

```python
class DockingService:
    def __init__(self)
    
    def dock(
        self,
        receptor_pdbqt: str,
        ligand_pdbqt: str,
        grid_box: Dict[str, float],
        docking_params: Dict[str, Any] = None,
        use_api: Optional[bool] = None
    ) -> Dict[str, Any]
    
    def prepare_receptor(
        self,
        pdb_data: str,
        remove_waters: bool = True,
        remove_heteroatoms: bool = False
    ) -> str  # Returns PDBQT
    
    def prepare_ligand_for_docking(
        self,
        ligand_data: str,
        data_format: str = "sdf"
    ) -> str  # Returns PDBQT
    
    def convert_pdbqt_poses_to_sdf_obabel(
        self,
        poses_pdbqt: str
    ) -> str
    
    def convert_pdbqt_poses_to_pdb(
        self,
        poses_pdbqt: str
    ) -> str
```

### Celery Tasks (`lib/tasks/cpu_tasks.py`)

```python
@celery_app.task(
    bind=True,
    name='ligandx_cpu_tasks.docking_single',
    soft_time_limit=3600,  # 1 hour
    time_limit=3900
)
def docking_single(self, job_data: Dict[str, Any]) -> Dict[str, Any]

@celery_app.task(
    bind=True,
    name='ligandx_cpu_tasks.docking_batch',
    soft_time_limit=3600,
    time_limit=3900
)
def docking_batch(self, job_data: Dict[str, Any]) -> Dict[str, Any]
```

## Input Schema

### Single Docking
```json
{
  "protein_pdb_data": "ATOM  1  N   ALA A   1...",
  "ligand_data": "\n  RDKit  3D\n...",
  "ligand_format": "sdf",
  "grid_box": {
    "center_x": 10.0,
    "center_y": 20.0,
    "center_z": 30.0,
    "size_x": 20.0,
    "size_y": 20.0,
    "size_z": 20.0
  },
  "docking_params": {
    "exhaustiveness": 32,
    "num_modes": 10,
    "energy_range": 100.0,
    "scoring": "vina"
  }
}
```

### Batch Docking
```json
{
  "protein_pdb_data": "ATOM  1  N   ALA A   1...",
  "ligands": [
    { "id": "lig1", "name": "compound_1", "data": "...", "format": "sdf" },
    { "id": "lig2", "name": "compound_2", "data": "...", "format": "sdf" }
  ],
  "grid_box": { ... },
  "docking_params": { ... }
}
```

## Output Schema

```json
{
  "success": true,
  "poses_pdbqt": "MODEL 1\nATOM...\nENDMDL\nMODEL 2...",
  "poses_sdf": "\n  RDKit  3D\n...",
  "poses_pdb": "MODEL 1\nATOM...\nENDMDL...",
  "scores": [
    { "mode": 1, "affinity": -8.5, "rmsd_lb": 0.0, "rmsd_ub": 0.0 },
    { "mode": 2, "affinity": -8.2, "rmsd_lb": 1.2, "rmsd_ub": 2.3 }
  ],
  "best_affinity": -8.5,
  "num_poses": 10
}
```

## Docking Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `exhaustiveness` | 32 | Search thoroughness (higher = slower, better) |
| `num_modes` | 10 | Maximum poses to return |
| `energy_range` | 100.0 | Energy range for poses (kcal/mol) |
| `cpu` | 0 | CPU cores (0 = all available) |
| `seed` | 0 | Random seed for reproducibility |
| `scoring` | "vina" | Scoring function: vina, ad4, vinardo |

## Progress Tracking

### Single Docking
| Progress | Stage | Description |
|----------|-------|-------------|
| 0-20% | Preparation | Receptor and ligand prep |
| 20-90% | Docking | Vina search |
| 90-100% | Conversion | Output format conversion |

### Batch Docking
| Progress | Stage | Description |
|----------|-------|-------------|
| 0-10% | Setup | Receptor preparation |
| 10-95% | Docking | Per-ligand progress |
| 95-100% | Finalization | Results aggregation |

## Output Files

Generated in `data/docking_outputs/{job_id}/`:

| File | Description |
|------|-------------|
| `receptor.pdbqt` | Prepared receptor |
| `ligand.pdbqt` | Prepared ligand |
| `poses.pdbqt` | Docked poses (PDBQT) |
| `poses.sdf` | Docked poses (SDF) |
| `scores.json` | Affinity scores |

## Element Handling

Special handling for two-letter elements (Br, Cl, Fe, etc.):
- PDBQT atom types parsed to infer element
- Element column (77-78) properly set in PDB output
- Priority for two-letter elements over single-letter

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Vina not found` | Missing executable | Install vina in PATH |
| `Invalid PDBQT` | Malformed structure | Check input format |
| `No poses found` | Bad grid box | Expand search space |
| `OpenBabel not available` | Missing package | Fallback to RDKit |

## Scoring Functions

| Function | Description |
|----------|-------------|
| **vina** | Default Vina scoring (recommended) |
| **ad4** | AutoDock4 force field |
| **vinardo** | Linear combination scoring |

## Deployment

```bash
# Rebuild worker
docker compose build --no-cache worker-cpu

# Restart
docker compose up -d worker-cpu

# Check logs
docker compose logs -f worker-cpu
```

## Related

- [SERVICES_OVERVIEW.md](./SERVICES_OVERVIEW.md) - Architecture overview
- [MD_SERVICE.md](./MD_SERVICE.md) - Post-docking optimization
- [RBFE_SERVICE.md](./RBFE_SERVICE.md) - Uses docking for pose validation
