# MD Optimization Service Documentation

Molecular Dynamics (MD) optimization using OpenMM to equilibrate protein-ligand complexes and prepare systems for free energy calculations.

## Scientific Overview

MD optimization prepares protein-ligand complexes for downstream analysis by:

1. **System Setup**: Build solvated system with force field parameters
2. **Energy Minimization**: Remove steric clashes
3. **NVT Equilibration**: Heat system to target temperature
4. **NPT Equilibration**: Equilibrate pressure and density
5. **Production (Optional)**: Generate trajectory for analysis

The service produces equilibrated structures suitable for ABFE/RBFE calculations.

## Python Tools & Modules

### External Libraries

| Category | Module | Purpose |
|----------|--------|---------|
| **Simulation** | `openmm` | MD simulation engine |
| | `openmm.app` | PDB loading, force fields, reporters |
| | `openmm.unit` | Physical units |
| **Force Fields** | `openmmforcefields` | GAFF2, OpenFF force fields |
| | `openff.toolkit` | Small molecule force field handling |
| | `openff.toolkit.topology.Molecule` | Molecule representation |
| **Structure** | `pdbfixer` | PDB fixing, missing residues |
| | `pdbfixer.PDBFixer` | Add missing atoms/residues |
| **Chemistry** | `rdkit.Chem` | Ligand parsing |
| | `rdkit.Chem.AllChem` | Conformer generation |
| **Charges** | `ambertools` (via conda) | AM1-BCC charge assignment |
| **Analysis** | `numpy` | Numerical operations |

### Internal Modules

| Module | Purpose |
|--------|---------|
| `lib.chemistry.ProteinPreparer` | Protein cleaning |
| `lib.chemistry.LigandPreparer` | Ligand preparation |
| `.config.MDOptimizationConfig` | Configuration dataclass |
| `.validation` | Input validation |
| `.preparation/` | Structure preparation modules |
| `.simulation/` | Simulation execution modules |
| `.workflow/` | High-level workflow orchestration |
| `.utils/` | Utility functions |

## File Structure

```
services/md/
├── __init__.py
├── main.py                  # FastAPI app entry point
├── routers.py               # API endpoints
├── service.py               # MDOptimizationService class
├── config.py                # MDOptimizationConfig dataclass
├── validation.py            # Input validation functions
├── run_md_job.py            # Celery task entrypoint
│
├── preparation/             # Structure preparation
│   ├── __init__.py
│   ├── protein.py           # ProteinPreparation class
│   ├── ligand.py            # LigandPreparation class
│   ├── charges.py           # ChargeAssignment class
│   └── system.py            # SystemBuilder class
│
├── simulation/              # Simulation execution
│   ├── __init__.py
│   ├── minimization.py      # EnergyMinimization class
│   ├── equilibration.py     # Equilibration class
│   ├── runner.py            # SimulationRunner class
│   └── trajectory.py        # TrajectoryProcessor class
│
├── workflow/                # Workflow orchestration
│   ├── __init__.py
│   ├── ligand_processor.py  # LigandProcessor class
│   ├── system_builder.py    # SolvatedSystemBuilder class
│   ├── equilibration_runner.py  # EquilibrationRunner class
│   ├── trajectory_processor.py  # TrajectoryProcessorRunner class
│   └── optimizer.py         # Main optimization workflow
│
└── utils/                   # Utilities
    ├── __init__.py
    ├── pdb_writer.py        # PDBWriter class
    ├── pdb_utils.py         # PDB manipulation utilities
    └── environment.py       # EnvironmentValidator class
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MD Optimization Data Flow                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. Frontend submits job
   POST /api/jobs/submit/md
   Body: { protein_pdb_data, ligand_smiles/sdf_data, optimization_params }
        │
        ▼
2. Gateway creates PostgreSQL record, submits to Celery
   Task: ligandx_tasks.md_optimize
   Queue: gpu-short
        │
        ▼
3. Worker executes task (lib/tasks/gpu_tasks.py)
   md_optimize() → call_service_with_progress('md', job_data)
        │
        ▼
4. Runner executes in conda environment
   conda run -n biochem-md python services/md/run_md_job.py
   Input: JSON via stdin
        │
        ▼
5. MDOptimizationService.optimize(config)
   ├── LigandProcessor.process()        # Ligand prep + charges
   ├── SolvatedSystemBuilder.build()    # Solvation + ions
   ├── EquilibrationRunner.run()        # Min + NVT + NPT
   └── TrajectoryProcessorRunner.run()  # Output generation
        │
        ▼
6. Result returned via stdout (JSON)
   { status, output_files, trajectory_info, final_energy }
```

## Workflow Stages

