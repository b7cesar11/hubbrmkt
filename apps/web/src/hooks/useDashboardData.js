import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
 * Cache parcial continua disponível para auditoria, mas não substitui
 * silenciosamente a regra estática no dashboard.
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

/**
 * Hook que carrega e gerencia todos os dados do Supabase
 * necessários para o dashboard.
 */
export function useDashboardData(user) {
  const [products, setProducts] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [feeRules, setFeeRules] = useState([])
  const [listings, setListings] = useState([])
  const [costComponents, setCostComponents] = useState([])
  const [listingCostComponents, setListingCostComponents] = useState([])
  const [promotions, setPromotions] = useState([])
  const [companyUsers, setCompanyUsers] = useState([])
  const [coverageGaps, setCoverageGaps] = useState([])
  const [liveFeeCache, setLiveFeeCache] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('company_id, role')
        .eq('id', user.id)
        .single()

      if (userError) throw userError
      setCompanyId(userRow?.company_id || null)
      setUserRole(userRow?.role || null)

      if (userRow?.company_id) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email, role, company_id')
          .eq('company_id', userRow.company_id)
        if (!usersError) setCompanyUsers(usersData || [])
      }

      const [
        productsRes,
        platformsRes,
        rulesRes,
        listingsRes,
        costComponentsRes,
        listingCostComponentsRes,
        gapsRes,
        promotionsRes,
        liveFeesRes,
      ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('platforms').select('*'),
        supabase.from('platform_fee_rules').select('*'),
        supabase.from('product_listings').select('*'),
        supabase.from('cost_components').select('*'),
        supabase.from('listing_cost_components').select('*'),
        supabase.from('category_coverage_gaps').select('*').eq('status', 'pending_validation'),
        supabase.from('platform_promotions').select('*'),
        supabase
          .from('live_fee_cache')
          .select(
            'id, platform_id, category_id, listing_type, price, commission_pct, fixed_fee, fetched_at, expires_at, logistic_type, shipping_mode, billable_weight_kg, is_exact, confidence_status, warning'
          )
          .gt('expires_at', new Date().toISOString()),
      ])

      if (productsRes.error) throw productsRes.error
      if (platformsRes.error) throw platformsRes.error
      if (rulesRes.error) throw rulesRes.error
      if (listingsRes.error) throw listingsRes.error
      if (costComponentsRes.error) throw costComponentsRes.error
      if (listingCostComponentsRes.error) throw listingCostComponentsRes.error
      if (gapsRes.error) throw gapsRes.error
      if (promotionsRes.error) throw promotionsRes.error
      if (liveFeesRes.error) throw liveFeesRes.error

      const liveFees = liveFeesRes.data || []
      setProducts(productsRes.data || [])
      setPlatforms(platformsRes.data || [])
      setFeeRules(rulesRes.data || [])
      setListings(attachExactLiveFees(listingsRes.data || [], liveFees))
      setCoverageGaps(gapsRes.data || [])
      setCostComponents(costComponentsRes.data || [])
      setListingCostComponents(listingCostComponentsRes.data || [])
      setPromotions(promotionsRes.data || [])
      setLiveFeeCache(liveFees)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const reloadFromMutation = () => loadData()
    window.addEventListener('margemhub:data-changed', reloadFromMutation)
    return () => window.removeEventListener('margemhub:data-changed', reloadFromMutation)
  }, [loadData])

  return {
    products,
    setProducts,
    platforms,
    feeRules,
    setFeeRules,
    listings,
    setListings,
    costComponents,
    setCostComponents,
    listingCostComponents,
    setListingCostComponents,
    promotions,
    setPromotions,
    companyUsers,
    setCompanyUsers,
    coverageGaps,
    setCoverageGaps,
    liveFeeCache,
    companyId,
    userRole,
    loading,
    error,
    reload: loadData,
  }
}
