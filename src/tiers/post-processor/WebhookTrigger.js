/**
 * WebhookTrigger - Triggers external webhooks for real-time integrations
 * 
 * Enables real-time notification of external systems when calculations complete.
 * This is separate from Pulsar events and provides synchronous HTTP callbacks.
 * 
 * USE CASES:
 * 1. CRM Integration: Update opportunity value in Salesforce
 * 2. ERP Sync: Push pricing to SAP or Oracle
 * 3. Partner APIs: Notify distributors of quote changes
 * 4. Analytics: Send events to Segment or Amplitude
 * 5. Workflow Automation: Trigger Zapier/Make.com workflows
 * 
 * WEBHOOK CONTRACT:
 * - Method: POST
 * - Content-Type: application/json
 * - Timeout: 5 seconds
 * - Retry: 3 attempts with exponential backoff
 * - Authentication: HMAC-SHA256 signature in X-Webhook-Signature header
 * 
 * SECURITY CONSIDERATIONS:
 * - Validate webhook URLs (no internal IPs)
 * - Sign payloads with shared secret
 * - Rate limit to prevent abuse
 * - Log all webhook attempts for audit
 * 
 * @version 1.0.0
 */

class WebhookTrigger {
  constructor() {
    // Registry of webhooks by event type
    // In production, this would be loaded from database:
    // SELECT event_type, url, secret, retry_config
    // FROM webhook_subscriptions
    // WHERE active = true
    this.webhooks = new Map();
  }
  
  /**
   * Register a webhook URL for an event type
   * 
   * @param {string} event - Event type (e.g., 'calculation', 'proposal.updated')
   * @param {string} url - HTTPS endpoint to call
   * 
   * In production, webhook registration would include:
   * - URL validation (HTTPS only, no private IPs)
   * - Secret generation for HMAC signing
   * - Retry configuration
   * - Rate limits
   * - Custom headers
   */
  addWebhook(event, url) {
    if (!this.webhooks.has(event)) {
      this.webhooks.set(event, []);
    }
    this.webhooks.get(event).push(url);
    
    // Production would store in database:
    // INSERT INTO webhook_subscriptions (
    //   event_type, url, secret, created_at, active
    // ) VALUES ($1, $2, $3, NOW(), true)
  }
  
  /**
   * Trigger all webhooks for a given event
   * 
   * @param {string} event - Event type that occurred
   * @param {Object} data - Calculation result to send
   * 
   * WEBHOOK PAYLOAD FORMAT:
   * {
   *   event: 'calculation.completed',
   *   timestamp: '2024-01-16T10:30:00Z',
   *   data: {
   *     proposalId: 'uuid',
   *     checksum: 'sha256',
   *     subtotal: '1000.00',
   *     modifierTotal: '100.00',
   *     retailTax: '88.00',
   *     customerGrandTotal: '1188.00',
   *     lineItems: [...],
   *     modifiers: [...]
   *   },
   *   metadata: {
   *     version: '3.0.0',
   *     environment: 'production'
   *   }
   * }
   * 
   * CRITICAL: Webhook failures do NOT rollback the transaction
   * Webhooks are best-effort delivery with async retry
   */
  async trigger(event, data) {
    // Get all webhook URLs for this event type
    const urls = this.webhooks.get(event) || [];
    
    // If no webhooks registered, return early
    if (urls.length === 0) {
      return;
    }
    
    // Prepare webhook payload with standard envelope
    const payload = {
      event: event,
      timestamp: new Date().toISOString(),
      data: data,
      metadata: {
        version: '3.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    // Fire all webhooks in parallel
    // IMPORTANT: We use Promise.all but catch individual failures
    // This ensures one webhook failure doesn't affect others
    const promises = urls.map(url => 
      // Each webhook is wrapped in its own try-catch
      this.callWebhook(url, payload).catch(error => {
        // Log error but don't throw - webhook failures are non-fatal
        console.error(`Webhook failed for ${url}:`, error);
        
        // In production, queue for retry:
        // await this.queueForRetry(url, payload, error);
      })
    );
    
    // Wait for all webhooks to complete (success or failure)
    await Promise.all(promises);
  }
  
  /**
   * Make the actual HTTP call to a webhook
   * 
   * @private
   * @param {string} url - Webhook URL
   * @param {Object} payload - Data to send
   * @returns {Promise<Response>} - Fetch response
   */
  async callWebhook(url, payload) {
    // In production, add security and reliability:
    // const signature = this.generateHMACSignature(payload, webhook.secret);
    // const timeout = new AbortController();
    // setTimeout(() => timeout.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Production headers:
        // 'X-Webhook-Signature': signature,
        // 'X-Webhook-Event': payload.event,
        // 'X-Webhook-Timestamp': payload.timestamp,
        // 'X-Webhook-Version': '3.0.0',
        // 'User-Agent': 'SmackdabCalculationEngine/3.0.0'
      },
      body: JSON.stringify(payload),
      // signal: timeout.signal // Production: enforce timeout
    });
    
    // Check for successful response
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }
    
    return response;
  }
  
  // Production helper methods (not used in testing):
  
  // generateHMACSignature(payload, secret) {
  //   const crypto = require('crypto');
  //   const hmac = crypto.createHmac('sha256', secret);
  //   hmac.update(JSON.stringify(payload));
  //   return hmac.digest('hex');
  // }
  
  // async queueForRetry(url, payload, error) {
  //   // Store failed webhook for retry with exponential backoff
  //   await this.db.query(`
  //     INSERT INTO webhook_retry_queue (
  //       url, payload, error, attempt, next_retry_at
  //     ) VALUES ($1, $2, $3, 1, NOW() + INTERVAL '1 minute')
  //   `, [url, JSON.stringify(payload), error.message]);
  // }
  
  // async processRetryQueue() {
  //   // Background job to retry failed webhooks
  //   const pending = await this.db.query(`
  //     SELECT * FROM webhook_retry_queue
  //     WHERE next_retry_at <= NOW()
  //     AND attempt < 3
  //     ORDER BY next_retry_at
  //     LIMIT 10
  //   `);
  //   
  //   for (const webhook of pending.rows) {
  //     try {
  //       await this.callWebhook(webhook.url, JSON.parse(webhook.payload));
  //       // Success - remove from queue
  //       await this.db.query('DELETE FROM webhook_retry_queue WHERE id = $1', [webhook.id]);
  //     } catch (error) {
  //       // Failed - increment attempt and reschedule
  //       const nextAttempt = webhook.attempt + 1;
  //       const backoffMinutes = Math.pow(2, nextAttempt); // 2, 4, 8 minutes
  //       
  //       await this.db.query(`
  //         UPDATE webhook_retry_queue
  //         SET attempt = $1,
  //             next_retry_at = NOW() + INTERVAL '${backoffMinutes} minutes',
  //             last_error = $2
  //         WHERE id = $3
  //       `, [nextAttempt, error.message, webhook.id]);
  //     }
  //   }
  // }
}

module.exports = WebhookTrigger;