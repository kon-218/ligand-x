# RBFE Service Documentation

Relative Binding Free Energy (RBFE) calculations using the OpenFE ecosystem to compute binding affinity differences between ligand pairs in a transformation network.

## Scientific Overview

RBFE calculates relative binding free energies (ΔΔG) between ligands by:

1. **Network Planning**: Creating a graph connecting ligand pairs for transformation
2. **Atom Mapping**: Identifying corresponding atoms between ligand pairs
3. **Alchemical Transformation**: Morphing one ligand into another
4. **Maximum Likelihood Estimation**: Computing absolute ΔG from relative ΔΔG values

Network topologies:
- **Minimal Spanning Tree (MST)**: Fewest transformations, connected graph
- **Radial (Star)**: All ligands transform to/from central reference
- **Maximal**: All possible pairwise transformations

## Python Tools & Modules

### External Libraries

| Category | Module | Purpose |
|----------|--------|---------|
| **Free Energy** | `openfe` | OpenFE ecosystem |
| | `openfe.protocols.openmm_rfe.RelativeHybridTopologyProtocol` | Hybrid topology RFE |
| | `openfe.setup.ligand_network_planning` | MST, radial, maximal networks |
| | `openfe.setup.chemicalsystem_generator.EasyChemicalSystemGenerator` | System setup |
| | `gufe.protocols.execute_DAG` | DAG execution |
| **Atom Mapping** | `kartograf.KartografAtomMapper` | 3D-aware atom mapping |
| | `openfe.LomapAtomMapper` | LOMAP-based atom mapping |
| | `openfe.setup.lomap_scorers` | Scoring atom mappings |
| **Chemistry** | `rdkit.Chem.AllChem` | Conformer generation |
| | `rdkit.Chem.rdMolAlign` | Molecular alignment |
| | `rdkit.Chem.rdFMCS` | Maximum common substructure |
| **HTTP** | `httpx` | Calling docking service for pose validation |
| **Analysis** | `numpy` | Statistical calculations |

### Internal Modules

| Module | Purpose |
|--------|---------|
| `lib.chemistry.LigandPreparer` | Ligand preparation |
| `.network_planner.NetworkPlanner` | Network topology planning |

## File Structure

```
services/rbfe/
├── __init__.py
├── main.py              # FastAPI app entry point
├── routers.py           # API endpoints
├── service.py           # RBFEService class (core logic)
├── network_planner.py   # NetworkPlanner class
└── run_rbfe_job.py      # Celery task entrypoint
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RBFE Data Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

1. Frontend submits job
   POST /api/jobs/submit/rbfe
   Body: { protein_pdb_data, ligands[], network_topology, protocol_settings }
        │
        ▼
2. Gateway creates PostgreSQL record, submits to Celery
   Task: ligandx_tasks.rbfe_calculate
   Queue: gpu-long
        │
        ▼
3. Worker executes task (lib/tasks/gpu_tasks.py)
   rbfe_calculate() → call_service_with_progress('rbfe', job_data)
        │
        ▼
4. Runner executes in conda environment
   conda run -n biochem-md python services/rbfe/run_rbfe_job.py
   Input: JSON via stdin
        │
        ▼
5. RBFEService.run_rbfe_calculation()
   ├── _prepare_ligands()           # Load and prepare all ligands
   ├── _align_ligands()             # 3D alignment using Kartograf/RDKit
   ├── NetworkPlanner.plan_network() # Generate transformation network
   ├── [Optional] batch_dock()       # Validate poses via docking
   ├── _create_transformations()     # Create OpenFE transformations
   └── execute_DAG()                 # Run all edge calculations
        │
        ▼
6. Result returned via stdout (JSON)
   { status, transformations[], relative_binding_affinities{}, network }
```

## Workflow Stages

### Stage 1: Ligand Preparation
```python
_prepare_ligands(ligands_data: List[Dict]) -> List[SmallMoleculeComponent]
```
- Parse SDF/MOL data
- Add hydrogens, generate 3D if needed
- Assign AM1-BCC partial charges

### Stage 2: Ligand Alignment
```python
_align_ligands(ligands: List, atom_mapper: str) -> List[AlignmentData]
```
- Use Kartograf (preferred) or RDKit MCS for alignment
- Compute RMSD to reference structure
- Store alignment metadata

### Stage 3: Network Planning
```python
NetworkPlanner.plan_network(
    ligands: List[SmallMoleculeComponent],
    topology: str,  # 'mst', 'radial', 'maximal'
    central_ligand_name: Optional[str]
) -> LigandNetworkData
```
- Build graph of ligand transformations
- Score edges using LOMAP scorers
- Return nodes (ligands) and edges (transformations)

### Stage 4: Optional Docking Validation
```python
_dock_ligands_batch(protein_pdb, ligands) -> Dict[str, DockingResult]
```
- Call docking service via HTTP
- Validate ligand poses in binding site
- Return `docking_ready` status for user confirmation

### Stage 5: Execute Transformations
```python
for edge in network.edges:
    transformation = create_transformation(edge.ligand_a, edge.ligand_b)
    result = execute_DAG(transformation)
    # Run complex leg + solvent leg
```

### Stage 6: MLE Analysis
```python
_compute_absolute_dg(transformations) -> Dict[str, float]
```
- Use maximum likelihood estimation
- Convert ΔΔG network to absolute ΔG values
- Reference to lowest energy ligand

## API Endpoints

### Gateway (Primary)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/jobs/submit/rbfe` | Submit RBFE calculation |
| `GET` | `/api/jobs/stream/{job_id}` | SSE progress stream |
| `GET` | `/api/jobs/{job_id}` | Get job details + results |

