-- Fix wallet address case sensitivity issues
-- This removes duplicates and ensures all addresses are lowercase

-- Step 1: Remove duplicate entries FIRST (before normalizing case)
-- This handles cases where both uppercase and lowercase versions exist
DO $$
DECLARE
    duplicate_address TEXT;
    keep_id BIGINT;
    delete_ids BIGINT[];
BEGIN
    -- Find addresses that have duplicates after case normalization
    FOR duplicate_address IN
        SELECT LOWER(wallet_address)
        FROM wallets
        GROUP BY LOWER(wallet_address)
        HAVING COUNT(*) > 1
    LOOP
        -- For each duplicate group, keep the record with:
        -- 1. Higher visit count, or
        -- 2. More recent last_visit, or
        -- 3. Non-null ENS name, or
        -- 4. Highest ID as fallback
        SELECT id INTO keep_id
        FROM wallets
        WHERE LOWER(wallet_address) = duplicate_address
        ORDER BY
            visit_count DESC NULLS LAST,
            last_visit DESC NULLS LAST,
            (CASE WHEN ens_name IS NOT NULL THEN 1 ELSE 0 END) DESC,
            id DESC
        LIMIT 1;

        -- Collect IDs to delete (all except the one we're keeping)
        SELECT ARRAY_AGG(id) INTO delete_ids
        FROM wallets
        WHERE LOWER(wallet_address) = duplicate_address
        AND id != keep_id;

        -- Delete the duplicates
        IF array_length(delete_ids, 1) > 0 THEN
            DELETE FROM wallets WHERE id = ANY(delete_ids);
            RAISE NOTICE 'Removed % duplicate(s) for address: %', array_length(delete_ids, 1), duplicate_address;
        END IF;
    END LOOP;
END $$;

-- Step 2: Now update all remaining addresses to lowercase (safe after removing duplicates)
UPDATE wallets
SET wallet_address = LOWER(wallet_address)
WHERE wallet_address != LOWER(wallet_address);

-- Step 3: Ensure unique constraint works with lowercase addresses
-- (The existing unique constraint should now work properly since all addresses are lowercase)

DO $$
BEGIN
    RAISE NOTICE 'Wallet address case sensitivity fix completed';
END $$;