### Stage 1: Configuration
```python
config = MDOptimizationConfig.from_dict(input_data)
```
- Parse input parameters
- Validate configuration
- Set defaults for missing values

### Stage 2: Ligand Processing
```python
LigandProcessor.process(protein_pdb, ligand_data, ligand_format)
```
- Parse ligand (SMILES, SDF, MOL)
- Generate 3D coordinates if needed
- Assign AM1-BCC partial charges
- Generate force field parameters (GAFF2/OpenFF)

### Stage 3: System Building
```python
SolvatedSystemBuilder.build(protein_pdb, ligand_mol)
```
- Load and clean protein (PDBFixer)
- Combine protein and ligand
- Add solvent box (TIP3P water)
- Add ions (neutralize + ionic strength)

### Stage 4: Energy Minimization
```python
EquilibrationRunner.minimize(system, positions)
```
- Steepest descent minimization
- Remove steric clashes
- Converge to local minimum

### Stage 5: NVT Equilibration
```python
EquilibrationRunner.nvt_equilibration(system, positions, temperature)
```
- Heat system gradually
- Velocity rescaling thermostat
- Protein backbone restraints

### Stage 6: NPT Equilibration
```python
EquilibrationRunner.npt_equilibration(system, positions, temperature, pressure)
```
- Monte Carlo barostat
- Equilibrate box volume
- Release restraints gradually

### Stage 7: Output Generation
```python
TrajectoryProcessorRunner.run(simulation_result)
```
- Extract final coordinates
- Write PDB files
- Generate trajectory summary

## API Endpoints

### Gateway (Primary)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/jobs/submit/md` | Submit MD optimization |
| `GET` | `/api/jobs/stream/{job_id}` | SSE progress stream |
| `GET` | `/api/jobs/{job_id}` | Get job details + results |

### Service (Internal)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/md/optimize` | Start optimization |
| `GET` | `/api/md/status/{job_id}` | Job status |
| `GET` | `/api/md/results/{job_id}` | Get results |
| `GET` | `/api/md/download/{job_id}/{filename}` | Download output files |

## Key Functions

### MDOptimizationService Class (`services/md/service.py`)

```python
class MDOptimizationService:
    def __init__(self, output_dir: str = "data/md_outputs", job_id: Optional[str] = None)
    
    def optimize(self, config: MDOptimizationConfig) -> Dict[str, Any]
```

### MDOptimizationConfig (`services/md/config.py`)

```python
@dataclass
class MDOptimizationConfig:
    protein_pdb_data: str
    ligand_smiles: Optional[str] = None
    ligand_structure_data: Optional[str] = None
    ligand_structure_format: str = "sdf"
    
    # Simulation parameters
    temperature: float = 300.0          # Kelvin
    pressure: float = 1.0               # bar
    ionic_strength: float = 0.15        # M
    
    # Minimization
    min_steps: int = 1000
    min_tolerance: float = 10.0         # kJ/mol/nm
    
    # Equilibration
    nvt_steps: int = 25000              # 50 ps
    npt_steps: int = 25000              # 50 ps
    
    # Force field
    protein_ff: str = "amber14-all"
    ligand_ff: str = "gaff-2.11"        # or "openff-2.0.0"
    water_model: str = "tip3p"
    
    # Box
    box_padding: float = 1.0            # nm
    
    @classmethod
    def from_dict(cls, data: Dict) -> "MDOptimizationConfig"
    
    def validate(self) -> Tuple[bool, str]
```

### Workflow Classes

```python
# Ligand processing
class LigandProcessor:
    def process(self, protein_pdb: str, ligand_data: str, 
                ligand_format: str) -> Dict[str, Any]

# System building
class SolvatedSystemBuilder:
    def build(self, protein_pdb: str, ligand_mol: Any,
              box_padding: float, ionic_strength: float) -> Dict[str, Any]

# Equilibration
class EquilibrationRunner:
    def run(self, system: Any, positions: Any, 
            config: MDOptimizationConfig) -> Dict[str, Any]

# Trajectory processing
class TrajectoryProcessorRunner:
    def run(self, simulation_result: Dict) -> Dict[str, Any]
```

### Celery Task (`lib/tasks/gpu_tasks.py`)

```python
@celery_app.task(
    bind=True,
    name='ligandx_tasks.md_optimize',
    soft_time_limit=7200,  # 2 hours
    time_limit=7500
)
def md_optimize(self, job_data: Dict[str, Any]) -> Dict[str, Any]
```

## Input Schema

