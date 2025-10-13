// Black Medal Raffle contract interaction functions
const { ethers } = require("ethers");
const { batchContractCalls } = require("./multicall");
const { caches, TTL } = require("./cache");
const { getCachedEnsName, cacheEnsName, getCachedRaffleHistory, cacheRaffleHistory } = require("../utils/supabase");

// Black Medal Raffle contract details
const BLACK_MEDAL_RAFFLE_ADDRESS = "0xEFe03c16c2f08B622D0d9A01cC8169da33CfeEDe";

// Black Medal Raffle ABI (relevant functions only)
const BLACK_MEDAL_RAFFLE_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "participant", "type": "address"}],
    "name": "isParticipantInCurrentRaffle",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCurrentRaffleList",
    "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCurrentRaffleRound",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMinimumStreakLength",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "round", "type": "uint256"}],
    "name": "getWinnerForRound",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "participant", "type": "address"}, {"internalType": "uint256", "name": "round", "type": "uint256"}],
    "name": "participantedInRound",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isFrozen",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// MedalSpin contract ABI for streak checking
const MEDAL_SPIN_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "collector", "type": "address"}],
    "name": "getSpins",
    "outputs": [{"components": [{"internalType": "bytes32", "name": "hash", "type": "bytes32"}, {"internalType": "uint256", "name": "timestamp", "type": "uint256"}], "internalType": "struct SpinInfo[]", "name": "", "type": "tuple[]"}],
    "stateMutability": "view",
    "type": "function"
  }
];

const MEDAL_SPIN_ADDRESS = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

/**
 * Calculate consecutive spin streak based on 48-hour gaps between spins
 * @param {Array} spins - Array of spin objects with timestamp
 * @returns {number} Current consecutive streak length in days
 */
function calculateConsecutiveStreak(spins) {
  if (!spins || spins.length === 0) return 0;

  // Sort spins by timestamp (most recent first)
  const sortedSpins = [...spins].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

  // Check if last spin was more than 48 hours ago
  const now = new Date();
  const mostRecentSpinTime = Number(sortedSpins[0].timestamp) * 1000;
  const hoursSinceLastSpin = (now.getTime() - mostRecentSpinTime) / (1000 * 60 * 60);

  if (hoursSinceLastSpin > 48) {
    return 0; // Streak broken if more than 48 hours since last spin
  }

  // Calculate current consecutive streak based on 48-hour gaps
  let currentStreak = 1; // Start with 1 for the most recent spin

  for (let i = 1; i < sortedSpins.length; i++) {
    const currentSpinTime = Number(sortedSpins[i - 1].timestamp) * 1000;
    const previousSpinTime = Number(sortedSpins[i].timestamp) * 1000;
    const hoursBetween = (currentSpinTime - previousSpinTime) / (1000 * 60 * 60);

    if (hoursBetween <= 48) {
      // Gap is 48 hours or less - continue streak
      currentStreak++;
    } else {
      // Gap is more than 48 hours - streak ends
      break;
    }
  }

  return currentStreak;
}

/**
 * Check raffle eligibility and status for a given address
 * @param {string} walletAddress - Ethereum address to check
 * @param {ethers.Provider} provider - Ethereum provider
 * @returns {Object} Raffle status information
 */
