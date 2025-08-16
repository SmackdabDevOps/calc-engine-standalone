/**
 * ArraySorter - Deterministic array sorting
 * @version 1.0.0
 */

class ArraySorter {
  sort(arr, field) {
    return [...arr].sort((a, b) => {
      const valA = a[field];
      const valB = b[field];
      
      if (valA < valB) return -1;
      if (valA > valB) return 1;
      
      // Fallback to id for determinism
      return (a.id || '').localeCompare(b.id || '');
    });
  }
}

module.exports = ArraySorter;