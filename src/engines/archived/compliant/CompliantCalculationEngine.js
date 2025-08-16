/**
 * CompliantCalculationEngine
 * 
 * Architecture-compliant calculation engine that follows all canonical requirements:
 * - Correct phase order: Dependencies → Rules → Grouping → Calculation → Tax → Finalization
 * - 7-decimal precision for all intermediate calculations
 * - Tax segregation (taxable/non-taxable/use-tax)
 * - 8-attribute modifier grouping
 * - Complete audit trail
 * 
 * @author Architecture Team
 * @date 2025-08-14
 * @version 2.0.0
 */

const ICalculationEngine = require('../interfaces/ICalculationEngine');
const CalculationResult = require('../interfaces/CalculationResult');
const Decimal = require('decimal.js');
const crypto = require('crypto');
const PrecisionPolicy = require('./PrecisionPolicy');

// Configure Decimal for proper scale handling
Decimal.set({ 
  precision: 40,  // Plenty of headroom for calculations
  rounding: Decimal.ROUND_HALF_UP
});

// Helper functions for consistent quantization using PrecisionPolicy
const Q7 = (value) => PrecisionPolicy.intermediate(value);
const Q2 = (value) => PrecisionPolicy.final(value);
const Q7String = (value) => PrecisionPolicy.intermediateString(value);

class CompliantCalculationEngine extends ICalculationEngine {
  constructor() {
    super();
    this.version = '2.0.0';
    this.name = 'CompliantEngine';
    this.capabilities = [
      'modifiers',
      'rules',
      'dependencies',
      'decimal-precision',
      'tax-segregation',
      'use-tax',
      'retail-tax',
      'modifier-grouping',
      'audit-trail'
    ];
    // L1 cache for compiled rules
    this._ruleCache = new Map();
    this._ruleCacheTTLms = 300000; // 5 minutes
    this._ruleCacheStats = { hits: 0, misses: 0 };
    // Audit repository (optional)
    this._auditRepository = null;
  }

  /**
   * Set audit repository for persisting calculation results
   * @param {AuditRepository} repository - Audit repository instance
   */
  setAuditRepository(repository) {
    this._auditRepository = repository;
  }
  
  /**
   * Get engine name
   * @returns {string} - Engine name
   */
  getName() {
    return this.name;
  }
  
  /**
   * Get engine version
   * @returns {string} - Engine version
   */
  getVersion() {
    return this.version;
  }
  
  /**
   * Get engine capabilities
   * @returns {Array<string>} - List of capabilities
   */
  getCapabilities() {
    return this.capabilities;
  }
  
