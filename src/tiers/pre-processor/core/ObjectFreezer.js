/**
 * ObjectFreezer - Creates immutable objects
 * @version 1.0.0
 */

class ObjectFreezer {
  freeze(obj) {
    // Primitive values are already immutable
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    // Freeze the object itself
    Object.freeze(obj);
    
    // Recursively freeze all properties
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const value = obj[prop];
      if (value && typeof value === 'object') {
        this.freeze(value);
      }
    });
    
    return obj;
  }
}

module.exports = ObjectFreezer;