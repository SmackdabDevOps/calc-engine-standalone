/**
 * CalculationStateManager - Handles state management, caching, and concurrency
 * 
 * CRITICAL INFRASTRUCTURE: Bridges Pure Engine with stateful operations
 * Part of Phase 2: State Management from Mathematical Correctness Plan
 * 
 * KEY RESPONSIBILITIES:
 * 1. CACHING: Two-tier cache (proposal + idempotency)
 * 2. CONCURRENCY: PostgreSQL advisory locks prevent race conditions
 * 3. IDEMPOTENCY: SHA-256 based deduplication of identical requests
 * 4. EVENT SOURCING: Transactional outbox pattern for reliable events
 * 5. INVALIDATION: Reactive cache clearing on data changes
 * 
 * CACHE STRATEGY:
 * - L1: Idempotency cache (by input hash) - prevents duplicate calculations
 * - L2: Proposal cache (by ID + version) - speeds up repeated requests
 * - Both use in-memory Map (production would use Redis)
 * 
 * CONCURRENCY CONTROL:
 * Uses PostgreSQL advisory locks to ensure only one calculation
 * per proposal happens at a time, preventing:
 * - Race conditions on concurrent updates
 * - Duplicate database writes
 * - Inconsistent state
 * 
 * TRANSACTIONAL OUTBOX:
 * Events are written to database table in same transaction as results,
 * ensuring events are never lost even if message broker is down.
 * A separate process reads outbox and publishes to Pulsar/Kafka.
 * 
 * @version 1.0.0
 * @implements StateManagementPolicy
 */

const crypto = require('crypto');

class CalculationStateManager {
  constructor(db, engine) {
    this.db = db;                    // PostgreSQL connection pool
    this.engine = engine;            // Pure calculation engine instance
    this.cache = new Map();          // Proposal-level cache
    this.idempotencyCache = new Map(); // Input-hash-level cache
    this.engineVersion = engine.version; // Track engine version for cache invalidation
  }

  /**
   * Get or calculate with idempotency
   */
  async getOrCalculate(proposalId, input) {
    // Generate input hash for idempotency
    const inputHash = this.engine.generateInputHash(input);
    const idempotencyKey = this.engine.generateIdempotencyKey(inputHash);
    
    // Check idempotency cache first
    if (this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey);
    }
    
    // Check proposal cache
    const cacheKey = `${proposalId}:v${this.engineVersion}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Store in idempotency cache too
      this.idempotencyCache.set(idempotencyKey, cached);
      return cached;
    }
    
    // Calculate and persist with lock
    const result = await this.calculateWithLock(proposalId, input, idempotencyKey);
    
    // Cache the result
    this.cache.set(cacheKey, result);
    this.idempotencyCache.set(idempotencyKey, result);
    
    return result;
  }

  /**
   * Calculate with database lock for concurrency control
   */
  async calculateWithLock(proposalId, input, idempotencyKey) {
    // Step 1: Perform pure calculation (no lock needed)
    const result = this.engine.calculate(input);
    
    // Step 2: Persist with lock
    let lock = null;
    try {
      // Acquire proposal lock
      lock = await this.acquireProposalLock(proposalId);
      
      // Check again for idempotency (double-check pattern)
      const existing = await this.getStoredCalculation(idempotencyKey);
      if (existing) {
        return existing;
      }
      
      // Persist calculation and events in transaction
      await this.persistWithOutbox(proposalId, idempotencyKey, result);
      
      return result;
    } finally {
      if (lock) {
        await this.releaseProposalLock(lock);
      }
    }
  }

  /**
   * Persist calculation with transactional outbox
   */
  async persistWithOutbox(proposalId, idempotencyKey, result) {
    const client = await this.db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 1. Store calculation result
      await client.query(
        `INSERT INTO calculations (
          idempotency_key,
          proposal_id,
          engine_version,
          result,
          created_at
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (idempotency_key) DO NOTHING`,
        [idempotencyKey, proposalId, this.engineVersion, JSON.stringify(result)]
      );
      
      // 2. Insert event to outbox
      await client.query(
        `INSERT INTO outbox_events (
          event_type,
          aggregate_id,
          payload,
          created_at
        ) VALUES ($1, $2, $3, NOW())`,
        ['CalculationCompleted', proposalId, JSON.stringify({
          proposalId,
          idempotencyKey,
          engineVersion: this.engineVersion,
          result
        })]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Invalidate cache for a proposal
   */
  invalidateProposal(proposalId) {
    const cacheKey = `${proposalId}:v${this.engineVersion}`;
    this.cache.delete(cacheKey);
    
    // Also clear related idempotency entries
    // In production, this would be more sophisticated
    for (const [key, value] of this.idempotencyCache.entries()) {
      if (value.proposalId === proposalId) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  /**
   * Invalidate cache for multiple proposals
   */
  invalidateProposals(proposalIds) {
    proposalIds.forEach(id => this.invalidateProposal(id));
  }

  /**
   * Handle modifier change event
   */
  onModifierChange(proposalId) {
    this.invalidateProposal(proposalId);
  }

  /**
   * Handle line item change event
   */
  onLineItemChange(proposalId) {
    this.invalidateProposal(proposalId);
  }

  /**
   * Handle rule change event (affects multiple proposals)
   */
  onRuleChange(affectedProposalIds) {
    this.invalidateProposals(affectedProposalIds);
  }

  /**
   * Acquire database lock for proposal
   */
  async acquireProposalLock(proposalId) {
    const client = await this.db.getClient();
    
    // Use PostgreSQL advisory lock
    const lockId = this.hashToInt(proposalId);
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    
    return {
      proposalId,
      lockId,
      client
    };
  }

  /**
   * Release database lock
   */
  async releaseProposalLock(lock) {
    try {
      await lock.client.query('SELECT pg_advisory_unlock($1)', [lock.lockId]);
    } finally {
      lock.client.release();
    }
  }

  /**
   * Get stored calculation by idempotency key
   */
  async getStoredCalculation(idempotencyKey) {
    const result = await this.db.query(
      'SELECT result FROM calculations WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    
    if (result.rows.length > 0) {
      return JSON.parse(result.rows[0].result);
    }
    
    return null;
  }

  /**
   * Hash string to integer for advisory lock
   */
  hashToInt(str) {
    const hash = crypto.createHash('md5').update(str).digest();
    return Math.abs(hash.readInt32BE(0));
  }

  /**
   * Clear all caches (for testing)
   */
  clearCache() {
    this.cache.clear();
    this.idempotencyCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      proposalCacheSize: this.cache.size,
      idempotencyCacheSize: this.idempotencyCache.size,
      engineVersion: this.engineVersion
    };
  }
}

module.exports = CalculationStateManager;