  /**
   * Main calculation method following canonical phase order
   * 
   * @param {CalculationInput} input - Validated input
   * @returns {Promise<CalculationResult>} - Calculation result
   */
  async calculate(input) {
    // Validate input
    this.validateInput(input);
    
    // Initialize result and timing
    const result = new CalculationResult();
    const startTime = Date.now();
    const phaseTimings = {};
    
    try {
      // Extract input data
      const { proposal, lineItems, modifiers, dependencies, rules, config } = input;
      
      // ========================================
      // PHASE 1: Base Calculation (Data Load)
      // ========================================
      const phase1Start = Date.now();
      
      const baseCalc = this.calculateBase(lineItems);
      result.setFinancialValue('subtotal', baseCalc.subtotal);
      result.lineCount = lineItems.length;
      
      phaseTimings.base_calculation = Date.now() - phase1Start;
      
      // ========================================
      // PHASE 2: Dependency Resolution (FIRST!)
      // ========================================
      const phase2Start = Date.now();
      
      const dependencyResult = this.resolveDependencies(modifiers, dependencies);
      const approvedModifiers = dependencyResult.approved;
      const rejectedModifiers = dependencyResult.rejected;
      // Attach diagnostics for dependency resolution
      if (dependencyResult.diagnostics) {
        result.dependencyDiagnostics = dependencyResult.diagnostics;
      }
      
      phaseTimings.dependency_resolution = Date.now() - phase2Start;
      
      // ========================================
      // PHASE 3: Rule Evaluation (on approved set)
      // ========================================
      const phase3Start = Date.now();
      
      // Compile/cached rules artifact (L1 cache)
      const compiled = this.getCompiledRules(proposal?.tenant_id, rules);
      const ruleArtifact = compiled?.artifact || rules;

      const ruleResult = this.evaluateRules(approvedModifiers, ruleArtifact, {
        subtotal: baseCalc.subtotal,
        lineItems: lineItems,
        proposal: proposal
      });
      
      const filteredModifiers = ruleResult.passed;
      result.evaluatedRulesCount = ruleResult.stats.evaluated;
      result.passedRulesCount = ruleResult.stats.passed;
      result.failedRulesCount = ruleResult.stats.failed;
      
      phaseTimings.rule_evaluation = Date.now() - phase3Start;
      
      // ========================================
      // PHASE 4: Grouping (by 8 attributes)
      // ========================================
      const phase4Start = Date.now();
      
      const groups = this.groupModifiers(filteredModifiers);
      const sortedGroups = this.sortGroups(groups);
      
      phaseTimings.grouping = Date.now() - phase4Start;
      
      // ========================================
      // PHASE 5: Apply Modifiers (7-decimal precision)
      // ========================================
      const phase5Start = Date.now();
      
      const modifierResult = this.applyModifierGroups(
        sortedGroups,
        baseCalc.subtotal,
        lineItems
      );
      
      // Remove skipped modifiers from applied list
      const skippedIds = (modifierResult.skippedModifiers || []).map(m => m.id);
      const actuallyApplied = filteredModifiers.filter(m => !skippedIds.includes(m.id));
      
      // Sort appliedModifiers by their group order and chain_priority
      const appliedSorted = this.sortModifiersByApplication(actuallyApplied, sortedGroups);
      
      result.setFinancialValue('modifierTotal', modifierResult.totalAdjustment);
      
      // Calculate discountTotal (sum of negative modifiers)
      let discountTotal = new Decimal(0);
      for (const group of sortedGroups) {
        const adjustment = new Decimal(group.adjustmentPrecise || 0);
        if (adjustment.lessThan(0)) {
          discountTotal = discountTotal.plus(adjustment);
        }
      }
      result.discountTotal = discountTotal.toFixed(2);
      
      result.appliedModifiers = appliedSorted;
      result.filteredModifiers = rejectedModifiers
        .concat(ruleResult.failed)
        .concat(modifierResult.skippedModifiers || []);

      // Enrich groups for audit: combinedValue, adjustmentPrecise, modifierIds
      const enrichedGroups = sortedGroups.map(group => {
        // Deterministic order within group: chain_priority then id
        const sortedMods = [...group.modifiers].sort((a, b) => {
          const pa = a.chain_priority || 999;
          const pb = b.chain_priority || 999;
          if (pa !== pb) return pa - pb;
          return a.id.localeCompare(b.id);
        });
        const modifierIds = sortedMods.map(m => m.id);

        // Compute combinedValue by type
        const type = (group.attributes.modifier_type || '').toLowerCase();
        let combinedValue;
        if (type === 'percentage') {
          combinedValue = sortedMods.reduce((sum, m) => sum + (m.percent || 0), 0);
        } else if (type === 'fixed') {
          combinedValue = sortedMods.reduce((sum, m) => sum + (m.fixed_amount || 0), 0);
        }

        // Lookup applied adjustment (7-decimals string)
        const applied = modifierResult.appliedGroups.find(g => g.group === group.key);
        const adjustmentPrecise = applied ? applied.adjustment : '0.0000000';
        const allocations = applied && Array.isArray(applied.allocations) ? applied.allocations : [];

        return {
          ...group,
          modifierIds,
          combinedValue,
          adjustmentPrecise,
          allocations
        };
      });

      result.modifierGroups = enrichedGroups;
      
      phaseTimings.modifier_application = Date.now() - phase5Start;
      
      // ========================================
      // PHASE 6: Tax Calculation (with segregation)
      // ========================================
      const phase6Start = Date.now();
      
      const taxResult = this.calculateTax(
        baseCalc,
        modifierResult,
        lineItems,
        sortedGroups,
        config
      );
      
      result.setFinancialValue('taxAmount', taxResult.retailTax);  // Only retail tax
      result.setFinancialValue('taxableBase', taxResult.taxableBase);
      result.setFinancialValue('nonTaxableTotal', taxResult.nonTaxableTotal);
      result.taxMode = taxResult.taxMode;
      
      // Set retailTax as string value when in RETAIL or MIXED mode
      if (taxResult.taxMode === 'RETAIL' || taxResult.taxMode === 'MIXED') {
        result.retailTax = taxResult.retailTax || '0.00';
        // Store sub_taxes in taxCalculation for detailed breakdown
        if (taxResult.subTaxes) {
          result.taxCalculation = result.taxCalculation || {};
          result.taxCalculation.sub_taxes = taxResult.subTaxes;
        }
      }
      
      // Always set use tax fields when in USE_TAX or MIXED mode
      if (taxResult.taxMode === 'USE_TAX' || taxResult.taxMode === 'MIXED') {
        result.setFinancialValue('useTaxAmount', taxResult.useTaxAmount || '0');
        result.setFinancialValue('useTaxBase', taxResult.useTaxBase || '0');
        result.useTaxItems = taxResult.useTaxItems || [];
      }

      // Populate taxCalculation for audit record
      result.taxCalculation = {
        mode: taxResult.taxMode,
        retail_tax_precise: result.taxAmountPrecise,
        use_tax_precise: result.useTaxAmountPrecise || '0.0000000'
      };
      
      phaseTimings.tax_calculation = Date.now() - phase6Start;
      
      // ========================================
      // PHASE 7: Finalization (round final only)
      // ========================================
      const phase7Start = Date.now();
      
      // Calculate grand total (EXCLUDE use tax - that's internal liability)
      // Include all modifiers (pre and post tax) plus retail tax only
      const grandTotalPrecise = new Decimal(baseCalc.subtotal)
        .plus(modifierResult.totalAdjustment)
        .plus(taxResult.retailTax);  // Only retail tax in customer total
      
      result.setFinancialValue('grandTotal', grandTotalPrecise.toString());
      
      // Set customerGrandTotal and internalGrandTotal for MIXED mode
      if (taxResult.taxMode === 'MIXED') {
        result.customerGrandTotal = grandTotalPrecise.toFixed(2);
        const internalTotal = grandTotalPrecise.plus(taxResult.useTaxAmount || 0);
        result.internalGrandTotal = internalTotal.toFixed(2);
      } else {
        result.customerGrandTotal = grandTotalPrecise.toFixed(2);
        result.internalGrandTotal = grandTotalPrecise.toFixed(2);
      }
      
      // Set metadata
      result.proposalId = proposal.id;
      result.version = proposal.version || 1;
      result.engineVersion = this.version;
      result.calculatedAt = new Date().toISOString();
      result.phaseTimings = phaseTimings;
      result.phaseTimings.total = Date.now() - startTime;
      
      // Create audit record
      result.createAuditRecord({
        tenant: proposal.tenant_id,
        proposalId: proposal.id,
        startedAt: new Date(startTime).toISOString()
      });
      
      // Generate IDs and checksums
      result.calcId = result.generateCalcId();
      result.generateChecksum();
      
      phaseTimings.finalization = Date.now() - phase7Start;
      
      // Mark success
      result.markSuccess();
      
      // Persist audit if repository is configured
      if (this._auditRepository) {
        await this._persistAudit(input, result, phaseTimings);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ COMPLIANT ENGINE: Calculation failed', error);
      result.markFailed(error);
      throw error;
    }
  }
  
  /**
   * PHASE 1: Calculate base totals from line items
   */
  calculateBase(lineItems) {
    let subtotal = new Decimal(0);
    let taxableSubtotal = new Decimal(0);
    let nonTaxableSubtotal = new Decimal(0);
    
    for (const item of lineItems) {
      // HOTFIX: Use unit_price from database, not price
      const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
      const lineTotal = new Decimal(unitPrice)
        .times(item.quantity || 0);
      
      subtotal = subtotal.plus(lineTotal);
      
      // Track tax segregation from the start
      // Normalize tax_setting to uppercase for consistency
      const taxSetting = (item.tax_setting || 'TAXABLE').toUpperCase();
      if (taxSetting === 'TAXABLE') {
        taxableSubtotal = taxableSubtotal.plus(lineTotal);
      } else if (taxSetting === 'NON_TAXABLE') {
        nonTaxableSubtotal = nonTaxableSubtotal.plus(lineTotal);
      } else {
        // Default to taxable if not specified
        taxableSubtotal = taxableSubtotal.plus(lineTotal);
      }
    }
    
    return {
      subtotal: Q7(subtotal).toFixed(7),
      taxableSubtotal: Q7(taxableSubtotal).toFixed(7),
      nonTaxableSubtotal: Q7(nonTaxableSubtotal).toFixed(7)
    };
  }
  
  /**
   * PHASE 2: Resolve dependencies (MUST BE FIRST!)
   */
  resolveDependencies(modifiers, dependencies) {
    if (!modifiers || modifiers.length === 0) {
      return { approved: [], rejected: [] };
    }
    
    if (!dependencies || dependencies.length === 0) {
      // No dependencies, all modifiers approved
      return { approved: modifiers, rejected: [] };
    }
    
    // Build dependency graph
    const graph = this.buildDependencyGraph(modifiers, dependencies);
    
    // Check for cycles (skip if graph is empty)
    if (Object.keys(graph).length > 0) {
      const cycleCheck = this.detectCycles(graph);
      if (cycleCheck.hasCycle) {
        throw new Error(`Circular dependency detected: ${cycleCheck.chain.join(' → ')}`);
      }
    }
    
    // Topological sort with priority (handles missing dependencies)
    const sorted = this.topologicalSort(graph, modifiers);

    // Identify missing requirements → rejected reasons
    const allIds = new Set(Object.keys(graph));
    const sortedIds = new Set(sorted.map(m => m.id));
    const rejectedDueToDependencies = [];
    for (const modId of allIds) {
      if (!sortedIds.has(modId)) {
        const node = graph[modId];
        // If any required id is missing from the entire set or could not be resolved, mark missing_requirement
        const missingReq = node.requires.some(reqId => !allIds.has(reqId) || !sortedIds.has(reqId));
        if (missingReq) {
          rejectedDueToDependencies.push({ id: modId, reason: 'missing_requirement' });
        } else {
          // Fallback diagnostic
          rejectedDueToDependencies.push({ id: modId, reason: 'invalid_dependency' });
        }
      }
    }

    // Process exclusions on the valid sorted modifiers
    const exclResult = this.processExclusions(sorted, dependencies);

    // Build combined rejected (modifiers array) and diagnostics
    const rejectedModifierIds = new Set(exclResult.rejected.map(m => m.id));
    const rejectedModifiers = [...exclResult.rejected];
    const rejectedDiagnostics = [];

    // Add exclusion-based reasons
    if (exclResult.diagnostics && exclResult.diagnostics.rejectedReasons) {
      for (const [loserId, reason] of Object.entries(exclResult.diagnostics.rejectedReasons)) {
        rejectedDiagnostics.push({ id: loserId, reason });
      }
    }

    // Merge dependency-based rejections (avoid duplicates)
    for (const entry of rejectedDueToDependencies) {
      if (!rejectedModifierIds.has(entry.id)) {
        if (graph[entry.id]?.modifier) {
          rejectedModifiers.push(graph[entry.id].modifier);
        }
      }
      rejectedDiagnostics.push(entry);
    }

    const diagnostics = {
      resolved_order: exclResult.approved.map(m => m.id),
      hasCircularDependency: false,
      circularChain: null,
      exclusions: (exclResult.diagnostics && exclResult.diagnostics.exclusions) || [],
      rejected: rejectedDiagnostics
    };

    return { approved: exclResult.approved, rejected: rejectedModifiers, diagnostics };
  }
  
  /**
   * Build dependency graph from modifiers and dependencies
   */
  buildDependencyGraph(modifiers, dependencies) {
    const graph = {};
    
    // Initialize nodes
    for (const modifier of modifiers) {
      graph[modifier.id] = {
        modifier: modifier,
        requires: [],
        excludes: [],
        priority: modifier.priority || 999
      };
    }
    
    // Add edges
    for (const dep of dependencies) {
      if (graph[dep.modifier_id]) {
        if (dep.dependency_type === 'REQUIRES') {
          graph[dep.modifier_id].requires.push(dep.depends_on);
        } else if (dep.dependency_type === 'EXCLUDES') {
          graph[dep.modifier_id].excludes.push(dep.depends_on);
        }
      }
    }
    
    return graph;
  }
  
  /**
   * Detect cycles in dependency graph
   */
  detectCycles(graph) {
    const visited = new Set();
    const recStack = new Set();
    const path = [];
    
    function dfs(nodeId) {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);
      
      const node = graph[nodeId];
      if (node) {
        for (const neighbor of node.requires) {
          if (!visited.has(neighbor)) {
            const result = dfs(neighbor);
            if (result.hasCycle) return result;
          } else if (recStack.has(neighbor)) {
            // Cycle detected
            const cycleStart = path.indexOf(neighbor);
            const chain = path.slice(cycleStart).concat(neighbor);
            return { hasCycle: true, chain };
          }
        }
      }
      
      recStack.delete(nodeId);
      path.pop();
      return { hasCycle: false };
    }
    
    for (const nodeId in graph) {
      if (!visited.has(nodeId)) {
        const result = dfs(nodeId);
        if (result.hasCycle) return result;
      }
    }
    
    return { hasCycle: false };
  }
  
