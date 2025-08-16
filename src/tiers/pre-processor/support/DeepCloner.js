/**
 * DeepCloner - Deep cloning utility for cached state manipulation
 * 
 * Features:
 * - Deep clones objects and arrays
 * - Handles circular references
 * - Preserves special objects (Date, RegExp, Map, Set)
 * - Optimized for performance
 * 
 * @version 1.0.0
 */

class DeepCloner {
  /**
   * Deep clone an object
   * @param {any} obj - Object to clone
   * @param {WeakMap} visited - Track visited objects for circular references
   * @returns {any} - Deep cloned object
   */
  clone(obj, visited = new WeakMap()) {
    // Handle primitives and null
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    // Handle circular references
    if (visited.has(obj)) {
      return visited.get(obj);
    }
    
    // Handle Date
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    // Handle RegExp
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }
    
    // Handle Map
    if (obj instanceof Map) {
      const clonedMap = new Map();
      visited.set(obj, clonedMap);
      
      for (const [key, value] of obj) {
        clonedMap.set(
          this.clone(key, visited),
          this.clone(value, visited)
        );
      }
      
      return clonedMap;
    }
    
    // Handle Set
    if (obj instanceof Set) {
      const clonedSet = new Set();
      visited.set(obj, clonedSet);
      
      for (const value of obj) {
        clonedSet.add(this.clone(value, visited));
      }
      
      return clonedSet;
    }
    
    // Handle Functions (copy by reference)
    if (typeof obj === 'function') {
      return obj;
    }
    
    // Handle Array
    if (Array.isArray(obj)) {
      const clonedArray = [];
      visited.set(obj, clonedArray);
      
      for (let i = 0; i < obj.length; i++) {
        clonedArray[i] = this.clone(obj[i], visited);
      }
      
      return clonedArray;
    }
    
    // Handle plain objects
    const clonedObj = {};
    visited.set(obj, clonedObj);
    
    // Clone all properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.clone(obj[key], visited);
      }
    }
    
    return clonedObj;
  }
  
  /**
   * Clone an object and apply changes
   * @param {Object} original - Original object to clone
   * @param {Object} changes - Changes to apply
   * @returns {Object} - Cloned object with changes applied
   */
  cloneWithChanges(original, changes) {
    // First, deep clone the original
    const cloned = this.clone(original);
    
    // If no changes, return the clone
    if (!changes) {
      return cloned;
    }
    
    // Apply changes
    return this.mergeDeep(cloned, changes);
  }
  
  /**
   * Deep merge two objects
   * @private
   * @param {Object} target - Target object
   * @param {Object} source - Source object with changes
   * @returns {Object} - Merged object
   */
  mergeDeep(target, source) {
    if (!source || typeof source !== 'object') {
      return target;
    }
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = target[key];
        
        // If source value is null or primitive, just assign it
        if (sourceValue === null || typeof sourceValue !== 'object') {
          target[key] = sourceValue;
        }
        // If source value is an array, replace the entire array
        else if (Array.isArray(sourceValue)) {
          target[key] = this.clone(sourceValue);
        }
        // If source value is an object and target has the same key as object
        else if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
          // Recursively merge
          target[key] = this.mergeDeep(targetValue, sourceValue);
        }
        // Otherwise, clone and assign the source value
        else {
          target[key] = this.clone(sourceValue);
        }
      }
    }
    
    return target;
  }
}

module.exports = DeepCloner;