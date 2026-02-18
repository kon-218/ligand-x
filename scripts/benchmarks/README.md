# Ligand-X Benchmarking Framework

This directory contains benchmarking scripts to validate Ligand-X computational protocols (docking, RBFE, ABFE) against well-established experimental data.

## Overview

The benchmarking framework provides:
- **Automated validation** of computational protocols
- **Reproducible workflows** with version-controlled experimental data
- **Comprehensive reporting** in multiple formats (JSON, HTML)
- **Extensible architecture** for adding new benchmark systems

## Quick Start

### 1. List Available Benchmarks

```bash
python scripts/benchmarks/run_benchmark.py --list-benchmarks
```

### 2. Run Full Benchmark

```bash
# Run complete T4L99A benzene benchmark (docking + RBFE + ABFE)
python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene
```

### 3. View Results

Reports are generated in `data/benchmark_outputs/<benchmark_name>/`:
- `<benchmark>_<run_id>_report.json` - Machine-readable results
- `<benchmark>_<run_id>_report.html` - Human-readable report with tables and metrics

## Available Benchmarks

### T4 Lysozyme L99A Benzene Series

**System:** T4 Lysozyme with L99A mutation + benzene congeneric series

**Ligands:** 7 compounds (benzene, toluene, ethylbenzene, n-propyl/butyl/pentyl/hexyl-benzene)

**PDB IDs:** 4w52-59

**Validates:**
- Docking accuracy (RMSD vs crystal structures)
- RBFE correlation (predicted vs experimental ΔΔG)
- ABFE accuracy (predicted vs experimental ΔG)

**Expected Performance:**
- Docking: >80% success rate (RMSD < 2.0 Å)
- RBFE: Pearson r > 0.7, RMSE < 2.0 kcal/mol
- ABFE: Absolute error < 3.0 kcal/mol

**References:**
- OpenFE Showcase: https://docs.openfree.energy/en/v1.0.0/tutorials/showcase_notebook.html
- Mobley et al. JACS 2012: https://pubs.acs.org/doi/10.1021/ja301447g

## Usage Examples

### Run Specific Stages

```bash
# Docking only
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-rbfe --skip-abfe

# RBFE only
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-docking --skip-abfe

# RBFE + ABFE (use existing docking results)
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-docking
```

### Custom Run Name

```bash
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --run-name "protocol_validation_v2"
```

### Custom API URL

```bash
# Point to different Ligand-X instance
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --api-url http://production-server:8000
```

### Force Refresh

```bash
# Re-download all PDB structures
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --force-refresh
```

## Directory Structure

```
scripts/benchmarks/
├── README.md                 # This file
├── requirements.txt          # Python dependencies
├── run_benchmark.py          # Main entry point
├── config.py                 # Configuration management
├── stages/                   # Execution stages
│   ├── docking_stage.py      # Docking validation
│   ├── rbfe_stage.py         # RBFE calculations
│   ├── abfe_stage.py         # ABFE calculation
│   └── comparison_stage.py   # Results comparison
└── utils/                    # Utility modules
    ├── pdb_fetch.py          # PDB structure fetching
    ├── structure_prep.py     # Structure preparation
    ├── job_monitoring.py     # Celery job monitoring
    ├── metrics.py            # Metrics calculation
    └── report_generation.py  # Report generation
```

## Workflow

Each benchmark follows this workflow:

```
1. Docking Stage
   ├─ Fetch crystal structures from RCSB PDB
   ├─ Extract protein and reference ligands
   ├─ Submit docking jobs for all ligands
   ├─ Calculate RMSD vs crystal poses
   └─ Compute success rate and metrics

2. RBFE Stage
   ├─ Create ligand network with atom mapper (Kartograf)
   ├─ Submit all transformation jobs
   ├─ Wait for completion
   ├─ Extract predicted ΔΔG values
   └─ Calculate correlation with experimental data

3. ABFE Stage
   ├─ Identify best-ranked ligand
   ├─ Submit ABFE calculation
   ├─ Extract predicted ΔG
   └─ Calculate error vs experimental

4. Comparison Stage
   ├─ Compare all results to experimental data
   ├─ Generate summary statistics
   └─ Assess overall performance

5. Report Generation
   ├─ Generate JSON report (machine-readable)
   ├─ Generate HTML report (human-readable)
   └─ Save to output directory
```

## Configuration Files

Benchmark configurations are stored in `data/benchmarks/<benchmark_name>/`:

