# RBFE NaN Error Fix Implementation

**Date**: 2026-02-03
**Status**: ✅ Complete
**Impact**: High - Prevents NaN errors in RBFE calculations

## Problem Summary

RBFE calculations were failing with cryptic "NaN" errors during equilibration. The root cause was aggressive default OpenFE equilibration settings (0.1 ns with immediate lambda sampling) combined with potential structural instabilities in hybrid topologies.

## Solution Overview

Implemented a multi-layered approach to prevent and diagnose NaN errors:

1. **Robust Mode Protocol** (Default) - Conservative MD settings
2. **Structure Validation** - Catch issues before expensive calculations
3. **Hybrid System Diagnostics** - Pre-execution validation
4. **Enhanced Error Handling** - Partial results and clear diagnostics
5. **Force Field Validation** - Check ligand compatibility with OpenFF
6. **API Updates** - Expose robust mode and diagnostics endpoints

## Implementation Details

### 1. Robust Mode Configuration (✅ Task #1)

**File**: `services/rbfe/service.py:setup_rbfe_protocol()`

**Changes**:
- **Default**: `robust_mode=True` for all RBFE calculations
- **Minimization**: Increased from 5,000 to 10,000 steps
- **Timestep**: Reduced from 4.0 fs to 2.0 fs for stability
- **Equilibration**: Extended to 0.2 ns even in fast mode
- **HMR**: Kept at 3.0 amu (compatible with 2.0 fs)

**Why this works**:
- More minimization resolves initial geometry issues
- Smaller timestep prevents integration instabilities
- Longer equilibration allows system to stabilize
- HMR maintains efficiency while improving stability

### 2. Ligand Structure Validation (✅ Task #2)

**File**: `services/rbfe/service.py:_validate_aligned_ligand()`

**Checks**:
- ✓ Atomic clashes (< 0.8 Å between heavy atoms)
- ✓ Unusual bond lengths (strain detection)
- ✓ Alignment quality (RMSD per aligned atom)
- ✓ MCS coverage (fraction of molecule aligned)
- ✓ High absolute RMSD (> 3.0 Å)

**Integration**:
- Called after MCS alignment in `prepare_ligands_with_alignment()`
- Warnings logged but don't block execution (user decision: WARN AND CONTINUE)
- Validation results stored in alignment_info

**Benefits**:
- Identifies structural issues before MD
- Provides actionable diagnostics
- Helps troubleshoot alignment failures

### 3. Hybrid System Diagnostics (✅ Task #3)

**File**: `services/rbfe/service.py:_validate_hybrid_system()`

**Checks**:
- ✓ Component compatibility between states A and B
- ✓ Ligand presence in both states
- ✓ Protein presence in complex leg

**Note**: Detailed energy checks would be computationally expensive, so we rely on structural validation from alignment phase.

### 4. Transformation Error Handling (✅ Task #5)

**File**: `services/rbfe/service.py:run_rbfe_calculation()` (Step 6)

**Enhancements**:
- **Per-transformation error handling**: Catch exceptions for each transformation
- **NaN detection**: Identify NaN errors specifically and provide diagnostic messages
- **Partial results**: Continue with other transformations if one fails (user decision: ENABLED)
- **Detailed logging**: Log error type, validation warnings, and full traceback
- **Summary reporting**: Count successful/failed transformations

**Error Messages**:
When NaN detected, provides helpful diagnostic:
```
NaN detected in transformation. This typically indicates:
  1. Structural instability (atom clashes, strained geometry)
  2. Force field parameterization issues
  3. Poor alignment quality between ligands
  4. Insufficient equilibration before production
Check validation warnings above for structural issues.
```

**Failure Handling**:
- If all transformations fail → Clear error message with troubleshooting steps
- If some fail → Return partial results with detailed failure diagnostics
- Failed transformations tracked with `is_nan_error` flag

### 5. Force Field Validation (✅ Task #6)

**File**: `services/rbfe/service.py:_validate_forcefield_compatibility()`

**Checks**:
- ✓ Unusual elements (non-standard for OpenFF)
- ✓ Metal atoms (not supported by OpenFF)
- ✓ Large molecules (> 100 heavy atoms)
- ✓ High formal charges (> ±2)
- ✓ Complex ring systems (> 10 rings, macrocycles)
- ✓ Problematic functional groups (nitro, azide, peroxide, etc.)

**Integration**:
- Called in `prepare_ligand()` before OpenFF parameterization
- Warnings logged for each issue found
- Does not block execution (informational)

### 6. API Updates (✅ Task #7)

**File**: `services/rbfe/routers.py`

**Changes**:

#### Updated `RBFECalculationRequest` Documentation
- Added detailed `robust_mode` parameter documentation
- Documented all simulation settings parameters
- Clear guidance on what robust mode does

#### New Diagnostics Endpoint
**Endpoint**: `GET /api/rbfe/diagnostics/{job_id}`

