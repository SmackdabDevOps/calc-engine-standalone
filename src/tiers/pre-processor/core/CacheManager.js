/**
 * CacheManager - Handles cache operations for Pre-Processor tier
 * 
 * Features:
 * - TTL support for automatic expiration
 * - Pattern-based invalidation
 * - LRU eviction when size limit reached
 * - Hit/miss statistics tracking
 * 
 * @version 1.0.0
 */

class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttlMap = new Map(); // Store expiration times
    this.accessOrder = []; // Track access order for LRU
    this.maxSize = options.maxSize || Infinity;
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }
  
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached value or null
   */
  async get(key) {
    if (!key) {
      this.stats.misses++;
      return null;
    }
    
    // Check if exists and not expired
    if (this.cache.has(key)) {
      const ttl = this.ttlMap.get(key);
      
      // Check TTL expiration
      if (ttl && Date.now() > ttl) {
        // Expired - remove it
        this.cache.delete(key);
        this.ttlMap.delete(key);
        this.stats.misses++;
        return null;
      }
      
      // Update access order for LRU
      this.updateAccessOrder(key);
      
      this.stats.hits++;
      return this.cache.get(key);
    }
    
    this.stats.misses++;
    return null;
  }
  
  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    if (!key) {
      return;
    }
    
    // Check if we need to evict for size limit
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, value);
    
    // Set TTL if provided
    if (ttl && ttl > 0) {
      this.ttlMap.set(key, Date.now() + ttl);
    } else {
      // Remove any existing TTL
      this.ttlMap.delete(key);
    }
    
    // Update access order
    this.updateAccessOrder(key);
    
    this.stats.sets++;
  }
  
  /**
   * Invalidate keys matching pattern
   * @param {string} pattern - Pattern to match (supports * wildcard)
   * @returns {Promise<void>}
   */
  async invalidate(pattern) {
    if (!pattern) {
      return;
    }
    
    // Convert pattern to regex
    const regex = this.patternToRegex(pattern);
    
    // Find and delete matching keys
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete matched keys
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.ttlMap.delete(key);
      this.removeFromAccessOrder(key);
    }
  }
  
  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.ttlMap.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }
  
  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size
    };
  }
  
  /**
   * Convert wildcard pattern to regex
   * @private
   */
  patternToRegex(pattern) {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with .*
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`);
  }
  
  /**
   * Update access order for LRU tracking
   * @private
   */
  updateAccessOrder(key) {
    // Remove from current position
    this.removeFromAccessOrder(key);
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }
  
  /**
   * Remove key from access order
   * @private
   */
  removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
  
  /**
   * Evict least recently used item
   * @private
   */
  evictLRU() {
    if (this.accessOrder.length > 0) {
      const lruKey = this.accessOrder[0];
      this.cache.delete(lruKey);
      this.ttlMap.delete(lruKey);
      this.accessOrder.shift();
      this.stats.evictions++;
    }
  }
}

module.exports = CacheManager;