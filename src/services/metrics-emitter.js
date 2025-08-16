/**
 * MetricsEmitter - Centralized metrics emission for calculation engine
 * 
 * Emits standardized metrics for monitoring and alerting:
 * - Calculation performance metrics
 * - Phase timing breakdowns
 * - Error tracking
 * - Cache performance
 * - Health status
 * 
 * @author Architecture Team
 * @date 2025-01-15
 * @version 1.0.0
 */

class MetricsEmitter {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.service = 'calculation-engine';
  }
  
  /**
   * Emit calculation metrics
   * @param {Object} data - Calculation metrics data
   */
  emitCalculationMetrics(data) {
    const {
      calculation_duration_ms,
      phase_timings,
      modifiers_count,
      dependency_edges,
      precision_violations,
      error_type,
      engine_version,
      calculation_id,
      dependency_graph_hash,
      proposal_id
    } = data;
    
    // Base tags for all metrics
    const baseTags = {
      engine_version,
      calculation_id,
      environment: this.environment,
      service: this.service
    };
    
    if (proposal_id) baseTags.proposal_id = proposal_id;
    if (dependency_graph_hash) baseTags.dependency_graph_hash = dependency_graph_hash;
    
    // Emit calculation duration
    if (calculation_duration_ms !== undefined) {
      this._emit('calculation.duration.ms', calculation_duration_ms, baseTags);
    }
    
    // Emit phase timings
    if (phase_timings) {
      Object.entries(phase_timings).forEach(([phase, duration]) => {
        this._emit(`calculation.phase.${phase}.ms`, duration, baseTags);
      });
    }
    
    // Emit modifier count
    if (modifiers_count !== undefined) {
      this._emit('calculation.modifiers.count', modifiers_count, baseTags);
    }
    
    // Emit dependency edges
    if (dependency_edges !== undefined) {
      this._emit('calculation.dependencies.edges', dependency_edges, baseTags);
    }
    
    // Emit precision violations
    if (precision_violations !== undefined) {
      this._emit('calculation.precision.violations', precision_violations, baseTags);
    }
    
    // Emit error metric
    if (error_type) {
      this._emit('calculation.error', 1, { ...baseTags, error_type });
    }
    
    // Emit at least one metric if only tags provided
    const hasMetrics = calculation_duration_ms !== undefined || 
                      phase_timings || 
                      modifiers_count !== undefined ||
                      dependency_edges !== undefined ||
                      precision_violations !== undefined ||
                      error_type;
                      
    if (!hasMetrics) {
      // Emit a heartbeat metric when only tags are provided
      this._emit('calculation.heartbeat', 1, baseTags);
    }
  }
  
  /**
   * Emit cache metrics
   * @param {Object} data - Cache metrics data
   */
  emitCacheMetrics(data) {
    const { cache_hit, cache_key, cache_ttl } = data;
    
    const tags = {
      cache_key,
      environment: this.environment,
      service: this.service
    };
    
    if (cache_ttl) tags.cache_ttl = cache_ttl;
    
    if (cache_hit) {
      this._emit('cache.hit', 1, tags);
    } else {
      this._emit('cache.miss', 1, tags);
    }
  }
  
  /**
   * Emit health metrics
   * @param {Object} data - Health metrics data
   */
  emitHealthMetrics(data) {
    const {
      status,
      uptime,
      calculations_performed,
      average_latency_ms,
      error_rate
    } = data;
    
    const tags = {
      status,
      environment: this.environment,
      service: this.service
    };
    
    if (uptime !== undefined) {
      this._emit('health.uptime', uptime, tags);
    }
    
    if (calculations_performed !== undefined) {
      this._emit('health.calculations_total', calculations_performed, tags);
    }
    
    if (average_latency_ms !== undefined) {
      this._emit('health.latency_avg_ms', average_latency_ms, tags);
    }
    
    if (error_rate !== undefined) {
      this._emit('health.error_rate', error_rate, tags);
    }
  }
  
  /**
   * Internal emit method
   * @private
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {Object} tags - Metric tags
   */
  _emit(metric, value, tags) {
    const metricData = {
      metric,
      value,
      tags,
      timestamp: new Date().toISOString()
    };
    
    // In production, this would send to a metrics service
    // For now, log to console with METRIC prefix
    console.log('METRIC', metricData);
    
    // Could also emit to StatsD, DataDog, CloudWatch, etc.
    // Example: this.statsdClient.gauge(metric, value, tags);
  }
}

module.exports = MetricsEmitter;