### Service (Internal)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/rbfe/calculate` | Direct calculation |
| `GET` | `/api/rbfe/status/{job_id}` | Job status |
| `POST` | `/api/rbfe/plan-network` | Plan network without executing |
| `GET` | `/api/rbfe/network/{job_id}` | Get network graph data |

## Key Functions

### RBFEService Class (`services/rbfe/service.py`)

```python
class RBFEService:
    def __init__(self, output_dir: str = "data/rbfe_outputs")
    
    def run_rbfe_calculation(
        self,
        protein_pdb: str,
        ligands_data: List[Dict],      # [{name, sdf_data}, ...]
        job_id: str,
        network_topology: str = "mst", # 'mst', 'radial', 'maximal'
        central_ligand_name: Optional[str] = None,
        atom_mapper: str = "kartograf",
        atom_map_hydrogens: bool = True,
        lomap_max3d: float = 1.0,
        simulation_settings: Optional[Dict] = None,
        protein_id: str = "protein"
    ) -> Dict[str, Any]
```

### NetworkPlanner Class (`services/rbfe/network_planner.py`)

```python
class NetworkPlanner:
    def __init__(
        self,
        atom_mapper: str = 'kartograf',
        atom_map_hydrogens: bool = True,
        lomap_max3d: float = 1.0
    )
    
    def plan_network(
        self,
        ligands: List[SmallMoleculeComponent],
        topology: str = 'mst',
        central_ligand_name: Optional[str] = None
    ) -> LigandNetworkData
```

### Celery Task (`lib/tasks/gpu_tasks.py`)

```python
@celery_app.task(
    bind=True,
    name='ligandx_tasks.rbfe_calculate',
    soft_time_limit=86400,  # 24 hours
    time_limit=90000
)
def rbfe_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]
```

## Input Schema

```json
{
  "protein_pdb_data": "ATOM  1  N   ALA A   1...",
  "ligands": [
    { "name": "ligand_1", "sdf_data": "...", "format": "sdf" },
    { "name": "ligand_2", "sdf_data": "...", "format": "sdf" },
    { "name": "ligand_3", "sdf_data": "...", "format": "sdf" }
  ],
  "network_topology": "mst",
  "central_ligand": null,
  "atom_mapper": "kartograf",
  "atom_map_hydrogens": true,
  "lomap_max3d": 1.0,
  "protocol_settings": {
    "simulation_time_ns": 5.0,
    "n_lambda_windows": 11
  }
}
```

## Output Schema

```json
{
  "status": "completed",
  "job_id": "xyz789",
  "transformations": [
    {
      "ligand_a": "ligand_1",
      "ligand_b": "ligand_2",
      "ddg_kcal_mol": -1.2,
      "uncertainty_kcal_mol": 0.2,
      "leg": "complex",
      "status": "completed"
    }
  ],
  "relative_binding_affinities": {
    "ligand_1": 0.0,
    "ligand_2": -1.2,
    "ligand_3": -2.5
  },
  "reference_ligand": "ligand_1",
  "network": {
    "nodes": ["ligand_1", "ligand_2", "ligand_3"],
    "edges": [
      { "source": "ligand_1", "target": "ligand_2", "score": 0.85 },
      { "source": "ligand_2", "target": "ligand_3", "score": 0.78 }
    ],
    "topology": "mst"
  },
  "alignment_data": [
    { "ligand_id": "ligand_1", "is_reference": true },
    { "ligand_id": "ligand_2", "aligned_to": "ligand_1", "rmsd": 0.45 }
  ]
}
```

## Progress Tracking

| Progress | Stage | Description |
|----------|-------|-------------|
| 0-5% | Setup | Loading protein and ligands |
| 5-15% | Alignment | 3D alignment of ligands |
| 15-25% | Network | Planning transformation network |
| 25-100% | Execution | Running transformations (per-edge) |

## Network Topologies

| Topology | Edges | Use Case |
|----------|-------|----------|
| **MST** | N-1 | Fewest calculations, best for large sets |
| **Radial** | N-1 | All relative to reference, good for SAR |
| **Maximal** | N(N-1)/2 | Most accurate, expensive |

## Output Files

Generated in `data/rbfe_outputs/{job_id}/`:

| File | Description |
|------|-------------|
| `results.json` | Final network results |
| `network.json` | Graph structure |
| `transformations/` | Per-edge calculation outputs |
| `shared_*/` | Shared simulation data |

## Docking Integration

RBFE can optionally validate ligand poses using the docking service:

1. Service pauses with `status: 'docking_ready'`
2. Frontend displays docked poses for validation
3. User confirms or adjusts poses
4. Calculation continues with validated poses

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Kartograf not available` | Missing package | Falls back to RDKit MCS |
| `No valid atom mapping` | Dissimilar ligands | Use looser constraints |
| `Network not connected` | Incompatible ligands | Check MCS coverage |
| `Docking service unavailable` | Service down | Skip pose validation |

## Deployment

```bash
# Rebuild worker
docker compose build --no-cache worker-gpu-long

# Restart
docker compose up -d worker-gpu-long

# Check logs
docker compose logs -f worker-gpu-long
```

## Related

- [SERVICES_OVERVIEW.md](./SERVICES_OVERVIEW.md) - Architecture overview
- [ABFE_SERVICE.md](./ABFE_SERVICE.md) - Absolute binding free energy
- [DOCKING_SERVICE.md](./DOCKING_SERVICE.md) - Pose validation