async function getRaffleStatus(walletAddress, provider) {
  try {
    const raffleContract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, BLACK_MEDAL_RAFFLE_ABI, provider);
    const medalSpinContract = new ethers.Contract(MEDAL_SPIN_ADDRESS, MEDAL_SPIN_ABI, provider);

    // Batch call to get all raffle info
    const [
      isParticipant,
      currentRaffleList,
      currentRound,
      minimumStreakLength,
      isFrozen,
      spins
    ] = await batchContractCalls([
      { contract: raffleContract, method: 'isParticipantInCurrentRaffle', args: [walletAddress] },
      { contract: raffleContract, method: 'getCurrentRaffleList', args: [] },
      { contract: raffleContract, method: 'getCurrentRaffleRound', args: [] },
      { contract: raffleContract, method: 'getMinimumStreakLength', args: [] },
      { contract: raffleContract, method: 'isFrozen', args: [] },
      { contract: medalSpinContract, method: 'getSpins', args: [walletAddress] }
    ], provider);

    // Calculate current streak
    const currentStreak = calculateConsecutiveStreak(spins);
    const minimumStreak = Number(minimumStreakLength);

    // Determine eligibility
    const isEligible = currentStreak >= minimumStreak && !isFrozen;
    const isEntered = isParticipant;

    // Get participant count
    const participantCount = currentRaffleList.length;

    return {
      // Eligibility info
      isEligible,
      isEntered,
      currentStreak,
      minimumStreakRequired: minimumStreak,
      streakProgress: Math.min(currentStreak / minimumStreak, 1.0),
      daysToEligibility: Math.max(0, minimumStreak - currentStreak),

      // Current raffle info
      currentRound: Number(currentRound),
      participantCount,
      isFrozen,

      // Status message
      statusMessage: getStatusMessage(isEligible, isEntered, currentStreak, minimumStreak, isFrozen),

      // Action available
      canEnter: isEligible && !isEntered && !isFrozen
    };

  } catch (error) {
    console.error("Error fetching raffle status:", error);
    return {
      isEligible: false,
      isEntered: false,
      currentStreak: 0,
      minimumStreakRequired: 7,
      streakProgress: 0,
      daysToEligibility: 7,
      currentRound: 0,
      participantCount: 0,
      isFrozen: false,
      statusMessage: "Unable to fetch raffle status",
      canEnter: false,
      error: error.message
    };
  }
}

/**
 * Get raffle history for all completed rounds with ENS resolution
 * @param {ethers.Provider} provider - Ethereum provider
 * @param {string} alchemyApiKey - Alchemy API key for ENS resolution
 * @param {boolean} forceRefresh - Force refresh from blockchain (default: false)
 * @returns {Array} Array of round winners with ENS names
 */
