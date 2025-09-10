// Count Alchemy API calls per /api/status request
const fs = require('fs');

// Read the status.js file
const code = fs.readFileSync('api/status.js', 'utf8');

// Find all provider method calls
const providerCalls = [
  'provider.getBlockNumber',
  'provider.getBlock',
  'provider.getBalance',
  'provider.lookupAddress',  // ENS lookup (mainnet)
  'stackContract.getStackMedals',
  'stackContract.spins',
  'stackContract.lastSpinTimestamp',
  'medalSpinContract.getCurrentSeason',
  'medalSpinContract.balanceOf',
  'multicall3.staticCall',
  'provider.send',
  'provider.call'
];

console.log('ALCHEMY API CALLS PER /api/status REQUEST:\n');
console.log('=' .repeat(50));

let totalCalls = 0;
const callBreakdown = {};

providerCalls.forEach(call => {
  const pattern = new RegExp(call.replace('.', '\\.'), 'g');
  const matches = code.match(pattern);
  const count = matches ? matches.length : 0;
  
  if (count > 0) {
    const callName = call.split('.').pop();
    callBreakdown[call] = count;
    totalCalls += count;
  }
});

// Special case: Multicall3 bundling
const multicallPattern = /aggregate3.*\[[\s\S]*?\]/g;
const multicallMatches = code.match(multicallPattern);
if (multicallMatches) {
  // Count the number of calls bundled in multicall
  multicallMatches.forEach(match => {
    const targets = match.match(/target:/g);
    if (targets) {
      console.log(`\nMulticall3 Bundle: ${targets.length} calls bundled into 1`);
    }
  });
}

console.log('\nDirect provider calls found in code:');
Object.entries(callBreakdown).forEach(([call, count]) => {
  console.log(`  ${call}: ${count} occurrence(s)`);
});

console.log('\n' + '=' .repeat(50));
console.log('ACTUAL CALLS PER REQUEST (with optimizations):');
console.log('=' .repeat(50));

console.log('\n1. WITHOUT CACHE (first request or cache miss):');
console.log('   - getBlockNumber: 1 call');
console.log('   - ENS lookup: 1 call (mainnet, cached after first)');
console.log('   - Multicall3.aggregate3: 1 call (bundles 3 calls)');
console.log('     • stackContract.spins(stackId)');
console.log('     • stackContract.lastSpinTimestamp(stackId)');  
console.log('     • medalSpinContract.getCurrentSeason()');
console.log('   - stackContract.getStackMedals: 1 call (288 medals)');
console.log('   TOTAL: 4 Alchemy API calls');

console.log('\n2. WITH CACHE HIT (subsequent requests):');
console.log('   - getBlockNumber: 1 call');
console.log('   - ENS lookup: 0 calls (cached)');
console.log('   - Multicall3.aggregate3: 1 call (bundles 3 calls)');
console.log('   - stackContract.getStackMedals: 0 calls (using cached 4 medals)');
console.log('   TOTAL: 2 Alchemy API calls');

console.log('\n' + '=' .repeat(50));
console.log('AUTO-REFRESH FREQUENCY:');
console.log('=' .repeat(50));
console.log('- Starts at: 30 seconds');
console.log('- Full page refresh fallback: Every 10 minutes');
console.log('- Dynamic adjustment: Server can suggest different intervals');
console.log('  (but suggestedPollInterval not implemented in api/status.js)');

console.log('\n' + '=' .repeat(50));
console.log('CALLS PER MINUTE:');
console.log('=' .repeat(50));
console.log('- Without cache: 2 polls/min × 4 calls = 8 calls/minute');
console.log('- With cache: 2 polls/min × 2 calls = 4 calls/minute');
console.log('\n- Per hour: 240-480 calls');
console.log('- Per day: 5,760-11,520 calls');
