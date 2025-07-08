-- ============================================================
-- Migration 001: Create Jobs Table
-- ============================================================
-- This migration creates the jobs table for persistent job storage.
-- Jobs are created when submitted to Celery and updated during execution.
--
-- Run with: psql -U ligandx -d ligandx -f migrations/001_create_jobs.sql
-- ============================================================

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
    -- Primary key (Celery task ID)
    id UUID PRIMARY KEY,
    
    -- Job metadata
    job_type VARCHAR(50) NOT NULL,  -- 'md', 'abfe', 'rbfe', 'docking', 'qc', 'boltz2'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Input parameters (JSONB for flexibility)
    input_params JSONB NOT NULL,
    
    -- Results (populated on completion)
    result JSONB,
    error_message TEXT,
    
    -- Progress tracking
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    stage VARCHAR(255),
    
    -- Metadata
    user_id VARCHAR(255),  -- For future multi-user support
    molecule_name VARCHAR(255),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT valid_job_type CHECK (
        job_type IN ('md', 'abfe', 'rbfe', 'docking', 'docking_batch', 'qc', 'boltz2', 'admet')
    )
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_molecule_name ON jobs(molecule_name) WHERE molecule_name IS NOT NULL;

-- Composite index for common list queries
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON jobs(job_type, status);

-- Add comments for documentation
COMMENT ON TABLE jobs IS 'Persistent storage for Celery job metadata and results';
COMMENT ON COLUMN jobs.id IS 'Celery task ID (UUID)';
COMMENT ON COLUMN jobs.job_type IS 'Type of computation job';
COMMENT ON COLUMN jobs.status IS 'Current job status';
COMMENT ON COLUMN jobs.input_params IS 'Job input parameters as JSONB';
COMMENT ON COLUMN jobs.result IS 'Job result data as JSONB (null until completed)';
COMMENT ON COLUMN jobs.progress IS 'Job progress percentage (0-100)';
COMMENT ON COLUMN jobs.stage IS 'Current execution stage description';

-- ============================================================
-- Migration tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Record this migration
INSERT INTO schema_migrations (version) 
VALUES ('001_create_jobs')
ON CONFLICT (version) DO NOTHING;
