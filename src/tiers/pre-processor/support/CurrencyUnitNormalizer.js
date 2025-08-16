/**
 * CurrencyUnitNormalizer - Normalizes monetary values and units
 * 
 * Purpose:
 * - Convert all amounts to base currency
 * - Normalize unit representations
 * - Handle currency precision rules
 * 
 * @class CurrencyUnitNormalizer
 */
class CurrencyUnitNormalizer {
  constructor() {
    /**
     * Currency configuration
     */
    this.currencies = {
      USD: { symbol: '$', decimals: 2, separator: '.' },
      EUR: { symbol: '€', decimals: 2, separator: ',' },
      GBP: { symbol: '£', decimals: 2, separator: '.' },
      JPY: { symbol: '¥', decimals: 0, separator: '' }
    };
    
    /**
     * Unit normalization mappings
     */
    this.unitMappings = {
      // Length
      'ft': 'feet',
      'foot': 'feet',
      'in': 'inches',
      'inch': 'inches',
      'm': 'meters',
      'meter': 'meters',
      
      // Weight
      'lb': 'pounds',
      'pound': 'pounds',
      'kg': 'kilograms',
      'kilogram': 'kilograms',
      
      // Time
      'hr': 'hours',
      'hour': 'hours',
      'min': 'minutes',
      'minute': 'minutes',
      
      // Count
      'pc': 'pieces',
      'piece': 'pieces',
      'ea': 'each'
    };
  }
  
  /**
   * Normalize all monetary and unit values
   * 
   * @param {Object} data - Data to normalize
   * @param {string} baseCurrency - Target currency code
   * @returns {Object} Normalized data
   */
  normalizeAll(data, baseCurrency = 'USD') {
    const normalized = JSON.parse(JSON.stringify(data));
    
    // Get currency config
    const currencyConfig = this.currencies[baseCurrency];
    if (!currencyConfig) {
      throw new Error(`Unknown currency: ${baseCurrency}`);
    }
    
    // Store normalization metadata
    normalized._normalization = {
      currency: baseCurrency,
      decimals: currencyConfig.decimals,
      timestamp: new Date().toISOString()
    };
    
    // Normalize line items
    if (normalized.lineItems) {
      normalized.lineItems = normalized.lineItems.map(item => 
        this.normalizeLineItem(item, currencyConfig)
      );
    }
    
    // Normalize modifiers
    if (normalized.modifiers) {
      normalized.modifiers = normalized.modifiers.map(modifier => 
        this.normalizeModifier(modifier, currencyConfig)
      );
    }
    
    return normalized;
  }
  
  /**
   * Normalize line item monetary and unit values
   */
  normalizeLineItem(item, currencyConfig) {
    const normalized = { ...item };
    
    // Normalize unit price (remove currency symbols)
    if (item.unit_price !== undefined && item.unit_price !== null) {
      try {
        normalized.unit_price = this.normalizeMonetaryValue(
          item.unit_price,
          currencyConfig
        );
      } catch (error) {
        console.warn(`Failed to normalize unit_price for item ${item.id}: ${error.message}`);
      }
    }
    
    // Normalize quantity unit
    if (item.unit) {
      normalized.unit = this.normalizeUnit(item.unit);
      normalized.unit_original = item.unit; // Preserve original
    }
    
    // Add currency metadata
    normalized.currency = currencyConfig.symbol;
    
    return normalized;
  }
  
  /**
   * Normalize modifier monetary values
   */
  normalizeModifier(modifier, currencyConfig) {
    const normalized = { ...modifier };
    
    // Fixed amount modifiers
    if (modifier.type === 'FIXED' && modifier.amount !== undefined && modifier.amount !== null) {
      try {
        normalized.amount = this.normalizeMonetaryValue(
          modifier.amount,
          currencyConfig
        );
      } catch (error) {
        console.warn(`Failed to normalize amount for modifier ${modifier.id}: ${error.message}`);
      }
    }
    
    // Computed values
    if (modifier.computed_value !== undefined && modifier.computed_value !== null) {
      try {
        normalized.computed_value = this.normalizeMonetaryValue(
          modifier.computed_value,
          currencyConfig
        );
      } catch (error) {
        console.warn(`Failed to normalize computed_value for modifier ${modifier.id}: ${error.message}`);
      }
    }
    
    return normalized;
  }
  
  /**
   * Normalize monetary value
   * Remove symbols, validate decimals
   */
  normalizeMonetaryValue(value, currencyConfig) {
    let str = String(value);
    
    // Remove currency symbols and whitespace
    str = str.replace(/[$€£¥,\s]/g, '');
    
    // Validate numeric
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new Error(`Invalid monetary value: ${value}`);
    }
    
    // Check decimal places
    const parts = str.split('.');
    if (parts[1] && parts[1].length > currencyConfig.decimals) {
      console.warn(
        `Value ${str} exceeds ${currencyConfig.decimals} decimals for currency`
      );
      // Note: Pure Engine will handle actual rounding
      // We just warn here
    }
    
    return str;
  }
  
  /**
   * Normalize unit strings
   */
  normalizeUnit(unit) {
    if (!unit) return unit;
    
    // Convert to lowercase for lookup
    const lower = unit.toLowerCase().trim();
    
    // Check mapping
    if (this.unitMappings[lower]) {
      return this.unitMappings[lower];
    }
    
    // Check if already normalized
    const normalized = Object.values(this.unitMappings);
    if (normalized.includes(lower)) {
      return lower;
    }
    
    // Unknown unit - preserve but log
    console.warn(`Unknown unit: ${unit}`);
    return unit;
  }
  
  /**
   * Validate currency/unit consistency
   */
  validateConsistency(data) {
    const errors = [];
    const warnings = [];
    
    // Check all items use same currency
    const currencies = new Set();
    
    if (data.lineItems) {
      data.lineItems.forEach(item => {
        if (item.currency) currencies.add(item.currency);
      });
    }
    
    if (currencies.size > 1) {
      errors.push(`Multiple currencies detected: ${Array.from(currencies).join(', ')}`);
    }
    
    // Check unit consistency within categories
    const unitsByCategory = new Map();
    
    if (data.lineItems) {
      data.lineItems.forEach(item => {
        if (item.category && item.unit) {
          if (!unitsByCategory.has(item.category)) {
            unitsByCategory.set(item.category, new Set());
          }
          unitsByCategory.get(item.category).add(item.unit);
        }
      });
    }
    
    // Warn about mixed units in same category
    for (const [category, units] of unitsByCategory) {
      if (units.size > 1) {
        warnings.push(
          `Category "${category}" has mixed units: ${Array.from(units).join(', ')}`
        );
      }
    }
    
    return { errors, warnings };
  }
}

module.exports = CurrencyUnitNormalizer;