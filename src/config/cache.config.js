/**
 * Cache Configuration for Standalone Mode
 * 
 * Minimal configuration for the standalone calc engine
 */

module.exports = {
  enabled: false, // Disable cache for standalone mode
  type: 'memory',
  ttl: 300,
  maxSize: 1000
};