# Dynamic CPU Core Allocation for ORCA - QC Tool

## Overview
Users can now dynamically select the number of CPU cores for ORCA quantum chemistry calculations from the frontend. The maximum number of cores is automatically detected from the system and enforced on both frontend and backend.

## Implementation

### Backend Changes

#### 1. Config Updates (`services/qc/config.py`)
- Added `import multiprocessing` to detect available CPU cores
- Added `MAX_N_PROCS = multiprocessing.cpu_count()` to get system CPU count
- Updated `DEFAULT_N_PROCS` to use minimum of 4 cores or available cores
- Default is now dynamic based on system: `min(4, MAX_N_PROCS)`

#### 2. New API Endpoint (`services/qc/routers.py`)
Added `GET /api/qc/system-info` endpoint that returns:
```json
{
  "max_cpu_cores": <system_cpu_count>,
  "default_cpu_cores": <default_n_procs>,
  "default_memory_mb": <default_memory>
}
```

This endpoint allows the frontend to:
- Display the maximum available cores to the user
- Enforce the limit on the input field
- Show recommendations based on system capabilities

### Frontend Changes

#### 1. QCAdvancedParameters Component (`frontend/src/components/Tools/QC/QCAdvancedParameters.tsx`)
- Added `maxCpuCores` state to track system maximum
- Added `useEffect` hook to fetch system info on component mount
- Calls `/api/qc/system-info` to get max cores
- Updated CPU cores input to:
  - Display max cores in label: `(max: {maxCpuCores})`
  - Enforce maximum with `Math.min()` on change
  - Set `max={maxCpuCores}` on input element
  - Show helpful text: "Scales ORCA performance linearly. More cores = faster calculations."
  - Display recommendations based on system cores:
    - Small molecules: `min(4, maxCpuCores)` cores
    - Larger systems: `min(8, maxCpuCores)+` cores

## How It Works

### User Flow - Standard QC
1. User opens QC Tool and navigates to Advanced Parameters
2. Frontend automatically fetches system info from `/api/qc/system-info`
3. CPU Cores input shows maximum available: `(max: 16)` for example
4. User can select any value from 1 to max cores
5. If user tries to enter higher value, it's clamped to maximum
6. Job is submitted with selected core count
7. ORCA runs with specified parallelization: `%pal nprocs=<selected_cores>`

### User Flow - IR, Fukui, Conformer
1. User selects calculation type (IR, Fukui, or Conformer)
2. Frontend fetches system info and displays max cores
3. UI shows CPU Cores field with max limit
4. User can select cores (defaults to 4 or system max, whichever is lower)
5. Job submitted with selected cores via Advanced Parameters
6. ORCA runs with specified parallelization

### Backend Processing
1. Job received with `n_procs` parameter
2. Config validates: `n_procs <= MAX_N_PROCS`
3. ORCA input generated with `%pal nprocs=<n_procs>` block
4. Memory per core calculated: `memory_mb / n_procs`
5. ORCA runs with: `%maxcore=<memory_per_core>`

## Benefits

✅ **User Control**: Users can optimize core usage based on their needs
✅ **System Aware**: Automatically detects available cores on any system
✅ **Performance Scaling**: Linear speedup with more cores (up to system limit)
✅ **Memory Management**: Automatic calculation of memory per core
✅ **Recommendations**: Smart suggestions based on molecule size and system capabilities
✅ **Flexible**: Works on systems with 2 cores or 128+ cores

## Configuration

### Environment Variables
Users can override defaults via environment variables:

```bash
# Set default cores (if not specified, uses min(4, available_cores))
export QC_DEFAULT_N_PROCS=8

# Set default memory
export QC_DEFAULT_MEMORY_MB=8000
```

### Examples

**Small Molecule (< 50 atoms)**
- Recommended: 4 cores
- Memory: 4000 MB (1000 MB per core)
- Fast optimization + frequency calculation

**Medium Molecule (50-100 atoms)**
- Recommended: 8 cores
- Memory: 8000 MB (1000 MB per core)
- Reasonable calculation time

**Large Molecule (> 100 atoms)**
- Recommended: 16+ cores (if available)
- Memory: 16000+ MB
- Parallel efficiency still good

## Testing

### Verify System Detection
1. Open QC Tool → Advanced Parameters
2. Check CPU Cores label shows: `(max: <your_system_cores>)`
3. Try entering a value higher than max - it should be clamped
4. Submit a job with different core counts and verify ORCA uses them

### Check ORCA Parallelization
In job output file, look for:
```
%pal nprocs=<selected_cores>
%maxcore=<memory_per_core>
```

## Performance Notes

- **Linear Scaling**: ORCA typically scales linearly up to 8-16 cores
- **Diminishing Returns**: Beyond 16 cores, scaling may be sublinear
- **Memory**: Ensure sufficient memory per core (1000-2000 MB recommended)
- **I/O**: Shared filesystems may become bottleneck at very high core counts

## Deployment

```bash
# Rebuild QC service to pick up config changes
docker compose build --no-cache qc

# Restart services
docker compose up -d qc

# Frontend changes are automatic (no rebuild needed)
```

## Files Modified

- `services/qc/config.py` - Added MAX_N_PROCS detection
- `services/qc/routers.py` - Added /api/qc/system-info endpoint
- `frontend/src/components/Tools/QC/QCAdvancedParameters.tsx` - Dynamic core selection UI
