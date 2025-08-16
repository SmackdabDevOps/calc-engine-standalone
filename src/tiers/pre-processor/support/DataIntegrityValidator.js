/**
 * DataIntegrityValidator - Validates data consistency
 * 
 * Purpose:
 * - Ensure referential integrity
 * - Validate data types and ranges
 * - Check business rule constraints
 * 
 * @class DataIntegrityValidator
 */
class DataIntegrityValidator {
  constructor() {
    /**
     * Validation rules by entity type
     */
    this.validators = {
      proposal: this.validateProposal.bind(this),
      lineItem: this.validateLineItem.bind(this),
      modifier: this.validateModifier.bind(this),
      dependency: this.validateDependency.bind(this)
    };
  }
  
  /**
   * Validate all input data
   * 
   * @param {Object} data - Input data to validate
   * @returns {Object} Validation results with errors
   */
  validateAll(data) {
    const errors = [];
    const warnings = [];
    
    // Validate proposal
    if (!data.proposal || !data.proposal.id) {
      errors.push('Missing proposal ID');
      return { valid: false, errors, warnings };
    }
    
    // Validate line items
    if (data.lineItems && Array.isArray(data.lineItems)) {
      for (const item of data.lineItems) {
        const result = this.validateLineItem(item, data.proposal.id);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }
    
    // Validate modifiers
    const modifierIds = new Set();
    if (data.modifiers && Array.isArray(data.modifiers)) {
      for (const modifier of data.modifiers) {
        const result = this.validateModifier(modifier, data.proposal.id);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        
        // Check for duplicate IDs
        if (modifierIds.has(modifier.id)) {
          errors.push(`Duplicate modifier ID: ${modifier.id}`);
        }
        modifierIds.add(modifier.id);
      }
    }
    
    // Validate dependencies
    if (data.dependencies && Array.isArray(data.dependencies)) {
      for (const dep of data.dependencies) {
        const result = this.validateDependency(dep, modifierIds);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }
    
    // Check referential integrity
    const integrityErrors = this.checkReferentialIntegrity(data);
    errors.push(...integrityErrors);
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Validate proposal data
   */
  validateProposal(proposal) {
    const errors = [];
    const warnings = [];
    
    if (!proposal.id) {
      errors.push('Proposal missing ID');
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate line item data
   */
  validateLineItem(item, proposalId) {
    const errors = [];
    const warnings = [];
    
    // Required fields
    if (!item.id) errors.push(`Line item missing ID`);
    if (!item.proposal_id) errors.push(`Line item ${item.id} missing proposal_id`);
    if (item.proposal_id !== proposalId) {
      errors.push(`Line item ${item.id} proposal_id mismatch`);
    }
    
    // Numeric fields must be strings or numbers
    if (item.quantity !== undefined && item.quantity !== null) {
      const qty = String(item.quantity);
      if (isNaN(parseFloat(qty))) {
        errors.push(`Line item ${item.id} invalid quantity: ${item.quantity}`);
      }
    }
    
    if (item.unit_price !== undefined && item.unit_price !== null) {
      const price = String(item.unit_price);
      if (isNaN(parseFloat(price))) {
        errors.push(`Line item ${item.id} invalid unit_price: ${item.unit_price}`);
      }
      if (parseFloat(price) < 0) {
        warnings.push(`Line item ${item.id} negative unit_price: ${price}`);
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate modifier data
   */
  validateModifier(modifier, proposalId) {
    const errors = [];
    const warnings = [];
    
    // Required fields
    if (!modifier.id) errors.push(`Modifier missing ID`);
    if (!modifier.type) errors.push(`Modifier ${modifier.id} missing type`);
    if (!modifier.proposal_id) errors.push(`Modifier ${modifier.id} missing proposal_id`);
    
    // Valid types
    const validTypes = ['PERCENTAGE', 'FIXED', 'TAX', 'DISCOUNT', 'COMPOUND'];
    if (modifier.type && !validTypes.includes(modifier.type)) {
      errors.push(`Modifier ${modifier.id} invalid type: ${modifier.type}`);
    }
    
    // Chain priority must be numeric
    if (modifier.chain_priority !== undefined && modifier.chain_priority !== null) {
      const priority = Number(modifier.chain_priority);
      if (isNaN(priority)) {
        errors.push(`Modifier ${modifier.id} invalid chain_priority`);
      }
    }
    
    // Validate amount based on type
    if (modifier.type === 'PERCENTAGE' && modifier.amount !== undefined) {
      const amount = parseFloat(modifier.amount || '0');
      if (amount < 0 || amount > 100) {
        warnings.push(`Modifier ${modifier.id} percentage out of range: ${amount}`);
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate dependency relationships
   */
  validateDependency(dep, validModifierIds) {
    const errors = [];
    const warnings = [];
    
    if (!dep.modifier_id) {
      errors.push('Dependency missing modifier_id');
    } else if (!validModifierIds.has(dep.modifier_id)) {
      errors.push(`Dependency references unknown modifier: ${dep.modifier_id}`);
    }
    
    if (!dep.depends_on) {
      errors.push('Dependency missing depends_on');
    } else if (!validModifierIds.has(dep.depends_on)) {
      errors.push(`Dependency references unknown depends_on: ${dep.depends_on}`);
    }
    
    // Check for self-reference
    if (dep.modifier_id === dep.depends_on) {
      errors.push(`Dependency self-reference: ${dep.modifier_id}`);
    }
    
    return { errors, warnings };
  }
  
  /**
   * Check referential integrity across entities
   */
  checkReferentialIntegrity(data) {
    const errors = [];
    
    if (!data.modifiers || !data.dependencies) {
      return errors;
    }
    
    // Check for orphaned dependencies
    const modifierIds = new Set(data.modifiers.map(m => m.id));
    for (const dep of data.dependencies) {
      if (!modifierIds.has(dep.modifier_id)) {
        errors.push(`Orphaned dependency: modifier ${dep.modifier_id} not found`);
      }
      if (!modifierIds.has(dep.depends_on)) {
        errors.push(`Invalid dependency: depends_on ${dep.depends_on} not found`);
      }
    }
    
    // Check for circular dependencies
    const cycles = this.detectCycles(data.dependencies);
    for (const cycle of cycles) {
      errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }
    
    return errors;
  }
  
  /**
   * Detect circular dependencies
   */
  detectCycles(dependencies) {
    const cycles = [];
    const graph = new Map();
    
    // Build adjacency list
    for (const dep of dependencies) {
      if (!graph.has(dep.modifier_id)) {
        graph.set(dep.modifier_id, []);
      }
      graph.get(dep.modifier_id).push(dep.depends_on);
    }
    
    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();
    
    const hasCycle = (node, path = []) => {
      if (recursionStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart).concat(node));
        }
        return true;
      }
      
      if (visited.has(node)) return false;
      
      visited.add(node);
      recursionStack.add(node);
      
      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor, [...path, node])) {
          // Don't return true here to find all cycles
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        hasCycle(node);
      }
    }
    
    return cycles;
  }
}

module.exports = DataIntegrityValidator;