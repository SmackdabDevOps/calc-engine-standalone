/**
 * CalculationOrchestrator - Central coordinator for 3-tier calculation architecture
 * 
 * SYSTEM ARCHITECTURE:
 * This orchestrator implements the Mathematical Correctness Plan's 3-tier design,
 * ensuring separation of concerns and deterministic calculation flows.
 * 
 * TIER 1: PRE-PROCESSOR
 * - Data fetching from PostgreSQL
 * - Input normalization and validation
 * - Context building (rules, dependencies, modifiers)
 * - Cache management and optimization
 * - Delta detection for performance
 * 
 * TIER 2: PURE ENGINE
 * - Deterministic mathematical calculations
 * - No side effects or I/O operations
 * - Q7/Q2 precision policy enforcement
 * - 8-attribute modifier grouping
 * - Idempotent result generation
 * 
 * TIER 3: POST-PROCESSOR  
 * - Database persistence with ACID transactions
 * - Event emission to Pulsar/Kafka
 * - Cache invalidation and updates
 * - Webhook triggering for integrations
 * - Metrics recording for monitoring
 * 
 * ORCHESTRATION FLOW:
 * Request → Pre-Process → Pure Calculate → Post-Process → Response
 * 
 * PERFORMANCE TRACKING:
 * - Per-tier latency measurement
 * - Error rate monitoring
 * - Resource utilization metrics
 * - Performance optimization insights
 * 
 * ERROR HANDLING:
 * - Graceful degradation on tier failures
 * - Comprehensive error context preservation
 * - Metrics collection for failed requests
 * - Rollback support for atomic operations
 * 
 * @version 1.0.0
 * @implements Mathematical Correctness Plan
 */

const PreProcessor = require('./pre-processor/PreProcessor');
const PureCalculationEngine = require('../engines/pure/PureCalculationEngine');
const PostProcessor = require('./post-processor/PostProcessor');
const pool = require('../db'); // Database pool

class CalculationOrchestrator {
  constructor(config = {}) {
    // TIER INITIALIZATION:
    // Each tier is injected for testability and flexibility
    // Production uses defaults, tests can inject mocks
    
    // Tier 1: Data preparation and context building
    this.preProcessor = config.preProcessor || new PreProcessor();
    
    // Tier 2: Pure mathematical engine (no side effects)
    this.pureEngine = config.pureEngine || new PureCalculationEngine();
    
    // Tier 3: Persistence, events, and side effects
    this.postProcessor = config.postProcessor || new PostProcessor(
      pool,              // PostgreSQL connection pool
      config.eventBus,   // Pulsar/Kafka event bus
      config.cache,      // Redis/Dragonfly cache
      config.metrics     // Metrics collection system
    );
    
    // PERFORMANCE METRICS:
    // Track latency and errors per tier for optimization
    this.metrics = {
      totalRequests: 0,     // Total calculations performed
      totalLatency: 0,      // Cumulative processing time
      errors: 0,            // Failed calculation count
      tierLatencies: {
        preProcessor: [],   // Tier 1 timing history
        pureEngine: [],     // Tier 2 timing history  
        postProcessor: []   // Tier 3 timing history
      }
    };
  }
  
