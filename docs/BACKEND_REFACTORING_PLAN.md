# Backend Refactoring Implementation Plan

## Critical Evaluation of Original Analysis

After thorough code review, here's my assessment of the original analysis with corrections and refinements:

### Validated Findings ✅

| Finding | Original Assessment | Verified |
|---------|---------------------|----------|
| MD service.py | 2,151 lines | ✅ 2,150 lines |
| QC tasks.py | 1,432 lines | ✅ 1,431 lines |
| ABFE service.py | 1,395 lines | ✅ 1,394 lines |
| molecular_utils.py | 935 lines | ✅ 934 lines |
| Test coverage minimal | 1 test file | ✅ Confirmed |
| Gateway router duplication | High | ✅ `_proxy_request` duplicated 10+ times |

### Corrections to Original Analysis ⚠️

1. **ServiceResponse already exists**: `lib/common/responses.py` (147 lines) already implements:
   - `ServiceResponse[T]` generic model
   - `PaginatedResponse` 
   - `JobStatus` model
   - `success_response()` / `error_response()` helpers
   - `ErrorCodes` constants
   
   **Impact**: Priority 3 is partially complete - adoption is the issue, not creation.

2. **Structure service.py is smaller**: Original said 1,002 lines, actual is 568 lines.

3. **Gateway routers are smaller than stated**: Original said 808 lines for routers.py, but MD routers.py is 808 lines total (the largest service router), not gateway.

4. **Job management is more fragmented than described**:
   - QC: Celery + JSON file persistence + `AsyncResult`
   - ABFE: File-based (`jobs_dir/*.json`) + in-memory dict cache
   - MD: No job tracking (synchronous via `call_service`)

---

## Revised Priority Matrix

### 🔴 P1: Monolithic Service Files (Impact: 9/10, Effort: High)

**Actual problem**: Complex domain logic mixed with infrastructure code.

**Files requiring split**:

| File | Lines | Recommended Split |
|------|-------|-------------------|
| `services/md/service.py` | 2,150 | 5-6 modules |
| `services/qc/tasks.py` | 1,431 | 3-4 modules |
| `services/abfe/service.py` | 1,394 | 4-5 modules |
| `lib/chemistry/molecular_utils.py` | 934 | 4-5 modules |

**MD Service Split Plan**:
```
services/md/
├── service.py              # Keep: Main class, __init__, status methods (~200 lines)
├── preparation/
│   ├── __init__.py
│   ├── protein.py          # Protein preparation, cleaning (~300 lines)
│   ├── ligand.py           # Ligand preparation, charge assignment (~400 lines)
│   └── system.py           # System building, solvation (~300 lines)
├── simulation/
│   ├── __init__.py
│   ├── minimization.py     # Energy minimization (~200 lines)
│   ├── equilibration.py    # NVT/NPT equilibration (~400 lines)
│   └── trajectory.py       # Trajectory processing (~300 lines)
└── utils/
    ├── __init__.py
    └── pdb_writer.py       # PDB file utilities (~100 lines)
```

**QC Tasks Split Plan**:
```
services/qc/
├── tasks.py                # Keep: Celery app config, task decorators (~200 lines)
├── jobs/
│   ├── __init__.py
│   ├── orca_job.py         # Main ORCA job execution (~400 lines)
│   ├── fukui_job.py        # Fukui indices calculation (~200 lines)
│   ├── conformer_job.py    # Conformer search (~200 lines)
│   └── ir_job.py           # IR spectrum calculation (~200 lines)
└── utils/
    ├── __init__.py
    └── result_persistence.py # JSON DB operations (~150 lines)
```

---

### 🔴 P2: Test Infrastructure (Impact: 9/10, Effort: Medium)

**Current state**: 1 test file (`test_orca_parser_integration.py`, 4KB)

**Recommended structure**:
```
tests/
├── conftest.py                    # Shared fixtures
├── unit/
│   ├── __init__.py
│   ├── lib/
│   │   ├── test_molecular_utils.py
│   │   └── test_responses.py
│   └── services/
│       ├── test_md_preparation.py
│       ├── test_qc_parsers.py
│       └── test_structure_processor.py
├── integration/
│   ├── __init__.py
│   ├── test_gateway_routing.py
│   └── test_service_runner.py
└── fixtures/
    ├── molecules/
    │   ├── water.xyz
    │   └── aspirin.sdf
    └── proteins/
        └── sample.pdb
```

