# RBFE Optional Docking Workflow — Design Spec

**Date:** 2026-03-31  
**Status:** Approved  
**Branch:** feature/rbfe-improvements

---

## Context

Every RBFE calculation requires a reference ligand with a known 3D pose in the binding
pocket. Kartograf (the default atom mapper) is geometry-based and performs best when all
ligands are rotationally aligned to a reference docked pose. Without a reference pose,
RDKit-generated 3D coordinates are in arbitrary orientations, producing poor atom
mappings.

The codebase has a sophisticated but dead `docking_ready` checkpoint skeleton: the
gateway SSE handler, PostgreSQL state machine, resume endpoint, and the full frontend
`DockedPosesPreview` component are all wired. The backend service never emits
`docking_ready`, and the Celery task ignores the `docking_acknowledged` flag. This spec
describes what needs to be built to complete the feature.

---

## Goals

1. Gate RBFE job submission behind a reference ligand pose selection step.
2. Support three pose sources: co-crystal HETATM from the loaded PDB, in-tool Vina
   docking, or import from a prior completed Vina docking job.
3. At ~15% progress, pause and show all aligned poses for user review before committing
   to the expensive FE calculations.
4. Resume cleanly from the checkpoint using the existing gateway resume endpoint.

---

## Wizard Step Structure (new)

| Step | Title | Gate condition |
|------|-------|---------------|
| 1 | Select Ligands | ≥2 ligands selected, valid protein loaded |
| 2 *(new)* | Reference Pose Setup | `referenceLigandId` set AND pose source confirmed |
| 3 (was 2) | Atom Mapper | (optional preview) |
| 4 (was 3) | Network Topology | topology selected |
| 5 (was 4) | Simulation Settings | — |
| 6 (was 5) | Submit | — |
| 7 | Results / Checkpoint | — |

---

## Step 2 UI — Reference Pose Setup

**Component:** `frontend/src/components/Tools/RBFE/RBFEReferenceSetup.tsx` (new)

### Panel A — Reference Ligand Picker
A list of all selected ligands with a single-select control. Selecting one expands
Panel B. The selected ligand is highlighted (e.g. amber border).

`canProceed` is blocked until both panels are satisfied.

### Panel B — Pose Source (three tabs)

**Tab 1: Co-crystal from PDB**
- Calls `GET /api/structure/extract-hetatm/{structure_id}` on tab open.
- Returns list of HETATM residues `[{residue_name, chain_id, pdb_string}]`.
- User selects one from a dropdown → `referencePosePdb` is set.
- If no HETATM found: show "No bound ligands found in this structure."

**Tab 2: Dock with Vina**
- No upfront action; docking runs as Phase 1 of the RBFE job.
- Shows exhaustiveness slider (4–16, default 8).
- `referencePosePdb` remains null; the service docks on the fly.
- Text: "Vina will dock the reference ligand at the start of the RBFE job."

**Tab 3: Import from prior docking job**
- Calls `GET /api/jobs?job_type=docking&status=completed` (existing endpoint, filtered).
- Displays a table: protein name, ligand name, best score, date.
- User selects one row → frontend fetches `GET /api/docking/files/{job_id}/best_pose.pdb`
  and stores the PDB string in `referencePosePdb`.

---

## Frontend State Changes

**`frontend/src/store/rbfe-store.ts`** — new fields:

```typescript
referenceLigandId: string | null        // which ligand is the reference
referencePoseSource: 'cocrystal' | 'vina' | 'prior_job' | null
referencePosePdb: string | null         // PDB text for cocrystal / prior_job sources
vinaExhaustiveness: number              // default 8 (only used when source === 'vina')
```

All fields cleared in `resetState()`.

**`frontend/src/components/Tools/RBFETool.tsx`** — changes:

- `case 2`: render `<RBFEReferenceSetup>` (new)
- `case 3` through `case 6`: shift all existing cases up by 1
- `canProceed` case 2:
  ```typescript
  return (
    rbfeStore.referenceLigandId !== null &&
    rbfeStore.referencePoseSource !== null &&
    (rbfeStore.referencePoseSource === 'vina' || rbfeStore.referencePosePdb !== null)
  )
  ```
- Remove the `// Docking is optional` comment from old case 2.
- Update `rbfeStore.setStep(6)` calls (docking_ready restore) → `setStep(7)`.

