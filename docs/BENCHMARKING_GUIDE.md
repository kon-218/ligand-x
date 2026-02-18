# Ligand-X Benchmarking Guide

## Overview

Ligand-X includes a comprehensive benchmarking framework to validate computational protocols against experimental data. This ensures that docking, RBFE, and ABFE calculations produce accurate and reliable results.

## Why Benchmark?

Benchmarking serves multiple purposes:

1. **Validation**: Verify that computational protocols reproduce experimental results
2. **Quality Control**: Detect regressions when updating algorithms or dependencies
3. **Parameter Optimization**: Compare different protocol settings to find optimal configurations
4. **Publication**: Provide documented validation for research publications
5. **Trust**: Build confidence in computational predictions

## Benchmark Systems

### T4 Lysozyme L99A Benzene Series

The primary benchmark system validates all three computational protocols:

**System Description:**
- **Protein**: T4 Lysozyme with L99A mutation
- **Binding Site**: Hydrophobic cavity created by L99A mutation
- **Ligands**: Benzene and n-alkylbenzene congeneric series (7 compounds)
- **Crystal Structures**: PDB IDs 4w52-59

**Why This System?**
- Well-studied in computational chemistry literature
- High-quality crystal structures (1.55-1.95 Å resolution)
- Complete experimental binding data
- Congeneric series ideal for RBFE validation
- Used in OpenFE validation studies

**Experimental Data:**

| Ligand | PDB ID | Kd (μM) | ΔG (kcal/mol) | ΔΔG (kcal/mol) |
|--------|--------|---------|---------------|----------------|
| Benzene | 4w52 | 3100 | -3.47 | 0.00 (ref) |
| Toluene | 4w53 | 590 | -4.30 | -0.83 |
| Ethylbenzene | 4w54 | 200 | -4.94 | -1.47 |
| n-Propylbenzene | 4w55 | 97 | -5.37 | -1.90 |
| n-Butylbenzene | 4w57 | 20 | -6.36 | -2.89 |
| n-Pentylbenzene | 4w58 | 12 | -6.68 | -3.21 |
| n-Hexylbenzene | 4w59 | 13 | -6.64 | -3.17 |

**Expected Performance:**
- **Docking**: 80-100% success rate (RMSD < 2.0 Å)
- **RBFE**: Pearson r > 0.7, RMSE < 2.0 kcal/mol
- **ABFE**: Absolute error < 3.0 kcal/mol

## Running Benchmarks

### Prerequisites

1. Ligand-X services running:
```bash
make dev  # or docker-compose up
```

2. Services healthy:
```bash
curl http://localhost:8000/health
```

3. Database initialized:
```bash
# Migration should be run automatically, but verify:
psql -U ligandx -d ligandx -c "SELECT COUNT(*) FROM benchmark_runs;"
```

### Basic Usage

**Run complete benchmark:**
```bash
python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene
```

This will:
1. Fetch crystal structures from RCSB PDB
2. Run docking validation (7 ligands, ~30 min)
3. Run RBFE calculations (6-12 transformations, ~12-48 hours)
4. Run ABFE on best ligand (~8-24 hours)
5. Generate HTML and JSON reports

**View progress:**
```bash
# Tail the log file
tail -f benchmark_run.log

# Or check Flower monitoring
open http://localhost:5555/flower
```

**Results location:**
```
data/benchmark_outputs/t4l99a_benzene/
├── t4l99a_benzene_run_20260213_143022_report.json
└── t4l99a_benzene_run_20260213_143022_report.html
```

### Advanced Usage

**Run specific stages:**
```bash
# Docking only (quick validation, ~30 min)
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-rbfe --skip-abfe

# RBFE only (most critical validation)
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-docking --skip-abfe
```

**Custom run name:**
```bash
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --run-name "fast_mode_test" \
  --skip-abfe
```

**Test against different API:**
```bash
# Production server
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --api-url https://ligandx-prod.example.com

# Local dev with different port
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --api-url http://localhost:9000
```

## Interpreting Results

### Docking Results

**HTML Report Section:**
- Success rate: Percentage with RMSD < 2.0 Å
- Mean RMSD: Average deviation from crystal structure
- Per-ligand table: Individual RMSD values

**Pass Criteria:**
- ✅ **PASS**: Success rate ≥ 80%
- ⚠️ **WARNING**: Success rate 60-80%
- ❌ **FAIL**: Success rate < 60%

**Example:**
```
Success Rate: 85.7% (6/7)
Mean RMSD: 1.45 ± 0.63 Å
Range: 0.82 - 2.31 Å
Assessment: PASS
```

**Troubleshooting Poor Results:**
- Check grid box size/positioning
- Increase exhaustiveness
- Verify protein preparation (missing hydrogens, incorrect protonation states)

### RBFE Results

**HTML Report Section:**
- Correlation plots (predicted vs experimental ΔΔG)
- Correlation coefficients (Pearson r, Spearman ρ)
- Error metrics (RMSE, MAE, max error)
- Per-transformation table

