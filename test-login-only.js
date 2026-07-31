import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabase = createClient(
  'https://nyclgbtrkkegcdkrxaeq.supabase.co',
  'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    realtime: {
      transport: ws
    }
  }
)

async function testIsolation() {
  console.log('=== TESTE DE ISOLAMENTO MULTI-TENANT ===\n')
  
  const COMPANY_A_ID = '6c7cf6d2-7497-46b7-802b-f54815922fa2'
  const COMPANY_B_ID = '88e12cba-b80d-42a7-8662-3ae4c4299586'
  
  // ========== PASSO 1: Login como Empresa A e inserir produto ==========
  console.log('1. Login como Empresa A...')
  const { data: authA, error: errA } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  })
  
  if (errA) {
    console.log(`   ❌ Erro no login Empresa A: ${errA.message}`)
    return
  }
  console.log(`   ✅ Login sucesso. User ID: ${authA.user.id}`)
  
  console.log('\n2. Inserindo produto de teste para Empresa A...')
  const { data: productA, error: errInsertA } = await supabase.from('products').insert({
    company_id: COMPANY_A_ID,
    sku: 'TESTE-A-01',
    name: 'Produto Teste A',
    cost_price: 10
  }).select()
  
  if (errInsertA) {
    console.log(`   ❌ Erro ao inserir produto: ${errInsertA.message}`)
  } else {
    console.log(`   ✅ Produto inserido: ${JSON.stringify(productA[0])}`)
  }
  
  // ========== PASSO 2: Logout e login como Empresa B ==========
  console.log('\n3. Logout e login como Empresa B...')
  await supabase.auth.signOut()
  
  const { data: authB, error: errB } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-b@margemhub.dev',
    password: 'SenhaForte123!'
  })
  
  if (errB) {
    console.log(`   ❌ Erro no login Empresa B: ${errB.message}`)
    return
  }
  console.log(`   ✅ Login sucesso. User ID: ${authB.user.id}`)
  
  // ========== PASSO 3: Tentar ler produtos (deve vir vazio) ==========
  console.log('\n4. Tentando ler produtos como Empresa B...')
  const { data: productsB, error: errReadB } = await supabase.from('products').select('*')
  
  if (errReadB) {
    console.log(`   ❌ Erro na leitura: ${errReadB.message}`)
  } else {
    console.log(`   📦 Produtos encontrados: ${JSON.stringify(productsB, null, 2)}`)
    if (productsB && productsB.length === 0) {
      console.log('   ✅ ISOLAMENTO FUNCIONANDO: Empresa B não vê produtos da Empresa A')
    } else if (productsB && productsB.length > 0) {
      console.log('   ❌ CRÍTICO: ISOLAMENTO QUEBRADO! Empresa B viu produtos da Empresa A!')
    }
  }
  
  // ========== PASSO 4: Verificar se platforms e platform_fee_rules são visíveis ==========
  console.log('\n5. Verificando tabelas globais (platforms)...')
  const { data: platforms, error: errPlats } = await supabase.from('platforms').select('*')
  
  if (errPlats) {
    console.log(`   ❌ Erro: ${errPlats.message}`)
  } else {
    console.log(`   ✅ Platforms visíveis: ${platforms.length} registros`)
    console.log(`      ${platforms.map(p => p.name).join(', ')}`)
  }
  
  console.log('\n6. Verificando tabelas globais (platform_fee_rules)...')
  const { data: rules, error: errRules } = await supabase.from('platform_fee_rules').select('*')
  
  if (errRules) {
    console.log(`   ❌ Erro: ${errRules.message}`)
  } else {
    console.log(`   ✅ Platform fee rules visíveis: ${rules.length} registros`)
  }
  
  // ========== PASSO 5: Login como Empresa A e confirmar que vê seu produto ==========
  console.log('\n7. Login novamente como Empresa A para confirmar visão dos próprios produtos...')
  await supabase.auth.signOut()
  
  const { data: authA2 } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  })
  
  const { data: productsA2 } = await supabase.from('products').select('*')
  console.log(`   📦 Produtos da Empresa A: ${JSON.stringify(productsA2, null, 2)}`)
  
  if (productsA2 && productsA2.length > 0) {
    console.log('   ✅ Empresa A vê seus próprios produtos corretamente')
  }
  
  console.log('\n=== FIM DO TESTE ===')
}

testIsolation().catch(console.error)
