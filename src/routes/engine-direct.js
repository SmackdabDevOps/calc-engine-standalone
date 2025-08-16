/**
 * Direct Engine Access Route
 * Provides direct access to calculation engine for testing interfaces
 * 
 * This route bypasses the proposal/database layer and directly
 * processes calculation requests through the engine
 */

const express = require('express');
const router = express.Router();
const CalculationEngineFactory = require('../engines/factory/CalculationEngineFactory');

/**
 * POST /api/engine/calculate
 * Direct calculation endpoint for test interfaces
 */
router.post('/calculate', async (req, res) => {
  try {
    const input = req.body;
    
    // Get engine (default to 'pure' for 3-tier)
    const engineType = input.engineType || 'pure';
    const engine = CalculationEngineFactory.getEngine(engineType);
    
    // Build calculation context
    const context = {
      proposalId: input.proposalId || 'test-' + Date.now(),
      lineItems: input.lineItems || [],
      modifiers: input.modifiers || [],
      config: input.config || {
        schemaVersion: '1.0',
        tax_rate: '0.10',
        tax_mode: 'RETAIL'
      },
      dependencies: input.dependencies || [],
      // Add any additional fields from input
      ...input
    };
    
    // Calculate
    const result = await engine.calculate(context);
    
    // Return result
    res.json(result);
    
  } catch (error) {
    console.error('Direct calculation error:', error);
    res.status(500).json({
      error: 'Calculation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/engine/info
 * Get engine information
 */
router.get('/info', (req, res) => {
  try {
    const engines = CalculationEngineFactory.getRegisteredEngines();
    
    // Get default engine instance to retrieve version and capabilities
    const engine = CalculationEngineFactory.getEngine({ ENGINE_TYPE: 'pure' });
    
    res.json({
      availableEngines: engines,
      defaultEngine: 'pure',
      version: engine.getVersion(),
      capabilities: engine.getCapabilities()
    });
  } catch (error) {
    console.error('Error getting engine info:', error);
    res.status(500).json({
      error: 'Failed to get engine info',
      message: error.message
    });
  }
});

/**
 * GET /api/engine/fixtures
 * Get available test fixtures
 */
router.get('/fixtures', (req, res) => {
  // Return some standard test fixtures
  const fixtures = [
    { id: 'simple', name: 'Simple Calculation', description: 'Basic line items with tax' },
    { id: 'discount', name: 'With Discount', description: 'Percentage discount modifier' },
    { id: 'complex', name: 'Complex Scenario', description: 'Multiple modifiers and dependencies' }
  ];
  
  res.json(fixtures);
});

/**
 * GET /api/engine/fixtures/:id
 * Get specific test fixture
 */
router.get('/fixtures/:id', (req, res) => {
  const fixtures = {
    simple: {
      proposalId: "test-simple",
      lineItems: [
        {
          id: "item-1",
          unitPrice: "100.00",
          quantity: 2,
          taxSetting: "TAXABLE"
        }
      ],
      modifiers: [],
      config: {
        schemaVersion: "1.0",
        tax_rate: "0.10",
        tax_mode: "RETAIL"
      }
    },
    discount: {
      proposalId: "test-discount",
      lineItems: [
        {
          id: "item-1",
          unitPrice: "100.00",
          quantity: 2,
          taxSetting: "TAXABLE"
        }
      ],
      modifiers: [
        {
          id: "discount-1",
          modifier_type: "percentage",
          value: "-15",
          application_type: "pre_tax",
          chain_priority: 1
        }
      ],
      config: {
        schemaVersion: "1.0",
        tax_rate: "0.10",
        tax_mode: "RETAIL"
      }
    },
    complex: {
      proposalId: "test-complex",
      lineItems: [
        {
          id: "item-1",
          unitPrice: "150.00",
          quantity: 2,
          taxSetting: "TAXABLE"
        },
        {
          id: "item-2",
          unitPrice: "75.00",
          quantity: 3,
          taxSetting: "EXEMPT"
        }
      ],
      modifiers: [
        {
          id: "discount-1",
          modifier_type: "percentage",
          value: "-10",
          application_type: "pre_tax",
          chain_priority: 1
        },
        {
          id: "fee-1",
          modifier_type: "fixed",
          value: "25.00",
          application_type: "post_tax",
          chain_priority: 2
        }
      ],
      config: {
        schemaVersion: "1.0",
        tax_rate: "0.0875",
        tax_mode: "RETAIL"
      }
    }
  };
  
  const fixture = fixtures[req.params.id];
  if (!fixture) {
    return res.status(404).json({ error: 'Fixture not found' });
  }
  
  res.json(fixture);
});

module.exports = router;