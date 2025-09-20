// Cron endpoint that checks if spin is available and sends LoopMessage notification
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");
const LoopMessageNotifier = require("../lib/loopmessage-notify");
const { caches, TTL } = require("../lib/cache");
const { batchContractCalls } = require("../lib/multicall");

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

// Track if we've already notified for the current spin
let lastNotifiedSpinCount = null;

module.exports = async (req, res) => {
  try {
    // Check required environment variables
    const publicAddress = process.env.PUBLIC_ADDRESS;
    const loopAuthKey = process.env.LOOPMESSAGE_AUTH_KEY;
    const loopSecretKey = process.env.LOOPMESSAGE_SECRET_KEY;
    const notificationNumber = process.env.NOTIFICATION_NUMBER;
    const senderName = process.env.LOOPMESSAGE_SENDER_NAME || 'Spin Shape';
    
    if (!publicAddress) {
      throw new Error("PUBLIC_ADDRESS environment variable is not set");
    }
    
    // Only send notifications if LoopMessage is configured
    const notificationsEnabled = loopAuthKey && loopSecretKey && notificationNumber;
    
    if (!notificationsEnabled) {
      console.log("LoopMessage notifications not configured. Set LOOPMESSAGE_AUTH_KEY, LOOPMESSAGE_SECRET_KEY, and NOTIFICATION_NUMBER to enable.");
    }

    // Since we're only reading, we don't need a wallet with private key
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Get current spin count with caching
    const spinsCacheKey = `spins:${publicAddress.toLowerCase()}`;
    let cachedSpins = caches.spins.get(spinsCacheKey);
    
    // For cron, batch fetch both spins and canSpin fresh every time
    // This is our notification trigger so we need accurate real-time data
    const [freshSpins, canSpinNow] = await batchContractCalls([
      { contract, method: 'getSpins', args: [publicAddress] },
      { contract, method: 'canSpin', args: [publicAddress] }
    ], provider);
    
    // If we have cached spins and the count changed, user completed a spin
    if (cachedSpins && freshSpins.length > cachedSpins.length) {
    }
    
    // Update cache with fresh data
    const spins = freshSpins;
    caches.spins.set(spinsCacheKey, spins);
    
    let spinCount = spins.length;

    // Special case: Adjust count for cheater spin for homepage wallet
    // This wallet had a contract spin that nullified a medal, so we adjust the count
    if (publicAddress.toLowerCase() === '0x56bde1e5efc80b1e2b958f2d311f4176945ae77f') {
      // Check if we have the cheater spin (spin #4 at timestamp 1757361651)
      const hasCheaterSpin = spins.some(spin => Number(spin.timestamp) === 1757361651);
      if (hasCheaterSpin) {
        spinCount = spins.length - 1; // Subtract 1 to account for the cheater spin
      }
    }

    
    let lastSpinTimestamp = null;
    if (spins.length > 0) {
      const lastSpinTs = spins[spins.length - 1].timestamp;
      lastSpinTimestamp = Number(lastSpinTs) * 1000; // Convert to milliseconds
    }
    
    
    // Check current spin status and send appropriate notification
    if (notificationsEnabled) {
      // Initialize on first run
      if (lastNotifiedSpinCount === null) {
        lastNotifiedSpinCount = spinCount - 1; // Assume we've notified for all previous spins
      }
      
      // If can spin now and haven't notified for this spin number
      if (canSpinNow && spinCount >= lastNotifiedSpinCount + 1) {
        console.log(`New spin available! Sending LoopMessage notification for spin #${spinCount + 1}`);
        
        const notifier = new LoopMessageNotifier(loopAuthKey, loopSecretKey, notificationNumber, senderName);
        const nextSpinTime = scheduleState.getNextSpinTimeString(lastSpinTimestamp);
        const dashboardUrl = 'https://spin-shape.vercel.app/api/status';
        
        try {
          await notifier.sendSpinAvailableNotification(
            spinCount + 1,
            nextSpinTime,
            dashboardUrl
          );

          console.log(`✅ Notification sent for spin #${spinCount + 1}`);
          lastNotifiedSpinCount = spinCount;
          
          return res.status(200).json({
            message: "Spin available - LoopMessage notification sent",
            spinNumber: spinCount + 1,
            notificationSent: true,
            provider: "LoopMessage",
            nextSpinTime: nextSpinTime
          });
        } catch (notifyError) {
          console.error("❌ Failed to send LoopMessage notification:", notifyError);
          return res.status(200).json({
            message: "Spin available - notification failed",
            spinNumber: spinCount + 1,
            notificationSent: false,
            provider: "LoopMessage",
            error: notifyError.message
          });
        }
      }
      // If user has already completed their spin, just update the count without sending notification
      else if (!canSpinNow && spinCount > lastNotifiedSpinCount) {
        console.log(`User already completed spin #${spinCount}. Updating count without notification.`);
        lastNotifiedSpinCount = spinCount; // Update to current spin count
        console.log(`✅ Tracking updated for completed spin #${spinCount}`);
        
        const nextSpinDate = scheduleState.calculateNextSpinTime(lastSpinTimestamp);
        const nextSpinDateFormatted = nextSpinDate.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        return res.status(200).json({
          message: "Already spun - tracking updated",
          spinNumber: spinCount,
          notificationSent: false,
          nextSpinTime: nextSpinDateFormatted
        });
      }
    }
    
    // Calculate when the next spin will be available
    let timeUntilNextCheck = "Not available";
    if (!canSpinNow && spins.length > 0) {
      const nextSpinDate = scheduleState.calculateNextSpinTime(lastSpinTimestamp);
      const msUntil = nextSpinDate.getTime() - Date.now();
      const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
      const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
      timeUntilNextCheck = msUntil > 0 ? `${hoursUntil}h ${minutesUntil}m` : 'Now';
    }
    
    res.status(200).json({
      message: canSpinNow ? "Spin available" : "Spin not yet available",
      canSpin: canSpinNow,
      currentSpinCount: spinCount,
      nextSpinNumber: spinCount + 1,
      timeUntilNextCheck: timeUntilNextCheck,
      notificationsEnabled: notificationsEnabled,
      provider: "LoopMessage"
    });
    
  } catch (error) {
    console.error("❌ Cron job error:", error);
    res.status(500).json({ error: error.message });
  }
};