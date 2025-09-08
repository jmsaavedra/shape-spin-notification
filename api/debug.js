// Debug endpoint to explore all contract read methods
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");

const abi = [
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"canSpin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"}],"name":"getCollector","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

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
    
    // Get all spins for our wallet
    const spins = await contract.getSpins(wallet.address);
    
    // Check if we can spin now (contract's own logic)
    const canSpinNow = await contract.canSpin(wallet.address);
    
    // Process spin data
    const processedSpins = spins.map((spin, index) => ({
      spinNumber: index + 1,
      hash: spin.hash,
      timestamp: Number(spin.timestamp),
      date: new Date(Number(spin.timestamp) * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium'
      })
    }));
    
    // Calculate time gaps between spins
    const gaps = [];
    for (let i = 1; i < processedSpins.length; i++) {
      const gap = processedSpins[i].timestamp - processedSpins[i-1].timestamp;
      const hours = Math.floor(gap / 3600);
      const minutes = Math.floor((gap % 3600) / 60);
      gaps.push({
        between: `Spin ${i} → ${i+1}`,
        seconds: gap,
        formatted: `${hours}h ${minutes}m`
      });
    }
    
    // Sample hash check (if we have spins, check the first one)
    let sampleHashCollector = null;
    if (spins.length > 0) {
      sampleHashCollector = await contract.getCollector(spins[0].hash);
    }
    
    res.status(200).json({
      contractInfo: {
        address: contractAddress,
        network: "Shape Mainnet",
        availableMethods: [
          "canSpin(address) - Check if address can spin",
          "getCollector(bytes32) - Get collector of a hash",
          "getSpins(address) - Get all spins for address",
          "spin(bytes32) - Execute a spin (costs gas)"
        ]
      },
      walletData: {
        address: wallet.address,
        totalSpins: spins.length,
        canSpinNow: canSpinNow,
        canSpinReason: canSpinNow ? "24+ hours have passed" : "Must wait 24 hours between spins"
      },
      spins: processedSpins,
      spinGaps: gaps,
      averageGap: gaps.length > 0 ? 
        `${Math.floor(gaps.reduce((a,b) => a + b.seconds, 0) / gaps.length / 3600)}h average` : 
        "N/A",
      sampleHashCheck: sampleHashCollector ? {
        hash: spins[0].hash,
        collector: sampleHashCollector,
        isOurs: sampleHashCollector.toLowerCase() === wallet.address.toLowerCase()
      } : null
    });
    
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    res.status(500).json({ error: error.message });
  }
};