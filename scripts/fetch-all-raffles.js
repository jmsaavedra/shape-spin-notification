#!/usr/bin/env node

// Script to fetch and display ALL raffle history from the Black Medal Raffle contract
require("dotenv").config();
const { ethers } = require("ethers");
const { getCachedEnsName, cacheEnsName } = require("../utils/supabase");

// Contract details
const BLACK_MEDAL_RAFFLE_ADDRESS = "0xEFe03c16c2f08B622D0d9A01cC8169da33CfeEDe";

// Complete ABI for Black Medal Raffle Contract
const BLACK_MEDAL_RAFFLE_ABI = [
  {"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"address","name":"_callerAddress","type":"address"},{"internalType":"address","name":"_medalSpin","type":"address"},{"internalType":"address","name":"_shapeStack","type":"address"},{"internalType":"uint256","name":"minimumStreakLength","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[],"name":"AlreadyParticipant","type":"error"},
  {"inputs":[],"name":"IncorrectCaller","type":"error"},
  {"inputs":[],"name":"InvalidMinimumStreakLength","type":"error"},
  {"inputs":[],"name":"InvalidTimestamps","type":"error"},
  {"inputs":[],"name":"NoParticipants","type":"error"},
  {"inputs":[],"name":"NoRecentStreak","type":"error"},
  {"inputs":[],"name":"NoStreak","type":"error"},
  {"inputs":[],"name":"NotAParticipant","type":"error"},
  {"inputs":[],"name":"NotEnoughSpins","type":"error"},
  {"inputs":[],"name":"NotMedalOwner","type":"error"},
  {"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},
  {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},
  {"inputs":[],"name":"RaffleFrozen","type":"error"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"caller","type":"address"}],"name":"CallerSet","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"bool","name":"frozen","type":"bool"}],"name":"FrozenSet","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"medalSpin","type":"address"}],"name":"MedalSpinSet","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"minimumStreakLength","type":"uint256"}],"name":"MinimumStreakLengthSet","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"participant","type":"address"},{"indexed":false,"internalType":"uint256","name":"round","type":"uint256"}],"name":"NewParticipant","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"operator","type":"address"}],"name":"OperatorSet","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferStarted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"participant","type":"address"},{"indexed":false,"internalType":"uint256","name":"round","type":"uint256"}],"name":"ParticipantRemoved","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"winner","type":"address"},{"indexed":false,"internalType":"uint256","name":"round","type":"uint256"}],"name":"RaffleDrawCompleted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"length","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"round","type":"uint256"}],"name":"RaffleDrawInitiated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"round","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"}],"name":"RequestedRandomness","type":"event"},
  {"inputs":[],"name":"acceptOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"participant","type":"address"}],"name":"addParticipant","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"callerAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"drawCurrentRaffle","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"enterRaffle","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"randomness","type":"uint256"},{"internalType":"bytes","name":"dataWithRound","type":"bytes"}],"name":"fulfillRandomness","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"getCurrentRaffleList","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getCurrentRaffleRound","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getMinimumStreakLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"round","type":"uint256"}],"name":"getWinnerForRound","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"isFrozen","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"participant","type":"address"}],"name":"isParticipantInCurrentRaffle","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"medalSpin","outputs":[{"internalType":"contract IMedalSpin","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"operatorAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"participant","type":"address"},{"internalType":"uint256","name":"round","type":"uint256"}],"name":"participantedInRound","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"pendingOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"participant","type":"address"}],"name":"removeParticipant","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"requestPending","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"requestedHash","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"caller","type":"address"}],"name":"setCaller","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"bool","name":"frozen","type":"bool"}],"name":"setFrozen","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"_medalSpin","type":"address"}],"name":"setMedalSpin","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"minimumStreakLength","type":"uint256"}],"name":"setMinimumStreakLength","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"operator","type":"address"}],"name":"setOperator","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"shapeStack","outputs":[{"internalType":"contract IShapeStackV2","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

// Initialize providers
const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
const shapeProvider = new ethers.JsonRpcProvider(`https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`, {
  name: 'shape-mainnet',
  chainId: 360
});

const mainnetProvider = new ethers.JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`);

/**
 * Resolve ENS name for an address with caching
 */
async function resolveEnsName(address) {
  try {
    // Check Supabase cache first
    let ensName = await getCachedEnsName(address);

    if (ensName === null) {
      // Not in cache, fetch from blockchain
      await mainnetProvider.getNetwork();
      ensName = await mainnetProvider.lookupAddress(address);

      // Verify reverse resolution
      if (ensName) {
        const resolvedAddress = await mainnetProvider.resolveName(ensName);
        if (resolvedAddress?.toLowerCase() !== address.toLowerCase()) {
          ensName = null;
        }
      }

      // Cache result for 30 days
      await cacheEnsName(address, ensName, 2592000);
    }

    return ensName;
  } catch (error) {
    console.error(`Error resolving ENS for ${address}:`, error.message);
    return null;
  }
}

/**
 * Format address display with ENS name if available
 */
function formatAddress(address, ensName) {
  if (ensName) {
    return `${ensName} (${address.slice(0, 6)}...${address.slice(-4)})`;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Fetch all raffle data from the contract
 */
async function fetchAllRaffles() {
  try {
    console.log("🎲 Fetching all Black Medal Raffle data...\n");
    console.log(`📍 Contract: ${BLACK_MEDAL_RAFFLE_ADDRESS}`);
    console.log(`🌐 Network: Shape Mainnet (Chain ID: 360)\n`);

    const contract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, BLACK_MEDAL_RAFFLE_ABI, shapeProvider);

    // Get current round and contract status
    const [currentRound, currentParticipants, minimumStreak, isFrozen] = await Promise.all([
      contract.getCurrentRaffleRound(),
      contract.getCurrentRaffleList(),
      contract.getMinimumStreakLength(),
      contract.isFrozen()
    ]);

    const currentRoundNum = Number(currentRound);
    const participantCount = currentParticipants.length;
    const minStreak = Number(minimumStreak);

    console.log("📊 Contract Status:");
    console.log(`   Current Round: #${currentRoundNum}`);
    console.log(`   Current Participants: ${participantCount}`);
    console.log(`   Minimum Streak Required: ${minStreak} days`);
    console.log(`   Contract Frozen: ${isFrozen ? 'Yes' : 'No'}`);
    console.log("");

    if (currentRoundNum === 0) {
      console.log("ℹ️  No raffles have been executed yet.");
      return;
    }

    // Fetch all completed raffle rounds
    console.log("🏆 Completed Raffles:");
    console.log("=".repeat(80));

    const completedRounds = [];
    for (let round = 1; round < currentRoundNum; round++) {
      completedRounds.push(round);
    }

    if (completedRounds.length === 0) {
      console.log("ℹ️  No completed raffles yet. Current raffle is still in progress.");
      return;
    }

    // Batch fetch winners for all completed rounds
    const winnerPromises = completedRounds.map(round =>
      contract.getWinnerForRound(round).catch(() => "0x0000000000000000000000000000000000000000")
    );

    const winners = await Promise.all(winnerPromises);

    // Process and display results
    const raffleData = [];

    for (let i = 0; i < completedRounds.length; i++) {
      const round = completedRounds[i];
      const winner = winners[i];

      if (winner !== "0x0000000000000000000000000000000000000000") {
        raffleData.push({
          round,
          winner
        });
      }
    }

    console.log(`Found ${raffleData.length} completed raffles\n`);

    // Resolve ENS names for all winner addresses
    const allAddresses = new Set();
    raffleData.forEach(raffle => {
      allAddresses.add(raffle.winner);
    });

    console.log(`🔍 Resolving ENS names for ${allAddresses.size} unique addresses...`);
    const ensCache = new Map();

    for (const address of allAddresses) {
      const ensName = await resolveEnsName(address);
      ensCache.set(address, ensName);
      if (ensName) {
        console.log(`   ✅ ${address} → ${ensName}`);
      }
    }
    console.log("");

    // Display all raffles
    for (const raffle of raffleData) {
      const winnerEns = ensCache.get(raffle.winner);

      console.log(`🎯 Round #${raffle.round}`);
      console.log(`   Winner: ${formatAddress(raffle.winner, winnerEns)}`);
      console.log(`   Note: Historical participant data not available from contract`);
      console.log("");
    }

    // Summary statistics
    console.log("📈 Summary Statistics:");
    console.log("=".repeat(40));
    console.log(`Total Completed Raffles: ${raffleData.length}`);
    console.log(`Total Unique Winners: ${new Set(raffleData.map(r => r.winner)).size}`);
    console.log(`Total Winner Addresses: ${allAddresses.size}`);

    // Find multiple winners
    const winnerCounts = new Map();
    raffleData.forEach(raffle => {
      const count = winnerCounts.get(raffle.winner) || 0;
      winnerCounts.set(raffle.winner, count + 1);
    });

    const multipleWinners = Array.from(winnerCounts.entries()).filter(([, count]) => count > 1);
    if (multipleWinners.length > 0) {
      console.log(`\n🏅 Multiple Winners:`);
      multipleWinners.forEach(([address, count]) => {
        const ensName = ensCache.get(address);
        console.log(`   ${formatAddress(address, ensName)}: ${count} wins`);
      });
    }

  } catch (error) {
    console.error("❌ Error fetching raffle data:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  fetchAllRaffles().then(() => {
    console.log("\n✅ Script completed successfully!");
    process.exit(0);
  }).catch(error => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
}

module.exports = { fetchAllRaffles, resolveEnsName, formatAddress };