// LoopMessage notification module for spin alerts
const https = require('https');

class LoopMessageNotifier {
  constructor(authKey, secretKey, recipientNumber, senderName = 'Spin Shape') {
    if (!authKey || !secretKey) {
      throw new Error('LoopMessage API credentials not configured');
    }
    
    this.authKey = authKey;
    this.secretKey = secretKey;
    this.recipientNumber = recipientNumber;
    this.senderName = senderName;
    this.baseUrl = 'https://server.loopmessage.com/api/v1/message/send/';
  }

  async sendMessage(messageData) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(messageData);
      
      const options = {
        hostname: 'server.loopmessage.com',
        path: '/api/v1/message/send/',
        method: 'POST',
        headers: {
          'Authorization': this.authKey,
          'Loop-Secret-Key': this.secretKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(responseData);
            if (res.statusCode === 200 && parsedData.success) {
              resolve(parsedData);
            } else {
              reject(new Error(parsedData.message || `Request failed with status ${res.statusCode}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

  async sendSpinAvailableNotification(spinNumber, nextSpinTime, dashboardUrl) {
    try {
      const message = {
        recipient: this.recipientNumber,
        text: `Spin #${spinNumber} Ready Now: https://metamask.app.link/dapp/stack.shape.network/medal-spin`,
        sender_name: this.senderName
      };

      const response = await this.sendMessage(message);
      console.log('Notification sent successfully via LoopMessage:', response);
      return response;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw error;
    }
  }

  async sendTestNotification() {
    try {
      const message = {
        recipient: this.recipientNumber,
        text: `Spin #5 Ready Now: https://metamask.app.link/dapp/stack.shape.network/medal-spin`,
        sender_name: this.senderName
      };

      const response = await this.sendMessage(message);
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
        recipient: this.recipientNumber,
        text: `✅ Spin #${spinNumber} completed!\n\n🔗 Transaction: https://shapescan.xyz/tx/${transactionHash}\n\n🏅 Visit shape.network to claim your medal!`,
        sender_name: this.senderName,
        effect: 'fireworks'
      };

      const response = await this.sendMessage(message);
      console.log('Spin completed notification sent:', response);
      return response;
    } catch (error) {
      console.error('Failed to send spin completed notification:', error);
      throw error;
    }
  }

}

module.exports = LoopMessageNotifier;