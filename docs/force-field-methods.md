# Force Field Method Selection for MD Optimization

## Overview

The MD optimization service now supports **user-selectable force field methods** for charge calculation and ligand parametrization. This allows you to choose the appropriate methods based on your molecule's chemistry, replacing the previous automatic fallback system with explicit, transparent method selection.

## Why User-Selectable Methods?

**Problem**: Some ligands fail with default methods (MMFF94 charges, OpenFF force field):
- MMFF94 fails on unusual valence states (e.g., NVX_A_1351)
- OpenFF-2.2.0 fails on exotic atoms like carbenes (e.g., MPD_A_1352 with Cm atoms)

**Solution**: Let users choose which industry-standard method to use upfront:
- ✓ **Transparency**: You know exactly which method is running
- ✓ **Flexibility**: Different molecules need different approaches
- ✓ **Tried-and-tested**: Uses established packages (RDKit, OpenFF, AmberTools, ORCA)
- ✓ **Predictable**: No silent fallbacks that hide what actually ran

## Charge Calculation Methods

### MMFF94 (Default, Recommended)
- **Speed**: Fast (<1 second)
- **Quality**: Good for drug-like molecules
- **Coverage**: Strict atom typing, may fail on unusual valences
- **Use when**: Standard organic molecules, drug-like compounds
- **Fails on**: Exotic valences, metals, radicals

### Gasteiger
- **Speed**: Fast (<1 second)
- **Quality**: Acceptable for most molecules
- **Coverage**: More permissive than MMFF94
- **Use when**: MMFF94 fails, quick charge assignment needed
- **Fails on**: Very exotic chemistry

### AM1-BCC
- **Speed**: Slow (10-30 seconds per molecule)
- **Quality**: High quality, semiempirical quantum mechanics
- **Coverage**: Handles unusual chemistry (carbenes, metals, exotic bonds)
- **Use when**: Exotic chemistry, MMFF94/Gasteiger fail, production-quality charges needed
- **Requirements**: AmberTools must be installed in conda environment
- **Fails on**: Extremely large molecules (>200 atoms)

### ORCA (Quantum Chemistry)
- **Speed**: Very slow (5-10 minutes per molecule)
- **Quality**: Best quality, full DFT calculations
- **Coverage**: Handles anything
- **Use when**: All other methods fail, highest accuracy needed
- **Requirements**: ORCA binary installed and configured
- **Status**: **Planned for future release** (currently raises NotImplementedError)

## Force Field Methods

### OpenFF-2.2.0 (Default, Recommended)
- **Type**: Modern SMIRNOFF force field (Sage release)
- **Coverage**: Drug-like molecules, common atom types
- **Quality**: State-of-the-art for small molecules
- **Use when**: Standard organic molecules
- **Fails on**: Exotic atoms (carbenes, metals, unusual hybridization)
- **Note**: Limited atom type coverage compared to GAFF

### GAFF (General Amber Force Field)
- **Type**: Classic general small-molecule force field
- **Coverage**: Broad atom type coverage, proven for 20+ years
- **Quality**: Good, widely validated
- **Use when**: OpenFF fails, exotic atoms present
- **Version**: GAFF 1.81

### GAFF2
- **Type**: Modern update to GAFF
- **Coverage**: Even broader atom type coverage than GAFF
- **Quality**: Improved parameters over GAFF
- **Use when**: GAFF needed but want modern parameters
- **Version**: GAFF 2.11

## Usage Examples

### Example 1: Standard Drug-Like Molecule
```python
# Default methods work well
config = {
    'protein_pdb_data': protein_pdb,
    'ligand_smiles': 'CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O',  # Ibuprofen
    'charge_method': 'mmff94',  # Default
    'forcefield_method': 'openff-2.2.0',  # Default
}
```

