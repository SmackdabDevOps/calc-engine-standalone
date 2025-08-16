// Maps raw engine results to API-facing response with audit and timings
function mapCalculationResponse(engineResult = {}) {
  const nowIso = new Date().toISOString();

  // Build comprehensive audit object
  const audit = engineResult.auditRecord ? {
    calc_id: engineResult.auditRecord.calc_id,
    phase_timings_ms: engineResult.auditRecord.phase_timings_ms || {},
    groups: engineResult.auditRecord.groups || [],
    createdAt: nowIso,
    engineVersion: engineResult.engineVersion || 'unknown',
    inputHash: engineResult.inputHash || null,
    proposalId: engineResult.proposalId || null
  } : {
    createdAt: nowIso,
    engineVersion: engineResult.engineVersion || 'unknown',
    inputHash: engineResult.inputHash || null,
    proposalId: engineResult.proposalId || null
  };

  const timings = {
    totalMs: engineResult.calculation_time_ms || null,
    phases: engineResult.phaseTimings || []
  };

  const modifierGroups = Array.isArray(engineResult.modifierGroups)
    ? engineResult.modifierGroups
    : [];

  // Build tax structure based on tax mode
  let retailTax = null;
  let useTax = null;

  if (engineResult.taxMode === 'RETAIL' || engineResult.taxMode === 'MIXED') {
    retailTax = {
      taxable_base_precise: engineResult.taxableBasePrecise || '0.0000000',
      total_tax_precise: engineResult.taxAmountPrecise || '0.0000000',
      sub_taxes: engineResult.retailTax?.sub_taxes || []
    };
  }

  if (engineResult.taxMode === 'USE_TAX' || engineResult.taxMode === 'MIXED') {
    useTax = {
      cost_base_precise: engineResult.useTaxBasePrecise || '0.0000000',
      total_tax_precise: engineResult.useTaxAmountPrecise || '0.0000000',
      items: engineResult.useTaxItems || []
    };
  }

  return {
    // Basic fields
    proposal_id: engineResult.proposalId,
    subtotal: engineResult.subtotal,
    subtotal_precise: engineResult.subtotalPrecise,
    
    // Tax structure
    tax_mode: engineResult.taxMode,
    retail_tax: retailTax,
    use_tax: useTax,
    
    // Legacy fields for backward compatibility
    tax_amount: engineResult.tax_amount,
    total_amount: engineResult.total_amount,
    
    // Precision fields
    customer_grand_total_precise: engineResult.grandTotalPrecise,
    grand_total: engineResult.grandTotal,
    
    // Metadata
    line_count: engineResult.line_count,
    cached: !!engineResult.cached,
    calculated_at: engineResult.calculated_at || nowIso,
    
    // Audit and debugging
    audit,
    timings,
    modifierGroups
  };
}

module.exports = { mapCalculationResponse };

