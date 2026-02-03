# Enhanced Alignment Results Metrics

## Overview
The alignment results now display comprehensive metrics for each ligand, enabling detailed quality assessment and analysis of the ligand preparation workflow.

## Metrics Per Ligand

### Reference Ligand Entry
```json
{
  "id": "P30_A_1001",
  "is_reference": true,
  "rmsd": 0.0,
  "mcs_atoms": null,
  "num_atoms": 94,
  "status": "reference"
}
```

**Fields:**
- `id`: Ligand identifier
- `is_reference`: Boolean indicating this is the reference ligand
- `rmsd`: Always 0.0 for reference (no alignment needed)
- `mcs_atoms`: None for reference
- `num_atoms`: Total atom count in ligand
- `status`: "reference"

### Successfully Aligned Ligand Entry
```json
{
  "id": "p30_cl",
  "is_reference": false,
  "aligned_to": "P30_A_1001",
  "rmsd": 0.089,
  "mcs_atoms": 91,
  "alignment_success": true,
  "num_atoms": 94,
  "status": "aligned"
}
```

**Fields:**
- `id`: Ligand identifier
- `is_reference`: False for aligned ligand
- `aligned_to`: Reference ligand ID this was aligned to
- `rmsd`: Root Mean Square Deviation in Ångströms
  - < 1.0 Å: Excellent alignment
  - 1.0-2.0 Å: Good alignment
  - > 2.0 Å: Marginal alignment
- `mcs_atoms`: Number of atoms in Maximum Common Substructure
  - Indicates structural similarity between ligands
  - Query ligand typically has same or fewer atoms
- `alignment_success`: Boolean success flag
- `num_atoms`: Total atom count in ligand
- `status`: "aligned"

### Failed Ligand Entry
```json
{
  "id": "ligand_name",
  "error": "MCS too small: 2 atoms (min 3 required)",
  "mcs_atoms": 2,
  "rmsd": null,
  "alignment_success": false,
  "status": "failed"
}
```

**Fields:**
- `id`: Ligand identifier
- `error`: Detailed error message explaining why alignment failed
- `mcs_atoms`: MCS atom count (if available before failure)
- `rmsd`: None for failed ligands
- `alignment_success`: False for failed ligands
- `status`: "failed"

## Alignment Summary Statistics

The results include comprehensive statistics:

```json
{
  "alignment_summary": {
    "reference_ligand": "P30_A_1001",
    "alignment_method": "mcs_template",
    "total_ligands": 3,
    "total_aligned": 3,
    "total_failed": 0,
    "aligned_ligands": [ ... ],
    "failed_ligands": [ ... ],
    "statistics": {
      "rmsd": {
        "min": 0.0,
        "max": 2.165,
        "mean": 0.751,
        "values": [0.0, 0.089, 2.165]
      },
      "mcs_atoms": {
        "min": 91,
        "max": 91,
        "mean": 91,
        "values": [91, 91]
      }
    }
  }
}
```

**Statistics Fields:**

