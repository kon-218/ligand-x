-- Migration: Create benchmark_runs table for tracking benchmark executions
-- Created: 2026-02-13
-- Description: Stores results and metadata for computational chemistry benchmark runs

CREATE TABLE IF NOT EXISTS benchmark_runs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Benchmark identification
    benchmark_name VARCHAR(100) NOT NULL,
    run_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    run_status VARCHAR(50) DEFAULT 'pending',

    -- Phase tracking
    docking_phase_status VARCHAR(50),
    rbfe_phase_status VARCHAR(50),
    abfe_phase_status VARCHAR(50),

    -- Docking results (JSONB for flexibility)
    docking_results JSONB,
    -- Structure: [{
    --   "ligand_id": "4w52",
    --   "ligand_name": "benzene",
    --   "job_id": "uuid",
    --   "crystal_rmsd": 1.2,
    --   "affinity": -7.5,
    --   "success": true
    -- }, ...]

    -- RBFE results
    rbfe_network JSONB,
    -- Structure: {
    --   "nodes": ["benzene", "toluene", ...],
    --   "edges": [{
    --     "ligand_a": "benzene",
    --     "ligand_b": "toluene",
    --     "quality_score": 0.85,
    --     "job_id": "uuid"
    --   }, ...]
    -- }

    rbfe_transformations JSONB,
    -- Structure: [{
    --   "transformation": "benzene -> toluene",
    --   "predicted_ddG": -0.8,
    --   "uncertainty": 0.15,
    --   "experimental_ddG": -0.83,
    --   "error": 0.03,
    --   "job_id": "uuid"
    -- }, ...]

    -- ABFE results
    abfe_result JSONB,
    -- Structure: {
    --   "ligand": "n-butylbenzene",
    --   "predicted_dG": -6.5,
    --   "uncertainty": 0.3,
    --   "experimental_dG": -6.36,
    --   "error": -0.14,
    --   "job_id": "uuid"
    -- }

    -- Job tracking (for traceability and result retrieval)
    docking_job_ids TEXT[],
    rbfe_job_ids TEXT[],
    abfe_job_id UUID,

    -- Summary metrics for quick queries
    -- Docking metrics
    rmsd_mean FLOAT,
    rmsd_std FLOAT,
    rmsd_success_rate FLOAT,  -- Fraction with RMSD < 2.0 Å

    -- RBFE metrics
    rbfe_pearson_r FLOAT,
    rbfe_spearman_rho FLOAT,
    rbfe_kendall_tau FLOAT,
    rbfe_rmse FLOAT,
    rbfe_mae FLOAT,
    rbfe_max_error FLOAT,

    -- ABFE metrics
    abfe_error FLOAT,
    abfe_abs_error FLOAT,

    -- Configuration metadata
    settings JSONB,
    -- Structure: {
    --   "docking": {...},
    --   "rbfe": {...},
    --   "abfe": {...}
    -- }

    -- User notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Ensure unique benchmark runs
    CONSTRAINT benchmark_name_timestamp UNIQUE (benchmark_name, run_timestamp)
);

-- Indexes for efficient queries
CREATE INDEX idx_benchmark_name ON benchmark_runs(benchmark_name);
CREATE INDEX idx_run_timestamp ON benchmark_runs(run_timestamp DESC);
CREATE INDEX idx_run_status ON benchmark_runs(run_status);
CREATE INDEX idx_rmsd_success_rate ON benchmark_runs(rmsd_success_rate);
CREATE INDEX idx_rbfe_rmse ON benchmark_runs(rbfe_rmse);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_benchmark_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_benchmark_runs_timestamp
    BEFORE UPDATE ON benchmark_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_benchmark_runs_updated_at();

-- Add comments for documentation
COMMENT ON TABLE benchmark_runs IS 'Stores results and metadata for computational chemistry benchmark runs';
COMMENT ON COLUMN benchmark_runs.benchmark_name IS 'Identifier for the benchmark system (e.g., t4l99a_benzene)';
COMMENT ON COLUMN benchmark_runs.docking_results IS 'Detailed docking results for each ligand';
COMMENT ON COLUMN benchmark_runs.rbfe_network IS 'RBFE network topology and edge quality scores';
COMMENT ON COLUMN benchmark_runs.rbfe_transformations IS 'RBFE transformation results with predicted and experimental ΔΔG';
COMMENT ON COLUMN benchmark_runs.abfe_result IS 'ABFE result for best ligand with predicted and experimental ΔG';
COMMENT ON COLUMN benchmark_runs.settings IS 'Protocol settings used for this benchmark run';
