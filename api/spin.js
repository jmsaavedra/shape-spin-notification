
require("dotenv").config();
const { ethers, JsonRpcProvider } = require("ethers");

// This is the ABI of the MedalSpin contract.
const abi = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"HashAlreadyCollected","type":"error"},{"inputs":[],"name":"InvalidTimestamps","type":"error"},{"inputs":[],"name":"SpinTooSoon","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"collector","type":"address"},{"indexed":false,"internalType":"bytes32","name":"hash","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"Spin","type":"event"},{"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"canSpin","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"}],"name":"getCollector","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"collector","type":"address"}],"name":"getSpins","outputs":[{"components":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct SpinInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"}],"name":"spin","outputs":[],"stateMutability":"nonpayable","type":"function"}];

// The address of the deployed MedalSpin contract.
const contractAddress = "0x99BB9Dca4F8Ed3FB04eCBE2bA9f5f378301DBaC1";

// We will use a public provider for this example. For a production environment,
// it's recommended to use a dedicated provider like Infura or Alchemy.
const provider = new JsonRpcProvider("https://shape-mainnet.g.alchemy.com/public", {
    name: 'shape-mainnet',
    chainId: 360
});

module.exports = async (req, res) => {
  // We will add a simple security measure to prevent unauthorized access.
  // In a production environment, you should use a more robust authentication mechanism.
  

  // The spin logic is now directly in the handler.
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
      const fiveMinutes = BigInt(5 * 60);
      const twentyFourHours = BigInt(24 * 60 * 60);
      const timeSinceLastSpin = BigInt(Math.floor(Date.now() / 1000)) - lastSpinTimestamp;

      if (timeSinceLastSpin < twentyFourHours + fiveMinutes) {
        console.log("Not time to spin yet.");
        res.status(200).send("Not time to spin yet.");
        return;
      }
    }

    console.log("Attempting to send spin transaction...");
    // Generate a random hash.
    const hash = ethers.utils.randomBytes(32);

    // Call the spin function.
    const tx = await contract.spin(hash);
    console.log(`Spin transaction sent! View on ShapeScan: https://shapescan.xyz/tx/${tx.hash}`);

    // Wait for the transaction to be mined.
    const receipt = await tx.wait();
    console.log(`Spin transaction mined! Block number: ${receipt.blockNumber}`);
    res.status(200).send("Spin process initiated and transaction mined.");

  } catch (error) {
    console.error("Error spinning:", error);
    res.status(500).send(`Error spinning: ${error.message}`);
  }
};

