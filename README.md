# Calculation Engine Standalone

A standalone version of the calculation engine with test UIs.

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open browser to:
# http://localhost:3000/calculation-test-dashboard.html
```

## Deployment to Render

1. Push this folder to a GitHub repository
2. Connect to Render.com
3. Create a new Web Service
4. Deploy!

## Available Test UIs

- **Dashboard**: Main hub for all test tools
- **Ultimate Tester**: Comprehensive testing interface
- **Visualizations**: Multiple chart types
- **Conflict Analyzer**: Dependency and conflict detection
- **Flow Diagram**: Visual calculation flow
- **Waterfall Chart**: Cascading calculation breakdown

## API Endpoints

- `POST /api/engine/calculate` - Run a calculation
- `GET /api/engine/info` - Get engine information
- `GET /api/engine/fixtures` - Get test fixtures
- `GET /api/health` - Health check
