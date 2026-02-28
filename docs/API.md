# Ligand-X API Reference

All requests go through the **API Gateway** on port `8000`. Backend microservices are not directly accessible from outside Docker.

**Base URL:** `http://localhost:8000`

---

## Table of Contents

1. [Routing Architecture](#routing-architecture)
2. [Unified Job System](#unified-job-system)
3. [WebSocket](#websocket)
4. [Structure Service](#structure-service)
5. [Docking Service](#docking-service)
6. [MD Simulation Service](#md-simulation-service)
7. [ADMET Prediction Service](#admet-prediction-service)
8. [Boltz-2 Binding Affinity Service](#boltz-2-binding-affinity-service)
9. [Quantum Chemistry Service](#quantum-chemistry-service)
10. [Protein Alignment Service](#protein-alignment-service)
11. [ABFE Service](#abfe-service)
12. [RBFE Service](#rbfe-service)
13. [Health Endpoints](#health-endpoints)
14. [Timeout Reference](#timeout-reference)

---

## Routing Architecture

The gateway proxies all `/api/{service}/...` paths to the corresponding backend service:

| Prefix | Service | Internal Port |
|--------|---------|--------------|
| `/api/structure/*` | Structure | 8001 |
| `/api/molecules/*` | Structure | 8001 |
| `/api/library/*` | Structure | 8001 |
| `/api/docking/*` | Docking | 8002 |
| `/api/md/*` | MD Simulation | 8003 |
| `/api/admet/*` | ADMET | 8004 |
| `/api/boltz2/*` | Boltz-2 | 8005 |
| `/api/qc/*` | Quantum Chemistry | 8006 |
| `/api/alignment/*` | Alignment | 8007 |
| `/api/ketcher/*` | Ketcher Editor | 8008 |
| `/api/abfe/*` | ABFE | 8010 |
| `/api/rbfe/*` | RBFE | 8011 |

Job management (`/api/jobs/*`) is handled directly by the gateway.

---

## Unified Job System

Long-running computations (docking, MD, Boltz-2, QC, ABFE, RBFE) go through the unified job system. Jobs are persisted in PostgreSQL and executed by Celery workers.

### Submit a Job

```
POST /api/jobs/submit/{job_type}
```

**job_type values:** `docking`, `docking_batch`, `md`, `boltz2`, `qc`, `admet`, `abfe`, `rbfe`

The request body varies by job type and is forwarded to the appropriate Celery task.

**Response:**
```json
{
  "job_id": "abc123",
  "status": "submitted",
  "stream_url": "/api/jobs/stream/abc123"
}
```

---

### Stream Job Progress (SSE)

```
GET /api/jobs/stream/{job_id}
```

Returns a Server-Sent Events stream. Each event is a JSON object:

```json
{
  "job_id": "abc123",
  "status": "running",
  "progress": 45,
  "message": "Running NVT equilibration...",
  "stage": "nvt"
}
```

**Status values:** `submitted` → `running` → `completed` / `failed` / `cancelled`

Special statuses: `preview_ready` (MD preview checkpoint), `docking_ready` (docking checkpoint)

---

### Get Job Details

```
GET /api/jobs/{job_id}
```

**Response:**
```json
{
  "id": "abc123",
  "job_type": "md",
  "status": "completed",
  "progress": 100,
  "result": { ... },
  "error": null,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T01:00:00Z"
}
```

---

### List Jobs

```
GET /api/jobs/list?limit=50&offset=0&status=running&job_type=md
```

**Query parameters:** `limit`, `offset`, `status`, `job_type` (all optional)

**Response:** `{ "jobs": [...], "total": 123 }`

---

### Cancel / Delete a Job

```
POST /api/jobs/{job_id}/cancel
DELETE /api/jobs/{job_id}
```

---

### Resume MD Job from Preview

```
POST /api/jobs/resume/md/{job_id}
```

Resumes an MD job that paused at the `preview_ready` checkpoint (30%). The same `job_id` is reused; progress continues from 30%.

**Response:** `{ "job_id": "abc123", "status": "running", "progress": 30 }`

---

## WebSocket

Connect for real-time job updates via Redis pub/sub.

```
WS /api/jobs/ws
```

### Client → Server Messages

```json
{ "type": "subscribe",   "job_ids": ["id1", "id2"] }
{ "type": "unsubscribe", "job_ids": ["id1"] }
{ "type": "ping" }
{ "type": "get_stats" }
```

### Server → Client Messages

```json
{ "type": "connected", "client_id": "...", "message": "..." }
{ "type": "pong" }
{ "type": "subscribed", "count": 2 }
{ "type": "stats", "active_connections": 5 }

// Job update (same shape as SSE events):
{ "job_id": "abc123", "status": "running", "progress": 60, "message": "..." }
```

### Monitoring Endpoints

```
GET /api/jobs/ws/stats    — Connection statistics
GET /api/jobs/ws/health   — Health check with Redis status
```

---

## Structure Service

### Protein / Structure Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/structure/fetch_pdb` | Fetch structure from RCSB PDB by ID |
| POST | `/api/structure/fetch_hetid` | Fetch structure by ligand HET ID |
| POST | `/api/structure/upload_structure` | Upload a PDB, mmCIF, or SDF file |
| POST | `/api/structure/process_pdb` | Parse PDB and extract protein/ligand components |
| POST | `/api/structure/combine_protein_ligand` | Merge separate protein and ligand PDB strings |
| POST | `/api/structure/clean_protein_staged` | Remove waters/HETATM, add hydrogens, fix residues |
| POST | `/api/structure/extract_ligand_by_hetid` | Extract a specific ligand from a complex |
| POST | `/api/structure/validate_structure` | Validate structure for a target service |

**Example — Fetch PDB:**
```json
POST /api/structure/fetch_pdb
{ "pdb_id": "1HSG" }
```

**Example — Clean protein:**
```json
POST /api/structure/clean_protein_staged
{
  "pdb_data": "ATOM ...",
  "remove_waters": true,
  "remove_hetatm": true,
  "add_hydrogens": true,
  "ph": 7.4
}
```

---

### Ligand Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/structure/upload_smiles` | Parse SMILES and return 2D image + metadata |
| POST | `/api/structure/smiles_to_3d` | Generate 3D coordinates from SMILES |
| POST | `/api/structure/smiles_to_mol` | Convert SMILES to MOL file |
| POST | `/api/structure/download_sdf` | Convert PDB ligand to SDF |
| POST | `/api/structure/save_edited_molecule` | Save Ketcher-edited molecule and generate 2D image |
| GET  | `/api/structure/render_smiles?smiles=...` | Return 2D PNG of SMILES string |
| GET  | `/api/structure/get_ligands` | List all saved/edited ligands |

---

### Molecule Library

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/molecules` | List all saved molecules |
| GET    | `/api/molecules/{id}` | Get molecule by ID |
| POST   | `/api/molecules` | Save a molecule to the library |
| PUT    | `/api/molecules/{id}` | Update a molecule |
| DELETE | `/api/molecules/{id}` | Delete a molecule |
| POST   | `/api/molecules/save_structure` | Save a PDB structure as a named molecule |
| POST   | `/api/library/save-molecule` | Alternative save endpoint |

---

## Docking Service

### Single Ligand Docking

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/docking/prepare_docking` | Prepare receptor and ligand as PDBQT |
| POST | `/api/docking/run_docking` | Run AutoDock Vina with prepared inputs |
| POST | `/api/docking/dock_protein_ligand` | Full workflow: prepare + dock in one call |
| POST | `/api/docking/stream_dock_protein_ligand` | Full workflow with SSE progress stream |
| POST | `/api/docking/calculate_grid_box` | Calculate docking box around a binding site |
| POST | `/api/docking/calculate_whole_protein_grid_box` | Grid box covering the entire protein |
| POST | `/api/docking/validate_redocking` | Re-dock co-crystallized ligand for validation |

**Example — Dock protein + ligand:**
```json
POST /api/docking/dock_protein_ligand
{
  "protein_pdb_data": "ATOM ...",
  "ligand_pdb_data": "HETATM ...",
  "center_x": 10.0, "center_y": 5.0, "center_z": -3.0,
  "size_x": 20.0,   "size_y": 20.0,  "size_z": 20.0,
  "exhaustiveness": 8,
  "num_modes": 9
}
```

---

### Batch Docking

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/docking/batch_dock_protein_ligands` | Dock multiple ligands with SSE streaming |
| POST | `/api/docking/batch` | Synchronous batch docking |
| GET  | `/api/docking/batch/status/{job_id}` | Check batch job status |
| POST | `/api/docking/submit_batch_async` | Submit batch as a Celery job |

---

### Job Management (Docking-specific)

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/docking/jobs` | List docking jobs |
| GET    | `/api/docking/jobs/{job_id}` | Get job details |
| DELETE | `/api/docking/jobs/{job_id}` | Delete job |
| POST   | `/api/docking/jobs/{job_id}/cancel` | Cancel running job |

---

## MD Simulation Service

Submit via the unified job system (`POST /api/jobs/submit/md`) or directly:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/md/optimize` | Submit an MD optimization job |
| POST | `/api/md/optimize_preview` | Submit with preview checkpoint at 30% |

### Request Parameters

```json
{
  "protein_pdb_data": "ATOM ...",
  "ligand_structure_data": "HETATM ...",   // PDB format (optional)
  "ligand_smiles": "CC(=O)Oc1ccccc1C(=O)O", // SMILES (optional, alternative to above)
  "nvt_steps": 25000,
  "npt_steps": 175000,
  "temperature": 300.0,
  "pressure": 1.0,
  "ionic_strength": 0.15,
  "charge_method": "am1bcc",
  "forcefield_method": "openff-2.2.0",
  "preview_before_equilibration": false,
  "pause_at_minimized": false,
  "production_steps": 0
}
```

**Preview workflow:** Set `preview_before_equilibration: true` to pause after system preparation (progress = 30%). Inspect the prepared system in the viewer, then call `POST /api/jobs/resume/md/{job_id}` to continue.

---

### MD Job Management

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/md/jobs` | List MD jobs |
| GET  | `/api/md/jobs/{job_id}` | Get job details |
| POST | `/api/md/jobs/{job_id}/cancel` | Cancel job |

---

## ADMET Prediction Service

### Predict Properties

```
POST /api/admet/predict
```

**Request:**
```json
{
  "smiles": "CC(=O)Oc1ccccc1C(=O)O",
  "smiles_list": ["smiles1", "smiles2"],
  "pdb_data": "HETATM ..."
}
```

Provide one of `smiles`, `smiles_list`, or `pdb_data`.

**Response:**
```json
{
  "Physicochemical": {
    "Molecular Weight": "180.16",
    "LogP": "1.19",
    "Hydrogen Bond Acceptors": 3,
    "Hydrogen Bond Donors": 1,
    "Lipinski Rule of 5 Violations": 0,
    "QED": "0.55",
    "TPSA": "63.60"
  },
  "Absorption": { "Caco-2 Permeability": "...", "HIA": "...", "Bioavailability": "..." },
  "Distribution": { "BBB Penetration": "...", "VDss": "...", "PPB": "..." },
  "Metabolism": { "CYP3A4 Inhibitor": "...", "CYP2D6 Substrate": "...", "... ": "..." },
  "Toxicity": { "hERG Inhibition": "...", "AMES": "...", "... ": "..." },
  "_metadata": {
    "canonical_smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "cached": false
  }
}
```

---

### Result Cache

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/admet/results` | List all cached prediction results |
| GET    | `/api/admet/results/{smiles}` | Get cached result for a SMILES string |
| DELETE | `/api/admet/results/{result_id}` | Delete a cached result |

---

## Boltz-2 Binding Affinity Service

Requires GPU. Submit via unified job system (`POST /api/jobs/submit/boltz2`) or directly:

### Single Prediction

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/boltz2/predict` | Run Boltz-2 structure/affinity prediction |
| POST | `/api/boltz2/stream_predict` | Streaming version with SSE progress |
| POST | `/api/boltz2/submit_async` | Submit as a Celery task |
| POST | `/api/boltz2/validate` | Validate input structures before submission |

**Request:**
```json
{
  "protein_pdb_data": "ATOM ...",
  "ligand_data": "CC(=O)Oc1ccccc1C(=O)O",
  "num_poses": 5,
  "accelerator": "gpu",
  "generate_msa": false,
  "msa_sequence_hash": "abc123",
  "msa_method": "mmseqs2_server"
}
```

---

### Batch Screening

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/boltz2/batch_predict` | Screen multiple ligands against one protein |
| GET  | `/api/boltz2/batch/{batch_id}` | Get batch status |

---

### Job Management

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/boltz2/status` | Check GPU availability |
| GET    | `/api/boltz2/jobs` | List jobs |
| GET    | `/api/boltz2/jobs/{job_id}` | Get job details |
| GET    | `/api/boltz2/jobs/{job_id}/poses/{pose_index}/pae` | Get PAE matrix for a pose |
| DELETE | `/api/boltz2/jobs/{job_id}` | Delete job |
| POST   | `/api/boltz2/jobs/{job_id}/cancel` | Cancel job |

---

## Quantum Chemistry Service

Requires ORCA binary configured via `ORCA_HOST_PATH`. Submit via unified job system (`POST /api/jobs/submit/qc`) or directly:

### Job Submission

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/qc/jobs` | Submit geometry optimization or SP calculation |
| POST | `/api/qc/jobs/fukui` | Submit Fukui indices calculation |
| POST | `/api/qc/jobs/conformer` | Submit conformer search |
| POST | `/api/qc/jobs/ir` | Submit IR spectrum calculation |
| POST | `/api/qc/preview` | Preview the generated ORCA input file |

**Request:**
```json
{
  "molecule_xyz": "5\n\nC  0.000  0.000  0.000\n...",
  "molecule_name": "aspirin",
  "charge": 0,
  "multiplicity": 1,
  "job_type": "OPT",
  "method": "B3LYP",
  "basis_set": "def2-SVP",
  "solvation": "CPCM",
  "dispersion": "D3BJ",
  "freq_scale_factor": 0.970
}
```

**job_type values:** `OPT`, `FREQ`, `OPT_FREQ`, `SP`

---

### Results & Files

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/qc/jobs` | List all QC jobs |
| GET | `/api/qc/jobs/status/{job_id}` | Get job status |
| GET | `/api/qc/jobs/results/{job_id}` | Get parsed calculation results |
| GET | `/api/qc/jobs/files/{job_id}` | List output files |
| GET | `/api/qc/jobs/files/{job_id}/{filename}` | Download a specific file |
| DELETE | `/api/qc/jobs/{job_id}` | Cancel/delete job |

---

### Advanced Analysis

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/qc/jobs/normal-modes/{job_id}` | Get vibrational frequencies and normal modes |
| POST | `/api/qc/jobs/mode-trajectory/{job_id}` | Generate a trajectory for a vibrational mode |
| GET  | `/api/qc/jobs/mo-data/{job_id}` | Get molecular orbital data |

---

### Utilities

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/qc/presets` | List available method/basis-set presets |
| POST | `/api/qc/add-hydrogens` | Add hydrogens to an XYZ structure |
| GET  | `/api/qc/system-info` | System capabilities (CPU cores, memory) |

---

## Protein Alignment Service

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/alignment/pairwise` | Align two structures (reference + mobile) |
| POST | `/api/alignment/multi_pose` | Align multiple poses to a reference |
| GET  | `/api/alignment/status` | Service status |

**Pairwise request:**
```json
{
  "reference_structure": "ATOM ...",
  "mobile_structure": "ATOM ...",
  "reference_format": "auto",
  "mobile_format": "auto",
  "chain_id": "A",
  "atom_types": ["CA"],
  "use_iterative_pruning": true,
  "rmsd_cutoff": 4.0,
  "max_iterations": 5
}
```

---

## ABFE Service

Absolute Binding Free Energy calculations. Requires GPU.

### Calculation Submission

```
POST /api/abfe/calculate    (multipart/form-data)
POST /api/abfe/submit_async (JSON)
```

**Multipart form-data fields:**
- `protein_pdb` — PDB file upload
- `ligand_sdf` — SDF file upload
- `ligand_id` — string, default `"ligand"`
- `protein_id` — string, default `"protein"`
- `simulation_settings` — JSON string (optional)

**JSON body (`submit_async`):**
```json
{
  "protein_pdb_data": "ATOM ...",
  "ligand_sdf_data": "...",
  "ligand_id": "ligand",
  "protein_id": "protein",
  "simulation_settings": {}
}
```

---

### Job Status & Results

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/abfe/jobs` | List all jobs |
| GET | `/api/abfe/status/{job_id}` | Get job status |
| GET | `/api/abfe/results/{job_id}` | Get ΔG results |
| GET | `/api/abfe/detailed-analysis/{job_id}` | Detailed analysis data |
| GET | `/api/abfe/parse-results/{job_id}` | Parse ΔG from output files |
| DELETE | `/api/abfe/jobs/{job_id}` | Delete job |
| POST | `/api/abfe/jobs/{job_id}/cancel` | Cancel job |

---

### File Access

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/abfe/files/{job_id}` | List output files |
| GET | `/api/abfe/files/{job_id}/{filename:path}` | Download a file |
| GET | `/api/abfe/logs/{job_id}` | Get all log files |
| GET | `/api/abfe/console-log/{job_id}` | Get main console log |
| GET | `/api/abfe/download-log/{job_id}` | Download combined log archive |
| GET | `/api/abfe/details/{job_id}` | Full job details |

---

## RBFE Service

Relative Binding Free Energy calculations. Requires GPU.

### Calculation Submission

```
POST /api/rbfe/calculate    (multipart/form-data)
POST /api/rbfe/submit_async (JSON)
```

**Request parameters:**
```json
{
  "protein_pdb": "ATOM ...",
  "ligands": [
    {
      "id": "lig1",
      "data": "...",
      "format": "sdf",
      "has_docked_pose": true,
      "docking_affinity": -8.5
    }
  ],
  "protein_id": "protein",
  "network_topology": "mst",
  "central_ligand": null,
  "atom_mapper": "kartograf",
  "atom_map_hydrogens": true,
  "lomap_max3d": 1.0,
  "simulation_settings": {
    "robust_mode": false,
    "fast_mode": false,
    "equilibration_length_ns": 0.5,
    "production_length_ns": 1.0
  }
}
```

**network_topology:** `mst` (minimum spanning tree), `radial`, `maximal`

**atom_mapper:** `kartograf` (geometry-based, default), `lomap` (2D MCS), `lomap_relaxed`

> **Note on Kartograf:** Requires rotationally aligned ligands. Docked poses are used as-is; RDKit-generated structures are auto-aligned via MCS before network creation.

---

### Job Status & Results

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rbfe/jobs` | List all jobs |
| GET | `/api/rbfe/status/{job_id}` | Get job status |
| GET | `/api/rbfe/results/{job_id}` | Get ΔΔG results |
| DELETE | `/api/rbfe/jobs/{job_id}` | Delete job |
| POST | `/api/rbfe/jobs/{job_id}/cancel` | Cancel job |

---

### File Access

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rbfe/files/{job_id}` | List output files |
| GET | `/api/rbfe/files/{job_id}/{filename:path}` | Download a file |
| GET | `/api/rbfe/logs/{job_id}` | Get log files |
| GET | `/api/rbfe/console-log/{job_id}` | Get console output |

---

## Health Endpoints

Every service exposes:

```
GET /health
```

**Response:** `{ "status": "ok", "service": "<name>" }`

| Service | URL |
|---------|-----|
| Gateway | `http://localhost:8000/health` |
| Structure | `http://localhost:8001/health` |
| Docking | `http://localhost:8002/health` |
| MD | `http://localhost:8003/health` |
| ADMET | `http://localhost:8004/health` |
| Boltz-2 | `http://localhost:8005/health` |
| QC | `http://localhost:8006/health` |
| Alignment | `http://localhost:8007/health` |
| ABFE | `http://localhost:8010/health` |
| RBFE | `http://localhost:8011/health` |

Check all at once: `curl http://localhost:8000/health`

---

## Timeout Reference

| Operation | Timeout |
|-----------|---------|
| Default | 5 min |
| Protein cleaning | 2 min |
| Docking, Boltz-2 | 30 min |
| MD, ABFE, RBFE | 60 min |

---

## Celery Queue Architecture

Jobs are dispatched to specialized workers:

| Queue | Worker | Used By |
|-------|--------|---------|
| `cpu` | `worker-cpu` | Batch docking |
| `gpu-short` | `worker-gpu-short` | MD, Boltz-2, ADMET |
| `gpu-long` | `worker-gpu-long` | ABFE, RBFE |
| `qc` | `worker-qc` | Quantum chemistry |
