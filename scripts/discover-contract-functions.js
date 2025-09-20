#!/usr/bin/env node

// Script to discover available functions on the Black Medal Raffle contract
require("dotenv").config();
const { ethers } = require("ethers");

const BLACK_MEDAL_RAFFLE_ADDRESS = "0xEFe03c16c2f08B622D0d9A01cC8169da33CfeEDe";

// Known function signatures to test
const FUNCTION_SIGNATURES = [
  "getCurrentRaffleRound()",
  "getWinnerForRound(uint256)",
  "getCurrentRaffleList()",
  "getRaffleParticipants(uint256)",
  "getParticipantsForRound(uint256)",
  "getRoundParticipants(uint256)",
  "isParticipantInCurrentRaffle(address)",
  "participantedInRound(address,uint256)",
  "getMinimumStreakLength()",
  "isFrozen()",
  "owner()",
  "totalRounds()",
  "roundDetails(uint256)",
  "getRoundInfo(uint256)",
  "getCompletedRounds()",
  "getAllWinners()",
];

async function discoverContractFunctions() {
  try {
    const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
    const provider = new ethers.JsonRpcProvider(`https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`, {
      name: 'shape-mainnet',
      chainId: 360
    });

    console.log("🔍 Discovering Black Medal Raffle Contract Functions");
    console.log(`📍 Contract: ${BLACK_MEDAL_RAFFLE_ADDRESS}`);
    console.log(`🌐 Network: Shape Mainnet\n`);

    console.log("Testing known function signatures...\n");

    for (const signature of FUNCTION_SIGNATURES) {
      try {
        // Create a minimal interface just for this function
        const functionName = signature.split('(')[0];
        const iface = new ethers.Interface([`function ${signature}`]);
        const contract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, iface, provider);

        // Try to call the function
        let result;
        if (signature.includes('uint256') && !signature.includes(',')) {
          // Test with round 1 for single uint256 parameter functions
          result = await contract[functionName](1);
        } else if (signature.includes('address') && signature.includes('uint256')) {
          // Skip functions requiring both address and uint256 for now
          console.log(`⏭️  ${signature} - Skipping (requires parameters)`);
          continue;
        } else if (signature.includes('address')) {
          // Skip functions requiring address parameter
          console.log(`⏭️  ${signature} - Skipping (requires address parameter)`);
          continue;
        } else {
          // No parameters
          result = await contract[functionName]();
        }

        console.log(`✅ ${signature}`);
        console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
        console.log("");

      } catch (error) {
        if (error.message.includes('function selector was not recognized')) {
          console.log(`❌ ${signature} - Function not found`);
        } else if (error.message.includes('execution reverted')) {
          console.log(`⚠️  ${signature} - Function exists but reverted`);
        } else {
          console.log(`❓ ${signature} - Error: ${error.message.split('\n')[0]}`);
        }
      }
    }

    console.log("\n🎯 Testing specific round data...");

    // Test getting current round first
    try {
      const iface = new ethers.Interface([`function getCurrentRaffleRound()`]);
      const contract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, iface, provider);
      const currentRound = await contract.getCurrentRaffleRound();
      console.log(`Current Round: ${currentRound}`);

      // Test getting winner for round 1 if we have completed rounds
      if (Number(currentRound) > 1) {
        try {
          const winnerIface = new ethers.Interface([`function getWinnerForRound(uint256)`]);
          const winnerContract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, winnerIface, provider);
          const winner = await winnerContract.getWinnerForRound(1);
          console.log(`Round 1 Winner: ${winner}`);
        } catch (error) {
          console.log(`Error getting Round 1 winner: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`Error getting current round: ${error.message}`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run the script
if (require.main === module) {
  discoverContractFunctions().then(() => {
    console.log("\n✅ Discovery completed!");
  }).catch(error => {
    console.error("❌ Discovery failed:", error);
  });
}