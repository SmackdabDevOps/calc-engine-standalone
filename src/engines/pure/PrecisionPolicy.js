/**
 * PrecisionPolicy - Centralized precision and rounding management
 * 
 * CRITICAL COMPONENT: Implements Q7/Q2 precision policy from Mathematical Correctness Plan
 * 
 * Q7/Q2 POLICY EXPLANATION:
 * - Q7 (Intermediate): 7 decimal places for ALL calculations
 *   Prevents compound rounding errors in multi-step calculations
 *   Example: $100.0000000 not $100.00 during processing
 * 
 * - Q2 (Final): 2 decimal places ONLY for display/storage
 *   Matches currency display standards (dollars and cents)
 *   Applied ONCE at the very end of calculation chain
 * 
 * WHY THIS MATTERS:
 * Without Q7 intermediate precision, a chain of percentage calculations
 * can accumulate errors. Example:
 *   Wrong: $100 × 0.10 = $10.00 × 0.15 = $1.50 (rounded each step)
 *   Right: $100 × 0.10 = $10.0000000 × 0.15 = $1.5000000 → $1.50 (round once)
 * 
 * ROUNDING STRATEGY:
 * - ROUND_HALF_UP: Standard commercial rounding (0.5 rounds up)
 * - Matches Excel, QuickBooks, and most financial systems
 * - Ensures reproducible results across platforms
 * 
 * @author Architecture Team
 * @date 2025-01-15
 * @version 1.0.0
 */

const Decimal = require('decimal.js');

const PrecisionPolicy = {
  // Constants defining the Q7/Q2 policy
  INTERMEDIATE_SCALE: 7,  // Q7: 7 decimals for calculations
  FINAL_SCALE: 2,         // Q2: 2 decimals for display
  ROUNDING_MODE: Decimal.ROUND_HALF_UP,  // 0.5 → 1, -0.5 → -1
  
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