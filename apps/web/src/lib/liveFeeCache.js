function sameNullable(a, b) {
  return (a ?? null) === (b ?? null)
}

function sameNumber(a, b) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(Number(a) - Number(b)) < 0.000001
}

/**
 * Anexa ao listing apenas cache LIVE ainda vigente e marcado como exato.
 * Cache parcial fica disponível para auditoria, mas não substitui silenciosamente
 * uma regra estática no dashboard.
 */
export function attachExactLiveFees(listings, liveFees) {
  return listings.map((listing) => {
    const match = liveFees
      .filter((fee) => {
        if (!fee.is_exact) return false
        if (fee.platform_id !== listing.platform_id) return false
        if (!sameNullable(fee.category_id, listing.platform_category_id)) return false
        if (!sameNullable(fee.listing_type, listing.listing_type)) return false
        if (!sameNumber(fee.price, listing.sale_price)) return false
        if (!sameNullable(fee.logistic_type, listing.logistic_type)) return false
        if (!sameNullable(fee.shipping_mode, listing.shipping_mode)) return false
        if (!sameNumber(fee.billable_weight_kg, listing.billable_weight_kg)) return false
        return true
      })
      .sort((a, b) => String(b.fetched_at || '').localeCompare(String(a.fetched_at || '')))[0]

    if (!match) return listing

    return {
      ...listing,
      live_fee_override: {
        commission_pct: match.commission_pct,
        fixed_fee: match.fixed_fee,
        source: 'cache',
        fetched_at: match.fetched_at,
        exact: true,
        confidence: match.confidence_status || 'account_specific',
        warning: match.warning || null,
      },
    }
  })
}
