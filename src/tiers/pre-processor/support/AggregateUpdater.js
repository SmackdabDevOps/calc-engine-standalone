/**
 * AggregateUpdater - Updates aggregates for line items
 * @version 1.0.0
 */

class AggregateUpdater {
  update(lineItems) {
    let subtotal = 0;
    let totalQuantity = 0;
    
    for (const item of lineItems) {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      subtotal += price * quantity;
      totalQuantity += quantity;
    }
    
    return {
      subtotal,
      itemCount: lineItems.length,
      totalQuantity
    };
  }
}

module.exports = AggregateUpdater;