### Example 2: Molecule with Unusual Valence (NVX)
```python
# MMFF94 fails, use AM1-BCC instead
config = {
    'protein_pdb_data': protein_pdb,
    'ligand_smiles': nvx_smiles,
    'charge_method': 'am1bcc',  # Handles unusual valences
    'forcefield_method': 'openff-2.2.0',  # Try OpenFF first
}
```

### Example 3: Molecule with Carbene Atoms (MPD)
```python
# OpenFF doesn't support carbenes, use GAFF
config = {
    'protein_pdb_data': protein_pdb,
    'ligand_smiles': mpd_smiles,
    'charge_method': 'gasteiger',  # Fast, permissive
    'forcefield_method': 'gaff',  # Broad atom coverage
}
```

### Example 4: Exotic Molecule (Organometallic)
```python
# Use highest quality methods
config = {
    'protein_pdb_data': protein_pdb,
    'ligand_smiles': organometallic_smiles,
    'charge_method': 'orca',  # Quantum chemistry (when available)
    'forcefield_method': 'gaff2',  # Most modern GAFF
}
```

## Frontend Usage

In the MD Optimization Tool, force field settings are in the **Parameters** step under **Force Field Settings** (collapsible section):

1. **Charge Method**: Select from MMFF94, Gasteiger, AM1-BCC, or ORCA
2. **Force Field**: Select from OpenFF-2.2.0, GAFF, or GAFF2

Descriptions in the UI guide you on when to use each method.

## Error Handling

If a selected method fails, you'll get a clear error message with suggestions:

```
Ligand preparation failed with MMFF94 charge assignment: Explicit valence error on atom O #6.
This atom's valence exceeds MMFF94 limits.

Try:
(1) Check input SMILES
(2) Use AM1-BCC or ORCA method instead
(3) Verify ligand structure in viewer
```

## Recommended Workflows

### For Standard Projects
1. Start with defaults: MMFF94 + OpenFF-2.2.0
2. If charge assignment fails → try AM1-BCC
3. If force field creation fails → try GAFF or GAFF2

### For Exotic Chemistry
1. Start with: AM1-BCC + GAFF2
2. If still fails → contact support or try ORCA (when available)

### For Production-Quality Results
1. Use: AM1-BCC + OpenFF-2.2.0 (if OpenFF supports the atoms)
2. Or: AM1-BCC + GAFF2 (for broader coverage)

## Technical Notes

### Backward Compatibility
- All existing code continues to work with defaults
- Previous automatic fallback behavior replaced with explicit selection
- Default methods unchanged: MMFF94 + OpenFF-2.2.0

### Performance Impact
- MMFF94/Gasteiger/OpenFF: No change in performance
- AM1-BCC: Adds 10-30 seconds to ligand preparation
- GAFF: Similar performance to OpenFF
- ORCA: Adds 5-10 minutes (when available)

### Implementation Details
- Charge methods: `services/md/workflow/ligand_processor.py`
- Force field methods: `services/md/workflow/system_builder.py`
- Configuration: `services/md/config.py`
- Frontend UI: `frontend/src/components/Tools/MDOptimizationTool.tsx`
- Type definitions: `frontend/src/types/md-types.ts`

## Future Enhancements

Planned additions:
1. **ORCA Integration**: Complete QC service integration for quantum chemical charges
2. **Additional Methods**: RESP, HF/6-31G*, B3LYP charges
3. **Additional Force Fields**: OPLS, UFF, NAMD CHARMM
4. **Automatic Suggestions**: Analyze molecule and suggest best methods
5. **Charge Caching**: Cache QC-calculated charges in PostgreSQL

## References

- [OpenFF Toolkit Documentation](https://docs.openforcefield.org/)
- [GAFF Force Field](http://ambermd.org/antechamber/gaff.html)
- [MMFF94 Original Paper](https://doi.org/10.1002/(SICI)1096-987X(199604)17:5/6<490::AID-JCC1>3.0.CO;2-P)
- [AM1-BCC Method](https://doi.org/10.1002/jcc.10128)
