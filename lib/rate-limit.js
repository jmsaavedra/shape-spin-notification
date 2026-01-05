// Rate limiting for API endpoints
// Prevents abuse from bots/scripts polling too frequently

class RateLimiter {
  constructor() {
    // Track requests by key (IP or wallet address)
    this.requests = new Map(); // key -> { count, windowStart, blocked }

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a request should be rate limited
   * @param {string} key - Identifier (IP address or wallet)
   * @param {Object} options - Rate limit options
   * @returns {Object} { allowed, remaining, resetIn, cached }
   */
  check(key, options = {}) {
    const {
      windowMs = 60000,      // 1 minute window
      maxRequests = 10,      // Max requests per window
      blockDurationMs = 300000 // 5 minute block for abusers
    } = options;

    const now = Date.now();
    let entry = this.requests.get(key);

    // Initialize new entry
    if (!entry) {
      entry = {
        count: 0,
        windowStart: now,
        blocked: false,
        blockedUntil: 0
      };
      this.requests.set(key, entry);
    }

    // Check if currently blocked
    if (entry.blocked && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: Math.ceil((entry.blockedUntil - now) / 1000),
        blocked: true,
        reason: 'Too many requests. Please try again later.'
      };
    }

    // Reset block if expired
    if (entry.blocked && now >= entry.blockedUntil) {
      entry.blocked = false;
      entry.blockedUntil = 0;
      entry.count = 0;
      entry.windowStart = now;
    }

    // Reset window if expired
    if (now - entry.windowStart >= windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }

    // Increment count
    entry.count++;

    // Check if over limit
    if (entry.count > maxRequests) {
      // Block for repeated abuse (more than 2x the limit)
      if (entry.count > maxRequests * 2) {
        entry.blocked = true;
        entry.blockedUntil = now + blockDurationMs;
        console.warn(`[RateLimit] Blocked ${key} for ${blockDurationMs / 1000}s (${entry.count} requests)`);
      }

      return {
        allowed: false,
        remaining: 0,
        resetIn: Math.ceil((entry.windowStart + windowMs - now) / 1000),
        blocked: entry.blocked,
        reason: 'Rate limit exceeded. Please slow down.'
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetIn: Math.ceil((entry.windowStart + windowMs - now) / 1000),
      blocked: false
    };
  }

  /**
   * Get request key from request object
   * Combines IP and wallet address for more granular limiting
   */
  getKey(req, walletAddress = null) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               'unknown';

    if (walletAddress) {
      return `${ip}:${walletAddress.toLowerCase()}`;
    }
    return ip;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [key, entry] of this.requests.entries()) {
      // Remove entries that haven't been accessed in maxAge
      if (now - entry.windowStart > maxAge && !entry.blocked) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Get stats about rate limiting
   */
  stats() {
    const entries = Array.from(this.requests.entries());
    const blocked = entries.filter(([_, e]) => e.blocked).length;
    return {
      totalTracked: entries.length,
      blocked,
      topRequesters: entries
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([key, entry]) => ({
          key: key.substring(0, 20) + '...',
          count: entry.count,
          blocked: entry.blocked
        }))
    };
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Rate limiting middleware for Vercel serverless functions
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} options - Rate limit options
 * @returns {boolean} true if request is allowed, false if rate limited
 */
function checkRateLimit(req, res, options = {}) {
  const walletAddress = req.query?.address || null;
  const key = rateLimiter.getKey(req, walletAddress);

  const result = rateLimiter.check(key, options);

  // Add rate limit headers
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetIn);

  if (!result.allowed) {
    res.setHeader('Retry-After', result.resetIn);
    return false;
  }

  return true;
}

/**
 * Create a rate limit response
 */
function rateLimitResponse(res, result) {
  res.status(429).json({
    error: result.reason || 'Rate limit exceeded',
    retryAfter: result.resetIn,
    blocked: result.blocked
  });
}

module.exports = {
  rateLimiter,
  checkRateLimit,
  rateLimitResponse
};
