import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle } from 'lucide-react'
import { computeMargin, getListing } from '../lib/margin'
import { useDashboardData } from '../hooks/useDashboardData'
import { VisaoGeralTab } from './tabs/VisaoGeralTab'
import { PromocoesTab } from './tabs/PromocoesTab'
import { SimuladorTab } from './tabs/SimuladorTab'
import { ProdutosTab } from './tabs/ProdutosTab'
import { RegrasTab } from './tabs/RegrasTab'
import { CustosTab } from './tabs/CustosTab'
import { UsuariosTab } from './tabs/UsuariosTab'
import { ConexoesTab } from './tabs/ConexoesTab'

export default function Dashboard({ user, onLogout }) {
  const {
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
    companyUsers,
    setCompanyUsers,
    coverageGaps,
    setCoverageGaps,
    companyId,
    userRole,
    loading,
    reload: loadData,
  } = useDashboardData(user)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null) // null = modo criação
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [showGaps, setShowGaps] = useState(false)
  const [simProductId, setSimProductId] = useState('')
  const [simPlatformId, setSimPlatformId] = useState('')
  const [simScenarios, setSimScenarios] = useState(['10', '20', '30'])
  const [showNewCostComponent, setShowNewCostComponent] = useState(false)
  const [newCostComponent, setNewCostComponent] = useState({
    name: '',
    category: 'other',
    calc_type: 'percentage',
    default_value: '',
  })
  const [editingCostComponentId, setEditingCostComponentId] = useState(null)
  const [editCostComponentForm, setEditCostComponentForm] = useState({})
  const [activeTab, setActiveTab] = useState('visao_geral') // visao_geral | produtos | regras | promocoes
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

  async function handleUpdateRule(oldRule) {
    const form = editRuleForm[oldRule.id]
    if (!form) return
    if (!form.source_url) {
      alert('Informe a fonte (link oficial ou nota "ESTIMATIVA - motivo") antes de salvar.')
      return
    }

    // Aviso de impacto: quantos produtos desta empresa usam essa regra hoje,
    // e qual seria a margem média antes/depois da mudança.
    const affected = []
    products.forEach((product) => {
      const m = computeMargin(product, oldRule.platform_id, getMarginDeps())
      if (m.status === 'ok' && m.rule.id === oldRule.id) {
        affected.push({ product, listing: getListing(product.id, oldRule.platform_id, listings) })
      }
    })

    if (affected.length > 0) {
      const avgBefore =
        affected.reduce((sum, a) => sum + computeMargin(a.product, oldRule.platform_id, getMarginDeps()).marginPct, 0) /
        affected.length

      const newCommissionPct = parseFloat(form.commission_pct)
      const newFixedFee = parseFloat(form.fixed_fee)
      const avgAfter =
        affected.reduce((sum, a) => {
          const price = a.listing.sale_price
          const commission = (price * newCommissionPct) / 100
          const simulatedMargin = price - a.product.cost_price - commission - newFixedFee
          return sum + (simulatedMargin / price) * 100
        }, 0) / affected.length

      const confirmed = window.confirm(
        `⚠️ Essa mudança afeta ${affected.length} produto(s) desta empresa que usam essa regra.\n\n` +
          `Margem média hoje: ${avgBefore.toFixed(1)}%\n` +
          `Margem média estimada com os novos valores: ${avgAfter.toFixed(1)}%\n\n` +
          `Confirma a mudança? (fica registrada como nova versão, a regra atual é preservada no histórico)`
      )
      if (!confirmed) return
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
          listing_type: listing.listing_type || '',
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
          // Atualiza preço e/ou tipo de anúncio se mudou
          const newPrice = parseFloat(formEntry.sale_price)
          const newListingType = formEntry.listing_type || null
          if (newPrice !== existingListing.sale_price || newListingType !== existingListing.listing_type) {
            const { error: updErr } = await supabase
              .from('product_listings')
              .update({ sale_price: newPrice, listing_type: newListingType })
              .eq('id', existingListing.id)
            if (updErr) {
              alert(`Erro ao atualizar preço em ${platform.name}: ` + updErr.message)
              continue
            }
            updatedListings = updatedListings.map((l) =>
              l.id === existingListing.id
                ? { ...l, sale_price: newPrice, listing_type: newListingType }
                : l
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
                listing_type: formEntry.listing_type || null,
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
        listing_type: v.listing_type || null,
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
  // Funções de cálculo de margem movidas para lib/margin.js
  // Helper para facilitar chamadas com deps
  const getMarginDeps = () => ({
    listings,
    feeRules,
    promotions,
    listingCostComponents,
    costComponents,
  })

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

  // Criação a partir da tela de catálogo (não vinculada a um listing específico ainda)
  async function handleCreateCostComponentStandalone(e) {
    e.preventDefault()
    if (!newCostComponent.name || !newCostComponent.default_value) {
      alert('Preencha nome e valor padrão.')
      return
    }
    if (!companyId) return

    const { data, error } = await supabase
      .from('cost_components')
      .insert([
        {
          company_id: companyId,
          name: newCostComponent.name,
          category: newCostComponent.category,
          calc_type: newCostComponent.calc_type,
          default_value: parseFloat(newCostComponent.default_value),
        },
      ])
      .select()

    if (error) {
      alert('Erro ao criar tipo de custo: ' + error.message)
      return
    }

    setCostComponents([...costComponents, ...(data || [])])
    setNewCostComponent({ name: '', category: 'other', calc_type: 'percentage', default_value: '' })
    setShowNewCostComponent(false)
  }

  async function handleUpdateCostComponent(id) {
    const form = editCostComponentForm[id]
    if (!form) return

    const { error } = await supabase
      .from('cost_components')
      .update({
        name: form.name,
        category: form.category,
        calc_type: form.calc_type,
        default_value: parseFloat(form.default_value),
      })
      .eq('id', id)

    if (error) {
      alert('Erro ao atualizar: ' + error.message)
      return
    }

    setCostComponents(
      costComponents.map((c) =>
        c.id === id
          ? { ...c, name: form.name, category: form.category, calc_type: form.calc_type, default_value: parseFloat(form.default_value) }
          : c
      )
    )
    setEditingCostComponentId(null)
  }

  async function handleToggleCostComponentActive(component) {
    const { error } = await supabase
      .from('cost_components')
      .update({ active: !component.active })
      .eq('id', component.id)

    if (error) {
      alert('Erro ao atualizar status: ' + error.message)
      return
    }

    setCostComponents(
      costComponents.map((c) => (c.id === component.id ? { ...c, active: !c.active } : c))
    )
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
  const availableCategories = [...new Set(products.map((p) => p.category).filter(Boolean))]

  const displayedProducts = products
    .filter((p) => (selectedPlatform === 'all' ? true : getListing(p.id, selectedPlatform, listings)))
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

  if (!companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Falta um passo</h1>
          <p className="text-sm text-gray-600 mb-6">
            Sua conta ainda não está vinculada a nenhuma empresa. Peça o código da empresa pra
            quem já usa o MargemHub aí (o admin encontra esse código na aba "Usuários"), e cola
            aqui embaixo.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const code = e.target.company_code.value.trim()
              if (!code) return
              const { error } = await supabase.rpc('fn_join_company', {
                target_company_id: code,
              })
              if (error) {
                alert('Erro ao entrar na empresa: ' + error.message)
                return
              }
              await loadData()
            }}
            className="space-y-3"
          >
            <input
              name="company_code"
              type="text"
              placeholder="Cole o código da empresa aqui"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium"
            >
              Entrar na empresa
            </button>
          </form>
          <button onClick={onLogout} className="mt-4 text-xs text-gray-400 hover:underline">
            Sair
          </button>
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
            <div className="overflow-x-auto">
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
          </div>
        )}

        <div className="mb-6 flex gap-1 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setActiveTab('visao_geral')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'visao_geral'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('produtos')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'produtos'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Produtos
            </button>
            {userRole === 'super_admin' && (
            <button
              onClick={() => setActiveTab('regras')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'regras'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Regras de Taxa
            </button>
            )}
            {userRole === 'super_admin' && (
            <button
              onClick={() => setActiveTab('promocoes')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'promocoes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Promoções
            </button>
            )}
            <button
              onClick={() => setActiveTab('simulador')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'simulador'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Simulador
            </button>
            <button
              onClick={() => setActiveTab('custos')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'custos'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Custos Adicionais
            </button>
            <button
              onClick={() => setActiveTab('usuarios')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'usuarios'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Usuários
            </button>
            {(userRole === 'super_admin' || userRole === 'company_admin') && (
            <button
              onClick={() => setActiveTab('conexoes')}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'conexoes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Conexões
            </button>
            )}
          </div>

        {activeTab === 'visao_geral' && (
          <VisaoGeralTab
            products={products}
            platforms={platforms}
            getMarginDeps={getMarginDeps}
            setShowGaps={setShowGaps}
          />
        )}

        {activeTab === 'produtos' && (
          <ProdutosTab products={products} setProducts={setProducts} platforms={platforms} feeRules={feeRules} listings={listings} costComponents={costComponents} listingCostComponents={listingCostComponents} userRole={userRole} showNewProduct={showNewProduct} setShowNewProduct={setShowNewProduct} editingProductId={editingProductId} setEditingProductId={setEditingProductId} selectedPlatform={selectedPlatform} setSelectedPlatform={setSelectedPlatform} searchText={searchText} setSearchText={setSearchText} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} editRuleForm={editRuleForm} setEditRuleForm={setEditRuleForm} newProduct={newProduct} setNewProduct={setNewProduct} newListings={newListings} setNewListings={setNewListings} expandedProductId={expandedProductId} setExpandedProductId={setExpandedProductId} addCostForm={addCostForm} setAddCostForm={setAddCostForm} newComponentForm={newComponentForm} setNewComponentForm={setNewComponentForm} handleUpdateRule={handleUpdateRule} handleMarkRuleConfirmed={handleMarkRuleConfirmed} toggleListingPlatform={toggleListingPlatform} setListingPrice={setListingPrice} toggleListingCost={toggleListingCost} openEditProduct={openEditProduct} closeProductForm={closeProductForm} handleSubmitProduct={handleSubmitProduct} handleDeactivateProduct={handleDeactivateProduct} getMarginDeps={getMarginDeps} handleAddCostToListing={handleAddCostToListing} handleRemoveCostFromListing={handleRemoveCostFromListing} handleCreateCostComponent={handleCreateCostComponent} availableCategories={availableCategories} displayedProducts={displayedProducts} />
        )}

        {activeTab === 'regras' && userRole === 'super_admin' && (
          <RegrasTab platforms={platforms} feeRules={feeRules} showNewRuleForm={showNewRuleForm} setShowNewRuleForm={setShowNewRuleForm} resolvingGapId={resolvingGapId} setResolvingGapId={setResolvingGapId} newRule={newRule} setNewRule={setNewRule} handleCreateRule={handleCreateRule} />
        )}

        {activeTab === 'promocoes' && userRole === 'super_admin' && <PromocoesTab userRole={userRole} />}

        {activeTab === 'simulador' && (
          <SimuladorTab
            products={products}
            platforms={platforms}
            listings={listings}
            simProductId={simProductId}
            setSimProductId={setSimProductId}
            simPlatformId={simPlatformId}
            setSimPlatformId={setSimPlatformId}
            simScenarios={simScenarios}
            setSimScenarios={setSimScenarios}
            getMarginDeps={getMarginDeps}
          />
        )}

        {activeTab === 'custos' && (
          <CustosTab costComponents={costComponents} showNewCostComponent={showNewCostComponent} setShowNewCostComponent={setShowNewCostComponent} newCostComponent={newCostComponent} setNewCostComponent={setNewCostComponent} editingCostComponentId={editingCostComponentId} setEditingCostComponentId={setEditingCostComponentId} editCostComponentForm={editCostComponentForm} setEditCostComponentForm={setEditCostComponentForm} handleCreateCostComponentStandalone={handleCreateCostComponentStandalone} handleUpdateCostComponent={handleUpdateCostComponent} handleToggleCostComponentActive={handleToggleCostComponentActive} />
        )}

        {activeTab === 'usuarios' && (
          <UsuariosTab companyUsers={companyUsers} setCompanyUsers={setCompanyUsers} companyId={companyId} userRole={userRole} />
        )}

        {activeTab === 'conexoes' && (userRole === 'super_admin' || userRole === 'company_admin') && (
          <ConexoesTab companyId={companyId} userRole={userRole} />
        )}
      </main>
    </div>
  )
}
