// Multicall implementation for batching contract calls
const { ethers } = require("ethers");

// Multicall3 is deployed on most chains at this address
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Multicall3 ABI (only the functions we need)
const MULTICALL3_ABI = [
  {
    "inputs": [
      {
        "components": [
          {"internalType": "address", "name": "target", "type": "address"},
          {"internalType": "bool", "name": "allowFailure", "type": "bool"},
          {"internalType": "bytes", "name": "callData", "type": "bytes"}
        ],
        "internalType": "struct Multicall3.Call3[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate3",
    "outputs": [
      {
        "components": [
          {"internalType": "bool", "name": "success", "type": "bool"},
          {"internalType": "bytes", "name": "returnData", "type": "bytes"}
        ],
        "internalType": "struct Multicall3.Result[]",
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

/**
 * Batch multiple contract calls into a single RPC request using Multicall3
 * @param {Array} calls - Array of {contract, method, args} objects
 * @param {ethers.Provider} provider - Ethereum provider
 * @returns {Array} Array of decoded results
 */
async function batchContractCalls(calls, provider) {
  try {
    // Check if Multicall3 exists on this chain
    const code = await provider.getCode(MULTICALL3_ADDRESS);
    if (code === "0x") {
      console.log("Multicall3 not deployed on this chain, falling back to parallel calls");
      return Promise.all(calls.map(call => 
        call.contract[call.method](...(call.args || []))
      ));
    }

    const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    
    // Prepare call data
    const call3s = calls.map(call => {
      const iface = call.contract.interface;
      const callData = iface.encodeFunctionData(call.method, call.args || []);
      
      return {
        target: call.contract.address,
        allowFailure: false,
        callData: callData
      };
    });
    
    // Execute multicall
    const results = await multicall.aggregate3(call3s);
    
    // Decode results
    return results.map((result, index) => {
      if (!result.success) {
        throw new Error(`Call ${index} failed`);
      }
      
      const call = calls[index];
      const iface = call.contract.interface;
      const decoded = iface.decodeFunctionResult(call.method, result.returnData);
      
      // Return the first element if it's a single return value
      return decoded.length === 1 ? decoded[0] : decoded;
    });
  } catch (error) {
    console.error("Multicall failed, falling back to parallel calls:", error.message);
    // Fallback to parallel calls
    return Promise.all(calls.map(call => 
      call.contract[call.method](...(call.args || []))
    ));
  }
}

/**
 * Batch JSON-RPC requests to Alchemy
 * @param {Array} requests - Array of JSON-RPC request objects
 * @param {string} rpcUrl - Alchemy RPC URL
 * @returns {Array} Array of responses
 */
async function batchJsonRpcRequests(requests, rpcUrl) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requests.map((req, i) => ({
      jsonrpc: '2.0',
      id: i + 1,
      ...req
    })))
  });
  
  const results = await response.json();
  
  // Sort by ID and extract results
  results.sort((a, b) => a.id - b.id);
  return results.map(r => {
    if (r.error) throw new Error(r.error.message);
    return r.result;
  });
}

module.exports = {
  batchContractCalls,
  batchJsonRpcRequests,
  MULTICALL3_ADDRESS
};