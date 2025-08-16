/**
 * DataFetcher - Handles database fetch operations for Pre-Processor tier
 * 
 * Features:
 * - Parallel fetching of all required data
 * - Deterministic ordering
 * - JSON rule parsing
 * - Error handling with meaningful messages
 * 
 * @version 1.0.0
 */

class DataFetcher {
  constructor(dbPool) {
    if (!dbPool) {
      throw new Error('Database pool is required');
    }
    this.pool = dbPool;
  }
  
  /**
   * Fetch proposal by ID
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Object>} - Proposal data
   */
  async fetchProposal(proposalId) {
    if (!proposalId) {
      throw new Error('Proposal ID is required');
    }
    
    const query = 'SELECT * FROM proposals WHERE id = $1';
    const result = await this.pool.query(query, [proposalId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    
    return result.rows[0];
  }
  
  /**
   * Fetch line items for proposal
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Array>} - Line items
   */
  async fetchLineItems(proposalId) {
    if (!proposalId) {
      return [];
    }
    
    const query = `
      SELECT * FROM line_items 
      WHERE proposal_id = $1 
      ORDER BY id
    `;
    
    const result = await this.pool.query(query, [proposalId]);
    return result.rows;
  }
  
  /**
   * Fetch modifiers for proposal
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Array>} - Modifiers ordered by chain_priority and id
   */
  async fetchModifiers(proposalId) {
    if (!proposalId) {
      return [];
    }
    
    const query = `
      SELECT * FROM modifiers 
      WHERE proposal_id = $1 
      ORDER BY chain_priority, id
    `;
    
    const result = await this.pool.query(query, [proposalId]);
    return result.rows;
  }
  
  /**
   * Fetch dependencies for proposal
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Array>} - Dependencies
   */
  async fetchDependencies(proposalId) {
    if (!proposalId) {
      return [];
    }
    
    const query = `
      SELECT * FROM dependencies 
      WHERE proposal_id = $1
    `;
    
    const result = await this.pool.query(query, [proposalId]);
    return result.rows;
  }
  
  /**
   * Fetch rules for modifier IDs
   * @param {Array<string>} modifierIds - Array of modifier IDs
   * @returns {Promise<Array>} - Rules with parsed JSON
   */
  async fetchRules(modifierIds) {
    if (!modifierIds || modifierIds.length === 0) {
      return [];
    }
    
    const query = `
      SELECT * FROM rules 
      WHERE modifier_id = ANY($1)
    `;
    
    const result = await this.pool.query(query, [modifierIds]);
    
    // Parse JSON rules
    return result.rows.map(row => {
      let parsedRule = null;
      if (row.rule) {
        try {
          parsedRule = JSON.parse(row.rule);
        } catch (e) {
          console.warn(`Failed to parse rule for modifier ${row.modifier_id}:`, e);
        }
      }
      
      return {
        ...row,
        parsedRule
      };
    });
  }
  
  /**
   * Execute multiple fetchers in parallel
   * @param {Array<Promise>} fetchers - Array of promises to execute
   * @returns {Promise<Array>} - Results in same order as input
   */
  async parallel(fetchers) {
    return Promise.all(fetchers);
  }
  
  /**
   * Fetch all data for a calculation request
   * @param {Object} request - Request with proposalId
   * @returns {Promise<Object>} - All fetched data
   */
  async fetchAll(request) {
    const proposalId = request.proposalId || request.proposal_id;
    
    if (!proposalId) {
      throw new Error('Proposal ID is required in request');
    }
    
    // Fetch all data in parallel for performance
    const [proposal, lineItems, modifiers, dependencies] = await this.parallel([
      this.fetchProposal(proposalId),
      this.fetchLineItems(proposalId),
      this.fetchModifiers(proposalId),
      this.fetchDependencies(proposalId)
    ]);
    
    // Extract modifier IDs for rule fetching
    const modifierIds = modifiers.map(m => m.id);
    
    // Fetch rules (separate as it depends on modifier IDs)
    const rules = await this.fetchRules(modifierIds);
    
    return {
      proposal,
      lineItems,
      modifiers,
      dependencies,
      rules
    };
  }
}

module.exports = DataFetcher;