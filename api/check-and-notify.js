// Cron endpoint that checks if spin is available and sends notification
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");
const SpinNotifier = require("../lib/sendblue-notify");

const abi = [
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"canSpin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

const provider = new JsonRpcProvider("https://shape-mainnet.g.alchemy.com/public", {
    name: 'shape-mainnet',
    chainId: 360
});

// Track if we've already notified for the current spin
let lastNotifiedSpinCount = null;

module.exports = async (req, res) => {
  // Verify cron authentication
  const authHeader = req.headers['authorization'];
  
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Check required environment variables
    const privateKey = process.env.PRIVATE_KEY;
    const sendblueApiKey = process.env.SENDBLUE_API_KEY;
    const sendblueApiSecret = process.env.SENDBLUE_API_SECRET;
    const notificationNumber = process.env.NOTIFICATION_NUMBER;
    
    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is not set");
    }
    
    // Only send notifications if Sendblue is configured
    const notificationsEnabled = sendblueApiKey && sendblueApiSecret && notificationNumber;
    
    if (!notificationsEnabled) {
      console.log("Sendblue notifications not configured. Set SENDBLUE_API_KEY, SENDBLUE_API_SECRET, and NOTIFICATION_NUMBER to enable.");
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    // Get current spin count and check if we can spin
    const spins = await contract.getSpins(wallet.address);
    const spinCount = spins.length;
    const canSpinNow = await contract.canSpin(wallet.address);
    
    console.log(`Current spin count: ${spinCount}, Can spin: ${canSpinNow}`);
    
    // Check if this is a new spin opportunity we haven't notified about
    if (canSpinNow && notificationsEnabled) {
      // Initialize on first run
      if (lastNotifiedSpinCount === null) {
        lastNotifiedSpinCount = spinCount - 1; // Assume we've notified for all previous spins
      }
      
      // Only notify if we haven't already for this spin number
      if (spinCount >= lastNotifiedSpinCount + 1) {
        console.log(`New spin available! Sending notification for spin #${spinCount + 1}`);
        
        const notifier = new SpinNotifier(sendblueApiKey, sendblueApiSecret, notificationNumber);
        const nextSpinTime = scheduleState.getNextSpinTimeString(spinCount);
        const dashboardUrl = 'https://spin-shape.vercel.app/api/schedule';
        
        try {
          await notifier.sendSpinAvailableNotification(
            spinCount + 1,
            nextSpinTime,
            dashboardUrl
          );
          
          lastNotifiedSpinCount = spinCount;
          
          return res.status(200).json({
            message: "Spin available - notification sent",
            spinNumber: spinCount + 1,
            notificationSent: true,
            nextSpinTime: nextSpinTime
          });
        } catch (notifyError) {
          console.error("Failed to send notification:", notifyError);
          return res.status(200).json({
            message: "Spin available - notification failed",
            spinNumber: spinCount + 1,
            notificationSent: false,
            error: notifyError.message
          });
        }
      }
    }
    
    // Calculate when the next spin will be available
    let timeUntilNextCheck = "Not available";
    if (!canSpinNow && spins.length > 0) {
      const nextSpinDate = scheduleState.calculateNextSpinTime(spinCount);
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
      notificationsEnabled: notificationsEnabled
    });
    
  } catch (error) {
    console.error("Error checking spin availability:", error);
    res.status(500).json({ error: error.message });
  }
};