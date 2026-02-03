# RBFE Alignment Data Collection Enhancement

## Overview
This update ensures comprehensive alignment data is collected and passed through the RBFE calculation results, enabling detailed analysis of ligand preparation quality and alignment metrics.

## Key Changes

### 1. Enhanced Data Structures

#### New `AlignmentData` Dataclass
```python
@dataclass
class AlignmentData:
    """Alignment information for a ligand."""
    ligand_id: str
    is_reference: bool
    aligned_to: Optional[str] = None
    rmsd: Optional[float] = None
    mcs_atoms: Optional[int] = None
    error: Optional[str] = None
```

#### Updated `RBFENetworkResult` Dataclass
Now includes `alignment_data` field for storing alignment information.

### 2. Enhanced Alignment Function

The `align_ligand_to_reference()` method now returns:
- **Aligned molecule** (or None if failed)
- **Alignment metrics dictionary** containing:
  - `ligand_id`: Identifier of the aligned ligand
  - `mcs_atoms`: Number of atoms in Maximum Common Substructure
  - `rmsd`: Root Mean Square Deviation after alignment (in Ångströms)
  - `alignment_success`: Boolean flag indicating success
  - `error`: Error message if alignment failed

### 3. Enhanced Alignment Info Collection

The `prepare_ligands_with_alignment()` function now collects:

**For successfully aligned ligands:**
```python
{
    'id': ligand_id,
    'is_reference': False,
    'aligned_to': reference_ligand_id,
    'rmsd': float_value,           # RMSD in Ångströms
    'mcs_atoms': integer_value      # Atoms in common substructure
}
```

**For reference ligand:**
```python
{
    'id': reference_id,
    'is_reference': True,
    'rmsd': 0.0
}
```

### 4. Enhanced Results Parsing

The `_parse_network_results()` method now:
- Accepts optional `alignment_info` parameter
- Includes alignment summary in output:
  ```python
  'alignment_summary': {
      'reference_ligand': str,
      'alignment_method': str,
      'total_aligned': int,
      'total_failed': int,
      'aligned_ligands': list,
      'failed_ligands': list
  }
  ```

### 5. Enhanced API Responses

#### Updated `RBFEStatusResponse` Model
Added fields:
- `alignment_info`: Complete alignment information
- `reference_ligand`: ID of reference ligand used

#### Updated `/status/{job_id}` Endpoint
Now returns:
- Full `alignment_info` with RMSD and MCS atom counts
- Reference ligand identifier

#### Updated `/results/{job_id}` Endpoint
Now includes:
- `alignment_info`: Detailed alignment metrics
- `reference_ligand`: Reference ligand ID
- `docked_poses`: Pose information with affinities

## Data Flow

```
Input: ligands_data
  ↓
prepare_ligands_with_alignment()
  ├─ Select or auto-select reference ligand
  ├─ For each query ligand:
  │   ├─ Find MCS with reference
  │   ├─ Align to reference (records RMSD, MCS atoms)
  │   └─ Store alignment metrics
  └─ Return: updated ligands + alignment_info
  ↓
run_rbfe_calculation()
  ├─ Alignment info stored in job status
  ├─ Run RBFE transformations
  └─ Parse results with alignment data
  ↓
_parse_network_results()
  ├─ Include alignment summary
  └─ Return complete results
  ↓
Output: Job status includes:
  - alignment_info (with RMSD and MCS atoms)
  - reference_ligand
  - results (ddG values)
```

## API Response Example

```json
{
  "job_id": "e627f47f-ab3a-4913-8bfd-1ac866de4b30",
  "status": "completed",
  "reference_ligand": "P30_A_1001",
  "alignment_info": {
    "reference_ligand": "P30_A_1001",
    "alignment_method": "mcs_template",
    "total_aligned": 2,
    "total_failed": 0,
    "aligned_ligands": [
      {
        "id": "P30_A_1001",
        "is_reference": true,
        "rmsd": 0.0
      },
      {
        "id": "p30_cl",
        "is_reference": false,
        "aligned_to": "P30_A_1001",
        "rmsd": 0.089,
        "mcs_atoms": 91
      },
      {
        "id": "p30_br",
        "is_reference": false,
        "aligned_to": "P30_A_1001",
        "rmsd": 2.165,
        "mcs_atoms": 91
      }
    ],
    "failed_ligands": []
  },
  "results": {
    "transformation_results": [...],
    "ddg_values": [...],
    "relative_affinities": {...},
    "alignment_summary": {
      "reference_ligand": "P30_A_1001",
      "alignment_method": "mcs_template",
      "total_aligned": 3,
      "total_failed": 0,
      "aligned_ligands": [...],
      "failed_ligands": [...]
    }
  }
}
```

## Terminal Log Output Example

The console logs now include detailed alignment metrics:

```
[rbfe service] Found MCS with 91 atoms for p30_cl (Library)
[rbfe service] Aligned p30_cl (Library) to reference with RMSD 0.089 Å
[rbfe service] Successfully aligned p30_cl (Library) to reference P30_A_1001
[rbfe service] Found MCS with 91 atoms for p30_br (Library)
[rbfe service] Detected 2D structure for p30_br (Library), generating 3D coordinates
[rbfe service] Aligned p30_br (Library) to reference with RMSD 2.165 Å
[rbfe service] Successfully aligned p30_br (Library) to reference P30_A_1001
[rbfe service] Alignment complete: 2 aligned, 0 failed, reference=P30_A_1001
```

## Quality Assessment Use Cases

The collected alignment data enables:

1. **Ligand Preparation Quality**: RMSD values indicate how well each ligand was aligned to the reference
2. **Structural Similarity**: MCS atom counts show the chemical similarity between ligands
3. **Alignment Confidence**: High RMSD or small MCS may indicate preparation issues
4. **Binding Mode Consistency**: Successful alignment with low RMSD confirms shared binding mode
5. **Failure Diagnosis**: Failed alignments are clearly documented with error details

## Best Practices

- **RMSD Interpretation**:
  - RMSD < 1.0 Å: Excellent alignment
  - RMSD 1.0-2.0 Å: Good alignment
  - RMSD > 2.0 Å: Marginal alignment, may need review
  
- **MCS Atoms**:
  - > 90% of query atoms: Excellent structural similarity
  - 70-90%: Good similarity
  - < 70%: Consider if ligand series is homogeneous enough for RBFE

- **Reference Selection**:
  - Use ligand with known accurate binding pose
  - Ensure it's representative of the series
  - Check that it aligns well to other ligands before proceeding

## Files Modified

1. `services/rbfe/service.py`
   - Added `AlignmentData` dataclass
   - Enhanced `align_ligand_to_reference()` to return metrics
   - Updated `prepare_ligands_with_alignment()` to collect RMSD and MCS data
   - Enhanced `_parse_network_results()` to include alignment summary
   - Updated `run_rbfe_calculation()` to pass alignment_info through

2. `services/rbfe/routers.py`
   - Updated `RBFEStatusResponse` model with alignment fields
   - Enhanced `/status/{job_id}` endpoint
   - Enhanced `/results/{job_id}` endpoint