### experimental_data.json
```json
{
  "metadata": {...},
  "ligands": [
    {
      "pdb_id": "4w52",
      "name": "benzene",
      "smiles": "c1ccccc1",
      "experimental_Kd_uM": 3100.0,
      "experimental_dG_kcal_mol": -3.47,
      "experimental_ddG_kcal_mol": 0.0,
      "reference_ligand": true
    },
    ...
  ]
}
```

### crystal_structures.json
```json
{
  "protein": {...},
  "structures": [
    {
      "pdb_id": "4w52",
      "ligand_name": "BNZ",
      "chain": "B",
      "resolution_A": 1.60
    },
    ...
  ]
}
```

### protocol_settings.json
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

## Database Integration

Benchmark results are stored in PostgreSQL for easy querying:

```sql
-- View recent benchmark runs
SELECT benchmark_name, run_timestamp, rmsd_success_rate, rbfe_rmse
FROM benchmark_runs
ORDER BY run_timestamp DESC
LIMIT 10;

-- Compare protocol variations
SELECT run_timestamp, rmsd_success_rate, rbfe_rmse
FROM benchmark_runs
WHERE benchmark_name = 't4l99a_benzene'
ORDER BY run_timestamp;
```

## Adding New Benchmarks

To add a new benchmark system:

### 1. Create Data Directory

```bash
mkdir -p data/benchmarks/my_benchmark
```

### 2. Add Configuration Files

Create three JSON files:
- `experimental_data.json` - Experimental Kd/ΔG values
- `crystal_structures.json` - PDB metadata
- `protocol_settings.json` - Computational settings

See existing benchmarks for examples.

### 3. Register Benchmark

Add entry to `AVAILABLE_BENCHMARKS` in `config.py`:

```python
AVAILABLE_BENCHMARKS = {
    "my_benchmark": {
        "name": "My Benchmark System",
        "description": "Brief description",
        "ligand_count": 10,
        "has_crystal_structures": True,
        "supports_docking": True,
        "supports_rbfe": True,
        "supports_abfe": True,
    }
}
```

### 4. Test

```bash
python scripts/benchmarks/run_benchmark.py --benchmark my_benchmark
```

## Metrics and Validation

### Docking Metrics
- **RMSD**: Root-mean-square deviation vs crystal structure (Å)
- **Success Rate**: Fraction of ligands with RMSD < 2.0 Å
- **Mean/Std**: Average RMSD across all ligands

### RBFE Metrics
- **Pearson r**: Linear correlation of predicted vs experimental ΔΔG
- **Spearman ρ**: Rank correlation
- **Kendall τ**: Rank correlation (alternative)
- **RMSE**: Root-mean-square error (kcal/mol)
- **MAE**: Mean absolute error (kcal/mol)

### ABFE Metrics
- **Error**: Predicted ΔG - Experimental ΔG (kcal/mol)
- **Abs Error**: Absolute value of error
- **Within Uncertainty**: Whether error is within predicted uncertainty

## Troubleshooting

### Jobs Timing Out

Increase timeout for long-running jobs:

```python
# In job_monitoring.py
timeout=86400  # 24 hours
```

### API Connection Issues

Check that Ligand-X services are running:

```bash
docker-compose ps
curl http://localhost:8000/health
```

### Missing PDB Structures

Structures are cached in `data/benchmarks/<benchmark>/reference_poses/`. Use `--force-refresh` to re-download.

### Report Generation Fails

Check output directory permissions:

```bash
ls -la data/benchmark_outputs/
```

## Performance Considerations

- **Docking**: ~1-5 minutes per ligand
- **RBFE**: ~2-8 hours per transformation (depends on settings)
- **ABFE**: ~8-24 hours (depends on settings)

For the T4L99A benzene benchmark:
- Docking: ~30 minutes for 7 ligands
- RBFE: ~12-48 hours for 6-12 transformations
- ABFE: ~8-24 hours for 1 ligand

**Total runtime**: ~1-3 days for full benchmark

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Run Benchmarks

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Start Ligand-X services
        run: docker-compose up -d
      - name: Run T4L99A benchmark
        run: python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-reports
          path: data/benchmark_outputs/
```

## License

This benchmarking framework is part of Ligand-X and follows the same license.

## Contributing

To contribute new benchmarks or improvements:
1. Fork the repository
2. Create a feature branch
3. Add benchmark data and documentation
4. Submit a pull request

## References

- OpenFE Documentation: https://docs.openfree.energy/
- T4L99A Tutorial: https://docs.openfree.energy/en/v1.0.0/tutorials/showcase_notebook.html
- Ligand-X Documentation: See `docs/` directory