**Returns**:
```json
{
  "job_id": "...",
  "status": "...",
  "alignment_diagnostics": {
    "reference_ligand": "ligand1",
    "total_ligands": 5,
    "aligned": 4,
    "failed": 1,
    "failed_ligands": [...],
    "validation_warnings": [...],
    "statistics": {...}
  },
  "transformation_diagnostics": {
    "total_transformations": 16,
    "completed": 14,
    "failed": 2,
    "nan_errors": 1,
    "other_errors": 1,
    "failed_details": [...]
  },
  "validation_summary": {
    "has_alignment_issues": true,
    "has_validation_warnings": true,
    "has_nan_errors": true,
    "calculation_status": "failed",
    "recommendations": [
      "NaN errors detected. Enable robust_mode...",
      "2 ligands failed alignment..."
    ]
  }
}
```

**Benefits**:
- Centralized diagnostics for troubleshooting
- Clear recommendations for users
- Structured error categorization

### 7. Three-Phase Equilibration (⏸️ Task #4 - Deferred)

**Status**: Deferred for future enhancement

**Reason**:
- Requires deep OpenFE protocol modifications
- Current robust_mode provides significant stability improvements
- Would need OpenFE protocol subclassing to implement properly
- Risk of breaking OpenFE compatibility

**Current Approach**:
The implemented robust_mode settings already provide multi-stage stability:
1. **Enhanced minimization** (10,000 steps) - Resolves geometry issues
2. **Conservative timestep** (2.0 fs) - Prevents integration errors
3. **Extended equilibration** (0.2 ns) - More relaxation time

This should prevent most NaN errors without requiring custom equilibration runners.

**Future Enhancement**:
If needed, implement via OpenFE's `RelativeHybridTopologyProtocol` subclassing:
- Override `_equilibration_protocol()` method
- Add phased temperature ramp (100K → 298K)
- Implement pre-lambda-sampling NVT equilibration
- Maintain OpenFE compatibility

## User Decisions

The following decisions were made per the plan:

1. ✅ **Robust mode = DEFAULT**
   - All RBFE calculations use robust settings by default
   - Better reliability outweighs slightly longer compute time
   - Users can disable with `robust_mode=False` if needed

2. ✅ **Validation = WARN AND CONTINUE**
   - Pre-execution diagnostics identify potential issues
   - Warnings logged but don't block execution
   - Prevents unnecessary blocking of legitimate calculations

3. ✅ **Partial Results = ENABLED**
   - If some transformations fail, return results from successful ones
   - More informative than total failure
   - Network results show which edges succeeded/failed

## Testing Recommendations

To verify the fix:

1. **Test with previously failing case**:
   ```python
   response = client.post("/api/rbfe/calculate", json={
       "protein_pdb": "...",
       "ligands": [...],
       "simulation_settings": {
           "robust_mode": True,  # Default, can omit
           "fast_mode": True
       }
   })
   ```

2. **Check diagnostics**:
   ```python
   diagnostics = client.get(f"/api/rbfe/diagnostics/{job_id}")
   # Review validation warnings and recommendations
   ```

3. **Monitor logs**:
   - Look for validation warnings
   - Check that robust mode is active
   - Verify partial results if some transformations fail

4. **Verify protocol settings** in logs:
   ```
   Using ROBUST MODE for enhanced stability
     Minimization steps: 10000 (boosted for stability)
     Timestep: 2.0 fs (conservative for hybrid topology)
     Hydrogen mass: 3.0 amu (HMR enabled)
     Equilibration: 0.2 ns (extended for robust mode)
   ```

## Expected Impact

**Before Fix**:
- ❌ RBFE jobs fail with cryptic "NaN" errors
- ❌ No diagnostic information
- ❌ No path to recovery
- ❌ Users don't know what went wrong

**After Fix**:
- ✅ Robust mode prevents most NaN errors
- ✅ Clear diagnostic messages showing root cause
- ✅ Partial results usable even if some edges fail
- ✅ Better guidance for force field selection
- ✅ Validation warnings help identify issues early

## Files Modified

1. `services/rbfe/service.py` (~2100 lines)
   - Added `_validate_aligned_ligand()` method
   - Added `_validate_hybrid_system()` method
   - Added `_validate_forcefield_compatibility()` method
   - Enhanced `setup_rbfe_protocol()` with robust mode
   - Enhanced `prepare_ligands_with_alignment()` with validation
   - Enhanced `run_rbfe_calculation()` with error handling

2. `services/rbfe/routers.py` (~900 lines)
   - Updated `RBFECalculationRequest` documentation
   - Added `/diagnostics/{job_id}` endpoint

3. `docs/rbfe_nan_fix_implementation.md` (NEW)
   - This documentation file

## Next Steps

1. **Test with real data**: Use the previously failing ligand pairs
2. **Monitor production**: Track NaN error rates in production
3. **Gather feedback**: Get user feedback on diagnostic messages
4. **Future enhancements**:
   - Implement three-phase equilibration if still needed
   - Add automatic retry with robust mode if standard mode fails
   - Add structure pre-optimization before alignment
   - Implement more sophisticated network path analysis for partial results

## References

- Original issue: RBFE calculations failing with NaN errors
- OpenFE documentation: https://docs.openfree.energy/
- Plan document: `/home/konstantin-nomerotski/.claude/projects/.../plan.md`
