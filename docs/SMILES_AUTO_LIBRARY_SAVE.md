# SMILES Auto Library Save Feature

## Overview
SMILES molecules are now automatically saved to the molecule library when uploaded. This provides a seamless experience where users can immediately use their SMILES molecules with ADMET predictor and other tools.

## Changes Made

### 1. Backend Enhancement (`app.py`)

#### Modified `/upload_smiles` Endpoint
The endpoint now automatically saves molecules to the library after successful processing:

```python
@app.route('/upload_smiles', methods=['POST'])
def upload_smiles():
    """
    API endpoint to upload a SMILES string and process it as a ligand structure.
    Converts SMILES to 3D coordinates and integrates with the main visualizer and ligand system.
    Also automatically saves the molecule to the library.
    """
```

**Key Features:**
- **Duplicate Detection**: Checks if molecule already exists using canonical SMILES
- **Automatic Save**: Saves to library without requiring separate action
- **Non-Blocking**: If library save fails, the structure generation still succeeds
- **Status Reporting**: Returns library save status in response

**Response Format:**
```json
{
  "structure_id": "molecule_name",
  "format": "sdf",
  "sdf_data": "...",
  "pdb_data": "...",
  "components": {...},
  "smiles": "CCO",
  "source": "smiles_upload",
  "library_save": {
    "saved": true,
    "molecule_id": 123
  }
}
```

**Library Save Results:**
1. **New Molecule Saved:**
   ```json
   "library_save": {
     "saved": true,
     "molecule_id": 123
   }
   ```

2. **Molecule Already Exists:**
   ```json
   "library_save": {
     "already_exists": true,
     "molecule_id": 45
   }
   ```

3. **Save Failed (Non-Critical):**
   ```json
   "library_save": {
     "saved": false,
     "error": "Error message"
   }
   ```

### 2. Frontend Enhancement (`frontend-react/src/components/Tools/InputTool.tsx`)

#### Updated SMILES Handler
Added notification logic to inform users about library save status:

```typescript
const handleSMILES = async () => {
  // ... existing code ...
  
  const structure = await api.uploadSmiles(smiles)
  addStructureTab(structure, structure.structure_id || 'SMILES')
  addNotification('success', 'Generated 3D structure from SMILES')
  
  // Check if molecule was saved to library
  if (structure.library_save) {
    if (structure.library_save.saved) {
      addNotification('success', `Saved to library: ${structure.structure_id}`)
    } else if (structure.library_save.already_exists) {
      addNotification('info', 'Molecule already exists in library')
    }
  }
}
```

**User Notifications:**
- ✅ Success: "Generated 3D structure from SMILES"
- ✅ Success: "Saved to library: [molecule_name]"
- ℹ️ Info: "Molecule already exists in library"

## User Workflow

### Before This Feature:
1. User enters SMILES in Input tool
2. Click "Load Structure"
3. 3D structure appears in viewer
4. **Manual step:** Navigate to Molecule Editor
5. **Manual step:** Click "Save to Library"
6. **Manual step:** Enter name and confirm
7. Now can use with ADMET predictor

### After This Feature:
1. User enters SMILES in Input tool
2. Click "Load Structure"
3. 3D structure appears in viewer
4. **Automatically saved to library** ✅
5. Immediately available in ADMET predictor ✅

## Integration with ADMET Feature

This works seamlessly with the ADMET SMILES integration:

### Complete Workflow Example:
1. **Input SMILES:**
   - Navigate to Input tool
   - Enter SMILES: `CC(=O)Oc1ccccc1C(=O)O` (aspirin)
   - Click "Load Structure"
   - See notifications:
     - "Generated 3D structure from SMILES"
     - "Saved to library: SMILES_molecule_CC(=O)Oc1cc"

2. **Run ADMET:**
   - Navigate to ADMET tool
   - Click "Refresh" button
   - Select molecule from "From Library" group
   - Click "Run ADMET Prediction"
   - View pharmacokinetic properties

3. **Alternative - Quick ADMET:**
   - Navigate to Library tool
   - Find the saved molecule
   - Click "ADMET" button
   - Automatically switched to ADMET tool with results

## Benefits

### 1. Streamlined User Experience
- One-click SMILES upload now includes library save
- No need for manual save steps
- Immediate availability in all tools

### 2. Consistency
- All SMILES molecules automatically tracked in library
- Easy to revisit and reuse molecules
- Centralized molecule management

