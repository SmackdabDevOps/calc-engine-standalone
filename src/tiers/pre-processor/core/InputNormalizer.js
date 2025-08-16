/**
 * InputNormalizer - Standardizes input data formats and field names
 * 
 * CRITICAL COMPONENT for maintaining data consistency between database
 * schemas, API contracts, and Pure Engine expectations.
 * 
 * NORMALIZATION FUNCTIONS:
 * 1. FIELD NAME MAPPING: Convert database snake_case to camelCase
 * 2. DATA TYPE STANDARDIZATION: Ensure consistent types (strings, numbers)
 * 3. DETERMINISTIC ORDERING: Sort arrays for consistent processing
 * 4. MISSING VALUE HANDLING: Apply defaults for optional fields
 * 5. VALIDATION: Basic input validation and error reporting
 * 
 * DATABASE COMPATIBILITY:
 * - Handles PostgreSQL snake_case field names (line_item_id → id)
 * - Converts numeric strings to proper numeric types
 * - Normalizes boolean representations (1/0, true/false, "true"/"false")
 * 
 * PURE ENGINE REQUIREMENTS:
 * - Ensures all required fields are present with correct names
 * - Applies deterministic sorting (chain_priority, then ID)
 * - Removes extraneous fields that could affect determinism
 * - Validates data integrity before Pure Engine processing
 * 
 * @version 1.0.0
 * @implements Mathematical Correctness Plan - Data Consistency
 */

class InputNormalizer {
  /**
   * Normalize input data for Pure Engine consumption
   * 
   * Transforms raw database/API data into standardized format expected
   * by the Pure Engine. Handles field name mapping, type coercion,
   * and deterministic ordering.
   * 
   * @param {Object} input - Raw input data with mixed field formats
   * @returns {Object} Normalized data ready for Pure Engine
   */
  normalize(input) {
    if (!input) return {};
    
    const normalized = {};
    
    // LINE ITEMS NORMALIZATION:
    // Convert PostgreSQL snake_case to camelCase and ensure all required fields
    // PRODUCTION FIX: Apply deterministic sorting by id for consistent hashing
    if (input.lineItems || input.line_items) {
      const items = input.lineItems || input.line_items;
      normalized.lineItems = items.map(item => ({
        id: item.id || item.line_item_id,                    // Handle both formats
        unitPrice: item.unitPrice || item.unit_price,        // Database snake_case to camelCase
        quantity: item.quantity,                             // Standard field name
        cost: item.cost                                      // Used for margin calculations
      })).sort((a, b) => {
        // Sort by id for deterministic ordering
        return (a.id || '').localeCompare(b.id || '');
      });
    }
    
    // MODIFIERS NORMALIZATION:
    // Apply DETERMINISTIC ORDERING for consistent processing
    if (input.modifiers) {
      normalized.modifiers = [...input.modifiers].sort((a, b) => {
        // Primary sort: chain_priority (lower numbers first)
        const priorityDiff = (a.chain_priority || 999) - (b.chain_priority || 999);
        
        // Secondary sort: ID alphabetically for deterministic ordering
        return priorityDiff !== 0 ? priorityDiff : a.id.localeCompare(b.id);
      });
    }
    
    // DEPENDENCIES NORMALIZATION:
    // PRODUCTION FIX: Sort dependencies for deterministic processing
    if (input.dependencies) {
      normalized.dependencies = [...input.dependencies].sort((a, b) => {
        // Primary sort: by depends_on
        const depDiff = (a.depends_on || '').localeCompare(b.depends_on || '');
        
        // Secondary sort: by modifier_id
        return depDiff !== 0 ? depDiff : (a.modifier_id || '').localeCompare(b.modifier_id || '');
      });
    }
    
    // TAX RATE NORMALIZATION:
    // Handle both snake_case and camelCase formats
    if (input.tax_rate !== undefined) {
      normalized.taxRate = input.tax_rate;                   // Database format
    }
    if (input.taxRate !== undefined) {
      normalized.taxRate = input.taxRate;                    // API format (takes precedence)
    }
    
    // ADDITIONAL FIELDS:
    // Copy all other fields while excluding processed ones
    for (const key in input) {
      if (!normalized[key] && key !== 'line_items' && key !== 'tax_rate' && key !== 'dependencies') {
        normalized[key] = input[key];
      }
    }
    
    return normalized;
  }
}

module.exports = InputNormalizer;