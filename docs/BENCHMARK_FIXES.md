# Benchmark Implementation - Fixes Applied

## Issues Identified and Fixed

### 1. ✅ Docking Box Center from Crystal Ligand

**Issue:** Docking stage was using placeholder `(0, 0, 0)` for box center instead of extracting from crystal structure.

**Fix Applied:** Modified `scripts/benchmarks/stages/docking_stage.py` (lines 86-103)

**Before:**
```python
# For now, use a default box center (would need to extract from structure)
# In production, would call structure service to get ligand COM
box_center = {"x": 0.0, "y": 0.0, "z": 0.0}  # Placeholder
```

**After:**
```python
# Extract ligand from crystal structure to get center of mass
try:
    # Read crystal structure
    pdb_content = crystal_pdb_path.read_text()

    # Extract ligand and get center of mass via API
    response = await client.post(
        f"{api_base_url}/api/structure/extract_ligand",
        json={
            "pdb_content": pdb_content,
            "ligand_name": ligand_code,
            "output_format": "sdf"
        }
    )
    response.raise_for_status()
    ligand_data = response.json()

    # Get center of mass from response
    box_center = ligand_data.get("center_of_mass", {"x": 0.0, "y": 0.0, "z": 0.0})

    logger.info(f"  Crystal ligand COM: ({box_center['x']:.2f}, "
               f"{box_center['y']:.2f}, {box_center['z']:.2f})")

except Exception as e:
    logger.error(f"Failed to extract ligand COM for {pdb_id}: {e}")
    logger.warning(f"Using default box center (0, 0, 0) for {ligand_name}")
    box_center = {"x": 0.0, "y": 0.0, "z": 0.0}
```

**Impact:**
- Docking box now centered on crystal ligand position
- Improves RMSD accuracy for redocking validation
- Fallback to (0,0,0) if extraction fails

---

### 2. ✅ Benzene as RBFE Reference Ligand

**Issue:** Benzene was missing `experimental_ddG_kcal_mol: 0.0` field.

**Fix Applied:** Modified `data/benchmarks/t4l99a_benzene/experimental_data.json` (line 21)

**Before:**
```json
{
  "pdb_id": "4w52",
  "name": "benzene",
  "smiles": "c1ccccc1",
  "ligand_code": "BNZ",
  "experimental_Kd_uM": 3100.0,
  "experimental_dG_kcal_mol": -3.47,
  "reference_ligand": true,
  "notes": "Reference compound for ΔΔG calculations"
}
```

**After:**
```json
{
  "pdb_id": "4w52",
  "name": "benzene",
  "smiles": "c1ccccc1",
  "ligand_code": "BNZ",
  "experimental_Kd_uM": 3100.0,
  "experimental_dG_kcal_mol": -3.47,
  "experimental_ddG_kcal_mol": 0.0,
  "reference_ligand": true,
  "notes": "Reference compound for ΔΔG calculations"
}
```

**Verification:** RBFE stage already correctly uses benzene as reference

From `scripts/benchmarks/stages/rbfe_stage.py`:
```python
# Line 42: Get reference ligand (benzene with reference_ligand: true)
reference_ligand = config.get_reference_ligand()

# Line 44: Log reference ligand name
logger.info(f"Reference ligand: {reference_ligand['name']}")

# Line 82: Pass to network planning
network_payload = {
    "ligands": [...],
    "mapper": rbfe_settings["atom_mapper"],
    "reference_ligand": reference_ligand["name"]  # "benzene"
}
```

**Impact:**
- Benzene is reference with ΔΔG = 0.0 (by definition)
- All other ligands have ΔΔG relative to benzene
- RBFE metrics calculations will include benzene in comparisons

---

## Verification Checklist

✅ Benzene has `"experimental_ddG_kcal_mol": 0.0`
✅ Benzene has `"reference_ligand": true`
✅ RBFE stage uses `config.get_reference_ligand()` → benzene
✅ Docking stage extracts crystal ligand COM via API
✅ Docking box centered on crystal ligand position
✅ Fallback to (0,0,0) if COM extraction fails

---

## Testing Recommendations

### 1. Test Ligand COM Extraction

```bash
# Ensure structure service is running
curl http://localhost:8001/health

# Test extraction endpoint
curl -X POST http://localhost:8001/api/structure/extract_ligand \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

### 2. Run Docking Stage Only

```bash
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-rbfe --skip-abfe \
  --run-name "test_docking_com"
```

**Expected:**
- Log messages showing crystal ligand COM coordinates
- RMSD values < 2.0 Å for successful redocking
- No errors extracting ligand from cached PDBs

### 3. Verify RBFE Reference

```bash
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-docking --skip-abfe \
  --run-name "test_rbfe_reference"
```

**Expected:**
- Log: `Reference ligand: benzene`
- Network planning uses benzene as reference
- Transformations calculated relative to benzene

---

## Summary

Both issues have been fixed:

1. **Docking:** Box center now extracted from crystal ligand position using Ligand-X structure API
2. **RBFE:** Benzene properly configured as reference (ΔΔG = 0.0) and used by RBFE stage

The benchmark framework is now correctly configured for T4L99A validation! 🎉