**Pass Criteria:**
- ✅ **PASS**: Pearson r ≥ 0.7 AND RMSE ≤ 2.0 kcal/mol
- ⚠️ **WARNING**: Pearson r 0.5-0.7 OR RMSE 2.0-3.0 kcal/mol
- ❌ **FAIL**: Pearson r < 0.5 OR RMSE > 3.0 kcal/mol

**Example:**
```
Pearson r: 0.85 (p=0.0023)
Spearman ρ: 0.89 (p=0.0012)
RMSE: 1.42 kcal/mol
MAE: 1.18 kcal/mol
Assessment: PASS
```

**Literature Comparison:**
- OpenFE benchmark (2024): RMSE ~1.73 kcal/mol on diverse datasets
- T4L99A is generally easier: expect RMSE 1.0-1.5 kcal/mol
- Perfect correlation (r=1.0) is unrealistic due to experimental uncertainty

**Troubleshooting Poor Correlation:**
- Check edge quality scores (low scores indicate difficult transformations)
- Increase simulation time (production_ns)
- Verify atom mapper choice (Kartograf vs LOMAP)
- Check for ligand preparation issues

### ABFE Results

**HTML Report Section:**
- Predicted ΔG with uncertainty
- Experimental ΔG
- Absolute error

**Pass Criteria:**
- ✅ **PASS**: Absolute error ≤ 3.0 kcal/mol
- ⚠️ **WARNING**: Absolute error 3.0-5.0 kcal/mol
- ❌ **FAIL**: Absolute error > 5.0 kcal/mol

**Example:**
```
Ligand: n-butylbenzene
Predicted: -6.8 ± 0.4 kcal/mol
Experimental: -6.4 kcal/mol
Error: -0.4 kcal/mol
Assessment: PASS
```

**Important Notes:**
- ABFE less accurate than RBFE (absolute vs relative)
- Errors within uncertainty are acceptable
- Focus on magnitude agreement, not exact match

## Database Queries

Benchmark results are stored in PostgreSQL for analysis:

### View Recent Runs

```sql
SELECT
  run_timestamp,
  rmsd_success_rate,
  rbfe_pearson_r,
  rbfe_rmse,
  run_status
FROM benchmark_runs
WHERE benchmark_name = 't4l99a_benzene'
ORDER BY run_timestamp DESC
LIMIT 10;
```

### Compare Protocol Variations

```sql
-- Compare fast vs robust RBFE settings
SELECT
  settings->>'rbfe'->>'fast_mode' AS fast_mode,
  AVG(rbfe_rmse) AS avg_rmse,
  AVG(rbfe_pearson_r) AS avg_correlation,
  COUNT(*) AS n_runs
FROM benchmark_runs
WHERE benchmark_name = 't4l99a_benzene'
  AND run_status = 'completed'
GROUP BY fast_mode;
```

### Track Performance Over Time

```sql
-- Detect regressions
SELECT
  DATE(run_timestamp) AS date,
  AVG(rmsd_success_rate) AS avg_docking_success,
  AVG(rbfe_rmse) AS avg_rbfe_rmse
FROM benchmark_runs
WHERE benchmark_name = 't4l99a_benzene'
  AND run_status = 'completed'
  AND run_timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(run_timestamp)
ORDER BY date;
```

## Continuous Integration

### GitHub Actions

Add to `.github/workflows/benchmark.yml`:

```yaml
name: Weekly Benchmark

on:
  schedule:
    - cron: '0 2 * * 0'  # Sunday 2 AM
  workflow_dispatch:     # Manual trigger

jobs:
  benchmark:
    runs-on: ubuntu-latest
    timeout-minutes: 2880  # 2 days

    steps:
      - uses: actions/checkout@v3

      - name: Start Ligand-X
        run: |
          make dev
          sleep 30  # Wait for services

      - name: Health check
        run: |
          curl --retry 10 --retry-delay 5 http://localhost:8000/health

      - name: Run benchmark
        run: |
          python scripts/benchmarks/run_benchmark.py \
            --benchmark t4l99a_benzene \
            --run-name "ci_${{ github.run_number }}"

      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-reports
          path: data/benchmark_outputs/
          retention-days: 90

      - name: Check results
        run: |
          # Parse JSON report and fail if assessment is FAIL
          python scripts/benchmarks/check_results.py
```

### Pre-Release Validation

Before releasing a new version:

```bash
# Run full benchmark suite
python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene

# Verify results meet criteria
python scripts/benchmarks/check_results.py \
  --report data/benchmark_outputs/t4l99a_benzene/latest_report.json \
  --strict
```

## Adding Custom Benchmarks

### 1. Prepare Data

Create directory structure:
```
data/benchmarks/my_system/
├── experimental_data.json
├── crystal_structures.json
├── protocol_settings.json
└── reference_poses/
```

### 2. Experimental Data

