/**
 * PreProcessor - Central orchestrator for Tier 1 (Pre-Processor)
 * 
 * TIER 1 RESPONSIBILITIES:
 * The Pre-Processor tier handles all data preparation and context building
 * before the Pure Engine performs mathematical calculations.
 * 
 * KEY FUNCTIONS:
 * 1. DATA FETCHING: Retrieve line items, modifiers, rules from PostgreSQL
 * 2. CACHE MANAGEMENT: Check for cached results to avoid recalculation
 * 3. INPUT NORMALIZATION: Standardize and validate all input data
 * 4. CONTEXT BUILDING: Assemble complete calculation context
 * 5. RULE COMPILATION: Parse and prepare modifier rules for execution
 * 6. DELTA OPTIMIZATION: Apply incremental changes when possible
 * 7. IMMUTABILITY: Freeze objects to prevent Pure Engine side effects
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Intelligent caching with SHA-256 keys
 * - Delta change detection for incremental updates
 * - Batch data fetching to minimize database round trips
 * - Rule compilation caching for repeated modifier patterns
 * - Context builder optimization for common proposal structures
 * 
 * FLOW DIAGRAM:
 * Request → Hash → Cache Check → [HIT: Return] → [MISS: Fetch Data] → 
 * Normalize → Build Context → Compile Rules → Freeze → Return to Pure Engine
 * 
 * ERROR HANDLING:
 * - Database connection failures: Graceful degradation
 * - Cache unavailability: Fallback to full processing
 * - Invalid input data: Early validation with descriptive errors
 * - Rule compilation errors: Detailed syntax error reporting
 * 
 * @version 1.0.0
 * @implements Mathematical Correctness Plan - Tier 1
 */

const CacheManager = require('./core/CacheManager');
const DataFetcher = require('./core/DataFetcher');
const RuleCompiler = require('./core/RuleCompiler');
const PathExtractor = require('./core/PathExtractor');
const ContextBuilder = require('./core/ContextBuilder');
const DeltaOptimizer = require('./core/DeltaOptimizer');
const InputNormalizer = require('./core/InputNormalizer');
const InputHasher = require('./core/InputHasher');
const ObjectFreezer = require('./core/ObjectFreezer');
const ChangeDetector = require('./support/ChangeDetector');
const MetricsCollector = require('./support/MetricsCollector');

// PRODUCTION SAFEGUARDS - Critical for data integrity and security
const DeterministicDataFetcher = require('./core/DeterministicDataFetcher');
const TransactionalFetcher = require('./core/TransactionalFetcher');
const SecureRuleCompiler = require('./core/SecureRuleCompiler');
const DataIntegrityValidator = require('./support/DataIntegrityValidator');
const NumericTypeEnforcer = require('./support/NumericTypeEnforcer');
const ErrorCategorizer = require('../../infrastructure/ErrorCategorizer');

