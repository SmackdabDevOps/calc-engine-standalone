/**
 * TransactionManager - Manages database transactions
 * 
 * Ensures atomicity of all post-processing database operations.
 * If any operation fails, ALL changes are rolled back to maintain consistency.
 * 
 * This is critical for maintaining data integrity when:
 * - Persisting calculation results
 * - Updating proposal status
 * - Recording audit logs
 * - Updating dependent tables
 * 
 * Uses PostgreSQL's ACID transaction guarantees to ensure:
 * - Atomicity: All operations succeed or all fail
 * - Consistency: Database constraints are maintained
 * - Isolation: Concurrent calculations don't interfere
 * - Durability: Committed data survives system failures
 * 
 * @version 1.0.0
 */

class TransactionManager {
  constructor(db) {
    // PostgreSQL connection pool
    // Should be configured with:
    //   - max connections: 20-50 depending on load
    //   - connection timeout: 30 seconds
    //   - idle timeout: 10 minutes
    //   - statement timeout: 5 seconds for writes
    this.db = db;
  }
  
  /**
   * Execute a series of database operations within a transaction
   * 
   * @param {Function} operation - Async function containing database operations
   *                               Receives transaction object as parameter
   * @returns {Promise<any>} - Result from the operation function
   * @throws {Error} - Rolls back transaction and re-throws any error
   * 
   * USAGE PATTERN:
   * await transactionManager.executeInTransaction(async (tx) => {
   *   await tx.query('INSERT INTO calculations ...');
   *   await tx.query('UPDATE proposals SET ...');
   *   await tx.query('INSERT INTO audit_log ...');
   *   return result;
   * });
   * 
   * CRITICAL BEHAVIORS:
   * 1. All queries within operation MUST use the tx object, not the main pool
   * 2. Transaction automatically commits if operation succeeds
   * 3. Transaction automatically rolls back if operation throws
   * 4. Nested transactions are not supported (would deadlock)
   */
  async executeInTransaction(operation) {
    // Begin a new database transaction
    // In PostgreSQL, this issues a BEGIN command
    // This creates a new transaction context isolated from other connections
    const tx = await this.db.beginTransaction();
    
    try {
      // Execute the provided operation within transaction context
      // The operation receives the transaction object to use for queries
      // IMPORTANT: All database operations must use tx, not this.db
      const result = await operation(tx);
      
      // If operation succeeds, commit the transaction
      // This makes all changes permanent and visible to other connections
      // In PostgreSQL, this issues a COMMIT command
      await this.db.commit();
      
      // Return the result from the operation
      return result;
      
    } catch (error) {
      // If ANY error occurs, roll back the entire transaction
      // This undoes ALL changes made within the transaction
      // In PostgreSQL, this issues a ROLLBACK command
      // 
      // Common rollback scenarios:
      // - Constraint violations (unique, foreign key, check)
      // - Deadlocks with other transactions
      // - Connection failures
      // - Application errors (validation failures, business rule violations)
      await this.db.rollback();
      
      // Re-throw the error for upstream handling
      // The PostProcessor will log this and record metrics
      throw error;
    }
  }
}

module.exports = TransactionManager;