**`frontend/src/lib/api-client.ts`** — new methods:

```typescript
// Extract HETATM ligands from a loaded PDB structure
extractCocrystalLigands(structureId: string): Promise<{
  residue_name: string
  chain_id: string
  pdb_string: string
}[]>

// (Existing) getDockingJobs — filter by job_type=docking, status=completed
```

---

## Backend Changes

### 1. New endpoint: `GET /api/structure/extract-hetatm/{structure_id}`

**File:** `services/structure/routers.py`  
**Service logic:** `services/structure/service.py`

Parse the cached PDB for the given `structure_id`. Extract all HETATM residues
(excluding water: HOH, WAT, DOD). Return each unique residue as:
```json
[{"residue_name": "LIG", "chain_id": "A", "pdb_string": "ATOM ...\nATOM ..."}]
```

Use `lib/chemistry/parsers/` to parse the PDB — do not parse raw text in the router.

### 2. New params accepted by `services/rbfe/service.py`

In `run_rbfe_calculation(job_data)`, extract at top of function:

```python
reference_ligand_id: str = job_data['reference_ligand_id']
reference_pose_source: str = job_data['reference_pose_source']  # cocrystal|vina|prior_job
reference_pose_pdb: str | None = job_data.get('reference_pose_pdb')
vina_exhaustiveness: int = job_data.get('vina_exhaustiveness', 8)
docking_acknowledged: bool = job_data.get('docking_acknowledged', False)
```

### 3. New Phase 1 in `run_rbfe_calculation()` (~lines 1795–1870)

Insert before the existing ligand preparation block:

```python
if not docking_acknowledged:
    # --- Phase 1: Reference Pose Acquisition ---
    emit_progress(5, 'preparing', message='Acquiring reference pose...')

    if reference_pose_source in ('cocrystal', 'prior_job'):
        # pose provided by frontend as PDB string
        reference_pose = load_reference_from_pdb_string(reference_pose_pdb, reference_ligand_id)
    elif reference_pose_source == 'vina':
        # dock the reference ligand only
        reference_ligand = get_ligand_by_id(all_ligands, reference_ligand_id)
        reference_pose = dock_single_ligand_via_vina(
            reference_ligand, protein, exhaustiveness=vina_exhaustiveness
        )
        emit_progress(10, 'preparing', message='Reference ligand docked.')

    # MCS-align all other ligands to the reference pose
    emit_progress(12, 'preparing', message='Aligning ligands to reference pose...')
    aligned_ligands = mcs_align_to_reference(all_ligands, reference_pose, reference_ligand_id)

    # Generate complex PDB files for the 3D viewer
    generate_docked_pose_files(job_id, protein, reference_pose, aligned_ligands)

    # Build docked_poses payload
    docked_poses = build_docked_poses_payload(aligned_ligands, reference_ligand_id)

    # Emit checkpoint — gateway saves to DB, frontend pauses
    emit_progress(15, 'docking_ready', result={'docked_poses': docked_poses})
    return  # service exits; gateway handles state persistence

else:
    # Resume path: load previously generated aligned poses from disk
    aligned_ligands = load_aligned_poses_from_disk(job_id)
```

**Helper functions to implement in `service.py`:**

| Function | Description |
|----------|-------------|
| `load_reference_from_pdb_string(pdb, ligand_id)` | Parse PDB string into an OpenFE SmallMolecule with 3D coords |
| `dock_single_ligand_via_vina(ligand, protein, exhaustiveness)` | Call existing `dock_ligands_batch()` with single ligand; extract best pose |
| `mcs_align_to_reference(ligands, reference_pose, reference_id)` | MCS-based constrained embedding for non-reference ligands (existing pattern at lines 764–885) |
| `generate_docked_pose_files(job_id, protein, reference, aligned)` | Save complex PDBs to `data/rbfe_outputs/{job_id}/docked_poses/` (existing dead code at lines 468–600) |
| `build_docked_poses_payload(ligands, reference_id)` | Build list of `{ligand_id, ligand_name, rmsd, mcs_atoms, complex_pdb}` dicts |
| `load_aligned_poses_from_disk(job_id)` | Deserialize saved OpenFE SmallMolecule objects from `docked_poses/` directory |

