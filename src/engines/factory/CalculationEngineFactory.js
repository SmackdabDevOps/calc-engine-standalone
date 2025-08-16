/**
 * CalculationEngineFactory - Factory pattern for engine selection
 * 
 * This factory manages the creation and selection of calculation engines
 * based on configuration. It enables seamless switching between different
 * engine implementations without changing calling code.
 * 
 * @author Architecture Team
 * @date 2025-08-13
 * @version 1.0.0
 */

// Engine registry
const engineRegistry = new Map();

class CalculationEngineFactory {
  /**
   * Registers an engine class with the factory
   * 
   * @param {string} name - Engine identifier
   * @param {Class} engineClass - Engine class (must extend ICalculationEngine)
   */
  static registerEngine(name, engineClass) {
    if (!name || typeof name !== 'string') {
      throw new Error('Engine name must be a non-empty string');
    }
    
    if (!engineClass || typeof engineClass !== 'function') {
      throw new Error('Engine class must be a constructor function');
    }
    
    engineRegistry.set(name.toLowerCase(), engineClass);
    console.log(`CalculationEngineFactory: Registered engine '${name}'`);
  }
  
  /**
   * Gets an engine instance based on configuration
   * 
   * @param {Object} config - Configuration object
   * @param {string} [config.ENGINE_TYPE] - Engine type to use
   * @param {string} [config.TENANT_ID] - Tenant ID for per-tenant overrides
   * @param {string} [config.FEATURE_FLAGS] - Feature flags for A/B testing
   * @param {number} [config.AB_PERCENTAGE] - Percentage for A/B testing
   * @returns {ICalculationEngine} - Engine instance
   */
  static getEngine(config = {}) {
    // Determine which engine to use
    const engineType = this.selectEngineType(config);
    
    // Get engine class from registry
    const EngineClass = engineRegistry.get(engineType.toLowerCase());
    
    if (!EngineClass) {
      // Fallback to compliant if requested engine not found
      console.warn(`CalculationEngineFactory: Engine '${engineType}' not found, falling back to 'compliant'`);
      const CompliantEngine = engineRegistry.get('compliant');
      
      if (!CompliantEngine) {
        throw new Error(`No engines registered. Compliant engine not found.`);
      }
      
      return new CompliantEngine();
    }
    
    // Create and return engine instance
    const engine = new EngineClass();
    
    // Log selection for monitoring
    this.logEngineSelection(engineType, config, engine);
    
    return engine;
  }
  
  /**
   * Determines which engine type to use based on configuration
   * 
   * @private
   * @param {Object} config - Configuration object
   * @returns {string} - Selected engine type
   */
  static selectEngineType(config) {
    // Priority 1: Explicit engine override (for testing)
    if (config.FORCE_ENGINE) {
      return config.FORCE_ENGINE;
    }
    
    // Priority 2: Per-tenant configuration
    if (config.TENANT_ID && config.TENANT_ENGINES) {
      const tenantEngine = config.TENANT_ENGINES[config.TENANT_ID];
      if (tenantEngine) {
        console.log(`CalculationEngineFactory: Using tenant-specific engine '${tenantEngine}' for tenant '${config.TENANT_ID}'`);
        return tenantEngine;
      }
    }
    
    // Priority 3: A/B testing
    if (config.AB_PERCENTAGE && config.AB_NEW_ENGINE) {
      const random = Math.random() * 100;
      if (random < config.AB_PERCENTAGE) {
        console.log(`CalculationEngineFactory: A/B test selected new engine (${random.toFixed(2)} < ${config.AB_PERCENTAGE})`);
        return config.AB_NEW_ENGINE;
      }
    }
    
    // Priority 4: Feature flags
    if (config.FEATURE_FLAGS) {
      const flags = typeof config.FEATURE_FLAGS === 'string' 
        ? config.FEATURE_FLAGS.split(',') 
        : config.FEATURE_FLAGS;
        
      if (Array.isArray(flags)) {
        if (flags.includes('use-new-engine')) {
          return 'new';
        }
        if (flags.includes('use-experimental-engine')) {
          return 'experimental';
        }
      }
    }
    
    // Priority 5: Default engine from config
    if (config.ENGINE_TYPE) {
      return config.ENGINE_TYPE;
    }
    
    // Priority 6: Environment variable
    if (process.env.CALCULATION_ENGINE) {
      return process.env.CALCULATION_ENGINE;
    }
    
    // Default: Compliant engine
    return 'compliant';
  }
  