async function getRaffleHistory(provider, alchemyApiKey = 'public', forceRefresh = false) {
  try {
    // Check Supabase cache first (unless force refresh)
    let cachedData = null;
    if (!forceRefresh) {
      cachedData = await getCachedRaffleHistory();
      if (cachedData && cachedData.history && cachedData.history.length > 0) {
        // Cache is valid, check if it's reasonably fresh (less than 1 hour old)
        const cacheAge = Date.now() - new Date(cachedData.lastUpdated).getTime();
        if (cacheAge < 3600000) { // 1 hour in milliseconds
          return cachedData.history;
        }
      }
    }

    const raffleContract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, BLACK_MEDAL_RAFFLE_ABI, provider);

    // Get current round
    const currentRound = await raffleContract.getCurrentRaffleRound();
    const currentRoundNum = Number(currentRound);

    if (currentRoundNum === 0) {
      return [];
    }

    // Fetch ALL winners for all completed rounds (no quantity cap)
    const rounds = [];
    for (let i = 1; i < currentRoundNum; i++) {
      rounds.push(i);
    }

    if (rounds.length === 0) {
      return [];
    }

    // Check if we have cached data to compare against
    const cachedRounds = cachedData?.history ? new Map(cachedData.history.map(r => [r.round, r])) : new Map();
    const hasNewRounds = rounds.length > cachedRounds.size;

    if (!hasNewRounds && cachedData?.history) {
      // No new rounds, just refresh the cache timestamp and return existing data
      await cacheRaffleHistory(cachedData.history);
      return cachedData.history;
    }

    // Batch call to get winners
    const calls = rounds.map(round => ({
      contract: raffleContract,
      method: 'getWinnerForRound',
      args: [round]
    }));

    const winners = await batchContractCalls(calls, provider);

    const results = rounds.map((round, index) => ({
      round,
      winner: winners[index],
      hasWinner: winners[index] !== "0x0000000000000000000000000000000000000000"
    })).filter(r => r.hasWinner);

    // Optimize: Reuse ENS data from cached rounds, only fetch for NEW winners
    let ensResolutionCount = 0;
    let mainnetProvider = null;

    // Add ENS resolution for each winner
    for (const result of results) {
      const winnerAddress = result.winner;
      const cachedRound = cachedRounds.get(result.round);

      // If we have this round cached, reuse its ENS name (no Alchemy calls!)
      if (cachedRound && cachedRound.winner.toLowerCase() === winnerAddress.toLowerCase()) {
        result.ensName = cachedRound.ensName;
        continue;
      }

      // This is a NEW winner - need to resolve ENS
      const ensCacheKey = `ens:${winnerAddress.toLowerCase()}`;

      // Check memory cache first
      let ensName = caches.ens.get(ensCacheKey);

      if (ensName === null) {
        // Check Supabase cache
        ensName = await getCachedEnsName(winnerAddress);

        if (ensName !== null) {
          // Found in Supabase, store in memory cache too
          caches.ens.set(ensCacheKey, ensName, TTL.ENS);
        } else {
          // Not in any cache, fetch from blockchain (Alchemy calls)
          // Only create provider when actually needed
          if (!mainnetProvider) {
            mainnetProvider = new ethers.JsonRpcProvider(
              `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
            );
            await mainnetProvider.getNetwork();
          }

          try {
            ensName = await mainnetProvider.lookupAddress(winnerAddress);
            ensResolutionCount++;

            // If we got an ENS name, verify it resolves back to the same address
            if (ensName) {
              const resolvedAddress = await mainnetProvider.resolveName(ensName);
              ensResolutionCount++;
              if (resolvedAddress?.toLowerCase() !== winnerAddress.toLowerCase()) {
                // ENS mismatch - reverse and forward resolution don't match
                ensName = null;
              }
            }

            // Cache the result in both memory and Supabase (even if null)
            caches.ens.set(ensCacheKey, ensName, TTL.ENS);
            await cacheEnsName(winnerAddress, ensName, 2592000); // 30 days in Supabase
          } catch (error) {
            // Cache null for shorter time on error (1 hour)
            caches.ens.set(ensCacheKey, null, TTL.CONTRACT);
            await cacheEnsName(winnerAddress, null, 3600); // 1 hour in Supabase
            ensName = null;
          }
        }
      }

      result.ensName = ensName;
    }

    // Cache the complete raffle history in Supabase
    await cacheRaffleHistory(results);

    return results;

  } catch (error) {
    console.error("Error fetching raffle history:", error);

    // Try to return cached data as fallback
    const cached = await getCachedRaffleHistory();
    if (cached && cached.history) {
      return cached.history;
    }

    return [];
  }
}

/**
 * Generate status message based on raffle state
 */
function getStatusMessage(isEligible, isEntered, currentStreak, minimumStreak, isFrozen) {
  if (isFrozen) {
    return "Raffle is currently paused";
  }

  if (isEntered) {
    return "You're in the current raffle - check Shape for results";
  }

  if (isEligible) {
    return "Eligible for Black Medal raffle - visit Shape to enter";
  }

  if (currentStreak === 0) {
    return `Need ${minimumStreak} consecutive days to enter Black Medal raffle`;
  }

  const daysLeft = minimumStreak - currentStreak;
  return `${daysLeft} more day${daysLeft === 1 ? '' : 's'} needed for Black Medal raffle (${currentStreak}/${minimumStreak})`;
}

/**
 * Check if VRF draw timing can be determined
 * Unfortunately, this information is not available on-chain.
 * The draw is triggered manually by admins/operators.
 */
function getDrawTiming() {
  return {
    isScheduled: false,
    nextDrawTime: null,
    message: "Draw timing is determined by Shape team - no public schedule available"
  };
}

module.exports = {
  getRaffleStatus,
  getRaffleHistory,
  calculateConsecutiveStreak,
  getDrawTiming,
  BLACK_MEDAL_RAFFLE_ADDRESS,
  MEDAL_SPIN_ADDRESS
};