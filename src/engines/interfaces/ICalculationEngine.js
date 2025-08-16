/**
 * ICalculationEngine - Base interface for all calculation engines
 * 
 * This interface defines the contract that all calculation engines must implement.
 * It ensures consistent behavior across different engine implementations and
 * enables seamless switching between engines via configuration.
 * 
 * @author Architecture Team
 * @date 2025-08-13
 * @version 2.0.0
 */

class ICalculationEngine {
  constructor() {
    // Engine metadata
    this.version = '2.0.0';
    this.capabilities = [];
    this.name = this.constructor.name;
    
    // Ensure this is an abstract class
    if (this.constructor === ICalculationEngine) {
      throw new Error('ICalculationEngine is an abstract class and cannot be instantiated directly');
    }
  }
  
  /**
   * Main calculation method - all engines MUST implement this
   * 
   * @param {CalculationInput} input - Standardized input containing all required data
   * @returns {Promise<CalculationResult>} - Standardized calculation result
   * @throws {Error} - If calculation fails or input is invalid
   */
  async calculate(input) {
    throw new Error(`${this.name} must implement calculate() method`);
  }
  
  /**
   * Validates that input meets minimum requirements
   * Subclasses can override to add additional validation
   * 
   * @param {CalculationInput} input - Input to validate
   * @returns {boolean} - True if valid
   * @throws {Error} - If validation fails with specific reason
   */
  validateInput(input) {
    if (!input) {
      throw new Error('Input is required');
    }
    
    if (!input.proposal) {
      throw new Error('Proposal is required in calculation input');
    }
    
    if (!input.lineItems || !Array.isArray(input.lineItems)) {
      throw new Error('Line items array is required in calculation input');
    }
    
    if (!input.modifiers || !Array.isArray(input.modifiers)) {
      throw new Error('Modifiers array is required in calculation input');
    }
    
    return true;
  }
  
  /**
   * Validates that result meets contract requirements
   * Subclasses can override to add additional validation
   * 
   * @param {CalculationResult} result - Result to validate
   * @returns {boolean} - True if valid
   * @throws {Error} - If validation fails with specific reason
   */
  validateResult(result) {
    if (!result) {
      throw new Error('Result cannot be null');
    }
    
    // Required financial fields
    const requiredFields = [
      'subtotal',
      'grandTotal',
      'grandTotalPrecise',
      'phaseTimings',
      'auditRecord'
    ];
    
    for (const field of requiredFields) {
      if (result[field] === undefined || result[field] === null) {
        throw new Error(`Result missing required field: ${field}`);
      }
    }
    
    // Validate precision
    if (typeof result.grandTotalPrecise === 'string') {
      const match = result.grandTotalPrecise.match(/\.\d+$/);
      if (!match || match[0].length !== 8) { // 7 decimals + dot
        throw new Error('grandTotalPrecise must have exactly 7 decimal places');
      }
    }
    
    // Validate rounding
    if (typeof result.grandTotal === 'string') {
      const match = result.grandTotal.match(/\.\d+$/);
      if (!match || match[0].length !== 3) { // 2 decimals + dot
        throw new Error('grandTotal must have exactly 2 decimal places');
      }
    }
    
    return true;
  }
  
  /**
   * Returns engine capabilities for feature detection
   * 
   * @returns {Array<string>} - List of supported capabilities
   */
  getCapabilities() {
    return this.capabilities;
  }
  
  /**
   * Checks if engine supports a specific capability
   * 
   * @param {string} capability - Capability to check
   * @returns {boolean} - True if supported
   */
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }
  
  /**
   * Returns engine version for compatibility checking
   * 
   * @returns {string} - Semantic version string
   */
  getVersion() {
    return this.version;
  }
  
  /**
   * Health check for engine readiness
   * Subclasses can override to add specific checks
   * 
   * @returns {Promise<boolean>} - True if engine is ready
   */
  async isHealthy() {
    return true;
  }
  
  /**
   * Cleanup method for engine shutdown
   * Subclasses should override if they have resources to clean up
   */
  async cleanup() {
    // Default: no cleanup needed
  }
}

module.exports = ICalculationEngine;