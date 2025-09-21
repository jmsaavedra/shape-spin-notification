-- Drop the ens_cache table after migration to wallet_submissions
-- Run this AFTER confirming the migration worked successfully

-- This script safely drops the ens_cache table if it exists
-- Only run this after verifying ENS caching is working with wallet_submissions

DO $$
BEGIN
    -- Check if ens_cache table exists before dropping
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ens_cache') THEN
        DROP TABLE ens_cache CASCADE;
        RAISE NOTICE 'Dropped ens_cache table successfully';
    ELSE
        RAISE NOTICE 'ens_cache table does not exist, nothing to drop';
    END IF;
END $$;