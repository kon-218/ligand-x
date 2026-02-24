# ABFE Service Documentation

Absolute Binding Free Energy (ABFE) calculations using the OpenFE ecosystem to compute the binding affinity of a single ligand to a protein target.

## Scientific Overview

ABFE calculates the absolute binding free energy (ΔG) of a ligand-protein complex using alchemical free energy perturbation. The calculation involves:

1. **Complex Leg**: Ligand bound to protein → Ligand decoupled from protein
2. **Solvent Leg**: Ligand in water → Ligand decoupled from water
3. **Thermodynamic Cycle**: ΔG_binding = ΔG_complex - ΔG_solvent

The protocol uses Hamiltonian Replica Exchange (HREX) to enhance sampling across lambda windows.

## Python Tools & Modules

### External Libraries

| Category | Module | Purpose |
|----------|--------|---------|
| **Free Energy** | `openfe` | OpenFE ecosystem for FE calculations |
| | `openfe.protocols.openmm_afe.AbsoluteBindingProtocol` | ABFE protocol implementation |
| | `gufe.protocols.execute_DAG` | DAG execution for protocol units |
| **Units** | `openff.units` | Unit handling for OpenFF |
| **Chemistry** | `rdkit.Chem` | Molecule parsing and manipulation |
| **Analysis** | `numpy` | Statistical calculations, error propagation |
| **Charges** | `openfe.protocols.openmm_utils.charge_generation.bulk_assign_partial_charges` | AM1-BCC partial charges |

### Internal Modules

| Module | Purpose |
|--------|---------|
| `lib.chemistry.LigandPreparer` | Add hydrogens, generate 3D, optimize geometry |
| `lib.chemistry.ProteinPreparer` | Clean protein structure |

## File Structure

```
services/abfe/
├── __init__.py
├── main.py              # FastAPI app entry point
├── routers.py           # API endpoints
├── service.py           # ABFEService class (core logic)
├── run_abfe_job.py      # Celery task entrypoint
├── example_abfe_workflow.py
└── inspect_settings.py
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ABFE Data Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

1. Frontend submits job
   POST /api/jobs/submit/abfe
   Body: { protein_pdb_data, ligand_sdf_data, ligand_name, protocol_settings }
        │
        ▼
2. Gateway creates PostgreSQL record, submits to Celery
   Task: ligandx_tasks.abfe_calculate
   Queue: gpu-long
        │
        ▼
3. Worker executes task (lib/tasks/gpu_tasks.py)
   abfe_calculate() → call_service_with_progress('abfe', job_data)
        │
        ▼
4. Runner executes in conda environment
   conda run -n biochem-md python services/abfe/run_abfe_job.py
   Input: JSON via stdin
        │
        ▼
5. ABFEService.run_abfe_calculation()
   ├── prepare_ligand_from_structure()  # RDKit + AM1-BCC charges
   ├── load_protein()                    # PDB parsing + cleaning
   ├── create_protocol()                 # AbsoluteBindingProtocol settings
   ├── create_dag()                      # Build execution DAG
   └── execute_DAG()                     # Run complex + solvent legs
        │
        ▼
6. Result returned via stdout (JSON)
   { status, binding_free_energy_kcal_mol, job_dir, output_files }
```

## API Endpoints

### Gateway (Primary)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/jobs/submit/abfe` | Submit ABFE calculation |
| `GET` | `/api/jobs/stream/{job_id}` | SSE progress stream |
| `GET` | `/api/jobs/{job_id}` | Get job details + results |

### Service (Internal)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/abfe/calculate` | Direct calculation (file upload) |
| `GET` | `/api/abfe/status/{job_id}` | Job status |
| `GET` | `/api/abfe/results/{job_id}` | Parsed results |
| `GET` | `/api/abfe/detailed-analysis/{job_id}` | Overlap matrices, convergence |
| `GET` | `/api/abfe/file/{job_id}/{leg_name}/{filename}` | Serve analysis files |

## Key Functions

### ABFEService Class (`services/abfe/service.py`)

