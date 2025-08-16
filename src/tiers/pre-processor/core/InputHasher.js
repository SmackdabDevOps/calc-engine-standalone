/**
 * InputHasher - Generates deterministic SHA-256 hashes for idempotency
 * 
 * CRITICAL COMPONENT for ensuring identical inputs produce identical hashes,
 * which is fundamental to the cache-based idempotency system.
 * 
 * DETERMINISTIC PROPERTIES:
 * - Same input always produces same hash (essential for caching)
 * - Property order doesn't affect hash (canonicalization)
 * - Deep object traversal ensures complete input coverage
 * - SHA-256 provides collision resistance and security
 * 
 * CANONICALIZATION PROCESS:
 * 1. Recursively traverse all object properties
 * 2. Sort object keys alphabetically for order independence
 * 3. Apply same process to nested objects and arrays
 * 4. Convert to deterministic JSON string
 * 5. Generate SHA-256 hash of canonical representation
 * 
 * USE CASES:
 * - Pre-Processor cache keys
 * - Pure Engine idempotency verification
 * - Change detection for delta optimization
 * - Audit trail for calculation reproducibility
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - Hashing is CPU-intensive for large objects
 * - Consider caching hash results for complex inputs
 * - Use for idempotency checks before expensive operations
 * 
 * @version 1.0.0
 * @implements Mathematical Correctness Plan - Idempotency
 */

const crypto = require('crypto');

class InputHasher {
  /**
   * Generate deterministic SHA-256 hash from input object
   * 
   * The hash is used as a cache key and idempotency identifier.
   * Identical inputs will always produce identical hashes regardless
   * of property order or object reference equality.
   * 
   * @param {Object} input - Input object to hash
   * @returns {string} SHA-256 hash (64 character hex string)
   */
  hash(input) {
    // STEP 1: CANONICALIZATION
    // Convert input to standardized form with sorted keys
    const canonical = this.canonicalize(input);
    
    // STEP 2: JSON SERIALIZATION
    // Convert to deterministic string representation
    const json = JSON.stringify(canonical);
    
    // STEP 3: HASH GENERATION
    // Generate SHA-256 hash for collision resistance and security
    return crypto.createHash('sha256').update(json).digest('hex');
  }
  
  /**
   * Convert object to canonical form for deterministic hashing
   * 
   * Recursively processes objects to ensure property order doesn't
   * affect the final hash. This is critical for cache consistency.
   * 
   * @param {*} obj - Object to canonicalize (any type)
   * @returns {*} Canonicalized object with sorted keys
   */
  canonicalize(obj) {
    // PRIMITIVE VALUES:
    // Return null, undefined, numbers, strings, booleans as-is
    if (obj === null || obj === undefined) return obj;
    
    // ARRAYS:
    // Recursively canonicalize each element but preserve order
    // Array order is significant for calculation determinism
    if (Array.isArray(obj)) {
      return obj.map(item => this.canonicalize(item));
    }
    
    // OBJECTS:
    // Sort keys alphabetically for order independence
    if (typeof obj === 'object') {
      const sorted = {};
      const keys = Object.keys(obj).sort();  // CRITICAL: Alphabetical sorting
      
      for (const key of keys) {
        // Recursively canonicalize nested values
        sorted[key] = this.canonicalize(obj[key]);
      }
      
      return sorted;
    }
    
    // PRIMITIVE VALUES:
    // Return numbers, strings, booleans unchanged
    return obj;
  }
}

module.exports = InputHasher;