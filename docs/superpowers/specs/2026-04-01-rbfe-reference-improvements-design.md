# RBFE Reference Setup Improvements

**Date:** 2026-04-01  
**Branch:** feature/rbfe-improvements

---

## Context

Four related issues in the RBFE reference setup flow (Step 2) and network preview (Step 3):

1. **Radial network central ligand** — doesn't default to the selected reference ligand, so the network preview shows an arbitrary first ligand at center even when the user just picked a reference.
2. **Vina docking missing grid box** — "Dock with Vina" defers docking to the RBFE job with no binding site control. Users need to specify a grid box (manual or fpocket-detected).
3. **Import from job is broken** — `handleSelectPriorJob` looks for `result.best_pose_pdb` which doesn't exist in the actual docking result stored in PostgreSQL. Actual field is `result.poses_pdb` (multi-model PDB, best pose first).
4. **Job list not filtered by SMILES** — "Import from job" shows all completed docking jobs regardless of ligand, so users can accidentally pick a job for the wrong molecule.

---

## Design

### 1. Radial Network Central Ligand Default

**File:** `frontend/src/components/Tools/RBFETool.tsx`

Add a `useEffect` that watches `currentStep`. When the user enters step 3 and topology is `radial` and `centralLigand` is `null` and `referenceLigandId` is set, call `rbfeStore.setCentralLigand(rbfeStore.referenceLigandId)`.

```ts
useEffect(() => {
  if (
    rbfeStore.currentStep === 3 &&
    rbfeStore.networkTopology === 'radial' &&
    rbfeStore.centralLigand === null &&
    rbfeStore.referenceLigandId !== null
  ) {
    rbfeStore.setCentralLigand(rbfeStore.referenceLigandId)
  }
}, [rbfeStore.currentStep])
```

The user can still override it via the SelectParameter dropdown.

---

### 2. Vina Docking Grid Box / fpocket

#### Frontend

**`frontend/src/store/rbfe-store.ts`**
- Add `vinaGridBox: GridBox | null` state (GridBox = `{center_x, center_y, center_z, size_x, size_y, size_z}`)
- Add `setVinaGridBox(box: GridBox | null)` action

**`frontend/src/components/Tools/RBFE/RBFEReferenceSetup.tsx`**  
Extend the Vina tab to show two modes (collapsible `ParameterSection`):

**Mode A — fpocket detection** (reuse `DockingPocketFinder` from `Tools/Docking/`)  
- Shows "Detect Pockets" button → calls `api.findPockets(currentStructure.pdb_data)`  
- Lists detected pockets with score, druggability, volume  
- Clicking a pocket sets `vinaGridBox` from its center/size  
- Selected pocket is highlighted

**Mode B — Manual grid box** (shown when pocket not yet selected or user toggles)  
- Six numeric inputs: Center X/Y/Z, Size X/Y/Z  
- Pre-populated from fpocket selection or left blank for manual entry

**`frontend/src/components/Tools/RBFETool.tsx` (runRBFE)**  
Pass `vina_grid_box: rbfeStore.vinaGridBox` in `simulation_settings`.

#### Backend

**`services/rbfe/service.py`**

Update `_dock_single_ligand_via_vina` signature:
```python
def _dock_single_ligand_via_vina(
    self,
    protein_pdb: str,
    ligand_id: str,
    ligand_data: str,
    ligand_format: str,
    exhaustiveness: int = 8,
    grid_box: Optional[Dict[str, Any]] = None,   # NEW
) -> Optional[Dict[str, Any]]:
```
Pass `grid_box` into the docking service call payload.

Update the calling site (around line 2097) to read from `simulation_settings`:
```python
grid_box = simulation_settings.get('vina_grid_box') if simulation_settings else None
docking_result = self._dock_single_ligand_via_vina(
    ...
    exhaustiveness=exhaustiveness,
    grid_box=grid_box,
)
```

---

### 3. Fix Import from Job (broken `best_pose_pdb`)

**`frontend/src/components/Tools/RBFE/RBFEReferenceSetup.tsx`**

