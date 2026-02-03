# Batch Docking Mode Implementation

## Overview
Implemented batch mode for molecular docking in the docking sidebar tab using the unified UI approach. Users can now dock multiple ligands against a single protein in one workflow.

## Frontend Changes

### 1. **Type Definitions** (`frontend/src/types/docking.ts`)
- Added `BatchDockingJob` interface for tracking individual batch jobs
- Added `BatchDockingConfig` interface for batch docking requests
- Supports tracking job status, progress, results, and errors

### 2. **State Management** (`frontend/src/store/batch-docking-store.ts`)
- Created `useBatchDockingStore` using Zustand
- Manages:
  - `isBatchMode`: Toggle between single and batch docking
  - `jobs`: Array of batch docking jobs
  - `activeJobId`: Currently selected job for viewing results
  - Job CRUD operations: `addJob`, `updateJob`, `removeJob`, `clearJobs`

### 3. **API Integration** (`frontend/src/lib/api-client.ts`)
- Added `batchDockProteinLigands()` method
- Supports Server-Sent Events (SSE) streaming for real-time progress updates
- Handles per-job progress tracking with job IDs
- Endpoint: `/api/docking/batch_dock_protein_ligands`

### 4. **Batch Docking Panel** (`frontend/src/components/Tools/Docking/BatchDockingPanel.tsx`)
New component providing:
- **Ligand Selection**: Multi-select checkboxes for available ligands
- **Batch Execution**: Single button to run docking on all selected ligands
- **Job Management**: 
  - List of all batch jobs with status indicators
  - Progress bars for running jobs
  - Delete individual jobs
- **Results Display**:
  - View results for each completed job
  - Best affinity and pose count metrics
  - Results table with View/Save/MD optimization actions per pose
  - Inline pose visualization and management

### 5. **DockingTool Integration** (`frontend/src/components/Tools/DockingTool.tsx`)
- Added batch mode toggle in Step 1 (Selection)
- Conditional rendering:
  - **Batch Mode ON**: Shows `BatchDockingPanel` for multi-ligand selection
  - **Batch Mode OFF**: Shows standard single-ligand `StructureSelector`
- Maintains all existing single-docking functionality

## Key Features

### Batch Mode Workflow
1. **Enable Batch Mode**: Toggle checkbox in Selection step
2. **Select Protein**: Loaded automatically from current structure
3. **Select Ligands**: Check multiple ligands from available list
4. **Configure Parameters**: Same as single docking (Step 2)
5. **Set Grid Box**: Same as single docking (Step 3)
6. **Run Batch**: Click "Start Batch Docking" button
7. **Monitor Progress**: Real-time progress bars for each job
8. **View Results**: Click job to view results, interact with poses

### Job Management
- **Active Job Selection**: Click job in list to view/interact with results
- **Job Deletion**: Remove completed or failed jobs
- **Progress Tracking**: Real-time updates via SSE streaming
- **Status Indicators**: Color-coded status (pending/running/completed/failed)

### Results Interaction
For each completed job:
- **View Pose**: Visualize docked pose in 3D viewer
- **Save Pose**: Save best or any pose to library
- **Optimize with MD**: Launch MD optimization for selected pose
- **Metrics**: Best affinity, number of poses, binding strength

## Backend Requirements

The implementation expects a backend endpoint at `/api/docking/batch_dock_protein_ligands` that:

1. **Accepts POST requests** with `BatchDockingConfig`:
   ```json
   {
     "protein_pdb": "...",
     "ligands": [
       {
         "id": "ligand_id",
         "name": "Ligand Name",
         "data": "...",
         "format": "sdf|pdb",
         "resname": "LIG"
       }
     ],
     "grid_padding": 5.0,
     "docking_params": {
       "exhaustiveness": 8,
       "num_modes": 9,
       "energy_range": 100.0,
       "scoring_function": "vina"
     },
     "use_api": true
   }
   ```

2. **Returns SSE stream** with progress updates:
   ```
   data: {"job_id": "...", "progress": 25, "status": "Running ligand 1..."}
   data: {"job_id": "...", "progress": 50, "status": "Running ligand 2..."}
   data: {"success": true, "results": {...}}
   ```

3. **Supports concurrent processing** of multiple ligands

## UI/UX Design

### Unified Approach
- Uses existing shared components (`ParameterSection`, `InfoBox`, `ResultsTable`)
- Consistent styling with other tools (dark theme, blue accent color)
- Follows established workflow pattern (4-step process)
- Integrates seamlessly with existing single-docking mode

### Visual Hierarchy
- Batch mode toggle prominently displayed in Step 1
- Job list with status indicators and progress bars
- Results panel with metrics and action buttons
- Responsive layout for various screen sizes

## Integration Points

1. **Molecular Store**: Uses existing docking state for single-mode compatibility
2. **MD Store**: Launches MD optimization from batch results
3. **UI Store**: Manages tool activation and navigation
4. **API Client**: Centralized API communication
5. **Shared Components**: Reuses existing UI components for consistency

## Testing Checklist

- [ ] Toggle batch mode on/off
- [ ] Select multiple ligands
- [ ] Run batch docking with valid configuration
- [ ] Monitor real-time progress updates
- [ ] View results for completed jobs
- [ ] Visualize poses in 3D viewer
- [ ] Save poses to library
- [ ] Launch MD optimization from batch results
- [ ] Delete completed jobs
- [ ] Switch between jobs in results view
- [ ] Verify error handling for failed jobs
- [ ] Test with various ligand counts (2-10+)
- [ ] Verify grid box requirement is enforced
- [ ] Test protein/ligand validation

## Future Enhancements

1. **Batch Job History**: Persist completed jobs for later review
2. **Export Results**: Batch export of all poses/results
3. **Filtering**: Filter jobs by status, date, ligand name
4. **Comparison**: Side-by-side comparison of results across ligands
5. **Scheduling**: Queue jobs for sequential processing
6. **Parallel Processing**: Configurable concurrency limits
7. **Advanced Metrics**: Binding affinity distribution, RMSD analysis
8. **Batch Templates**: Save and reuse batch configurations
