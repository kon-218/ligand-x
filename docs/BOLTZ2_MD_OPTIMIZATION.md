# Boltz-2 MD Optimization Feature

## Overview
Added MD optimization capability for Boltz-2 predicted poses, matching the existing docking poses feature.

## What Was Implemented

### Frontend Components Updated

#### 1. `Boltz2StepResults.tsx`
Added MD optimization button next to the Save button in the poses table:

```tsx
// New prop in interface
onOptimizeWithMD?: (pose: Boltz2Pose, poseIndex: number) => void

// New button in poses table (line ~357-370)
{onOptimizeWithMD && (
  <Button
    size="sm"
    variant="outline"
    onClick={(e) => {
      e.stopPropagation()
      onOptimizeWithMD(pose, index)
    }}
    className="bg-blue-900/20 border-blue-700/50 hover:bg-blue-900/40 hover:border-blue-600"
    title="Optimize with MD"
  >
    <Activity className="h-3 w-3" />
  </Button>
)}
```

#### 2. `Boltz2Tool.tsx`
Implemented the MD optimization handler:

```tsx
// New imports
import { useUIStore } from '@/store/ui-store'
import { useMDStore } from '@/store/md-store'

// New handler function (line ~284-315)
const handleOptimizeWithMD = async (pose: any, poseIndex: number) => {
  try {
    if (!pose.structure_data) {
      throw new Error('No structure data available for this pose')
    }

    const mdStore = useMDStore()
    const uiStore = useUIStore()

    const poseName = `boltz2_pose_${poseIndex + 1}_${pose.affinity_pred_value?.toFixed(2)}.pdb`

    // Reset and configure MD store
    mdStore.reset()
    mdStore.setSelectedProtein('current')
    mdStore.setSelectedLigandMethod('structure')
    mdStore.setLigandInput({
      method: 'structure',
      file_data: pose.structure_data,
      file_name: poseName,
      preserve_pose: true,
      generate_conformer: false,
    })

    // Switch to MD tool
    uiStore.setActiveTool('md-optimization')
  } catch (error: any) {
    console.error('Failed to prepare MD optimization:', error)
    setError(error.message || 'Failed to prepare MD optimization')
  }
}

// Pass handler to component
<Boltz2StepResults
  // ... other props
  onOptimizeWithMD={handleOptimizeWithMD}
/>
```

## User Experience

### Before
Boltz-2 results showed:
- Load button (view in 3D)
- Save button (save to library)

### After
Boltz-2 results now show:
- Load button (view in 3D)
- Save button (save to library) - Green
- **Optimize with MD button (NEW)** - Blue with Activity icon

### Workflow
1. User runs Boltz-2 prediction
2. Results show multiple poses with scores
3. User clicks "Optimize with MD" button on desired pose
4. MD optimization tool opens with:
   - Protein: Current structure from viewer
   - Ligand: Boltz-2 predicted pose structure
   - Pose preservation enabled
   - No conformer generation (already 3D)
5. User can run MD optimization on the pose

## Feature Parity with Docking

| Feature | Docking | Boltz-2 |
|---------|---------|---------|
| MD optimization button | ✅ | ✅ |
| Button styling | Blue | Blue |
| Button icon | Activity | Activity |
| Pose preservation | ✅ | ✅ |
| Conformer generation | Disabled | Disabled |
| Tool switching | ✅ | ✅ |
| Error handling | ✅ | ✅ |

## Technical Details

### Configuration Passed to MD Store
```javascript
{
  method: 'structure',           // Use structure file, not SMILES
  file_data: pose.structure_data, // Boltz-2 predicted structure
  file_name: 'boltz2_pose_X_Y.pdb', // Descriptive name with affinity
  preserve_pose: true,           // Keep predicted orientation
  generate_conformer: false,     // Already has 3D coordinates
}
```

### Store State Management
- MD store is reset before configuration
- Protein is set to 'current' (from molecular viewer)
- Ligand method is set to 'structure' (not SMILES)
- UI automatically switches to MD optimization tool

## Files Modified
1. `/frontend/src/components/Tools/Boltz2/Boltz2StepResults.tsx`
   - Added callback prop
   - Added button in poses table

2. `/frontend/src/components/Tools/Boltz2Tool.tsx`
   - Added store imports
   - Implemented handler function
   - Passed handler to component

## Testing

### Manual Testing Steps
1. Navigate to Boltz-2 tool
2. Configure protein and ligand
3. Run prediction
4. In results, verify "Optimize with MD" button appears
5. Click button on a pose
6. Verify MD tool opens with pose data pre-filled
7. Run MD optimization
8. Compare results with docking pose optimization

### Expected Behavior
- Button appears only when callback is provided
- Clicking button switches to MD tool smoothly
- Pose structure is preserved during MD
- No errors in console
- MD optimization completes successfully

## Notes
- Implementation mirrors the docking poses feature exactly
- Uses same button styling and icons for consistency
- Maintains pose orientation (preserve_pose: true)
- No conformer generation since Boltz-2 already provides 3D structure
- Error handling matches docking implementation
