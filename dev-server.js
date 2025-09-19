const express = require('express');
const path = require('path');
const app = express();
const PORT = 4000;

// Serve static files from public directory
app.use(express.static('public'));

// Import API routes
app.get('/api/status', require('./api/status'));
app.get('/api/updates', require('./api/updates'));
app.get('/api/debug', require('./api/debug'));
app.get('/api/cron', require('./api/cron'));
app.get('/api/wallet-status', require('./api/wallet-status'));

// Wallet address routes (for local development)
// Handle Ethereum addresses (0x + 40 hex characters)
app.get(/^\/0x[a-fA-F0-9]{40}$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wallet.html'));
});

// Handle ENS names (.eth domains)
app.get(/^\/[a-zA-Z0-9-]+\.eth$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wallet.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log('Note: This is for development only. Use "vercel dev" for production-like environment.');
  console.log('Wallet routes available at: http://localhost:4000/0xABCD1234... or http://localhost:4000/name.eth');
});