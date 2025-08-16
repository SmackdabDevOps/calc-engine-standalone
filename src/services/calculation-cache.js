/**
 * CalculationCache - L2 Cache Implementation
 * 
 * Two-tier caching system for calculation results:
 * - L1: In-process Map (fast, limited size)
 * - L2: Redis/Dragonfly/Valkey (persistent, shared)
 * 
 * Features:
 * - Version-based cache keys
 * - Automatic L1→L2 promotion
 * - Cache invalidation by proposal
 * - Hit/miss metrics
 * - Graceful degradation on L2 failure
 */

class CalculationCache {
  constructor(l2Client = null) {
    // L1 cache (in-process)
    this.l1Cache = new Map();
    this.maxL1Size = parseInt(process.env.CALC_CACHE_L1_MAX_SIZE || '100');
    
    // L2 cache client (Redis/Dragonfly/Valkey)
    this.l2Client = l2Client;
    
    // Metrics
    this.metrics = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0
    };
  }

  /**
   * Generate cache key for proposal+version
   * @param {string} proposalId - Proposal ID
   * @param {number} version - Proposal version
   * @returns {string} Cache key
   */
  getCacheKey(proposalId, version) {
    const v = version || 1;
    return `calc:${proposalId}:${v}`;
  }

  /**
   * Get calculation result from cache
   * @param {string} proposalId - Proposal ID
   * @param {number} version - Proposal version
   * @returns {Promise<Object|null>} Cached result or null
   */
  async get(proposalId, version) {
    const key = this.getCacheKey(proposalId, version);
    
    // Check L1 first
    if (this.l1Cache.has(key)) {
      this.metrics.l1Hits++;
      return this.l1Cache.get(key);
    }
    
    this.metrics.l1Misses++;
    
    // Check L2 if available
    if (this.l2Client) {
      try {
        const l2Result = await this.l2Client.get(key);
        if (l2Result) {
          this.metrics.l2Hits++;
          const parsed = JSON.parse(l2Result);
          
          // Promote to L1
          this._setL1(key, parsed);
          
          return parsed;
        }
      } catch (error) {
        console.error(`L2 cache get error for ${key}:`, error.message);
      }
    }
    
    this.metrics.l2Misses++;
    return null;
  }

  /**
   * Set calculation result in cache
   * @param {string} proposalId - Proposal ID
   * @param {number} version - Proposal version
   * @param {Object} result - Calculation result
   * @param {number} ttl - TTL in seconds (default: 300)
   */
  async set(proposalId, version, result, ttl = 300) {
    const key = this.getCacheKey(proposalId, version);
    
    // Set in L1
    this._setL1(key, result);
    
    // Set in L2 if available
    if (this.l2Client) {
      try {
        await this.l2Client.setex(key, ttl, JSON.stringify(result));
      } catch (error) {
        console.error(`L2 cache set error for ${key}:`, error.message);
      }
    }
  }

  /**
   * Invalidate all cached versions of a proposal
   * @param {string} proposalId - Proposal ID
   */
  async invalidate(proposalId) {
    const pattern = `calc:${proposalId}:`;
    
    // Clear from L1
    const keysToDelete = [];
    for (const key of this.l1Cache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.l1Cache.delete(key));
    
    // Clear from L2
    if (this.l2Client) {
      try {
        const l2Keys = await this.l2Client.keys(`${pattern}*`);
        if (l2Keys && l2Keys.length > 0) {
          await this.l2Client.del(...l2Keys);
        }
      } catch (error) {
        console.error(`L2 cache invalidation error for ${proposalId}:`, error.message);
      }
    }
  }

  /**
   * Set value in L1 cache with size management
   * @private
   */
  _setL1(key, value) {
    // Evict oldest if at max size
    if (this.l1Cache.size >= this.maxL1Size) {
      const firstKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(firstKey);
    }
    
    this.l1Cache.set(key, value);
  }

  /**
   * Get cache metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    const l1Total = this.metrics.l1Hits + this.metrics.l1Misses;
    const l2Total = this.metrics.l2Hits + this.metrics.l2Misses;
    
    return {
      l1Hits: this.metrics.l1Hits,
      l1Misses: this.metrics.l1Misses,
      l1HitRate: l1Total > 0 ? this.metrics.l1Hits / l1Total : 0,
      l2Hits: this.metrics.l2Hits,
      l2Misses: this.metrics.l2Misses,
      l2HitRate: l2Total > 0 ? this.metrics.l2Hits / l2Total : 0,
      l1Size: this.l1Cache.size,
      maxL1Size: this.maxL1Size
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0
    };
  }

  /**
   * Clear all caches
   */
  async clear() {
    this.l1Cache.clear();
    
    if (this.l2Client) {
      try {
        const keys = await this.l2Client.keys('calc:*');
        if (keys && keys.length > 0) {
          await this.l2Client.del(...keys);
        }
      } catch (error) {
        console.error('L2 cache clear error:', error.message);
      }
    }
    
    this.resetMetrics();
  }
}

module.exports = CalculationCache;