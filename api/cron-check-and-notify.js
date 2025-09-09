// Cron endpoint that checks if spin is available and sends LoopMessage notification
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");
const LoopMessageNotifier = require("../lib/loopmessage-notify");

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
    
    // Get current spin count and check if we can spin
    const spins = await contract.getSpins(publicAddress);
    const spinCount = spins.length;
    const canSpinNow = await contract.canSpin(publicAddress);
    
    let lastSpinTimestamp = null;
    if (spins.length > 0) {
      const lastSpinTs = spins[spins.length - 1].timestamp;
      lastSpinTimestamp = Number(lastSpinTs) * 1000; // Convert to milliseconds
    }
    
    console.log(`Current spin count: ${spinCount}, Can spin: ${canSpinNow}`);
    
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
          
          lastNotifiedSpinCount = spinCount;
          
          return res.status(200).json({
            message: "Spin available - LoopMessage notification sent",
            spinNumber: spinCount + 1,
            notificationSent: true,
            provider: "LoopMessage",
            nextSpinTime: nextSpinTime
          });
        } catch (notifyError) {
          console.error("Failed to send LoopMessage notification:", notifyError);
          return res.status(200).json({
            message: "Spin available - notification failed",
            spinNumber: spinCount + 1,
            notificationSent: false,
            provider: "LoopMessage",
            error: notifyError.message
          });
        }
      }
      // If cannot spin (user already completed it) and we haven't acknowledged this spin yet
      else if (!canSpinNow && spinCount > lastNotifiedSpinCount) {
        console.log(`User already completed spin #${spinCount}. Sending confirmation notification.`);
        
        const notifier = new LoopMessageNotifier(loopAuthKey, loopSecretKey, notificationNumber, senderName);
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
        
        try {
          await notifier.sendAlreadyCompletedNotification(spinCount, nextSpinDateFormatted);
          
          lastNotifiedSpinCount = spinCount; // Update to current spin count
          
          return res.status(200).json({
            message: "Already spun - confirmation notification sent",
            spinNumber: spinCount,
            notificationSent: true,
            provider: "LoopMessage",
            nextSpinTime: nextSpinDateFormatted
          });
        } catch (notifyError) {
          console.error("Failed to send confirmation notification:", notifyError);
          return res.status(200).json({
            message: "Already spun - notification failed",
            spinNumber: spinCount,
            notificationSent: false,
            provider: "LoopMessage",
            error: notifyError.message
          });
        }
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
    console.error("Error checking spin availability:", error);
    res.status(500).json({ error: error.message });
  }
};