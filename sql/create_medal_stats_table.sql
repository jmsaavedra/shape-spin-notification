-- Create global_medal_stats table in Supabase
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS global_medal_stats (
  id TEXT PRIMARY KEY DEFAULT 'current',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  last_indexed_block BIGINT NOT NULL,
  data_source TEXT DEFAULT 'supabase',
  medal_counts JSONB NOT NULL DEFAULT '{
    "bronze": 0,
    "silver": 0,
    "gold": 0,
    "black": 0,
    "total": 0
  }'::jsonb,
  total_events INTEGER DEFAULT 0,
  completion_status TEXT DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index on last_indexed_block for efficient queries
CREATE INDEX IF NOT EXISTS idx_global_medal_stats_last_indexed_block
ON global_medal_stats(last_indexed_block);

-- Enable Row Level Security (RLS) - optional but recommended
ALTER TABLE global_medal_stats ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow public read access (since this is public medal data)
CREATE POLICY "Allow public read access" ON global_medal_stats
FOR SELECT USING (true);

-- Create a policy to allow service role to insert/update (for your API)
CREATE POLICY "Allow service role full access" ON global_medal_stats
FOR ALL USING (auth.role() = 'service_role');

-- Insert initial row if it doesn't exist
INSERT INTO global_medal_stats (
  id,
  last_indexed_block,
  medal_counts,
  data_source,
  completion_status
) VALUES (
  'current',
  17000000,
  '{
    "bronze": 0,
    "silver": 0,
    "gold": 0,
    "black": 0,
    "total": 0
  }'::jsonb,
  'supabase',
  'none'
) ON CONFLICT (id) DO NOTHING;