**RMSD Statistics:**
- `min`: Minimum RMSD value (excluding reference's 0.0)
- `max`: Maximum RMSD value
- `mean`: Average RMSD of aligned ligands
- `values`: List of all RMSD values

**MCS Atoms Statistics:**
- `min`: Minimum MCS atom count
- `max`: Maximum MCS atom count
- `mean`: Average MCS atoms
- `values`: List of all MCS atom counts

## Complete API Response Example

### Status Endpoint Response
```json
{
  "job_id": "e627f47f-ab3a-4913-8bfd-1ac866de4b30",
  "status": "completed",
  "reference_ligand": "P30_A_1001",
  "alignment_info": {
    "reference_ligand": "P30_A_1001",
    "alignment_method": "mcs_template",
    "aligned_ligands": [
      {
        "id": "P30_A_1001",
        "is_reference": true,
        "rmsd": 0.0,
        "mcs_atoms": null,
        "num_atoms": 94,
        "status": "reference"
      },
      {
        "id": "p30_cl",
        "is_reference": false,
        "aligned_to": "P30_A_1001",
        "rmsd": 0.089,
        "mcs_atoms": 91,
        "alignment_success": true,
        "num_atoms": 94,
        "status": "aligned"
      },
      {
        "id": "p30_br",
        "is_reference": false,
        "aligned_to": "P30_A_1001",
        "rmsd": 2.165,
        "mcs_atoms": 91,
        "alignment_success": true,
        "num_atoms": 95,
        "status": "aligned"
      }
    ],
    "failed_ligands": []
  }
}
```

### Results Endpoint Response
```json
{
  "job_id": "e627f47f-ab3a-4913-8bfd-1ac866de4b30",
  "reference_ligand": "P30_A_1001",
  "alignment_info": { ... },
  "results": {
    "relative_affinities": {
      "P30_A_1001": 0.0,
      "p30_cl": -8.3,
      "p30_br": -7.1
    },
    "alignment_summary": {
      "reference_ligand": "P30_A_1001",
      "alignment_method": "mcs_template",
      "total_ligands": 3,
      "total_aligned": 3,
      "total_failed": 0,
      "aligned_ligands": [
        {
          "id": "P30_A_1001",
          "is_reference": true,
          "rmsd": 0.0,
          "mcs_atoms": null,
          "num_atoms": 94,
          "status": "reference"
        },
        {
          "id": "p30_cl",
          "is_reference": false,
          "aligned_to": "P30_A_1001",
          "rmsd": 0.089,
          "mcs_atoms": 91,
          "alignment_success": true,
          "num_atoms": 94,
          "status": "aligned"
        },
        {
          "id": "p30_br",
          "is_reference": false,
          "aligned_to": "P30_A_1001",
          "rmsd": 2.165,
          "mcs_atoms": 91,
          "alignment_success": true,
          "num_atoms": 95,
          "status": "aligned"
        }
      ],
      "failed_ligands": [],
      "statistics": {
        "rmsd": {
          "min": 0.089,
          "max": 2.165,
          "mean": 0.751,
          "values": [0.0, 0.089, 2.165]
        },
        "mcs_atoms": {
          "min": 91,
          "max": 91,
          "mean": 91,
          "values": [91, 91]
        }
      }
    }
  }
}
```

## Interpretation Guide

### RMSD Values
- **0.0 Å**: Reference ligand (perfect, expected)
- **0.089 Å**: Excellent alignment, very similar compound
- **0.5-1.0 Å**: Good alignment
- **1.0-2.0 Å**: Acceptable alignment
- **2.0-3.0 Å**: Marginal alignment (review recommended)
- **> 3.0 Å**: Poor alignment (consider different reference)

### MCS Atoms
- **> 90 atoms (90% of molecule)**: Excellent structural similarity
- **70-90 atoms**: Good homogeneity in ligand series
- **50-70 atoms**: Moderate similarity (may be acceptable)
- **< 50 atoms**: Low similarity (likely too different for RBFE)

### Status Field
- **"reference"**: Reference ligand used for alignment
- **"aligned"**: Successfully aligned to reference
- **"failed"**: Alignment failed, ligand excluded from RBFE

## Use Cases

### 1. Quality Assessment
Examine alignment metrics before running RBFE:
```python
rmsd_values = alignment_summary['statistics']['rmsd']['values']
if all(r < 2.0 for r in rmsd_values):
    print("Excellent ligand series for RBFE")
elif all(r < 3.0 for r in rmsd_values):
    print("Acceptable ligand series")
else:
    print("Warning: Some ligands poorly aligned, RBFE may not be reliable")
```

### 2. Problem Diagnosis
When RBFE results seem unreliable:
```python
# Check for problematic ligands
for lig in alignment_summary['aligned_ligands']:
    if lig['rmsd'] > 2.0:
        print(f"Problematic ligand: {lig['id']} (RMSD: {lig['rmsd']})")
```

### 3. Series Homogeneity
Check if ligand series is suitable for RBFE:
```python
avg_mcs = alignment_summary['statistics']['mcs_atoms']['mean']
if avg_mcs > 80:
    print("Highly homologous series - suitable for RBFE")
elif avg_mcs > 60:
    print("Moderate homology - RBFE may be applicable")
else:
    print("Diverse series - may not be suitable for RBFE")
```

## JSON File Output

The alignment metrics are also saved to:
- `alignment_info.json` - Complete alignment information during preparation
- `results.json` - Final results including `alignment_summary` with statistics

## Changes Made

The following enhancements were made to capture comprehensive metrics:

1. **Reference ligand entry** now includes:
   - `mcs_atoms: null` (not applicable)
   - `num_atoms`: Total atom count
   - `status: "reference"`

2. **Aligned ligand entry** now includes:
   - `alignment_success`: Boolean flag
   - `num_atoms`: Total atom count
   - `status: "aligned"`

3. **Failed ligand entry** now includes:
   - `mcs_atoms`: Available MCS atom count before failure
   - `alignment_success: false`
   - `status: "failed"`

4. **Alignment summary** now includes:
   - `total_ligands`: Total count (aligned + failed)
   - `statistics`: Min/max/mean for RMSD and MCS atoms
   - Comprehensive list of all metrics

This enables complete transparency and detailed quality assessment of the ligand preparation workflow.
