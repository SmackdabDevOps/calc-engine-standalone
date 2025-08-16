/**
 * ChangeDetector - Detects type of changes for delta optimization
 * 
 * Change Types:
 * - MODIFIER_ONLY: Only modifier values changed (fastest path)
 * - LINE_ITEM: Line item changes (requires aggregate updates)
 * - COMPLEX: Multiple types or dependencies changed (full rebuild)
 * - NONE: No changes detected
 * 
 * @version 1.0.0
 */

class ChangeDetector {
  /**
   * Detect the type of change from request
   * @param {Object} request - Request with changes object
   * @returns {string} - Change type (MODIFIER_ONLY, LINE_ITEM, COMPLEX, NONE)
   */
  detectChangeType(request) {
    if (!request || !request.changes) {
      return 'NONE';
    }
    
    const changes = request.changes;
    
    // Check for various change types
    const hasModifiers = this.hasModifierChanges(changes);
    const hasLineItems = this.hasLineItemChanges(changes);
    const hasDependencies = this.hasDependencyChanges(changes);
    const hasRules = this.hasRuleChanges(changes);
    
    // Determine change type based on what changed
    if (hasDependencies || hasRules) {
      // Dependencies or rules require full rebuild
      return 'COMPLEX';
    }
    
    if (hasModifiers && hasLineItems) {
      // Both changed = complex
      return 'COMPLEX';
    }
    
    if (hasLineItems) {
      // Line items changed (with or without modifiers)
      return 'LINE_ITEM';
    }
    
    if (hasModifiers) {
      // Only modifiers changed
      return 'MODIFIER_ONLY';
    }
    
    return 'NONE';
  }
  
  /**
   * Check if there are modifier changes
   * @param {Object} changes - Changes object
   * @returns {boolean}
   */
  hasModifierChanges(changes) {
    if (!changes) return false;
    
    // Check array format
    if (Array.isArray(changes.modifiers) && changes.modifiers.length > 0) {
      return true;
    }
    
    // Check object format with added/updated/deleted
    if (changes.modifiers && typeof changes.modifiers === 'object') {
      const mod = changes.modifiers;
      return (
        (mod.added && mod.added.length > 0) ||
        (mod.updated && mod.updated.length > 0) ||
        (mod.deleted && mod.deleted.length > 0)
      );
    }
    
    return false;
  }
  
  /**
   * Check if there are line item changes
   * @param {Object} changes - Changes object
   * @returns {boolean}
   */
  hasLineItemChanges(changes) {
    if (!changes) return false;
    
    // Check array format
    if (Array.isArray(changes.lineItems) && changes.lineItems.length > 0) {
      return true;
    }
    
    // Check object format with added/updated/deleted
    if (changes.lineItems && typeof changes.lineItems === 'object') {
      const items = changes.lineItems;
      return (
        (items.added && items.added.length > 0) ||
        (items.updated && items.updated.length > 0) ||
        (items.deleted && items.deleted.length > 0)
      );
    }
    
    return false;
  }
  
  /**
   * Check if there are dependency changes
   * @param {Object} changes - Changes object
   * @returns {boolean}
   */
  hasDependencyChanges(changes) {
    if (!changes) return false;
    
    // Check array format
    if (Array.isArray(changes.dependencies) && changes.dependencies.length > 0) {
      return true;
    }
    
    // Check object format
    if (changes.dependencies && typeof changes.dependencies === 'object') {
      const deps = changes.dependencies;
      return (
        (deps.added && deps.added.length > 0) ||
        (deps.deleted && deps.deleted.length > 0)
      );
    }
    
    return false;
  }
  
  /**
   * Check if there are rule changes
   * @param {Object} changes - Changes object
   * @returns {boolean}
   */
  hasRuleChanges(changes) {
    if (!changes) return false;
    
    // Check array format
    if (Array.isArray(changes.rules) && changes.rules.length > 0) {
      return true;
    }
    
    // Check object format
    if (changes.rules && typeof changes.rules === 'object') {
      const rules = changes.rules;
      return (
        (rules.added && rules.added.length > 0) ||
        (rules.updated && rules.updated.length > 0) ||
        (rules.deleted && rules.deleted.length > 0)
      );
    }
    
    return false;
  }
  
  /**
   * Determine if changes require a full rebuild
   * @param {Object} request - Request with changes
   * @returns {boolean}
   */
  requiresFullRebuild(request) {
    // Check for force rebuild flag
    if (request.forceRebuild) {
      return true;
    }
    
    const changeType = this.detectChangeType(request);
    
    // Complex changes and dependency/rule changes require full rebuild
    return changeType === 'COMPLEX';
  }
  
  /**
   * Get list of affected modifier IDs from changes
   * @param {Object} changes - Changes object
   * @returns {Array<string>} - Array of modifier IDs
   */
  getAffectedModifiers(changes) {
    const modifierIds = [];
    
    if (!changes || !changes.modifiers) {
      return modifierIds;
    }
    
    const mods = changes.modifiers;
    
    // Handle array format
    if (Array.isArray(mods)) {
      mods.forEach(mod => {
        if (mod.id) {
          modifierIds.push(mod.id);
        }
      });
      return modifierIds;
    }
    
    // Handle object format with added/updated/deleted
    if (typeof mods === 'object') {
      // Added modifiers
      if (mods.added && Array.isArray(mods.added)) {
        mods.added.forEach(mod => {
          if (mod.id) {
            modifierIds.push(mod.id);
          }
        });
      }
      
      // Updated modifiers
      if (mods.updated && Array.isArray(mods.updated)) {
        mods.updated.forEach(mod => {
          if (mod.id) {
            modifierIds.push(mod.id);
          }
        });
      }
      
      // Deleted modifiers (array of IDs)
      if (mods.deleted && Array.isArray(mods.deleted)) {
        mods.deleted.forEach(id => {
          modifierIds.push(id);
        });
      }
    }
    
    return modifierIds;
  }
}

module.exports = ChangeDetector;