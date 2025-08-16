/**
 * EventOutbox - Implements transactional outbox pattern for reliable event delivery
 * 
 * PURPOSE:
 * Ensures events are only published after database transactions commit successfully.
 * Provides at-least-once delivery guarantee with retry mechanism.
 * 
 * KEY FEATURES:
 * - Events written to outbox table within transaction
 * - Background processor publishes events after commit
 * - Exponential backoff for retries
 * - Dead letter queue for permanently failed events
 * - Idempotency to prevent duplicate processing
 * 
 * @class EventOutbox
 */

class EventOutbox {
  constructor(dbPool, eventBus) {
    /**
     * Database connection pool for transactional operations
     */
    this.dbPool = dbPool;
    
    /**
     * Event bus for publishing events
     */
    this.eventBus = eventBus;
    
    /**
     * Processing state
     */
    this.isProcessing = false;
    this.processingInterval = null;
  }
  
  /**
   * Publish event within a database transaction
   * 
   * This method writes the event to the outbox table but does NOT
   * emit it immediately. The event will be published by the background
   * processor after the transaction commits.
   * 
   * @param {Object} tx - Database transaction object
   * @param {Object} event - Event to publish
   * @returns {Promise<string>} Event ID
   */
  async publishWithinTransaction(tx, event) {
    const query = `
      INSERT INTO event_outbox (
        event_type,
        aggregate_id,
        payload,
        metadata,
        status
      ) VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING id
    `;
    
    const result = await tx.query(query, [
      event.type,
      event.aggregateId,
      event.payload,
      event.metadata || {}
    ]);
    
    return result.rows[0].id;
  }
  
  /**
   * Process pending events from the outbox
   * 
   * This method should be called periodically by a background worker.
   * It fetches pending events, attempts to publish them, and handles
   * retries for failed events.
   */
  async processPendingEvents() {
    if (this.isProcessing) {
      return; // Prevent concurrent processing
    }
    
    this.isProcessing = true;
    
    try {
      // Fetch pending events
      const events = await this.fetchPendingEvents();
      
      for (const event of events) {
        await this.processEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Fetch pending events from the outbox
   * 
   * @returns {Promise<Array>} Array of pending events
   */
  async fetchPendingEvents() {
    const query = `
      SELECT * FROM event_outbox
      WHERE status IN ('PENDING', 'PROCESSING')
        AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
      ORDER BY created_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `;
    
    const result = await this.dbPool.query(query);
    return result.rows;
  }
  
  /**
   * Process a single event
   * 
   * @param {Object} event - Event to process
   */
  async processEvent(event) {
    // Skip already completed events (idempotency)
    if (event.status === 'COMPLETED') {
      return;
    }
    
    // Check if max retries exceeded
    if (event.retry_count >= event.max_retries) {
      await this.moveToDeadLetter(event);
      return;
    }
    
    try {
      // Mark as processing
      await this.updateEventStatus(event.id, 'PROCESSING');
      
      // Emit the event
      await this.eventBus.emit(event.event_type, event.payload);
      
      // Mark as completed
      await this.updateEventStatus(event.id, 'COMPLETED');
      
    } catch (error) {
      // Handle failure with retry
      await this.handleEventFailure(event, error);
    }
  }
  
  /**
   * Update event status in the outbox
   * 
   * @param {string} eventId - Event ID
   * @param {string} status - New status
   */
  async updateEventStatus(eventId, status) {
    const query = `
      UPDATE event_outbox
      SET status = $1,
          processed_at = CASE WHEN $1 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE processed_at END
      WHERE id = $2
    `;
    
    await this.dbPool.query(query, [status, eventId]);
  }
  
  /**
   * Handle event processing failure
   * 
   * @param {Object} event - Failed event
   * @param {Error} error - Processing error
   */
  async handleEventFailure(event, error) {
    const newRetryCount = event.retry_count + 1;
    
    // Calculate next retry time with exponential backoff
    const backoffSeconds = Math.pow(2, newRetryCount);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
    
    const query = `
      UPDATE event_outbox
      SET status = 'PENDING',
          retry_count = retry_count + 1,
          next_retry_at = $1,
          error_message = $2
      WHERE id = $3
    `;
    
    await this.dbPool.query(query, [
      nextRetryAt,
      error.message,
      event.id
    ]);
  }
  
  /**
   * Move event to dead letter queue
   * 
   * @param {Object} event - Event that exceeded max retries
   */
  async moveToDeadLetter(event) {
    const query = `
      UPDATE event_outbox
      SET status = 'DEAD_LETTER',
          error_message = 'Max retries exceeded'
      WHERE id = $1
    `;
    
    await this.dbPool.query(query, [event.id]);
  }
  
  /**
   * Start background processing
   * 
   * @param {number} intervalMs - Processing interval in milliseconds
   */
  startProcessing(intervalMs = 5000) {
    if (this.processingInterval) {
      return; // Already processing
    }
    
    this.processingInterval = setInterval(() => {
      this.processPendingEvents().catch(error => {
        console.error('Error processing outbox events:', error);
      });
    }, intervalMs);
  }
  
  /**
   * Stop background processing
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

module.exports = EventOutbox;