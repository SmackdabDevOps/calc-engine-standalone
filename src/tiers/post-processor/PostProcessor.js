/**
 * PostProcessor - Main orchestrator for Post-Processor tier
 * 
 * This is the final tier in the 3-tier architecture, responsible for:
 * 1. Ensuring idempotency through checksums
 * 2. Persisting calculation results to PostgreSQL database
 * 3. Emitting events to Pulsar/Kafka for downstream consumers
 * 4. Updating cache for performance optimization
 * 5. Recording metrics for monitoring
 * 6. Triggering webhooks for external integrations
 * 
 * CRITICAL: All operations after calculation must be atomic - either all succeed or all rollback
 * 
 * @version 1.0.0
 */

const IdempotencyChecker = require('./IdempotencyChecker');
const TransactionManager = require('./TransactionManager');
const DataPersister = require('./DataPersister');
const EventEmitter = require('./EventEmitter');
const CacheUpdater = require('./CacheUpdater');
const MetricsRecorder = require('./MetricsRecorder');
const WebhookTrigger = require('./WebhookTrigger');
const EventOutbox = require('./EventOutbox');

class PostProcessor {
  constructor(db, eventBus, cache, metrics) {
    // Database connection pool - required for all persistence operations
    // This should be the same pool used throughout the application to avoid connection exhaustion
    this.db = db;
    
    // Event bus for Pulsar/Kafka integration
    // If not provided, creates a local EventEmitter for testing
    // In production, this should be the actual Pulsar client configured in the main app
    this.eventBus = eventBus || new EventEmitter();
    
    // Cache instance (Redis/Dragonfly/Valkey in production, Map for testing)
    // Used to store calculation results for fast retrieval
    this.cache = cache;
    
    // Metrics collector for monitoring and alerting
    // Tracks performance, error rates, and business metrics
    this.metrics = metrics || new MetricsRecorder();
    
    // Initialize all sub-components with their dependencies
    // Each component handles a specific aspect of post-processing
    this.idempotencyChecker = new IdempotencyChecker();
    this.transactionManager = new TransactionManager(db);
    this.dataPersister = new DataPersister(db);
    this.cacheUpdater = new CacheUpdater(cache);
    this.webhookTrigger = new WebhookTrigger();
    
    // PRODUCTION FIX: Initialize transactional outbox for reliable event delivery
    this.eventOutbox = new EventOutbox(db, eventBus);
    // Start background processing for outbox events
    this.eventOutbox.startProcessing(5000); // Process every 5 seconds
  }
  
  /**
   * Main processing method - orchestrates all post-processing operations
   * 
   * @param {Object} result - The calculation result from Pure Engine containing:
   *   - checksum: SHA-256 hash for idempotency
   *   - subtotal: Base calculation amount
   *   - modifierTotal: Total of all modifiers applied
   *   - retailTax: Tax amount calculated
   *   - customerGrandTotal: Final amount customer pays
   *   - lineItems: Array of calculated line items
   *   - modifiers: Array of applied modifiers with their calculations
   * 
   * @param {Object} request - The original request containing:
   *   - proposalId: Unique identifier for the proposal
   *   - Any other metadata needed for persistence
   * 
   * @returns {Promise<Object>} The final result with persistence confirmation
   */
  async process(result, request) {
    const startTime = Date.now();
    
    try {
      // STEP 1: IDEMPOTENCY CHECK
      // Use the checksum from Pure Engine as idempotency key
      // This ensures that if the same calculation is submitted multiple times,
      // we return the cached result instead of re-processing
      // CRITICAL: This prevents duplicate database writes and event emissions
      const idempotencyKey = result.checksum;
      const existing = await this.idempotencyChecker.check(idempotencyKey);
      
      // If we've already processed this exact calculation, return cached result
      // This is crucial for handling retries and preventing duplicate side effects
      if (existing) {
        // Early return - no database writes, no events, no webhooks
        return existing;
      }
      
      // STEP 2: DATABASE TRANSACTION
      // All database operations must be wrapped in a transaction to ensure atomicity
      // If any operation fails, everything rolls back to maintain consistency
      const finalResult = await this.transactionManager.executeInTransaction(async (tx) => {
        
        // STEP 3: PERSIST TO DATABASE
        // Ensure proposalId is set (handle both camelCase and snake_case)
        // This is needed because different parts of the system may use different naming conventions
        result.proposalId = result.proposalId || request.proposalId || request.proposal_id;
        
        // Write calculation results to PostgreSQL
        // This uses UPSERT (INSERT ... ON CONFLICT) to handle concurrent writes safely
        // The database schema should have a unique constraint on (proposal_id, checksum)
        await this.dataPersister.persist(result);
        
        // STEP 4: EMIT DOMAIN EVENTS
        // PRODUCTION FIX: Use transactional outbox pattern for reliable event delivery
        // Events are written to outbox table within the transaction
        // Background processor will emit them after transaction commits
        // This ensures events are only published if database write succeeds
        await this.eventOutbox.publishWithinTransaction(tx, {
          type: 'calculation.completed',
          aggregateId: result.proposalId,
          payload: result,
          metadata: {
            checksum: result.checksum,
            timestamp: new Date().toISOString()
          }
        });
        
        // STEP 5: UPDATE CACHE
        // Store result in Redis/Dragonfly for fast retrieval
        // Uses checksum as key for consistency with idempotency check
        // TTL should be configured based on business requirements
        // Typical TTL: 1 hour for active calculations, 24 hours for completed
        await this.cacheUpdater.update(result);
        
        // STEP 6: RECORD METRICS
        // Track performance and business metrics for monitoring
        // These metrics are used for:
        //   - Performance monitoring (alert if calculations slow down)
        //   - Business analytics (track modifier usage patterns)
        //   - Capacity planning (understand system load)
        this.metrics.record('calculation', {
          duration: Date.now() - startTime,  // Total processing time in ms
          modifierCount: result.modifiers ? result.modifiers.length : 0,  // Number of modifiers applied
          proposalId: result.proposalId  // For tracing specific proposals
        });
        
        // STEP 7: TRIGGER WEBHOOKS
        // Call external systems that need real-time updates
        // Examples:
        //   - CRM system (update opportunity value)
        //   - ERP system (sync pricing data)
        //   - Partner APIs (notify of calculation changes)
        // Webhooks are fire-and-forget - failures don't rollback transaction
        await this.webhookTrigger.trigger('calculation', result);
        
        // Return the result to be stored for idempotency
        return result;
      });
      
      // STEP 8: STORE FOR FUTURE IDEMPOTENCY
      // After successful transaction, cache the result for idempotency
      // This must happen AFTER the transaction commits to avoid inconsistency
      // If transaction rolled back, we don't want to cache a failed result
      await this.idempotencyChecker.store(idempotencyKey, finalResult);
      
      // Return the final result with all post-processing complete
      return finalResult;
      
    } catch (error) {
      // Log error for debugging
      console.error('PostProcessor error:', error);
      
      // Record error metrics for alerting and monitoring
      // This helps identify patterns in failures:
      //   - Database connection issues
      //   - Event bus failures
      //   - Cache unavailability
      this.metrics.record('error', {
        type: 'post_processor',
        message: error.message,
        duration: Date.now() - startTime
      });
      
      // Re-throw error to caller
      // The orchestrator will handle this and potentially retry
      throw error;
    }
  }
  
  /**
   * Get aggregated metrics for monitoring dashboard
   * @returns {Object} Metrics object with counts, averages, and error rates
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }
}

module.exports = PostProcessor;