import { computeMargin } from './margin'
import { getPricingRecommendations } from './pricing'

/**
 * Compara todas as operações reais de um SKU. A unidade de comparação é o
 * product_listing (conta + marketplace), nunca apenas o marketplace.
 */
export function compareProductAccounts(
  product,
  platforms,
  deps,
  targetMarginPct = 20,
) {
  if (!product?.id) return { rows: [], best: null, secondBest: null }

  const platformById = new Map((platforms || []).map((platform) => [platform.id, platform]))
  const rows = (deps.listings || [])
    .filter((listing) => listing.product_id === product.id && listing.active !== false)
    .map((listing) => {
      const account = listing.marketplace_account || null
      const rowDeps = {
        ...deps,
        marketplaceAccountId: listing.marketplace_account_id || null,
      }
      const margin = computeMargin(product, listing.platform_id, rowDeps)
      const pricing =
        margin.status === 'ok'
          ? getPricingRecommendations(
              product,
              listing.platform_id,
              rowDeps,
              targetMarginPct,
            )
          : null

      return {
        listing,
        platform: platformById.get(listing.platform_id) || null,
        account,
        margin,
        pricing,
        status: margin.status,
        currentPrice: Number(listing.sale_price || 0),
        grossRevenue:
          margin.status === 'ok'
            ? Number(margin.grossRevenue || margin.salePrice || 0)
            : Number(listing.sale_price || 0) + Number(listing.shipping_revenue || 0),
        marginPct: margin.status === 'ok' ? Number(margin.marginPct) : null,
        netMargin: margin.status === 'ok' ? Number(margin.netMargin) : null,
        targetPrice: pricing?.target?.status === 'ok' ? Number(pricing.target.price) : null,
        breakEvenPrice: pricing?.breakEven?.status === 'ok' ? Number(pricing.breakEven.price) : null,
      }
    })
    .sort((a, b) => {
      const aOk = a.status === 'ok'
      const bOk = b.status === 'ok'
      if (aOk !== bOk) return aOk ? -1 : 1
      if (!aOk) {
        return String(a.platform?.name || '').localeCompare(String(b.platform?.name || ''), 'pt-BR')
      }
      if (b.marginPct !== a.marginPct) return b.marginPct - a.marginPct
      return b.netMargin - a.netMargin
    })

  const valid = rows.filter((row) => row.status === 'ok')
  const best = valid[0] || null
  const secondBest = valid[1] || null

  return {
    rows: rows.map((row, index) => ({
      ...row,
      rank: row.status === 'ok' ? valid.indexOf(row) + 1 : null,
      marginGapToBestPct:
        best && row.status === 'ok' ? Number(best.marginPct - row.marginPct) : null,
      profitGapToBest:
        best && row.status === 'ok' ? Number(best.netMargin - row.netMargin) : null,
      priceAdjustmentToTarget:
        row.targetPrice != null ? Number(row.targetPrice - row.currentPrice) : null,
      originalOrder: index,
    })),
    best,
    secondBest,
    targetMarginPct: Number(targetMarginPct),
  }
}
