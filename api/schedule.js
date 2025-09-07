// API endpoint to check the current schedule status without triggering a spin
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");

const abi = [{"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}];

const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

const provider = new JsonRpcProvider("https://shape-mainnet.g.alchemy.com/public", {
    name: 'shape-mainnet',
    chainId: 360
});

module.exports = async (req, res) => {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ error: "PRIVATE_KEY not configured" });
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    const spins = await contract.getSpins(wallet.address);
    const spinCount = spins.length;
    
    let lastSpinTime = null;
    let timeSinceLastSpin = null;
    
    if (spins.length > 0) {
      const lastSpinTimestamp = spins[spins.length - 1].timestamp;
      lastSpinTime = new Date(Number(lastSpinTimestamp) * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium'
      });
      
      const now = Date.now();
      const lastSpinMs = Number(lastSpinTimestamp) * 1000;
      const hoursSince = Math.floor((now - lastSpinMs) / (1000 * 60 * 60));
      const minutesSince = Math.floor(((now - lastSpinMs) % (1000 * 60 * 60)) / (1000 * 60));
      timeSinceLastSpin = `${hoursSince}h ${minutesSince}m`;
    }
    
    const nextSpinTime = scheduleState.getNextSpinTimeString(spinCount);
    const canSpinNow = spins.length === 0 || scheduleState.shouldSpinNow(
      spins.length > 0 ? Number(spins[spins.length - 1].timestamp) * 1000 : null, 
      spinCount
    );
    
    // Calculate the schedule pattern
    const baseTime = new Date();
    baseTime.setUTCHours(21, 0, 0, 0); // 4 PM ET
    const incrementMinutes = spinCount * 1;
    const scheduleTime = `4:${String(incrementMinutes % 60).padStart(2, '0')} PM ET`;
    
    res.status(200).json({
      currentSpinCount: spinCount,
      lastSpinTime: lastSpinTime,
      timeSinceLastSpin: timeSinceLastSpin,
      nextSpinTime: nextSpinTime,
      nextSpinSchedule: scheduleTime,
      canSpinNow: canSpinNow,
      walletAddress: wallet.address,
      description: `Spin #${spinCount + 1} will occur at ${scheduleTime} (incrementing by 1 minute daily)`
    });
    
  } catch (error) {
    console.error("Error fetching schedule info:", error);
    res.status(500).json({ error: error.message });
  }
};