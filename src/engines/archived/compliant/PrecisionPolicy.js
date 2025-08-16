/**
 * PrecisionPolicy - Centralized precision and rounding management
 * 
 * Ensures consistent precision handling across all calculation operations:
 * - 7-decimal precision for ALL intermediate calculations
 * - 2-decimal precision for final customer-facing outputs ONLY
 * - ROUND_HALF_UP rounding mode consistently
 * 
 * @author Architecture Team
 * @date 2025-01-15
 * @version 1.0.0
 */

const Decimal = require('decimal.js');

const PrecisionPolicy = {
  // Constants
  INTERMEDIATE_SCALE: 7,
  FINAL_SCALE: 2,
  ROUNDING_MODE: Decimal.ROUND_HALF_UP,
  
  /**
   * Apply intermediate precision (7 decimals)
   * @param {string|number|Decimal} value - Value to round
   * @returns {Decimal} - Decimal with 7-decimal precision
   */
  intermediate(value) {
    return new Decimal(value).toDecimalPlaces(
      this.INTERMEDIATE_SCALE, 
      this.ROUNDING_MODE
    );
  },
  
  /**
   * Apply final precision (2 decimals)
   * @param {string|number|Decimal} value - Value to round
   * @returns {Decimal} - Decimal with 2-decimal precision
   */
  final(value) {
    return new Decimal(value).toDecimalPlaces(
      this.FINAL_SCALE,
      this.ROUNDING_MODE
    );
  },
  
  /**
   * Get intermediate value as string with 7 decimals
   * @param {string|number|Decimal} value - Value to format
   * @returns {string} - String with exactly 7 decimal places
   */
  intermediateString(value) {
    return this.intermediate(value).toFixed(this.INTERMEDIATE_SCALE);
  },
  
  /**
   * Get final value as string with 2 decimals
   * @param {string|number|Decimal} value - Value to format
   * @returns {string} - String with exactly 2 decimal places
   */
  finalString(value) {
    return this.final(value).toFixed(this.FINAL_SCALE);
  },
  
  /**
   * Apply precision throughout a calculation chain
   * Ensures intermediate precision is maintained
   * @param {Decimal} value - Current value
   * @param {Function} operation - Operation to apply
   * @returns {Decimal} - Result with intermediate precision
   */
  applyOperation(value, operation) {
    const result = operation(new Decimal(value));
    return this.intermediate(result);
  },
  
  /**
   * Sum values with intermediate precision
   * @param {Array<string|number|Decimal>} values - Values to sum
   * @returns {Decimal} - Sum with intermediate precision
   */
  sum(values) {
    const total = values.reduce((acc, val) => {
      return acc.plus(new Decimal(val));
    }, new Decimal(0));
    return this.intermediate(total);
  },
  
  /**
   * Calculate percentage with intermediate precision
   * @param {string|number|Decimal} base - Base amount
   * @param {string|number|Decimal} rate - Percentage rate (0.1 = 10%)
   * @returns {Decimal} - Result with intermediate precision
   */
  percentage(base, rate) {
    const result = new Decimal(base).times(new Decimal(rate));
    return this.intermediate(result);
  },
  
  /**
   * Validate precision of a value
   * @param {string} value - Value to validate
   * @param {number} expectedScale - Expected decimal places
   * @returns {boolean} - True if valid
   */
  validatePrecision(value, expectedScale) {
    if (typeof value !== 'string') return false;
    
    const match = value.match(/\.(\d+)$/);
    if (!match) {
      // No decimal part, check if expectedScale is 0
      return expectedScale === 0;
    }
    
    return match[1].length === expectedScale;
  },
  
  /**
   * Ensure value has exact decimal places (padding zeros if needed)
   * @param {string|number|Decimal} value - Value to format
   * @param {number} scale - Number of decimal places
   * @returns {string} - Formatted string
   */
  ensureScale(value, scale) {
    const decimal = new Decimal(value);
    return decimal.toFixed(scale);
  }
};

module.exports = PrecisionPolicy;