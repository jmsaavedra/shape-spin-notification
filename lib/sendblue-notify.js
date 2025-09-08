// Sendblue notification module for spin alerts
const sendblue = require('sendblue');

class SpinNotifier {
  constructor(apiKey, apiSecret, recipientNumber) {
    if (!apiKey || !apiSecret) {
      throw new Error('Sendblue API credentials not configured');
    }
    
    this.sb = sendblue(apiKey, apiSecret);
    this.recipientNumber = recipientNumber;
  }

  async sendSpinAvailableNotification(spinNumber, nextSpinTime, dashboardUrl) {
    try {
      const message = {
        number: this.recipientNumber,
        content: `🎰 Spin #${spinNumber} is ready!\n\n⏰ Available now at ${nextSpinTime}\n\n📊 Dashboard: ${dashboardUrl}\n\nVisit shape.network to spin and claim your medal!`,
        send_style: 'invisible',
        media_url: 'https://spin-shape.vercel.app/android-chrome-512x512.png' // Using the pinwheel favicon as media
      };

      const response = await this.sb.sendMessage(message);
      console.log('Notification sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  async sendTestNotification() {
    try {
      const message = {
        number: this.recipientNumber,
        content: `🧪 Test notification from Spin Shape!\n\nYour notifications are working correctly.`,
        send_style: 'invisible'
      };

      const response = await this.sb.sendMessage(message);
      console.log('Test notification sent successfully:', response);
      return response;
    } catch (error) {
      console.error('Failed to send test notification:', error);
      throw error;
    }
  }

  async sendSpinCompletedNotification(spinNumber, transactionHash) {
    try {
      const message = {
        number: this.recipientNumber,
        content: `✅ Spin #${spinNumber} completed!\n\n🔗 Transaction: https://shapescan.xyz/tx/${transactionHash}\n\n🏅 Visit shape.network to claim your medal!`,
        send_style: 'invisible'
      };

      const response = await this.sb.sendMessage(message);
      console.log('Spin completed notification sent:', response);
      return response;
    } catch (error) {
      console.error('Failed to send spin completed notification:', error);
      throw error;
    }
  }
}

module.exports = SpinNotifier;