/**
 * DeterministicDataFetcher - Ensures consistent data retrieval
 * 
 * Purpose:
 * - Guarantee deterministic ordering across all fetches
 * - Handle large datasets with stable pagination
 * - Prevent order-based hash drift
 * 
 * @class DeterministicDataFetcher
 */
class DeterministicDataFetcher {
  constructor(db) {
    this.db = db;
    this.collator = new Intl.Collator('en', { 
      sensitivity: 'base', 
      numeric: false 
    });
  }
  
  /**
   * Fetch line items with deterministic ordering
   * 
   * CRITICAL: Always use ORDER BY id ASC for stable sorting
   * Re-sort in memory after fetch to neutralize DB collation differences
   * 
   * @param {string} proposalId - Proposal ID
   * @param {Object} options - Pagination settings
   * @returns {Promise<Array>} Sorted line items
   */
  async fetchLineItems(proposalId, options = {}) {
    const pageSize = options.pageSize || 1000;
    const items = [];
    let offset = 0;
    
    // Paginate through all results deterministically
    while (true) {
      const batch = await this.db.query(
        `SELECT * FROM line_items 
         WHERE proposal_id = $1 
         AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT $2 OFFSET $3`,
        [proposalId, pageSize, offset]
      );
      
      if (batch.rows.length === 0) break;
      items.push(...batch.rows);
      offset += pageSize;
    }
    
    // Re-sort in memory with stable collation
    return items.sort((a, b) => this.collator.compare(a.id, b.id));
  }
  
  /**
   * Fetch modifiers with chain_priority ordering
   */
  async fetchModifiers(proposalId) {
    const modifiers = await this.db.query(
      `SELECT * FROM modifiers 
       WHERE proposal_id = $1 
       AND deleted_at IS NULL
       ORDER BY chain_priority ASC, id ASC`,
      [proposalId]
    );
    
    // Re-sort for consistency
    return this.sortModifiers(modifiers.rows);
  }
  
  sortModifiers(modifiers) {
    return modifiers.sort((a, b) => {
      // First by chain_priority
      if (a.chain_priority !== b.chain_priority) {
        return a.chain_priority - b.chain_priority;
      }
      // Then by ID
      return this.collator.compare(a.id, b.id);
    });
  }
}

module.exports = DeterministicDataFetcher;