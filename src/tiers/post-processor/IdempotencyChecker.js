/**
 * IdempotencyChecker - Ensures idempotent operations
 * 
 * Critical component for preventing duplicate processing of calculations.
 * Uses SHA-256 checksums from the Pure Engine to guarantee that identical
 * inputs always produce identical outputs without re-processing.
 * 
 * In production, this should be backed by Redis/Dragonfly with appropriate TTL.
 * The current implementation uses an in-memory Map for testing.
 * 
 * IDEMPOTENCY STRATEGY:
 * 1. Each calculation generates a deterministic SHA-256 checksum
 * 2. Before processing, we check if this checksum exists
 * 3. If it exists, return the cached result (no side effects)
 * 4. If not, process and store the result for future checks
 * 
 * @version 1.0.0
 */

class IdempotencyChecker {
  constructor() {
    // In-memory cache for testing
    // Production should use Redis/Dragonfly with:
    //   - TTL of 24 hours for completed calculations
    //   - TTL of 1 hour for in-progress calculations
    //   - Automatic eviction on memory pressure
    this.cache = new Map();
  }
  
  /**
   * Check if a calculation has already been processed
   * 
   * @param {string} key - The SHA-256 checksum from Pure Engine
   * @returns {Promise<Object|null>} - The cached result if exists, null otherwise
   * 
   * CRITICAL: This check prevents:
   *   - Duplicate database writes
   *   - Duplicate event emissions to Pulsar
   *   - Duplicate webhook triggers
   *   - Unnecessary recalculations
   */
  async check(key) {
    // In production, this would be:
    // const result = await redis.get(key);
    // return result ? JSON.parse(result) : null;
    
    return this.cache.get(key) || null;
  }
  
  /**
   * Store a processed result for future idempotency checks
   * 
   * @param {string} key - The SHA-256 checksum from Pure Engine
   * @param {Object} result - The complete calculation result to cache
   * 
   * IMPORTANT: This should only be called AFTER successful transaction commit
   * If called before commit and transaction rolls back, we'd have inconsistent state
   */
  async store(key, result) {
    // In production, this would be:
    // await redis.setex(key, 86400, JSON.stringify(result)); // 24 hour TTL
    
    // Store in memory cache
    // Consider implementing LRU eviction if memory becomes a concern
    this.cache.set(key, result);
  }
  
  /**
   * Generate a namespaced key for Redis/cache storage
   * 
   * @param {string} checksum - The raw SHA-256 checksum
   * @returns {string} - Namespaced key like "idempotency:abc123..."
   * 
   * Namespacing prevents key collisions with other cache uses
   */
  generateKey(checksum) {
    // Namespace the key to avoid collisions with other cache uses
    // In production, might also include environment: `idempotency:prod:${checksum}`
    return `idempotency:${checksum}`;
  }
  
  /**
   * Clear all cached results - useful for testing
   * 
   * WARNING: In production, this should require admin privileges
   * and should log the action for audit purposes
   */
  clear() {
    // In production, this would be:
    // await redis.del(await redis.keys('idempotency:*'));
    
    this.cache.clear();
  }
}

module.exports = IdempotencyChecker;