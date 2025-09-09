// API endpoint to check the current schedule status without triggering a spin
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");

const abi = [
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"canSpin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

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

    // Try to resolve ENS name
    let ensName = null;
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
    } catch (error) {
      console.log('ENS lookup error:', error.message);
    }

    // Since we're only reading, we don't need a wallet with private key
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    const spins = await contract.getSpins(publicAddress);
    const spinCount = spins.length;
    
    let lastSpinTime = null;
    let lastSpinTimestamp = null;
    let timeSinceLastSpin = null;
    
    if (spins.length > 0) {
      const lastSpinTs = spins[spins.length - 1].timestamp;
      lastSpinTimestamp = Number(lastSpinTs) * 1000; // Convert to milliseconds
      lastSpinTime = new Date(lastSpinTimestamp).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium'
      });
      
      const now = Date.now();
      const hoursSince = Math.floor((now - lastSpinTimestamp) / (1000 * 60 * 60));
      const minutesSince = Math.floor(((now - lastSpinTimestamp) % (1000 * 60 * 60)) / (1000 * 60));
      timeSinceLastSpin = `${hoursSince}h ${minutesSince}m`;
    }
    
    const nextSpinTime = scheduleState.getNextSpinTimeString(lastSpinTimestamp);
    const nextSpinDate = scheduleState.calculateNextSpinTime(lastSpinTimestamp);
    
    // Get the actual blockchain answer about whether we can spin
    const canSpinNow = await contract.canSpin(publicAddress);
    
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
    
    // Format spin history with timestamps (no hash since it's not useful)
    const spinHistory = spins.map((spin, index) => ({
      spinNumber: index + 1,
      timestamp: Number(spin.timestamp) * 1000, // Convert to milliseconds
      date: new Date(Number(spin.timestamp) * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium'
      })
    }));
    
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
      notificationStatus = `iMessage notification is enabled, will be sent to ${censored}`;
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
      description: `Spin #${spinCount + 1} notification will be sent after automated server check at ${notificationTimeString} ET (checks every ${cronInterval} min)`,
      notificationStatus: notificationStatus,
      useMetaMaskDeepLink: process.env.USE_METAMASK_MOBILE_DEEPLINK === 'true',
      spinHistory: spinHistory
    });
    
  } catch (error) {
    console.error("Error fetching schedule info:", error);
    res.status(500).json({ error: error.message });
  }
};