  /**
   * Main calculation orchestration method
   * 
   * Executes the complete 3-tier calculation flow with performance tracking
   * and comprehensive error handling. Each tier is timed separately for
   * optimization insights.
   * 
   * @param {Object} request - Raw calculation request from API
   * @param {string} request.proposalId - Unique proposal identifier
   * @param {Array} request.lineItems - Line items to calculate
   * @param {Array} request.modifiers - Applied modifiers
   * @param {Object} request.config - Tax and calculation settings
   * 
   * @returns {Promise<Object>} Complete calculation result with metadata
   * @returns {string} result.checksum - SHA-256 hash for idempotency
   * @returns {string} result.subtotal - Pre-tax total (Q2 precision)
   * @returns {string} result.retailTax - Tax amount (Q2 precision)
   * @returns {string} result.customerGrandTotal - Final total (Q2 precision)
   * @returns {Array} result.adjustments - Detailed modifier applications
   * @returns {Object} result._performance - Timing breakdown by tier
   */
  async calculate(request) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    try {
      // TIER 1: PRE-PROCESSING
      // Fetch data, normalize inputs, build context, check cache
      const tier1Start = Date.now();
      const preprocessedInput = await this.preProcessor.process(request);
      const tier1Duration = Date.now() - tier1Start;
      this.metrics.tierLatencies.preProcessor.push(tier1Duration);
      
      // TIER 2: PURE CALCULATION
      // Deterministic math with no side effects or I/O
      const tier2Start = Date.now();
      const calculationResult = this.pureEngine.calculate(preprocessedInput);
      const tier2Duration = Date.now() - tier2Start;
      this.metrics.tierLatencies.pureEngine.push(tier2Duration);
      
      // TIER 3: POST-PROCESSING  
      // Persist results, emit events, update cache, trigger webhooks
      const tier3Start = Date.now();
      const finalResult = await this.postProcessor.process(calculationResult, request);
      const tier3Duration = Date.now() - tier3Start;
      this.metrics.tierLatencies.postProcessor.push(tier3Duration);
      
      // PERFORMANCE TRACKING:
      // Record total latency for SLA monitoring
      const totalDuration = Date.now() - startTime;
      this.metrics.totalLatency += totalDuration;
      
      // PERFORMANCE METADATA:
      // Include timing breakdown in response for debugging
      finalResult._performance = {
        totalMs: totalDuration,
        preProcessorMs: tier1Duration,  // Data prep + context building
        pureEngineMs: tier2Duration,     // Pure mathematical calculation
        postProcessorMs: tier3Duration   // Persistence + events + cache
      };
      
      return finalResult;
      
    } catch (error) {
      // ERROR TRACKING:
      // Increment error counter for monitoring
      this.metrics.errors++;
      
      // LOG CONTEXT:
      // Include request context for debugging
      console.error('CalculationOrchestrator error:', {
        proposalId: request.proposalId,
        error: error.message,
        stack: error.stack,
        metrics: this.getMetrics()
      });
      
      // PROPAGATE ERROR:
      // Let higher layers handle error response formatting
      throw error;
    }
  }
  
  /**
   * Get comprehensive performance metrics for monitoring and optimization
   * 
   * Provides detailed statistics about orchestrator performance including
   * per-tier latency analysis, error rates, and throughput metrics.
   * Used by monitoring systems and performance dashboards.
   * 
   * @returns {Object} Complete performance metrics
   * @returns {number} result.totalRequests - Total calculations performed
   * @returns {number} result.averageLatency - Mean response time in ms
   * @returns {number} result.errorRate - Failure percentage (0.0 to 1.0)
   * @returns {Object} result.tierAverages - Average latency per tier
   * @returns {Object} result.preProcessorMetrics - Tier 1 detailed metrics
   * @returns {Object} result.postProcessorMetrics - Tier 3 detailed metrics
   */
  getMetrics() {
    // OVERALL LATENCY CALCULATION:
    // Average response time across all successful + failed requests
    const avgLatency = this.metrics.totalRequests > 0
      ? this.metrics.totalLatency / this.metrics.totalRequests
      : 0;
    
    // PER-TIER LATENCY ANALYSIS:
    // Calculate average processing time for each tier
    const avgTierLatencies = {};
    for (const tier in this.metrics.tierLatencies) {
      const latencies = this.metrics.tierLatencies[tier];
      avgTierLatencies[tier] = latencies.length > 0
        ? latencies.reduce((sum, val) => sum + val, 0) / latencies.length
        : 0;
    }
    
    return {
      // THROUGHPUT METRICS:
      totalRequests: this.metrics.totalRequests,
      averageLatency: avgLatency,
      
      // RELIABILITY METRICS:
      errorRate: this.metrics.totalRequests > 0
        ? this.metrics.errors / this.metrics.totalRequests
        : 0,
      
      // PERFORMANCE BREAKDOWN:
      tierAverages: avgTierLatencies,
      
      // DETAILED TIER METRICS:
      // Include metrics from individual tiers if available
      preProcessorMetrics: this.preProcessor.getMetrics 
        ? this.preProcessor.getMetrics() 
        : {},
      postProcessorMetrics: this.postProcessor.getMetrics 
        ? this.postProcessor.getMetrics() 
        : {}
    };
  }
  
  /**
   * Reset performance metrics to initial state
   * 
   * Clears all accumulated performance data including request counts,
   * latency measurements, and error statistics. Typically used during
   * testing or when starting fresh monitoring periods.
   * 
   * CRITICAL: This operation is not atomic and should not be called
   * during active request processing in production.
   */
  resetMetrics() {
    this.metrics = {
      // REQUEST COUNTERS:
      totalRequests: 0,     // Reset request count to zero
      totalLatency: 0,      // Reset cumulative latency
      errors: 0,            // Reset error count
      
      // TIER TIMING ARRAYS:
      // Clear all historical latency measurements
      tierLatencies: {
        preProcessor: [],   // Clear Tier 1 timing history
        pureEngine: [],     // Clear Tier 2 timing history
        postProcessor: []   // Clear Tier 3 timing history
      }
    };
  }
}

module.exports = CalculationOrchestrator;