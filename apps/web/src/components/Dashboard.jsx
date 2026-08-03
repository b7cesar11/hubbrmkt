import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Pencil, Package, TrendingUp, AlertCircle } from 'lucide-react'
import PromotionsView from './PromotionsView'

export default function Dashboard({ user, onLogout }) {
  const [products, setProducts] = useState([])
  const [platforms, setPlatforms] = useState([])
  const [feeRules, setFeeRules] = useState([])
  const [listings, setListings] = useState([]) // product_listings reais
  const [costComponents, setCostComponents] = useState([])
  const [listingCostComponents, setListingCostComponents] = useState([])
  const [promotions, setPromotions] = useState([])
  const [coverageGaps, setCoverageGaps] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null) // null = modo criação
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [showGaps, setShowGaps] = useState(false)
  const [activeTab, setActiveTab] = useState('produtos') // produtos | regras
  // Form de nova regra de taxa (do zero, ou resolvendo uma lacuna)
  const [showNewRuleForm, setShowNewRuleForm] = useState(false)
  const [resolvingGapId, setResolvingGapId] = useState(null)
  const [newRule, setNewRule] = useState({
    platform_id: '',
    category: '',
    listing_type: '',
    price_min: '0',
    price_max: '',
    commission_pct: '',
    fixed_fee: '0',
    source_url: '',
  })
  // Filtros da listagem
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active') // active | inactive | all
  // Form de edição de taxa (só super_admin) — { [ruleId]: { commission_pct, fixed_fee, source_url } }
  const [editRuleForm, setEditRuleForm] = useState({})
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    category: '',
    cost_price: '',
    weight_kg: '',
  })
  // Seção B: presença por plataforma no cadastro — { [platform_id]: { enabled: bool, sale_price: string } }
  const [newListings, setNewListings] = useState({})

  // Accordion de detalhe do produto
  const [expandedProductId, setExpandedProductId] = useState(null)
  // Form de "adicionar custo existente a este listing" — { [listingId]: { componentId, override } }
  const [addCostForm, setAddCostForm] = useState({})
  // Form de "criar novo tipo de custo" — { [listingId]: { show, name, category, calc_type, default_value } }
  const [newComponentForm, setNewComponentForm] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
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

      const [productsRes, platformsRes, rulesRes, listingsRes, costComponentsRes, listingCostComponentsRes, gapsRes, promotionsRes] = await Promise.all([
        supabase.from('products').select('*'), // busca todos — filtro de status é feito na tela, não na query
        supabase.from('platforms').select('*'),
        supabase.from('platform_fee_rules').select('*'),
        supabase.from('product_listings').select('*'),
        supabase.from('cost_components').select('*').eq('active', true),
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
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateRule(oldRule) {
    const form = editRuleForm[oldRule.id]
    if (!form) return
    if (!form.source_url) {
      alert('Informe a fonte (link oficial ou nota "ESTIMATIVA - motivo") antes de salvar.')
      return
    }

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    // 1. Fecha a vigência da regra atual (nunca sobrescreve)
    const { error: closeError } = await supabase
      .from('platform_fee_rules')
      .update({ valid_to: yesterday })
      .eq('id', oldRule.id)

    if (closeError) {
      alert('Erro ao encerrar vigência da regra antiga: ' + closeError.message)
      return
    }

    // 2. Cria a nova regra a partir de hoje
    const { data: newRuleData, error: insertError } = await supabase
      .from('platform_fee_rules')
      .insert([
        {
          platform_id: oldRule.platform_id,
          category: oldRule.category,
          listing_type: oldRule.listing_type,
          reputation_level: oldRule.reputation_level,
          price_min: oldRule.price_min,
          price_max: oldRule.price_max,
          commission_pct: parseFloat(form.commission_pct),
          fixed_fee: parseFloat(form.fixed_fee),
          valid_from: today,
          source_url: form.source_url,
        },
      ])
      .select()

    if (insertError) {
      alert('Erro ao criar nova versão da regra: ' + insertError.message)
      return
    }

    // Atualiza o estado local: fecha a antiga, adiciona a nova
    setFeeRules((prev) => [
      ...prev.map((r) => (r.id === oldRule.id ? { ...r, valid_to: yesterday } : r)),
      ...(newRuleData || []),
    ])
    setEditRuleForm((prev) => ({ ...prev, [oldRule.id]: null }))
  }

  async function handleMarkRuleConfirmed(rule, sourceUrl) {
    if (!sourceUrl) {
      alert('Informe o link da fonte oficial.')
      return
    }
    const { error } = await supabase
      .from('platform_fee_rules')
      .update({ source_url: sourceUrl })
      .eq('id', rule.id)

    if (error) {
      alert('Erro ao confirmar regra: ' + error.message)
      return
    }
    setFeeRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, source_url: sourceUrl } : r))
    )
  }

  function toggleListingPlatform(platformId) {
    setNewListings((prev) => ({
      ...prev,
      [platformId]: {
        enabled: !prev[platformId]?.enabled,
        sale_price: prev[platformId]?.sale_price || '',
      },
    }))
  }

  function setListingPrice(platformId, value) {
    setNewListings((prev) => ({
      ...prev,
      [platformId]: { ...prev[platformId], sale_price: value },
    }))
  }

  function toggleListingCost(platformId, costComponentId) {
    setNewListings((prev) => {
      const current = prev[platformId]?.selectedCosts || []
      const exists = current.includes(costComponentId)
      return {
        ...prev,
        [platformId]: {
          ...prev[platformId],
          selectedCosts: exists
            ? current.filter((id) => id !== costComponentId)
            : [...current, costComponentId],
        },
      }
    })
  }

  function openEditProduct(product) {
    setEditingProductId(product.id)
    setNewProduct({
      sku: product.sku,
      name: product.name,
      category: product.category,
      cost_price: String(product.cost_price),
      weight_kg: product.weight_kg ? String(product.weight_kg) : '',
    })

    const prefilledListings = {}
    platforms.forEach((p) => {
      const listing = listings.find(
        (l) => l.product_id === product.id && l.platform_id === p.id
      )
      if (listing) {
        const selectedCosts = listingCostComponents
          .filter((lcc) => lcc.product_listing_id === listing.id)
          .map((lcc) => lcc.cost_component_id)
        prefilledListings[p.id] = {
          enabled: true,
          sale_price: String(listing.sale_price),
          selectedCosts,
          _listingId: listing.id, // guarda o id real pra saber se é update ou insert
        }
      }
    })
    setNewListings(prefilledListings)
    setShowNewProduct(true)
  }

  function closeProductForm() {
    setShowNewProduct(false)
    setEditingProductId(null)
    setNewProduct({ sku: '', name: '', category: '', cost_price: '', weight_kg: '' })
    setNewListings({})
  }

  async function handleSubmitProduct(e) {
    e.preventDefault()

    if (!companyId) {
      alert(
        'Não foi possível identificar a empresa do usuário logado. Recarregue a página e tente de novo.'
      )
      return
    }

    if (editingProductId) {
      await handleUpdateProduct()
    } else {
      await handleCreateProduct()
    }
  }

  async function handleUpdateProduct() {
    const updateData = {
      sku: newProduct.sku,
      name: newProduct.name,
      category: newProduct.category,
      cost_price: parseFloat(newProduct.cost_price),
      weight_kg: newProduct.weight_kg ? parseFloat(newProduct.weight_kg) : null,
    }

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', editingProductId)
      .select()

    if (error) {
      alert('Erro ao atualizar produto: ' + error.message)
      return
    }

    const updatedProduct = data[0]
    let updatedListings = [...listings]
    let updatedLcc = [...listingCostComponents]

    for (const platform of platforms) {
      const formEntry = newListings[platform.id]
      const existingListing = listings.find(
        (l) => l.product_id === editingProductId && l.platform_id === platform.id
      )

      if (formEntry?.enabled && formEntry.sale_price) {
        if (existingListing) {
          // Atualiza preço se mudou
          const newPrice = parseFloat(formEntry.sale_price)
          if (newPrice !== existingListing.sale_price) {
            const { error: updErr } = await supabase
              .from('product_listings')
              .update({ sale_price: newPrice })
              .eq('id', existingListing.id)
            if (updErr) {
              alert(`Erro ao atualizar preço em ${platform.name}: ` + updErr.message)
              continue
            }
            updatedListings = updatedListings.map((l) =>
              l.id === existingListing.id ? { ...l, sale_price: newPrice } : l
            )
          }
        } else {
          // Nova plataforma marcada agora — cria listing
          const { data: newListingData, error: insErr } = await supabase
            .from('product_listings')
            .insert([
              {
                product_id: editingProductId,
                platform_id: platform.id,
                sale_price: parseFloat(formEntry.sale_price),
              },
            ])
            .select()
          if (insErr) {
            alert(`Erro ao adicionar ${platform.name}: ` + insErr.message)
            continue
          }
          updatedListings = [...updatedListings, ...(newListingData || [])]
        }
      } else if (existingListing) {
        // Plataforma foi desmarcada — remove o listing (e seus custos, em cascata)
        const { error: delErr } = await supabase
          .from('product_listings')
          .delete()
          .eq('id', existingListing.id)
        if (delErr) {
          alert(`Erro ao remover ${platform.name}: ` + delErr.message)
          continue
        }
        updatedListings = updatedListings.filter((l) => l.id !== existingListing.id)
        updatedLcc = updatedLcc.filter((lcc) => lcc.product_listing_id !== existingListing.id)
      }
    }

    setProducts(products.map((p) => (p.id === editingProductId ? updatedProduct : p)))
    setListings(updatedListings)
    setListingCostComponents(updatedLcc)
    closeProductForm()
  }

  async function handleCreateRule(e) {
    e.preventDefault()
    if (!newRule.platform_id || !newRule.commission_pct || !newRule.source_url) {
      alert('Preencha plataforma, comissão e fonte antes de salvar.')
      return
    }

    const { data, error } = await supabase
      .from('platform_fee_rules')
      .insert([
        {
          platform_id: newRule.platform_id,
          category: newRule.category || null,
          listing_type: newRule.listing_type || null,
          price_min: parseFloat(newRule.price_min) || 0,
          price_max: newRule.price_max ? parseFloat(newRule.price_max) : null,
          commission_pct: parseFloat(newRule.commission_pct),
          fixed_fee: parseFloat(newRule.fixed_fee) || 0,
          valid_from: new Date().toISOString().slice(0, 10),
          source_url: newRule.source_url,
        },
      ])
      .select()

    if (error) {
      alert('Erro ao criar regra: ' + error.message)
      return
    }

    const createdRule = data[0]
    setFeeRules([...feeRules, createdRule])

    // Se essa regra estava resolvendo uma lacuna, marca como resolvida
    if (resolvingGapId) {
      const { error: gapError } = await supabase
        .from('category_coverage_gaps')
        .update({ status: 'resolved', resolved_rule_id: createdRule.id })
        .eq('id', resolvingGapId)

      if (!gapError) {
        setCoverageGaps(coverageGaps.filter((g) => g.id !== resolvingGapId))
      }
    }

    setNewRule({
      platform_id: '',
      category: '',
      listing_type: '',
      price_min: '0',
      price_max: '',
      commission_pct: '',
      fixed_fee: '0',
      source_url: '',
    })
    setResolvingGapId(null)
    setShowNewRuleForm(false)
  }

  function openResolveGap(gap) {
    setNewRule({
      platform_id: gap.platform_id,
      category: gap.category === '(sem categoria definida)' ? '' : gap.category,
      listing_type: '',
      price_min: '0',
      price_max: '',
      commission_pct: '',
      fixed_fee: '0',
      source_url: '',
    })
    setResolvingGapId(gap.id)
    setShowNewRuleForm(true)
    setActiveTab('regras')
  }

  async function handleCreateProduct() {
    const productData = {
      ...newProduct,
      company_id: companyId,
      cost_price: parseFloat(newProduct.cost_price),
      weight_kg: newProduct.weight_kg ? parseFloat(newProduct.weight_kg) : null,
      active: true,
    }

    const { data, error } = await supabase
      .from('products')
      .insert([productData])
      .select()

    if (error) {
      alert('Erro ao criar produto: ' + error.message)
      return
    }

    const createdProduct = data[0]

    // Seção B: cria um product_listing real para cada plataforma marcada com preço
    const listingsToInsert = Object.entries(newListings)
      .filter(([, v]) => v.enabled && v.sale_price)
      .map(([platformId, v]) => ({
        product_id: createdProduct.id,
        platform_id: platformId,
        sale_price: parseFloat(v.sale_price),
      }))

    let insertedListings = []
    if (listingsToInsert.length > 0) {
      const { data: listingsData, error: listingsError } = await supabase
        .from('product_listings')
        .insert(listingsToInsert)
        .select()

      if (listingsError) {
        alert(
          'Produto criado, mas houve erro ao salvar preços por plataforma: ' +
            listingsError.message
        )
      } else {
        insertedListings = listingsData || []

        // Vincula os custos adicionais marcados no cadastro a cada listing recém-criado
        const costLinksToInsert = []
        insertedListings.forEach((listing) => {
          const selectedCosts = newListings[listing.platform_id]?.selectedCosts || []
          selectedCosts.forEach((costComponentId) => {
            costLinksToInsert.push({
              product_listing_id: listing.id,
              cost_component_id: costComponentId,
            })
          })
        })

        if (costLinksToInsert.length > 0) {
          const { data: costLinksData, error: costLinksError } = await supabase
            .from('listing_cost_components')
            .insert(costLinksToInsert)
            .select()

          if (costLinksError) {
            alert(
              'Produto e preços salvos, mas houve erro ao vincular custos adicionais: ' +
                costLinksError.message
            )
          } else {
            setListingCostComponents((prev) => [...prev, ...(costLinksData || [])])
          }
        }
      }
    }

    setProducts([...products, createdProduct])
    setListings([...listings, ...insertedListings])
    closeProductForm()
  }

  // Nunca exclui de verdade — desativa, preservando histórico de custo e auditoria.
  async function handleDeactivateProduct(id, name) {
    const confirmed = window.confirm(
      `Desativar "${name}"? Isso não apaga o histórico do produto, só remove ele das listagens ativas. Pode ser reativado depois.`
    )
    if (!confirmed) return

    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', id)

    if (error) {
      alert('Erro ao desativar: ' + error.message)
      return
    }
    setProducts(products.filter((p) => p.id !== id))
  }

  // Espelha a lógica real do banco (fn_check_fee_coverage): plataforma + categoria
  // (ou categoria nula como fallback) + faixa de preço + vigência.
  function findApplicableRule(platformId, category, price) {
    const today = new Date()
    return feeRules.find((rule) => {
      if (rule.platform_id !== platformId) return false
      if (rule.category !== null && rule.category !== category) return false

      const validFrom = new Date(rule.valid_from)
      const validTo = rule.valid_to ? new Date(rule.valid_to) : null
      if (today < validFrom) return false
      if (validTo && today > validTo) return false

      if (rule.price_min !== null && price < rule.price_min) return false
      if (rule.price_max !== null && price >= rule.price_max) return false

      return true
    })
  }

  function getApplicablePromotions(platformId, category) {
    const today = new Date().toISOString().slice(0, 10)
    return promotions.filter((promo) => {
      if (promo.platform_id !== platformId) return false
      if (promo.category !== null && promo.category !== category) return false
      return today >= promo.starts_at && today <= promo.ends_at
    })
  }

  function getListing(productId, platformId) {
    return listings.find((l) => l.product_id === productId && l.platform_id === platformId)
  }

  async function handleAddCostToListing(listingId) {
    const form = addCostForm[listingId]
    if (!form?.componentId) return

    const { data, error } = await supabase
      .from('listing_cost_components')
      .insert([
        {
          product_listing_id: listingId,
          cost_component_id: form.componentId,
          value_override: form.override ? parseFloat(form.override) : null,
        },
      ])
      .select()

    if (error) {
      alert('Erro ao adicionar custo: ' + error.message)
      return
    }

    setListingCostComponents([...listingCostComponents, ...(data || [])])
    setAddCostForm((prev) => ({ ...prev, [listingId]: { componentId: '', override: '' } }))
  }

  async function handleRemoveCostFromListing(id) {
    const { error } = await supabase.from('listing_cost_components').delete().eq('id', id)
    if (error) {
      alert('Erro ao remover custo: ' + error.message)
      return
    }
    setListingCostComponents(listingCostComponents.filter((lcc) => lcc.id !== id))
  }

  async function handleCreateCostComponent(listingId) {
    const form = newComponentForm[listingId]
    if (!form?.name || !form?.default_value) {
      alert('Preencha nome e valor padrão do novo custo.')
      return
    }
    if (!companyId) return

    const { data, error } = await supabase
      .from('cost_components')
      .insert([
        {
          company_id: companyId,
          name: form.name,
          category: form.category || 'other',
          calc_type: form.calc_type || 'percentage',
          default_value: parseFloat(form.default_value),
        },
      ])
      .select()

    if (error) {
      alert('Erro ao criar tipo de custo: ' + error.message)
      return
    }

    const created = data[0]
    setCostComponents([...costComponents, created])
    setNewComponentForm((prev) => ({ ...prev, [listingId]: { show: false } }))
    // já pré-seleciona esse custo recém-criado no form de adicionar
    setAddCostForm((prev) => ({
      ...prev,
      [listingId]: { componentId: created.id, override: '' },
    }))
  }

  // Retorna null quando falta preço de venda OU regra de taxa — nunca inventa valor.
  function computeMargin(product, platformId) {
    const listing = getListing(product.id, platformId)
    if (!listing) return { status: 'sem_preco' }

    const rule = findApplicableRule(platformId, product.category, listing.sale_price)
    if (!rule) return { status: 'sem_regra' }

    let commission = (listing.sale_price * rule.commission_pct) / 100
    const fixedFee = rule.fixed_fee || 0

    // Promoções ativas da plataforma/categoria — conecta automaticamente com
    // qualquer produto que bater, existente ou futuro, igual às regras de taxa.
    const applicablePromotions = getApplicablePromotions(platformId, product.category)
    const promoBenefits = []
    applicablePromotions.forEach((promo) => {
      if (promo.benefit_type === 'commission_exemption') {
        const reduction = promo.value_pct ? commission * (promo.value_pct / 100) : commission
        commission -= reduction
        promoBenefits.push({ name: 'Isenção de comissão (promoção)', amount: reduction })
      } else if (promo.benefit_type === 'shipping_subsidy') {
        const amount =
          promo.value_fixed || (promo.value_pct ? (listing.sale_price * promo.value_pct) / 100 : 0)
        if (amount > 0) promoBenefits.push({ name: 'Subsídio de frete (promoção)', amount })
      } else if (promo.benefit_type === 'cashback') {
        const amount =
          promo.value_fixed || (promo.value_pct ? (listing.sale_price * promo.value_pct) / 100 : 0)
        if (amount > 0) promoBenefits.push({ name: 'Cashback (promoção)', amount })
      }
      // 'other' fica só informativo — não entra em cálculo automático, valor não é padronizado
    })
    const promoBenefitsTotal = promoBenefits.reduce((sum, b) => sum + b.amount, 0)

    // Custos adicionais vinculados a este listing específico (afiliado, marketing, ads...)
    const appliedCosts = listingCostComponents
      .filter((lcc) => lcc.product_listing_id === listing.id)
      .map((lcc) => {
        const component = costComponents.find((c) => c.id === lcc.cost_component_id)
        if (!component) return null
        const value = lcc.value_override ?? component.default_value
        const amount =
          component.calc_type === 'percentage' ? (listing.sale_price * value) / 100 : value
        return { name: component.name, amount, calcType: component.calc_type, value }
      })
      .filter(Boolean)

    const additionalCostsTotal = appliedCosts.reduce((sum, c) => sum + c.amount, 0)

    const netMargin =
      listing.sale_price -
      product.cost_price -
      commission -
      fixedFee -
      additionalCostsTotal +
      promoBenefitsTotal
    const marginPct = (netMargin / listing.sale_price) * 100

    return {
      status: 'ok',
      salePrice: listing.sale_price,
      commission,
      fixedFee,
      appliedCosts,
      additionalCostsTotal,
      promoBenefits,
      promoBenefitsTotal,
      netMargin,
      marginPct,
      rule,
    }
  }

  const availableCategories = [...new Set(products.map((p) => p.category).filter(Boolean))]

  const displayedProducts = products
    .filter((p) => (selectedPlatform === 'all' ? true : getListing(p.id, selectedPlatform)))
    .filter((p) => {
      if (statusFilter === 'active') return p.active
      if (statusFilter === 'inactive') return !p.active
      return true // 'all'
    })
    .filter((p) => (categoryFilter === 'all' ? true : p.category === categoryFilter))
    .filter((p) => {
      if (!searchText) return true
      const q = searchText.toLowerCase()
      return p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">MargemHub</h1>
              <p className="text-sm text-gray-500">Dashboard de Margens</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={onLogout}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {userRole === 'super_admin' && coverageGaps.length > 0 && (
          <button
            onClick={() => setShowGaps(!showGaps)}
            className="mb-4 inline-flex items-center gap-2 bg-orange-100 text-orange-800 text-sm px-4 py-2 rounded-lg hover:bg-orange-200 transition-colors"
          >
            <AlertCircle className="w-4 h-4" />
            {coverageGaps.length} categoria(s) sem regra de taxa cadastrada — clique para ver
          </button>
        )}

        {showGaps && (
          <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Lacunas de Cobertura</h3>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pb-2">Plataforma</th>
                  <th className="pb-2">Categoria</th>
                  <th className="pb-2">Detectado em</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coverageGaps.map((gap) => {
                  const platform = platforms.find((p) => p.id === gap.platform_id)
                  return (
                    <tr key={gap.id}>
                      <td className="py-2">{platform?.name || '—'}</td>
                      <td className="py-2">{gap.category}</td>
                      <td className="py-2 text-gray-500">
                        {new Date(gap.detected_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2 text-right space-x-3">
                        <button
                          onClick={() => openResolveGap(gap)}
                          className="text-xs text-blue-600 hover:underline font-medium"
                        >
                          resolver
                        </button>
                        <button
                          onClick={async () => {
                            const { error } = await supabase
                              .from('category_coverage_gaps')
                              .update({ status: 'ignored' })
                              .eq('id', gap.id)
                            if (!error) {
                              setCoverageGaps(coverageGaps.filter((g) => g.id !== gap.id))
                            }
                          }}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          ignorar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {userRole === 'super_admin' && (
          <div className="mb-6 flex gap-1 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('produtos')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'produtos'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Produtos
            </button>
            <button
              onClick={() => setActiveTab('regras')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'regras'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Regras de Taxa
            </button>
            <button
              onClick={() => setActiveTab('promocoes')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'promocoes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Promoções
            </button>
          </div>
        )}

        {activeTab === 'produtos' && (
        <>
        <div className="mb-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Produtos</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {displayedProducts.length}
            </span>
          </div>

          <div className="flex gap-3">
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="all">Todas as plataformas</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setEditingProductId(null)
                setShowNewProduct(true)
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Produto
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Buscar por SKU ou nome..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm flex-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">Todas as categorias</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {showNewProduct && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {editingProductId ? 'Editar produto' : 'Novo produto'}
            </h3>
            <form onSubmit={handleSubmitProduct} className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados do produto</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="SKU"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Nome"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Categoria"
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    required
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    placeholder="Custo (R$)"
                    value={newProduct.cost_price}
                    onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })}
                    required
                    step="0.01"
                    min="0"
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    placeholder="Peso (kg)"
                    value={newProduct.weight_kg}
                    onChange={(e) => setNewProduct({ ...newProduct, weight_kg: e.target.value })}
                    step="0.01"
                    min="0"
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                  Presença por plataforma
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Marque as plataformas onde esse produto será vendido e informe o preço de
                  venda real — sem preço, a margem não pode ser calculada.
                </p>
                <div className="space-y-2">
                  {platforms.map((p) => (
                    <div key={p.id} className="border border-gray-100 rounded-lg p-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!newListings[p.id]?.enabled}
                          onChange={() => toggleListingPlatform(p.id)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="w-36 text-sm text-gray-700">{p.name}</span>
                        <input
                          type="number"
                          placeholder="Preço de venda (R$)"
                          disabled={!newListings[p.id]?.enabled}
                          value={newListings[p.id]?.sale_price || ''}
                          onChange={(e) => setListingPrice(p.id, e.target.value)}
                          step="0.01"
                          min="0"
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      {newListings[p.id]?.enabled && costComponents.length > 0 && (
                        <div className="ml-7 mt-2 flex flex-wrap gap-2">
                          {costComponents.map((c) => (
                            <label
                              key={c.id}
                              className="flex items-center gap-1 text-xs bg-gray-50 rounded px-2 py-1 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  !!newListings[p.id]?.selectedCosts?.includes(c.id)
                                }
                                onChange={() => toggleListingCost(p.id, c.id)}
                                className="w-3 h-3"
                              />
                              {c.name} (
                              {c.calc_type === 'percentage'
                                ? `${c.default_value}%`
                                : `R$${c.default_value}`}
                              )
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Precisa de um tipo de custo que ainda não existe (comissão de afiliado, ads,
                etc.)? Cadastre o produto primeiro e adicione o custo direto no detalhe dele
                (clique na linha do produto na tabela).
              </p>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {editingProductId ? 'Salvar alterações' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={closeProductForm}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {displayedProducts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum produto cadastrado</h3>
            <p className="text-gray-500 mb-4">Comece cadastrando seu primeiro produto</p>
            <button
              onClick={() => setShowNewProduct(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Cadastrar Produto
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Custo</th>
                    {selectedPlatform !== 'all' && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preço venda</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Margem Líq.</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% Margem</th>
                      </>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedProducts.map((product) => {
                    const margin =
                      selectedPlatform !== 'all' ? computeMargin(product, selectedPlatform) : null

                    return (
                      <React.Fragment key={product.id}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            setExpandedProductId(
                              expandedProductId === product.id ? null : product.id
                            )
                          }
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.sku}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            R$ {product.cost_price?.toFixed(2)}
                          </td>
                          {selectedPlatform !== 'all' && (
                            <>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {margin?.status === 'ok' ? `R$ ${margin.salePrice.toFixed(2)}` : '—'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {margin?.status === 'ok' ? (
                                  <div className="flex flex-col">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium w-fit ${
                                        margin.netMargin > 0
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                      }`}
                                    >
                                      R$ {margin.netMargin.toFixed(2)}
                                    </span>
                                    {margin.appliedCosts.length > 0 && (
                                      <span className="text-[11px] text-gray-400 mt-1">
                                        inclui {margin.appliedCosts.map((c) => c.name).join(', ')} (
                                        -R$ {margin.additionalCostsTotal.toFixed(2)})
                                      </span>
                                    )}
                                    {margin.promoBenefits.length > 0 && (
                                      <span className="text-[11px] text-green-600 mt-1">
                                        🎁 promoção ativa (+R$ {margin.promoBenefitsTotal.toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                ) : margin?.status === 'sem_preco' ? (
                                  <span className="text-xs text-gray-400">— sem preço cadastrado</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                                    <AlertCircle className="w-3 h-3" />
                                    Sem regra de taxa
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {margin?.status === 'ok' ? (
                                  <span
                                    className={`text-sm font-medium ${
                                      margin.marginPct > 10
                                        ? 'text-green-600'
                                        : margin.marginPct > 0
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {margin.marginPct.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">—</span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditProduct(product)
                                }}
                                title="Editar produto"
                                className="text-blue-600 hover:text-blue-900 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {product.active ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeactivateProduct(product.id, product.name)
                                  }}
                                  title="Desativar produto (não apaga o histórico)"
                                  className="text-red-600 hover:text-red-900 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const { error } = await supabase
                                      .from('products')
                                      .update({ active: true })
                                      .eq('id', product.id)
                                    if (error) {
                                      alert('Erro ao reativar: ' + error.message)
                                      return
                                    }
                                    setProducts(
                                      products.map((p) =>
                                        p.id === product.id ? { ...p, active: true } : p
                                      )
                                    )
                                  }}
                                  title="Reativar produto"
                                  className="text-green-600 hover:text-green-900 text-xs font-medium"
                                >
                                  Reativar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {expandedProductId === product.id && (
                          <tr>
                            <td colSpan={selectedPlatform !== 'all' ? 8 : 5} className="bg-gray-50 px-6 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {platforms.map((platform) => {
                                  const listing = getListing(product.id, platform.id)
                                  if (!listing) {
                                    return (
                                      <div
                                        key={platform.id}
                                        className="bg-white rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-400"
                                      >
                                        {platform.name} — não vendido nesta plataforma
                                      </div>
                                    )
                                  }

                                  const m = computeMargin(product, platform.id)
                                  const isEstimate =
                                    m.status === 'ok' &&
                                    (m.rule.source_url?.toUpperCase().includes('ESTIMATIVA') ||
                                      m.rule.source_url?.toUpperCase().includes('A VALIDAR'))
                                  const appliedIds = new Set(
                                    listingCostComponents
                                      .filter((lcc) => lcc.product_listing_id === listing.id)
                                      .map((lcc) => lcc.cost_component_id)
                                  )
                                  const availableComponents = costComponents.filter(
                                    (c) => !appliedIds.has(c.id)
                                  )
                                  const listingLccs = listingCostComponents.filter(
                                    (lcc) => lcc.product_listing_id === listing.id
                                  )

                                  return (
                                    <div key={platform.id} className="bg-white rounded-lg border border-gray-200 p-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-gray-900 text-sm">{platform.name}</h4>
                                        {m.status === 'ok' && (
                                          <span
                                            className={`text-[11px] px-2 py-0.5 rounded-full ${
                                              isEstimate
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-green-100 text-green-700'
                                            }`}
                                          >
                                            {isEstimate ? '⚠️ Estimativa' : '✅ Confirmada'}
                                          </span>
                                        )}
                                      </div>

                                      {m.status !== 'ok' ? (
                                        <p className="text-xs text-gray-400">
                                          {m.status === 'sem_preco'
                                            ? 'Sem preço de venda cadastrado.'
                                            : 'Sem regra de taxa cadastrada para esta categoria/plataforma.'}
                                        </p>
                                      ) : (
                                        <>
                                          <div className="text-xs text-gray-600 space-y-1 mb-3">
                                            <div className="flex justify-between">
                                              <span>Preço de venda</span>
                                              <span>R$ {m.salePrice.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Custo do produto</span>
                                              <span>- R$ {product.cost_price.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Comissão plataforma ({m.rule.commission_pct}%)</span>
                                              <span>- R$ {m.commission.toFixed(2)}</span>
                                            </div>
                                            {m.fixedFee > 0 && (
                                              <div className="flex justify-between">
                                                <span>Taxa fixa</span>
                                                <span>- R$ {m.fixedFee.toFixed(2)}</span>
                                              </div>
                                            )}
                                            {m.appliedCosts.map((c, i) => (
                                              <div key={i} className="flex justify-between">
                                                <span>
                                                  {c.name}{' '}
                                                  {c.calcType === 'percentage' ? `(${c.value}%)` : '(fixo)'}
                                                </span>
                                                <span>- R$ {c.amount.toFixed(2)}</span>
                                              </div>
                                            ))}
                                            {m.promoBenefits.map((b, i) => (
                                              <div key={i} className="flex justify-between text-green-700">
                                                <span>🎁 {b.name}</span>
                                                <span>+ R$ {b.amount.toFixed(2)}</span>
                                              </div>
                                            ))}
                                            <div className="flex justify-between font-semibold text-gray-900 border-t pt-1 mt-1">
                                              <span>Margem líquida</span>
                                              <span>
                                                R$ {m.netMargin.toFixed(2)} ({m.marginPct.toFixed(1)}%)
                                              </span>
                                            </div>
                                          </div>

                                          {/* Edição de taxa — só super_admin, afeta todas as empresas que usam essa regra */}
                                          {userRole === 'super_admin' && (
                                            <div
                                              className="mb-3 border-t pt-2"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {editRuleForm[m.rule.id] ? (
                                                <div className="space-y-1 bg-yellow-50 rounded p-2">
                                                  <p className="text-[10px] text-yellow-800 mb-1">
                                                    ⚠️ Isso cria uma nova versão da regra a partir de
                                                    hoje e afeta todos os produtos desta categoria
                                                    nesta plataforma, em qualquer empresa.
                                                  </p>
                                                  <div className="flex gap-1">
                                                    <input
                                                      type="number"
                                                      placeholder="Comissão %"
                                                      value={editRuleForm[m.rule.id]?.commission_pct ?? m.rule.commission_pct}
                                                      onChange={(e) =>
                                                        setEditRuleForm((prev) => ({
                                                          ...prev,
                                                          [m.rule.id]: {
                                                            ...prev[m.rule.id],
                                                            commission_pct: e.target.value,
                                                          },
                                                        }))
                                                      }
                                                      className="text-xs border border-gray-300 rounded px-2 py-1 w-20"
                                                    />
                                                    <input
                                                      type="number"
                                                      placeholder="Taxa fixa R$"
                                                      value={editRuleForm[m.rule.id]?.fixed_fee ?? m.rule.fixed_fee}
                                                      onChange={(e) =>
                                                        setEditRuleForm((prev) => ({
                                                          ...prev,
                                                          [m.rule.id]: {
                                                            ...prev[m.rule.id],
                                                            fixed_fee: e.target.value,
                                                          },
                                                        }))
                                                      }
                                                      className="text-xs border border-gray-300 rounded px-2 py-1 w-20"
                                                    />
                                                  </div>
                                                  <input
                                                    type="text"
                                                    placeholder="Fonte (link oficial ou nota)"
                                                    value={editRuleForm[m.rule.id]?.source_url || ''}
                                                    onChange={(e) =>
                                                      setEditRuleForm((prev) => ({
                                                        ...prev,
                                                        [m.rule.id]: {
                                                          ...prev[m.rule.id],
                                                          source_url: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                                  />
                                                  <div className="flex gap-1">
                                                    <button
                                                      onClick={() => handleUpdateRule(m.rule)}
                                                      className="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700"
                                                    >
                                                      Salvar nova versão
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        setEditRuleForm((prev) => ({
                                                          ...prev,
                                                          [m.rule.id]: null,
                                                        }))
                                                      }
                                                      className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
                                                    >
                                                      Cancelar
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() =>
                                                      setEditRuleForm((prev) => ({
                                                        ...prev,
                                                        [m.rule.id]: {
                                                          commission_pct: m.rule.commission_pct,
                                                          fixed_fee: m.rule.fixed_fee,
                                                          source_url: '',
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs text-blue-600 hover:underline"
                                                  >
                                                    editar taxa
                                                  </button>
                                                  {isEstimate && (
                                                    <button
                                                      onClick={() => {
                                                        const url = window.prompt(
                                                          'Link da fonte oficial:'
                                                        )
                                                        if (url) handleMarkRuleConfirmed(m.rule, url)
                                                      }}
                                                      className="text-xs text-green-600 hover:underline"
                                                    >
                                                      marcar como confirmada
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {/* Custos adicionais aplicados — remover */}
                                          {listingLccs.length > 0 && (
                                            <div className="space-y-1 mb-2">
                                              {listingLccs.map((lcc) => {
                                                const comp = costComponents.find(
                                                  (c) => c.id === lcc.cost_component_id
                                                )
                                                return (
                                                  <div
                                                    key={lcc.id}
                                                    className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                                                  >
                                                    <span>{comp?.name || '—'}</span>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleRemoveCostFromListing(lcc.id)
                                                      }}
                                                      className="text-red-500 hover:text-red-700"
                                                    >
                                                      remover
                                                    </button>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}

                                          {/* Adicionar custo existente */}
                                          {availableComponents.length > 0 && (
                                            <div
                                              className="flex gap-1 mb-2"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <select
                                                value={addCostForm[listing.id]?.componentId || ''}
                                                onChange={(e) =>
                                                  setAddCostForm((prev) => ({
                                                    ...prev,
                                                    [listing.id]: {
                                                      ...prev[listing.id],
                                                      componentId: e.target.value,
                                                    },
                                                  }))
                                                }
                                                className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                                              >
                                                <option value="">+ adicionar custo...</option>
                                                {availableComponents.map((c) => (
                                                  <option key={c.id} value={c.id}>
                                                    {c.name} (
                                                    {c.calc_type === 'percentage'
                                                      ? `${c.default_value}%`
                                                      : `R$${c.default_value}`}
                                                    )
                                                  </option>
                                                ))}
                                              </select>
                                              <button
                                                onClick={() => handleAddCostToListing(listing.id)}
                                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                              >
                                                Add
                                              </button>
                                            </div>
                                          )}

                                          {/* Criar novo tipo de custo, direto daqui */}
                                          <div onClick={(e) => e.stopPropagation()}>
                                            {!newComponentForm[listing.id]?.show ? (
                                              <button
                                                onClick={() =>
                                                  setNewComponentForm((prev) => ({
                                                    ...prev,
                                                    [listing.id]: { show: true },
                                                  }))
                                                }
                                                className="text-xs text-blue-600 hover:underline"
                                              >
                                                + criar novo tipo de custo
                                              </button>
                                            ) : (
                                              <div className="space-y-1 bg-blue-50 rounded p-2 mt-1">
                                                <input
                                                  type="text"
                                                  placeholder="Nome (ex: Comissão Creator)"
                                                  value={newComponentForm[listing.id]?.name || ''}
                                                  onChange={(e) =>
                                                    setNewComponentForm((prev) => ({
                                                      ...prev,
                                                      [listing.id]: {
                                                        ...prev[listing.id],
                                                        name: e.target.value,
                                                      },
                                                    }))
                                                  }
                                                  className="text-xs border border-gray-300 rounded px-2 py-1 w-full"
                                                />
                                                <div className="flex gap-1">
                                                  <select
                                                    value={newComponentForm[listing.id]?.category || 'other'}
                                                    onChange={(e) =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: {
                                                          ...prev[listing.id],
                                                          category: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-1 py-1"
                                                  >
                                                    <option value="affiliate_commission">Afiliado</option>
                                                    <option value="marketing_commission">Marketing</option>
                                                    <option value="ads_cost">Ads</option>
                                                    <option value="other">Outro</option>
                                                  </select>
                                                  <select
                                                    value={newComponentForm[listing.id]?.calc_type || 'percentage'}
                                                    onChange={(e) =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: {
                                                          ...prev[listing.id],
                                                          calc_type: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-1 py-1"
                                                  >
                                                    <option value="percentage">%</option>
                                                    <option value="fixed">R$ fixo</option>
                                                  </select>
                                                  <input
                                                    type="number"
                                                    placeholder="Valor"
                                                    value={newComponentForm[listing.id]?.default_value || ''}
                                                    onChange={(e) =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: {
                                                          ...prev[listing.id],
                                                          default_value: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                    className="text-xs border border-gray-300 rounded px-2 py-1 w-16"
                                                  />
                                                </div>
                                                <div className="flex gap-1">
                                                  <button
                                                    onClick={() => handleCreateCostComponent(listing.id)}
                                                    className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                                  >
                                                    Criar e usar
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      setNewComponentForm((prev) => ({
                                                        ...prev,
                                                        [listing.id]: { show: false },
                                                      }))
                                                    }
                                                    className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedPlatform !== 'all' && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900 mb-1">Como a margem é calculada</h4>
                <p className="text-sm text-blue-700">
                  Usa o preço de venda real cadastrado por plataforma e a regra de taxa vigente
                  (comissão + taxa fixa) para essa categoria. Sem preço ou sem regra cadastrada,
                  o sistema mostra "—" em vez de um valor estimado.
                </p>
              </div>
            </div>
          </div>
        )}
        </>
        )}

        {activeTab === 'regras' && userRole === 'super_admin' && (
          <div>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Regras de Taxa</h2>
              <button
                onClick={() => {
                  setResolvingGapId(null)
                  setShowNewRuleForm(true)
                }}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nova Regra
              </button>
            </div>

            {showNewRuleForm && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {resolvingGapId ? 'Resolver lacuna — nova regra' : 'Nova regra de taxa'}
                </h3>
                <form onSubmit={handleCreateRule} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      value={newRule.platform_id}
                      onChange={(e) => setNewRule({ ...newRule, platform_id: e.target.value })}
                      required
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Plataforma...</option>
                      {platforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Categoria (vazio = geral)"
                      value={newRule.category}
                      onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={newRule.listing_type}
                      onChange={(e) => setNewRule({ ...newRule, listing_type: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Tipo de anúncio (opcional)</option>
                      <option value="classico">Clássico</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <input
                      type="number"
                      placeholder="Preço mín."
                      value={newRule.price_min}
                      onChange={(e) => setNewRule({ ...newRule, price_min: e.target.value })}
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Preço máx. (vazio = sem limite)"
                      value={newRule.price_max}
                      onChange={(e) => setNewRule({ ...newRule, price_max: e.target.value })}
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Comissão %"
                      value={newRule.commission_pct}
                      onChange={(e) => setNewRule({ ...newRule, commission_pct: e.target.value })}
                      required
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Taxa fixa R$"
                      value={newRule.fixed_fee}
                      onChange={(e) => setNewRule({ ...newRule, fixed_fee: e.target.value })}
                      step="0.01"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Fonte (link oficial ou nota 'ESTIMATIVA - motivo')"
                    value={newRule.source_url}
                    onChange={(e) => setNewRule({ ...newRule, source_url: e.target.value })}
                    required
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewRuleForm(false)
                        setResolvingGapId(null)
                      }}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plataforma</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faixa preço</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Comissão</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tx. fixa</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vigência</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {feeRules
                    .filter((r) => !r.valid_to || new Date(r.valid_to) >= new Date())
                    .sort((a, b) => new Date(b.valid_from) - new Date(a.valid_from))
                    .map((rule) => {
                      const platform = platforms.find((p) => p.id === rule.platform_id)
                      const isEstimate =
                        rule.source_url?.toUpperCase().includes('ESTIMATIVA') ||
                        rule.source_url?.toUpperCase().includes('A VALIDAR')
                      return (
                        <tr key={rule.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{platform?.name || '—'}</td>
                          <td className="px-4 py-3">{rule.category || 'Geral'}</td>
                          <td className="px-4 py-3">{rule.listing_type || '—'}</td>
                          <td className="px-4 py-3">
                            R$ {rule.price_min} – {rule.price_max ?? '∞'}
                          </td>
                          <td className="px-4 py-3">{rule.commission_pct}%</td>
                          <td className="px-4 py-3">R$ {rule.fixed_fee}</td>
                          <td className="px-4 py-3 text-gray-500">
                            desde {new Date(rule.valid_from).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                isEstimate
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {isEstimate ? '⚠️ Estimativa' : '✅ Confirmada'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'promocoes' && userRole === 'super_admin' && (
          <PromotionsView userRole={userRole} />
        )}
      </main>
    </div>
  )
}