```python
class ABFEService:
    def __init__(self, output_dir: str = "data/abfe_outputs")
    
    def run_abfe_calculation(
        self,
        protein_pdb: str,           # PDB string
        ligand_sdf: str,            # SDF string
        job_id: str,
        simulation_settings: Optional[Dict],
        ligand_id: str = "ligand",
        protein_id: str = "protein"
    ) -> Dict[str, Any]
    
    def prepare_ligand_from_structure(
        self,
        ligand_data: str,
        ligand_id: str,
        data_format: str = "sdf",
        charge_method: str = "am1bcc"
    ) -> Optional[openfe.SmallMoleculeComponent]
    
    def load_protein(
        self,
        pdb_data: str,
        protein_id: str
    ) -> Optional[openfe.ProteinComponent]
    
    def get_detailed_analysis(self, job_id: str) -> Dict[str, Any]
    # Returns: overlap matrices, convergence data, thermodynamic cycle
```

### Celery Task (`lib/tasks/gpu_tasks.py`)

```python
@celery_app.task(
    bind=True,
    name='ligandx_tasks.abfe_calculate',
    soft_time_limit=86400,  # 24 hours
    time_limit=90000
)
def abfe_calculate(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
    # Idempotency check (cached result)
    # call_service_with_progress('abfe', job_data)
    # Returns: { status, job_id, job_type, result, completed_at }
```

## Input Schema

```json
{
  "protein_pdb_data": "ATOM  1  N   ALA A   1...",
  "ligand_sdf_data": "\n  RDKit  3D\n...",
  "ligand_name": "compound_1",
  "ligand_id": "ligand",
  "protein_id": "protein",
  "protocol_settings": {
    "simulation_time_ns": 5.0,
    "n_lambda_windows": 11,
    "equilibration_length_ns": 1.0,
    "n_replicas": 11
  }
}
```

## Output Schema

```json
{
  "status": "completed",
  "job_id": "abc123",
  "binding_free_energy_kcal_mol": -8.5,
  "binding_free_energy_error_kcal_mol": 0.3,
  "job_dir": "data/abfe_outputs/abc123",
  "dg_results": [
    {
      "ligand": "compound_1",
      "dg_kcal_mol": -8.5,
      "error_kcal_mol": 0.3
    }
  ],
  "output_files": {
    "protocol_result": "protocol_result.json",
    "complex_overlap": "shared_.../mbar_overlap_matrix.png",
    "solvent_overlap": "shared_.../mbar_overlap_matrix.png"
  }
}
```

## Progress Tracking

Progress is emitted to stderr and parsed by the runner:

| Progress | Stage | Description |
|----------|-------|-------------|
| 0-5% | Setup | System initialization |
| 5-50% | Complex Leg | Complex alchemical transformation |
| 50-100% | Solvent Leg | Solvent alchemical transformation |

Detailed phases within each leg:
- Partial charges (2%)
- MD optimization (8%)
- Equilibration HREX (20%)
- Production HREX (70%)

## Output Files

Generated in `data/abfe_outputs/{job_id}/`:

| File | Description |
|------|-------------|
| `protocol_result.json` | Final free energy result |
| `shared_AbsoluteBindingComplexUnit-*/` | Complex leg outputs |
| `shared_AbsoluteBindingSolventUnit-*/` | Solvent leg outputs |
| `mbar_overlap_matrix.png` | MBAR overlap visualization |
| `replica_exchange_matrix.png` | Replica exchange transitions |
| `replica_state_timeseries.png` | Lambda state exploration |
| `*_real_time_analysis.yaml` | MBAR analysis data |

## Protocol Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `simulation_time_ns` | 5.0 | Production simulation time per replica |
| `n_lambda_windows` | 11 | Number of lambda windows |
| `equilibration_length_ns` | 1.0 | Equilibration time per replica |
| `n_replicas` | 11 | Number of HREX replicas |

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `OpenFE not available` | Missing conda env | Rebuild worker-gpu-long |
| `Failed to assign charges` | Invalid ligand structure | Check ligand valence/geometry |
| `No compatible CUDA device` | GPU contention | Queue ensures single job per GPU |
| `Job exceeded time limit` | Calculation too long | Reduce simulation_time_ns |

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
- [RBFE_SERVICE.md](./RBFE_SERVICE.md) - Relative binding free energy
