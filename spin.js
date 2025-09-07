
require("dotenv").config();
const ethers = require("ethers");

// This is the ABI of the MedalSpin contract.
const abi = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"HashAlreadyCollected","type":"error"},{"inputs":[],"name":"InvalidTimestamps","type":"error"},{"inputs":[],"name":"SpinTooSoon","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"collector","type":"address"},{"indexed":false,"internalType":"bytes32","name":"hash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"Spin","type":"event"},{"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"canSpin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"}],"name":"getCollector","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"}],"name":"spin","outputs":[],"stateMutability":"nonpayable","type":"function"}];

// The address of the deployed MedalSpin contract.
const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

// We will use a public provider for this example. For a production environment,
// it's recommended to use a dedicated provider like Infura or Alchemy.
const provider = new ethers.providers.JsonRpcProvider("https://rpc.ankr.com/eth");

// This is the function that will be called by the cron job.
async function spin() {
  try {
    // We are using a placeholder for the private key. In a real application,
    // this should be stored securely as an environment variable.
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is not set.");
    }

    const wallet = new ethers.Wallet(privateKey, provider);

    const contract = new ethers.Contract(contractAddress, abi, wallet);

    const spins = await contract.getSpins(wallet.address);

    if (spins.length > 0) {
      const lastSpinTimestamp = spins[spins.length - 1].timestamp;
      const fiveMinutes = 5 * 60;
      const twentyFourHours = 24 * 60 * 60;
      const timeSinceLastSpin = Math.floor(Date.now() / 1000) - lastSpinTimestamp;

      if (timeSinceLastSpin < twentyFourHours + fiveMinutes) {
        console.log("Not time to spin yet.");
        return;
      }
    }

    // Generate a random hash.
    const hash = ethers.utils.randomBytes(32);

    // Call the spin function.
    const tx = await contract.spin(hash);
    console.log(`Spin transaction sent! View on ShapeScan: https://shapescan.xyz/tx/${tx.hash}`);

    // Wait for the transaction to be mined.
    const receipt = await tx.wait();
    console.log(`Spin transaction mined! Block number: ${receipt.blockNumber}`);
  } catch (error) {
    console.error("Error spinning:", error);
  }
}

// We will create a simple Express server to expose the spin function as an endpoint.
// This endpoint can be triggered by a cron job on Vercel or Railway.
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get("/spin", async (req, res) => {
  // We will add a simple security measure to prevent unauthorized access.
  // In a production environment, you should use a more robust authentication mechanism.
  const secret = req.query.secret;
  if (secret !== process.env.SPIN_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  // Add a fixed delay of 5 minutes to ensure the 24-hour cooldown is met.
  const delay = 5 * 60 * 1000;
  console.log(`Waiting for ${delay / 1000 / 60} minutes before spinning...`);

  await new Promise(resolve => setTimeout(resolve, delay));

  await spin();
  res.send("Spin process initiated.");
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

