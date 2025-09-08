// Test endpoint for LoopMessage notifications
require("dotenv").config();
const LoopMessageNotifier = require("../lib/loopmessage-notify");

module.exports = async (req, res) => {
  // Simple auth check - you should use a more secure method in production
  const authHeader = req.headers['authorization'];
  
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const loopAuthKey = process.env.LOOPMESSAGE_AUTH_KEY;
    const loopSecretKey = process.env.LOOPMESSAGE_SECRET_KEY;
    const notificationNumber = process.env.NOTIFICATION_NUMBER;
    const senderName = process.env.LOOPMESSAGE_SENDER_NAME || 'Spin Shape';
    
    if (!loopAuthKey || !loopSecretKey || !notificationNumber) {
      return res.status(500).json({ 
        error: "LoopMessage not configured",
        missing: {
          LOOPMESSAGE_AUTH_KEY: !loopAuthKey,
          LOOPMESSAGE_SECRET_KEY: !loopSecretKey,
          NOTIFICATION_NUMBER: !notificationNumber
        }
      });
    }

    const notifier = new LoopMessageNotifier(loopAuthKey, loopSecretKey, notificationNumber, senderName);
    
    // Send test notification
    const result = await notifier.sendTestNotification();
    
    res.status(200).json({
      message: "Test notification sent successfully via LoopMessage",
      recipient: notificationNumber,
      senderName: senderName,
      provider: "LoopMessage",
      result: result
    });
    
  } catch (error) {
    console.error("Error sending test notification:", error);
    res.status(500).json({ 
      error: error.message,
      provider: "LoopMessage",
      details: error.response?.data || error.toString()
    });
  }
};