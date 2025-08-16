/**
 * PathExtractor - Extracts data paths from rules for context building
 * 
 * Features:
 * - Extract paths from rule ASTs
 * - Map paths to data sources
 * - Identify required data
 * - Source mapping for efficient fetching
 * 
 * @version 1.0.0
 */

class PathExtractor {
  constructor() {
    this.pathSeparator = '.';
  }
  
  /**
   * Extract all paths from rules array
   * @param {Array} rules - Array of rules with parsedRule property
   * @returns {Array<string>} - Unique paths
   */
  extract(rules) {
    if (!rules || !Array.isArray(rules)) {
      return [];
    }
    
    const paths = new Set();
    
    for (const rule of rules) {
      if (rule && rule.parsedRule) {
        const rulePaths = this.extractFromAST(rule.parsedRule);
        rulePaths.forEach(path => paths.add(path));
      }
    }
    
    return Array.from(paths);
  }
  
  /**
   * Extract paths from a single AST
   * @param {Object} ast - AST node
   * @param {Set} paths - Set to collect paths
   * @returns {Array<string>} - Array of paths
   */
  extractFromAST(ast, paths = new Set()) {
    if (!ast) {
      return Array.from(paths);
    }
    
    // Direct field reference
    if (ast.field) {
      paths.add(ast.field);
    }
    
    // Condition field
    if (ast.condition) {
      if (ast.condition.field) {
        paths.add(ast.condition.field);
      }
      // Recursively extract from condition
      this.extractFromAST(ast.condition, paths);
    }
    
    // Array of conditions
    if (ast.conditions && Array.isArray(ast.conditions)) {
      for (const condition of ast.conditions) {
        if (condition.field) {
          paths.add(condition.field);
        }
        // Recursively extract from each condition
        this.extractFromAST(condition, paths);
      }
    }
    
    // Then/else branches
    if (ast.then) {
      this.extractFromAST(ast.then, paths);
    }
    if (ast.else) {
      this.extractFromAST(ast.else, paths);
    }
    
    // Children
    if (ast.children && Array.isArray(ast.children)) {
      for (const child of ast.children) {
        this.extractFromAST(child, paths);
      }
    }
    
    // Nested objects
    if (ast.nested) {
      this.extractFromAST(ast.nested, paths);
    }
    
    return Array.from(paths);
  }
  
  /**
   * Map paths to their source objects
   * @param {Array<string>} paths - Array of paths
   * @returns {Object} - Mapping of sources to fields
   */
  mapPathsToSources(paths) {
    const mapping = {};
    
    for (const path of paths) {
      const parts = path.split(this.pathSeparator);
      
      if (parts.length === 1) {
        // Root-level path
        if (!mapping.root) {
          mapping.root = [];
        }
        mapping.root.push(parts[0]);
      } else if (parts.length === 2) {
        // Simple object.field
        const [source, field] = parts;
        if (!mapping[source]) {
          mapping[source] = [];
        }
        mapping[source].push(field);
      } else {
        // Nested path - group by first n-1 parts
        const field = parts[parts.length - 1];
        const source = parts.slice(0, -1).join(this.pathSeparator);
        
        if (!mapping[source]) {
          mapping[source] = [];
        }
        mapping[source].push(field);
      }
    }
    
    return mapping;
  }
  
  /**
   * Identify required data sources from paths
   * @param {Array<string>} paths - Array of paths
   * @returns {Object} - Required data flags
   */
  getRequiredData(paths) {
    const required = {
      needsLineItems: false,
      needsProposal: false,
      needsCustomer: false,
      needsProducts: false,
      needsModifiers: false,
      needsRules: false
    };
    
    for (const path of paths) {
      const source = path.split(this.pathSeparator)[0].toLowerCase();
      
      switch (source) {
        case 'lineitem':
        case 'lineitems':
        case 'item':
          required.needsLineItems = true;
          break;
          
        case 'proposal':
        case 'quote':
          required.needsProposal = true;
          break;
          
        case 'customer':
        case 'client':
        case 'account':
          required.needsCustomer = true;
          break;
          
        case 'product':
        case 'products':
        case 'sku':
          required.needsProducts = true;
          break;
          
        case 'modifier':
        case 'modifiers':
        case 'adjustment':
          required.needsModifiers = true;
          break;
          
        case 'rule':
        case 'rules':
        case 'condition':
          required.needsRules = true;
          break;
      }
    }
    
    return required;
  }
  
  /**
   * Create optimized fetch plan from paths
   * @param {Array<string>} paths - Array of paths
   * @returns {Object} - Fetch plan
   */
  createFetchPlan(paths) {
    const required = this.getRequiredData(paths);
    const mapping = this.mapPathsToSources(paths);
    
    const plan = {
      parallel: [],
      sequential: [],
      fields: mapping
    };
    
    // Determine what can be fetched in parallel
    if (required.needsProposal) {
      plan.parallel.push('proposal');
    }
    if (required.needsLineItems) {
      plan.parallel.push('lineItems');
    }
    if (required.needsModifiers) {
      plan.parallel.push('modifiers');
    }
    
    // Some data might need sequential fetching
    if (required.needsCustomer) {
      plan.sequential.push('customer'); // Might depend on proposal
    }
    if (required.needsProducts) {
      plan.sequential.push('products'); // Might depend on line items
    }
    if (required.needsRules) {
      plan.sequential.push('rules'); // Depends on modifiers
    }
    
    return plan;
  }
}

module.exports = PathExtractor;