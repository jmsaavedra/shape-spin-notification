// API endpoint to get global medal statistics for MEDAL-SPIN project
// Uses Supabase for persistent data storage with automatic incremental updates
require("dotenv").config();
const { caches } = require("../lib/cache");
const { getGlobalMedalStats } = require("../utils/supabase");

async function runIncrementalUpdate() {
  try {
    // Import the runIncrementalUpdate function from the update API
    const updateModule = require('./update-global-medals');
    // Call the internal runIncrementalUpdate function by making a mock request
    const mockReq = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } };
    const mockRes = {
      status: () => ({ json: () => {} }),
      json: () => {}
    };
    await updateModule(mockReq, mockRes);
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
      return res.status(200).json(cachedStats);
    }


    // Load data from Supabase
    let medalData = await getGlobalMedalStats();

    // Check if we should run incremental update
    if (await shouldRunUpdate(medalData.lastUpdated)) {
      // Don't await - let update run in background to prevent blocking the response
      runIncrementalUpdate().catch(error => {
        console.error('Background medal update failed:', error);
      });

      // Return current data immediately, don't wait for update
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