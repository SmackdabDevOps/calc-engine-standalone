/**
 * PreProcessorState - State management for Pre-Processor
 * @version 1.0.0
 */

class PreProcessorState {
  constructor() {
    this.cache = new Map();
    this.compiledRules = new Map();
    this.activeRequests = new Map();
  }
  
  trackRequest(id, state) {
    this.activeRequests.set(id, {
      state,
      timestamp: Date.now(),
      transitions: []
    });
  }
  
  updateRequestState(id, newState) {
    const request = this.activeRequests.get(id);
    if (request) {
      request.transitions.push({
        from: request.state,
        to: newState,
        timestamp: Date.now()
      });
      request.state = newState;
    }
  }
  
  completeRequest(id) {
    this.activeRequests.delete(id);
  }
  
  getActiveRequests() {
    return Array.from(this.activeRequests.entries());
  }
}

module.exports = PreProcessorState;