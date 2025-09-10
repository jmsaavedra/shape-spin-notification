// API endpoint to get spin history with medal data
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const { batchContractCalls } = require("../lib/multicall");

const STACK_NFT_CONTRACT = "0x76d6aC90A62Ca547d51D7AcAeD014167F81B9931";
const SPIN_CONTRACT = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

// Minimal ABIs
const stackAbi = [
  {"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"addressToTokenId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"stackId","type":"uint256"}],"name":"getStackMedals","outputs":[{"components":[{"internalType":"address","name":"stackOwner","type":"address"},{"internalType":"uint256","name":"stackId","type":"uint256"},{"internalType":"bytes32","name":"medalUID","type":"bytes32"},{"internalType":"uint16","name":"medalTier","type":"uint16"},{"internalType":"bytes","name":"medalData","type":"bytes"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct ShapeMedalSchema[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"stackId","type":"uint256"},{"internalType":"uint16[]","name":"medalTiers","type":"uint16[]"}],"name":"getMedalCounts","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"}
];

const spinAbi = [
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

module.exports = async (req, res) => {
  try {
    const publicAddress = process.env.PUBLIC_ADDRESS;
    if (!publicAddress) {
      return res.status(500).json({ error: "PUBLIC_ADDRESS not configured" });
    }

    const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
    const rpcUrl = `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;
    
    const provider = new JsonRpcProvider(rpcUrl, {
      name: 'shape-mainnet',
      chainId: 360
    });

    const stackContract = new ethers.Contract(STACK_NFT_CONTRACT, stackAbi, provider);
    const spinContract = new ethers.Contract(SPIN_CONTRACT, spinAbi, provider);

    // Get Stack ID for the address
    const stackIdBigInt = await stackContract.addressToTokenId(publicAddress);
    const stackId = stackIdBigInt.toString();
    
    if (stackId === "0") {
      return res.status(200).json({
        hasStack: false,
        message: "No STACK NFT found for this address",
        spins: [],
        medals: null
      });
    }

    // Batch fetch spins and medal counts
    const [spins, medalCounts] = await batchContractCalls([
      { contract: spinContract, method: 'getSpins', args: [publicAddress] },
      { contract: stackContract, method: 'getMedalCounts', args: [stackId, [1, 2, 3, 4]] }
    ], provider);

    // Also get detailed medal data for MEDAL-SPIN medals
    const allMedals = await stackContract.getStackMedals(stackId);
    
    // Filter MEDAL-SPIN medals
    const medalSpinMedals = [];
    const tierNames = ['Unknown', 'Bronze', 'Silver', 'Gold', 'Black/Obsidian'];
    
    allMedals.forEach(medal => {
      try {
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
          medalSpinMedals.push({
            uid: medal.medalUID,
            tier: medal.medalTier,
            tierName: tierNames[medal.medalTier] || `Tier-${medal.medalTier}`,
            name: metadata.name || metadata.id || 'Medal',
            description: metadata.description || ''
          });
        }
      } catch (error) {}
    });

    // Process spin history
    const spinHistory = spins.map((spin, index) => {
      const timestamp = Number(spin.timestamp) * 1000;
      return {
        spinNumber: index + 1,
        hash: spin.hash,
        timestamp: timestamp,
        date: new Date(timestamp).toLocaleString('en-US', {
          timeZone: 'America/New_York',
          dateStyle: 'short',
          timeStyle: 'medium'
        })
      };
    });

    // Since we can't match by timestamp, we'll show medals separately
    // but indicate which spins likely resulted in medals
    const medalBreakdown = {
      bronze: medalSpinMedals.filter(m => m.tier === 1).length,
      silver: medalSpinMedals.filter(m => m.tier === 2).length,
      gold: medalSpinMedals.filter(m => m.tier === 3).length,
      black: medalSpinMedals.filter(m => m.tier === 4).length,
      total: medalSpinMedals.length
    };

    // Calculate win rate
    const winRate = spins.length > 0 ? ((medalBreakdown.total / spins.length) * 100).toFixed(1) : 0;

    // Overall Stack medal counts (all projects)
    const overallMedals = {
      bronze: Number(medalCounts[0]),  // Tier 1
      silver: Number(medalCounts[1]),  // Tier 2
      gold: Number(medalCounts[2]),    // Tier 3
      black: Number(medalCounts[3]),   // Tier 4
      total: Number(medalCounts[0]) + Number(medalCounts[1]) + Number(medalCounts[2]) + Number(medalCounts[3])
    };

    res.status(200).json({
      hasStack: true,
      stackId: stackId,
      walletAddress: publicAddress,
      spinStats: {
        totalSpins: spins.length,
        medalsWon: medalBreakdown.total,
        winRate: parseFloat(winRate),
        noMedalSpins: spins.length - medalBreakdown.total
      },
      medalBreakdown: medalBreakdown,
      spinHistory: spinHistory,
      medalSpinMedals: medalSpinMedals,
      overallStackMedals: overallMedals,
      note: "Medal timestamps are not available, so we cannot match specific medals to specific spins. The medals shown are all MEDAL-SPIN project medals earned."
    });
    
  } catch (error) {
    console.error("Error fetching spin medals:", error);
    res.status(500).json({ error: error.message });
  }
};