/**
 * Engine Module Index
 * 
 * Central export point for all calculation engines and related components.
 * This file handles engine registration on module load.
 * 
 * @author Architecture Team
 * @date 2025-08-13
 * @version 1.0.0
 */

// Import interfaces
const ICalculationEngine = require('./interfaces/ICalculationEngine');
const CalculationInput = require('./interfaces/CalculationInput');
const CalculationResult = require('./interfaces/CalculationResult');

// Import factory
const CalculationEngineFactory = require('./factory/CalculationEngineFactory');

// Import engines
const PureCalculationEngine = require('./pure/PureCalculationEngine');

// Register engines with factory - All point to the new Pure engine
CalculationEngineFactory.registerEngine('pure', PureCalculationEngine);
CalculationEngineFactory.registerEngine('compliant', PureCalculationEngine); // Backward compatibility
CalculationEngineFactory.registerEngine('v2', PureCalculationEngine); // Backward compatibility
CalculationEngineFactory.registerEngine('new', PureCalculationEngine); // Backward compatibility
CalculationEngineFactory.registerEngine('legacy', PureCalculationEngine); // Backward compatibility
CalculationEngineFactory.registerEngine('default', PureCalculationEngine); // Default engine

// Export everything
module.exports = {
  // Interfaces
  ICalculationEngine,
  CalculationInput,
  CalculationResult,
  
  // Factory
  CalculationEngineFactory,
  
  // Engines
  PureCalculationEngine,
  
  // Convenience function to get configured engine
  getEngine: (config) => CalculationEngineFactory.getEngine(config),
  
  // Convenience function to create input
  createInput: (data) => new CalculationInput(data),
  
  // Convenience function to create config
  createConfig: (overrides) => CalculationEngineFactory.createConfig(overrides)
};