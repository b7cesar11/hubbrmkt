import { computeMargin, getListing, isOfficialFeeRule } from './margin'

function toCents(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.round(number * 100)
}

function fromCents(cents) {
  return cents / 100
}

function cloneDepsAtPrice(product, platformId, deps, cents) {
  const listing = getListing(
    product.id,
    platformId,
    deps.listings || [],
    deps.marketplaceAccountId || null,
  )
  if (!listing) return null

  const salePrice = fromCents(cents)
  const listings = (deps.listings || []).map((candidate) =>
    candidate.id === listing.id
      ? { ...candidate, sale_price: salePrice }
      : candidate
  )

  return { ...deps, listings }
}

export function computeMarginAtPrice(product, platformId, deps, price) {
  const cents = toCents(price)
  if (cents == null || cents < 1) {
    return { status: 'preco_invalido', reason: 'O preço precisa ser maior que zero.' }
  }

  const candidateDeps = cloneDepsAtPrice(product, platformId, deps, cents)
  if (!candidateDeps) return { status: 'sem_preco', reason: 'Não há anúncio para este contexto.' }
  return computeMargin(product, platformId, candidateDeps)
}

function addRuleChangePoints(points, rule, minCents, maxCents) {
  const values = [rule.price_min, rule.price_max]
  const config = rule.calculation_config || {}

  if (config.fixed_fee_override?.threshold != null) values.push(config.fixed_fee_override.threshold)
  if (config.unsupported_below_price?.threshold != null) values.push(config.unsupported_below_price.threshold)
  for (const value of config.unsupported_exact_prices || []) values.push(value)

  for (const value of values) {
    const cents = toCents(value)
    if (cents != null && cents >= minCents && cents <= maxCents) points.add(cents)
  }
}

function priceRanges(platformId, deps, minCents, maxCents) {
  const points = new Set([minCents, maxCents])
  for (const rule of (deps.feeRules || []).filter(
    (candidate) => candidate.platform_id === platformId && isOfficialFeeRule(candidate)
  )) {
    addRuleChangePoints(points, rule, minCents, maxCents)
  }

  const changes = [...points]
    .filter((value) => value >= minCents && value <= maxCents)
    .sort((a, b) => a - b)

  const ranges = []
  let cursor = minCents

  for (const point of changes) {
    if (point < cursor) continue
    if (point > cursor) ranges.push([cursor, point - 1])
    ranges.push([point, point])
    cursor = point + 1
  }
  if (cursor <= maxCents) ranges.push([cursor, maxCents])

  return ranges.filter(([start, end]) => start <= end)
}

function targetReached(result, targetMarginPct) {
  return result?.status === 'ok' && Number(result.marginPct) + 1e-9 >= targetMarginPct
}

function evaluate(product, platformId, deps, cents) {
  const candidateDeps = cloneDepsAtPrice(product, platformId, deps, cents)
  if (!candidateDeps) return { status: 'sem_preco', reason: 'Não há anúncio para este contexto.' }
  return computeMargin(product, platformId, candidateDeps)
}

/**
 * Retorna o MENOR preço, em centavos, que atinge a margem alvo.
 * A busca é segmentada nos pontos onde uma regra oficial pode mudar para evitar
 * pular oportunidades antes de saltos de taxa fixa/faixa de preço.
 */
export function findPriceForTargetMargin(
  product,
  platformId,
  deps,
  targetMarginPct,
  options = {},
) {
  const target = Number(targetMarginPct)
  if (!Number.isFinite(target) || target <= -100 || target >= 100) {
    return {
      status: 'meta_invalida',
      reason: 'A margem alvo precisa estar entre -100% e 100%.',
    }
  }

  const currentListing = getListing(
    product.id,
    platformId,
    deps.listings || [],
    deps.marketplaceAccountId || null,
  )
  if (!currentListing) return { status: 'sem_preco', reason: 'Não há anúncio para este contexto.' }

  const minCents = Math.max(1, toCents(options.minPrice ?? 0.01) || 1)
  const currentPrice = Number(currentListing.sale_price || 0)
  const cost = Number(product.cost_price || 0)
  const defaultMax = Math.max(100000, currentPrice * 20, cost * 50)
  const maxCents = Math.max(minCents, toCents(options.maxPrice ?? defaultMax) || minCents)

  let firstBlockingResult = null
  let sawValidCalculation = false
  let evaluations = 0

  for (const [start, end] of priceRanges(platformId, deps, minCents, maxCents)) {
    const startResult = evaluate(product, platformId, deps, start)
    evaluations += 1
    if (startResult.status === 'ok') sawValidCalculation = true
    else if (!firstBlockingResult) firstBlockingResult = startResult

    if (targetReached(startResult, target)) {
      return {
        status: 'ok',
        price: fromCents(start),
        targetMarginPct: target,
        margin: startResult,
        evaluations,
      }
    }

    if (start === end) continue

    const endResult = evaluate(product, platformId, deps, end)
    evaluations += 1
    if (endResult.status === 'ok') sawValidCalculation = true
    else if (!firstBlockingResult) firstBlockingResult = endResult

    if (!targetReached(endResult, target)) continue

    let low = start + 1
    let high = end
    let answer = end
    let answerResult = endResult

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const result = evaluate(product, platformId, deps, mid)
      evaluations += 1

      if (targetReached(result, target)) {
        answer = mid
        answerResult = result
        high = mid - 1
      } else {
        low = mid + 1
      }
    }

    return {
      status: 'ok',
      price: fromCents(answer),
      targetMarginPct: target,
      margin: answerResult,
      evaluations,
    }
  }

  if (!sawValidCalculation && firstBlockingResult) {
    return {
      ...firstBlockingResult,
      targetMarginPct: target,
      evaluations,
    }
  }

  return {
    status: 'meta_nao_atingida',
    reason: `A margem de ${target.toFixed(1)}% não foi atingida dentro do limite de preço analisado.`,
    targetMarginPct: target,
    maxPrice: fromCents(maxCents),
    evaluations,
  }
}

export function getPricingRecommendations(
  product,
  platformId,
  deps,
  targetMarginPct = 20,
  options = {},
) {
  const currentListing = getListing(
    product.id,
    platformId,
    deps.listings || [],
    deps.marketplaceAccountId || null,
  )
  if (!currentListing) return { status: 'sem_preco' }

  const current = computeMargin(product, platformId, deps)
  const breakEven = findPriceForTargetMargin(product, platformId, deps, 0, options)
  const target = findPriceForTargetMargin(product, platformId, deps, targetMarginPct, options)

  return {
    status: breakEven.status === 'ok' || target.status === 'ok' ? 'ok' : current.status,
    current,
    breakEven,
    target,
    targetMarginPct: Number(targetMarginPct),
    currentPrice: Number(currentListing.sale_price || 0),
  }
}
