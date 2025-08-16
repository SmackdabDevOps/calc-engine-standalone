/**
 * MetricsCollector - Collects performance metrics
 * @version 1.0.0
 */

class MetricsCollector {
  constructor(maxSize = 1000) {
    // PRODUCTION FIX: Bound metrics growth
    this.maxSize = maxSize;
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      deltaUpdates: 0,
      fullRebuilds: 0,
      stageTimes: {},
      // Use aggregates to prevent unbounded growth
      stageTimeAggregates: {}
    };
  }
  
  recordCacheHit() {
    this.metrics.cacheHits++;
  }
  
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }
  
  recordDeltaUpdate() {
    this.metrics.deltaUpdates++;
  }
  
  recordFullRebuild() {
    this.metrics.fullRebuilds++;
  }
  
  recordStageTime(stage, duration) {
    // PRODUCTION FIX: Use aggregates to prevent unbounded growth
    // Initialize aggregates if not present
    if (!this.metrics.stageTimeAggregates[stage]) {
      this.metrics.stageTimeAggregates[stage] = {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        // Keep recent samples for percentile calculation
        recentSamples: []
      };
    }
    
    const aggregate = this.metrics.stageTimeAggregates[stage];
    
    // Update aggregates
    aggregate.count++;
    aggregate.sum += duration;
    aggregate.min = Math.min(aggregate.min, duration);
    aggregate.max = Math.max(aggregate.max, duration);
    
    // Keep bounded recent samples for percentile calculations
    aggregate.recentSamples.push(duration);
    if (aggregate.recentSamples.length > this.maxSize) {
      aggregate.recentSamples.shift(); // Remove oldest
    }
    
    // DEPRECATED: Remove unbounded array storage
    // Keep for backwards compatibility but bounded
    if (!this.metrics.stageTimes[stage]) {
      this.metrics.stageTimes[stage] = [];
    }
    this.metrics.stageTimes[stage].push(duration);
    if (this.metrics.stageTimes[stage].length > 100) { // Keep max 100 for compatibility
      this.metrics.stageTimes[stage].shift();
    }
  }
  
  getMetrics() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    
    // PRODUCTION FIX: Return aggregates with calculated averages
    // Transform aggregates into useful metrics
    const stageMetrics = {};
    for (const [stage, aggregate] of Object.entries(this.metrics.stageTimeAggregates)) {
      stageMetrics[stage] = {
        count: aggregate.count,
        avg: aggregate.count > 0 ? aggregate.sum / aggregate.count : 0,
        min: aggregate.min === Infinity ? 0 : aggregate.min,
        max: aggregate.max === -Infinity ? 0 : aggregate.max,
        p50: this.calculatePercentile(aggregate.recentSamples, 50),
        p95: this.calculatePercentile(aggregate.recentSamples, 95),
        p99: this.calculatePercentile(aggregate.recentSamples, 99)
      };
    }
    
    return {
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      deltaUpdates: this.metrics.deltaUpdates,
      fullRebuilds: this.metrics.fullRebuilds,
      cacheHitRate: total > 0 ? this.metrics.cacheHits / total : 0,
      stageMetrics,
      // Keep legacy stageTimes for compatibility but bounded
      stageTimes: this.metrics.stageTimes
    };
  }
  
  /**
   * Calculate percentile from array of values
   * @param {Array<number>} values - Array of numeric values
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} The calculated percentile value
   */
  calculatePercentile(values, percentile) {
    if (!values || values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

module.exports = MetricsCollector;