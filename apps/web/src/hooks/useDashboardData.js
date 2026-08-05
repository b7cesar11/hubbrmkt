import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook que carrega e gerencia todos os dados do Supabase
 * necessários para o dashboard.
 *
 * @param {object} user - Usuário autenticado do Supabase
 * @returns {object} dados + loading + erro + função reload
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
  const [companyId, setCompanyId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      // Busca o company_id real do usuário logado — sem isso, o cadastro de
      // produto é bloqueado pela política de RLS (que exige company_id correto).
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
      ] = await Promise.all([
        supabase.from('products').select('*'), // busca todos — filtro de status é feito na tela, não na query
        supabase.from('platforms').select('*'),
        supabase.from('platform_fee_rules').select('*'),
        supabase.from('product_listings').select('*'),
        supabase.from('cost_components').select('*'),
        supabase.from('listing_cost_components').select('*'),
        supabase.from('category_coverage_gaps').select('*').eq('status', 'pending_validation'),
        supabase.from('platform_promotions').select('*'),
      ])

      if (productsRes.error) throw productsRes.error
      if (platformsRes.error) throw platformsRes.error
      if (rulesRes.error) throw rulesRes.error
      if (listingsRes.error) throw listingsRes.error
      if (costComponentsRes.error) throw costComponentsRes.error
      if (listingCostComponentsRes.error) throw listingCostComponentsRes.error
      if (gapsRes.error) throw gapsRes.error
      if (promotionsRes.error) throw promotionsRes.error

      setProducts(productsRes.data || [])
      setPlatforms(platformsRes.data || [])
      setFeeRules(rulesRes.data || [])
      setListings(listingsRes.data || [])
      setCoverageGaps(gapsRes.data || [])
      setCostComponents(costComponentsRes.data || [])
      setListingCostComponents(listingCostComponentsRes.data || [])
      setPromotions(promotionsRes.data || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
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
    companyId,
    userRole,
    loading,
    error,
    reload: loadData,
  }
}