class PreProcessor {
  constructor(cacheManager, dataFetcher, ruleCompiler, dbPool) {
    // CORE INFRASTRUCTURE COMPONENTS:
    // These handle the fundamental operations of data retrieval and caching
    this.cacheManager = cacheManager || new CacheManager();   // Redis/in-memory cache
    
    // PRODUCTION FIX: Request coalescing to prevent stampede
    this.inFlight = new Map(); // Track in-flight requests
    
    // PRODUCTION SAFEGUARD: Wire deterministic and transactional fetching
    // This ensures consistent data ordering and transactional consistency
    if (dbPool && !dataFetcher) {
      // Create deterministic fetcher for consistent ordering
      const deterministicFetcher = new DeterministicDataFetcher(dbPool);
      
      // Wrap with transactional fetcher for consistency
      const transactionalFetcher = new TransactionalFetcher(dbPool);
      
      // Create standard data fetcher with the db pool
      this.dataFetcher = new DataFetcher(dbPool);
      
      // Attach deterministic fetcher for ordered operations
      this.dataFetcher.deterministicFetcher = deterministicFetcher;
      
      // Attach transactional fetcher for consistent snapshots
      this.dataFetcher.transactionalFetcher = transactionalFetcher;
    } else {
      this.dataFetcher = dataFetcher || new DataFetcher(dbPool);
      
      // If a custom dataFetcher is provided, still try to enhance it with safeguards
      if (this.dataFetcher && dbPool) {
        this.dataFetcher.deterministicFetcher = this.dataFetcher.deterministicFetcher || new DeterministicDataFetcher(dbPool);
        this.dataFetcher.transactionalFetcher = this.dataFetcher.transactionalFetcher || new TransactionalFetcher(dbPool);
      }
    }
    
    // PRODUCTION SAFEGUARD: Use SecureRuleCompiler instead of basic RuleCompiler
    // This validates and sanitizes rule expressions to prevent injection attacks
    this.ruleCompiler = ruleCompiler || new SecureRuleCompiler();
    
    // PRODUCTION SAFEGUARDS: Add validators and enforcers
    this.dataValidator = new DataIntegrityValidator();
    this.numericEnforcer = new NumericTypeEnforcer();
    this.errorCategorizer = new ErrorCategorizer();
    
    // PROCESSING PIPELINE COMPONENTS:
    // These transform raw data into Pure Engine-ready input
    this.pathExtractor = new PathExtractor();     // Extract rule dependency paths
    this.contextBuilder = new ContextBuilder();   // Build evaluation context
    this.deltaOptimizer = new DeltaOptimizer();   // Incremental change optimization
    this.normalizer = new InputNormalizer();      // Data format standardization
    this.hasher = new InputHasher();              // SHA-256 cache key generation
    this.freezer = new ObjectFreezer();           // Immutability enforcement
    
    // MONITORING AND OPTIMIZATION:
    // Track performance and detect change patterns
    this.changeDetector = new ChangeDetector();   // Delta change type analysis
    this.metrics = new MetricsCollector();        // Performance metrics
  }
  
  /**
   * Main processing method - orchestrates complete data preparation pipeline
   * 
   * Transforms raw API requests into immutable, normalized data structures
   * ready for Pure Engine consumption. Includes intelligent caching and
   * delta optimization for performance.
   * 
   * @param {Object} request - Raw calculation request from API layer
   * @param {string} request.proposalId - Unique proposal identifier
   * @param {Array} request.lineItems - Line items to calculate
   * @param {Array} request.modifiers - Applied modifiers
   * @param {Object} request.changes - Delta changes for optimization
   * 
   * @returns {Promise<Object>} Frozen, normalized calculation input
   */
  async process(request) {
    const startTime = Date.now();
    
    // PRODUCTION FIX: Request coalescing for stampede prevention
    // Check if an identical request is already in flight
    const coalescingKey = request.proposalId;
    if (this.inFlight.has(coalescingKey)) {
      // Return the existing promise instead of starting a new request
      return this.inFlight.get(coalescingKey);
    }
    
    // Create and store the promise for coalescing
    const processingPromise = this._doProcess(request, startTime)
      .finally(() => {
        // Always clean up in-flight tracking
        this.inFlight.delete(coalescingKey);
      });
    
    this.inFlight.set(coalescingKey, processingPromise);
    return processingPromise;
  }
  
