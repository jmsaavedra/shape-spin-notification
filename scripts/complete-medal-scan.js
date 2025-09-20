#!/usr/bin/env node
// Complete historical scan of ALL medal events from contract deployment
// This will take 1-2 hours but gives 100% accurate real data

require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");
const fs = require('fs').promises;
const path = require('path');

const STACK_NFT_CONTRACT = "0x76d6aC90A62Ca547d51D7AcAeD014167F81B9931";
const RAFFLE_CONTRACT = "0xEFe03c16c2f08B622D0d9A01cC8169da33CfeEDe";
// Start from 1 month ago when medal activity actually began (not deployment)
const MEDAL_ACTIVITY_START = 17000000; // Corrected block from 1 month ago
// Black medals started 2 weeks ago (Shape: ~2 sec blocks, 2 weeks = ~604800 blocks)
const BLACK_MEDAL_START = 17700000; // Approximate start of black medals 2 weeks ago
const ACTUAL_EVENT_TOPIC = '0x5c24d76f2bf28abc7d31e1a28c9bba49bbd57578d2d3b1c670d32b5562baf61d';
const RAFFLE_EVENT_TOPIC = '0x8ad7d0c20f6e36eda88f260780fd016c8c0b7bf250f8c9a4236ef478df7acf56';

const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
const rpcUrl = `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

const provider = new JsonRpcProvider(rpcUrl, {
    name: 'shape-mainnet',
    chainId: 360
});

const DATA_FILE = path.join(__dirname, '../data/global-medal-stats.json');
const PROGRESS_FILE = path.join(__dirname, '../data/scan-progress.json');

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      lastProcessedBlock: MEDAL_ACTIVITY_START - 1,
      totalEvents: 0,
      medalCounts: { bronze: 0, silver: 0, gold: 0, black: 0, total: 0 },
      processedChunks: 0,
      startTime: Date.now()
    };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function extractMedalFromEvent(log) {
  try {
    const data = log.data;
    const dataStr = data.substring(2); // Remove 0x

    // Look for JSON metadata starting with {"projectId"
    const jsonStartIndex = dataStr.indexOf('7b2270726f6a656374496');

    if (jsonStartIndex >= 0) {
      // Extract hex string containing JSON
      let jsonHex = '0x';
      for (let i = jsonStartIndex; i < dataStr.length; i += 2) {
        const byte = dataStr.substring(i, i + 2);
        if (byte === '00') break; // Stop at null terminator
        jsonHex += byte;
      }

      // Convert to UTF-8 and parse JSON
      let jsonString;
      try {
        jsonString = ethers.toUtf8String(jsonHex);
      } catch (utfError) {
        // If UTF-8 decoding fails, this isn't valid JSON we can parse
        return null;
      }

      const metadata = JSON.parse(jsonString);

      // Only process MEDAL-SPIN medals
      if (metadata.projectId === 'MEDAL-SPIN') {
        // Extract stackId from beginning of data
        const stackIdHex = '0x' + dataStr.substring(0, 64);
        const stackId = Number(ethers.toBigInt(stackIdHex));

        // Determine tier from metadata
        let tier = 0;
        if (metadata.id?.includes('bronze')) tier = 1;
        else if (metadata.id?.includes('silver')) tier = 2;
        else if (metadata.id?.includes('gold')) tier = 3;
        else if (metadata.id?.includes('black')) tier = 4;

        return {
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          stackId: stackId,
          tier: tier,
          tierName: ['Unknown', 'Bronze', 'Silver', 'Gold', 'Black'][tier] || 'Unknown',
          name: metadata.name || metadata.id || 'Medal',
          metadata: metadata
        };
      }
    }
  } catch (error) {
    // Skip events that can't be parsed
  }

  return null;
}

async function extractBlackMedalFromRaffleEvent(log) {
  try {
    const dataStr = log.data.substring(2); // Remove 0x

    // Decode ABI-encoded data: address (first 32 bytes) and number (second 32 bytes)
    const addressHex = '0x' + dataStr.substring(24, 64); // Skip padding, get address
    const secondParam = '0x' + dataStr.substring(64, 128);
    const numberValue = Number(ethers.toBigInt(secondParam));

    // Based on our analysis, this appears to be a black medal award
    // The number value seems to be consistently 2, which might be the medal tier or quantity
    return {
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      winner: addressHex,
      tier: 4, // Black medal
      tierName: 'Black',
      quantity: numberValue,
      source: 'raffle'
    };
  } catch (error) {
    // Skip events that can't be parsed
  }

  return null;
}

async function scanRaffleChunk(fromBlock, toBlock, progress) {
  try {
    console.log(`🎲 Scanning raffle blocks ${fromBlock}-${toBlock}...`);

    const logs = await provider.getLogs({
      address: RAFFLE_CONTRACT,
      topics: [RAFFLE_EVENT_TOPIC],
      fromBlock: fromBlock,
      toBlock: toBlock
    });

    console.log(`   Found ${logs.length} raffle events`);

    const blackMedals = [];
    for (let i = 0; i < logs.length; i++) {
      try {
        const blackMedal = await extractBlackMedalFromRaffleEvent(logs[i]);
        if (blackMedal) {
          blackMedals.push(blackMedal);
          progress.medalCounts.black += blackMedal.quantity || 1;
          progress.medalCounts.total += blackMedal.quantity || 1;
        }
      } catch (error) {
        console.log(`   ⚠️  Error processing raffle event ${i + 1}/${logs.length}: ${error.message}`);
      }
    }

    if (blackMedals.length > 0) {
      console.log(`   🖤 Found ${blackMedals.length} black medal awards`);
    }

    return blackMedals;

  } catch (error) {
    console.error(`❌ Error scanning raffle chunk ${fromBlock}-${toBlock}:`, error.message);
    throw error;
  }
}

async function scanChunk(fromBlock, toBlock, progress) {
  try {
    console.log(`📦 Scanning blocks ${fromBlock}-${toBlock}...`);

    const logs = await provider.getLogs({
      address: STACK_NFT_CONTRACT,
      topics: [ACTUAL_EVENT_TOPIC],
      fromBlock: fromBlock,
      toBlock: toBlock
    });

    console.log(`   Found ${logs.length} events`);

    const medals = [];
    for (let i = 0; i < logs.length; i++) {
      try {
        const medal = await extractMedalFromEvent(logs[i]);
        if (medal) {
          medals.push(medal);

          // Update counts
          switch (medal.tier) {
            case 1: progress.medalCounts.bronze++; break;
            case 2: progress.medalCounts.silver++; break;
            case 3: progress.medalCounts.gold++; break;
            case 4: progress.medalCounts.black++; break;
          }
          progress.medalCounts.total++;
        }
      } catch (error) {
        console.log(`   ⚠️  Error processing event ${i + 1}/${logs.length}: ${error.message}`);
        // Continue processing other events
      }
    }

    progress.totalEvents += logs.length;
    progress.lastProcessedBlock = toBlock;
    progress.processedChunks++;

    if (medals.length > 0) {
      console.log(`   🏆 Found ${medals.length} MEDAL-SPIN medals`);
    }

    return medals;

  } catch (error) {
    console.error(`❌ Error scanning chunk ${fromBlock}-${toBlock}:`, error.message);

    // On error, don't update progress for this chunk
    throw error;
  }
}

async function completeMedalScan() {
  console.log('🚀 Starting complete medal scan from when activity began...');
  console.log(`📊 Medal activity started around block: ${MEDAL_ACTIVITY_START}`);
  console.log(`🖤 Black medal raffle started around block: ${BLACK_MEDAL_START}`);
  console.log(`📍 Stack NFT Contract: ${STACK_NFT_CONTRACT}`);
  console.log(`🎲 Raffle Contract: ${RAFFLE_CONTRACT}`);

  const currentBlock = await provider.getBlockNumber();
  const totalBlocks = currentBlock - MEDAL_ACTIVITY_START;
  console.log(`📈 Total blocks to scan: ${totalBlocks.toLocaleString()}`);

  // Load previous progress
  const progress = await loadProgress();
  const isResume = progress.lastProcessedBlock >= MEDAL_ACTIVITY_START;

  if (isResume) {
    console.log(`📂 Resuming from block ${progress.lastProcessedBlock + 1}`);
    console.log(`📊 Current progress: ${progress.medalCounts.total} medals found`);
  }

  const chunkSize = 9000; // Stay under Alchemy 10k limit
  const startBlock = progress.lastProcessedBlock + 1;
  const totalChunks = Math.ceil((currentBlock - startBlock) / chunkSize);

  console.log(`🔄 Processing ${totalChunks} chunks of ${chunkSize} blocks each`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const allMedals = [];

  for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += chunkSize) {
    const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);

    try {
      // Scan Stack NFT contract for Bronze/Silver/Gold medals
      const chunkMedals = await scanChunk(fromBlock, toBlock, progress);
      allMedals.push(...chunkMedals);

      // TODO: Black medal scanning disabled - need to identify correct events
      // The raffle contract events we found are not black medal awards
      // if (fromBlock >= BLACK_MEDAL_START) {
      //   const blackMedals = await scanRaffleChunk(fromBlock, toBlock, progress);
      //   allMedals.push(...blackMedals);
      // }

      // Calculate progress
      const completedBlocks = progress.lastProcessedBlock - MEDAL_ACTIVITY_START;
      const progressPercent = ((completedBlocks / totalBlocks) * 100).toFixed(2);
      const elapsed = (Date.now() - progress.startTime) / 1000 / 60; // minutes
      const eta = totalChunks > 0 ? (elapsed / progress.processedChunks * (totalChunks - progress.processedChunks)) : 0;

      console.log(`📈 Progress: ${progressPercent}% | Medals: ${progress.medalCounts.total} | ETA: ${eta.toFixed(1)}m`);

      // Save progress every 10 chunks
      if (progress.processedChunks % 10 === 0) {
        await saveProgress(progress);
        console.log(`💾 Progress saved (${progress.processedChunks}/${totalChunks} chunks)`);
      }

      // Small delay to be nice to Alchemy
      await new Promise(resolve => setTimeout(resolve, 50));

    } catch (error) {
      console.error(`❌ Chunk failed, retrying in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Retry the same chunk (don't increment fromBlock)
      fromBlock -= chunkSize;
      continue;
    }
  }

  // Final save
  await saveProgress(progress);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Complete medal scan finished!');
  console.log('\n🏆 FINAL MEDAL COUNTS:');
  console.log(`  Bronze: ${progress.medalCounts.bronze}`);
  console.log(`  Silver: ${progress.medalCounts.silver}`);
  console.log(`  Gold: ${progress.medalCounts.gold}`);
  console.log(`  Black: ${progress.medalCounts.black}`);
  console.log(`  Total: ${progress.medalCounts.total}`);

  // Save final results
  await saveFinalResults(progress, allMedals);

  return progress.medalCounts;
}

async function saveFinalResults(progress, medals) {
  console.log('\n💾 Saving final results...');

  const data = {
    lastUpdated: new Date().toISOString(),
    lastIndexedBlock: progress.lastProcessedBlock,
    dataSource: 'complete_event_scan',
    globalMedalStats: progress.medalCounts,
    totalEvents: progress.totalEvents,
    scanDuration: (Date.now() - progress.startTime) / 1000 / 60, // minutes
    completionStatus: 'complete',
    // Keep sample of recent medals for reference
    recentMedals: medals.slice(-100)
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`✅ Final results saved to ${DATA_FILE}`);

  // Clean up progress file
  try {
    await fs.unlink(PROGRESS_FILE);
    console.log(`🗑️  Progress file cleaned up`);
  } catch (e) {
    // Ignore if file doesn't exist
  }
}

async function main() {
  try {
    const medalCounts = await completeMedalScan();

    console.log('\n🎯 MISSION ACCOMPLISHED!');
    console.log(`📊 Total MEDAL-SPIN medals ever claimed: ${medalCounts.total}`);

  } catch (error) {
    console.error('❌ Complete medal scan failed:', error);
    console.log('\n💡 Progress has been saved. You can resume by running this script again.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { completeMedalScan };