  /**
   * Topological sort using Kahn's algorithm
   */
  topologicalSort(graph, modifiers) {
    // Build adjacency list and in-degree map
    const inDegree = {};
    const adjList = {};
    const modifierMap = {};
    const invalidModifiers = new Set();
    
    // Initialize structures
    for (const modifier of modifiers) {
      modifierMap[modifier.id] = modifier;
      inDegree[modifier.id] = 0;
      adjList[modifier.id] = [];
    }
    
    // Build graph from dependencies and detect missing ones
    for (const nodeId in graph) {
      const node = graph[nodeId];
      for (const dep of node.requires) {
        if (adjList[dep]) {
          adjList[dep].push(nodeId);
          inDegree[nodeId]++;
        } else {
          // Required dependency doesn't exist
          invalidModifiers.add(nodeId);
        }
      }
    }
    
    // Cascade invalidation: if a modifier is invalid, all that depend on it are too
    let changed = true;
    while (changed) {
      changed = false;
      for (const nodeId in graph) {
        if (!invalidModifiers.has(nodeId)) {
          const node = graph[nodeId];
          for (const dep of node.requires) {
            if (invalidModifiers.has(dep)) {
              invalidModifiers.add(nodeId);
              changed = true;
              break;
            }
          }
        }
      }
    }
    
    // Remove invalid modifiers
    const validModifiers = modifiers.filter(m => !invalidModifiers.has(m.id));
    
    // If no valid modifiers, return empty
    if (validModifiers.length === 0) {
      return [];
    }
    
    // Find all nodes with no incoming edges (excluding invalid ones)
    const queue = [];
    for (const nodeId in inDegree) {
      if (inDegree[nodeId] === 0 && !invalidModifiers.has(nodeId)) {
        queue.push(nodeId);
      }
    }
    
    // Sort queue by priority for deterministic ordering
    queue.sort((a, b) => {
      const priorityA = modifierMap[a].priority || 999;
      const priorityB = modifierMap[b].priority || 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.localeCompare(b);
    });
    
    // Process queue
    const sorted = [];
    while (queue.length > 0) {
      const current = queue.shift();
      sorted.push(modifierMap[current]);
      
      // Process neighbors
      const neighbors = adjList[current] || [];
      const nextToAdd = [];
      
      for (const neighbor of neighbors) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          nextToAdd.push(neighbor);
        }
      }
      
