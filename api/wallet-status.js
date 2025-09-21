// API endpoint to check the schedule status for any wallet address
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");
const { caches, TTL } = require("../lib/cache");
const { batchContractCalls } = require("../lib/multicall");
const { calculateConsecutiveStreak } = require("../lib/black-medal-raffle");
const { trackWalletSubmission } = require("../utils/supabase");

const abi = [
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"canSpin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

// Stack NFT ABI for medals
const stackAbi = [
  {"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"addressToTokenId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"stackId","type":"uint256"}],"name":"getStackMedals","outputs":[{"components":[{"internalType":"address","name":"stackOwner","type":"address"},{"internalType":"uint256","name":"stackId","type":"uint256"},{"internalType":"bytes32","name":"medalUID","type":"bytes32"},{"internalType":"uint16","name":"medalTier","type":"uint16"},{"internalType":"bytes","name":"medalData","type":"bytes"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct ShapeMedalSchema[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";
const STACK_NFT_CONTRACT = "0x76d6aC90A62Ca547d51D7AcAeD014167F81B9931";

const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
const rpcUrl = `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

const provider = new JsonRpcProvider(rpcUrl, {
    name: 'shape-mainnet',
    chainId: 360
});

// Validate wallet address format
function isValidAddress(address) {
  // Check if it's a valid Ethereum address (0x + 40 hex chars)
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return true;
  }

  // Check if it's a valid ENS name format
  if (/^[a-zA-Z0-9-]+\.eth$/.test(address)) {
    return true;
  }

  return false;
}

module.exports = async (req, res) => {
  // Return JSON API response
  try {
    // Get wallet address from query parameter
    const walletAddress = req.query.address;

    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet address parameter 'address' is required" });
    }

    // Validate address format
    if (!isValidAddress(walletAddress)) {
      return res.status(400).json({ error: "Invalid wallet address format. Must be a valid Ethereum address (0x...) or ENS name (.eth)" });
    }

    let publicAddress = walletAddress;
    let ensName = null;

    // If it's an ENS name, resolve it to an address
    if (walletAddress.endsWith('.eth')) {
      try {
        const mainnetProvider = new JsonRpcProvider(
          `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
        );

        await mainnetProvider.getNetwork();
        publicAddress = await mainnetProvider.resolveName(walletAddress);

        if (!publicAddress) {
          return res.status(404).json({ error: "ENS name could not be resolved to an address" });
        }

        ensName = walletAddress; // Store the original ENS name
      } catch (error) {
        return res.status(500).json({ error: "Failed to resolve ENS name" });
      }
    } else {
      // If it's an address, try to get its ENS name
      const ensCacheKey = `ens:${publicAddress.toLowerCase()}`;
      ensName = caches.ens.get(ensCacheKey);

      if (ensName === null) {
        try {
          const mainnetProvider = new JsonRpcProvider(
            `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
          );

          await mainnetProvider.getNetwork();
          ensName = await mainnetProvider.lookupAddress(publicAddress);

          // Verify ENS reverse resolution
          if (ensName) {
            const resolvedAddress = await mainnetProvider.resolveName(ensName);
            if (resolvedAddress?.toLowerCase() !== publicAddress.toLowerCase()) {
              ensName = null;
            }
          }

          // Cache the result for 30 days
          caches.ens.set(ensCacheKey, ensName, TTL.ENS);
        } catch (error) {
          caches.ens.set(ensCacheKey, null, TTL.CONTRACT);
        }
      }
    }

    // Create contracts
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const stackContract = new ethers.Contract(STACK_NFT_CONTRACT, stackAbi, provider);

    // Get spins with caching using wallet-specific cache keys
    const spinsCacheKey = `wallet_spins:${publicAddress.toLowerCase()}`;
    let spins = caches.spins.get(spinsCacheKey);
    let canSpinNow;
    let spinCount;

    // Variables for Stack NFT data
    let stackId = null;
    let allMedals = [];

    // Variable for raffle data
    let globalRaffleData = null;

    // Check medal cache - wallet-specific caching
    const medalsCacheKey = `wallet_medalSpin:${publicAddress.toLowerCase()}`;
    const lastFetchKey = `wallet_lastMedalFetch:${publicAddress.toLowerCase()}`;
    let cachedMedalSpinData = caches.spins.get(medalsCacheKey);
    let lastFetchTimestamp = caches.spins.get(lastFetchKey);

    // Create raffle contract for multicall
    const raffleContract = new ethers.Contract("0xEFe03c16c2f08B622D0d9A01cC8169da33CfeEDe", [
      {"inputs": [{"internalType": "address", "name": "participant", "type": "address"}], "name": "isParticipantInCurrentRaffle", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
      {"inputs": [], "name": "getCurrentRaffleList", "outputs": [{"internalType": "address[]", "name": "", "type": "address[]"}], "stateMutability": "view", "type": "function"},
      {"inputs": [], "name": "getCurrentRaffleRound", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
      {"inputs": [], "name": "getMinimumStreakLength", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
      {"inputs": [], "name": "isFrozen", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"}
    ], provider);

    if (spins === null) {
      // Not in cache, batch fetch ALL data from blockchain in ONE call
      const [
        spinsResult,
        canSpinResult,
        stackIdResult,
        isParticipant,
        currentRaffleList,
        currentRound,
        minimumStreakLength,
        isFrozen
      ] = await batchContractCalls([
        { contract, method: 'getSpins', args: [publicAddress] },
        { contract, method: 'canSpin', args: [publicAddress] },
        { contract: stackContract, method: 'addressToTokenId', args: [publicAddress] },
        { contract: raffleContract, method: 'isParticipantInCurrentRaffle', args: [publicAddress] },
        { contract: raffleContract, method: 'getCurrentRaffleList', args: [] },
        { contract: raffleContract, method: 'getCurrentRaffleRound', args: [] },
        { contract: raffleContract, method: 'getMinimumStreakLength', args: [] },
        { contract: raffleContract, method: 'isFrozen', args: [] }
      ], provider);

      spins = spinsResult;
      canSpinNow = canSpinResult;
      stackId = stackIdResult.toString();

      // Store raffle data for later use
      globalRaffleData = {
        isParticipant,
        currentRaffleList,
        currentRound: Number(currentRound),
        minimumStreakLength: Number(minimumStreakLength),
        isFrozen
      };

      // Cache spins with shorter TTL for wallet views (1 hour)
      caches.spins.set(spinsCacheKey, spins, 3600);
    } else {
      // Spins are cached, fetch canSpin, stackId, and raffle data
      const [
        canSpinResult,
        stackIdResult,
        isParticipant,
        currentRaffleList,
        currentRound,
        minimumStreakLength,
        isFrozen
      ] = await batchContractCalls([
        { contract, method: 'canSpin', args: [publicAddress] },
        { contract: stackContract, method: 'addressToTokenId', args: [publicAddress] },
        { contract: raffleContract, method: 'isParticipantInCurrentRaffle', args: [publicAddress] },
        { contract: raffleContract, method: 'getCurrentRaffleList', args: [] },
        { contract: raffleContract, method: 'getCurrentRaffleRound', args: [] },
        { contract: raffleContract, method: 'getMinimumStreakLength', args: [] },
        { contract: raffleContract, method: 'isFrozen', args: [] }
      ], provider);

      canSpinNow = canSpinResult;
      stackId = stackIdResult.toString();

      // Store raffle data for later use
      globalRaffleData = {
        isParticipant,
        currentRaffleList,
        currentRound: Number(currentRound),
        minimumStreakLength: Number(minimumStreakLength),
        isFrozen
      };

    }

    spinCount = spins.length;

    let lastSpinTime = null;
    let lastSpinTimestamp = null;
    let timeSinceLastSpin = null;

    if (spins.length > 0) {
      const lastSpinTs = spins[spins.length - 1].timestamp;
      lastSpinTimestamp = Number(lastSpinTs) * 1000; // Convert to milliseconds
      const lastSpinDate = new Date(lastSpinTimestamp);
      const lastSpinDateString = lastSpinDate.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        year: '2-digit',
        month: '2-digit',
        day: '2-digit'
      });
      const lastSpinTimeString = lastSpinDate.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      lastSpinTime = `${lastSpinDateString}, ${lastSpinTimeString} ET`;

      const now = Date.now();
      const hoursSince = Math.floor((now - lastSpinTimestamp) / (1000 * 60 * 60));
      const minutesSince = Math.floor(((now - lastSpinTimestamp) % (1000 * 60 * 60)) / (1000 * 60));
      timeSinceLastSpin = `${hoursSince}h ${minutesSince}m`;
    }

    const nextSpinTime = scheduleState.getNextSpinTimeString(lastSpinTimestamp);
    const nextSpinDate = scheduleState.calculateNextSpinTime(lastSpinTimestamp);

    // Calculate time until next spin
    const now = Date.now();
    const msUntil = nextSpinDate.getTime() - now;
    const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
    const timeUntilSpin = msUntil > 0 ? `${hoursUntil}h ${minutesUntil}m` : 'Now';

    // Process MEDAL-SPIN medals
    let medalSpinMedals = [];
    let medalStats = null;

    // Smart caching: Skip fetching if we have cached data and conditions are met
    const currentTime = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    // Check if the most recent spin has a medal matched
    let mostRecentSpinHasMedal = false;
    if (cachedMedalSpinData && spins.length > 0) {
      const mostRecentSpinTime = Number(spins[spins.length - 1].timestamp) * 1000;
      mostRecentSpinHasMedal = cachedMedalSpinData.medals.some(m => {
        const timeDiff = m.timestamp - mostRecentSpinTime;
        return timeDiff >= 0 && timeDiff <= 1800000; // Within 30 minutes
      });
    }

    const shouldUseCachedMedals = cachedMedalSpinData && lastFetchTimestamp && mostRecentSpinHasMedal && (
      // Can't spin and we've fetched today
      (!canSpinNow && lastFetchTimestamp >= todayStart) ||
      // Can't spin and fetched within last 5 minutes
      (!canSpinNow && (currentTime - lastFetchTimestamp) < 300) ||
      // Have all medals up to yesterday and can't spin today
      (!canSpinNow && lastSpinTimestamp && lastFetchTimestamp >= (lastSpinTimestamp + 600))
    );

    if (shouldUseCachedMedals) {
      medalSpinMedals = cachedMedalSpinData.medals;
      medalStats = cachedMedalSpinData.stats;
      // Need to get allMedals for raffle processing even when cached
      if (stackId !== "0" && stackId) {
        try {
          allMedals = await stackContract.getStackMedals(stackId);
        } catch (error) {
          console.error('Error fetching allMedals for raffle processing:', error);
        }
      }
    } else if (stackId !== "0" && stackId) {
      // Fetch medals if we have a valid Stack ID and they're not cached
      try {
        allMedals = await stackContract.getStackMedals(stackId);

        // Process medals to find MEDAL-SPIN ones
        try {

        // Filter for MEDAL-SPIN medals
        const tierNames = ['Unknown', 'Bronze', 'Silver', 'Gold', 'Black/Obsidian'];

        for (const medal of allMedals) {
          try {
            // Check if this medal has the right tier number
            const tierNumber = typeof medal.medalTier === 'bigint' ?
              Number(medal.medalTier) : medal.medalTier;

            // Skip processing if tier is out of range
            if (tierNumber < 1 || tierNumber > 4) continue;

            let metadata = {};
            try {
              const dataString = ethers.toUtf8String(medal.medalData);
              metadata = JSON.parse(dataString);
            } catch (e) {
              try {
                const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], medal.medalData);
                metadata = JSON.parse(decoded[0]);
              } catch (e2) {}
            }

            if (metadata.projectId === 'MEDAL-SPIN') {
              // Convert BigInt timestamp to number
              const medalTimestamp = typeof medal.timestamp === 'bigint' ?
                Number(medal.timestamp) : Number(medal.timestamp);

              // Only include Bronze, Silver, and Gold medals for spin matching
              // Black medals come from raffles, not spins
              if (tierNumber >= 1 && tierNumber <= 3) {
                medalSpinMedals.push({
                  tier: tierNumber,
                  tierName: tierNames[tierNumber] || `Tier-${tierNumber}`,
                  name: metadata.name || metadata.id || 'Medal',
                  timestamp: medalTimestamp
                });
              }
            }
          } catch (error) {
            // Skip medals that can't be processed
          }
        }

          // If we have cached data and new timestamp, merge with existing medals
          if (cachedMedalSpinData && lastFetchTimestamp && medalSpinMedals.length > 0) {
            // Find medals newer than our last fetch
            const newMedals = medalSpinMedals.filter(m => m.timestamp > lastFetchTimestamp);
            if (newMedals.length > 0) {
              // Merge new medals with cached ones
              const existingTimestamps = new Set(cachedMedalSpinData.medals.map(m => m.timestamp));
              newMedals.forEach(medal => {
                if (!existingTimestamps.has(medal.timestamp)) {
                  cachedMedalSpinData.medals.push(medal);
                }
              });
              medalSpinMedals = cachedMedalSpinData.medals;
            } else {
              medalSpinMedals = cachedMedalSpinData.medals;
            }
          }

          // Calculate medal statistics
          // For stats, include ALL medals (Bronze, Silver, Gold, Black)
          // For spin assignment, only use Bronze, Silver, Gold (medalSpinMedals is already filtered)
          if (medalSpinMedals.length > 0) {
            // Sort medals by tier for proper assignment
            medalSpinMedals.sort((a, b) => a.tier - b.tier);

            // Calculate stats from the original allMedals array to include Black medals
            const allMedalSpinMedalsForStats = [];
            if (allMedals.length > 0) {
              const tierNames = ['Unknown', 'Bronze', 'Silver', 'Gold', 'Black/Obsidian'];

              for (const medal of allMedals) {
                try {
                  const tierNumber = typeof medal.medalTier === 'bigint' ?
                    Number(medal.medalTier) : medal.medalTier;

                  if (tierNumber >= 1 && tierNumber <= 4) {
                    let metadata = {};
                    try {
                      const dataString = ethers.toUtf8String(medal.medalData);
                      metadata = JSON.parse(dataString);
                    } catch (e) {
                      try {
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], medal.medalData);
                        metadata = JSON.parse(decoded[0]);
                      } catch (e2) {}
                    }

                    if (metadata.projectId === 'MEDAL-SPIN') {
                      allMedalSpinMedalsForStats.push({
                        tier: tierNumber,
                        tierName: tierNames[tierNumber] || `Tier-${tierNumber}`,
                        name: metadata.name || metadata.id || 'Medal'
                      });
                    }
                  }
                } catch (error) {
                  // Skip medals that can't be processed
                }
              }

              // Calculate stats excluding Black medals (which come from raffles, not spins)
              const spinOnlyMedals = allMedalSpinMedalsForStats.filter(m => m.tier <= 3);
              medalStats = {
                total: spinOnlyMedals.length,
                bronze: spinOnlyMedals.filter(m => m.tier === 1).length,
                silver: spinOnlyMedals.filter(m => m.tier === 2).length,
                gold: spinOnlyMedals.filter(m => m.tier === 3).length,
                black: 0 // Black medals are from raffles, not counted in spin stats
              };
            } else {
              // Fallback: use filtered medals if allMedals not available
              medalStats = {
                total: medalSpinMedals.length,
                bronze: medalSpinMedals.filter(m => m.tier === 1).length,
                silver: medalSpinMedals.filter(m => m.tier === 2).length,
                gold: medalSpinMedals.filter(m => m.tier === 3).length,
                black: 0 // No Black medals in filtered list
              };
            }

            // Cache the processed MEDAL-SPIN data with shorter TTL for wallet views (1 hour)
            const cacheData = { medals: medalSpinMedals, stats: medalStats };
            caches.spins.set(medalsCacheKey, cacheData, 3600);
            caches.spins.set(lastFetchKey, currentTime, 3600);
          }
        } catch (error) {
          // If medal processing fails, just continue without medals
        }
      } catch (error) {
      }
    }

    // Filter out potential Black medal claim transactions from spins
    // If we have Black medals, some "spins" might actually be medal claims
    let filteredSpins = [...spins];

    if (medalSpinMedals && medalSpinMedals.length > 0) {
      // Get ALL medals (including Black) to detect Black medal claims
      const allMedalSpinMedals = [];

      if (stackId !== "0" && stackId) {
        try {
          // Re-process medals including Black ones for detection
          const tierNames = ['Unknown', 'Bronze', 'Silver', 'Gold', 'Black/Obsidian'];

          for (const medal of allMedals) {
            try {
              const tierNumber = typeof medal.medalTier === 'bigint' ?
                Number(medal.medalTier) : medal.medalTier;

              if (tierNumber >= 1 && tierNumber <= 4) { // Include Black for detection
                let metadata = {};
                try {
                  const dataString = ethers.toUtf8String(medal.medalData);
                  metadata = JSON.parse(dataString);
                } catch (e) {
                  try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], medal.medalData);
                    metadata = JSON.parse(decoded[0]);
                  } catch (e2) {}
                }

                if (metadata.projectId === 'MEDAL-SPIN') {
                  const medalTimestamp = typeof medal.timestamp === 'bigint' ?
                    Number(medal.timestamp) : Number(medal.timestamp);

                  allMedalSpinMedals.push({
                    tier: tierNumber,
                    tierName: tierNames[tierNumber] || `Tier-${tierNumber}`,
                    timestamp: medalTimestamp
                  });
                }
              }
            } catch (error) {
              // Skip medals that can't be processed
            }
          }
        } catch (error) {
          // Continue if medal processing fails
        }
      }

      // Find Black medals and remove corresponding "spins"
      const blackMedals = allMedalSpinMedals.filter(m => m.tier === 4);

      if (blackMedals.length > 0) {
        blackMedals.forEach(blackMedal => {
          // Find the spin closest in time to this Black medal (within 24 hours)
          const candidateSpins = spins.map((spin, index) => ({
            index,
            timestamp: Number(spin.timestamp),
            timeDiff: Math.abs(Number(spin.timestamp) - blackMedal.timestamp)
          }))
          .filter(s => s.timeDiff <= 86400) // Within 24 hours
          .sort((a, b) => a.timeDiff - b.timeDiff);

          if (candidateSpins.length > 0) {
            const suspectSpinIndex = candidateSpins[0].index;
            filteredSpins = filteredSpins.filter((_, index) => index !== suspectSpinIndex);
          }
        });
      }
    }

    // Create complete activity history including spins and Black medal raffle wins
    let allActivities = [];

    // Debug info for raffle processing
    const debugInfo = {
      stackId: stackId,
      allMedalsLength: allMedals?.length || 0,
      hasValidStackId: stackId !== "0" && stackId,
      hasAllMedals: !!(allMedals && allMedals.length > 0)
    };

    // Add all filtered spins
    filteredSpins.forEach((spin, index) => {
      allActivities.push({
        type: 'spin',
        timestamp: Number(spin.timestamp) * 1000,
        spinNumber: index + 1,
        originalData: spin
      });
    });

    // TEMP: Add hardcoded Black medal raffle win for testing
    if (publicAddress.toLowerCase() === '0x0eb5187d374cd8d6fcb46d93c1bc52ab554765a1') {
      allActivities.push({
        type: 'raffle',
        timestamp: 1757706915000, // Sept 12, 2025 at 3:55:15 PM ET
        medal: {
          tier: 'Black/Obsidian',
          name: 'Black Medal'
        }
      });
    }

    // Add Black medal raffle wins
    if (stackId !== "0" && stackId && allMedals && allMedals.length > 0) {
      // Process Black medals for raffle entries
        try {
          const tierNames = ['Unknown', 'Bronze', 'Silver', 'Gold', 'Black/Obsidian'];

          for (const medal of allMedals) {
            try {
              const tierNumber = typeof medal.medalTier === 'bigint' ?
                Number(medal.medalTier) : medal.medalTier;

              if (tierNumber === 4) { // Black medals only
                let metadata = {};
                try {
                  const dataString = ethers.toUtf8String(medal.medalData);
                  metadata = JSON.parse(dataString);
                } catch (e) {
                  try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], medal.medalData);
                    metadata = JSON.parse(decoded[0]);
                  } catch (e2) {}
                }

                if (metadata.projectId === 'MEDAL-SPIN') {
                  const medalTimestamp = typeof medal.timestamp === 'bigint' ?
                    Number(medal.timestamp) : Number(medal.timestamp);

                  allActivities.push({
                    type: 'raffle',
                    timestamp: medalTimestamp * 1000,
                    medal: {
                      tier: tierNames[tierNumber] || `Tier-${tierNumber}`,
                      name: metadata.name || metadata.id || 'Black Medal'
                    }
                  });
                }
              }
            } catch (error) {
              // Skip medals that can't be processed
            }
          }
      } catch (error) {
        // Continue if medal processing fails
      }
    }

    // Sort all activities by timestamp
    allActivities.sort((a, b) => a.timestamp - b.timestamp);

    // Format the combined activity history
    let spinIndex = 0; // Track actual spin numbering separately from activities
    const spinHistory = allActivities.map((activity, index) => {
      const timestamp = activity.timestamp;
      let gap = null;

      // Calculate gap from previous SPIN (not previous activity)
      if (activity.type === 'spin' && index > 0) {
        // Find the most recent spin before this one
        let prevSpinTimestamp = null;
        for (let i = index - 1; i >= 0; i--) {
          if (allActivities[i].type === 'spin') {
            prevSpinTimestamp = allActivities[i].timestamp;
            break;
          }
        }

        if (prevSpinTimestamp) {
          const gapMs = timestamp - prevSpinTimestamp;
          const totalHours = Math.floor(gapMs / (1000 * 60 * 60));
          const days = Math.floor(totalHours / 24);
          const hours = totalHours % 24;
          const minutes = Math.floor((gapMs % (1000 * 60 * 60)) / (1000 * 60));

          // Format with color coding
          if (totalHours >= 48) {
            // 48+ hours (2+ days) - all red
            gap = `<span style="color: #dc2626;">+${days}d ${hours}h ${minutes}m</span>`;
          } else {
            // Under 48 hours - days gray, time green
            if (days > 0) {
              gap = `<span style="color: #6b7280;">+${days}d</span> <span style="color: #10b981;">${hours}h ${minutes}m</span>`;
            } else {
              gap = `<span style="color: #10b981;">+${hours}h ${minutes}m</span>`;
            }
          }
        }
      }

      if (activity.type === 'raffle') {
        // This is a Black medal raffle win
        return {
          spinNumber: 'RAFFLE WINNER',
          timestamp: timestamp,
          date: (() => {
            const d = new Date(timestamp);
            const dateStr = d.toLocaleDateString('en-US', {
              timeZone: 'America/New_York',
              year: '2-digit',
              month: '2-digit',
              day: '2-digit'
            });
            const timeStr = d.toLocaleTimeString('en-US', {
              timeZone: 'America/New_York',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit'
            });
            return `${dateStr}, ${timeStr}`;
          })(),
          gap: gap,
          medal: activity.medal,
          isRaffle: true
        };
      } else {
        // This is a regular spin
        spinIndex++;
        let medal = null;

        // Special case: Mark specific cheater spin for homepage wallet
        const isCheaterSpin = publicAddress.toLowerCase() === '0x56bde1e5efc80b1e2b958f2d311f4176945ae77f' &&
            spinIndex === 4 && // Spin #4
            activity.timestamp === 1757361651000; // Exact timestamp match

        if (isCheaterSpin) {
          medal = {
            tier: "Cheater",
            name: "Contract Spin",
            isCheat: true
          };
        } else if (medalSpinMedals && medalSpinMedals.length > 0) {
          // Sort medals by timestamp to ensure chronological order
          const sortedMedals = [...medalSpinMedals].sort((a, b) => a.timestamp - b.timestamp);

          // Assign medals in chronological order
          let medalIndex = spinIndex - 1;

          // Assign the medal corresponding to this spin's index (if it exists)
          if (sortedMedals[medalIndex]) {
            const assignedMedal = sortedMedals[medalIndex];
            medal = {
              tier: assignedMedal.tierName,
              name: assignedMedal.name
            };
          }
        }

        return {
          spinNumber: spinIndex,
          timestamp: timestamp,
          date: (() => {
            const d = new Date(timestamp);
            const dateStr = d.toLocaleDateString('en-US', {
              timeZone: 'America/New_York',
              year: '2-digit',
              month: '2-digit',
              day: '2-digit'
            });
            const timeStr = d.toLocaleTimeString('en-US', {
              timeZone: 'America/New_York',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit'
            });
            return `${dateStr}, ${timeStr}`;
          })(),
          gap: gap,
          medal: medal,
          isRaffle: false
        };
      }
    });

    // Generate Black Medal Raffle status from already-fetched data
    let raffleStatus = null;
    let raffleHistory = [];

    if (globalRaffleData) {
      // Calculate streak using existing spin data
      const currentStreak = calculateConsecutiveStreak(spins);
      const minimumStreak = globalRaffleData.minimumStreakLength;

      // Determine eligibility and status
      const isEligible = currentStreak >= minimumStreak && !globalRaffleData.isFrozen;
      const isEntered = globalRaffleData.isParticipant;
      const participantCount = globalRaffleData.currentRaffleList.length;

      raffleStatus = {
        isEligible,
        isEntered,
        currentStreak,
        minimumStreakRequired: minimumStreak,
        streakProgress: Math.min(currentStreak / minimumStreak, 1.0),
        daysToEligibility: Math.max(0, minimumStreak - currentStreak),
        currentRound: globalRaffleData.currentRound,
        participantCount,
        isFrozen: globalRaffleData.isFrozen,
        canEnter: isEligible && !isEntered && !globalRaffleData.isFrozen
      };


      // Get raffle history (cached for 1 hour)
      const historyKey = 'raffleHistory';
      raffleHistory = caches.spins.get(historyKey);

      if (raffleHistory === null) {
        const { getRaffleHistory } = require("../lib/black-medal-raffle");
        raffleHistory = await getRaffleHistory(provider, 20, alchemyApiKey);
        caches.spins.set(historyKey, raffleHistory, 3600); // 1 hour
      }
    } else {
      raffleStatus = {
        isEligible: false,
        isEntered: false,
        currentStreak: 0,
        minimumStreakRequired: 7,
        streakProgress: 0,
        daysToEligibility: 7,
        currentRound: 0,
        participantCount: 0,
        isFrozen: false,
        canEnter: false
      };
    }

    // Get global medal statistics (cached for 1 hour)
    let globalMedalStats = null;
    const globalStatsCacheKey = 'globalMedalStats';
    const cachedGlobalStats = caches.spins.get(globalStatsCacheKey);

    if (cachedGlobalStats !== null) {
      globalMedalStats = cachedGlobalStats.globalMedalStats;
    } else {
      // Try to get global stats from Supabase directly
      try {
        const { getGlobalMedalStats } = require('../utils/supabase');
        const globalStats = await getGlobalMedalStats();
        if (globalStats && globalStats.globalMedalStats) {
          globalMedalStats = globalStats.globalMedalStats;
          // Cache it for future use
          caches.spins.set(globalStatsCacheKey, globalStats, 3600000); // 1 hour
        } else {
          throw new Error('No global stats returned');
        }
      } catch (error) {
        console.error('Error fetching global stats:', error);
        // Use fallback values if direct fetch fails
        globalMedalStats = {
          bronze: 0,
          silver: 0,
          gold: 0,
          black: 0,
          total: 0
        };
      }
    }

    // Track wallet submission for analytics (non-blocking, production only)
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      trackWalletSubmission({
        walletAddress: publicAddress,
        ensName: ensName,
        userAgent: req.headers['user-agent'],
        ipAddress: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress,
        referrer: req.headers['referer'] || req.headers['referrer'],
        hasSpins: filteredSpins.length > 0,
        spinCount: filteredSpins.length,
        hasMedals: medalStats ? medalStats.total > 0 : false,
        medalCount: medalStats ? medalStats.total : 0,
        stackId: stackId !== "0" ? stackId : null,
        canSpinNow: canSpinNow,
        lastSpinTimestamp: lastSpinTimestamp
      }).catch(error => {
        // Don't let tracking errors affect the response
        console.error('Wallet tracking error:', error);
      });
    }

    res.status(200).json({
      currentSpinCount: filteredSpins.length, // Use filtered spin count
      lastSpinTime: lastSpinTime,
      lastSpinTimestamp: lastSpinTimestamp,
      timeSinceLastSpin: timeSinceLastSpin,
      nextSpinTime: nextSpinTime,
      nextSpinTimestamp: nextSpinDate.getTime(),
      canSpinNow: canSpinNow,
      timeUntilSpin: timeUntilSpin,
      walletAddress: publicAddress,
      ensName: ensName,
      spinHistory: spinHistory,
      medalStats: medalStats,
      raffleStatus: raffleStatus,
      raffleHistory: raffleHistory,
      globalMedalStats: globalMedalStats,
      // Wallet view specific flags
      isWalletView: true,
      // No notification data for wallet views
      notificationStatus: null,
      useMetaMaskDeepLink: false,
      // Debug info
      debugInfo: debugInfo
    });

  } catch (error) {
    console.error("Error fetching wallet data:", error);
    res.status(500).json({ error: error.message });
  }
};