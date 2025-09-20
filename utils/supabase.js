const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase clients
// These environment variables are set automatically when you add the Supabase integration in Vercel
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey) {
  console.warn('⚠️  Supabase environment variables not found. Make sure to add Supabase integration in Vercel.');
}

// Client for read operations (anonymous key)
const supabase = supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey) : null;

// Client for write operations (service role key - bypasses RLS)
const supabaseAdmin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

/**
 * Get global medal statistics from Supabase
 */
async function getGlobalMedalStats() {
  if (!supabase) {
    console.warn('Supabase not configured, falling back to local file');
    return await loadMedalStatsFromFile();
  }

  try {
    const { data, error } = await supabase
      .from('global_medal_stats')
      .select('*')
      .eq('id', 'current')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found, return default stats
        return getDefaultMedalStats();
      }
      throw error;
    }

    return {
      lastUpdated: data.last_updated,
      lastIndexedBlock: data.last_indexed_block,
      dataSource: data.data_source || 'supabase',
      globalMedalStats: data.medal_counts,
      totalEvents: data.total_events || 0,
      completionStatus: data.completion_status || 'complete'
    };

  } catch (error) {
    console.error('Error fetching medal stats from Supabase:', error);
    // Fallback to file-based storage
    return await loadMedalStatsFromFile();
  }
}

/**
 * Save global medal statistics to Supabase
 */
async function saveGlobalMedalStats(stats) {
  if (!supabaseAdmin) {
    console.warn('Supabase admin client not configured, falling back to local file');
    return await saveMedalStatsToFile(stats);
  }

  try {
    const { error } = await supabaseAdmin
      .from('global_medal_stats')
      .upsert({
        id: 'current',
        last_updated: stats.lastUpdated || new Date().toISOString(),
        last_indexed_block: stats.lastIndexedBlock,
        data_source: stats.dataSource || 'supabase',
        medal_counts: stats.globalMedalStats,
        total_events: stats.totalEvents || 0,
        completion_status: stats.completionStatus || 'complete'
      });

    if (error) throw error;

    return true;

  } catch (error) {
    console.error('Error saving medal stats to Supabase:', error);
    // Fallback to file-based storage
    return await saveMedalStatsToFile(stats);
  }
}

/**
 * Fallback: Load medal stats from local file
 */
async function loadMedalStatsFromFile() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const dataFile = path.join(process.cwd(), 'data/global-medal-stats.json');

    const data = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return getDefaultMedalStats();
  }
}

/**
 * Fallback: Save medal stats to local file
 */
async function saveMedalStatsToFile(stats) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const dataDir = path.join(process.cwd(), 'data');
    const dataFile = path.join(dataDir, 'global-medal-stats.json');

    // Ensure data directory exists
    await fs.mkdir(dataDir, { recursive: true });

    await fs.writeFile(dataFile, JSON.stringify(stats, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving medal stats to file:', error);
    return false;
  }
}

/**
 * Default medal stats structure
 */
function getDefaultMedalStats() {
  return {
    lastUpdated: new Date().toISOString(),
    lastIndexedBlock: 17000000, // MEDAL_ACTIVITY_START
    dataSource: 'default',
    globalMedalStats: {
      bronze: 0,
      silver: 0,
      gold: 0,
      black: 0,
      total: 0
    },
    totalEvents: 0,
    completionStatus: 'none'
  };
}

/**
 * Get cached ENS name from Supabase
 */
async function getCachedEnsName(address) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('ens_cache')
      .select('ens_name, expires_at')
      .eq('address', address.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found
        return null;
      }
      if (error.code === 'PGRST205') {
        // Table doesn't exist - return null and don't log error
        return null;
      }
      throw error;
    }

    // Check if cached entry has expired
    if (new Date(data.expires_at) < new Date()) {
      return null;
    }

    return data.ens_name;

  } catch (error) {
    // Only log error if it's not a table missing error
    if (error.code !== 'PGRST205') {
      console.error('Error fetching cached ENS name:', error);
    }
    return null;
  }
}

/**
 * Cache ENS name in Supabase
 */
async function cacheEnsName(address, ensName, ttlSeconds = 2592000) { // 30 days default
  if (!supabaseAdmin) {
    return false;
  }

  try {
    const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();

    const { error } = await supabaseAdmin
      .from('ens_cache')
      .upsert({
        address: address.toLowerCase(),
        ens_name: ensName,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'address'
      });

    if (error) {
      // Don't log error if table doesn't exist
      if (error.code !== 'PGRST205') {
        console.error('Error caching ENS name:', error);
      }
      return false;
    }

    return true;

  } catch (error) {
    // Don't log error if table doesn't exist
    if (error.code !== 'PGRST205') {
      console.error('Error caching ENS name:', error);
    }
    return false;
  }
}

/**
 * Track wallet submission for analytics with visit counting
 */
async function trackWalletSubmission(submissionData) {
  if (!supabaseAdmin) {
    console.warn('Supabase admin client not configured, wallet submission tracking disabled');
    return false;
  }

  try {
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('wallet_submissions')
      .upsert({
        wallet_address: submissionData.walletAddress,
        ens_name: submissionData.ensName || null,
        last_visit: now,
        user_agent: submissionData.userAgent || null,
        ip_address: submissionData.ipAddress || null,
        referrer: submissionData.referrer || null,
        has_spins: submissionData.hasSpins || false,
        spin_count: submissionData.spinCount || 0,
        has_medals: submissionData.hasMedals || false,
        medal_count: submissionData.medalCount || 0,
        stack_id: submissionData.stackId || null,
        can_spin_now: submissionData.canSpinNow || false,
        last_spin_timestamp: submissionData.lastSpinTimestamp || null,
        updated_at: now
      }, {
        onConflict: 'wallet_address',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error tracking wallet submission:', error);
      return false;
    }

    // Increment visit count for existing records
    const { error: updateError } = await supabaseAdmin
      .from('wallet_submissions')
      .update({
        visit_count: supabaseAdmin.raw('visit_count + 1'),
        updated_at: now
      })
      .eq('wallet_address', submissionData.walletAddress);

    if (updateError) {
      console.error('Error updating visit count:', updateError);
      // Don't return false here, the main tracking still succeeded
    }

    return true;

  } catch (error) {
    console.error('Error tracking wallet submission:', error);
    return false;
  }
}

module.exports = {
  supabase,
  getGlobalMedalStats,
  saveGlobalMedalStats,
  getDefaultMedalStats,
  trackWalletSubmission,
  getCachedEnsName,
  cacheEnsName
};