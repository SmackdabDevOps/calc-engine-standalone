/**
 * CalculationResult - Standardized output contract for calculation engines
 * 
 * This class defines the structure for all calculation results. It ensures
 * consistent output across different engine implementations and provides
 * proper precision handling per architecture requirements.
 * 
 * @author Architecture Team
 * @date 2025-08-13
 * @version 1.0.0
 */

class CalculationResult {
  constructor() {
    // Financial values - 2 decimal display (customer-facing)
    this.subtotal = '0.00';           // Sum of line totals before modifiers
    this.modifierTotal = '0.00';      // Sum of all modifier adjustments
    this.discountTotal = '0.00';      // Total discounts (negative value)
    this.taxAmount = '0.00';          // Retail tax amount (customer pays)
    this.grandTotal = '0.00';         // Final amount (2 decimals)
    
    // Mixed tax mode fields
    this.customerGrandTotal = '0.00';    // Customer total (excludes use tax)
    this.internalGrandTotal = '0.00';    // Internal total (includes use tax)
    this.retailTax = '0.00';              // Retail tax amount (string, not object)
    
    // Precise values - 7 decimal precision (internal)
    this.subtotalPrecise = '0.0000000';
    this.modifierTotalPrecise = '0.0000000';
    this.taxAmountPrecise = '0.0000000';
    this.grandTotalPrecise = '0.0000000';
    
    // Tax segregation (per architecture requirements)
    this.taxableBase = '0.00';           // Amount subject to retail tax
    this.taxableBasePrecise = '0.0000000';
    this.nonTaxableTotal = '0.00';       // Amount not subject to retail tax
    this.nonTaxableTotalPrecise = '0.0000000';
    
    // Use tax tracking (internal liability, not customer-facing)
    this.useTaxBase = '0.00';            // Cost basis for use tax
    this.useTaxBasePrecise = '0.0000000';
    this.useTaxAmount = '0.00';          // Use tax liability
    this.useTaxAmountPrecise = '0.0000000';
    this.useTax = '0.00';                // Alias for compatibility
    this.useTaxItems = [];             // Items subject to use tax
    
    // Tax details with sub-rates
    this.taxCalculation = null;        // Detailed tax breakdown
    this.taxMode = null;               // RETAIL | USE_TAX | MIXED
    
    // Modifier tracking
    this.appliedModifiers = [];        // Modifiers that were applied
    this.filteredModifiers = [];       // Modifiers filtered by rules/dependencies
    this.modifierGroups = [];          // Grouped modifiers with 8 attributes
    
    // Audit and compliance
    this.auditRecord = null;           // Complete audit trail
    this.phaseTimings = {};            // Performance metrics per phase
    this.calcId = null;                // Unique calculation ID
    this.version = null;                // Proposal version
    this.checksum = null;              // Result checksum for validation
    
    // Metadata
    this.createdAt = new Date().toISOString();
    this.engineVersion = null;         // Which engine produced this
    this.resultVersion = '1.0.0';      // Result schema version
    
    // Error tracking
    this.errors = [];                  // Non-fatal errors/warnings
    this.status = 'pending';           // pending | success | partial | failed
  }
  
  /**
   * Sets financial values with proper precision handling
   * Automatically maintains both display and precise values
   * 
   * @param {string|number} value - Value to set
   * @param {string} field - Field name (without 'Precise' suffix)
   */
  setFinancialValue(field, value) {
    // Convert to string for precision handling
    const strValue = String(value);
    
    // Set precise value (7 decimals)
    const preciseField = `${field}Precise`;
    if (strValue.includes('.')) {
      const parts = strValue.split('.');
      const decimals = parts[1].padEnd(7, '0').substring(0, 7);
      this[preciseField] = `${parts[0]}.${decimals}`;
    } else {
      this[preciseField] = `${strValue}.0000000`;
    }
    
    // Set display value (2 decimals)
    const displayValue = parseFloat(strValue).toFixed(2);
    this[field] = displayValue;
  }
  
  /**
   * Validates that result meets contract requirements
   * 
   * @throws {Error} - If validation fails
   * @returns {boolean} - True if valid
   */
  validate() {
    // Required fields
    if (this.grandTotal === null || this.grandTotal === undefined) {
      throw new Error('CalculationResult: grandTotal is required');
    }
    
    if (this.grandTotalPrecise === null || this.grandTotalPrecise === undefined) {
      throw new Error('CalculationResult: grandTotalPrecise is required');
    }
    
    // Precision validation
    if (typeof this.grandTotalPrecise === 'string') {
      const match = this.grandTotalPrecise.match(/\.\d+$/);
      if (!match || match[0].length !== 8) { // 7 decimals + dot
        throw new Error('CalculationResult: grandTotalPrecise must have exactly 7 decimal places');
      }
    }
    
    // Rounding validation
    if (typeof this.grandTotal === 'string') {
      const match = this.grandTotal.match(/\.\d+$/);
      if (!match || match[0].length !== 3) { // 2 decimals + dot
        throw new Error('CalculationResult: grandTotal must have exactly 2 decimal places');
      }
    }
    
    // Phase timings required
    if (!this.phaseTimings || typeof this.phaseTimings !== 'object') {
      throw new Error('CalculationResult: phaseTimings is required');
    }
    
    // Audit record required
    if (!this.auditRecord) {
      throw new Error('CalculationResult: auditRecord is required');
    }
    
    return true;
  }
  
