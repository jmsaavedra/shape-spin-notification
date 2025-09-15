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

// Start server
app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log('Note: This is for development only. Use "vercel dev" for production-like environment.');
});