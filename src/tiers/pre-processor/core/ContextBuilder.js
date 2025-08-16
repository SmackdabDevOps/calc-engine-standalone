/**
 * ContextBuilder - Builds evaluation context from paths and data
 * 
 * Features:
 * - Build context from extracted paths
 * - Merge multiple contexts
 * - Extract values from nested paths
 * - Add calculated fields
 * 
 * @version 1.0.0
 */

class ContextBuilder {
  /**
   * Build context from paths and data
   * @param {Array<string>} paths - Array of field paths
   * @param {Object} data - Data object with all fetched data
   * @returns {Promise<Object>} - Built context
   */
  async build(paths, data) {
    const context = {};
    
    for (const path of paths) {
      const value = this.extractValue(data, path);
      this.setValue(context, path, value);
    }
    
    return context;
  }
  
  /**
   * Extract value from data using path
   * @param {Object} data - Data object
   * @param {string} path - Dot-separated path
   * @returns {any} - Extracted value or null
   */
  extractValue(data, path) {
    if (!data || !path) {
      return null;
    }
    
    // Handle array indexing like items[0].name
    const cleanPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = cleanPath.split('.');
    
    let current = data;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return null;
      }
      
      // Handle array index
      if (/^\d+$/.test(part)) {
        current = current[parseInt(part, 10)];
      } else {
        // Handle normal property
        current = current[part];
        
        // Special handling for plural to singular conversion
        // e.g., lineItem path should work with lineItems data
        if (current === undefined) {
          const singularForm = part.replace(/s$/, '');
          const pluralForm = part + 's';
          
          if (data[pluralForm] && Array.isArray(data[pluralForm])) {
            // Use first item from array
            current = data[pluralForm][0];
            if (current) {
              // Continue with the remaining path on the first item
              continue;
            }
          } else if (data[singularForm]) {
            current = data[singularForm];
          }
        }
      }
    }
    
    return current !== undefined ? current : null;
  }
  
  /**
   * Set value in object at path
   * @param {Object} obj - Target object
   * @param {string} path - Dot-separated path
   * @param {any} value - Value to set
   */
  setValue(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }
  
  /**
   * Merge multiple contexts
   * @param {...Object} contexts - Contexts to merge
   * @returns {Object} - Merged context
   */
  merge(...contexts) {
    const result = {};
    
    for (const context of contexts) {
      this.deepMerge(result, context);
    }
    
    return result;
  }
  
  /**
   * Deep merge helper
   * @private
   */
  deepMerge(target, source) {
    if (!source) return target;
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = target[key];
        
        if (Array.isArray(sourceValue)) {
          // Arrays are replaced, not merged
          target[key] = [...sourceValue];
        } else if (sourceValue && typeof sourceValue === 'object' && 
                   targetValue && typeof targetValue === 'object' &&
                   !Array.isArray(targetValue)) {
          // Recursively merge objects
          target[key] = target[key] || {};
          this.deepMerge(target[key], sourceValue);
        } else {
          // Primitive values or null
          target[key] = sourceValue;
        }
      }
    }
    
    return target;
  }
  
  /**
   * Add calculated fields to context
   * @param {Object} context - Base context
   * @returns {Object} - Context with calculated fields
   */
  addCalculatedFields(context) {
    const enhanced = { ...context };
    
    enhanced.calculated = {
      timestamp: Date.now()
    };
    
    // Calculate from line items if present
    if (context.lineItems && Array.isArray(context.lineItems)) {
      enhanced.calculated.lineItemCount = context.lineItems.length;
      
      let totalQuantity = 0;
      let subtotal = 0;
      
      for (const item of context.lineItems) {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        
        totalQuantity += qty;
        subtotal += price * qty;
      }
      
      enhanced.calculated.totalQuantity = totalQuantity;
      enhanced.calculated.subtotal = subtotal;
    }
    
    // Add other calculated fields as needed
    if (context.proposal) {
      enhanced.calculated.hasProposal = true;
    }
    
    if (context.customer) {
      enhanced.calculated.hasCustomer = true;
    }
    
    return enhanced;
  }
  
  /**
   * Create minimal context with only required fields
   * @param {Array<string>} paths - Required paths
   * @param {Object} fullContext - Full context
   * @returns {Object} - Minimal context
   */
  createMinimalContext(paths, fullContext) {
    const minimal = {};
    
    for (const path of paths) {
      const value = this.extractValue(fullContext, path);
      if (value !== null) {
        this.setValue(minimal, path, value);
      }
    }
    
    return minimal;
  }
}

module.exports = ContextBuilder;