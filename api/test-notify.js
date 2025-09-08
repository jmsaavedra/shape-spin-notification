// Test endpoint for Sendblue notifications
require("dotenv").config();
const SpinNotifier = require("../lib/sendblue-notify");

module.exports = async (req, res) => {
  // Simple auth check - you should use a more secure method in production
  const authHeader = req.headers['authorization'];
  
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const sendblueApiKey = process.env.SENDBLUE_API_KEY;
    const sendblueApiSecret = process.env.SENDBLUE_API_SECRET;
    const notificationNumber = process.env.NOTIFICATION_NUMBER;
    
    if (!sendblueApiKey || !sendblueApiSecret || !notificationNumber) {
      return res.status(500).json({ 
        error: "Sendblue not configured",
        missing: {
          SENDBLUE_API_KEY: !sendblueApiKey,
          SENDBLUE_API_SECRET: !sendblueApiSecret,
          NOTIFICATION_NUMBER: !notificationNumber
        }
      });
    }

    const notifier = new SpinNotifier(sendblueApiKey, sendblueApiSecret, notificationNumber);
    
    // Send test notification
    const result = await notifier.sendTestNotification();
    
    res.status(200).json({
      message: "Test notification sent successfully",
      recipient: notificationNumber,
      result: result
    });
    
  } catch (error) {
    console.error("Error sending test notification:", error);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data || error
    });
  }
};