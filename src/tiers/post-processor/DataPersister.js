/**
 * DataPersister - Persists calculation results to PostgreSQL database
 * 
 * Handles the critical task of storing calculation results permanently.
 * Uses UPSERT pattern to handle concurrent updates safely.
 * 
 * DATABASE SCHEMA REQUIREMENTS:
 * - calculation_results table with columns:
 *   - proposal_id (UUID, primary key or unique)
 *   - subtotal (DECIMAL(19,7) for Q7 precision)
 *   - total (DECIMAL(19,7))
 *   - checksum (VARCHAR(64) for SHA-256)
 *   - created_at (TIMESTAMP)
 *   - updated_at (TIMESTAMP)
 * 
 * The table should also store:
 * - modifier_total (DECIMAL(19,7))
 * - retail_tax (DECIMAL(19,7))
 * - line_items_json (JSONB)
 * - modifiers_json (JSONB)
 * - metadata (JSONB for extensibility)
 * 
 * @version 1.0.0
 */

class DataPersister {
  constructor(db) {
    // PostgreSQL connection pool or transaction object
    // When called within TransactionManager, this will be the transaction
    // When called standalone, this will be the main pool
    this.db = db;
  }
  
  /**
   * Persist calculation results to database
   * 
   * @param {Object} result - Complete calculation result from Pure Engine
   * @returns {Promise<Object>} - Database query result
   * 
   * UPSERT STRATEGY:
   * - INSERT if this is the first calculation for the proposal
   * - UPDATE if a calculation already exists
   * - The checksum changes with any input change, providing version tracking
   * 
   * CONCURRENCY HANDLING:
   * - ON CONFLICT clause handles race conditions
   * - Last writer wins for the same proposal_id
   * - Checksum provides optimistic locking if needed
   */
  async persist(result) {
    // SQL UPSERT query using PostgreSQL's ON CONFLICT
    // This pattern ensures we never get duplicate key errors
    // and handles concurrent writes gracefully
    const query = `
      INSERT INTO calculation_results 
      (proposal_id, subtotal, total, checksum, created_at) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (proposal_id) 
      DO UPDATE SET 
        subtotal = $2, 
        total = $3, 
        checksum = $4,
        updated_at = $5
    `;
    
    // Prepare values for parameterized query
    // SECURITY: Always use parameterized queries to prevent SQL injection
    const values = [
      result.proposalId,                              // $1: Unique proposal identifier
      result.subtotal,                                // $2: Base amount before modifiers/tax
      result.total || result.customerGrandTotal,      // $3: Final amount (handle both field names)
      result.checksum,                                // $4: SHA-256 hash for version tracking
      new Date()                                      // $5: Timestamp for created_at or updated_at
    ];
    
    // Execute the query
    // If within a transaction, this participates in the transaction
    // If standalone, this is an auto-commit operation
    return await this.db.query(query, values);
    
    // TODO: Enhanced version for production should also persist:
    // - Line items as JSONB for detailed breakdown
    // - Modifiers as JSONB for audit trail
    // - Calculation metadata (version, engine used, processing time)
    // - User context (who triggered the calculation)
    // 
    // Example enhanced query:
    // INSERT INTO calculation_results (
    //   proposal_id, subtotal, modifier_total, retail_tax, total,
    //   checksum, line_items, modifiers, metadata,
    //   created_at, created_by
    // ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    // ON CONFLICT (proposal_id) DO UPDATE SET
    //   subtotal = EXCLUDED.subtotal,
    //   modifier_total = EXCLUDED.modifier_total,
    //   retail_tax = EXCLUDED.retail_tax,
    //   total = EXCLUDED.total,
    //   checksum = EXCLUDED.checksum,
    //   line_items = EXCLUDED.line_items,
    //   modifiers = EXCLUDED.modifiers,
    //   metadata = EXCLUDED.metadata,
    //   updated_at = EXCLUDED.created_at,
    //   updated_by = EXCLUDED.created_by,
    //   version = calculation_results.version + 1
  }
}

module.exports = DataPersister;