`handleSelectPriorJob` currently looks for `job.result?.best_pose_pdb` which never exists. Actual docking result fields:
- `result.poses_pdb` — multi-model PDB (first MODEL = best pose, sorted by affinity)
- `result.poses_sdf` — multi-compound SDF (first entry = best pose)
- `result.best_affinity` — numeric

Fix: extract the first MODEL block from `poses_pdb`:

```ts
function extractFirstPose(posesPdb: string): string {
  const modelStart = posesPdb.indexOf('MODEL')
  const endmdlEnd = posesPdb.indexOf('ENDMDL')
  if (modelStart !== -1 && endmdlEnd !== -1) {
    return posesPdb.slice(modelStart, endmdlEnd + 6)
  }
  return posesPdb // single-model fallback
}
```

Update `handleSelectPriorJob`:
1. Check `job.result?.poses_pdb` first (job list response may already have it)
2. If not, call `api.getJobDetails(jobId)` and check `details.result?.poses_pdb`
3. Pass extracted first pose to `setReferencePosePdb`

Also update `DockingJob.result` type to match actual fields:
```ts
result?: {
  best_affinity?: number
  best_score?: number
  poses_pdb?: string
  poses_sdf?: string
}
```

Note: `listUnifiedJobs` may not return `poses_pdb` in the list response (to keep payloads small) — the `getJobDetails` fallback path is the reliable path.

---

### 4. Filter Jobs by Reference Ligand SMILES

**`frontend/src/components/Tools/RBFE/RBFEReferenceSetup.tsx`**

After loading docking jobs, filter to only those whose ligand SMILES matches the selected reference ligand:

```ts
const referenceLigand = selectedLigands.find(l => l.id === rbfeStore.referenceLigandId)
const refSmiles = referenceLigand?.smiles?.trim()

const filtered = completed.filter((j: any) => {
  const jobSmiles = j.input_params?.ligand_smiles?.trim()
  const jobName = j.input_params?.ligand_name || j.molecule_name || ''
  const refName = referenceLigand?.name || ''
  return (refSmiles && jobSmiles && jobSmiles === refSmiles) ||
         (refName && jobName && jobName.toLowerCase() === refName.toLowerCase())
})
setDockingJobs(filtered)
```

Also reload jobs when `rbfeStore.referenceLigandId` changes (add it to the `useEffect` dependency array for `prior_job` tab).

---

## Critical Files

| File | Changes |
|------|---------|
| `frontend/src/components/Tools/RBFETool.tsx` | Add useEffect for radial central ligand default; pass `vina_grid_box` in simulation_settings |
| `frontend/src/components/Tools/RBFE/RBFEReferenceSetup.tsx` | Fix import-from-job bug; add SMILES filter; add fpocket+grid box UI to Vina tab |
| `frontend/src/store/rbfe-store.ts` | Add `vinaGridBox` state + `setVinaGridBox` action |
| `services/rbfe/service.py` | Add `grid_box` param to `_dock_single_ligand_via_vina`; read from simulation_settings |

---

## Reuse

- `DockingPocketFinder` (`frontend/src/components/Tools/Docking/DockingPocketFinder.tsx`) — import and reuse directly in RBFEReferenceSetup Vina tab
- `GridBox` type — import from docking types or define inline in rbfe-store (matches `{center_x, center_y, center_z, size_x, size_y, size_z}`)

---

## Verification

1. Step 3 with radial topology: select reference ligand in step 2, advance to step 3 → central ligand dropdown should pre-select the reference
2. Vina tab:
   - "Detect Pockets" button appears → click → pocket list shown → select → grid box fields populated
   - Manual entry: type values directly → stored in vinaGridBox
   - Submit RBFE job → backend logs show `grid_box` passed to Vina
3. Import from job:
   - Switch to "Import from job" tab with docking jobs present → click a job → status summary should show "Prior job" source selected (not silently fail)
4. SMILES filter: with a reference ligand selected, only docking jobs for that ligand's SMILES appear in the list
