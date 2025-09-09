#!/usr/bin/env node

// This script generates vercel.json from vercel.template.json
// using the CRON_INTERVAL_MINUTES environment variable

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const cronInterval = process.env.CRON_INTERVAL_MINUTES || '10';

// Validate the interval
const validIntervals = ['1', '2', '3', '4', '5', '6', '10', '12', '15', '20', '30', '60'];
if (!validIntervals.includes(cronInterval)) {
  console.warn(`Warning: CRON_INTERVAL_MINUTES=${cronInterval} may not be optimal.`);
  console.warn(`Recommended values: ${validIntervals.join(', ')}`);
}

// Read the template
const templatePath = path.join(__dirname, '..', 'vercel.template.json');
const template = fs.readFileSync(templatePath, 'utf8');

// Replace the placeholder
const config = template.replace('{{CRON_INTERVAL_MINUTES}}', cronInterval);

// Write the vercel.json
const outputPath = path.join(__dirname, '..', 'vercel.json');
fs.writeFileSync(outputPath, config);

console.log(`✓ Generated vercel.json with ${cronInterval}-minute cron interval`);
console.log(`  Schedule: */${cronInterval} * * * * (every ${cronInterval} minutes)`);