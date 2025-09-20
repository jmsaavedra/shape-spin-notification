// Cron endpoint to incrementally update global medal statistics
// This endpoint should be called by Vercel cron to keep medal data current
require("dotenv").config();
const { getGlobalMedalStats, saveGlobalMedalStats } = require("../utils/supabase");
const { ethers, JsonRpcProvider } = require("ethers");

const STACK_NFT_CONTRACT = "0x76d6aC90A62Ca547d51D7AcAeD014167F81B9931";
const ACTUAL_EVENT_TOPIC = '0x5c24d76f2bf28abc7d31e1a28c9bba49bbd57578d2d3b1c670d32b5562baf61d';

const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
const rpcUrl = `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;

const provider = new JsonRpcProvider(rpcUrl, {
    name: 'shape-mainnet',
    chainId: 360
});

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

async function runIncrementalUpdate() {
  console.log('🔄 Starting incremental medal update...');

  try {
    // Get current medal stats from Supabase
    const currentStats = await getGlobalMedalStats();
    console.log(`📊 Current stats: ${currentStats.globalMedalStats.total} total medals`);
    console.log(`📍 Last indexed block: ${currentStats.lastIndexedBlock}`);

    // Get current blockchain block
    const currentBlock = await provider.getBlockNumber();
    console.log(`🔗 Current block: ${currentBlock}`);

    const fromBlock = currentStats.lastIndexedBlock + 1;
    const chunkSize = 9000; // Stay under Alchemy 10k limit

    if (fromBlock > currentBlock) {
      console.log('✅ Already up to date, no new blocks to scan');
      return {
        success: true,
        message: 'Already up to date',
        blocksScanned: 0,
        newMedals: 0
      };
    }

    let totalNewMedals = 0;
    let totalNewEvents = 0;
    const medalCounts = { ...currentStats.globalMedalStats };

    // Process blocks in chunks
    for (let scanFromBlock = fromBlock; scanFromBlock <= currentBlock; scanFromBlock += chunkSize) {
      const scanToBlock = Math.min(scanFromBlock + chunkSize - 1, currentBlock);

      console.log(`📦 Scanning blocks ${scanFromBlock}-${scanToBlock}...`);

      const logs = await provider.getLogs({
        address: STACK_NFT_CONTRACT,
        topics: [ACTUAL_EVENT_TOPIC],
        fromBlock: scanFromBlock,
        toBlock: scanToBlock
      });

      console.log(`   Found ${logs.length} events`);
      totalNewEvents += logs.length;

      // Process each event
      for (const log of logs) {
        const medal = await extractMedalFromEvent(log);
        if (medal) {
          totalNewMedals++;

          // Update counts
          switch (medal.tier) {
            case 1: medalCounts.bronze++; break;
            case 2: medalCounts.silver++; break;
            case 3: medalCounts.gold++; break;
            case 4: medalCounts.black++; break;
          }
          medalCounts.total++;

          console.log(`   🏆 Found ${medal.tierName} medal (total: ${medalCounts.total})`);
        }
      }

      // Small delay to be nice to Alchemy
      if (scanToBlock < currentBlock) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Save updated stats back to Supabase
    const updatedStats = {
      lastUpdated: new Date().toISOString(),
      lastIndexedBlock: currentBlock,
      dataSource: 'incremental_update',
      globalMedalStats: medalCounts,
      totalEvents: (currentStats.totalEvents || 0) + totalNewEvents,
      completionStatus: 'complete'
    };

    await saveGlobalMedalStats(updatedStats);

    console.log('✅ Incremental update completed');
    console.log(`📈 Scanned ${currentBlock - fromBlock + 1} new blocks`);
    console.log(`🏆 Found ${totalNewMedals} new medals`);
    console.log(`📊 New totals: Bronze=${medalCounts.bronze}, Silver=${medalCounts.silver}, Gold=${medalCounts.gold}, Black=${medalCounts.black}, Total=${medalCounts.total}`);

    return {
      success: true,
      blocksScanned: currentBlock - fromBlock + 1,
      newEvents: totalNewEvents,
      newMedals: totalNewMedals,
      totalMedals: medalCounts.total,
      lastIndexedBlock: currentBlock
    };

  } catch (error) {
    console.error('❌ Incremental update failed:', error);
    throw error;
  }
}

module.exports = async (req, res) => {
  try {
    // Verify this is a cron request (optional security check)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('⚠️  Unauthorized cron request (missing or invalid CRON_SECRET)');
      // Allow the update to proceed anyway for development
    }

    const result = await runIncrementalUpdate();

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    });

  } catch (error) {
    console.error('❌ Medal update cron failed:', error);

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};