### 3. ADMET Integration
- SMILES molecules immediately available for ADMET predictions
- Library becomes central hub for molecule analysis
- Seamless workflow from input to prediction

### 4. Data Preservation
- Molecules are automatically archived
- No risk of losing molecule data
- Can download as SDF later

### 5. Smart Duplicate Prevention
- Checks canonical SMILES to avoid duplicates
- Informs user if molecule already exists
- Prevents library clutter

## Technical Details

### Canonical SMILES Matching
The system uses RDKit's canonical SMILES to detect duplicates:

```python
canonical_smiles = Chem.MolToSmiles(mol, canonical=True)

# Check existing molecules
for existing_molecule in molecules.values():
    if existing_molecule.get('canonical_smiles') == canonical_smiles:
        molecule_exists = True
```

This ensures:
- Different SMILES representations of same molecule are detected
- `CCO` and `OCC` are recognized as identical (ethanol)
- Prevents duplicate entries with different notations

### Molecular Properties Calculated
Each saved molecule includes:
- **Canonical SMILES**: Standardized notation
- **Molecular Weight**: Exact molecular mass
- **LogP**: Lipophilicity (partition coefficient)
- **Atom Count**: Total number of atoms
- **Bond Count**: Total number of bonds
- **Source**: Marked as 'smiles_upload'

### Error Handling
- Structure generation continues even if library save fails
- Warnings logged but don't interrupt workflow
- User still gets 3D structure for visualization
- Only affects library functionality, not primary use case

## Testing

### Test Case 1: New SMILES Upload
```bash
# Input: CCO (ethanol)
Expected:
✅ 3D structure generated
✅ Saved to library
✅ Two success notifications
✅ Molecule appears in Library tool
✅ Available in ADMET selector
```

### Test Case 2: Duplicate SMILES Upload
```bash
# Input: CCO (already in library)
Expected:
✅ 3D structure generated
✅ Duplicate detected
ℹ️ Info notification: "Molecule already exists in library"
✅ No duplicate entry created
```

### Test Case 3: Complex SMILES
```bash
# Input: CC(C)Cc1ccc(cc1)C(C)C(=O)O (ibuprofen)
Expected:
✅ 3D structure generated with correct stereochemistry
✅ Saved with full molecular properties
✅ Available for ADMET prediction
✅ Can download as SDF
```

### Test Case 4: End-to-End ADMET Workflow
```bash
1. Upload SMILES: CC(=O)Oc1ccccc1C(=O)O
2. Check Library tool - molecule present
3. Open ADMET tool
4. Refresh available molecules
5. Select from "From Library" group
6. Run ADMET prediction
Expected:
✅ All steps complete successfully
✅ ADMET properties displayed
✅ No errors or missing data
```

## API Compatibility

### Backward Compatibility
- Existing code still works without changes
- `library_save` field is optional in responses
- Frontend can ignore it if not needed
- Non-breaking addition to API

### Frontend Integration
Any component using `api.uploadSmiles()` gets the benefit:
- InputTool (manual SMILES entry)
- Boltz2Tool (SMILES ligand input)
- Future tools that need SMILES processing

## Future Enhancements

### Potential Improvements:
1. **Batch Upload**: Support multiple SMILES at once
2. **Custom Names**: Allow name specification in Input tool
3. **Library Folders**: Organize molecules by category
4. **Tags**: Add searchable tags to molecules
5. **Export**: Bulk export library as CSV/SDF
6. **Import**: Bulk import from SMILES files
7. **Provenance**: Track molecule source and history
8. **Sharing**: Export/import library between sessions

## Documentation Updates

This feature is documented in:
- `ADMET_SMILES_INTEGRATION.md` - ADMET feature overview
- `ADMET_SMILES_TEST_GUIDE.md` - Testing procedures
- `SMILES_AUTO_LIBRARY_SAVE.md` - This document (library auto-save)

## Related Features

This feature complements:
1. **ADMET SMILES Integration** - Makes molecules available for ADMET
2. **Molecule Library Tool** - Central repository for molecules
3. **Molecule Editor** - Alternative input method
4. **Structure Upload** - PDB/SDF file handling

## Success Criteria

✅ SMILES uploads automatically save to library
✅ Duplicate detection prevents redundant entries
✅ Users receive clear notifications
✅ No breaking changes to existing functionality
✅ ADMET predictor has immediate access to molecules
✅ Error handling prevents workflow interruption
✅ Backward compatible with existing code

