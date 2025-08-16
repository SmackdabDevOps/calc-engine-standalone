/**
 * NumericTypeEnforcer - Ensures consistent numeric handling
 * 
 * Purpose:
 * - All numbers stored as strings for precision
 * - Validate numeric formats
 * - Prevent precision loss
 * 
 * @class NumericTypeEnforcer
 */
class NumericTypeEnforcer {
  constructor() {
    /**
     * Maximum safe decimal places
     * Beyond this, we risk precision issues
     */
    this.MAX_DECIMALS = 10;
    
    /**
     * Fields that must be numeric strings
     */
    this.numericFields = {
      lineItem: ['quantity', 'unit_price', 'amount'],
      modifier: ['amount', 'value', 'computed_value'],
      proposal: ['subtotal', 'total', 'tax_amount']
    };
  }
  
  /**
   * Normalize all numeric values to strings
   * 
   * CRITICAL: Prevents JavaScript floating point errors
   * All math happens in Pure Engine with decimal library
   * 
   * @param {Object} data - Data to normalize
   * @returns {Object} Data with normalized numerics
   */
  normalizeNumerics(data) {
    const normalized = JSON.parse(JSON.stringify(data));
    
    // Normalize line items
    if (normalized.lineItems) {
      normalized.lineItems = normalized.lineItems.map(item => 
        this.normalizeEntity(item, 'lineItem')
      );
    }
    
    // Normalize modifiers
    if (normalized.modifiers) {
      normalized.modifiers = normalized.modifiers.map(modifier => 
        this.normalizeEntity(modifier, 'modifier')
      );
    }
    
    // Normalize proposal
    if (normalized.proposal) {
      normalized.proposal = this.normalizeEntity(normalized.proposal, 'proposal');
    }
    
    return normalized;
  }
  
  /**
   * Normalize numeric fields in an entity
   */
  normalizeEntity(entity, type) {
    const fields = this.numericFields[type] || [];
    const normalized = { ...entity };
    
    for (const field of fields) {
      if (entity[field] !== undefined && entity[field] !== null) {
        try {
          normalized[field] = this.toNumericString(entity[field]);
        } catch (error) {
          console.warn(`Failed to normalize ${type}.${field}: ${error.message}`);
          // Keep original value if normalization fails
          normalized[field] = entity[field];
        }
      }
    }
    
    return normalized;
  }
  
  /**
   * Convert value to numeric string
   * 
   * @param {any} value - Value to convert
   * @returns {string} Numeric string representation
   */
  toNumericString(value) {
    // Already a string
    if (typeof value === 'string') {
      // Validate it's a valid number
      if (this.isValidNumeric(value)) {
        return this.normalizeDecimalString(value);
      }
      throw new Error(`Invalid numeric string: ${value}`);
    }
    
    // Number type - convert carefully
    if (typeof value === 'number') {
      // Check for special values
      if (!isFinite(value)) {
        throw new Error(`Non-finite number: ${value}`);
      }
      
      // Convert to string, preserving precision
      let str = value.toString();
      
      // Handle exponential notation
      if (str.includes('e')) {
        // Convert from exponential to decimal
        const [mantissa, exponent] = str.split('e');
        const exp = parseInt(exponent, 10);
        
        if (exp > 0) {
          // Move decimal right
          const parts = mantissa.split('.');
          const intPart = parts[0] || '0';
          const decPart = parts[1] || '';
          const totalDigits = intPart + decPart;
          const decimalPos = intPart.length + exp;
          
          if (decimalPos >= totalDigits.length) {
            str = totalDigits + '0'.repeat(decimalPos - totalDigits.length);
          } else {
            str = totalDigits.slice(0, decimalPos) + '.' + totalDigits.slice(decimalPos);
          }
        } else {
          // Move decimal left
          const parts = mantissa.split('.');
          const intPart = parts[0] || '0';
          const decPart = parts[1] || '';
          const absExp = Math.abs(exp);
          
          str = '0.' + '0'.repeat(absExp - 1) + intPart + decPart;
        }
      }
      
      return this.normalizeDecimalString(str);
    }
    
    // Invalid type
    throw new Error(`Cannot convert to numeric string: ${typeof value}`);
  }
  
  /**
   * Validate numeric string format
   */
  isValidNumeric(str) {
    // Regular expression for valid decimal numbers
    // Allows: "123", "123.456", "-123.456", "0.123"
    // Disallows: "1e10", "NaN", "Infinity", "1.2.3"
    const regex = /^-?\d+(\.\d+)?$/;
    
    if (!regex.test(str)) {
      return false;
    }
    
    // Check decimal places
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length > this.MAX_DECIMALS) {
      console.warn(`Exceeds max decimals (${this.MAX_DECIMALS}): ${str}`);
      // Still valid, just a warning
    }
    
    return true;
  }
  
  /**
   * Normalize decimal string format
   * Removes trailing zeros, handles negative zero
   */
  normalizeDecimalString(str) {
    // Handle negative zero
    if (str === '-0' || str === '-0.0' || str === '-0.00') {
      return '0';
    }
    
    // Remove unnecessary trailing zeros after decimal
    if (str.includes('.')) {
      // Remove trailing zeros
      str = str.replace(/(\.\d*?)0+$/, '$1');
      // Remove trailing decimal point
      str = str.replace(/\.$/, '');
    }
    
    // Ensure at least "0" for empty string
    if (str === '' || str === '-') {
      return '0';
    }
    
    return str;
  }
  
  /**
   * Validate all numeric fields in data
   */
  validateNumerics(data) {
    const errors = [];
    
    // Check line items
    if (data.lineItems) {
      for (const item of data.lineItems) {
        for (const field of this.numericFields.lineItem) {
          if (item[field] !== undefined && item[field] !== null) {
            if (typeof item[field] !== 'string') {
              errors.push(
                `Line item ${item.id} field ${field} must be string, got ${typeof item[field]}`
              );
            } else if (!this.isValidNumeric(item[field])) {
              errors.push(
                `Line item ${item.id} field ${field} invalid numeric: ${item[field]}`
              );
            }
          }
        }
      }
    }
    
    // Check modifiers
    if (data.modifiers) {
      for (const modifier of data.modifiers) {
        for (const field of this.numericFields.modifier) {
          if (modifier[field] !== undefined && modifier[field] !== null) {
            if (typeof modifier[field] !== 'string') {
              errors.push(
                `Modifier ${modifier.id} field ${field} must be string, got ${typeof modifier[field]}`
              );
            } else if (!this.isValidNumeric(modifier[field])) {
              errors.push(
                `Modifier ${modifier.id} field ${field} invalid numeric: ${modifier[field]}`
              );
            }
          }
        }
      }
    }
    
    return errors;
  }
}

module.exports = NumericTypeEnforcer;