-- Create ENS cache table to store ENS name resolutions
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ens_cache (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    ens_name TEXT, -- NULL if address has no ENS name
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ens_cache_address ON ens_cache(address);
CREATE INDEX IF NOT EXISTS idx_ens_cache_expires_at ON ens_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ens_cache_created_at ON ens_cache(created_at);

-- Enable Row Level Security
ALTER TABLE ens_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access (ENS data is public)
CREATE POLICY "Allow public read access" ON ens_cache
    FOR SELECT
    USING (true);

-- Create policy to allow service role full access (for caching operations)
CREATE POLICY "Allow service role full access" ON ens_cache
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create policy to allow anonymous users to read (for client-side caching)
CREATE POLICY "Allow anonymous read" ON ens_cache
    FOR SELECT
    TO anon
    USING (true);