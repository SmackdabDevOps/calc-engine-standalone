/**
 * RuleCompiler - Compiles rules to AST with validation and optimization
 * 
 * Features:
 * - Rule to AST compilation
 * - AST validation
 * - AST optimization
 * - Path extraction
 * - Compilation caching
 * 
 * @version 1.0.0
 */

class RuleCompiler {
  constructor() {
    this.compiledCache = new Map();
    this.version = '1.0.0';
    
    // Valid operators
    this.validOperators = {
      comparison: ['>', '<', '>=', '<=', '==', '!=', '===', '!=='],
      logical: ['and', 'or', 'not'],
      arithmetic: ['+', '-', '*', '/']
    };
  }
  
  /**
   * Compile rule to AST
   * @param {Object} rule - Rule object
   * @returns {Object} - Compiled AST
   */
  compile(rule) {
    if (!rule) {
      return this.createEmptyAST();
    }
    
    // Handle different rule types
    switch (rule.type) {
      case 'percentage':
      case 'fixed':
      case 'margin':
        return this.compileSimpleRule(rule);
        
      case 'conditional':
        return this.compileConditionalRule(rule);
        
      case 'and':
      case 'or':
        return this.compileLogicalRule(rule);
        
      case 'comparison':
        return this.compileComparisonRule(rule);
        
      default:
        return this.compileGenericRule(rule);
    }
  }
  
  /**
   * Create empty AST
   * @private
   */
  createEmptyAST() {
    return {
      type: 'AST',
      nodeType: 'empty',
      children: [],
      metadata: {
        compiled: true,
        version: this.version
      }
    };
  }
  
  /**
   * Compile simple rule (percentage, fixed, margin)
   * @private
   */
  compileSimpleRule(rule) {
    return {
      type: 'AST',
      nodeType: rule.type,
      value: rule.value,
      children: [],
      metadata: {
        compiled: true,
        version: this.version
      }
    };
  }
  
  /**
   * Compile conditional rule
   * @private
   */
  compileConditionalRule(rule) {
    const ast = {
      type: 'AST',
      nodeType: 'conditional',
      condition: this.compileCondition(rule.condition),
      children: [],
      metadata: {
        compiled: true,
        version: this.version
      }
    };
    
    // Add then branch
    if (rule.then) {
      ast.children.push(this.compile(rule.then));
    }
    
    // Add else branch
    if (rule.else) {
      ast.children.push(this.compile(rule.else));
    }
    
    return ast;
  }
  
  /**
   * Compile logical rule (and/or)
   * @private
   */
  compileLogicalRule(rule) {
    const ast = {
      type: 'AST',
      nodeType: 'logical',
      operator: rule.type,
      conditions: [],
      children: [],
      metadata: {
        compiled: true,
        version: this.version
      }
    };
    
    // Compile conditions
    if (rule.conditions && Array.isArray(rule.conditions)) {
      ast.conditions = rule.conditions.map(cond => this.compileCondition(cond));
    }
    
    // Compile action
    if (rule.action) {
      ast.children.push(this.compile(rule.action));
    }
    
    return ast;
  }
  
  /**
   * Compile comparison rule
   * @private
   */
  compileComparisonRule(rule) {
    return {
      type: 'AST',
      nodeType: 'comparison',
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      children: [],
      metadata: {
        compiled: true,
        version: this.version
      }
    };
  }
  
  /**
   * Compile generic rule
   * @private
   */
  compileGenericRule(rule) {
    const ast = {
      type: 'AST',
      nodeType: rule.type || 'unknown',
      children: [],
      metadata: {
        compiled: true,
        version: this.version
      }
    };
    
    // Copy relevant properties
    Object.keys(rule).forEach(key => {
      if (key !== 'type' && key !== 'children') {
        ast[key] = rule[key];
      }
    });
    
    return ast;
  }
  
  /**
   * Compile condition
   * @private
   */
  compileCondition(condition) {
    if (!condition) return null;
    
    return {
      type: 'comparison',
      field: condition.field,
      operator: condition.operator,
      value: condition.value
    };
  }
  
