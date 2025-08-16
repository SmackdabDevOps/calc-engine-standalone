/**
 * Standalone Calculation Engine Server
 * 
 * Minimal Express server for calculation engine and test UIs
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const engineDirectRouter = require('./src/routes/engine-direct');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (test UIs)
app.use(express.static('public'));

// API routes
app.use('/api/engine', engineDirectRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root redirect to dashboard
app.get('/', (req, res) => {
  res.redirect('/calculation-test-dashboard.html');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Calculation Engine Test Server          ║
║   Running on http://localhost:${PORT}       ║
╠════════════════════════════════════════════╣
║   Dashboard:                               ║
║   http://localhost:${PORT}/calculation-test-dashboard.html
╠════════════════════════════════════════════╣
║   API Endpoints:                           ║
║   POST /api/engine/calculate              ║
║   GET  /api/engine/info                   ║
║   GET  /api/engine/fixtures               ║
║   GET  /api/health                        ║
╚════════════════════════════════════════════╝
  `);
});

module.exports = app;
