/**
 * SecureRuleCompiler - Validates and constrains rule compilation
 * 
 * Purpose:
 * - Prevent malicious or pathological rules
 * - Enforce path whitelisting
 * - Limit AST complexity
 * 
 * @class SecureRuleCompiler
 */
class SecureRuleCompiler {
  constructor(cache = new Map()) {
    this.cache = cache;
    
    /**
     * Whitelist of allowed path roots
     * Prevents access to unauthorized data
     */
    this.allowedPaths = [
      'evaluationContext.*',
      'proposal.*',
      'computed.*',
      'customer.*',
      'project.*',
      'running.*'
    ];
    
    /**
     * AST complexity limits
     * Prevents DoS via complex rules
     */
    this.limits = {
      maxDepth: 10,        // Max nesting depth
      maxNodes: 100,       // Max AST nodes
      maxPaths: 20         // Max extracted paths
    };
  }
  
  /**
   * Compile rule with security validation
   * 
   * @param {Object} rule - Rule to compile
   * @returns {Object} Validated AST
   * @throws {Error} If rule violates constraints
   */
  compile(rule) {
    // Parse to AST
    const ast = this.parse(rule.expression);
    
    // Validate complexity
    if (this.getDepth(ast) > this.limits.maxDepth) {
      throw new Error(`Rule exceeds max depth: ${this.limits.maxDepth}`);
    }
    
    if (this.countNodes(ast) > this.limits.maxNodes) {
      throw new Error(`Rule exceeds max nodes: ${this.limits.maxNodes}`);
    }
    
    // Extract and validate paths
    const paths = this.extractPaths(ast);
    
    if (paths.length > this.limits.maxPaths) {
      throw new Error(`Rule exceeds max paths: ${this.limits.maxPaths}`);
    }
    
    for (const path of paths) {
      if (!this.isPathAllowed(path)) {
        throw new Error(`Unauthorized path access: ${path}`);
      }
    }
    
    // Normalize operators for consistency
    this.normalizeOperators(ast);
    
    // Cache by content hash for invalidation
    const cacheKey = `${rule.id}:${this.hashContent(rule.expression)}:v${rule.version || 1}`;
    this.cache.set(cacheKey, ast);
    
    return ast;
  }
  
  /**
   * Parse rule expression to AST
   */
  parse(expression) {
    // Simple parser for demonstration
    // In production, use a proper expression parser
    return {
      type: 'expression',
      operator: 'AND',
      children: [],
      raw: expression
    };
  }
  
  /**
   * Get AST depth
   */
  getDepth(node, currentDepth = 0) {
    if (!node) return currentDepth;
    
    let maxChildDepth = currentDepth;
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const childDepth = this.getDepth(child, currentDepth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }
    
    return maxChildDepth;
  }
  
  /**
   * Count total nodes in AST
   */
  countNodes(node) {
    if (!node) return 0;
    
    let count = 1;
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        count += this.countNodes(child);
      }
    }
    
    return count;
  }
  
  /**
   * Extract paths from AST
   */
  extractPaths(node, paths = []) {
    if (!node) return paths;
    
    if (node.type === 'path' && node.value) {
      paths.push(node.value);
    }
    
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.extractPaths(child, paths);
      }
    }
    
    return paths;
  }
  
  /**
   * Check if path is whitelisted
   */
  isPathAllowed(path) {
    return this.allowedPaths.some(pattern => {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      return regex.test(path);
    });
  }
  
  /**
   * Normalize operator casing for consistency
   */
  normalizeOperators(ast) {
    if (ast.operator) {
      ast.operator = ast.operator.toUpperCase();
    }
    if (ast.children) {
      ast.children.forEach(child => this.normalizeOperators(child));
    }
  }
  
  /**
   * Hash content for cache key
   */
  hashContent(content) {
    // Simple hash for demonstration
    // Use crypto.createHash in production
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

module.exports = SecureRuleCompiler;