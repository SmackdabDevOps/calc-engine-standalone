/**
 * CalculationInput - Standardized input contract for calculation engines
 * 
 * This class defines the structure and validation for all data passed to
 * calculation engines. It ensures consistency across different engine
 * implementations and provides clear documentation of required fields.
 * 
 * @author Architecture Team
 * @date 2025-08-13
 * @version 1.0.0
 */

class CalculationInput {
  /**
   * Creates a new CalculationInput instance
   * 
   * @param {Object} data - Input data
   * @param {Object} data.proposal - Proposal entity with metadata
   * @param {Array} data.lineItems - Array of line items to calculate
   * @param {Array} data.modifiers - Array of modifiers to apply
   * @param {Array} [data.dependencies] - Optional modifier dependencies
   * @param {Array} [data.rules] - Optional modifier rules
   * @param {Object} [data.config] - Optional calculation configuration
   * @param {Object} [data.taxConfig] - Optional tax configuration
   */
  constructor({
    proposal,
    lineItems,
    modifiers,
    dependencies = [],
    rules = [],
    config = {},
    taxConfig = null
  } = {}) {
    // Required fields
    this.proposal = proposal;
    this.lineItems = lineItems || [];
    this.modifiers = modifiers || [];
    
    // Optional fields
    this.dependencies = dependencies;
    this.rules = rules;
    this.config = config;
    this.taxConfig = taxConfig;
    
    // Metadata
    this.createdAt = new Date().toISOString();
    this.inputVersion = '1.0.0';
    
    // Validate on construction
    this.validate();
  }
  
  /**
   * Validates that all required fields are present and valid
   * 
   * @throws {Error} - If validation fails
   * @returns {boolean} - True if valid
   */
  validate() {
    // Proposal validation
    if (!this.proposal) {
      throw new Error('CalculationInput: proposal is required');
    }
    
    if (!this.proposal.id) {
      throw new Error('CalculationInput: proposal.id is required');
    }
    
    // Line items validation
    if (!Array.isArray(this.lineItems)) {
      throw new Error('CalculationInput: lineItems must be an array');
    }
    
    if (this.lineItems.length === 0) {
      console.warn('CalculationInput: lineItems array is empty');
    }
    
    // Validate each line item has required fields
    for (let i = 0; i < this.lineItems.length; i++) {
      const item = this.lineItems[i];
      if (!item.id) {
        throw new Error(`CalculationInput: lineItems[${i}].id is required`);
      }
      if (item.price === undefined || item.price === null) {
        throw new Error(`CalculationInput: lineItems[${i}].price is required`);
      }
      if (item.quantity === undefined || item.quantity === null) {
        throw new Error(`CalculationInput: lineItems[${i}].quantity is required`);
      }
    }
    
    // Modifiers validation
    if (!Array.isArray(this.modifiers)) {
      throw new Error('CalculationInput: modifiers must be an array');
    }
    
    // Dependencies validation
    if (!Array.isArray(this.dependencies)) {
      throw new Error('CalculationInput: dependencies must be an array');
    }
    
    // Rules validation
    if (!Array.isArray(this.rules)) {
      throw new Error('CalculationInput: rules must be an array');
    }
    
    // Config validation
    if (this.config && typeof this.config !== 'object') {
      throw new Error('CalculationInput: config must be an object');
    }
    
    return true;
  }
  
  /**
   * Creates a deep copy of the input to prevent mutations
   * 
   * @returns {CalculationInput} - Deep copy of this input
   */
  clone() {
    return new CalculationInput({
      proposal: JSON.parse(JSON.stringify(this.proposal)),
      lineItems: JSON.parse(JSON.stringify(this.lineItems)),
      modifiers: JSON.parse(JSON.stringify(this.modifiers)),
      dependencies: JSON.parse(JSON.stringify(this.dependencies)),
      rules: JSON.parse(JSON.stringify(this.rules)),
      config: JSON.parse(JSON.stringify(this.config)),
      taxConfig: this.taxConfig ? JSON.parse(JSON.stringify(this.taxConfig)) : null
    });
  }
  
  /**
   * Serializes input to JSON for logging or caching
   * 
   * @returns {string} - JSON representation
   */
  toJSON() {
    return JSON.stringify({
      proposal: this.proposal,
      lineItems: this.lineItems,
      modifiers: this.modifiers,
      dependencies: this.dependencies,
      rules: this.rules,
      config: this.config,
      taxConfig: this.taxConfig,
      metadata: {
        createdAt: this.createdAt,
        inputVersion: this.inputVersion,
        lineItemCount: this.lineItems.length,
        modifierCount: this.modifiers.length,
        dependencyCount: this.dependencies.length,
        ruleCount: this.rules.length
      }
    }, null, 2);
  }
  
  /**
   * Creates a hash of the input for caching purposes
   * 
   * @returns {string} - Hash string
   */
  getHash() {
    const crypto = require('crypto');
    const data = {
      proposalId: this.proposal.id,
      lineItemIds: this.lineItems.map(i => i.id).sort(),
      modifierIds: this.modifiers.map(m => m.id).sort(),
      config: this.config
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }
  
  /**
   * Gets a summary of the input for logging
   * 
   * @returns {Object} - Summary object
   */
  getSummary() {
    return {
      proposalId: this.proposal.id,
      lineItemCount: this.lineItems.length,
      modifierCount: this.modifiers.length,
      dependencyCount: this.dependencies.length,
      ruleCount: this.rules.length,
      hasConfig: Object.keys(this.config).length > 0,
      hasTaxConfig: this.taxConfig !== null
    };
  }
  
  /**
   * Factory method to create input from raw database results
   * 
   * @param {Object} data - Raw data from database
   * @returns {CalculationInput} - New input instance
   */
  static fromDatabase(data) {
    return new CalculationInput({
      proposal: data.proposal,
      lineItems: data.lineItems || [],
      modifiers: data.modifiers || [],
      dependencies: data.dependencies || [],
      rules: data.rules || [],
      config: data.config || {},
      taxConfig: data.taxConfig || null
    });
  }
}

module.exports = CalculationInput;