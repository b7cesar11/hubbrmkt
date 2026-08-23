import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { attachExactLiveFees } from '../lib/liveFeeCache'

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
