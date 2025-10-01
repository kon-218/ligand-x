-- ADMET Results Cache Table
-- Stores ADMET prediction results keyed by canonical SMILES to avoid duplicate calculations

CREATE TABLE IF NOT EXISTS admet_results (
    id SERIAL PRIMARY KEY,
    canonical_smiles TEXT UNIQUE NOT NULL,
    input_smiles TEXT,
    molecule_name VARCHAR(255),
    results JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by canonical SMILES
CREATE INDEX IF NOT EXISTS idx_admet_results_canonical_smiles ON admet_results(canonical_smiles);

-- Index for listing by creation time
CREATE INDEX IF NOT EXISTS idx_admet_results_created_at ON admet_results(created_at DESC);

-- Comment on table
COMMENT ON TABLE admet_results IS 'Cache for ADMET prediction results to avoid duplicate calculations';
COMMENT ON COLUMN admet_results.canonical_smiles IS 'Canonical SMILES string used as unique key';
COMMENT ON COLUMN admet_results.input_smiles IS 'Original input SMILES (may differ from canonical)';
COMMENT ON COLUMN admet_results.results IS 'JSONB containing all ADMET predictions';
