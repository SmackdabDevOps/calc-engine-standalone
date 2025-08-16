/**
 * MinimalContextBuilder - Builds only required context fields
 * 
 * Purpose:
 * - Include only fields actually used by rules
 * - Prevent PII leakage
 * - Minimize memory footprint
 * 
 * @class MinimalContextBuilder
 */
class MinimalContextBuilder {
  constructor() {
    this.requiresSubtotal = false;
  }
  
  /**
   * Build minimal evaluation context
   * 
   * @param {string[]} requiredPaths - Paths extracted from rules
   * @param {Object} data - Available data sources
   * @returns {Object} Minimal context with only required fields
   */
  buildMinimalContext(requiredPaths, data) {
    const context = {};
    
    // Only include required fields
    for (const path of requiredPaths) {
      const value = this.resolvePath(path, data);
      
      // Apply PII filtering
      const filteredValue = this.isPII(path) 
        ? this.redactPII(value)
        : value;
      
      this.setPath(context, path, filteredValue);
    }
    
    // Add computed aggregates if needed
    if (requiredPaths.some(p => p.startsWith('computed.'))) {
      context.computed = this.computeStaticAggregates(data);
    }
    
    return context;
  }
  
  /**
   * Resolve a path from data object
   */
  resolvePath(path, data) {
    const parts = path.split('.');
    let current = data;
    
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    
    return current;
  }
  
  /**
   * Set a path in the context object
   */
  setPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }
  
  /**
   * Compute only allowed static aggregates
   * NO business math, NO precision application
   */
  computeStaticAggregates(data) {
    const aggregates = {
      lineItemCount: 0,
      totalQuantity: '0'
    };
    
    if (data.lineItems && Array.isArray(data.lineItems)) {
      aggregates.lineItemCount = data.lineItems.length;
      
      aggregates.totalQuantity = data.lineItems
        .reduce((sum, item) => {
          const qty = parseFloat(item.quantity || '0');
          return sum + qty;
        }, 0)
        .toString();
    }
    
    // Only include raw subtotal if explicitly required
    // This is sum without any modifiers or rounding
    if (this.requiresSubtotal && data.lineItems) {
      aggregates.rawSubtotal = data.lineItems
        .reduce((sum, item) => {
          const qty = parseFloat(item.quantity || '0');
          const price = parseFloat(item.unit_price || '0');
          return sum + (qty * price);
        }, 0)
        .toString();
    }
    
    return aggregates;
  }
  
  /**
   * Check if path contains PII
   */
  isPII(path) {
    const piiPaths = [
      'customer.email',
      'customer.name',
      'customer.phone',
      'customer.ssn',
      'project.address'
    ];
    return piiPaths.includes(path);
  }
  
  /**
   * Redact PII for logs/metrics
   */
  redactPII(value) {
    if (!value) return value;
    
    // Keep first/last char for debugging
    if (typeof value === 'string' && value.length > 2) {
      return value[0] + '***' + value[value.length - 1];
    }
    
    return '***';
  }
}

module.exports = MinimalContextBuilder;