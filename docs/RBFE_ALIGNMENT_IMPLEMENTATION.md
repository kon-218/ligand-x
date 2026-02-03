# RBFE Template-Based Alignment Implementation

## Overview
Implemented the **best practice** RBFE workflow using template-based ligand alignment instead of independent docking. This ensures all ligands share the same binding mode, which is **CRITICAL** for RBFE calculations to converge correctly.

## Problem Solved
Previously, RBFE jobs were failing because:
1. Each ligand was docked independently to the protein
2. Different ligands would adopt different binding modes (pose flips, translations)
3. RBFE simulations would try to alchemically transform between ligands in different poses
4. This caused non-convergence and unreliable results

## Solution: Template-Based Alignment Workflow

### New Workflow (Best Practice)
1. **Select or Auto-Detect Reference Ligand**: Choose a ligand with a reliable binding pose
2. **Dock Reference (if needed)**: If reference has no pose, dock it to establish the binding mode
3. **Align All Others**: Use Maximum Common Substructure (MCS) to align all other ligands to the reference
4. **Exclude Dissimilar Ligands**: Ligands too dissimilar to the reference are excluded

### Key Benefit
All ligands now share the same binding mode, ensuring:
- Stable RBFE trajectories
- Clear atom mapping for alchemical transformations
- High accuracy and convergence
- Proper error propagation

## Backend Changes

### 1. Added Alignment Methods to RBFE Service
**File**: `services/rbfe/service.py`

#### `align_ligand_to_reference(query_mol, reference_mol, query_id, min_mcs_atoms)`
- Finds Maximum Common Substructure (MCS) between two molecules
- Aligns query molecule to reference using MCS atom mapping
- Returns aligned molecule with RMSD value
- Handles 3D coordinate generation if needed

#### `prepare_ligands_with_alignment(protein_pdb, ligands_data, reference_ligand_id, exhaustiveness, min_mcs_atoms)`
- Main alignment workflow method
- **Step 1**: Identifies or auto-selects reference ligand
- **Step 2**: Docks reference if it lacks a pose
- **Step 3**: Loads reference molecule
- **Step 4**: Aligns all other ligands to reference using MCS
- Returns updated ligands_data with aligned poses and alignment_info

### 2. Updated RBFE Calculation Flow
**File**: `services/rbfe/service.py` - `run_rbfe_calculation()` method

Changed from:
```python
# OLD: Dock all ligands independently
ligands_data, docking_scores = self.prepare_ligands_with_docking(...)
```

To:
```python
# NEW: Use template-based alignment
ligands_data, alignment_info = self.prepare_ligands_with_alignment(
    protein_pdb=protein_pdb,
    ligands_data=ligands_data,
    reference_ligand_id=reference_ligand_id,
    exhaustiveness=docking_exhaustiveness,
    min_mcs_atoms=min_mcs_atoms
)
```

### 3. Updated API Request Model
**File**: `services/rbfe/routers.py`

Added `reference_ligand` parameter to `RBFECalculationRequest`:
```python
reference_ligand: Optional[str] = Field(
    default=None,
    description="Reference ligand for template-based alignment (should have reliable binding pose)"
)
```

Updated documentation to explain the alignment workflow.

### 4. Updated Process Function
**File**: `services/rbfe/routers.py` - `_run_rbfe_calculation_in_process()`

Added `reference_ligand_id` parameter and logging:
- Passes reference_ligand_id to service
- Logs alignment method in console output
- Tracks reference ligand in job metadata

## Frontend Changes

### 1. Updated RBFE Store
**File**: `frontend/src/store/rbfe-store.ts`

Added state and actions:
```typescript
referenceLigand: string | null  // Reference ligand for alignment
setReferenceLigand: (ligandId: string | null) => void
```

### 2. Updated Step 2: Reference Ligand Selection
**File**: `frontend/src/components/Tools/RBFETool.tsx`

