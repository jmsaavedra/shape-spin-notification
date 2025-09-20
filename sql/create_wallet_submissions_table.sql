-- Create table to track wallet submissions for wallet preview
CREATE TABLE IF NOT EXISTS wallet_submissions (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    ens_name TEXT,
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

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_wallet_submissions_address ON wallet_submissions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_submissions_first_visit ON wallet_submissions(first_visit);
CREATE INDEX IF NOT EXISTS idx_wallet_submissions_last_visit ON wallet_submissions(last_visit);
CREATE INDEX IF NOT EXISTS idx_wallet_submissions_visit_count ON wallet_submissions(visit_count);
CREATE INDEX IF NOT EXISTS idx_wallet_submissions_created_at ON wallet_submissions(created_at);

-- Enable Row Level Security
ALTER TABLE wallet_submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous inserts (for tracking submissions)
CREATE POLICY "Allow anonymous inserts" ON wallet_submissions
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Create policy to allow service role to read all data
CREATE POLICY "Allow service role full access" ON wallet_submissions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);