/**
 * StaticEvaluator - Evaluates static predicates
 * @version 1.0.0
 */

class StaticEvaluator {
  evaluate(predicate) {
    if (!predicate || predicate.type !== 'comparison') {
      return false;
    }
    
    const { left, operator, right } = predicate;
    
    switch (operator) {
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '==': return left == right;
      case '===': return left === right;
      case '!=': return left != right;
      case '!==': return left !== right;
      default: return false;
    }
  }
}

module.exports = StaticEvaluator;