# Element Detection Bug Fix

**Date:** February 14, 2026
**Status:** ✅ Fixed and Verified

## Summary

Fixed critical bug where oxygen atoms with positional suffixes (e.g., "O1S", "O2S", "O3S") in PDB files were incorrectly parsed as osmium (Os) instead of oxygen (O). This resulted in completely corrupted molecular structures and SMILES representations.

## The Bug

### Root Cause

Custom element inference code in three files was attempting to "improve" element detection by parsing atom names. The code extracted alphabetic characters from atom names and checked if they formed valid element symbols.

**Problematic logic:**
```python
# Extract "O1S" → "OS" (removing digit)
name_alpha = ''.join(ch for ch in "O1S" if ch.isalpha()).upper()  # "OS"

# Check if "OS" is a valid element
if "OS" in VALID_ELEMENTS:  # True! "OS" is Osmium
    return "Os"  # ❌ WRONG! Should be "O" (oxygen)
```

The bug occurred because:
1. Atom name "O1S" contains letters "O", "1", "S"
2. Code extracted only letters: "OS"
3. "OS" is a valid element symbol (Osmium, atomic number 76)
4. Code incorrectly "corrected" oxygen to osmium

### Affected Files

1. **`services/structure/processor.py`** (lines 80-123, 178-253)
   - Function: `infer_element_from_atom_name()` and `sanitize_pdb_for_rdkit()`
   - Used for ligand extraction and structure processing

2. **`services/docking/service.py`** (lines 29-56, 59-128)
   - Function: `infer_element_from_atom_name()` and `sanitize_pdb_element_columns()`
   - Used for docking preparation

3. **`services/md/utils/pdb_utils.py`** (lines 26-82, 85-116)
   - Function: `infer_element_symbol()` and `sanitize_pdb_block()`
   - Used for MD simulations

### Impact

- **Corrupted SMILES**: Generated invalid molecular representations
- **Wrong molecular formulas**: Showed osmium instead of oxygen
- **Failed calculations**: Downstream tools rejected invalid structures
- **Data integrity**: Broke scientific accuracy of results

### Example Bug

**Input PDB (correct):**
```
HETATM    1  O1S EPE A 201      32.477 -21.054  12.500  1.00 63.72           O
```

**Buggy parsing:**
- Atom name: "O1S"
- Extracted letters: "OS"
- Inferred element: "Os" (Osmium) ❌

**Correct parsing:**
- Element column (77-78): "O"
- Correct element: "O" (Oxygen) ✅

## The Solution

### Approach: Trust the PDB Format Specification

**Key insight:** RDKit and other public molecular modeling packages already handle this correctly by reading the element symbol from columns 77-78 of the PDB format.

### Changes Made

#### 1. `services/structure/processor.py`

**Before:**
```python
def sanitize_pdb_for_rdkit(pdb_data: str) -> str:
    """Sanitize PDB data by fixing element columns..."""
    # Complex logic to infer elements from atom names
    # Modified element columns based on inference
    # Removed atoms with "invalid" elements
```

**After:**
```python
def sanitize_pdb_for_rdkit(pdb_data: str) -> str:
    """
    Sanitize PDB data by fixing malformed atom serial numbers.

    RDKit correctly reads element symbols from columns 77-78.
    We trust the element column and let RDKit handle element parsing.
    """
    # Only fix malformed atom serial numbers
    return fix_malformed_pdb_serials(pdb_data)
```

#### 2. `services/docking/service.py`

**Before:**
```python
def sanitize_pdb_element_columns(pdb_data: str) -> str:
    """Sanitize PDB data by ensuring element columns are properly formatted."""
    # Inferred elements from atom names
    # Modified element columns
```

**After:**
```python
def sanitize_pdb_element_columns(pdb_data: str) -> str:
    """
    Sanitize PDB data by ensuring element columns are properly formatted.

    This function only ensures proper right-justification (e.g., ' N' not 'N '),
    trusting the element symbols already present in the PDB file.
    """
    # Only fixes justification, trusts element values
```

#### 3. `services/md/utils/pdb_utils.py`

**Before:**
```python
def sanitize_pdb_block(pdb_block: str) -> str:
    """Ensure element columns in a PDB block are valid."""
    # Inferred elements from atom names
    # Modified element columns
```

**After:**
```python
def sanitize_pdb_block(pdb_block: str) -> str:
    """
    Ensure element columns in a PDB block are valid.

    OpenMM and RDKit correctly read element symbols from columns 77-78.
    We trust the element column and let the tools handle element parsing.
    """
    # Returns original PDB data unchanged
    return pdb_block
```

## Verification

### Test Results

#### 1. Unit Tests (`test_element_fix.py`)

Tests basic RDKit parsing with problematic atom names:

```
✅ PASS: O1S Element Detection
✅ PASS: Multiple Oxygen Atoms
✅ PASS: SMILES Generation

Results: 3/3 tests passed
```

#### 2. Integration Tests (`test_epe_ligand_extraction.py`)

Tests real-world ligand extraction from PDB 4W51:

```
✅ Element verification: PASS
   - Found 4 oxygen atoms (expected >= 3)
   - Found 0 osmium atoms (correct)

✅ SMILES verification: PASS
   - Generated: OCCN1CCN(CCS(O)(O)O)CC1
   - No osmium in SMILES

🎉 All tests passed!
```

### PDB Format Specification

Per the official PDB format specification:
- **Columns 77-78**: Element symbol (RIGHT-JUSTIFIED)
- This is the authoritative source for element information
- Atom names (columns 13-16) are for identification, not element determination

### Why RDKit Gets It Right

RDKit correctly implements the PDB parser by:
1. Reading element symbol from columns 77-78 (the standard)
2. Using atom name only as a fallback if element column is empty
3. Recognizing positional suffixes (e.g., "1S" in "O1S") as non-elemental

## Best Practices Learned

1. **Trust standard file formats** - Don't try to be "smarter" than the specification
2. **Trust public packages** - RDKit, OpenMM, BioPython are battle-tested
3. **Minimal intervention** - Only fix what's actually broken (malformed serials)
4. **Test with real data** - Integration tests with actual PDB files catch edge cases

## Related Issues

This fix resolves issues with:
- Ligand EPE from protein 4W51
- Any PDB with atom names containing valid 2-letter element symbols
- Examples: O1S, O2S, O3S, BR1, CL2, FE1, etc.

## Migration Notes

### For Developers

**No breaking changes** - The sanitization functions still exist with the same signatures. They just do less work now (which is good).

### For Users

**No action required** - Existing workflows will automatically benefit from the fix. Structures previously showing osmium will now correctly show oxygen.

## Files Modified

1. `services/structure/processor.py` - Lines 178-253
2. `services/docking/service.py` - Lines 59-128
3. `services/md/utils/pdb_utils.py` - Lines 85-116

## Test Files Added

1. `test_element_fix.py` - Unit tests for element detection
2. `test_epe_ligand_extraction.py` - Integration test with real PDB

## References

- PDB Format Specification: https://www.wwpdb.org/documentation/file-format-content/format33/v3.3.html
- RDKit PDB Parser: https://www.rdkit.org/docs/source/rdkit.Chem.rdmolfiles.html
- Original bug report: Ligand EPE from 4W51 showing osmium instead of oxygen
