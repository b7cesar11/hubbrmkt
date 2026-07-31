import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabase = createClient(
  'https://nyclgbtrkkegcdkrxaeq.supabase.co',
  'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD',
  {
    realtime: {
      transport: ws
    }
  }
)

const EMPRESA_A_ID = '6c7cf6d2-7497-46b7-802b-f54815922fa2'
const EMPRESA_B_ID = '88e12cba-b80d-42a7-8662-3ae4c4299586'

async function testIsolation() {
  console.log('=== TESTE DE ISOLAMENTO POR TENANT ===\n')

  // ===== PASSO 1: Login como Empresa A e inserir produto =====
  console.log('1. Login como Empresa A...')
  const { data: authA, error: errA } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  })

  if (errA) {
    console.error(`   ❌ Erro no login A:`, errA)
    return
  }
  console.log(`   ✅ Login sucesso. User ID: ${authA.user.id}`)

  console.log('\n2. Inserindo produto de teste para Empresa A...')
  const { data: productA, error: errInsertA } = await supabase
    .from('products')
    .insert({
      company_id: EMPRESA_A_ID,
      sku: 'TESTE-A-01',
      name: 'Produto Empresa A',
      cost_price: 10
    })
    .select()
    .single()

  if (errInsertA) {
    console.error(`   ❌ Erro ao inserir produto A: ${errInsertA.message}`)
  } else {
    console.log(`   ✅ Produto inserido: ${productA.name} (ID: ${productA.id})`)
  }

  // ===== PASSO 2: Logout e login como Empresa B =====
  console.log('\n3. Logout e login como Empresa B...')
  await supabase.auth.signOut()

  const { data: authB, error: errB } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-b@margemhub.dev',
    password: 'SenhaForte123!'
  })

  if (errB) {
    console.error(`   ❌ Erro no login B: ${errB.message}`)
    return
  }
  console.log(`   ✅ Login sucesso. User ID: ${authB.user.id}`)

  // ===== PASSO 3: Tentar ler produtos (deve vir vazio) =====
  console.log('\n4. Tentando ler produtos como Empresa B...')
  const { data: productsB, error: errReadB } = await supabase
    .from('products')
    .select('*')

  if (errReadB) {
    console.error(`   ❌ Erro ao ler produtos: ${errReadB.message}`)
  } else {
    console.log(`   📦 Produtos encontrados: ${productsB.length}`)
    if (productsB.length > 0) {
      console.log('   ❌ CRÍTICO: Empresa B viu produtos da Empresa A!')
      console.log('   Dados vazados:', JSON.stringify(productsB, null, 2))
      console.log('\n   ⚠️  ISOLAMENTO QUEBRADO - PARAR TUDO E CORRIGIR RLS')
      return
    } else {
      console.log('   ✅ ISOLAMENTO FUNCIONANDO: Empresa B não vê produtos da Empresa A')
    }
  }

  // ===== PASSO 4: Verificar se plataformas são visíveis =====
  console.log('\n5. Verificando tabelas globais (platforms)...')
  const { data: platforms, error: errPlats } = await supabase
    .from('platforms')
    .select('*')

  if (errPlats) {
    console.error(`   ❌ Erro ao ler platforms: ${errPlats.message}`)
  } else {
    console.log(`   ✅ Platforms visíveis: ${platforms.length} registros`)
    if (platforms.length !== 5) {
      console.log(`   ⚠️  Esperado 5 plataformas, encontrado ${platforms.length}`)
    }
  }

  // ===== PASSO 5: Verificar regras de taxa =====
  console.log('\n6. Verificando platform_fee_rules...')
  const { data: rules, error: errRules } = await supabase
    .from('platform_fee_rules')
    .select('*')

  if (errRules) {
    console.error(`   ❌ Erro ao ler rules: ${errRules.message}`)
  } else {
    console.log(`   ✅ Regras visíveis: ${rules.length} registros`)
  }

  // ===== PASSO 6: Empresa B insere seu próprio produto =====
  console.log('\n7. Inserindo produto de teste para Empresa B...')
  const { data: productB, error: errInsertB } = await supabase
    .from('products')
    .insert({
      company_id: EMPRESA_B_ID,
      sku: 'TESTE-B-01',
      name: 'Produto Empresa B',
      cost_price: 20
    })
    .select()
    .single()

  if (errInsertB) {
    console.error(`   ❌ Erro ao inserir produto B: ${errInsertB.message}`)
  } else {
    console.log(`   ✅ Produto inserido: ${productB.name} (ID: ${productB.id})`)
  }

  // ===== PASSO 7: Voltar como Empresa A e verificar isolamento =====
  console.log('\n8. Logout e login como Empresa A novamente...')
  await supabase.auth.signOut()

  const { data: authA2 } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  })

  console.log('\n9. Lendo produtos como Empresa A...')
  const { data: productsA2, error: errReadA2 } = await supabase
    .from('products')
    .select('*')

  if (errReadA2) {
    console.error(`   ❌ Erro ao ler produtos: ${errReadA2.message}`)
  } else {
    console.log(`   📦 Produtos encontrados: ${productsA2.length}`)
    if (productsA2.length === 1 && productsA2[0].sku === 'TESTE-A-01') {
      console.log('   ✅ Empresa A vê apenas seus próprios produtos')
    } else if (productsA2.some(p => p.sku === 'TESTE-B-01')) {
      console.log('   ❌ CRÍTICO: Empresa A viu produto da Empresa B!')
      console.log('   Dados vazados:', JSON.stringify(productsA2, null, 2))
    } else {
      console.log('   ⚠️  Resultado inesperado:', JSON.stringify(productsA2, null, 2))
    }
  }

  console.log('\n=== RESUMO FINAL ===')
  console.log('✅ Teste de isolamento concluído')
  console.log('Verifique os logs acima para confirmar que:')
  console.log('  - Empresa B não viu produtos da Empresa A')
  console.log('  - Empresa A vê apenas seus próprios produtos')
  console.log('  - Tabelas globais (platforms, rules) estão visíveis')
}

testIsolation().catch(console.error)
