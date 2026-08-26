import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buildPeopleCostArtifacts } from '../lib/peopleCosts'

/**
 * Hook que carrega e gerencia os dados operacionais do dashboard.
 * As margens são calculadas com regras oficiais; integrações live não são
 * promovidas automaticamente para o cálculo.
 *
 * Pessoas da operação não são duplicadas em cost_components. Em cada carga,
 * elas são convertidas em componentes sintéticos somente em memória:
 * - custo fixo mensal rateado pelas unidades projetadas;
 * - comissão percentual por venda.
 * Assim qualquer tela que já usa computeMargin passa a considerar a equipe.
 */
export function useDashboardData(user) {
  const [products, setProducts] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [marketplaceAccounts, setMarketplaceAccounts] = useState([])
  const [feeRules, setFeeRules] = useState([])
  const [listings, setListings] = useState([])
  const [costComponents, setCostComponents] = useState([])
  const [listingCostComponents, setListingCostComponents] = useState([])
  const [operationPeople, setOperationPeople] = useState([])
  const [productPeople, setProductPeople] = useState([])
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
          .select('id, email, role, company_id, full_name')
          .eq('company_id', userRow.company_id)
        if (!usersError) setCompanyUsers(usersData || [])
      }

      const [
        productsRes,
        platformsRes,
        accountsRes,
        rulesRes,
        listingsRes,
        costComponentsRes,
        listingCostComponentsRes,
        peopleRes,
        productPeopleRes,
        gapsRes,
        promotionsRes,
      ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('platforms').select('*'),
        supabase.from('marketplace_accounts').select('*').order('created_at', { ascending: true }),
        supabase.from('platform_fee_rules').select('*'),
        supabase.from('product_listings').select('*'),
        supabase.from('cost_components').select('*'),
        supabase.from('listing_cost_components').select('*'),
        supabase.from('operation_people').select('*').order('name', { ascending: true }),
        supabase.from('product_people').select('*'),
        supabase.from('category_coverage_gaps').select('*').eq('status', 'pending_validation'),
        supabase.from('platform_promotions').select('*'),
      ])

      if (productsRes.error) throw productsRes.error
      if (platformsRes.error) throw platformsRes.error
      if (accountsRes.error) throw accountsRes.error
      if (rulesRes.error) throw rulesRes.error
      if (listingsRes.error) throw listingsRes.error
      if (costComponentsRes.error) throw costComponentsRes.error
      if (listingCostComponentsRes.error) throw listingCostComponentsRes.error
      if (peopleRes.error) throw peopleRes.error
      if (productPeopleRes.error) throw productPeopleRes.error
      if (gapsRes.error) throw gapsRes.error
      if (promotionsRes.error) throw promotionsRes.error

      const productRows = productsRes.data || []
      const accounts = accountsRes.data || []
      const accountById = new Map(accounts.map((account) => [account.id, account]))
      const enrichedListings = (listingsRes.data || []).map((listing) => ({
        ...listing,
        marketplace_account: accountById.get(listing.marketplace_account_id) || null,
      }))
      const peopleRows = peopleRes.data || []
      const productPeopleRows = productPeopleRes.data || []
      const manualCostComponents = costComponentsRes.data || []
      const manualListingCostComponents = listingCostComponentsRes.data || []
      const peopleArtifacts = buildPeopleCostArtifacts({
        people: peopleRows,
        productPeople: productPeopleRows,
        listings: enrichedListings,
        products: productRows,
      })

      setProducts(productRows)
      setPlatforms(platformsRes.data || [])
      setMarketplaceAccounts(accounts)
      setFeeRules(rulesRes.data || [])
      setListings(enrichedListings)
      setCoverageGaps(gapsRes.data || [])
      setOperationPeople(peopleRows)
      setProductPeople(productPeopleRows)
      setCostComponents([...manualCostComponents, ...peopleArtifacts.costComponents])
      setListingCostComponents([
        ...manualListingCostComponents,
        ...peopleArtifacts.listingCostComponents,
      ])
      setPromotions(promotionsRes.data || [])
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
    marketplaceAccounts,
    setMarketplaceAccounts,
    feeRules,
    setFeeRules,
    listings,
    setListings,
    costComponents,
    setCostComponents,
    listingCostComponents,
    setListingCostComponents,
    operationPeople,
    setOperationPeople,
    productPeople,
    setProductPeople,
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
