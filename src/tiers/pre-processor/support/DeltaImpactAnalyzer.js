/**
 * DeltaImpactAnalyzer - Determines scope of changes
 * 
 * Purpose:
 * - Analyze which components are affected by changes
 * - Determine if delta optimization is safe
 * - Identify dependency cascades
 * 
 * @class DeltaImpactAnalyzer
 */
class DeltaImpactAnalyzer {
  /**
   * Analyze impact of proposed changes
   * 
   * @param {Object} cached - Current cached state
   * @param {Object} changes - Proposed changes
   * @returns {Object} Analysis results
   */
  analyzeImpact(cached, changes) {
    const impact = {
      canUseDelta: false,
      affectedModifiers: [],
      affectedLineItems: [],
      requiresFullRebuild: false,
      reason: null
    };
    
    // Check for structural changes that require full rebuild
    if (this.hasStructuralChanges(cached, changes)) {
      impact.requiresFullRebuild = true;
      impact.reason = 'Structural changes detected';
      return impact;
    }
    
    // Analyze modifier changes
    if (changes.modifiers) {
      const modifierImpact = this.analyzeModifierChanges(
        cached.modifiers,
        changes.modifiers
      );
      
      // Check for dependency violations
      if (modifierImpact.hasDependencyChanges) {
        impact.requiresFullRebuild = true;
        impact.reason = 'Modifier dependency graph changed';
        return impact;
      }
      
      impact.affectedModifiers = modifierImpact.affected;
      impact.canUseDelta = modifierImpact.canDelta;
    }
    
    // Analyze line item changes
    if (changes.lineItems) {
      const lineItemImpact = this.analyzeLineItemChanges(
        cached.lineItems,
        changes.lineItems
      );
      
      // Line item changes affect all percentage modifiers
      if (lineItemImpact.hasChanges && cached.modifiers) {
        const percentageModifiers = cached.modifiers.filter(m => 
          m.type === 'PERCENTAGE' || m.calculation_type === 'percentage'
        );
        
        impact.affectedModifiers.push(
          ...percentageModifiers.map(m => m.id)
        );
      }
      
      impact.affectedLineItems = lineItemImpact.affected;
      
      // If more than 30% of items changed, rebuild
      if (cached.lineItems && cached.lineItems.length > 0) {
        const changeRatio = lineItemImpact.affected.length / cached.lineItems.length;
        if (changeRatio > 0.3) {
          impact.requiresFullRebuild = true;
          impact.reason = `Too many line items changed: ${Math.round(changeRatio * 100)}%`;
          return impact;
        }
      }
    }
    
    // Check cascade depth
    if (cached.dependencies && impact.affectedModifiers.length > 0) {
      const cascadeDepth = this.calculateCascadeDepth(
        impact.affectedModifiers,
        cached.dependencies
      );
      
      if (cascadeDepth > 3) {
        impact.requiresFullRebuild = true;
        impact.reason = `Deep dependency cascade: ${cascadeDepth} levels`;
        return impact;
      }
    }
    
    impact.canUseDelta = !impact.requiresFullRebuild;
    return impact;
  }
  
  /**
   * Check for structural changes
   */
  hasStructuralChanges(cached, changes) {
    // New fields added to schema
    if (changes.schemaVersion && changes.schemaVersion !== cached.schemaVersion) {
      return true;
    }
    
    // Core configuration changed
    if (changes.proposalConfig && cached.proposalConfig) {
      if (changes.proposalConfig.calculation_mode !== cached.proposalConfig.calculation_mode) {
        return true;
      }
    }
    
    // Tax configuration changed
    if (changes.taxConfig && cached.taxConfig) {
      if (JSON.stringify(changes.taxConfig) !== JSON.stringify(cached.taxConfig)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Analyze modifier changes
   */
  analyzeModifierChanges(cachedModifiers, changeModifiers) {
    const impact = {
      affected: [],
      canDelta: true,
      hasDependencyChanges: false
    };
    
    if (!changeModifiers) return impact;
    
    // Track affected modifier IDs
    if (changeModifiers.added) {
      impact.affected.push(...changeModifiers.added.map(m => m.id));
    }
    if (changeModifiers.updated) {
      impact.affected.push(...changeModifiers.updated.map(m => m.id));
    }
    if (changeModifiers.deleted) {
      impact.affected.push(...changeModifiers.deleted.map(m => m.id));
      impact.hasDependencyChanges = true; // Deletions affect dependencies
    }
    
    return impact;
  }
  
  /**
   * Analyze line item changes
   */
  analyzeLineItemChanges(cachedItems, changeItems) {
    const impact = {
      affected: [],
      hasChanges: false
    };
    
    if (!changeItems) return impact;
    
    if (changeItems.added && changeItems.added.length > 0) {
      impact.affected.push(...changeItems.added.map(i => i.id));
      impact.hasChanges = true;
    }
    
    if (changeItems.updated && changeItems.updated.length > 0) {
      impact.affected.push(...changeItems.updated.map(i => i.id));
      impact.hasChanges = true;
    }
    
    if (changeItems.deleted && changeItems.deleted.length > 0) {
      impact.affected.push(...changeItems.deleted.map(i => i.id));
      impact.hasChanges = true;
    }
    
    return impact;
  }
  
  /**
   * Calculate dependency cascade depth
   */
  calculateCascadeDepth(affectedModifiers, dependencies) {
    let depth = 0;
    let current = new Set(affectedModifiers);
    
    while (current.size > 0 && depth < 10) {
      const next = new Set();
      
      for (const modId of current) {
        const deps = dependencies.filter(d => d.depends_on === modId);
        deps.forEach(d => next.add(d.modifier_id));
      }
      
      if (next.size === 0) break;
      current = next;
      depth++;
    }
    
    return depth;
  }
}

module.exports = DeltaImpactAnalyzer;