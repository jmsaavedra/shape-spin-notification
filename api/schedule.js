// API endpoint to check the current schedule status without triggering a spin
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const scheduleState = require("../lib/schedule-state");

const abi = [{"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}];

const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

const provider = new JsonRpcProvider("https://shape-mainnet.g.alchemy.com/public", {
    name: 'shape-mainnet',
    chainId: 360
});

module.exports = async (req, res) => {
  // Check if browser is requesting HTML
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    // Return HTML view
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spin Schedule</title>
    
    <!-- Open Graph / Social Media -->
    <meta property="og:title" content="Spin Schedule">
    <meta property="og:description" content="Track daily spins on Shape Network with incrementing schedule">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://spin-shape.vercel.app/api/schedule">
    <meta property="og:image" content="https://spin-shape.vercel.app/android-chrome-512x512.png">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Spin Schedule">
    <meta name="twitter:description" content="Track daily spins on Shape Network with incrementing schedule">
    <meta name="twitter:image" content="https://spin-shape.vercel.app/android-chrome-512x512.png">
    
    <!-- Favicons -->
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #000;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
            min-height: 100vh;
            padding: 40px 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        
        h1 {
            text-align: center;
            margin-bottom: 40px;
            font-size: 24px;
            opacity: 0.9;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }
        
        .spin-icon {
            animation: spin 3s linear infinite;
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        
        .card {
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            padding: 20px;
        }
        
        .card-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.5;
            margin-bottom: 8px;
        }
        
        .card-value {
            font-size: 20px;
            font-weight: 500;
        }
        
        .card-value.large {
            font-size: 32px;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 10px;
            vertical-align: middle;
            position: relative;
            top: -1px;
        }
        
        .status-indicator.active {
            background: #0f0;
        }
        
        .status-indicator.inactive {
            background: #f00;
        }
        
        .description {
            grid-column: 1 / -1;
            text-align: center;
            opacity: 0.7;
            font-size: 14px;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            <svg xmlns="http://www.w3.org/2000/svg" width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-icon">
                <path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5 2.2 5 5 5 5-2.2 5-5"></path>
                <path d="M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6"></path>
                <path d="M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6"></path>
                <circle cx="12" cy="12" r="10"></circle>
            </svg>
            Spin Schedule
        </h1>
        <div id="content" class="loading">Loading...</div>
    </div>
    
    <script>
        let globalData = null;
        let updateInterval = null;
        
        function updateTimers() {
            if (!globalData) return;
            
            const now = Date.now();
            
            // Update Time Since
            if (globalData.lastSpinTime && globalData.lastSpinTime !== 'Never') {
                const lastSpinMs = new Date(globalData.lastSpinTime).getTime();
                const msSince = now - lastSpinMs;
                const hoursSince = Math.floor(msSince / (1000 * 60 * 60));
                const minutesSince = Math.floor((msSince % (1000 * 60 * 60)) / (1000 * 60));
                const secondsSince = Math.floor((msSince % (1000 * 60)) / 1000);
                
                const timeSinceEl = document.getElementById('time-since');
                if (timeSinceEl) {
                    timeSinceEl.textContent = \`\${hoursSince}h \${minutesSince}m \${secondsSince}s\`;
                }
            }
            
            // Update Time Until
            if (globalData.nextSpinTime) {
                const nextSpinMs = new Date(globalData.nextSpinTime).getTime();
                const msUntil = nextSpinMs - now;
                
                if (msUntil > 0) {
                    const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
                    const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
                    const secondsUntil = Math.floor((msUntil % (1000 * 60)) / 1000);
                    
                    const timeUntilEl = document.getElementById('time-until');
                    if (timeUntilEl) {
                        timeUntilEl.textContent = \`\${hoursUntil}h \${minutesUntil}m \${secondsUntil}s\`;
                    }
                } else {
                    const timeUntilEl = document.getElementById('time-until');
                    if (timeUntilEl) {
                        timeUntilEl.textContent = 'Now';
                    }
                }
            }
        }
        
        async function loadSchedule() {
            try {
                const response = await fetch('/api/schedule', {
                    headers: { 'Accept': 'application/json' }
                });
                const data = await response.json();
                globalData = data;
                
                const html = \`
                    <div class="grid">
                        <div class="card">
                            <div class="card-label">Spin Count</div>
                            <div class="card-value large">\${data.currentSpinCount}</div>
                        </div>
                        
                        <div class="card">
                            <div class="card-label">Last Spin (ET)</div>
                            <div class="card-value">\${data.lastSpinTime || 'Never'}</div>
                        </div>
                        
                        <div class="card">
                            <div class="card-label">Time Since</div>
                            <div class="card-value" id="time-since">\${data.timeSinceLastSpin || 'N/A'}</div>
                        </div>
                        
                        <div class="card">
                            <div class="card-label">Can Spin Now</div>
                            <div class="card-value">
                                <span class="status-indicator \${data.canSpinNow ? 'active' : 'inactive'}"></span>
                                \${data.canSpinNow ? 'Yes' : 'No'}
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-label">Next Spin (ET)</div>
                            <div class="card-value">\${data.nextSpinTime}</div>
                        </div>
                        
                        <div class="card">
                            <div class="card-label">Time Until</div>
                            <div class="card-value" id="time-until">\${data.timeUntilSpin || 'Calculating...'}</div>
                        </div>
                        
                        <div class="card description">
                            \${data.description}
                        </div>
                        
                        \${data.spinHistory && data.spinHistory.length > 0 ? \`
                        <div class="card" style="grid-column: 1 / -1;">
                            <div class="card-label">Spin History</div>
                            <div style="margin-top: 12px; font-family: monospace; font-size: 14px; opacity: 0.8;">
                                \${data.spinHistory.map((spin, i) => \`
                                    <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #222;">
                                        <div style="color: #888;">Spin #\${i + 1}</div>
                                        <div style="font-size: 12px;">\${spin.date}</div>
                                        <div style="font-size: 10px; opacity: 0.5;">
                                            <span style="color: #666;">Spin Hash:</span>
                                            <span style="word-break: break-all;">\${spin.hash}</span>
                                        </div>
                                    </div>
                                \`).join('')}
                            </div>
                        </div>
                        \` : ''}
                    </div>
                \`;
                
                document.getElementById('content').innerHTML = html;
                document.getElementById('content').classList.remove('loading');
                
                // Start the timer for live updates
                if (updateInterval) clearInterval(updateInterval);
                updateInterval = setInterval(updateTimers, 1000);
                updateTimers(); // Run immediately
                
            } catch (error) {
                document.getElementById('content').innerHTML = '<div class="error">Error loading schedule</div>';
            }
        }
        
        loadSchedule();
        // Refresh data every 30 seconds
        setInterval(loadSchedule, 30000);
    </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }
  
  // Otherwise return JSON as before
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ error: "PRIVATE_KEY not configured" });
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    const spins = await contract.getSpins(wallet.address);
    const spinCount = spins.length;
    
    let lastSpinTime = null;
    let timeSinceLastSpin = null;
    
    if (spins.length > 0) {
      const lastSpinTimestamp = spins[spins.length - 1].timestamp;
      lastSpinTime = new Date(Number(lastSpinTimestamp) * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium'
      });
      
      const now = Date.now();
      const lastSpinMs = Number(lastSpinTimestamp) * 1000;
      const hoursSince = Math.floor((now - lastSpinMs) / (1000 * 60 * 60));
      const minutesSince = Math.floor(((now - lastSpinMs) % (1000 * 60 * 60)) / (1000 * 60));
      timeSinceLastSpin = `${hoursSince}h ${minutesSince}m`;
    }
    
    const nextSpinTime = scheduleState.getNextSpinTimeString(spinCount);
    const nextSpinDate = scheduleState.calculateNextSpinTime(spinCount);
    const canSpinNow = spins.length === 0 || scheduleState.shouldSpinNow(
      spins.length > 0 ? Number(spins[spins.length - 1].timestamp) * 1000 : null, 
      spinCount
    );
    
    // Calculate time until next spin
    const now = Date.now();
    const msUntil = nextSpinDate.getTime() - now;
    const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
    const timeUntilSpin = msUntil > 0 ? `${hoursUntil}h ${minutesUntil}m` : 'Now';
    
    // Calculate the schedule pattern
    const baseTime = new Date();
    baseTime.setUTCHours(21, 0, 0, 0); // 4 PM ET
    const incrementMinutes = spinCount * 1;
    const scheduleTime = `4:${String(incrementMinutes % 60).padStart(2, '0')} PM ET`;
    
    // Format spin history
    const spinHistory = spins.map((spin, index) => ({
      spinNumber: index + 1,
      hash: spin.hash,
      date: new Date(Number(spin.timestamp) * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'medium'
      })
    }));
    
    res.status(200).json({
      currentSpinCount: spinCount,
      lastSpinTime: lastSpinTime,
      timeSinceLastSpin: timeSinceLastSpin,
      nextSpinTime: nextSpinTime,
      nextSpinSchedule: scheduleTime,
      canSpinNow: canSpinNow,
      timeUntilSpin: timeUntilSpin,
      walletAddress: wallet.address,
      description: `Spin #${spinCount + 1} will occur at ${scheduleTime}`,
      spinHistory: spinHistory
    });
    
  } catch (error) {
    console.error("Error fetching schedule info:", error);
    res.status(500).json({ error: error.message });
  }
};