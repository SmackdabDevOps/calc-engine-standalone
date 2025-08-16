/**
 * SafeRuleEvaluator - Safe, bounded rule execution with security guarantees
 * 
 * CRITICAL SECURITY COMPONENT: Prevents code injection and DoS attacks
 * Part of Phase 4: Safety & Limits from Mathematical Correctness Plan
 * 
 * SECURITY FEATURES:
 * 1. NO EVAL(): Never executes arbitrary code strings
 * 2. DEPTH LIMITED: Max 10 levels prevents stack overflow
 * 3. OPERATION COUNTED: Max 1000 ops prevents infinite loops
 * 4. TYPE SAFE: Explicit type handling prevents coercion attacks
 * 5. WHITELISTED OPS: Only safe comparison/logical operators allowed
 * 
 * RULE AST STRUCTURE:
 * Rules are pre-compiled to Abstract Syntax Trees (ASTs) with nodes:
 * - comparison: {type: 'comparison', op: '>', left: node, right: node}
 * - logical: {type: 'logical', op: 'AND', left: node, right: node}
 * - field: {type: 'field', path: 'proposal.amount'}
 * - literal: {type: 'literal', value: 1000}
 * 
 * EVALUATION STRATEGY:
 * - Recursive descent with depth tracking
 * - Short-circuit evaluation for AND/OR
 * - Safe field extraction with null checks
 * - Type-aware comparison operators
 * 
 * @version 1.0.0
 * @implements SecurityPolicy
 */

class SafeRuleEvaluator {
  constructor() {
    // Resource limits to prevent DoS attacks
    this.limits = {
      maxDepth: 10,       // Maximum recursion depth (prevents stack overflow)
      maxOperations: 1000 // Maximum operations per evaluation (prevents infinite loops)
    };
    this.operationCount = 0;  // Track operations for current evaluation
  }

  /**
   * Evaluate a rule against a context
   */
  evaluate(rule, context) {
    // Reset operation counter for each evaluation
    this.operationCount = 0;
    return this.evalNode(rule, context, 0);
  }

  /**
   * Recursively evaluate rule nodes with depth tracking
   */
  evalNode(node, context, depth) {
    // Check depth limit
    if (depth > this.limits.maxDepth) {
      throw new Error(`Rule evaluation depth exceeded: ${depth} (max: ${this.limits.maxDepth})`);
    }
    
    // Check operation count
    this.operationCount++;
    if (this.operationCount > this.limits.maxOperations) {
      throw new Error(`Maximum operations exceeded: ${this.operationCount} (max: ${this.limits.maxOperations})`);
    }
    
    // Evaluate based on node type
    switch (node.type) {
      case 'comparison':
        return this.evalComparison(node, context, depth);
      
      case 'logical':
        return this.evalLogical(node, context, depth);
      
      case 'literal':
        return node.value;
      
      case 'field':
        return this.getFieldValue(node.path, context);
      
      default:
        throw new Error(`Invalid rule type: ${node.type}`);
    }
  }

  /**
   * Evaluate comparison operators
   */
  evalComparison(node, context, depth) {
    const left = this.evalNode(node.left, context, depth + 1);
    const right = this.evalNode(node.right, context, depth + 1);
    
    return this.compare(left, right, node.op);
  }

  /**
   * Evaluate logical operators (AND, OR)
   */
  evalLogical(node, context, depth) {
    const op = (node.op || '').toUpperCase();
    
    if (op === 'AND') {
      // Short-circuit evaluation
      const left = this.evalNode(node.left, context, depth + 1);
      if (!left) return false;
      return this.evalNode(node.right, context, depth + 1);
    } else if (op === 'OR') {
      // Short-circuit evaluation
      const left = this.evalNode(node.left, context, depth + 1);
      if (left) return true;
      return this.evalNode(node.right, context, depth + 1);
    } else {
      throw new Error(`Invalid logical operator: ${node.op}`);
    }
  }

  /**
   * Safe field value extraction with nested path support
   */
  getFieldValue(path, context) {
    if (!path) return undefined;
    
    const parts = path.split('.');
    let value = context;
    
    for (const part of parts) {
      if (value == null) return undefined;
      value = value[part];
    }
    
    return value;
  }

  /**
   * Type-safe comparison with explicit handling
   */
  compare(left, right, op) {
    // Validate operator first
    const validOps = ['==', '!=', '>', '>=', '<', '<='];
    if (!validOps.includes(op)) {
      throw new Error(`Invalid operator: ${op}`);
    }
    
    // Handle null/undefined comparisons
    if (left === null || left === undefined || right === null || right === undefined) {
      if (op === '==') return left == right; // Use loose equality for null/undefined
      if (op === '!=') return left != right;
      return false; // Other operators don't apply to null/undefined
    }
    
    // Handle boolean values explicitly
    if (typeof left === 'boolean' || typeof right === 'boolean') {
      // Booleans only support equality comparisons
      if (op === '==') return left === right;
      if (op === '!=') return left !== right;
      return false; // Can't use >, <, etc. with booleans
    }
    
    // Handle string comparisons
    if (typeof left === 'string' || typeof right === 'string') {
      // Convert both to strings for comparison
      const leftStr = String(left);
      const rightStr = String(right);
      
      switch (op) {
        case '==': return leftStr === rightStr;
        case '!=': return leftStr !== rightStr;
        case '>': return leftStr > rightStr;
        case '>=': return leftStr >= rightStr;
        case '<': return leftStr < rightStr;
        case '<=': return leftStr <= rightStr;
        default: return false;
      }
    }
    
    // Handle numeric comparisons
    if (typeof left === 'number' && typeof right === 'number') {
      switch (op) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '>=': return left >= right;
        case '<': return left < right;
        case '<=': return left <= right;
        default: return false;
      }
    }
    
    // Type mismatch - try to coerce to numbers
    const leftNum = Number(left);
    const rightNum = Number(right);
    
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      switch (op) {
        case '==': return leftNum === rightNum;
        case '!=': return leftNum !== rightNum;
        case '>': return leftNum > rightNum;
        case '>=': return leftNum >= rightNum;
        case '<': return leftNum < rightNum;
        case '<=': return leftNum <= rightNum;
        default: return false;
      }
    }
    
    // If coercion fails, only equality operators make sense
    if (op === '==') return left === right;
    if (op === '!=') return left !== right;
    
    // Can't compare incompatible types with >, <, etc.
    return false;
  }

  /**
   * Reset the evaluator state
   */
  reset() {
    this.operationCount = 0;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      operationCount: this.operationCount,
      maxDepth: this.limits.maxDepth,
      maxOperations: this.limits.maxOperations
    };
  }
}

module.exports = SafeRuleEvaluator;