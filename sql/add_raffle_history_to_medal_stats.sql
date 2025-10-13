-- Migration: Add raffle history fields to global_medal_stats table
-- Run this SQL in your Supabase SQL Editor to update existing tables

-- Add raffle_history column if it doesn't exist
ALTER TABLE global_medal_stats
ADD COLUMN IF NOT EXISTS raffle_history JSONB DEFAULT '[]'::jsonb;

-- Add raffle_last_updated column if it doesn't exist
ALTER TABLE global_medal_stats
ADD COLUMN IF NOT EXISTS raffle_last_updated TIMESTAMPTZ;

-- Update the existing row to have empty raffle history if null
UPDATE global_medal_stats
SET raffle_history = '[]'::jsonb
WHERE raffle_history IS NULL;

-- Add a comment to document the schema
COMMENT ON COLUMN global_medal_stats.raffle_history IS 'Complete history of all raffle winners with ENS names';
COMMENT ON COLUMN global_medal_stats.raffle_last_updated IS 'Timestamp when raffle history was last fetched from blockchain';
