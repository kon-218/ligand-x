# RBFE Benchmark Comparison Guide

## Quick Reference

You now have **three T4L99A benchmarks** optimized for different purposes:

| Benchmark | Runtime | Purpose | Accuracy | Use Case |
|-----------|---------|---------|----------|----------|
| **Minimal** | 2-4 hrs | Workflow test | ❌ No | CI/CD, dev testing |
| **Production** | 6-12 hrs | Quick validation | ✅ Partial | Pre-release, protocol testing |
| **Full** | 24-48 hrs | Complete validation | ✅✅ Best | Publication, final release |

## Detailed Comparison

### Transformation Count

| Benchmark | Ligands | Network | Edges | Transformations | Speedup |
|-----------|---------|---------|-------|----------------|---------|
| **Minimal** | 3 | MST | 2 | **4** | 10.5× faster |
| **Production** | 3 | MST | 2 | **4** | 10.5× faster |
| **Full** | 7 | Maximal | 21 | **42** | baseline |

### Simulation Settings

| Setting | Minimal | Production | Full |
|---------|---------|-----------|------|
| **Production Time** | 2 ns | **5 ns** ✓ | 5 ns |
| **Equilibration** | 0.5 ns | **1.0 ns** ✓ | 1.0 ns |
| **Repeats** | 1 | **3** ✓ | 3 |
| **Lambda Windows** | 11 | **11** ✓ | 11 |
| **Minimization** | 5k steps | **10k steps** ✓ | 10k steps |
| **Exhaustiveness** | 16 | **32** ✓ | 32 |

### Ligand Sets

#### Minimal Test
```
benzene (reference) - Kd=3100 μM, ΔΔG=0.00
  ├── toluene - Kd=590 μM, ΔΔG=-0.83
  └── ethylbenzene - Kd=200 μM, ΔΔG=-1.47
```
- All have experimental data
- Simple alkylbenzenes only
- ΔΔG range: -1.47 kcal/mol

#### Production Benchmark
```
benzene (reference) - Kd=3100 μM, ΔΔG=0.00
  ├── toluene - Kd=590 μM, ΔΔG=-0.83 ✓
  └── phenol - Kd=unknown, ΔΔG=unknown ⚠️
```
- Toluene has experimental data (can validate)
- **Phenol has NO experimental data** (workflow test only)
- Chemical diversity: H-bond donor (phenol)
- Tests polarity changes

#### Full Benchmark
```
benzene ↔ all 6 others (21 edges total):
  - toluene (ΔΔG=-0.83)
  - ethylbenzene (ΔΔG=-1.47)
  - n-propylbenzene (ΔΔG=-1.90)
  - n-butylbenzene (ΔΔG=-2.89)
  - n-pentylbenzene (ΔΔG=-3.21)
  - n-hexylbenzene (ΔΔG=-3.17)
```
- All have experimental data
- ΔΔG range: -3.21 kcal/mol
- Robust correlation statistics

## Runtime Breakdown

### Minimal Test (~2-4 hours total)

| Stage | Time | Settings |
|-------|------|----------|
| Docking (3 ligands) | 5 min | Exhaustiveness=16 |
| RBFE (4 transformations) | 2-3 hrs | 2ns, 1 repeat |
| ABFE (1 ligand) | 30 min | 5ns |

### Production Benchmark (~6-12 hours total)

| Stage | Time | Settings |
|-------|------|----------|
| Docking (3 ligands) | 10 min | Exhaustiveness=32 |
| RBFE (4 transformations) | 6-10 hrs | **5ns, 3 repeats** |
| ABFE (1 ligand) | 2 hrs | 10ns |

**Key difference:** Same 4 transformations as minimal, but 2.5× longer simulation × 3 repeats = **~7.5× longer**

### Full Benchmark (~24-48 hours total)

| Stage | Time | Settings |
|-------|------|----------|
| Docking (7 ligands) | 15 min | Exhaustiveness=32 |
| RBFE (42 transformations) | 24-36 hrs | 5ns, 3 repeats |
| ABFE (1 ligand) | 2 hrs | 10ns |

**Key difference:** 10.5× more transformations than production benchmark

## Success Criteria

### Minimal Test

✅ **PASS:** Jobs complete without errors, reasonable ΔΔG values
❌ **IGNORE:** Correlation metrics, RMSE, experimental validation

**Example:**
```
✓ benzene->toluene: ΔΔG = -1.2 ± 0.8 kcal/mol  (job completed)
✓ benzene->ethylbenzene: ΔΔG = -2.1 ± 1.1 kcal/mol  (job completed)
```

Don't compare to experimental values!

### Production Benchmark

✅ **PASS (toluene only):** Predicted ΔΔG matches experimental within uncertainty
⚠️ **PARTIAL:** Phenol completes but can't validate accuracy
❌ **LIMITED:** Correlation statistics not meaningful (n=1 validated edge)

**Example:**
```
✓ benzene->toluene: ΔΔG = -0.9 ± 0.4 kcal/mol  (exp: -0.83) ✓ GOOD
✓ benzene->phenol: ΔΔG = +1.2 ± 0.6 kcal/mol  (no exp data) ⚠️ WORKFLOW OK
```

