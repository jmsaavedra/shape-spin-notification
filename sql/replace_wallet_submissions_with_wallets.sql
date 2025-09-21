-- Replace wallet_submissions table with clean wallets table
-- This eliminates duplicates and creates optimized structure for wallet + ENS data

-- Step 1: Create the new wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    ens_name TEXT,
    ens_expires_at TIMESTAMPTZ,
    first_visit TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_visit TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visit_count INTEGER NOT NULL DEFAULT 1,
    user_agent TEXT,
    ip_address TEXT,
    referrer TEXT,
    has_spins BOOLEAN,
    spin_count INTEGER,
    has_medals BOOLEAN,
    medal_count INTEGER,
    stack_id TEXT,
    can_spin_now BOOLEAN,
    last_spin_timestamp BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Create efficient indexes
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallets_ens_expires_at ON wallets(ens_expires_at);
CREATE INDEX IF NOT EXISTS idx_wallets_first_visit ON wallets(first_visit);
CREATE INDEX IF NOT EXISTS idx_wallets_last_visit ON wallets(last_visit);
CREATE INDEX IF NOT EXISTS idx_wallets_visit_count ON wallets(visit_count);
CREATE INDEX IF NOT EXISTS idx_wallets_created_at ON wallets(created_at);

-- Step 3: Enable Row Level Security
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies
CREATE POLICY "Allow anonymous inserts" ON wallets
    FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON wallets
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Step 5: Drop the old wallet_submissions table (clean slate approach)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'wallet_submissions') THEN
        DROP TABLE wallet_submissions CASCADE;
        RAISE NOTICE 'Dropped wallet_submissions table successfully';
    ELSE
        RAISE NOTICE 'wallet_submissions table does not exist, nothing to drop';
    END IF;
END $$;