```json
{
  "protein_pdb_data": "ATOM  1  N   ALA A   1...",
  "ligand_smiles": "CCO",
  "ligand_structure_data": null,
  "ligand_structure_format": "sdf",
  "job_id": "md_job_123",
  "system_id": "complex_1",
  
  "temperature": 300.0,
  "pressure": 1.0,
  "ionic_strength": 0.15,
  
  "min_steps": 1000,
  "nvt_steps": 25000,
  "npt_steps": 25000,
  
  "protein_ff": "amber14-all",
  "ligand_ff": "gaff-2.11",
  "water_model": "tip3p",
  "box_padding": 1.0
}
```

## Output Schema

```json
{
  "status": "success",
  "job_id": "md_job_123",
  "output_files": {
    "minimized_pdb": "minimized.pdb",
    "equilibrated_pdb": "equilibrated.pdb",
    "final_pdb": "final.pdb",
    "topology": "topology.pdb",
    "trajectory": "trajectory.dcd"
  },
  "trajectory_info": {
    "n_frames": 100,
    "timestep_ps": 2.0,
    "total_time_ps": 200.0
  },
  "final_energy": {
    "potential_kJ_mol": -125000.5,
    "kinetic_kJ_mol": 45000.2,
    "total_kJ_mol": -80000.3
  },
  "system_info": {
    "n_atoms": 45000,
    "n_waters": 12000,
    "n_ions": { "NA": 45, "CL": 40 },
    "box_size_nm": [8.0, 8.0, 8.0]
  }
}
```

## Progress Tracking

Progress is emitted to stderr with `MD_PROGRESS:` prefix:

| Progress | Stage | Description |
|----------|-------|-------------|
| 0-10% | Preparation | Ligand and system setup |
| 10-20% | Minimization | Energy minimization |
| 20-50% | NVT | NVT equilibration |
| 50-90% | NPT | NPT equilibration |
| 90-100% | Finalization | Output generation |

Completed stages tracked:
- `preparation`
- `minimization`
- `nvt_equilibration`
- `npt_equilibration`
- `trajectory_processing`

## Force Fields

### Protein Force Fields
| Force Field | Description |
|-------------|-------------|
| `amber14-all` | AMBER14 (recommended) |
| `amber99sbildn` | AMBER99SB-ILDN |
| `charmm36` | CHARMM36 |

### Ligand Force Fields
| Force Field | Description |
|-------------|-------------|
| `gaff-2.11` | GAFF2 (recommended) |
| `openff-2.0.0` | OpenFF Sage |
| `openff-2.1.0` | OpenFF Sage 2.1 |

### Water Models
| Model | Description |
|-------|-------------|
| `tip3p` | TIP3P (default) |
| `tip4pew` | TIP4P-Ew |
| `spce` | SPC/E |

## Output Files

Generated in `data/md_outputs/{job_id}/`:

| File | Description |
|------|-------------|
| `input.pdb` | Original input structure |
| `prepared_ligand.sdf` | Prepared ligand with charges |
| `solvated.pdb` | Solvated system |
| `minimized.pdb` | After minimization |
| `nvt_equilibrated.pdb` | After NVT |
| `npt_equilibrated.pdb` | After NPT |
| `final.pdb` | Final equilibrated structure |
| `trajectory.dcd` | Trajectory (if production) |
| `system.xml` | Serialized OpenMM system |

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Failed to parameterize ligand` | Unsupported chemistry | Check ligand valence |
| `No CUDA device` | GPU unavailable | Check GPU allocation |
| `Minimization failed` | Bad geometry | Check input structure |
| `NaN in simulation` | Unstable system | Reduce timestep |
| `Box too small` | Ligand extends beyond box | Increase box_padding |

## Element Handling

Special handling for two-letter elements:
- Bromine (Br) vs Boron (B)
- Chlorine (Cl) vs Carbon (C)
- Phosphorus atoms (PA, PB in nucleotides)

## Deployment

```bash
# Rebuild worker
docker compose build --no-cache worker-gpu-short

# Restart
docker compose up -d worker-gpu-short

# Check logs
docker compose logs -f worker-gpu-short
```

## Integration with Other Services

### From Docking
Docked poses can be sent directly to MD optimization:
1. Docking result contains `poses_pdb`
2. Frontend extracts best pose
3. Submits to MD with protein + ligand pose

### To ABFE
MD-optimized structures are ideal for ABFE:
1. MD produces equilibrated complex
2. Coordinates used as starting point
3. Reduces equilibration time in ABFE

## Related

- [SERVICES_OVERVIEW.md](./SERVICES_OVERVIEW.md) - Architecture overview
- [ABFE_SERVICE.md](./ABFE_SERVICE.md) - Uses MD-optimized structures
- [DOCKING_SERVICE.md](./DOCKING_SERVICE.md) - Provides input poses
