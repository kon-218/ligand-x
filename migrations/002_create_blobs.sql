-- ============================================================
-- Migration 002: Create Blobs Metadata Table (Optional)
-- ============================================================
-- This migration creates a metadata table for blob tracking.
-- The actual blob data is stored on the filesystem, but this
-- table provides queryable metadata.
--
-- Note: This is optional - the BlobStore works without it.
-- ============================================================

-- Create blobs metadata table
CREATE TABLE IF NOT EXISTS blobs (
    -- Blob identifier (content hash)
    blob_id VARCHAR(16) NOT NULL,
    extension VARCHAR(10) NOT NULL,
    
    -- Composite primary key
    PRIMARY KEY (blob_id, extension),
    
    -- Metadata
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,
    
    -- Optional description
    description TEXT,
    
    -- Source information
    source_type VARCHAR(50),  -- 'upload', 'generated', 'external'
    source_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_blobs_created_at ON blobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blobs_extension ON blobs(extension);
CREATE INDEX IF NOT EXISTS idx_blobs_source_job ON blobs(source_job_id) WHERE source_job_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE blobs IS 'Metadata for blob storage (actual data on filesystem)';
COMMENT ON COLUMN blobs.blob_id IS 'Content-addressable blob ID (SHA256 prefix)';
COMMENT ON COLUMN blobs.extension IS 'File extension (pdb, sdf, mol2, etc.)';

-- Record this migration
INSERT INTO schema_migrations (version) 
VALUES ('002_create_blobs')
ON CONFLICT (version) DO NOTHING;
