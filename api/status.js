// API endpoint to check the current schedule status without triggering a spin
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");
const { caches, TTL } = require("../lib/cache");
const { batchContractCalls } = require("../lib/multicall");

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

module.exports = async (req, res) => {
  // Return JSON API response
  try {
    const publicAddress = process.env.PUBLIC_ADDRESS;
    if (!publicAddress) {
      return res.status(500).json({ error: "PUBLIC_ADDRESS not configured" });
    }

    // Try to resolve ENS name with caching
    let ensName = null;
    const ensCacheKey = `ens:${publicAddress.toLowerCase()}`;
    
    // Check cache first
    ensName = caches.ens.get(ensCacheKey);
    
    if (ensName === null) {
      // Not in cache, fetch from blockchain
      try {
        // Create mainnet provider for ENS resolution (ENS is on Ethereum mainnet)
        // Don't pass network config - let ethers auto-detect to get ENS support
        const mainnetProvider = new JsonRpcProvider(
          `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
        );
        
        // Wait for network to be ready
        await mainnetProvider.getNetwork();
        
        ensName = await mainnetProvider.lookupAddress(publicAddress);
        
        // If we got an ENS name, verify it resolves back to the same address
        if (ensName) {
          const resolvedAddress = await mainnetProvider.resolveName(ensName);
          if (resolvedAddress?.toLowerCase() !== publicAddress.toLowerCase()) {
            // ENS mismatch - reverse and forward resolution don't match
            ensName = null;
          }
        }
        
        // Cache the result (even if null) for 30 days
        caches.ens.set(ensCacheKey, ensName, TTL.ENS);
        console.log(`ENS lookup cached for ${publicAddress}: ${ensName || 'none'}`);
      } catch (error) {
        console.log('ENS lookup error:', error.message);
        // Cache null for shorter time on error (1 hour)
        caches.ens.set(ensCacheKey, null, TTL.CONTRACT);
      }
    } else {
      console.log(`ENS lookup from cache for ${publicAddress}: ${ensName || 'none'}`);
    }

    // Since we're only reading, we don't need a wallet with private key
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const stackContract = new ethers.Contract(STACK_NFT_CONTRACT, stackAbi, provider);
    
    // Get spins with smart caching
    const spinsCacheKey = `spins:${publicAddress.toLowerCase()}`;
    let spins = caches.spins.get(spinsCacheKey);
    let canSpinNow;
    let spinCount;
    
    // Variables for Stack NFT data
    let stackId = null;
    let allMedals = [];
    
    // Check medal cache - we cache the processed MEDAL-SPIN medals, not all 288
    const medalsCacheKey = `medalSpin:${publicAddress.toLowerCase()}`;
    const lastFetchKey = `lastMedalFetch:${publicAddress.toLowerCase()}`;
    let cachedMedalSpinData = caches.spins.get(medalsCacheKey); // Use spins cache for permanent storage
    let lastFetchTimestamp = caches.spins.get(lastFetchKey);
    
    if (spins === null) {
      // Not in cache, batch fetch spins, canSpin, and stackId from blockchain
      const [spinsResult, canSpinResult, stackIdResult] = await batchContractCalls([
        { contract, method: 'getSpins', args: [publicAddress] },
        { contract, method: 'canSpin', args: [publicAddress] },
        { contract: stackContract, method: 'addressToTokenId', args: [publicAddress] }
      ], provider);
      
      spins = spinsResult;
      canSpinNow = canSpinResult;
      stackId = stackIdResult.toString();
      
      // Cache spins permanently - will be invalidated when new spin detected
      caches.spins.set(spinsCacheKey, spins);
      console.log(`Fetched ${spins.length} spins, canSpin (${canSpinNow}), and Stack ID (${stackId}) via multicall`);
    } else {
      // Spins are cached, fetch canSpin and stackId
      const [canSpinResult, stackIdResult] = await batchContractCalls([
        { contract, method: 'canSpin', args: [publicAddress] },
        { contract: stackContract, method: 'addressToTokenId', args: [publicAddress] }
      ], provider);
      
      canSpinNow = canSpinResult;
      stackId = stackIdResult.toString();
      console.log(`Using cached ${spins.length} spins, fetched canSpin and stackId via multicall`);
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
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      });
      lastSpinTime = `${lastSpinDateString}, ${lastSpinTimeString}`;
      
      const now = Date.now();
      const hoursSince = Math.floor((now - lastSpinTimestamp) / (1000 * 60 * 60));
      const minutesSince = Math.floor(((now - lastSpinTimestamp) % (1000 * 60 * 60)) / (1000 * 60));
      timeSinceLastSpin = `${hoursSince}h ${minutesSince}m`;
    }
    
    const nextSpinTime = scheduleState.getNextSpinTimeString(lastSpinTimestamp);
    const nextSpinDate = scheduleState.calculateNextSpinTime(lastSpinTimestamp);
    
    // If they can spin now but we have cached spins, check if we should invalidate
    if (canSpinNow && spins.length > 0) {
      // Check if it's been 24h since last spin
      const hoursSince = (Date.now() - lastSpinTimestamp) / (1000 * 60 * 60);
      if (hoursSince >= 24) {
        // They're eligible for a new spin, clear the spins and medals cache so it refreshes next time
        caches.spins.set(spinsCacheKey, null);
        caches.spins.set(medalsCacheKey, null);
        caches.spins.set(lastFetchKey, null);
        console.log('User eligible for new spin, cleared spins and medals cache for next refresh');
      }
    }
    
    // Calculate time until next spin
    const now = Date.now();
    const msUntil = nextSpinDate.getTime() - now;
    const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
    const timeUntilSpin = msUntil > 0 ? `${hoursUntil}h ${minutesUntil}m` : 'Now';
    
    // Calculate the schedule time (exactly 24 hours from last spin)
    const scheduleTime = nextSpinDate.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Calculate when the notification will actually arrive (next cron interval)
    // Parse the cron interval from vercel.json to keep it in sync
    let cronInterval = 10; // default fallback
    try {
      const vercelConfig = require('../vercel.json');
      const cronSchedule = vercelConfig.crons?.[0]?.schedule || '*/10 * * * *';
      // Extract the interval from patterns like "*/5 * * * *" or "*/30 * * * *"
      const match = cronSchedule.match(/^\*\/(\d+)/);
      if (match) {
        cronInterval = parseInt(match[1]);
      }
    } catch (error) {
      console.log('Could not parse vercel.json, using default interval:', error.message);
    }
    const notificationTime = new Date(nextSpinDate);
    const minutes = notificationTime.getMinutes();
    const nextInterval = Math.ceil(minutes / cronInterval) * cronInterval;
    if (nextInterval === 60) {
      notificationTime.setHours(notificationTime.getHours() + 1);
      notificationTime.setMinutes(0);
    } else {
      notificationTime.setMinutes(nextInterval);
    }
    
    const notificationTimeString = notificationTime.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const notificationDateString = notificationTime.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric'
    });
    
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
      // Can't spin and fetched within last 5 minutes (reduced from 1 hour)
      (!canSpinNow && (currentTime - lastFetchTimestamp) < 300) ||
      // Have all medals up to yesterday and can't spin today
      (!canSpinNow && lastSpinTimestamp && lastFetchTimestamp >= (lastSpinTimestamp + 600))
    );
    
    if (shouldUseCachedMedals) {
      medalSpinMedals = cachedMedalSpinData.medals;
      medalStats = cachedMedalSpinData.stats;
      console.log(`Using fully cached MEDAL-SPIN data (can't spin, data is current): ${medalSpinMedals.length} medals`);
    } else if (stackId !== "0" && stackId) {
      // Fetch medals if we have a valid Stack ID and they're not cached
      try {
        allMedals = await stackContract.getStackMedals(stackId);
        console.log(`Fetched ${allMedals.length} medals for Stack ID ${stackId}, processing MEDAL-SPIN medals...`);
        
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
              
              medalSpinMedals.push({
                tier: tierNumber,
                tierName: tierNames[tierNumber] || `Tier-${tierNumber}`,
                name: metadata.name || metadata.id || 'Medal',
                timestamp: medalTimestamp
              });
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
              console.log(`Found ${newMedals.length} new MEDAL-SPIN medals since last fetch`);
              // Merge new medals with cached ones
              const existingTimestamps = new Set(cachedMedalSpinData.medals.map(m => m.timestamp));
              newMedals.forEach(medal => {
                if (!existingTimestamps.has(medal.timestamp)) {
                  cachedMedalSpinData.medals.push(medal);
                }
              });
              medalSpinMedals = cachedMedalSpinData.medals;
            } else {
              console.log(`No new MEDAL-SPIN medals since last fetch`);
              // Still update our last fetch time since we checked
              medalSpinMedals = cachedMedalSpinData.medals;
            }
          }
          
          // Calculate medal statistics
          if (medalSpinMedals.length > 0) {
            // Sort medals by tier for proper assignment
            medalSpinMedals.sort((a, b) => a.tier - b.tier);
            
            medalStats = {
              total: medalSpinMedals.length,
              bronze: medalSpinMedals.filter(m => m.tier === 1).length,
              silver: medalSpinMedals.filter(m => m.tier === 2).length,
              gold: medalSpinMedals.filter(m => m.tier === 3).length,
              black: medalSpinMedals.filter(m => m.tier === 4).length
            };
            
            // Cache the processed MEDAL-SPIN data (just 4 medals instead of 288!)
            const cacheData = { medals: medalSpinMedals, stats: medalStats };
            caches.spins.set(medalsCacheKey, cacheData);
            // Store the timestamp of this fetch
            caches.spins.set(lastFetchKey, currentTime);
            console.log(`Cached ${medalSpinMedals.length} MEDAL-SPIN medals with fetch timestamp ${currentTime}`);
          }
        } catch (error) {
          // If medal processing fails, just continue without medals
          console.log('Could not process medals:', error.message);
        }
      } catch (error) {
        console.log('Error fetching medals:', error.message);
      }
    }
    
    // Format spin history with timestamps, gaps, and medals
    const spinHistory = spins.map((spin, index) => {
      const timestamp = Number(spin.timestamp) * 1000; // Convert to milliseconds
      let gap = null;
      
      // Calculate gap from previous spin
      if (index > 0) {
        const prevTimestamp = Number(spins[index - 1].timestamp) * 1000;
        const gapMs = timestamp - prevTimestamp;
        const hours = Math.floor(gapMs / (1000 * 60 * 60));
        const minutes = Math.floor((gapMs % (1000 * 60 * 60)) / (1000 * 60));
        gap = `+${hours}h${minutes}m`;
      }
      
      // Match medals to spins by timestamp
      // Medals are typically awarded within 10 minutes after a spin
      let medal = null;
      
      if (medalSpinMedals && medalSpinMedals.length > 0) {
        const spinTimestamp = Number(spin.timestamp);
        
        // Find a medal that was awarded shortly after this spin
        const matchingMedal = medalSpinMedals.find(m => {
          const timeDiff = m.timestamp - spinTimestamp;
          // Medal should be awarded within 30 minutes (1800 seconds) after spin
          return timeDiff >= 0 && timeDiff <= 1800;
        });
        
        if (matchingMedal) {
          medal = {
            tier: matchingMedal.tierName,
            name: matchingMedal.name
          };
        }
      }
      
      return {
        spinNumber: index + 1,
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
        medal: medal
      };
    });
    
    // Get the date portion for the description
    const nextSpinDateFormatted = nextSpinDate.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Check if notifications are enabled and format phone number
    let notificationStatus = null;
    if (process.env.NOTIFICATION_NUMBER && process.env.LOOPMESSAGE_AUTH_KEY && process.env.LOOPMESSAGE_SECRET_KEY) {
      const phone = process.env.NOTIFICATION_NUMBER;
      // Extract country code (first 2-3 chars after +) and last 2 digits
      const countryCode = phone.substring(0, 2); // +1 for US
      const lastTwo = phone.slice(-2);
      const middleLength = phone.length - countryCode.length - 2;
      const censored = countryCode + '*'.repeat(middleLength) + lastTwo;
      notificationStatus = `iMessage will be sent to ${censored}`;
    }
    
    // Calculate intelligent polling interval based on time until next spin
    let suggestedPollInterval;
    if (canSpinNow) {
      suggestedPollInterval = 10000; // 10 seconds when spin is available
    } else if (timeUntilSpin <= 60) {
      suggestedPollInterval = 10000; // 10 seconds when spin is within 1 minute
    } else if (timeUntilSpin <= 300) {
      suggestedPollInterval = 30000; // 30 seconds when spin is within 5 minutes
    } else if (timeUntilSpin <= 3600) {
      suggestedPollInterval = 60000; // 1 minute when spin is within 1 hour
    } else {
      suggestedPollInterval = 300000; // 5 minutes when spin is over 1 hour away
    }
    
    res.status(200).json({
      currentSpinCount: spinCount,
      lastSpinTime: lastSpinTime,
      lastSpinTimestamp: lastSpinTimestamp,
      timeSinceLastSpin: timeSinceLastSpin,
      nextSpinTime: nextSpinTime,
      nextSpinTimestamp: nextSpinDate.getTime(),
      nextSpinSchedule: scheduleTime + ' ET',
      canSpinNow: canSpinNow,
      timeUntilSpin: timeUntilSpin,
      walletAddress: publicAddress,
      ensName: ensName,
      description: `Spin #${spinCount + 1} notification will be sent on ${notificationDateString} at ${notificationTimeString} ET`,
      notificationTime: `${notificationTimeString} ET`,
      notificationDate: notificationDateString,
      notificationStatus: notificationStatus,
      useMetaMaskDeepLink: process.env.USE_METAMASK_MOBILE_DEEPLINK === 'true',
      spinHistory: spinHistory,
      medalStats: medalStats,
      suggestedPollInterval: suggestedPollInterval
    });
    
  } catch (error) {
    console.error("Error fetching schedule info:", error);
    res.status(500).json({ error: error.message });
  }
};