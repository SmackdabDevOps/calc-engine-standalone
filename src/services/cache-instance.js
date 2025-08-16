const ThreeTierCache = require('./three-tier-cache');
const cacheConfig = require('../config/cache.config');
const { Pool } = require('pg');

// Create singleton cache instance
let cacheInstance = null;

async function getCacheInstance() {
  if (!cacheInstance) {
    cacheInstance = new ThreeTierCache(cacheConfig);
    
    // Set up preload callback for hot cache warming
    cacheInstance.preloadCallback = async () => {
      try {
        // Get database connection
        const pool = new Pool({
          user: process.env.DB_USER || 'smackdab',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'smackdab_poc',
          password: process.env.DB_PASSWORD || 'smackdab123',
          port: process.env.DB_PORT || 5432,
        });
        
        // Query for active proposals
        const query = `
          SELECT 
            p.proposal_id,
            p.name,
            p.customer_name,
            p.status,
            p.total,
            p.discount,
            p.final_total,
            p.created_at,
            p.updated_at,
            COUNT(li.line_item_id) as line_item_count
          FROM proposals p
          LEFT JOIN proposal_line_items li ON p.proposal_id = li.proposal_id
          WHERE p.status IN ('draft', 'pending', 'in_review')
          GROUP BY p.proposal_id
          ORDER BY p.updated_at DESC
          LIMIT 100
        `;
        
        const result = await pool.query(query);
        await pool.end();
        
        return result.rows;
      } catch (error) {
        console.error('Error loading proposals for cache warming:', error);
        return [];
      }
    };
    
    // Connect to Redis/Dragonfly
    try {
      await cacheInstance.connect();
      console.log('Three-tier cache connected to Dragonfly');
      
      // Start periodic warming if enabled
      if (process.env.CACHE_WARMING_ENABLED !== 'false') {
        cacheInstance.startPeriodicWarming();
        console.log('Cache periodic warming started');
      }
    } catch (error) {
      console.error('Cache connection error:', error);
      // Continue without cache - graceful degradation
    }
  }
  
  return cacheInstance;
}

// Warm cache on startup
async function warmCacheOnStartup() {
  try {
    const cache = await getCacheInstance();
    const count = await cache.warmCache();
    console.log(`Cache warmed with ${count} proposals`);
  } catch (error) {
    console.error('Cache warming error:', error);
  }
}

module.exports = {
  getCacheInstance,
  warmCacheOnStartup
};