// Analyze medals to find those from MEDAL-SPIN project
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");

const STACK_NFT_CONTRACT = "0x76d6aC90A62Ca547d51D7AcAeD014167F81B9931";

const abi = [
  {"inputs":[{"internalType":"uint256","name":"stackId","type":"uint256"}],"name":"getStackMedals","outputs":[{"components":[{"internalType":"address","name":"stackOwner","type":"address"},{"internalType":"uint256","name":"stackId","type":"uint256"},{"internalType":"bytes32","name":"medalUID","type":"bytes32"},{"internalType":"uint16","name":"medalTier","type":"uint16"},{"internalType":"bytes","name":"medalData","type":"bytes"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct ShapeMedalSchema[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"}
];

async function analyzeMedalSpinData() {
  const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';
  const stackId = "7628";
  
  console.log(`\n🎰 Analyzing MEDAL-SPIN medals for Stack #${stackId}\n`);

  const provider = new JsonRpcProvider(
    `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
    { name: 'shape-mainnet', chainId: 360 }
  );

  const contract = new ethers.Contract(STACK_NFT_CONTRACT, abi, provider);

  try {
    console.log("Fetching all medal data...");
    const medals = await contract.getStackMedals(stackId);
    console.log(`Total medals: ${medals.length}\n`);

    // Tier mapping (corrected based on our findings)
    const tierNames = {
      0: 'Unknown-0',
      1: 'Bronze',
      2: 'Silver', 
      3: 'Gold',
      4: 'Black/Obsidian'
    };

    // Count medals by project
    const medalSpinMedals = [];
    const otherMedals = [];
    const projectCounts = {};
    
    console.log("Analyzing medal metadata...\n");
    
    medals.forEach((medal, index) => {
      try {
        // medalData is bytes, need to decode it
        let metadata = {};
        
        // Try to decode as string first (JSON)
        try {
          const dataString = ethers.toUtf8String(medal.medalData);
          metadata = JSON.parse(dataString);
        } catch (e) {
          // If not JSON, try other decoding methods
          try {
            // Try decoding as ABI-encoded data
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
              ['string'], 
              medal.medalData
            );
            metadata = JSON.parse(decoded[0]);
          } catch (e2) {
            // Last resort - hex string
            metadata = { raw: medal.medalData };
          }
        }
        
        // Check for project_id
        const projectId = metadata.project_id || metadata.projectId || metadata.project || 'UNKNOWN';
        
        // Count by project
        projectCounts[projectId] = (projectCounts[projectId] || 0) + 1;
        
        // Separate MEDAL-SPIN medals
        if (projectId === 'MEDAL-SPIN' || projectId === 'Medal-Spin' || projectId === 'medal-spin') {
          medalSpinMedals.push({
            ...medal,
            metadata,
            tierName: tierNames[medal.medalTier] || `Tier-${medal.medalTier}`
          });
        } else {
          otherMedals.push({
            ...medal,
            metadata,
            projectId,
            tierName: tierNames[medal.medalTier] || `Tier-${medal.medalTier}`
          });
        }
        
        // Log first few to see structure
        if (index < 3) {
          console.log(`Sample Medal #${index + 1}:`);
          console.log(`  UID: ${medal.medalUID}`);
          console.log(`  Tier: ${medal.medalTier} (${tierNames[medal.medalTier]})`);
          console.log(`  Timestamp: ${new Date(Number(medal.timestamp) * 1000).toLocaleDateString()}`);
          console.log(`  Metadata:`, metadata);
          console.log();
        }
        
      } catch (error) {
        console.log(`  Error parsing medal ${index}: ${error.message}`);
      }
    });
    
    // Count MEDAL-SPIN medals by tier
    const spinMedalsByTier = {};
    medalSpinMedals.forEach(medal => {
      const tier = medal.tierName;
      spinMedalsByTier[tier] = (spinMedalsByTier[tier] || 0) + 1;
    });
    
    // Display results
    console.log("\n════════════════════════════════════════");
    console.log("MEDAL-SPIN PROJECT ANALYSIS");
    console.log("════════════════════════════════════════\n");
    
    console.log(`🎰 MEDAL-SPIN Medals: ${medalSpinMedals.length} / ${medals.length}`);
    console.log(`📊 Other Projects: ${otherMedals.length} / ${medals.length}\n`);
    
    if (medalSpinMedals.length > 0) {
      console.log("MEDAL-SPIN Breakdown by Tier:");
      Object.entries(spinMedalsByTier).forEach(([tier, count]) => {
        const emoji = tier.includes('Bronze') ? '🥉' : 
                     tier.includes('Silver') ? '🥈' : 
                     tier.includes('Gold') ? '🥇' : 
                     tier.includes('Black') || tier.includes('Obsidian') ? '⚫' : '❓';
        console.log(`  ${emoji} ${tier}: ${count}`);
      });
      
      // Calculate daily spin rate
      if (medalSpinMedals.length > 0) {
        const sortedSpinMedals = medalSpinMedals.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
        const firstSpin = new Date(Number(sortedSpinMedals[0].timestamp) * 1000);
        const lastSpin = new Date(Number(sortedSpinMedals[sortedSpinMedals.length - 1].timestamp) * 1000);
        const daysDiff = Math.floor((lastSpin - firstSpin) / (1000 * 60 * 60 * 24)) + 1;
        
        console.log(`\n📅 Spin History:`);
        console.log(`  First spin: ${firstSpin.toLocaleDateString()}`);
        console.log(`  Last spin: ${lastSpin.toLocaleDateString()}`);
        console.log(`  Days active: ${daysDiff}`);
        console.log(`  Spin rate: ${(medalSpinMedals.length / daysDiff * 100).toFixed(1)}%`);
      }
    }
    
    console.log("\n📊 All Projects Found:");
    Object.entries(projectCounts).sort((a, b) => b[1] - a[1]).forEach(([project, count]) => {
      console.log(`  ${project}: ${count} medals`);
    });
    
    // Overall tier breakdown
    const overallByTier = {
      1: 0, // Bronze
      2: 0, // Silver
      3: 0, // Gold
      4: 0  // Black
    };
    
    medals.forEach(medal => {
      if (overallByTier[medal.medalTier] !== undefined) {
        overallByTier[medal.medalTier]++;
      }
    });
    
    console.log("\n🏅 Overall Medal Distribution:");
    console.log(`  🥉 Bronze (Tier 1): ${overallByTier[1]}`);
    console.log(`  🥈 Silver (Tier 2): ${overallByTier[2]}`);
    console.log(`  🥇 Gold (Tier 3): ${overallByTier[3]}`);
    console.log(`  ⚫ Black (Tier 4): ${overallByTier[4]}`);

  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

analyzeMedalSpinData();