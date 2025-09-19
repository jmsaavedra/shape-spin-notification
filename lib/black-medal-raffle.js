// Black Medal Raffle contract interaction functions
const { ethers } = require("ethers");
const { batchContractCalls } = require("./multicall");

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
 * Calculate consecutive spin streak from spin history (rolling streak)
 * @param {Array} spins - Array of spin objects with timestamp
 * @returns {number} Current consecutive streak length in days
 */
function calculateConsecutiveStreak(spins) {
  if (!spins || spins.length === 0) return 0;

  // Convert spins to dates (day precision)
  const spinDates = spins.map(spin => {
    const spinTimestamp = Number(spin.timestamp) * 1000;
    const spinDate = new Date(spinTimestamp);
    spinDate.setHours(0, 0, 0, 0);
    return spinDate.getTime();
  });

  // Get unique spin dates and sort them (most recent first)
  const uniqueDates = [...new Set(spinDates)].sort((a, b) => b - a);

  if (uniqueDates.length === 0) return 0;

  // Find the longest consecutive streak
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const currentDay = uniqueDates[i - 1];
    const previousDay = uniqueDates[i];
    const dayDiff = Math.floor((currentDay - previousDay) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      // Consecutive day
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      // Gap found, start new streak
      currentStreak = 1;
    }
  }

  return maxStreak;
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
 * Get raffle history for recent rounds
 * @param {ethers.Provider} provider - Ethereum provider
 * @param {number} roundCount - Number of recent rounds to fetch (default: 5)
 * @returns {Array} Array of round winners
 */
async function getRaffleHistory(provider, roundCount = 5) {
  try {
    const raffleContract = new ethers.Contract(BLACK_MEDAL_RAFFLE_ADDRESS, BLACK_MEDAL_RAFFLE_ABI, provider);

    // Get current round
    const currentRound = await raffleContract.getCurrentRaffleRound();
    const currentRoundNum = Number(currentRound);

    if (currentRoundNum === 0) {
      return [];
    }

    // Fetch winners for recent rounds
    const rounds = [];
    for (let i = Math.max(1, currentRoundNum - roundCount + 1); i < currentRoundNum; i++) {
      rounds.push(i);
    }

    if (rounds.length === 0) {
      return [];
    }

    // Batch call to get winners
    const calls = rounds.map(round => ({
      contract: raffleContract,
      method: 'getWinnerForRound',
      args: [round]
    }));

    const winners = await batchContractCalls(calls, provider);

    return rounds.map((round, index) => ({
      round,
      winner: winners[index],
      hasWinner: winners[index] !== "0x0000000000000000000000000000000000000000"
    })).filter(r => r.hasWinner);

  } catch (error) {
    console.error("Error fetching raffle history:", error);
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