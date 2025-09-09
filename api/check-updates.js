// Lightweight endpoint to check if data has changed without heavy processing
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const { caches } = require("../lib/cache");

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
  try {
    const publicAddress = process.env.PUBLIC_ADDRESS;
    if (!publicAddress) {
      return res.status(500).json({ error: "PUBLIC_ADDRESS not configured" });
    }

    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Quick checks - minimize API calls
    const [canSpinNow, spins] = await Promise.all([
      contract.canSpin(publicAddress),
      contract.getSpins(publicAddress)
    ]);
    
    const spinCount = spins.length;
    let lastSpinTimestamp = null;
    
    if (spins.length > 0) {
      lastSpinTimestamp = Number(spins[spins.length - 1].timestamp) * 1000;
    }
    
    // Calculate suggested poll interval based on state
    let suggestedPollInterval = 120000; // Default 2 minutes
    
    if (canSpinNow) {
      // Can spin now - poll frequently to show availability
      suggestedPollInterval = 30000; // 30 seconds
    } else if (lastSpinTimestamp) {
      // Calculate time until next spin
      const now = Date.now();
      const timeSinceLastSpin = now - lastSpinTimestamp;
      const timeUntilNextSpin = (24 * 60 * 60 * 1000) - timeSinceLastSpin;
      
      if (timeUntilNextSpin < 0) {
        // Should be able to spin but contract says no - check frequently
        suggestedPollInterval = 30000; // 30 seconds
      } else if (timeUntilNextSpin < 5 * 60 * 1000) {
        // Less than 5 minutes until spin - poll every 20 seconds
        suggestedPollInterval = 20000;
      } else if (timeUntilNextSpin < 30 * 60 * 1000) {
        // Less than 30 minutes - poll every minute
        suggestedPollInterval = 60000;
      } else if (timeUntilNextSpin < 2 * 60 * 60 * 1000) {
        // Less than 2 hours - poll every 2 minutes
        suggestedPollInterval = 120000;
      } else {
        // More than 2 hours away - poll every 5 minutes
        suggestedPollInterval = 300000;
      }
    }
    
    // Update cache with fresh spin data
    const spinsCacheKey = `spins:${publicAddress.toLowerCase()}`;
    const cachedSpins = caches.spins.get(spinsCacheKey);
    
    // Check if data has changed
    const hasNewSpin = cachedSpins && spins.length > cachedSpins.length;
    const statusChanged = cachedSpins && (canSpinNow !== (cachedSpins.length < spins.length));
    
    if (hasNewSpin || !cachedSpins) {
      caches.spins.set(spinsCacheKey, spins);
    }
    
    res.status(200).json({
      spinCount,
      canSpinNow,
      lastSpinTimestamp,
      hasUpdates: hasNewSpin || statusChanged,
      suggestedPollInterval,
      message: canSpinNow ? "Spin available!" : "Waiting for next spin"
    });
    
  } catch (error) {
    console.error("Error checking updates:", error);
    res.status(500).json({ 
      error: error.message,
      suggestedPollInterval: 120000 // Default to 2 minutes on error
    });
  }
};