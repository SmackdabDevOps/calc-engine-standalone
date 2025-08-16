/**
 * DeltaRebuildDecider - Determines when full rebuild is needed
 * 
 * Purpose:
 * - Define clear criteria for delta vs rebuild
 * - Track change patterns
 * - Optimize rebuild decisions
 * 
 * @class DeltaRebuildDecider
 */
class DeltaRebuildDecider {
  constructor() {
    /**
     * Thresholds for rebuild decisions
     */
    this.thresholds = {
      maxDeltaComplexity: 5,     // Max operations in delta
      maxChangeRatio: 0.3,        // Max % of items changed
      maxDependencyDepth: 3,      // Max cascade depth
      maxDeltaAge: 3600000,       // Max age of cached data (1 hour)
      maxDeltaAttempts: 3         // Max failed delta attempts
    };
    
    /**
     * Track delta attempt history
     */
    this.deltaHistory = new Map();
  }
  
  /**
   * Decide whether to use delta or full rebuild
   * 
   * @param {Object} cached - Cached state
   * @param {Object} changes - Proposed changes
   * @returns {Object} Decision with reasoning
   */
  shouldUseDelta(cached, changes) {
    const decision = {
      useDelta: false,
      reason: null,
      confidence: 0
    };
    
    // Check if cache exists
    if (!cached || !cached.timestamp) {
      decision.reason = 'No cached data available';
      return decision;
    }
    
    // Check cache age
    const cacheAge = Date.now() - cached.timestamp;
    if (cacheAge > this.thresholds.maxDeltaAge) {
      decision.reason = `Cache too old: ${Math.round(cacheAge / 60000)} minutes`;
      return decision;
    }
    
    // Check schema version
    if (changes.schemaVersion && cached.schemaVersion !== changes.schemaVersion) {
      decision.reason = 'Schema version mismatch';
      return decision;
    }
    
    // Count changes
    const changeCount = this.countChanges(changes);
    const totalItems = (cached.lineItems?.length || 0) + 
                       (cached.modifiers?.length || 0);
    
    if (totalItems === 0) {
      decision.reason = 'No cached items';
      return decision;
    }
    
    const changeRatio = changeCount / totalItems;
    if (changeRatio > this.thresholds.maxChangeRatio) {
      decision.reason = `Too many changes: ${Math.round(changeRatio * 100)}%`;
      return decision;
    }
    
    // Check complexity
    const complexity = this.calculateDeltaComplexity(cached, changes);
    if (complexity > this.thresholds.maxDeltaComplexity) {
      decision.reason = `Delta too complex: ${complexity} operations`;
      return decision;
    }
    
    // Check dependency impact
    const dependencyDepth = this.calculateDependencyDepth(cached, changes);
    if (dependencyDepth > this.thresholds.maxDependencyDepth) {
      decision.reason = `Deep dependency cascade: ${dependencyDepth} levels`;
      return decision;
    }
    
    // Check recent delta failures
    const failures = this.getRecentFailures(cached.proposalId);
    if (failures >= this.thresholds.maxDeltaAttempts) {
      decision.reason = `Too many recent delta failures: ${failures}`;
      return decision;
    }
    
    // Delta is safe to use
    decision.useDelta = true;
    decision.reason = 'Delta optimization available';
    decision.confidence = this.calculateConfidence(changeRatio, complexity);
    
    return decision;
  }
  
  /**
   * Count total changes
   */
  countChanges(changes) {
    let count = 0;
    
    if (changes.lineItems) {
      count += changes.lineItems.added?.length || 0;
      count += changes.lineItems.updated?.length || 0;
      count += changes.lineItems.deleted?.length || 0;
    }
    
    if (changes.modifiers) {
      count += changes.modifiers.added?.length || 0;
      count += changes.modifiers.updated?.length || 0;
      count += changes.modifiers.deleted?.length || 0;
    }
    
    return count;
  }
  
  /**
   * Calculate delta operation complexity
   */
  calculateDeltaComplexity(cached, changes) {
    let complexity = 0;
    
    // Each type of change adds complexity
    if (changes.lineItems?.added?.length > 0) complexity++;
    if (changes.lineItems?.updated?.length > 0) complexity++;
    if (changes.lineItems?.deleted?.length > 0) complexity++;
    
    if (changes.modifiers?.added?.length > 0) complexity++;
    if (changes.modifiers?.updated?.length > 0) complexity++;
    if (changes.modifiers?.deleted?.length > 0) complexity++;
    
    // Dependency changes add extra complexity
    if (changes.dependencies?.length > 0) complexity += 2;
    
    // Rule changes add significant complexity
    if (changes.rules?.length > 0) complexity += 3;
    
    return complexity;
  }
  
  /**
   * Calculate cascade depth from changes
   */
  calculateDependencyDepth(cached, changes) {
    if (!changes.modifiers || !cached.dependencies) {
      return 0;
    }
    
    const changedModifiers = new Set();
    
    if (changes.modifiers.added) {
      changes.modifiers.added.forEach(m => changedModifiers.add(m.id));
    }
    if (changes.modifiers.updated) {
      changes.modifiers.updated.forEach(m => changedModifiers.add(m.id));
    }
    
    let depth = 0;
    let current = changedModifiers;
    
    while (current.size > 0 && depth < 10) {
      const next = new Set();
      
      for (const modId of current) {
        const dependents = cached.dependencies
          .filter(d => d.depends_on === modId)
          .map(d => d.modifier_id);
        
        dependents.forEach(id => next.add(id));
      }
      
      if (next.size === 0) break;
      current = next;
      depth++;
    }
    
    return depth;
  }
  
  /**
   * Track delta attempt outcome
   */
  recordDeltaAttempt(proposalId, success) {
    if (!this.deltaHistory.has(proposalId)) {
      this.deltaHistory.set(proposalId, []);
    }
    
    const history = this.deltaHistory.get(proposalId);
    history.push({
      timestamp: Date.now(),
      success
    });
    
    // Keep only recent history (last hour)
    const cutoff = Date.now() - 3600000;
    const filtered = history.filter(h => h.timestamp > cutoff);
    this.deltaHistory.set(proposalId, filtered);
  }
  
  /**
   * Get count of recent delta failures
   */
  getRecentFailures(proposalId) {
    const history = this.deltaHistory.get(proposalId) || [];
    const recent = history.filter(h => 
      h.timestamp > Date.now() - 300000 // Last 5 minutes
    );
    
    return recent.filter(h => !h.success).length;
  }
  
  /**
   * Calculate confidence in delta decision
   */
  calculateConfidence(changeRatio, complexity) {
    // Start with perfect confidence
    let confidence = 1.0;
    
    // Reduce based on change ratio
    confidence -= changeRatio * 0.5;
    
    // Reduce based on complexity
    confidence -= (complexity / this.thresholds.maxDeltaComplexity) * 0.3;
    
    // Ensure between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }
}

module.exports = DeltaRebuildDecider;