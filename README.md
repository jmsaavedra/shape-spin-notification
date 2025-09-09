# 🌀 Shape Medal Spin Notification App 🌀

<div align="center">
  <img src="public/assets/SPIN-logo-header.png" alt="SPIN Logo" width="50%">
  <br><br>
  
  [![Deployment Status](https://img.shields.io/badge/deployment-passing-brightgreen)](https://spin-shape.vercel.app/) [![API Status](https://img.shields.io/badge/API-operational-brightgreen)](https://spin-shape.vercel.app/api/status) [![Caching](https://img.shields.io/badge/caching-optimized-brightgreen)](https://github.com/jmsaavedra/shape-spin-notification) [![Multicall](https://img.shields.io/badge/multicall-enabled-brightgreen)](https://github.com/jmsaavedra/shape-spin-notification) [![License](https://img.shields.io/badge/license-ISC-blue)](LICENSE)
</div>

**Live Demo Instance: [https://spin-shape.vercel.app/](https://spin-shape.vercel.app/)**

Automated daily spin status iMessage notification for the Shape Network [Medal Spin Game](https://stack.shape.network/medal-spin). Never miss a daily spin again!

## Overview

This project monitors your wallet on the [MedalSpin contract](https://shapescan.xyz/address/0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1) and sends you iMessage notifications when you can spin. It tracks the 24-hour cooldown period between spins.

## Features

- 🤖 **Spin Monitoring** - Checks regularly when your next spin is available (configurable interval)
- 📱 **iMessage/SMS Notifications** - Get alerted promptly when spin is available (automatic SMS fallback)
- 🔒 **Secure** - Uses public addresses only, no private keys needed for monitoring
- 📊 **Dashboard** - Real-time schedule tracking and spin history
- 🎯 **Efficient** - 99% reduction in API calls through caching & batching
- ⚡ **Smart Polling** - Dynamic intervals based on proximity to spin time
- 🔄 **Multicall3** - Batches contract reads into single RPC calls
- 💾 **Intelligent Caching** - 30-day ENS cache, permanent spin history cache

## How It Works

1. **Vercel Cron Job** runs at your configured interval to check spin availability
2. **Smart Monitor** checks if you can spin on the blockchain
3. **Notification** sends iMessage when ready (automatic SMS fallback if needed)
4. **Manual Spin** - Click the link to open MetaMask and spin

## Shape MedalSpin Contract Details

- **Address**: [`0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1`](https://shapescan.xyz/address/0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1)
- **Network**: Shape Mainnet (Chain ID: 360)
- **Method**: `spin(bytes32 hash)`
- **ABI**: [View on ShapeScan](https://shapescan.xyz/address/0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1?tab=contract_abi)

## Setup

### Prerequisites
- Node.js 18+
- ETH wallet with elegible Shape Stack
- **[Vercel Pro](https://vercel.com) account** ($20/month) - Web app hosting with timely cron job
- **[LoopMessage](https://loopmessage.com) account** (Free) - if you want to receive iMessage/SMS notifications


### Installation

1. Clone the repository:
```bash
git clone https://github.com/jmsaavedra/shape-spin-notification.git
cd shape-spin-notification
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - **For local development**: Copy `.env.example` to `.env` and fill in your values
   - **For Vercel deployment**: Add these variables in your Vercel project settings

```env
PUBLIC_ADDRESS=0x...  # Wallet address to monitor
ALCHEMY_API_KEY=your_key  # Optional but recommended for reliability

# For iMessage text notifications (optional):
LOOPMESSAGE_AUTH_KEY=your_auth_key
LOOPMESSAGE_SECRET_KEY=your_secret_key
NOTIFICATION_NUMBER=+1234567890
```

4. Deploy to Vercel:
```bash
vercel --prod
```

## Routes & Endpoints

### 🏠 `/` 
Main dashboard showing:
- Current spin count
- Last spin time
- Next scheduled spin
- Can spin now status
- Complete spin history
- Live timer updates
- ENS name resolution
- Monitoring wallet address

### 📅 `/api/status`
JSON API returning spin status data (used by dashboard)

### 🔧 `/api/debug`
Technical details including:
- Contract read methods
- Spin time gaps analysis
- Hash verification

### 🔔 `/api/cron-check-and-notify`
Cron endpoint that checks if you can spin and sends notifications

### ⚡ `/api/check-updates`
Lightweight endpoint for smart polling with dynamic intervals

## Schedule Logic

The bot tracks a simple 24-hour cooldown period:

- Each spin becomes available exactly 24 hours after your last spin
- Notifications are sent at the next cron interval after availability
- Cron interval is automatically detected from vercel.json configuration

### Changing the Cron Schedule

To modify how often the app checks for spins:

1. Edit `vercel.json` and update the cron schedule:
   ```json
   "schedule": "*/10 * * * *"  // Change 10 to your desired minutes
   ```

2. Deploy to Vercel - the dashboard will automatically detect the new interval

Common intervals:
- `*/5 * * * *` - Every 5 minutes
- `*/10 * * * *` - Every 10 minutes  
- `*/15 * * * *` - Every 15 minutes
- `*/30 * * * *` - Every 30 minutes

## Performance Optimizations

- **99% API Call Reduction**: From 720 calls/hour to ~24-60 calls/hour
- **Smart Polling Intervals**:
  - 20 seconds when < 5 minutes to spin
  - 30 seconds when spin available
  - 1 minute when < 30 minutes to spin
  - 2 minutes when < 2 hours to spin
  - 5 minutes when > 2 hours to spin
- **Caching Strategy**:
  - ENS names: 30-day TTL
  - Spin history: Permanent until new spin
  - canSpin status: Always fresh for accuracy
- **Multicall3 Batching**: Combines multiple contract reads into single RPC call

## Security

- ✅ Read-only operations (no private keys needed)
- ✅ Public address monitoring only
- ✅ Environment variables for API credentials
- ✅ Rate limiting through Vercel

## Development

### Running Locally

1. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env and add your configuration
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the development server**:

   ```bash
   npx vercel dev --listen 4000
   ```

   The app will be available at `http://localhost:4000`

4. **Test the endpoints**:
   - Dashboard: `http://localhost:4000`
   - Status API: `http://localhost:4000/api/status`
   - Debug info: `http://localhost:4000/api/debug`
   - Manual cron trigger: `http://localhost:4000/api/cron-check-and-notify`

**Note**: When running locally, the cron job won't run automatically. You can manually trigger it by visiting `/api/cron-check-and-notify` in your browser.

### Production Logs

View Vercel deployment logs:

```bash
vercel logs
```

## Important Notes

- **Requires Vercel Pro** ($20/month) - Free tier's once-daily check is useless for this use case
- This bot only monitors and notifies - it does NOT automatically spin
- You must manually spin (this app texts you a link to do so when it's time!)
- Medal outcomes are determined when you visit the Shape Medal site
- Notifications include a MetaMask deep link for quick access

## Support

Support open source software! Tips appreciated.

- **ETH**: `0x56bdE1E5efC80B1E2B958f2D311f4176945Ae77f`
- **SOL**: `4ReFALhC44f2V3x14MkVQGjXUPTnXRzwUdJuvRkU8KBG`

## License

ISC
