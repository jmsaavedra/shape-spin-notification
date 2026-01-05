// Fallback RPC provider with automatic failover for Shape network
const { ethers, JsonRpcProvider } = require("ethers");

const alchemyApiKey = process.env.ALCHEMY_API_KEY || 'public';

// RPC endpoints in order of preference
const RPC_ENDPOINTS = [
  {
    name: 'Alchemy',
    url: `https://shape-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
    priority: 1
  },
  {
    name: 'Shape Official',
    url: 'https://mainnet.shape.network',
    priority: 2
  },
  {
    name: 'Thirdweb',
    url: 'https://360.rpc.thirdweb.com',
    priority: 3
  },
  {
    name: 'Alchemy Public',
    url: 'https://shape-mainnet.g.alchemy.com/public',
    priority: 4
  }
];

// Track failed providers to avoid retrying too soon
const failedProviders = new Map(); // url -> timestamp of last failure
const FAILURE_COOLDOWN_MS = 60000; // 1 minute cooldown for failed providers

// Network configuration for Shape
const SHAPE_NETWORK = {
  name: 'shape-mainnet',
  chainId: 360
};

/**
 * Create a provider with timeout and error handling
 */
function createProvider(rpcUrl) {
  return new JsonRpcProvider(rpcUrl, SHAPE_NETWORK, {
    staticNetwork: true,
    batchMaxCount: 1 // Disable batching to avoid issues with some providers
  });
}

/**
 * Check if a provider is in cooldown after a failure
 */
function isInCooldown(url) {
  const failTime = failedProviders.get(url);
  if (!failTime) return false;

  if (Date.now() - failTime > FAILURE_COOLDOWN_MS) {
    failedProviders.delete(url);
    return false;
  }
  return true;
}

/**
 * Mark a provider as failed
 */
function markFailed(url) {
  failedProviders.set(url, Date.now());
  console.warn(`[Provider] Marked ${url} as failed, cooldown for ${FAILURE_COOLDOWN_MS / 1000}s`);
}

/**
 * Get a working provider, trying fallbacks if needed
 */
async function getProvider() {
  // Sort by priority and filter out cooled-down providers
  const availableEndpoints = RPC_ENDPOINTS
    .filter(ep => !isInCooldown(ep.url))
    .sort((a, b) => a.priority - b.priority);

  if (availableEndpoints.length === 0) {
    // All providers failed recently, try the primary anyway
    console.warn('[Provider] All providers in cooldown, trying primary...');
    return createProvider(RPC_ENDPOINTS[0].url);
  }

  return createProvider(availableEndpoints[0].url);
}

/**
 * Execute an RPC call with automatic fallback
 * @param {Function} operation - Async function that takes a provider and returns a result
 * @param {Object} options - Options for the operation
 * @returns {Promise} Result of the operation
 */
async function withFallback(operation, options = {}) {
  const { timeout = 10000, retries = 3 } = options;

  // Sort by priority and filter out cooled-down providers
  const availableEndpoints = RPC_ENDPOINTS
    .filter(ep => !isInCooldown(ep.url))
    .sort((a, b) => a.priority - b.priority);

  // If all in cooldown, use all of them anyway
  const endpoints = availableEndpoints.length > 0
    ? availableEndpoints
    : RPC_ENDPOINTS.sort((a, b) => a.priority - b.priority);

  let lastError = null;

  for (const endpoint of endpoints) {
    const provider = createProvider(endpoint.url);

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
      });

      // Race the operation against the timeout
      const result = await Promise.race([
        operation(provider),
        timeoutPromise
      ]);

      return result;
    } catch (error) {
      lastError = error;

      // Check if it's a rate limit error (429)
      const is429 = error.message?.includes('429') ||
                    error.message?.includes('capacity limit') ||
                    error.message?.includes('rate limit') ||
                    error.code === 429;

      if (is429) {
        console.warn(`[Provider] Rate limited by ${endpoint.name}, trying fallback...`);
        markFailed(endpoint.url);
      } else if (error.message?.includes('Timeout')) {
        console.warn(`[Provider] Timeout from ${endpoint.name}, trying fallback...`);
        markFailed(endpoint.url);
      } else {
        console.warn(`[Provider] Error from ${endpoint.name}: ${error.message}`);
      }

      // Continue to next provider
      continue;
    }
  }

  // All providers failed
  throw lastError || new Error('All RPC providers failed');
}

/**
 * Create a provider-agnostic contract that uses fallback
 * This wraps contract calls to automatically retry with different providers
 */
function createResilientContract(address, abi) {
  return {
    address,
    abi,

    async call(method, ...args) {
      return withFallback(async (provider) => {
        const contract = new ethers.Contract(address, abi, provider);
        return contract[method](...args);
      });
    }
  };
}

// Export a default provider for simple use cases
const defaultProvider = createProvider(RPC_ENDPOINTS[0].url);

module.exports = {
  getProvider,
  withFallback,
  createProvider,
  createResilientContract,
  defaultProvider,
  RPC_ENDPOINTS,
  SHAPE_NETWORK,
  markFailed,
  isInCooldown
};