`experimental_data.json`:
```json
{
  "metadata": {
    "benchmark_name": "My Benchmark System",
    "description": "Brief description",
    "source": "Literature reference or DOI"
  },
  "ligands": [
    {
      "pdb_id": "1abc",
      "name": "ligand1",
      "smiles": "CCO",
      "ligand_code": "ETH",
      "experimental_Kd_uM": 10.0,
      "experimental_dG_kcal_mol": -6.8,
      "experimental_ddG_kcal_mol": 0.0,
      "reference_ligand": true
    }
  ]
}
```

### 3. Crystal Structures

`crystal_structures.json`:
```json
{
  "protein": {
    "name": "My Protein",
    "protein_chain": "A"
  },
  "structures": [
    {
      "pdb_id": "1abc",
      "ligand_name": "ETH",
      "ligand_code": "ETH",
      "chain": "B",
      "residue_number": 200,
      "resolution_A": 1.8
    }
  ]
}
```

### 4. Protocol Settings

`protocol_settings.json`:
```json
{
  "docking": {
    "exhaustiveness": 8,
    "num_modes": 9,
    "rmsd_threshold_A": 2.0
  },
  "rbfe": {
    "atom_mapper": "kartograf",
    "simulation_settings": {
      "production_ns": 5.0,
      "lambda_windows": 11
    }
  },
  "abfe": {
    "production_ns": 10.0
  }
}
```

### 5. Register Benchmark

Edit `scripts/benchmarks/config.py`:
```python
AVAILABLE_BENCHMARKS = {
    "my_system": {
        "name": "My Benchmark System",
        "description": "Description",
        "ligand_count": 5,
        "has_crystal_structures": True,
        "supports_docking": True,
        "supports_rbfe": True,
        "supports_abfe": True,
    }
}
```

### 6. Test

```bash
python scripts/benchmarks/run_benchmark.py --benchmark my_system
```

## Best Practices

### 1. Version Control

Always commit benchmark configurations:
```bash
git add data/benchmarks/my_system/
git commit -m "Add my_system benchmark"
```

### 2. Document Sources

Include literature references in `experimental_data.json`:
```json
"references": [
  "Smith et al. Nature 2024, DOI: 10.1038/...",
  "PDB entries: 1abc, 2def, 3ghi"
]
```

### 3. Run Periodically

Set up automated benchmarks:
- Weekly: Quick validation (docking only)
- Monthly: Full validation (docking + RBFE)
- Before releases: Complete benchmark suite

### 4. Track Results

Create dashboard tracking:
- Success rates over time
- RMSE trends
- Comparison across protocol variations

### 5. Investigate Failures

When benchmarks fail:
1. Check logs: `tail -f benchmark_run.log`
2. Verify services: `docker-compose ps`
3. Inspect job outputs: `data/<service>_outputs/<job_id>/`
4. Review Flower: http://localhost:5555/flower
5. Query database for job details

## Troubleshooting

### Services Not Running

```bash
docker-compose ps
docker-compose logs gateway
curl http://localhost:8000/health
```

### Database Connection Issues

```bash
# Check database is accessible
psql -U ligandx -d ligandx -c "SELECT 1;"

# Verify migrations applied
psql -U ligandx -d ligandx -c "\dt"
```

### PDB Fetch Failures

```bash
# Test direct fetch
curl https://files.rcsb.org/download/4W52.pdb

# Use cached structures
ls data/benchmarks/t4l99a_benzene/reference_poses/
```

### Job Timeouts

Increase timeout in `config.py`:
```python
MAX_JOB_WAIT_TIME = 172800  # 48 hours
```

### GPU Out of Memory

Reduce batch size or concurrent jobs:
```yaml
# docker-compose.yml
services:
  worker-gpu-long:
    deploy:
      resources:
        reservations:
          devices:
            - count: 1  # Use only 1 GPU
```

## References

### Scientific Literature

- Mobley et al. "Binding of small-molecule ligands to proteins: what you gain from explicit solvent and polarization." JACS 2012.
- OpenFE Consortium. "Large-scale benchmarking of relative binding free energy calculations." ChemRxiv 2024.
- Shirts et al. "Lessons learned from comparing molecular dynamics engines on the SAMPL5 dataset." J Comput Aided Mol Des 2017.

### OpenFE Documentation

- Showcase Tutorial: https://docs.openfree.energy/en/v1.0.0/tutorials/showcase_notebook.html
- RBFE Best Practices: https://docs.openfree.energy/en/latest/guide/protocols/index.html
- Kartograf Documentation: https://kartograf.readthedocs.io/

### Ligand-X Resources

- Main Documentation: `docs/README.md`
- RBFE Workflow: `CLAUDE.md` (section on RBFE best practices)
- API Documentation: http://localhost:8000/docs

## Support

For issues or questions:
1. Check logs: `benchmark_run.log`
2. Review documentation: `scripts/benchmarks/README.md`
3. Open GitHub issue: https://github.com/your-org/ligand-x/issues
4. Contact maintainers: See `README.md`