  /**
   * Internal processing method - actual work happens here
   */
  async _doProcess(request, startTime) {
    try {
      // STEP 1: CACHE KEY GENERATION
      // PRODUCTION FIX: Use centralized cache key generation
      // This ensures consistent keys across all methods
      const cacheKey = this.generateCacheKeyFromRequest(request);
      
      // STEP 2: CACHE LOOKUP
      // Check if we've processed this base request before
      const cached = await this.cacheManager.get(cacheKey);
      
      if (cached) {
        this.metrics.recordCacheHit();
        
        // STEP 3: DELTA OPTIMIZATION CHECK
        // If request includes incremental changes, apply them to cached data
        // This avoids full data fetching for minor modifications
        if (request.changes && this.isDeltaChange(request)) {
          return await this.applyDelta(cached, request);
        }
        
        // Return cached result unchanged
        return cached;
      }
      
      // CACHE MISS - Proceed with full processing
      this.metrics.recordCacheMiss();
      
      // STEP 4: DATA FETCHING
      // Retrieve all required data from PostgreSQL in optimized batches
      const data = await this.dataFetcher.fetchAll(request);
      
      // STEP 4.5: DATA INTEGRITY VALIDATION
      // PRODUCTION SAFEGUARD: Validate all fetched data before processing
      // This ensures data consistency and prevents corrupt data from entering the calculation
      const validationResult = this.dataValidator.validateAll(data);
      if (!validationResult.valid) {
        const error = new Error(`Data validation failed: ${validationResult.errors.join(', ')}`);
        error.validationErrors = validationResult.errors;
        throw error;
      }
      
      // STEP 4.6: NUMERIC TYPE ENFORCEMENT
      // PRODUCTION SAFEGUARD: Normalize all numeric values to prevent precision errors
      // Ensures consistent numeric handling throughout the calculation pipeline
      const normalizedData = this.numericEnforcer.normalizeNumerics(data);
      
      // STEP 5: RULE PATH EXTRACTION
      // Analyze modifier rules to identify data dependencies
      // This enables selective context building for performance
      const paths = this.pathExtractor.extract(normalizedData.rules);
      
      // STEP 6: CONTEXT BUILDING
      // Assemble complete evaluation context with resolved dependencies
      const context = await this.contextBuilder.build(paths, normalizedData);
      
      // STEP 7: RULE COMPILATION
      // Parse and compile modifier rules for efficient execution
      // Uses caching to avoid recompiling identical rules
      const compiledRules = this.compileRules(normalizedData.rules);
      
      // STEP 8: DATA NORMALIZATION
      // Standardize field names, data types, and structure
      // Ensures consistent input format for Pure Engine
      const normalized = this.normalizer.normalize({
        ...normalizedData,
        context,
        compiledRules
      });
      
      // STEP 9: IMMUTABILITY ENFORCEMENT
      // Deep freeze objects to prevent Pure Engine side effects
      // Critical for maintaining functional purity guarantees
      const frozen = this.freezer.freeze(normalized);
      
      // STEP 10: CACHE STORAGE
      // Store processed result for future requests
      await this.cacheManager.set(cacheKey, frozen);
      
      // PERFORMANCE TRACKING:
      // Record total processing time for optimization analysis
      const duration = Date.now() - startTime;
      this.metrics.recordStageTime('fullProcess', duration);
      
      return frozen;
      
    } catch (error) {
      // PRODUCTION FIX: Comprehensive error categorization
      const categorizedError = this.errorCategorizer.categorize(error);
      
      // Log with appropriate severity
      const logData = this.errorCategorizer.formatForLogging(categorizedError);
      console.error('PreProcessor error:', {
        ...logData,
        proposalId: request.proposalId
      });
      
      // Add category to error for upstream handling
      error.category = categorizedError.category;
      error.severity = categorizedError.severity;
      error.retryable = categorizedError.retryable;
      error.retryDelay = categorizedError.suggestedRetryDelay;
      
      throw error;
    }
  }
  
  /**
   * Determine if request contains simple delta changes
   * 
   * Delta changes are incremental modifications that can be applied
   * to cached data without full reprocessing. This provides significant
   * performance benefits for common use cases.
   * 
   * @param {Object} request - Request with potential delta changes
   * @returns {boolean} True if delta optimization is applicable
   */
  isDeltaChange(request) {
    const changeType = this.changeDetector.detectChangeType(request);
    
    // SUPPORTED DELTA TYPES:
    // - MODIFIER_ONLY: Adding/removing/updating modifiers
    // - LINE_ITEM: Simple line item quantity or price changes
    return changeType === 'MODIFIER_ONLY' || changeType === 'LINE_ITEM';
  }
  
