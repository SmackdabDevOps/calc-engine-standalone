/**
 * DeltaOptimizer - Optimizes incremental updates
 * @version 1.0.0
 */

class DeltaOptimizer {
  detectChangeType(request) {
    if (!request || !request.changes) return 'NONE';
    
    const changes = request.changes;
    const hasModifiers = !!(changes.modifiers && changes.modifiers.length > 0);
    const hasLineItems = !!(changes.lineItems && changes.lineItems.length > 0);
    const hasDependencies = !!(changes.dependencies && changes.dependencies.length > 0);
    
    if (hasDependencies) return 'COMPLEX';
    if (hasModifiers && hasLineItems) return 'COMPLEX';
    if (hasLineItems) return 'LINE_ITEM';
    if (hasModifiers) return 'MODIFIER_ONLY';
    
    return 'NONE';
  }
  
  applyModifierDelta(cached, changes) {
    const result = JSON.parse(JSON.stringify(cached));
    
    if (changes.updated) {
      for (const update of changes.updated) {
        const index = result.modifiers.findIndex(m => m.id === update.id);
        if (index !== -1) {
          result.modifiers[index] = { ...result.modifiers[index], ...update };
        }
      }
    }
    
    return result;
  }
  
  applyLineItemDelta(cached, changes) {
    const result = JSON.parse(JSON.stringify(cached));
    
    if (changes.updated) {
      for (const update of changes.updated) {
        const index = result.lineItems.findIndex(i => i.id === update.id);
        if (index !== -1) {
          result.lineItems[index] = { ...result.lineItems[index], ...update };
        }
      }
    }
    
    // Recalculate aggregates
    if (result.aggregates) {
      let subtotal = 0;
      for (const item of result.lineItems) {
        subtotal += Number(item.price) * Number(item.quantity || 1);
      }
      result.aggregates.subtotal = String(subtotal) + '.00';
    }
    
    return result;
  }
  
  requiresFullRebuild(changes) {
    return !!(changes && (changes.dependencies || changes.rules));
  }
}

module.exports = DeltaOptimizer;