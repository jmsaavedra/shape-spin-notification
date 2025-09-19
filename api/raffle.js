// API endpoint for Black Medal Raffle information
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const { caches } = require("../lib/cache");
const { getRaffleStatus, getRaffleHistory, getDrawTiming } = require("../lib/black-medal-raffle");

const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
const rpcUrl = `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

const provider = new JsonRpcProvider(rpcUrl, {
    name: 'shape-mainnet',
    chainId: 360
});

module.exports = async (req, res) => {
  try {
    const publicAddress = process.env.PUBLIC_ADDRESS;
    if (!publicAddress) {
      return res.status(500).json({ error: "PUBLIC_ADDRESS not configured" });
    }

    // Get Black Medal Raffle status with caching
    const raffleCacheKey = `raffle:${publicAddress.toLowerCase()}`;
    let raffleStatus = caches.spins.get(raffleCacheKey);

    if (raffleStatus === null) {
      raffleStatus = await getRaffleStatus(publicAddress, provider);
      caches.spins.set(raffleCacheKey, raffleStatus, 300); // 5 minutes
      console.log(`Fetched Black Medal Raffle status: eligible=${raffleStatus.isEligible}, entered=${raffleStatus.isEntered}, streak=${raffleStatus.currentStreak}`);
    } else {
      console.log(`Using cached Black Medal Raffle status`);
    }

    // Get raffle history (cached for 1 hour)
    const historyKey = 'raffleHistory';
    let raffleHistory = caches.spins.get(historyKey);

    if (raffleHistory === null) {
      raffleHistory = await getRaffleHistory(provider, 5);
      caches.spins.set(historyKey, raffleHistory, 3600); // 1 hour
      console.log(`Fetched Black Medal Raffle history: ${raffleHistory.length} recent rounds`);
    }

    // Get draw timing information
    const drawTiming = getDrawTiming();

    // Calculate next milestone if not eligible
    let nextMilestone = null;
    if (!raffleStatus.isEligible && raffleStatus.currentStreak < raffleStatus.minimumStreakRequired) {
      const daysLeft = raffleStatus.minimumStreakRequired - raffleStatus.currentStreak;
      nextMilestone = {
        daysLeft,
        message: `${daysLeft} more consecutive day${daysLeft === 1 ? '' : 's'} needed`,
        progress: raffleStatus.streakProgress
      };
    }

    // Generate action recommendations
    let actionRecommendation = null;
    if (raffleStatus.isFrozen) {
      actionRecommendation = {
        action: "wait",
        message: "Raffle is currently paused by Shape team",
        url: null
      };
    } else if (raffleStatus.canEnter) {
      actionRecommendation = {
        action: "enter",
        message: "You're eligible! Visit Shape to enter the Black Medal raffle",
        url: "https://stack.shape.network/medal-spin" // Update with actual raffle URL
      };
    } else if (raffleStatus.isEntered) {
      actionRecommendation = {
        action: "wait",
        message: "You're entered in the current raffle - results will be announced soon",
        url: null
      };
    } else if (raffleStatus.currentStreak === 0) {
      actionRecommendation = {
        action: "start_streak",
        message: "Start your daily spin streak to become eligible for Black Medal raffle",
        url: "https://stack.shape.network/medal-spin"
      };
    } else {
      actionRecommendation = {
        action: "continue_streak",
        message: `Keep your daily spin streak going! ${raffleStatus.daysToEligibility} more days to eligibility`,
        url: "https://stack.shape.network/medal-spin"
      };
    }

    res.status(200).json({
      // Current raffle status
      raffleStatus,

      // Historical data
      raffleHistory,

      // Timing information
      drawTiming,

      // Helper information
      nextMilestone,
      actionRecommendation,

      // Contract information
      contractAddress: "0xEFe03c16c2f08B622D0d9A01cC8169da33CfeEDe",
      network: "Shape Mainnet (Chain ID: 360)",

      // Metadata
      timestamp: Date.now(),
      cached: raffleStatus !== null
    });

  } catch (error) {
    console.error("Error fetching raffle info:", error);
    res.status(500).json({
      error: error.message,
      raffleStatus: {
        isEligible: false,
        isEntered: false,
        currentStreak: 0,
        minimumStreakRequired: 7,
        streakProgress: 0,
        daysToEligibility: 7,
        currentRound: 0,
        participantCount: 0,
        isFrozen: false,
        statusMessage: "Raffle data unavailable",
        canEnter: false,
        error: error.message
      }
    });
  }
};