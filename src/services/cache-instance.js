/**
 * Cache Instance Stub for Standalone Mode
 * 
 * Provides minimal cache interface for standalone calc engine
 */

// Simple in-memory cache for standalone mode
class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.enabled = false; // Disabled for standalone
  }

  async get(key) {
    if (!this.enabled) return null;
    return this.cache.get(key) || null;
  }

  async set(key, value, ttl = 300) {
    if (!this.enabled) return;
    this.cache.set(key, value);
  }

  async invalidate(pattern) {
    if (!this.enabled) return;
    // Simple pattern matching
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  async connect() {
    // No-op for standalone
  }

  startPeriodicWarming() {
    // No-op for standalone
  }

  async warmCache() {
    return 0; // No items warmed
  }
}

// Create singleton cache instance
let cacheInstance = null;

async function getCacheInstance() {
  if (!cacheInstance) {
    cacheInstance = new SimpleCache();
  }
  return cacheInstance;
}

// Warm cache on startup (no-op for standalone)
async function warmCacheOnStartup() {
  // No-op for standalone
}

module.exports = {
  getCacheInstance,
  warmCacheOnStartup
};