**pytest.ini** (to create):
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
markers =
    slow: marks tests as slow
    integration: marks tests as integration tests
```

---

### 🟠 P3: Adopt Existing Response Models (Impact: 7/10, Effort: Low)

**Problem**: `lib/common/responses.py` exists but is NOT used by any service.

**Current patterns** (inconsistent):
```python
# QC service - returns tuple
return {"error": "message"}, 400

# MD router - checks success flag
if not service_result.get('success'):
    raise HTTPException(...)

# ABFE service - returns dict
return {'status': 'error', 'error': str(e)}
```

**Solution**: Create adoption guide and migrate incrementally.

**Quick win**: Add error handling decorator to `lib/common/`:

```python
# lib/common/decorators.py
from functools import wraps
import traceback
import logging
from fastapi import HTTPException

def handle_service_errors(logger: logging.Logger = None):
    """Decorator for consistent error handling in routers."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as e:
                error_traceback = traceback.format_exc()
                if logger:
                    logger.error(f"{func.__name__} error: {e}\n{error_traceback}")
                raise HTTPException(status_code=500, detail=str(e))
        return wrapper
    return decorator
```

---

### 🟠 P4: Gateway Router Consolidation (Impact: 6/10, Effort: Low)

**Problem**: `_proxy_request` function duplicated in 10 router files (nearly identical).

**Files with duplication**:
- `gateway/routers/admet.py` (lines 11-53)
- `gateway/routers/alignment.py` (lines 11-58)
- `gateway/routers/boltz2.py`
- `gateway/routers/docking.py`
- `gateway/routers/ketcher.py`
- `gateway/routers/md.py`
- `gateway/routers/msa.py`
- `gateway/routers/qc.py`
- `gateway/routers/structure.py`

**Solution**: Extract to shared utility:

```python
# gateway/utils/proxy.py
from fastapi import HTTPException, Request
from fastapi.responses import Response
import httpx

async def proxy_request(
    method: str, 
    url: str, 
    request: Request, 
    params: dict,
    timeout: float = 300.0
) -> dict | Response:
    """Shared proxy request handler for all gateway routers."""
    content_type = request.headers.get("content-type", "")
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        # ... implementation
```

Then each router becomes:
```python
# gateway/routers/admet.py
from gateway.utils.proxy import proxy_request

@router.api_route("/predict_admet", methods=["POST"])
async def predict_admet(request: Request):
    return await proxy_request("POST", f"{ADMET_URL}/predict_admet", request, {})
```

---

### 🟠 P5: Unified Job Management (Impact: 6/10, Effort: High)

**Current implementations**:

| Service | Storage | Status Method | Notes |
|---------|---------|---------------|-------|
| QC | Celery + JSON files | `AsyncResult` + `load_results_from_db` | Most mature |
| ABFE | File-based + in-memory | `_save_job_status()`, `get_job_status()` | Custom implementation |
| MD | None (synchronous) | N/A | Uses `call_service()` |

**Recommendation**: Extend QC's pattern to other services rather than creating new abstraction.

**Unified interface** (add to `lib/common/job_manager.py`):
```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from pathlib import Path
import json

class JobManager(ABC):
    """Abstract base for job management across services."""
    
    @abstractmethod
    def create_job(self, job_type: str, params: dict) -> str:
        """Create job and return job_id."""
        pass
    
    @abstractmethod
    def get_status(self, job_id: str) -> dict:
        """Get job status."""
        pass
    
    @abstractmethod
    def update_status(self, job_id: str, status: str, **kwargs):
        """Update job status."""
        pass


class FileBasedJobManager(JobManager):
    """File-based job manager (for services without Celery)."""
    
    def __init__(self, jobs_dir: Path):
        self.jobs_dir = Path(jobs_dir)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
    
    # ... implementation
```

---

### 🟡 P6: Deprecated Code Cleanup (Impact: 3/10, Effort: Low)

**Files with deprecated methods**:

`services/structure/processor.py`:
- `_identify_components()` (line 183) - delegates to `molecular_utils`
- `_calculate_center_of_mass()` (line 244) - delegates to `molecular_utils`
- `_extract_component_as_pdb()` - mentioned in docstring

**Action**: Remove deprecated methods and update docstrings.

---

### 🟡 P7: molecular_utils.py Refactoring (Impact: 5/10, Effort: Medium)

**Current**: 934 lines, single class `MolecularUtils` with 45+ methods.

**Recommended split**:
```
lib/chemistry/
├── __init__.py              # Re-export for backward compatibility
├── molecular_utils.py       # Keep: Main class, backward compat (~100 lines)
├── parsers/
│   ├── __init__.py
│   ├── pdb.py               # PDB parsing (~150 lines)
│   └── mmcif.py             # mmCIF parsing (~100 lines)
├── preparation/
│   ├── __init__.py
│   ├── protein.py           # Protein cleaning, H addition (~200 lines)
│   └── ligand.py            # Ligand preparation (~150 lines)
├── analysis/
│   ├── __init__.py
│   └── components.py        # Component identification (~150 lines)
└── smiles_lookup.py         # Keep as-is
```

---

## Implementation Phases

### Phase 1: Quick Wins (Week 1) ✨

| Task | File | Effort | Impact |
|------|------|--------|--------|
| Create `lib/common/decorators.py` | New file | 1 hour | High |
| Extract `gateway/utils/proxy.py` | New file | 2 hours | Medium |
| Create `pytest.ini` and `conftest.py` | New files | 1 hour | High |
| Remove deprecated methods from `processor.py` | Edit | 30 min | Low |

### Phase 2: Gateway Consolidation (Week 2)

| Task | Files | Effort |
|------|-------|--------|
| Refactor all gateway routers to use shared proxy | 10 files | 4 hours |
| Add timeout configuration per service type | 1 file | 1 hour |
| Add logging to proxy utility | 1 file | 30 min |

### Phase 3: MD Service Split (Week 3-4)

| Task | Effort |
|------|--------|
| Create `services/md/preparation/` module | 8 hours |
| Create `services/md/simulation/` module | 8 hours |
| Create `services/md/utils/` module | 2 hours |
| Update imports and tests | 4 hours |

### Phase 4: QC Tasks Split (Week 5)

| Task | Effort |
|------|--------|
| Create `services/qc/jobs/` module | 6 hours |
| Extract result persistence | 2 hours |
| Update Celery task registration | 2 hours |

### Phase 5: Test Suite (Week 6-7)

| Task | Effort |
|------|--------|
| Unit tests for `molecular_utils` | 4 hours |
| Unit tests for MD preparation | 4 hours |
| Integration tests for gateway | 4 hours |
| Integration tests for service runner | 4 hours |

### Phase 6: molecular_utils Split (Week 8)

| Task | Effort |
|------|--------|
| Create parser modules | 4 hours |
| Create preparation modules | 4 hours |
| Update all imports across services | 4 hours |
| Verify backward compatibility | 2 hours |

---

## Verification Commands

### Run existing tests
```bash
cd /home/konstantin-nomerotski/Documents/app
pytest tests/test_orca_parser_integration.py -v
```

### Check Docker services
```bash
docker compose up -d
docker compose ps
docker compose logs gateway --tail 50
```

### Verify imports after refactoring
```bash
# Check for import errors
python -c "from lib.chemistry import get_pdb_parser, get_component_analyzer, get_protein_preparer, get_ligand_preparer; print('Chemistry OK')"
python -c "from services.md.service import MDOptimizationService; print('MD OK')"
python -c "from services.qc.tasks import celery_app; print('QC OK')"
python -c "from services.docking.service import DockingService; print('Docking OK')"
python -c "from services.structure.processor import StructureProcessor; print('Structure OK')"
```

### API smoke tests
```bash
curl http://localhost:8000/api/structure/status
curl http://localhost:8000/api/md/status
curl http://localhost:8000/api/qc/presets
```

---

## Risk Mitigation

1. **Import breakage**: Create `__init__.py` files that re-export for backward compatibility
2. **Celery task discovery**: Ensure split task files are properly imported in `tasks.py`
3. **Docker volume mounts**: Verify new directories are included in volume mappings
4. **Test coverage gaps**: Add tests BEFORE refactoring critical paths

---

## Recommended Starting Point

**Start with Phase 1 Quick Wins** - these provide immediate value with minimal risk:

1. `lib/common/decorators.py` - reduces boilerplate immediately
2. `gateway/utils/proxy.py` - eliminates ~500 lines of duplication
3. `pytest.ini` + `conftest.py` - enables proper test development

Would you like me to implement any of these phases?
