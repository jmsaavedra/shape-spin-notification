-- Migration: Consolidate ENS cache into wallet_submissions table
-- This eliminates the need for a separate ens_cache table

-- Add ENS expiration field to wallet_submissions
ALTER TABLE wallet_submissions
ADD COLUMN IF NOT EXISTS ens_expires_at TIMESTAMPTZ;

-- Create index for efficient ENS expiration lookups
CREATE INDEX IF NOT EXISTS idx_wallet_submissions_ens_expires_at ON wallet_submissions(ens_expires_at);

-- Migrate existing data from ens_cache to wallet_submissions (if ens_cache exists)
-- This is a one-time migration that safely handles the case where ens_cache doesn't exist
DO $$
BEGIN
    -- Check if ens_cache table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ens_cache') THEN
        -- Migrate ENS data from ens_cache to wallet_submissions
        INSERT INTO wallet_submissions (wallet_address, ens_name, ens_expires_at, first_visit, last_visit, visit_count, created_at, updated_at)
        SELECT
            ec.address,
            ec.ens_name,
            ec.expires_at,
            NOW(),
            NOW(),
            1,
            ec.created_at,
            ec.updated_at
        FROM ens_cache ec
        ON CONFLICT (wallet_address) DO UPDATE SET
            ens_name = EXCLUDED.ens_name,
            ens_expires_at = EXCLUDED.ens_expires_at,
            updated_at = EXCLUDED.updated_at
        WHERE wallet_submissions.ens_expires_at IS NULL
           OR wallet_submissions.ens_expires_at < EXCLUDED.ens_expires_at;

        RAISE NOTICE 'Migrated ENS data from ens_cache to wallet_submissions';
    ELSE
        RAISE NOTICE 'ens_cache table does not exist, skipping migration';
    END IF;
END $$;