  /**
   * Logs engine selection for monitoring and debugging
   * 
   * @private
   * @param {string} engineType - Selected engine type
   * @param {Object} config - Configuration used
   * @param {ICalculationEngine} engine - Engine instance
   */
  static logEngineSelection(engineType, config, engine) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      engine_type: engineType,
      engine_version: engine.getVersion(),
      engine_capabilities: engine.getCapabilities(),
      tenant_id: config.TENANT_ID,
      selection_reason: this.getSelectionReason(engineType, config)
    };
    
    // In production, this would go to a metrics service
    console.log('CalculationEngineFactory: Engine selected', JSON.stringify(logEntry));
  }
  
  /**
   * Determines why a particular engine was selected
   * 
   * @private
   * @param {string} engineType - Selected engine type
   * @param {Object} config - Configuration used
   * @returns {string} - Reason for selection
   */
  static getSelectionReason(engineType, config) {
    if (config.FORCE_ENGINE) {
      return 'forced_override';
    }
    
    if (config.TENANT_ID && config.TENANT_ENGINES && config.TENANT_ENGINES[config.TENANT_ID]) {
      return 'tenant_specific';
    }
    
    if (config.AB_PERCENTAGE && config.AB_NEW_ENGINE === engineType) {
      return 'ab_test';
    }
    
    if (config.FEATURE_FLAGS) {
      return 'feature_flag';
    }
    
    if (config.ENGINE_TYPE === engineType) {
      return 'config_default';
    }
    
    if (process.env.CALCULATION_ENGINE === engineType) {
      return 'environment_variable';
    }
    
    return 'system_default';
  }
  
  /**
   * Gets list of all registered engines
   * 
   * @returns {Array<string>} - List of engine names
   */
  static getRegisteredEngines() {
    return Array.from(engineRegistry.keys());
  }
  
  /**
   * Checks if an engine is registered
   * 
   * @param {string} name - Engine name
   * @returns {boolean} - True if registered
   */
  static isEngineRegistered(name) {
    return engineRegistry.has(name.toLowerCase());
  }
  
  /**
   * Clears all registered engines (mainly for testing)
   */
  static clearRegistry() {
    engineRegistry.clear();
  }
  
  /**
   * Creates configuration from environment and defaults
   * 
   * @param {Object} overrides - Configuration overrides
   * @returns {Object} - Complete configuration
   */
  static createConfig(overrides = {}) {
    return {
      ENGINE_TYPE: process.env.CALCULATION_ENGINE || 'compliant',
      AB_PERCENTAGE: parseInt(process.env.CALCULATION_ENGINE_AB_PERCENT || '0'),
      AB_NEW_ENGINE: process.env.CALCULATION_ENGINE_AB_TARGET || 'new',
      TENANT_ENGINES: this.loadTenantConfig(),
      ...overrides
    };
  }
  
  /**
   * Loads tenant-specific engine configuration
   * 
   * @private
   * @returns {Object} - Tenant to engine mapping
   */
  static loadTenantConfig() {
    // In production, this would load from database or config service
    // For now, using environment variable
    if (process.env.TENANT_ENGINE_CONFIG) {
      try {
        return JSON.parse(process.env.TENANT_ENGINE_CONFIG);
      } catch (e) {
        console.error('CalculationEngineFactory: Failed to parse TENANT_ENGINE_CONFIG', e);
      }
    }
    
    // Default tenant configurations
    return {
      // 'tenant_123': 'new',  // Example: Testing new engine
      // 'tenant_456': 'legacy' // Example: Staying on old engine
    };
  }
}

module.exports = CalculationEngineFactory;