/**
 * ErrorHandler - Error recovery for Pre-Processor
 * @version 1.0.0
 */

class ErrorHandler {
  async handleError(error, context) {
    console.error('PreProcessor Error:', error);
    console.error('Context:', context);
    
    // Categorize error
    const category = this.categorizeError(error);
    
    switch (category) {
      case 'CACHE_ERROR':
        return { retry: true, clearCache: true };
      case 'DATA_FETCH_ERROR':
        return { retry: true, backoff: true };
      case 'RULE_COMPILATION_ERROR':
        return { retry: false, skipRule: true };
      default:
        return { retry: false };
    }
  }
  
  categorizeError(error) {
    const message = error.message || '';
    
    if (message.includes('cache')) {
      return 'CACHE_ERROR';
    }
    if (message.includes('fetch') || message.includes('database')) {
      return 'DATA_FETCH_ERROR';
    }
    if (message.includes('rule') || message.includes('compile')) {
      return 'RULE_COMPILATION_ERROR';
    }
    
    return 'UNKNOWN';
  }
  
  async withRetry(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, i) * 1000)
        );
      }
    }
  }
}

module.exports = ErrorHandler;