  /**
   * Apply incremental changes to cached data
   * 
   * Optimizes performance by applying only the specific changes rather
   * than reprocessing the entire request. Falls back to full processing
   * if changes are too complex.
   * 
   * @param {Object} cached - Previously processed and cached data
   * @param {Object} request - Request containing delta changes
   * @returns {Promise<Object>} Updated frozen data structure
   */
  async applyDelta(cached, request) {
    const startTime = Date.now();
    this.metrics.recordDeltaUpdate();
    
    // CHANGE TYPE ANALYSIS:
    // Determine the specific type of change to apply appropriate optimization
    const changeType = this.changeDetector.detectChangeType(request);
    
    let updated;
    if (changeType === 'MODIFIER_ONLY') {
      // MODIFIER DELTA:
      // Add, remove, or update modifiers without refetching data
      updated = this.deltaOptimizer.applyModifierDelta(cached, request.changes);
    } else if (changeType === 'LINE_ITEM') {
      // LINE ITEM DELTA:
      // Update quantities, prices, or simple line item properties
      updated = this.deltaOptimizer.applyLineItemDelta(cached, request.changes);
    } else {
      // COMPLEX CHANGE - FALLBACK:
      // Changes are too complex for delta optimization
      this.metrics.recordFullRebuild();
      return this.process({ ...request, changes: undefined });
    }
    
    // POST-DELTA PROCESSING:
    // Re-normalize and freeze the updated data
    const normalized = this.normalizer.normalize(updated);
    const frozen = this.freezer.freeze(normalized);
    
    // CACHE UPDATE:
    // PRODUCTION FIX: Use centralized cache key generation
    // This ensures the same key is used as in the process method
    const cacheKey = this.generateCacheKeyFromRequest(request);
    await this.cacheManager.set(cacheKey, frozen);
    
    // PERFORMANCE TRACKING:
    const duration = Date.now() - startTime;
    this.metrics.recordStageTime('deltaProcess', duration);
    
    return frozen;
  }
  
  /**
   * Compile modifier rules for efficient execution
   * 
   * Parses text-based modifier rules into executable functions.
   * Uses aggressive caching since rule compilation is expensive
   * and rules are frequently reused across proposals.
   * 
   * @param {Array} rules - Array of modifier rules to compile
   * @returns {Array} Compiled executable rule functions
   */
  compileRules(rules) {
    if (!rules || rules.length === 0) {
      return [];
    }
    
    return rules.map(rule => {
      // COMPILATION CACHE CHECK:
      // Rule compilation is expensive, so cache compiled results
      const cached = this.ruleCompiler.getCached(rule.id);
      if (cached) {
        return cached;
      }
      
      // COMPILE AND CACHE:
      // Parse rule syntax and generate executable function
      const compiled = this.ruleCompiler.compile(rule.parsedRule);
      this.ruleCompiler.cache(rule.id, compiled);
      
      return compiled;
    });
  }
  
  /**
   * Generate unified cache key for consistent caching
   * 
   * PRODUCTION FIX: Ensures cache keys are consistent across all methods
   * preventing cache divergence and duplicate entries. Uses proposalId
   * and data version for deterministic key generation.
   * 
   * @param {string} proposalId - The proposal identifier
   * @param {string} dataVersion - Version of the data (optional)
   * @returns {string} Unified cache key
   */
  generateCacheKey(proposalId, dataVersion) {
    // Use proposalId as the base for the cache key
    // This ensures consistency regardless of request format
    if (dataVersion) {
      return `proposal:${proposalId}:${dataVersion}`;
    }
    return `proposal:${proposalId}`;
  }

  /**
   * Generate cache key from request object
   * 
   * PRODUCTION FIX: Centralizes cache key generation logic
   * to prevent divergence between process() and applyDelta()
   * 
   * @param {Object} request - The request object
   * @returns {string} Cache key
   */
  generateCacheKeyFromRequest(request) {
    // Always use the base request without changes for cache key
    // This ensures the same logical state maps to the same key
    const baseRequest = { ...request };
    delete baseRequest.changes;
    
    // For now, use the existing hash method but we can migrate
    // to proposalId-based keys in the future
    return this.hasher.hash(baseRequest);
  }

  /**
   * Get comprehensive metrics for monitoring and optimization
   * 
   * Provides detailed performance statistics for the Pre-Processor
   * tier including cache hit rates, processing times, and optimization
   * effectiveness.
   * 
   * @returns {Object} Complete metrics object for monitoring dashboards
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }
}

module.exports = PreProcessor;