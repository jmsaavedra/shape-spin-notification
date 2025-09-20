// API endpoint to get global medal statistics for MEDAL-SPIN project
// Uses Supabase for persistent data storage with automatic incremental updates
require("dotenv").config();
const { caches } = require("../lib/cache");
const { getGlobalMedalStats } = require("../utils/supabase");

async function runIncrementalUpdate() {
  try {
    console.log('Running incremental medal stats update...');
    const { main } = require('../scripts/update-medal-stats');
    await main();
    console.log('Incremental update completed');
  } catch (error) {
    console.error('Error running incremental update:', error.message);
  }
}

async function shouldRunUpdate(lastUpdated) {
  if (!lastUpdated) return true;

  const lastUpdateTime = new Date(lastUpdated);
  const now = new Date();
  const hoursSinceUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);

  // Update if more than 1 hour since last update
  return hoursSinceUpdate >= 1;
}

module.exports = async (_req, res) => {
  try {
    // Check cache first - global medal stats cached for 1 hour
    const cacheKey = 'globalMedalStats';
    const cachedStats = caches.spins.get(cacheKey);

    if (cachedStats !== null) {
      console.log('Returning cached global medal stats');
      return res.status(200).json(cachedStats);
    }

    console.log('Loading global medal stats from Supabase...');

    // Load data from Supabase
    let medalData = await getGlobalMedalStats();

    // Check if we should run incremental update
    if (await shouldRunUpdate(medalData.lastUpdated)) {
      console.log('Data is stale, running incremental update...');
      await runIncrementalUpdate();

      // Reload data after update
      medalData = await getGlobalMedalStats();
    }

    const stats = {
      globalMedalStats: medalData.globalMedalStats,
      lastUpdated: medalData.lastUpdated,
      dataSource: medalData.dataSource || 'supabase',
      lastIndexedBlock: medalData.lastIndexedBlock,
      totalEvents: medalData.totalEvents
    };

    // Cache for 1 hour
    caches.spins.set(cacheKey, stats, 3600000);
    console.log(`Loaded global medal stats: ${medalData.globalMedalStats.total} total medals (last updated: ${medalData.lastUpdated})`);

    res.status(200).json(stats);

  } catch (error) {
    console.error("Error loading global medal stats:", error);

    // Fallback on error
    const fallbackStats = {
      globalMedalStats: {
        bronze: 0,
        silver: 0,
        gold: 0,
        black: 0,
        total: 0
      },
      lastUpdated: new Date().toISOString(),
      dataSource: 'error_fallback',
      error: error.message
    };

    res.status(200).json(fallbackStats);
  }
};