Focus on **individual prediction accuracy**, not population statistics.

### Full Benchmark

✅ **PASS:** Pearson r ≥ 0.7 AND RMSE ≤ 2.0 kcal/mol
⚠️ **WARNING:** r = 0.5-0.7 OR RMSE = 2.0-3.0
❌ **FAIL:** r < 0.5 OR RMSE > 3.0

**Example:**
```
Pearson r = 0.82 (p=0.001)
RMSE = 1.45 kcal/mol
MAE = 1.12 kcal/mol
✓✓ EXCELLENT
```

## When to Use Each

### Use Minimal Test When:
- ✅ Testing workflow changes during development
- ✅ Verifying bug fixes don't crash pipeline
- ✅ CI/CD automated testing
- ✅ Quick smoke tests
- ✅ Learning the RBFE workflow
- ❌ DON'T use for accuracy validation

### Use Production Benchmark When:
- ✅ Pre-release validation with real settings
- ✅ Testing protocol parameter changes (e.g., production_ns)
- ✅ Validating specific transformations (alkyl → hydroxyl)
- ✅ Quick accuracy check (6-12 hrs vs 48 hrs)
- ✅ Testing chemical diversity handling
- ⚠️ Limited statistical validation (1 validated edge)
- ❌ DON'T use for publication (need full benchmark)

### Use Full Benchmark When:
- ✅ Publication validation
- ✅ Final release testing
- ✅ Comparing to literature (OpenFE uses full T4L99A)
- ✅ Robust correlation analysis
- ✅ Monthly regression testing
- ✅ Algorithm accuracy benchmarking
- ❌ DON'T use for rapid iteration (too slow)

## Recommended Workflow

### Development Cycle
```bash
# 1. Make changes to RBFE code
vim services/rbfe/service.py

# 2. Quick workflow validation (2-4 hours)
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene_minimal \
  --skip-docking --skip-abfe

# 3. If workflow passes, test with production settings (6-12 hours)
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene_production \
  --skip-docking --skip-abfe

# 4. Before merging, run full benchmark (24-48 hours)
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --skip-docking --skip-abfe
```

### Quick Pre-Release Check
```bash
# Production benchmark is perfect for quick pre-release validation
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene_production
```

### Publication/Final Release
```bash
# Full benchmark with all stages
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene \
  --run-name "v1.0.0_release"
```

## Cost Analysis

**Assuming RTX 3090 GPU:**

| Benchmark | GPU Hours | Approx Cost* | Cost/Edge |
|-----------|-----------|--------------|-----------|
| Minimal | 3 hrs | $0.60 | $0.15 |
| Production | 10 hrs | $2.00 | $0.50 |
| Full | 36 hrs | $7.20 | $0.34 |

*Estimated at $0.20/GPU-hour cloud pricing

**Note:** Full benchmark has better cost/edge efficiency due to optimization in larger networks, but takes 3× longer than production.

## Adding Phenol Experimental Data

If you obtain experimental binding data for phenol with T4L99A:

1. **Update experimental_data.json:**
```bash
vim data/benchmarks/t4l99a_benzene_production/experimental_data.json
```

2. **Add values:**
```json
{
  "name": "phenol",
  "experimental_Kd_uM": <measured_value>,
  "experimental_dG_kcal_mol": <calculated_dG>,
  "experimental_ddG_kcal_mol": <relative_to_benzene>
}
```

3. **Rerun and validate:**
```bash
python scripts/benchmarks/run_benchmark.py \
  --benchmark t4l99a_benzene_production
```

Now phenol predictions can be validated! This would give you **2 validated edges** for better statistics.

## Summary Table

|  | Minimal | Production | Full |
|--|---------|-----------|------|
| **Purpose** | Workflow test | Quick accuracy | Full validation |
| **Runtime** | 2-4 hrs | 6-12 hrs | 24-48 hrs |
| **Transformations** | 4 | 4 | 42 |
| **Settings** | Fast (2ns, 1×) | Production (5ns, 3×) | Production (5ns, 3×) |
| **Validated** | 0 edges | 1 edge (toluene) | 21 edges |
| **Accuracy** | ❌ No | ✅ Individual | ✅✅ Population |
| **Statistics** | ❌ No | ⚠️ Limited | ✅ Robust |
| **Use for** | Dev/CI | Pre-release | Publication |

## Files Location

```
data/benchmarks/
├── t4l99a_benzene/                 # Full benchmark (42 transformations)
├── t4l99a_benzene_production/      # Production benchmark (4 transformations, 5ns)
│   └── README.md                   # Detailed production benchmark docs
├── t4l99a_benzene_minimal/         # Minimal test (4 transformations, 2ns)
│   └── README.md                   # Detailed minimal test docs
└── README.md                       # Overview of all benchmarks
```

## Next Steps

1. **Test minimal workflow:**
   ```bash
   python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene_minimal --skip-docking --skip-abfe
   ```

2. **If working, test production:**
   ```bash
   python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene_production --skip-docking --skip-abfe
   ```

3. **For publication/release:**
   ```bash
   python scripts/benchmarks/run_benchmark.py --benchmark t4l99a_benzene
   ```