### 4. No changes needed in:
- `lib/tasks/gpu_tasks.py` — already passes all params through to the service
- `gateway/routers/jobs.py` — resume endpoint already resubmits with `docking_acknowledged=True`
- Frontend `handleContinueAfterDocking()` — already calls the correct endpoint
- Frontend `DockedPosesPreview` — already consumes `docked_poses` payload

---

## `docked_poses` Payload Schema

```python
{
  "ligand_id": str,
  "ligand_name": str,
  "rmsd": float,           # RMSD of MCS atoms vs reference; 0.0 for reference itself
  "mcs_atoms": int,        # number of MCS heavy atoms used for alignment
  "complex_pdb": str       # relative path: "docked_poses/{ligand_id}_complex.pdb"
}
```

This matches exactly what `DockedPosesPreview` already renders (RMSD column, MCS atom count, quality badge thresholds: <1Å=Excellent, <2Å=Good, <3Å=Moderate, ≥3Å=Poor).

---

## Checkpoint State Machine (unchanged)

The existing gateway state machine is used without modification:

```
Celery task emits docking_ready
    ↓
Gateway SSE handler detects inner_status='docking_ready'
    ↓
DB: status='running', stage='docking_ready', progress=15, result={docked_poses:[...]}
    ↓
Frontend: polling stops, DockedPosesPreview shown, Continue button enabled
    ↓
User clicks Continue → POST /api/jobs/resume/rbfe/{job_id}
    ↓
Gateway: adds docking_acknowledged=True, resubmits Celery task with same job_id
    ↓
Service: Phase 1 skipped, loads saved poses, continues with RBFE calculations
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Vina docking fails (Phase 1) | Job status → `failed`; user retries with higher exhaustiveness or switches to LOMAP mapper |
| No HETATM in PDB (co-crystal tab) | Tab shows "No bound ligands found" info box; user selects another source |
| MCS alignment produces RMSD > 3Å for most ligands | User sees Poor quality badges in `DockedPosesPreview`; informed decision, not blocked |
| Resume endpoint called when stage ≠ docking_ready | Gateway returns 400; frontend shows error, restores `docking_ready` status |
| `load_aligned_poses_from_disk` fails on resume | Job fails with clear error message; original poses may need to be regenerated |

---

## Files Modified

| File | Change |
|------|--------|
| `services/rbfe/service.py` | Add Phase 1 docking/alignment block; implement 6 helper functions; wire `generate_docked_pose_files()` and `prepare_ligands_with_docking()` dead code |
| `services/structure/routers.py` | Add `GET /extract-hetatm/{structure_id}` route |
| `services/structure/service.py` | Add `extract_hetatm_ligands(structure_id)` method |
| `frontend/src/components/Tools/RBFE/RBFEReferenceSetup.tsx` | New component (step 2) |
| `frontend/src/components/Tools/RBFETool.tsx` | Insert case 2, renumber 3–6, update setStep(7), update canProceed |
| `frontend/src/store/rbfe-store.ts` | Add 4 new state fields and setters; update resetState |
| `frontend/src/lib/api-client.ts` | Add `extractCocrystalLigands()` method |
| `frontend/src/types/rbfe-types.ts` | Add `reference_ligand_id`, `reference_pose_source`, `reference_pose_pdb`, `vina_exhaustiveness` to `RBFEParameters` |

---

## Verification

1. **Co-crystal path**: Load a PDB with a bound ligand (e.g. 1ATP). Add 2–3 similar ligands. Step 2: select a ligand, pick "Co-crystal", confirm. Submit. At ~15% progress, DockedPosesPreview appears showing RMSD scores for all ligands. Click Continue. RBFE runs to completion.

2. **Vina path**: Same setup but pick "Dock with Vina". Submit. Watch for docking progress (5% → 10%) then checkpoint at 15%. Continue. Verify RBFE completes.

3. **Prior job path**: Run a Vina docking job first. Then in RBFE setup, step 2 → Import from prior job. Select the job. Verify the reference pose PDB is loaded. Submit, checkpoint appears.

4. **Resume integrity**: At the checkpoint, refresh the page. Verify the job is restored to `docking_ready` state (step 7, DockedPosesPreview shown). Click Continue — same job_id persists, progress continues from 15%.

5. **canProceed gate**: In step 2, verify "Next" is disabled until both a reference ligand AND a valid pose source are selected.
