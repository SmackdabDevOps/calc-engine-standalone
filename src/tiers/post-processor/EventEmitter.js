/**
 * EventEmitter - Emits domain events to Pulsar/Kafka
 * 
 * This is the integration point between the calculation engine and the event-driven architecture.
 * Events are published to message brokers (Pulsar/Kafka) for asynchronous processing by downstream services.
 * 
 * In production, this should be replaced with actual Pulsar/Kafka client.
 * The current implementation is a simple in-memory event emitter for testing.
 * 
 * EVENT PATTERNS:
 * - calculation.completed: Fired after successful calculation
 * - calculation.failed: Fired when calculation fails
 * - proposal.updated: Fired when proposal values change
 * - modifier.applied: Fired for each modifier application
 * 
 * PULSAR INTEGRATION (Production):
 * - Topic: persistent://public/default/calculations
 * - Partitioning: By proposal_id for ordering guarantees
 * - Retention: 7 days for replay capability
 * - Schema: Avro for schema evolution
 * 
 * @version 1.0.0
 */

class EventEmitter {
  constructor() {
    // In-memory handler registry for testing
    // Production would initialize Pulsar client here:
    // this.pulsarClient = new Pulsar.Client({
    //   serviceUrl: 'pulsar://localhost:6650',
    //   operationTimeoutSeconds: 30,
    // });
    // this.producers = new Map();
    this.handlers = new Map();
  }
  
  /**
   * Register an event handler (for testing/local development)
   * 
   * @param {string} event - Event name (e.g., 'calculation.completed')
   * @param {Function} handler - Async function to handle the event
   * 
   * In production, consumers would subscribe via Pulsar, not this method
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }
  
  /**
   * Emit an event to all registered handlers / Pulsar topic
   * 
   * @param {string} event - Event name following pattern: {domain}.{action}
   * @param {Object} data - Event payload containing calculation result
   * 
   * PULSAR MESSAGE FORMAT:
   * {
   *   eventType: 'calculation.completed',
   *   timestamp: '2024-01-16T10:30:00Z',
   *   proposalId: 'uuid-here',
   *   checksum: 'sha256-hash',
   *   payload: { ...calculation result },
   *   metadata: {
   *     version: '3.0.0',
   *     engine: 'pure',
   *     processingTime: 45
   *   }
   * }
   * 
   * CRITICAL BEHAVIORS:
   * 1. Events are fire-and-forget within the transaction
   * 2. Failed event emission doesn't rollback the transaction
   * 3. Events should be idempotent - consumers must handle duplicates
   * 4. Events are ordered per proposal_id partition
   */
  async emit(event, data) {
    // In production, this would publish to Pulsar:
    // const producer = await this.getProducer(event);
    // const message = {
    //   eventType: event,
    //   timestamp: new Date().toISOString(),
    //   proposalId: data.proposalId,
    //   checksum: data.checksum,
    //   payload: data,
    //   metadata: {
    //     version: '3.0.0',
    //     engine: 'pure',
    //     processingTime: data._performance?.totalMs
    //   }
    // };
    // 
    // await producer.send({
    //   data: Buffer.from(JSON.stringify(message)),
    //   properties: {
    //     'proposal-id': data.proposalId,
    //     'event-type': event,
    //     'checksum': data.checksum
    //   },
    //   partitionKey: data.proposalId, // Ensures ordering per proposal
    //   eventTimestamp: Date.now()
    // });
    
    // Testing implementation - call local handlers
    const handlers = this.handlers.get(event) || [];
    
    // Execute all handlers, but don't let individual failures stop others
    // This mimics Pulsar's behavior where one consumer failure doesn't affect others
    for (const handler of handlers) {
      try {
        // Each handler processes independently
        // In Pulsar, these would be separate consumer groups
        await handler(data);
      } catch (error) {
        // Log error but continue with other handlers
        // In production, failed messages would be sent to DLQ (Dead Letter Queue)
        console.error(`Event handler error for ${event}:`, error);
        
        // TODO: In production, send to DLQ:
        // await this.sendToDeadLetterQueue(event, data, error);
      }
    }
  }
  
  // Production helper methods (not used in testing):
  
  // async getProducer(topic) {
  //   if (!this.producers.has(topic)) {
  //     const producer = await this.pulsarClient.createProducer({
  //       topic: `persistent://public/default/${topic}`,
  //       sendTimeoutMs: 30000,
  //       batchingEnabled: true,
  //       batchingMaxMessages: 100,
  //       batchingMaxPublishDelayMs: 10
  //     });
  //     this.producers.set(topic, producer);
  //   }
  //   return this.producers.get(topic);
  // }
  
  // async close() {
  //   for (const producer of this.producers.values()) {
  //     await producer.close();
  //   }
  //   await this.pulsarClient.close();
  // }
}

module.exports = EventEmitter;