  /**
   * Creates audit record with all required fields
   * 
   * @param {Object} data - Audit data
   */
  createAuditRecord(data = {}) {
    this.auditRecord = {
      calc_id: this.calcId || this.generateCalcId(),
      tenant: data.tenant || 'unknown',
      proposal_id: data.proposalId,
      version: this.version || 1,
      started_at: data.startedAt || this.createdAt,
      finished_at: new Date().toISOString(),
      phase_timings_ms: this.phaseTimings,
      groups: this.modifierGroups.map(g => ({
        key: g.key,
        combined_value: g.combinedValue,
        adjustment_precise: g.adjustmentPrecise,
        modifiers: g.modifierIds,
        allocations: Array.isArray(g.allocations) ? g.allocations : []
      })),
      tax_calculation: this.taxCalculation,
      retail_taxable_base_precise: this.taxableBasePrecise,
      retail_non_taxable_precise: this.nonTaxableTotalPrecise,
      retail_tax_precise: this.taxAmountPrecise,
      use_tax_base_precise: this.useTaxBasePrecise,
      use_tax_precise: this.useTaxAmountPrecise,
      use_tax_items: this.useTaxItems,
      customer_grand_total_precise: this.grandTotalPrecise,
      grand_total: this.grandTotal,
      tax_mode: this.taxMode,
      status: this.status,
      errors: this.errors
    };
  }
  
  /**
   * Generates unique calculation ID
   * 
   * @returns {string} - UUID v4
   */
  generateCalcId() {
    const crypto = require('crypto');
    return crypto.randomUUID();
  }
  
  /**
   * Generates checksum for result validation
   * Ensures deterministic output regardless of key order
   * 
   * @returns {string} - SHA256 hash
   */
  generateChecksum() {
    const crypto = require('crypto');
    
    // Create canonical data structure with sorted keys
    const data = {
      proposalId: this.proposalId,
      version: this.version,
      precise: {
        subtotal: this.subtotalPrecise,
        modifiers: this.modifierTotalPrecise,
        retailTax: this.taxAmountPrecise,
        useTax: this.useTaxAmountPrecise || '0.0000000',
        grandTotal: this.grandTotalPrecise
      }
    };
    
    // Canonicalize with sorted keys for determinism
    const canonicalize = (obj) => {
      return JSON.stringify(obj, Object.keys(obj).sort());
    };
    
    this.checksum = crypto
      .createHash('sha256')
      .update(canonicalize(data))
      .digest('hex');
    return this.checksum;
  }
  
  /**
   * Marks calculation as successful
   */
  markSuccess() {
    this.status = 'success';
    if (this.auditRecord) {
      this.auditRecord.status = 'success';
    }
  }
  
  /**
   * Marks calculation as failed
   * 
   * @param {Error} error - Error that caused failure
   */
  markFailed(error) {
    this.status = 'failed';
    this.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    if (this.auditRecord) {
      this.auditRecord.status = 'failed';
      this.auditRecord.errors = this.errors;
    }
  }
  
  /**
   * Adds warning without failing calculation
   * 
   * @param {string} message - Warning message
   */
  addWarning(message) {
    this.errors.push({
      type: 'warning',
      message,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Converts result to API response format
   * Maintains backward compatibility with existing API
   * 
   * @returns {Object} - API response object
   */
  toApiResponse() {
    // Basic backward-compatible response structure
    const response = {
      // Required fields for backward compatibility
      proposal_id: this.proposalId || null,
      subtotal: this.subtotal,
      discount_total: this.discountTotal || '0.00',
      taxable_amount: this.taxableBase || this.subtotal,
      tax_amount: this.taxAmount,
      total_amount: this.grandTotal,
      line_count: this.lineCount || 0,
      calculation_time_ms: this.phaseTimings?.total || 0,
      cached: false,
      calculated_at: this.calculatedAt || new Date().toISOString()
    };
    
    // Only add extended fields if explicitly requested
    // These can be added via the route based on options
    
    return response;
  }
  
  /**
   * Serializes result to JSON for logging or caching
   * 
   * @returns {string} - JSON representation
   */
  toJSON() {
    return JSON.stringify(this, null, 2);
  }
  
  /**
   * Creates result from legacy calculation output
   * Used for backward compatibility
   * 
   * @param {Object} legacyData - Data from current implementation
   * @returns {CalculationResult} - New result instance
   */
  static fromLegacy(legacyData) {
    const result = new CalculationResult();
    
    // Map legacy fields
    result.setFinancialValue('grandTotal', legacyData.grand_total || 0);
    result.setFinancialValue('subtotal', legacyData.subtotal || 0);
    result.setFinancialValue('taxAmount', legacyData.tax_amount || 0);
    result.setFinancialValue('modifierTotal', legacyData.modifier_total || 0);
    
    // Set other fields
    result.appliedModifiers = legacyData.applied_modifiers || [];
    result.status = 'success';
    
    return result;
  }
}

module.exports = CalculationResult;