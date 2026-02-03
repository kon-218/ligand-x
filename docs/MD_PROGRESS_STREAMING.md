# MD Progress Streaming Implementation

## Overview

This document describes the implementation of real-time progress updates for the MD optimization service. The system provides granular progress feedback during the minimization, NVT, and NPT equilibration stages, enhancing the user experience for long-running molecular dynamics simulations.

## Architecture

### Progress Flow
```
5%  - Initializing MD optimization
10% - Preparing ligand (SMILES/structure)
15% - Preparing protein structure
20% - Building solvated system
30% - Running energy minimization
40% - Minimization completed
45% - Starting NVT equilibration
45-65% - NVT progress updates (10 intermediate updates)
65% - NVT completed
70% - Starting NPT equilibration
70-95% - NPT progress updates (10 intermediate updates)
95% - NPT completed
100% - MD optimization completed
```

### Implementation Components

#### 1. `equilibration_runner.py` - Progress Emission
- **`emit_progress()`** function writes structured JSON to stderr with `MD_PROGRESS:` prefix
- Progress updates are emitted at key points in each stage:
  - Stage start and end
  - Intermediate updates during NVT/NPT (every ~10% of steps)
- Format: `MD_PROGRESS:{"progress": N, "status": "...", "completed_stages": [...]}`

#### 2. `runner.py` - Progress Capture
- **`call_service_with_progress()`** generator function:
  - Runs service subprocess
  - Parses stderr for `MD_PROGRESS:` prefixed lines
  - Yields progress updates in real-time via queue
  - Returns final result or error

#### 3. `routers.py` - SSE Streaming
- **`stream_optimize`** endpoint updated to:
  - Use `call_service_with_progress()` instead of blocking `call_service()`
  - Bridge synchronous generator to async SSE generator
  - Yield Server-Sent Events as progress arrives

## Key Changes

### Before (Blocking)
```python
# Old implementation - blocked until completion
result = await loop.run_in_executor(
    executor, 
    lambda: call_service('md', input_data, timeout=3600)
)
```

### After (Streaming)
```python
# New implementation - streams progress
for update in call_service_with_progress('md', input_data, timeout=3600):
    if update['type'] == 'progress':
        yield f"data: {json.dumps(update['data'])}\n\n"
    elif update['type'] == 'result':
        service_result = update['data']
```

## Progress Details

### Minimization Stage
- **Start**: 30% - "Running energy minimization..."
- **End**: 40% - "Energy minimization completed"
- **Completed stages**: `["preparation", "minimization"]`

### NVT Equilibration Stage
- **Start**: 45% - "Starting NVT equilibration..."
- **Progress**: 45-65% - "NVT equilibration: X%" (10 updates)
- **End**: 65% - "NVT equilibration completed"
- **Completed stages**: `["preparation", "minimization", "nvt"]`

### NPT Equilibration Stage
- **Start**: 70% - "Starting NPT equilibration..."
- **Progress**: 70-95% - "NPT equilibration: X%" (10 updates)
- **End**: 95% - "NPT equilibration completed"
- **Completed stages**: `["preparation", "minimization", "nvt", "npt"]`

## Technical Implementation

### Progress Message Format
```json
{
    "progress": 55,
    "status": "NVT equilibration: 50%",
    "completed_stages": ["preparation", "minimization"]
}
```

### Thread + Queue Pattern
```python
# Service runs in thread, updates go to queue
def run_service_with_updates():
    for update in call_service_with_progress('md', input_data):
        update_queue.put(update)

# Async generator polls queue and yields SSE
while not service_done:
    try:
        update = update_queue.get(timeout=0.1)
        if update['type'] == 'progress':
            yield f"data: {json.dumps(update['data'])}\n\n"
    except queue.Empty:
        await asyncio.sleep(0.1)
```

## Cleanup Performed

### Removed Unused Code
1. **`SimulationRunner` methods** from `simulation/runner.py`:
   - `run_minimization()` - 50 lines
   - `run_nvt_equilibration()` - 50 lines  
   - `run_npt_equilibration()` - 60 lines
   - These were redundant after moving progress to `equilibration_runner.py`

2. **`SimulationRunner` instantiation** from `service.py`:
   - Removed `self.simulation_runner = SimulationRunner(output_dir)`
   - Class no longer used anywhere in codebase

### Why This Was Safe
- No references to these methods found in codebase
- No test files using these methods
- `equilibration_runner.py` has its own implementation with progress reporting
- All functionality preserved in new architecture

## Benefits

1. **Real-time Feedback**: Users see progress during long-running simulations
2. **Better UX**: No more "black box" after preparation stage
3. **Granular Updates**: ~20 progress updates total instead of just 5
4. **Non-blocking**: Frontend remains responsive during calculations
5. **Error Visibility**: Errors are streamed as they occur

## Testing

### To Verify Progress Updates:
1. Start an MD optimization via the frontend
2. Observe progress bar updates through all stages
3. Check browser console for SSE events
4. Verify logs show `MD_PROGRESS:` messages

### To Verify Cleanup:
1. All Python files compile without errors
2. MD service runs successfully
3. No import errors for removed code
4. Progress updates still work correctly

## Files Modified

### Core Implementation
- `services/md/workflow/equilibration_runner.py` - Added progress emission
- `lib/services/runner.py` - Added `call_service_with_progress()` generator
- `services/md/routers.py` - Updated to use streaming approach

### Cleanup
- `services/md/service.py` - Removed unused SimulationRunner instantiation
- `services/md/simulation/runner.py` - Removed unused methods (160 lines)

### Documentation
- `docs/MD_PROGRESS_STREAMING.md` - This document

## Future Enhancements

1. **More Granular Progress**: Could add progress within minimization
2. **ETA Calculation**: Estimate time remaining based on step rate
3. **Pause/Resume**: Allow users to pause long-running simulations
4. **Progress Cancellation**: Cancel button for long operations

## Status

✅ **IMPLEMENTATION COMPLETE**
- Progress streaming working for all MD stages
- Unused code cleaned up
- Documentation updated
- Ready for production use
