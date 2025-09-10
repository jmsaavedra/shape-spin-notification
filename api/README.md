# API Endpoints Documentation

This directory contains all Vercel serverless functions that power the Shape Spin Notification service. Each file represents a different API endpoint accessible at `/api/{filename}`.

## Production Endpoints

### `/api/status` 
**File:** `status.js`  
**Method:** `GET`  
**Description:** Main endpoint for the application. Returns comprehensive spin status, medal data, and notification configuration.

**Returns:**
- `currentSpinCount` - Total number of spins performed
- `lastSpinTime` - Human-readable time of last spin
- `lastSpinTimestamp` - Unix timestamp of last spin
- `timeSinceLastSpin` - Formatted duration since last spin
- `nextSpinTime` - Human-readable time until next spin
- `nextSpinTimestamp` - Unix timestamp of next spin availability
- `nextSpinSchedule` - Scheduled time in ET timezone
- `canSpinNow` - Boolean indicating if spin is currently available
- `timeUntilSpin` - Formatted duration until next spin
- `walletAddress` - The configured wallet address
- `ensName` - ENS name for the wallet (cached)
- `description` - Notification description string
- `notificationStatus` - Status of iMessage notifications (censored phone number)
- `useMetaMaskDeepLink` - Whether to use MetaMask mobile deep links
- `spinHistory` - Array of past spins with timestamps and matched medals
- `medalStats` - Statistics for MEDAL-SPIN medals (total, bronze, silver, gold, diamond)
- `suggestedPollInterval` - Intelligent polling interval in milliseconds based on time until next spin

**Features:**
- Smart caching for spins, ENS names, and medal data
- Multicall3 batching for efficient blockchain queries
- Intelligent polling intervals (10s to 5min based on proximity to spin time)
- Medal matching to spin history
- Automatic cache invalidation when new spin is available

**API Calls per request:**
- First load: 4 Alchemy API calls
- With cache: 2 Alchemy API calls

### `/api/check-updates`
**File:** `check-updates.js`  
**Method:** `GET`  
**Description:** Lightweight endpoint for checking if spin count has changed. Used by frontend for efficient polling.

**Query Parameters:**
- `lastCount` - The last known spin count

**Returns:**
- `hasUpdate` - Boolean indicating if spin count changed
- `currentCount` - Current spin count
- `suggestedPollInterval` - Recommended polling interval

**Features:**
- Minimal API calls for efficient polling
- Returns suggested polling interval
- Used to trigger full status refresh only when needed

### `/api/cron-check-and-notify`
**File:** `cron-check-and-notify.js`  
**Method:** `GET`  
**Description:** Cron job endpoint that checks spin availability and sends iMessage notifications via LoopMessage.

**Headers Required:**
- `Authorization: Bearer {CRON_SECRET}` - Secret key for cron authentication

**Returns:**
- `message` - Status message
- `canSpin` - Whether spin is available
- `notificationSent` - Whether notification was sent
- `details` - Additional information about the operation

**Features:**
- Checks if user can spin
- Sends iMessage notification when spin becomes available
- Includes customizable message with wallet info
- Supports MetaMask mobile deep links
- Rate limiting to prevent duplicate notifications

**Environment Variables Required:**
- `CRON_SECRET` - Authentication secret
- `LOOPMESSAGE_AUTH_KEY` - LoopMessage API authentication
- `LOOPMESSAGE_SECRET_KEY` - LoopMessage API secret
- `NOTIFICATION_NUMBER` - Phone number for notifications

### `/api/get-cron-config`
**File:** `get-cron-config.js`  
**Method:** `GET`  
**Description:** Returns the cron schedule configuration for Vercel cron jobs.

**Returns:**
- `schedule` - Cron expression (e.g., "0 9,21 * * *")
- `description` - Human-readable schedule description

## Test/Debug Endpoints

### `/api/debug`
**File:** `debug.js`  
**Method:** `GET`  
**Description:** Debug endpoint for testing blockchain connections and contract interactions.

**Returns:**
- Contract interaction test results
- Provider connection status
- Error details if any

### `/api/test-all-medal-data`
**File:** `test-all-medal-data.js`  
**Method:** `GET`  
**Description:** Test endpoint that returns comprehensive medal and spin data for analysis.

**Returns:**
- `hasStack` - Whether address has a STACK NFT
- `stackId` - The STACK NFT token ID
- `walletAddress` - The configured wallet
- `spinStats` - Detailed spin statistics:
  - `totalSpins` - Total number of spins
  - `medalsWon` - Number of medals earned
  - `winRate` - Percentage of spins that won medals
  - `noMedalSpins` - Number of spins without medals
- `medalBreakdown` - MEDAL-SPIN medals by tier
- `spinHistory` - Complete spin history with hashes
- `medalSpinMedals` - All MEDAL-SPIN medals with metadata
- `overallStackMedals` - Total medals across all projects

**Note:** This endpoint fetches all 288 medals for comprehensive analysis, making it more expensive than the production `/api/status` endpoint.

### `/api/test-notify-loop`
**File:** `test-notify-loop.js`  
**Method:** `GET`  
**Description:** Test endpoint for LoopMessage notification integration.

**Returns:**
- Test notification status
- LoopMessage API response
- Configuration validation

## Environment Variables

Required environment variables for API functionality:

```env
# Wallet Configuration
PUBLIC_ADDRESS=0x...              # Wallet address to monitor

# Alchemy API
ALCHEMY_API_KEY=your-api-key     # Alchemy API key for Shape mainnet

# Notification Configuration
NOTIFICATION_NUMBER=+1XXXXXXXXXX  # Phone number for iMessage
LOOPMESSAGE_AUTH_KEY=xxx         # LoopMessage authentication
LOOPMESSAGE_SECRET_KEY=xxx        # LoopMessage secret
USE_METAMASK_MOBILE_DEEPLINK=true # Enable MetaMask mobile links

# Cron Authentication
CRON_SECRET=your-secret          # Secret for cron job authentication
```

## Caching Strategy

The API implements multi-level caching to minimize blockchain calls:

1. **Spins Cache** - Permanent cache, invalidated when new spin detected
2. **ENS Cache** - 24-hour cache for ENS name lookups
3. **Medal Cache** - Smart invalidation based on spin eligibility:
   - Cached when user can't spin and has recent data
   - Invalidated when user becomes eligible for new spin
   - Only caches 4 MEDAL-SPIN medals, not all 288

## Rate Limiting

- Alchemy API: ~2,000-4,000 calls/day with intelligent polling
- LoopMessage: Limited by notification cooldown periods
- Frontend polling: Dynamically adjusted from 10 seconds to 5 minutes

## Development

To test endpoints locally:

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run development server
npx vercel dev

# Test endpoints
curl http://localhost:3000/api/status
curl http://localhost:3000/api/check-updates?lastCount=0
```

## Deployment

Endpoints are automatically deployed to Vercel on push to main branch. Cron jobs are configured in `vercel.json`.