# 🌀 Spin Shape

Automated daily spin scheduler for the Shape Network Medal game with an incrementing time schedule.

## Overview

This project automates daily spins on the [MedalSpin contract](https://shapescan.xyz/address/0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1) deployed on Shape Network. It ensures you never miss your daily spin while implementing a unique incrementing schedule system that adds 1 minute each day (4:00 PM, 4:01 PM, 4:02 PM, etc.).

## Features

- 🤖 **Automated Daily Spins** - Never miss your 24-hour spin window
- ⏰ **Smart Scheduling** - Incrementing schedule adds 1 minute daily to account for blockchain processing time
- 🔒 **Secure** - Protected endpoints with CRON_SECRET authentication
- 📊 **Dashboard** - Real-time schedule tracking and spin history
- 🎯 **Efficient** - Optimized cron checks only during potential spin windows

## How It Works

1. **Vercel Cron Job** runs every 15 minutes between 3-10 PM UTC
2. **Smart Scheduler** checks if 24+ hours have passed and if it's the scheduled time
3. **Contract Interaction** calls `spin()` with a random hash on the MedalSpin contract
4. **Medal Collection** - Visit [Shape Medal Spin](https://stack.shape.network/medal-spin) to claim your medals

## Contract Details

- **Address**: [`0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1`](https://shapescan.xyz/address/0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1)
- **Network**: Shape Mainnet (Chain ID: 360)
- **Method**: `spin(bytes32 hash)`
- **ABI**: [View on ShapeScan](https://shapescan.xyz/address/0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1?tab=contract_abi)

## Setup

### Prerequisites
- Node.js 18+
- Vercel account
- Wallet with ETH on Shape Network

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/spin-shape.git
cd spin-shape
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables in Vercel:
```env
PRIVATE_KEY=your_wallet_private_key
CRON_SECRET=your_generated_secret  # Generate with: openssl rand -base64 32
```

4. Deploy to Vercel:
```bash
vercel --prod
```

## API Endpoints

### 🏠 `/` 
Minimalist homepage with secret emoji link

### 📅 `/api/schedule`
Dashboard showing:
- Current spin count
- Last spin time
- Next scheduled spin
- Complete spin history
- Live status updates

### 🔧 `/api/debug`
Technical details including:
- Contract read methods
- Spin time gaps analysis
- Hash verification

### 🎯 `/api/cron` (Protected)
Automated spin execution endpoint (Vercel Cron only)

## Schedule Logic

The bot implements an incrementing schedule to account for blockchain processing delays:

- **Day 1**: 4:00 PM ET
- **Day 2**: 4:01 PM ET  
- **Day 3**: 4:02 PM ET
- **Day 4**: 4:03 PM ET
- ...and so on

This ensures a consistent 24-hour gap while preventing timing conflicts.

## Security

- ✅ CRON_SECRET authentication prevents unauthorized access
- ✅ Method validation (GET only)
- ✅ Environment variables for sensitive data
- ✅ Rate limiting through Vercel

## Development

Run locally:
```bash
npx vercel dev --listen 4000
```

View logs:
```bash
vercel logs
```

## Important Notes

- Spins are recorded on-chain and cannot be reversed
- Medal outcomes are determined when you visit the Shape Medal site
- The bot only handles the blockchain transaction, not medal generation
- Maintain ETH balance for gas fees

## License

ISC