      // Sort next batch by priority before adding to queue
      nextToAdd.sort((a, b) => {
        const priorityA = modifierMap[a].priority || 999;
        const priorityB = modifierMap[b].priority || 999;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.localeCompare(b);
      });
      
      queue.push(...nextToAdd);
    }
    
    // Check if all valid nodes were processed (no cycles)
    if (sorted.length !== validModifiers.length) {
      // Some nodes couldn't be processed - there must be a cycle
      const processedIds = new Set(sorted.map(m => m.id));
      const unprocessed = validModifiers.filter(m => !processedIds.has(m.id));
      throw new Error(`Dependency cycle detected involving: ${unprocessed.map(m => m.id).join(', ')}`);
    }
    
    return sorted;
  }
  
  /**
   * Process exclusions
   */
  processExclusions(modifiers, dependencies) {
    const approved = [];
    const rejected = [];
    const excludeMap = {};
    const exclusions = [];
    const rejectedReasons = {};
    
    // Build exclusion map
    for (const dep of dependencies) {
      if (dep.dependency_type === 'EXCLUDES') {
        if (!excludeMap[dep.modifier_id]) {
          excludeMap[dep.modifier_id] = [];
        }
        excludeMap[dep.modifier_id].push(dep.depends_on);
        
        // Symmetric exclusion
        if (!excludeMap[dep.depends_on]) {
          excludeMap[dep.depends_on] = [];
        }
        excludeMap[dep.depends_on].push(dep.modifier_id);
      }
    }
    
    // Process modifiers
    for (const modifier of modifiers) {
      let exclude = false;
      let winnerId = null;
      
      // Check if excluded by already approved modifiers
      if (excludeMap[modifier.id]) {
        for (const approvedMod of approved) {
          if (excludeMap[modifier.id].includes(approvedMod.id)) {
            exclude = true;
            winnerId = approvedMod.id;
            break;
          }
        }
      }
      
      if (exclude) {
        rejected.push(modifier);
        exclusions.push({ winner: winnerId, loser: modifier.id });
        rejectedReasons[modifier.id] = `excluded_by:${winnerId}`;
      } else {
        approved.push(modifier);
      }
    }
    
    return { approved, rejected, diagnostics: { exclusions, rejectedReasons } };
  }
  
  /**
   * PHASE 3: Evaluate rules on approved modifiers
   */
  evaluateRules(modifiers, rules, context) {
    const passed = [];
    const failed = [];
    const stats = {
      evaluated: 0,
      passed: 0,
      failed: 0
    };
    
    if (!rules || rules.length === 0) {
      // No rules, all modifiers pass
      return {
        passed: modifiers,
        failed: [],
        stats
      };
    }
    
    // Evaluate each modifier against its rules
    for (const modifier of modifiers) {
      const modifierRules = rules.filter(r => r.modifier_id === modifier.id);
      
      if (modifierRules.length === 0) {
        // No rules for this modifier, it passes
        passed.push(modifier);
        stats.passed++;
      } else {
        let allRulesPass = true;
        
        for (const rule of modifierRules) {
          stats.evaluated++;
          
          if (!this.evaluateRule(rule, context)) {
            allRulesPass = false;
            break;
          }
        }
        
        if (allRulesPass) {
          passed.push(modifier);
          stats.passed++;
        } else {
          failed.push(modifier);
          stats.failed++;
        }
      }
    }
    
    return { passed, failed, stats };
  }
  
  /**
   * Evaluate a rule or rule group with nested AND/OR logic
   * Backward-compatible: if a simple rule with field/operator/value is provided,
   * it is treated as a single condition. If a group with conditions/nested_groups
   * is provided, it is evaluated recursively using logic_operator.
   */
  evaluateRule(rule, context) {
    // Evaluate a single condition
    const evalCondition = (cond) => {
      const field = cond.field;
      const operator = cond.operator;
      const value = cond.value;
      
      // Guard: invalid condition
      if (!field || !operator) return false;
      
      // Extract context value (supports nested fields like 'proposal.customer_type')
      let contextValue = context[field];
      if (typeof field === 'string' && field.includes('.')) {
        const parts = field.split('.');
        contextValue = context;
        for (const part of parts) {
          contextValue = contextValue?.[part];
        }
      }
      
      switch ((operator || '').toLowerCase()) {
        case '>':
          return contextValue > value;
        case '>=':
          return contextValue >= value;
        case '<':
          return contextValue < value;
        case '<=':
          return contextValue <= value;
        case '=':
        case '==':
        case 'equals':
          return contextValue == value; // intentional loose equality for legacy
        case '!=':
        case 'not_equals':
          return contextValue != value;
        case 'in':
          return Array.isArray(value) && value.includes(contextValue);
        case 'not_in':
          return Array.isArray(value) && !value.includes(contextValue);
        default:
          return false;
      }
    };

    // Evaluate a group with logic_operator, conditions, and nested_groups
    const evalGroup = (group) => {
      if (!group) return false;
      const op = (group.logic_operator || 'AND').toUpperCase();

      // Evaluate own conditions
      let condResult;
      if (Array.isArray(group.conditions) && group.conditions.length > 0) {
        if (op === 'OR') {
          condResult = group.conditions.some(evalCondition);
        } else {
          condResult = group.conditions.every(evalCondition);
        }
      }

      // Evaluate nested groups
      let nestedResult;
      if (Array.isArray(group.nested_groups) && group.nested_groups.length > 0) {
        if (op === 'OR') {
          nestedResult = group.nested_groups.some(evalGroup);
        } else {
          nestedResult = group.nested_groups.every(evalGroup);
        }
      }

      // Combine results; when one side is undefined, return the other
      if (condResult === undefined) return nestedResult ?? false;
      if (nestedResult === undefined) return condResult ?? false;

      // Both defined; combine according to operator
      return op === 'OR' ? (condResult || nestedResult) : (condResult && nestedResult);
    };

    // Backward compatibility: if a simple rule (with field) is passed, treat as single condition
    if (rule && Object.prototype.hasOwnProperty.call(rule, 'field')) {
      return evalCondition(rule);
    }

    // Otherwise treat as group structure
    return evalGroup(rule);
  }
  
  /**
   * Rule compilation and cache helpers (P3 minimal implementation)
   */
  getRuleCacheStats() {
    return { ...this._ruleCacheStats };
  }

  getCompiledRules(tenantId, rules) {
    // Handle empty rules
    if (!rules || rules.length === 0) return { artifact: [] };

    const key = this.computeRuleCacheKey(tenantId, rules);
    const now = Date.now();
    const entry = this._ruleCache.get(key);

    if (entry && entry.expiresAt > now) {
      this._ruleCacheStats.hits++;
      return entry;
    }

    // Miss or expired
    this._ruleCacheStats.misses++;
    const artifact = this.compileRules(rules);
    const newEntry = { artifact, createdAt: now, expiresAt: now + this._ruleCacheTTLms };
    this._ruleCache.set(key, newEntry);
    return newEntry;
  }

  compileRules(rules) {
    // Normalize rules into deterministic artifacts
    if (!Array.isArray(rules)) return [];

    const normalizeOperator = (op) => {
      if (!op) return 'equals';
      const lower = String(op).toLowerCase();
      if (lower === '==' || lower === '=') return 'equals';
      if (lower === 'equals') return 'equals';
      if (lower === '!=') return 'not_equals';
      if (lower === 'not_equals') return 'not_equals';
      if (lower === 'in') return 'in';
      if (lower === '>=') return '>=';
      if (lower === '<=') return '<=';
      if (lower === '>') return '>';
      if (lower === '<') return '<';
      // Fallback to provided operator lowercased
      return lower;
    };

    const normalizeConditions = (conditions) => {
      if (!Array.isArray(conditions)) return [];
      const norm = conditions.map(c => ({
        field: c.field,
        operator: normalizeOperator(c.operator),
        value: c.value
      }));
      // Deterministic ordering by field then operator
      norm.sort((a, b) => {
        if (a.field === b.field) return a.operator.localeCompare(b.operator);
        return a.field < b.field ? -1 : 1;
      });
      return norm;
    };

    const normalizeGroup = (group) => {
      const logic = String(group.logic_operator || 'AND').toUpperCase();
      const logic_operator = logic === 'OR' ? 'OR' : 'AND';
      const conditions = normalizeConditions(group.conditions);
      const nested_groups = Array.isArray(group.nested_groups)
        ? group.nested_groups.map(normalizeGroup)
        : [];
      return {
        modifier_id: group.modifier_id,
        logic_operator,
        conditions,
        nested_groups
      };
    };

    return rules.map(normalizeGroup);
  }

  computeRuleCacheKey(tenantId, rules) {
    const canonicalize = (obj) => {
      if (Array.isArray(obj)) {
        return `[${obj.map(canonicalize).join(',')}]`;
      } else if (obj && typeof obj === 'object') {
        return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
      }
      return JSON.stringify(obj);
    };
    const payload = `${tenantId || 'unknown'}:${canonicalize(rules)}`;
    return crypto.createHash('sha1').update(payload).digest('hex');
  }
  
  /**
   * PHASE 4: Group modifiers by 8 attributes
   */
  groupModifiers(modifiers) {
    const groups = {};
    
    for (const modifier of modifiers) {
      const groupKey = this.generateGroupKey(modifier);
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          attributes: this.extractGroupAttributes(modifier),
          modifiers: []
        };
      } else {
        // Update chain_priority to minimum in group
        const currentPriority = groups[groupKey].attributes.chain_priority || 999;
        const modifierPriority = modifier.chain_priority || 999;
        groups[groupKey].attributes.chain_priority = Math.min(currentPriority, modifierPriority);
      }
      
      groups[groupKey].modifiers.push(modifier);
    }
    
    return Object.values(groups);
  }
  
  /**
   * Generate 8-attribute group key (not including chain_priority for grouping)
   */
  generateGroupKey(modifier) {
    const attributes = [
      modifier.tax_setting || 'inherit',
      modifier.modifier_type || 'percentage',
      modifier.category || 'none',
      String(modifier.affects_quantity || false),
      String(modifier.cost_percentage || 0),
      modifier.display_mode || 'inline',
      modifier.application_type || 'pre_tax',
      modifier.product_id || 'null'
    ];
    
    return attributes.join('|');
  }
  
  /**
   * Extract group attributes
   */
  extractGroupAttributes(modifier) {
    return {
      tax_setting: modifier.tax_setting || 'inherit',
      modifier_type: modifier.modifier_type || 'percentage',
      category: modifier.category || 'none',
      affects_quantity: modifier.affects_quantity || false,
      cost_percentage: modifier.cost_percentage || 0,
      display_mode: modifier.display_mode || 'inline',
      application_type: modifier.application_type || 'pre_tax',
      product_id: modifier.product_id || null,
      chain_priority: modifier.chain_priority || 999  // Include for sorting
    };
  }
  
  /**
   * Sort modifiers by their application order (group order + chain_priority)
   */
  sortModifiersByApplication(modifiers, sortedGroups) {
    const result = [];
    const modifierMap = new Map(modifiers.map(m => [m.id, m]));
    
    for (const group of sortedGroups) {
      // Sort modifiers within group by chain_priority
      const groupModifiers = group.modifiers
        .filter(m => modifierMap.has(m.id))
        .sort((a, b) => {
          const priorityA = a.chain_priority || 999;
          const priorityB = b.chain_priority || 999;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return a.id.localeCompare(b.id);
        });
      
      result.push(...groupModifiers);
    }
    
    return result;
  }
  
  /**
   * Sort groups in canonical order
   */
  sortGroups(groups) {
    return groups.sort((a, b) => {
      // Normalize to lowercase for comparison (backward compatibility)
      const appTypeA = (a.attributes.application_type || 'pre_tax').toLowerCase();
      const appTypeB = (b.attributes.application_type || 'pre_tax').toLowerCase();
      const categoryA = (a.attributes.category || 'none').toLowerCase();
      const categoryB = (b.attributes.category || 'none').toLowerCase();
      
      // 1. Cohort by application_type: pre_tax → cost → post_tax
      const cohortOrder = { 'pre_tax': 0, 'cost': 1, 'post_tax': 2 };
      const cohortA = cohortOrder[appTypeA] || 99;
      const cohortB = cohortOrder[appTypeB] || 99;
      if (cohortA !== cohortB) return cohortA - cohortB;
      
      // 2. Within cohort by category: discount → rebate → fee → bonus
      const categoryOrder = { 'discount': 0, 'rebate': 1, 'fee': 2, 'bonus': 3, 'adjustment': 4 };
      const catA = categoryOrder[categoryA] || 99;
      const catB = categoryOrder[categoryB] || 99;
      if (catA !== catB) return catA - catB;
      
      // 3. Then by modifier_type: percentage → fixed → margin → quantity → cost_adjustment
      const typeOrder = { 
        'percentage': 0, 
        'fixed': 1, 
        'margin': 2, 
        'quantity': 3, 
        'cost_adjustment': 4 
      };
      const typeA = typeOrder[a.attributes.modifier_type] || 99;
      const typeB = typeOrder[b.attributes.modifier_type] || 99;
      if (typeA !== typeB) return typeA - typeB;
      
      // 4. Then by chain_priority (if present)
      const chainPriorityA = a.attributes.chain_priority || 999;
      const chainPriorityB = b.attributes.chain_priority || 999;
      if (chainPriorityA !== chainPriorityB) return chainPriorityA - chainPriorityB;
      
      // 5. Then by created_at timestamp (earlier first)
      const createdA = a.attributes.created_at || '9999-12-31';
      const createdB = b.attributes.created_at || '9999-12-31';
      if (createdA !== createdB) return createdA.localeCompare(createdB);
      
      // 6. Finally by group_key (lexicographic) for deterministic ordering
      return a.key.localeCompare(b.key);
    });
  }
  
  /**
   * PHASE 5: Apply modifier groups
   */
  applyModifierGroups(groups, baseSubtotal, lineItems) {
    let runningTotal = new Decimal(baseSubtotal);
    let totalAdjustment = new Decimal(0);
    const appliedGroups = [];
    const skippedModifiers = [];
    
    for (const group of groups) {
      const result = this.applyGroup(group, runningTotal, lineItems);
      const adjustment = result.adjustment || result;
      const skipped = result.skipped || [];
      
      runningTotal = runningTotal.plus(adjustment);
      totalAdjustment = totalAdjustment.plus(adjustment);
      
      if (skipped.length > 0) {
        skippedModifiers.push(...skipped);
      }
      
      appliedGroups.push({
        group: group.key,
        adjustment: adjustment.toFixed(7),
        runningTotal: runningTotal.toFixed(7),
        allocations: (result.allocations || []).map(a => ({
          line_item_id: a.line_item_id,
          allocation_precise: a.allocation_precise
        }))
      });
    }
    
    return {
      finalAmount: runningTotal.toFixed(7),
      totalAdjustment: totalAdjustment.toFixed(7),
      appliedGroups,
      skippedModifiers
    };
  }
  
  /**
   * Apply a single group
   */
  applyGroup(group, runningTotal, lineItems) {
    const modifierType = group.attributes.modifier_type;
    const taxSetting = (group.attributes.tax_setting || 'taxable').toLowerCase();
    let adjustment = new Decimal(0);
    const skipped = [];
    
    // Sort modifiers within group by chain_priority
    const sortedModifiers = [...group.modifiers].sort((a, b) => {
      const priorityA = a.chain_priority || 999;
      const priorityB = b.chain_priority || 999;
      if (priorityA !== priorityB) return priorityA - priorityB;
      // Tie-break by ID for determinism
      return a.id.localeCompare(b.id);
    });
    
    if (modifierType === 'percentage') {
      // Combine percentages additively
      let combinedRate = new Decimal(0);
      for (const modifier of sortedModifiers) {
        combinedRate = combinedRate.plus(modifier.percent || 0);
      }
      
      // Calculate base based on tax_setting
      let base = runningTotal;
      if (taxSetting === 'taxable') {
        // Only apply to taxable portion
        base = lineItems.reduce((sum, item) => {
          if ((item.tax_setting || '').toUpperCase() === 'TAXABLE') {
            // HOTFIX: Use unit_price from database
            const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
            return sum.plus(new Decimal(unitPrice).times(item.quantity || 0));
          }
          return sum;
        }, new Decimal(0));
      } else if (taxSetting === 'non_taxable') {
        // Only apply to non-taxable portion
        base = lineItems.reduce((sum, item) => {
          if ((item.tax_setting || '').toUpperCase() === 'NON_TAXABLE') {
            // HOTFIX: Use unit_price from database
            const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
            return sum.plus(new Decimal(unitPrice).times(item.quantity || 0));
          }
          return sum;
        }, new Decimal(0));
      }
      
      // Apply combined rate to appropriate base
      adjustment = base.times(combinedRate.dividedBy(100));
      
    } else if (modifierType === 'fixed') {
      // Sum fixed amounts
      for (const modifier of sortedModifiers) {
        adjustment = adjustment.plus(modifier.fixed_amount || 0);
      }

      // Allocate proportionally across line items (7-decimal precision)
      const totalBase = lineItems.reduce((sum, item) => {
        const qty = item.quantity || 0;
        // HOTFIX: Use unit_price from database
        const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
        return sum.plus(new Decimal(unitPrice).times(qty));
      }, new Decimal(0));

      const allocations = [];
      if (totalBase.greaterThan(0)) {
        // First pass allocations (rounded to 7 decimals)
        let allocatedSum = new Decimal(0);
        for (let idx = 0; idx < lineItems.length; idx++) {
          const item = lineItems[idx];
          // HOTFIX: Use unit_price from database and line_item_id for allocation
          const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
          const lineTotal = new Decimal(unitPrice).times(item.quantity || 0);
          const ratio = lineTotal.dividedBy(totalBase);
          const rawAlloc = adjustment.times(ratio);
          const allocPrecise = Q7(rawAlloc);
          allocations.push({
            // HOTFIX: Use line_item_id from database
            line_item_id: item.line_item_id || item.id,
            allocation_precise: allocPrecise.toFixed(7)
          });
          allocatedSum = allocatedSum.plus(allocPrecise);
        }
        // Adjust last allocation to ensure exact sum equals adjustment (7-decimal)
        const diff = Q7(adjustment.minus(allocatedSum));
        if (!diff.isZero() && allocations.length > 0) {
          const last = allocations[allocations.length - 1];
          const fixedVal = Q7(new Decimal(last.allocation_precise).plus(diff)).toFixed(7);
          last.allocation_precise = fixedVal;
        }
      } else {
        // No base to allocate against
        for (const item of lineItems) {
          // HOTFIX: Use line_item_id from database
          allocations.push({ line_item_id: item.line_item_id || item.id, allocation_precise: '0.0000000' });
        }
      }
      
      return { adjustment, skipped, allocations };
      
    } else if (modifierType === 'margin') {
      // Handle margin adjustments - require cost data
      for (const modifier of sortedModifiers) {
        // Check if we have cost data for margin calculation
        const hasRequiredData = lineItems.every(item => item.cost !== undefined);
        
        if (!hasRequiredData) {
          // Handle missing cost based on strategy
          const strategy = modifier.missing_cost_strategy || 'SKIP';
          
          if (strategy === 'SKIP') {
            // Skip this modifier - don't apply it
            skipped.push(modifier);
            continue;
          } else if (strategy === 'USE_DEFAULT') {
            // Use default cost percentage
            const defaultCostPct = modifier.default_cost_pct || 0.7;
            const estimatedCost = runningTotal.times(defaultCostPct);
            const targetPrice = estimatedCost.dividedBy(1 - modifier.target_margin);
            adjustment = adjustment.plus(targetPrice.minus(runningTotal));
          } else if (strategy === 'FAIL') {
            throw new Error(`Missing cost data for margin modifier ${modifier.id}`);
          }
        } else {
          // Calculate margin based on actual cost
          const totalCost = lineItems.reduce((sum, item) => {
            return sum.plus(new Decimal(item.cost || 0).times(item.quantity || 0));
          }, new Decimal(0));
          
          const targetPrice = totalCost.dividedBy(1 - modifier.target_margin);
          adjustment = adjustment.plus(targetPrice.minus(runningTotal));
        }
      }
      
    } else if (modifierType === 'quantity') {
      // Handle quantity adjustments
      // This would affect the quantity of items, not the price
      // Implementation depends on specific business rules
      
    } else if (modifierType === 'cost_adjustment') {
      // Handle cost adjustments
      // This would adjust the cost basis for margin calculations
      // Implementation depends on specific business rules
    }
    
    return { adjustment, skipped, allocations: [] };
  }
  
  /**
   * PHASE 6: Calculate tax with segregation
   */
  calculateTax(baseCalc, modifierResult, lineItems, groups, config) {
    // Extract tax rates from structured config or fall back to simple rate
    let retailTaxRate, useTaxRate;
    
    if (config.tax_config) {
      // Structured config (preferred)
      retailTaxRate = new Decimal(config.tax_config.default_rate || 0);
      // Check for use_tax_rate in both places for compatibility
      useTaxRate = new Decimal(config.tax_config.use_tax_rate || config.use_tax_rate || 0);
      
      // If jurisdictions provided, sum them for total rate
      if (config.tax_config.jurisdictions && config.tax_config.jurisdictions.length > 0) {
        retailTaxRate = config.tax_config.jurisdictions.reduce((sum, j) => {
          return sum.plus(new Decimal(j.rate || 0));
        }, new Decimal(0));
      }
    } else {
      // Legacy simple config
      retailTaxRate = new Decimal(config.tax_rate || 0);
      useTaxRate = new Decimal(config.use_tax_rate || 0);
    }
    
    const taxMode = config.tax_mode || 'RETAIL';
    
    // Start with base amounts
    let retailTaxableBase = new Decimal(baseCalc.taxableSubtotal);
    let retailNonTaxable = new Decimal(baseCalc.nonTaxableSubtotal);
    let useTaxBase = new Decimal(0);
    
    // Separate pre-tax and post-tax modifiers AND track taxable vs non-taxable
    let preTaxAdjustment = new Decimal(0);
    let postTaxAdjustment = new Decimal(0);
    let taxablePreTaxAdjustment = new Decimal(0);
    let nonTaxablePreTaxAdjustment = new Decimal(0);
    
    // Calculate adjustments by type AND tax setting
    for (const group of groups) {
      const appType = (group.attributes.application_type || 'pre_tax').toLowerCase();
      const taxSetting = (group.attributes.tax_setting || 'taxable').toLowerCase();
      const adjustment = new Decimal(modifierResult.appliedGroups.find(g => g.group === group.key)?.adjustment || 0);
      
      if (appType === 'post_tax') {
        postTaxAdjustment = postTaxAdjustment.plus(adjustment);
      } else {
        preTaxAdjustment = preTaxAdjustment.plus(adjustment);
        
        // Track taxable vs non-taxable pre-tax adjustments
        if (taxSetting === 'taxable') {
          taxablePreTaxAdjustment = taxablePreTaxAdjustment.plus(adjustment);
        } else {
          nonTaxablePreTaxAdjustment = nonTaxablePreTaxAdjustment.plus(adjustment);
        }
      }
    }
    
    // Calculate tax base with STRICT SEGREGATION (not proportional)
    if (groups && groups.length > 0) {
      // Architecture requirement: Track taxable and non-taxable separately
      retailTaxableBase = new Decimal(baseCalc.taxableSubtotal).plus(taxablePreTaxAdjustment);
      retailNonTaxable = new Decimal(baseCalc.nonTaxableSubtotal).plus(nonTaxablePreTaxAdjustment);
    }
    
    // Calculate taxes
    let retailTax = new Decimal(0);
    let useTax = new Decimal(0);
    let subTaxes = [];
    
    if (taxMode === 'RETAIL' || taxMode === 'MIXED') {
      // Calculate sub-taxes if jurisdictions are provided
      if (config.tax_config && config.tax_config.jurisdictions && config.tax_config.jurisdictions.length > 0) {
        for (const jurisdiction of config.tax_config.jurisdictions) {
          const jRate = new Decimal(jurisdiction.rate || 0);
          const jAmount = Q7(retailTaxableBase.times(jRate));
          subTaxes.push({
            jurisdiction: jurisdiction.name || 'UNKNOWN',
            rate: jRate.toFixed(7),
            amount: jAmount.toFixed(7)
          });
          retailTax = retailTax.plus(jAmount);
        }
      } else {
        // No jurisdictions, use simple rate
        retailTax = Q7(retailTaxableBase.times(retailTaxRate));
      }
    }
    
    if (taxMode === 'USE_TAX' || taxMode === 'MIXED') {
      // Use tax calculation (on cost, not price)
      // Calculate use tax base from line items with cost data
      const useTaxItems = [];
      
      for (const item of lineItems) {
        // Only apply use tax if eligible and vendor didn't already collect tax
        if (item.use_tax_eligible && item.cost && !item.vendor_tax_collected) {
          const itemUseTaxBase = new Decimal(item.cost).times(item.quantity || 0);
          useTaxBase = useTaxBase.plus(itemUseTaxBase);
          useTaxItems.push(item.id);
        }
      }
      
      if (useTaxRate && useTaxRate.greaterThan(0)) {
        useTax = Q7(useTaxBase.times(useTaxRate));
      }
      
      // Add use tax items to result
      this.useTaxItems = useTaxItems;
    }
    
    return {
      taxableBase: Q7(retailTaxableBase).toFixed(7),
      nonTaxableTotal: Q7(retailNonTaxable).toFixed(7),
      retailTax: retailTax.toFixed(7),
      subTaxes: subTaxes,
      useTaxAmount: useTax.toFixed(7),
      useTaxBase: Q7(useTaxBase).toFixed(7),
      useTaxItems: this.useTaxItems || [],
      taxMode: taxMode
    };
  }
  /**
   * Persist calculation audit to database
   * @private
   */
  async _persistAudit(input, result, phaseTimings) {
    try {
      const { v4: uuidv4 } = require('uuid');
      const calcId = uuidv4();
      
      // Create main audit record
      const auditData = {
        calc_id: calcId,
        proposal_id: input.proposal.id,
        tenant_id: input.proposal.tenant_id || 'unknown',
        version: input.proposal.version || 1,
        started_at: result.calculatedAt,
        finished_at: new Date(),
        phase_timings_ms: phaseTimings,
        subtotal_precise: result.subtotalPrecise || (result.subtotal ? Q7String(result.subtotal) : '0.0000000'),
        modifier_total_precise: result.modifierTotalPrecise || (result.modifierTotal ? Q7String(result.modifierTotal) : '0.0000000'),
        taxable_base_precise: result.taxableBasePrecise || (result.taxableBase ? Q7String(result.taxableBase) : '0.0000000'),
        non_taxable_total_precise: result.nonTaxableTotal ? Q7String(result.nonTaxableTotal) : '0.0000000',
        retail_tax_precise: result.retailTaxPrecise || (result.taxAmount ? Q7String(result.taxAmount) : '0.0000000'),
        use_tax_liability_precise: result.useTaxLiability ? Q7String(result.useTaxLiability) : null,
        customer_grand_total_precise: result.grandTotalPrecise || (result.grandTotal ? Q7String(result.grandTotal) : '0.0000000'),
        grand_total: result.grandTotal,
        tax_mode: result.taxMode || 'RETAIL',
        tax_calculation: result.taxCalculation || {},
        engine_version: this.version,
        checksum: result.checksum
      };
      
      await this._auditRepository.createCalcAudit(auditData);
      
      // Create group audit records if there are modifier groups
      if (result.modifierGroups && result.modifierGroups.length > 0) {
        const groups = result.modifierGroups.map(group => ({
          group_key: group.groupKey || group.key || 'unknown',
          group_attributes: group.attributes || {},
          combined_value: group.combinedValue || group.value || 0,
          adjustment_precise: group.adjustmentPrecise || (group.adjustment ? Q7String(group.adjustment) : '0.0000000'),
          modifier_ids: group.modifierIds || group.modifiers || []
        }));
        
        await this._auditRepository.createGroupAudits(calcId, groups);
      }
      
      console.log(`✅ AUDIT: Persisted calculation ${calcId} for proposal ${input.proposal.id}`);
    } catch (error) {
      // Log error but don't fail the calculation
      console.error('⚠️ AUDIT: Failed to persist audit record:', error.message);
    }
  }
}

module.exports = CompliantCalculationEngine;