  /**
   * Validate AST
   * @param {Object} ast - AST to validate
   * @returns {Object} - Validation result
   */
  validate(ast, visited = new Set()) {
    const errors = [];
    
    if (!ast) {
      return { valid: false, errors: ['AST is null or undefined'] };
    }
    
    // Check for cyclic references
    if (visited.has(ast)) {
      return { valid: false, errors: ['Cyclic reference detected'] };
    }
    visited.add(ast);
    
    // Check required fields
    if (!ast.type) {
      errors.push('Missing AST type');
    }
    
    if (!ast.nodeType) {
      errors.push('Missing nodeType');
    }
    
    // Validate operators
    if (ast.nodeType === 'comparison' && ast.operator) {
      if (!this.validOperators.comparison.includes(ast.operator)) {
        errors.push(`Invalid comparison operator: ${ast.operator}`);
      }
    }
    
    if (ast.nodeType === 'logical' && ast.operator) {
      if (!this.validOperators.logical.includes(ast.operator)) {
        errors.push(`Invalid logical operator: ${ast.operator}`);
      }
    }
    
    // Validate children recursively
    if (ast.children && Array.isArray(ast.children)) {
      for (const child of ast.children) {
        const childResult = this.validate(child, visited);
        if (!childResult.valid) {
          errors.push(...childResult.errors);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Cache compiled AST
   * @param {string} ruleId - Rule ID
   * @param {Object} ast - Compiled AST
   */
  cache(ruleId, ast) {
    this.compiledCache.set(ruleId, ast);
  }
  
  /**
   * Get cached AST
   * @param {string} ruleId - Rule ID
   * @returns {Object|null} - Cached AST or null
   */
  getCached(ruleId) {
    return this.compiledCache.get(ruleId) || null;
  }
  
  /**
   * Invalidate cached rule
   * @param {string} ruleId - Rule ID
   */
  invalidateCache(ruleId) {
    this.compiledCache.delete(ruleId);
  }
  
  /**
   * Clear all cache
   */
  clearCache() {
    this.compiledCache.clear();
  }
  
  /**
   * Optimize AST
   * @param {Object} ast - AST to optimize
   * @returns {Object} - Optimized AST
   */
  optimize(ast) {
    if (!ast) return ast;
    
    // Optimize arithmetic with constants
    if (ast.nodeType === 'arithmetic' && ast.operator) {
      if (this.isConstant(ast.left) && this.isConstant(ast.right)) {
        const leftVal = ast.left.value;
        const rightVal = ast.right.value;
        let result;
        
        switch (ast.operator) {
          case '+': result = leftVal + rightVal; break;
          case '-': result = leftVal - rightVal; break;
          case '*': result = leftVal * rightVal; break;
          case '/': result = leftVal / rightVal; break;
          default: return ast;
        }
        
        return {
          type: 'AST',
          nodeType: 'constant',
          value: result,
          children: [],
          metadata: { optimized: true }
        };
      }
    }
    
    // Optimize logical with constants
    if (ast.nodeType === 'logical' && ast.operator === 'and') {
      if (ast.conditions && ast.conditions.length > 0) {
        // Remove true constants from AND
        const filtered = ast.conditions.filter(cond => 
          !(cond.type === 'constant' && cond.value === true)
        );
        
        if (filtered.length === 1 && filtered[0].type === 'comparison') {
          // Simplify to single comparison
          return {
            type: 'AST',
            nodeType: 'comparison',
            field: filtered[0].field,
            operator: filtered[0].operator,
            value: filtered[0].value,
            children: ast.children
          };
        }
      }
    }
    
    return ast;
  }
  
  /**
   * Check if node is constant
   * @private
   */
  isConstant(node) {
    return node && (node.type === 'constant' || node.nodeType === 'constant');
  }
  
  /**
   * Extract field paths from AST
   * @param {Object} ast - AST to extract paths from
   * @returns {Array<string>} - Array of field paths
   */
  extractPaths(ast, paths = new Set()) {
    if (!ast) return Array.from(paths);
    
    // Extract from comparison nodes
    if (ast.field) {
      paths.add(ast.field);
    }
    
    // Extract from condition
    if (ast.condition && ast.condition.field) {
      paths.add(ast.condition.field);
    }
    
    // Extract from conditions array
    if (ast.conditions && Array.isArray(ast.conditions)) {
      ast.conditions.forEach(cond => {
        if (cond.field) {
          paths.add(cond.field);
        }
      });
    }
    
    // Recursively extract from children
    if (ast.children && Array.isArray(ast.children)) {
      ast.children.forEach(child => {
        this.extractPaths(child, paths);
      });
    }
    
    return Array.from(paths);
  }
}

module.exports = RuleCompiler;