Changed from "Docking Configuration" to "Reference Ligand Selection":
- Dropdown to select reference ligand from selected ligands
- Auto-select option (first with docked pose)
- Shows which ligands have existing poses
- Explains template-based alignment workflow
- Shows warning about dissimilar ligands being excluded

### 3. Updated Workflow Steps
Changed step labels:
- Step 2: "Poses" → "Reference" (more accurate)
- Description: "Configure docking" → "Select reference binding pose"

### 4. Updated API Request
**File**: `frontend/src/components/Tools/RBFETool.tsx` - `runRBFE()`

Added reference_ligand to request body:
```typescript
const requestBody = {
  ...
  reference_ligand: rbfeStore.referenceLigand || undefined,
  ...
}
```

### 5. Updated Type Definitions
**File**: `frontend/src/types/rbfe-types.ts`

Added to `RBFEParameters`:
```typescript
reference_ligand?: string  // For template-based alignment
min_mcs_atoms?: number  // Minimum atoms in MCS for alignment
docking_exhaustiveness?: number  // For reference ligand docking
```

## How It Works

### User Workflow
1. **Step 1**: Select 2+ ligands for RBFE comparison
2. **Step 2**: Choose which ligand to use as reference (or auto-select)
   - If reference has no docked pose, it will be docked
   - All other ligands will be aligned to this reference
3. **Step 3**: Configure network topology (MST, Radial, Maximal)
4. **Step 4**: Set simulation parameters
5. **Step 5**: Execute and view results

### Calculation Workflow
1. **Alignment Phase**:
   - Reference ligand is docked (if needed) to establish binding mode
   - All other ligands are aligned to reference using MCS
   - Ligands too dissimilar are excluded
   - User can review aligned poses before continuing

2. **RBFE Phase**:
   - All ligands share the same binding mode
   - Atom mapping is clear and reliable
   - Network edges connect aligned ligands
   - Simulation converges properly

## Status Messages

The job status now shows:
- `aligning` - Performing ligand alignment
- `docking_ready` - Alignment complete, waiting for user validation
- Alignment info includes:
  - Reference ligand ID
  - Number of successfully aligned ligands
  - Failed ligands and reasons
  - Alignment method (MCS template-based)

## Error Handling

If alignment fails:
- Ligands with no common scaffold are excluded
- Job continues with remaining aligned ligands
- User is warned about excluded ligands
- Minimum 2 ligands required to proceed

## Deployment

### Backend
```bash
docker compose build --no-cache rbfe worker-gpu-long
docker compose up -d rbfe worker-gpu-long
```

### Frontend
Changes are automatically hot-reloaded in development mode.

## Testing

### Manual Test Workflow
1. Load a protein structure
2. Select 2-3 similar ligands (same scaffold, different substituents)
3. Go to Step 2 and select one as reference
4. Proceed through steps 3-4
5. Execute RBFE calculation
6. Verify alignment info shows all ligands aligned
7. Check that RBFE converges properly

### Expected Results
- ✅ All ligands aligned to reference
- ✅ Alignment RMSD values reasonable
- ✅ No "pose flip" issues
- ✅ RBFE converges in reasonable time
- ✅ Results are reproducible

## Benefits

1. **Correctness**: Ensures all ligands share same binding mode
2. **Convergence**: RBFE simulations converge properly
3. **Accuracy**: Reliable binding free energy predictions
4. **Clarity**: Clear atom mapping for transformations
5. **Robustness**: Automatic exclusion of dissimilar ligands

## References

- OpenFE Documentation: Template-based alignment
- RBFE Best Practices: Ensure consistent binding modes
- RDKit MCS: Maximum Common Substructure matching
- Kartograf: 3D-aware atom mapping (used by OpenFE)

## Notes

- `min_mcs_atoms` default: 3 (minimum atoms in common core)
- `docking_exhaustiveness` default: 16 (for reference docking)
- Alignment uses RDKit's `rdMolAlign.AlignMol()` with MCS atom mapping
- Reference ligand can be auto-selected from ligands with existing poses
- Dissimilar ligands are gracefully excluded with warning messages
