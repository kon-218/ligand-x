# ADMET SMILES Integration

## Overview
SMILES molecules can now use the ADMET predictor in the React app. This integration allows users to run ADMET predictions on molecules from both the current structure's ligands and the molecule library.

## Changes Made

### 1. Enhanced ADMET Tool (`frontend-react/src/components/Tools/ADMETTool.tsx`)

#### New Features:
- **Dual Source Support**: The ADMET tool now fetches molecules from two sources:
  - Ligands from the current loaded structure
  - Molecules saved in the user's library (with SMILES data)

- **Grouped Selector**: The molecule selector now displays options in organized groups:
  - "From Current Structure" - ligands from loaded PDB files
  - "From Library" - saved molecules with SMILES

- **Refresh Button**: Added a refresh button to update the available molecules list

#### Implementation Details:
```typescript
interface MoleculeOption {
  id: string
  name: string
  smiles?: string
  pdb_data?: string
  source: 'structure' | 'library'
}
```

The tool fetches molecules using:
- Current structure ligands from `currentStructure.ligands`
- Library molecules from `api.getMolecules()`

### 2. Enhanced Library Tool (`frontend-react/src/components/Tools/LibraryTool.tsx`)

#### New Features:
- **Quick ADMET Button**: Each molecule in the library now has an "ADMET" button
- **One-Click Predictions**: Click the ADMET button to:
  1. Run ADMET prediction on the molecule's SMILES
  2. Automatically switch to the ADMET tool
  3. Display the results

#### UI Enhancement:
- Added purple/pink gradient ADMET button alongside View 3D and Download buttons
- Shows loading spinner while prediction is running
- Seamless tool switching after prediction completes

## User Workflow

### Method 1: From ADMET Tool
1. Navigate to the ADMET tool in the side panel
2. Click the "Refresh" button to load all available molecules
3. Select a molecule from either:
   - "From Current Structure" group (ligands)
   - "From Library" group (saved SMILES molecules)
4. Click "Run ADMET Prediction"
5. View results in the categorized display

### Method 2: From Library Tool (Quick Access)
1. Navigate to the Library tool
2. Find the molecule you want to analyze
3. Click the "ADMET" button on the molecule card
4. Automatically switched to ADMET tool with results displayed

## Backend Support

The backend endpoint `/predict_admet` already supported both SMILES and PDB data:

```python
@app.route('/predict_admet', methods=['POST'])
def predict_admet():
    data = request.get_json()
    smiles = data.get('smiles')
    pdb_data = data.get('pdb_data')
    
    # Handles both SMILES and PDB input
    if not smiles and not pdb_data:
        return jsonify({"error": "Either 'pdb_data' or 'smiles' must be provided."}), 400
```

The frontend now fully utilizes this flexibility.

## Benefits

1. **Unified Experience**: Users can run ADMET predictions on any molecule, regardless of source
2. **Library Integration**: Saved SMILES molecules in the library are now fully integrated with ADMET workflow
3. **Flexibility**: Multiple pathways to run predictions (ADMET tool or Library tool)
4. **Better Organization**: Clear grouping of molecule sources in the selector
5. **Quick Access**: One-click ADMET from library for faster analysis

## Technical Notes

- **API Compatibility**: Uses existing `api.predictADMET()` function
- **State Management**: Utilizes Zustand stores for cross-component state
- **Error Handling**: Graceful fallback if library fetch fails
- **Auto-selection**: Automatically selects molecule if only one is available
- **Tool Switching**: Seamless transition between Library and ADMET tools

## Example Use Cases

### Use Case 1: Analyze a Drawn Molecule
1. Use Ketcher to draw a molecule
2. Save it to the library
3. Click "ADMET" button in library
4. View pharmacokinetic properties

### Use Case 2: Compare Multiple Molecules
1. Save several molecules to library
2. Open ADMET tool
3. Select each molecule from the "From Library" group
4. Compare ADMET properties

### Use Case 3: Analyze Protein-Bound Ligands
1. Load a PDB structure with ligands
2. Open ADMET tool
3. Select ligands from "From Current Structure" group
4. Analyze binding site molecules

## Future Enhancements

Potential improvements:
- Batch ADMET predictions for multiple molecules
- Export ADMET results to CSV
- ADMET comparison view for multiple molecules
- Integration with docking results
- ADMET filtering in molecule library

