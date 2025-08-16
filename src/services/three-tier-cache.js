/**
 * Three Tier Cache Stub for Standalone Mode
 * 
 * Minimal implementation for standalone calc engine
 */

class ThreeTierCache {
  constructor(config = {}) {
    this.enabled = false;
    this.cache = new Map();
  }

  async get(key) {
    if (!this.enabled) return null;
    return this.cache.get(key) || null;
  }

  async set(key, value, ttl = 300) {
    if (!this.enabled) return;
    this.cache.set(key, value);
    
    // Simple TTL cleanup
    if (ttl > 0) {
      setTimeout(() => {
        this.cache.delete(key);
      }, ttl * 1000);
    }
  }

  async invalidate(pattern) {
    if (!this.enabled) return;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  async clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      enabled: this.enabled,
      size: this.cache.size,
      hits: 0,
      misses: 0
    };
  }
}

module.exports = ThreeTierCache;