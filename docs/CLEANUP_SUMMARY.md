# Legacy Code Cleanup Summary

## Date: November 16, 2025

This document summarizes the cleanup of legacy code from the Ligand-X project.

## Current Tech Stack (KEPT)

### Backend
- **Flask API** (`app.py`) - Main API server
- **Services** (`services/`) - All backend services including:
  - PDB Service
  - Structure Processor
  - Docking Service
  - Protein Alignment Service
  - Ketcher Service
  - Boltz-2 Service
  - MD Optimization Service
  - QC Service (Quantum Chemistry with Celery workers)
- **Utils** (`utils/`) - Utility modules

### Frontend
- **React/Next.js App** (`frontend/`)
  - Ketcher integration for molecular editor
  - Mol* (molstar npm package) for molecular viewer
  - Modern TypeScript/React components

### Workers
- **Celery** - Asynchronous task queue for QC calculations

## Removed Legacy Components

### 1. Legacy HTML Frontend
- ❌ `app.html` - jQuery/3Dmol.js/Kekule.js frontend
- ❌ `static/` - CSS and JS files for old frontend
- ✅ Updated `app.py` route `/` to return API health check instead of serving HTML

### 2. Demo and Test Files
- ❌ `demo_p30_workflow.py`
- ❌ `example_best_practice_workflow.py`
- ❌ All `test_*.py` files from root directory
- ❌ `fix_*.py` utility scripts
- ❌ `get_ligand_smiles.py`
- ❌ `check_dependencies.py`
- ❌ `verify_openff_environment.py`

### 3. Example Integration Code
- ❌ `flask_integration_enhanced.py` - Example code, not actively used

### 4. Legacy Configuration Files
- ❌ `postcss.config.js` - For old frontend
- ❌ `tailwind.config.js` - For old frontend
- ✅ Updated `package.json` - Removed kekule, tailwindcss, autoprefixer, sass

### 5. Documentation (Implementation Notes)
- ❌ `3dmol_info.md`
- ❌ `kekule_info.md`
- ❌ `ADMET_*.md`
- ❌ `BOLTZ2_API_DOCUMENTATION.md`
- ❌ `boltz-2-info.md`
- ❌ `DOCKING_SETUP.md`
- ❌ `FLASK_TO_PYFLYTE_MIGRATION_PLAN.md`
- ❌ `HYDROGEN_STANDARDIZATION.md`
- ❌ `IMPLEMENTATION_SUMMARY.md`
- ❌ `KETCHER_*.md`
- ❌ `md_optimization*.md`
- ❌ `POSE_PRESERVATION_GUIDE.md`
- ❌ `pyflyte*.md`
- ❌ `QC_*.md` (except QUANTUM_CHEMISTRY_SETUP.md which may still be useful)
- ❌ `SDF_*.md`
- ❌ `SMILES_*.md`
- ❌ `UPGRADE_BIOCHEM_PYTHON.md`

### 6. Test Data Files
- ❌ `darunavir_prepared.sdf`
- ❌ `test_4rt7_p30_results.json`
- ❌ `input.yaml`

### 7. Scripts
- ✅ Updated `start_app.sh` - Removed references to deleted `check_dependencies.py`

## Recommendations for Further Cleanup

The following items were NOT removed but you may want to consider:

### External Libraries in Repo
These should ideally be installed via package managers, not kept in the repo:
- `molstar/` - Should be npm package in frontend-react
- `opi/` - Should be pip package (orca-pi)
- `node_modules/` - Should be in .gitignore

### Output Directories
Consider adding to .gitignore:
- `md_outputs/`
- `qc_jobs/`
- `qc_results_db/`
- `uploads/`
- `__pycache__/` directories

### Workflow Systems
- `molpal_pyflyte/` - Flyte/Airflow workflows (if not actively used)

### Misc Files
- `=3.11` - Unknown file
- `vina` - Binary executable (should be installed, not in repo)
- `environment.yml` - Conda environment (keep if used, or document in INSTALL.md)
- `package-lock.json` - From old frontend (can be removed)

### Build Artifacts
- `frontend-react/tsconfig.tsbuildinfo` - TypeScript build artifact

## Updated Architecture

### Development Workflow
1. **Backend**: Run Flask API server
   ```bash
   ./start_app.sh
   # or
   python app.py
   ```

2. **Frontend**: Run React development server
   ```bash
   cd frontend-react
   npm run dev
   ```

3. **Celery Workers** (for QC calculations):
   ```bash
   celery -A services.qc_tasks worker --loglevel=info
   ```

### API Endpoints
- Flask API runs on `http://localhost:5000`
- React frontend runs on `http://localhost:3000`
- React app makes API calls to Flask backend

## Benefits of Cleanup

1. **Clearer codebase** - Easier to understand what's actively used
2. **Reduced confusion** - No mixing of old jQuery frontend with new React frontend
3. **Better maintainability** - Single source of truth for frontend (React)
4. **Modern stack** - React + TypeScript + Ketcher + Mol*
5. **API-first design** - Flask serves as pure API backend

## Migration Notes

If you have any code referencing the removed files:
- Old HTML frontend → Use React app in `frontend-react/`
- 3Dmol.js → Use Mol* viewer in React components
- Kekule.js → Use Ketcher in React components
- Test scripts → Move relevant tests to proper test directories

