/**
 * StaticAggregateCalculator - Strictly bounded aggregate computations
 * 
 * Purpose:
 * - Compute ONLY simple counts and sums
 * - NO business logic, NO precision rules
 * - NO modifiers, NO complex calculations
 * 
 * @class StaticAggregateCalculator
 */
class StaticAggregateCalculator {
  /**
   * Allowed aggregate operations
   * These are the ONLY computations Pre-Processor can perform
   */
  static ALLOWED_AGGREGATES = [
    'lineItemCount',
    'totalQuantity',
    'modifierCount',
    'hasDiscounts',
    'hasTaxes'
  ];
  
  /**
   * Compute allowed static aggregates
   * 
   * CRITICAL: No business math, no precision logic
   * All numeric values remain as strings
   * 
   * @param {Object} data - Input data
   * @returns {Object} Static aggregates only
   */
  computeStatic(data) {
    const aggregates = {};
    
    // Simple count operations
    aggregates.lineItemCount = data.lineItems ? data.lineItems.length : 0;
    aggregates.modifierCount = data.modifiers ? data.modifiers.length : 0;
    
    // Sum quantities (as strings, no precision)
    if (data.lineItems && Array.isArray(data.lineItems)) {
      aggregates.totalQuantity = data.lineItems
        .reduce((sum, item) => {
          // Parse as float for sum, return as string
          const qty = parseFloat(item.quantity || '0');
          return sum + qty;
        }, 0)
        .toString();
    } else {
      aggregates.totalQuantity = '0';
    }
    
    // Boolean flags only
    aggregates.hasDiscounts = false;
    aggregates.hasTaxes = false;
    
    if (data.modifiers && Array.isArray(data.modifiers)) {
      aggregates.hasDiscounts = data.modifiers.some(m => 
        m.type === 'DISCOUNT' || m.type === 'PERCENTAGE'
      );
      
      aggregates.hasTaxes = data.modifiers.some(m => 
        m.type === 'TAX' || (m.name && m.name.toLowerCase().includes('tax'))
      );
    }
    
    // FORBIDDEN: Do NOT compute these in Pre-Processor
    // - subtotal (requires precision rules)
    // - total (requires modifier application)
    // - tax_amount (business logic)
    // - discount_amount (calculation logic)
    
    return aggregates;
  }
  
  /**
   * Validate aggregate request
   * Reject any unauthorized computations
   */
  validateAggregateRequest(requestedAggregates) {
    const errors = [];
    
    for (const aggregate of requestedAggregates) {
      if (!StaticAggregateCalculator.ALLOWED_AGGREGATES.includes(aggregate)) {
        errors.push(
          `Unauthorized aggregate computation: ${aggregate}. ` +
          `Allowed: ${StaticAggregateCalculator.ALLOWED_AGGREGATES.join(', ')}`
        );
      }
    }
    
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
  }
}

module.exports = StaticAggregateCalculator;