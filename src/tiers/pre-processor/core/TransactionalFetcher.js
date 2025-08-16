/**
 * TransactionalFetcher - Ensures read consistency across fetches
 * 
 * Purpose:
 * - Prevent mixed-state inputs from concurrent updates
 * - Guarantee all data from same point in time
 * - Enable repeatable reads for determinism
 * 
 * @class TransactionalFetcher
 */
class TransactionalFetcher {
  constructor(pool) {
    this.pool = pool;
  }
  
  /**
   * Execute all fetches within a single transaction
   * 
   * CRITICAL: All queries see the same database state
   * Uses READ COMMITTED or REPEATABLE READ isolation
   * 
   * @param {Function} fetchOperations - Async function with fetches
   * @returns {Promise<T>} Result from fetch operations
   */
  async withConsistentSnapshot(fetchOperations) {
    const client = await this.pool.connect();
    
    try {
      // Start transaction with appropriate isolation
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      
      // All fetches within this block see consistent state
      const result = await fetchOperations(client);
      
      // Commit read-only transaction
      await client.query('COMMIT');
      
      return result;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Fetch all data in single consistent snapshot
   */
  async fetchAllConsistent(proposalId, modifierIds = []) {
    return this.withConsistentSnapshot(async (client) => {
      // Execute all queries with same client/transaction
      const [proposal, lineItems, modifiers, deps, rules] = await Promise.all([
        client.query('SELECT * FROM proposals WHERE id = $1', [proposalId]),
        client.query('SELECT * FROM line_items WHERE proposal_id = $1 ORDER BY id', [proposalId]),
        client.query('SELECT * FROM modifiers WHERE proposal_id = $1 ORDER BY chain_priority, id', [proposalId]),
        client.query('SELECT * FROM dependencies WHERE proposal_id = $1 ORDER BY depends_on, modifier_id', [proposalId]),
        modifierIds.length > 0 
          ? client.query('SELECT * FROM rules WHERE id = ANY($1::uuid[])', [modifierIds])
          : Promise.resolve({ rows: [] })
      ]);
      
      return {
        proposal: proposal.rows[0],
        lineItems: lineItems.rows,
        modifiers: modifiers.rows,
        dependencies: deps.rows,
        rules: rules.rows
      };
    });
  }
}

module.exports = TransactionalFetcher;