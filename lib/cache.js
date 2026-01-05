// In-memory cache with TTL support for reducing Alchemy API calls
class Cache {
  constructor() {
    this.store = new Map();
  }

  // Set a value with optional TTL (in milliseconds)
  set(key, value, ttlMs = null) {
    const entry = {
      value,
      expires: ttlMs ? Date.now() + ttlMs : null
    };
    this.store.set(key, entry);
  }

  // Get a value if it exists and hasn't expired
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (entry.expires && Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    
    return entry.value;
  }

  // Check if a key exists and is valid
  has(key) {
    return this.get(key) !== null;
  }

  // Clear expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expires && now > entry.expires) {
        this.store.delete(key);
      }
    }
  }

  // Clear all cache
  clear() {
    this.store.clear();
  }

  // Get cache stats
  stats() {
    this.cleanup();
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys())
    };
  }
}

// Singleton cache instances for different data types
const caches = {
  ens: new Cache(),        // ENS names - 30 day TTL
  spins: new Cache(),      // Historical spins - permanent until new spin
  contracts: new Cache(),  // Contract instances - 1 hour TTL
  responses: new Cache()   // API response cache - short TTL for rate limit protection
};

// TTL constants
const TTL = {
  ENS: 30 * 24 * 60 * 60 * 1000,      // 30 days
  CONTRACT: 60 * 60 * 1000,            // 1 hour
  RESPONSE_SHORT: 30 * 1000,           // 30 seconds - for repeated identical requests
  RESPONSE_MEDIUM: 60 * 1000,          // 1 minute - for wallet status when can't spin
  RESPONSE_LONG: 5 * 60 * 1000,        // 5 minutes - for static data
};

/**
 * Get cached response or execute function and cache result
 * @param {string} key - Cache key
 * @param {Function} fn - Async function to execute if not cached
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise} Cached or fresh result
 */
async function getOrSet(key, fn, ttl = TTL.RESPONSE_SHORT) {
  const cached = caches.responses.get(key);
  if (cached !== null) {
    return { data: cached, fromCache: true };
  }

  const result = await fn();
  caches.responses.set(key, result, ttl);
  return { data: result, fromCache: false };
}

// Periodic cleanup every 5 minutes
setInterval(() => {
  Object.values(caches).forEach(cache => cache.cleanup());
}, 5 * 60 * 1000);

module.exports = {
  caches,
  TTL,
  getOrSet
};