/**
 * PARTE 1 — Testar Auth + Isolamento por Tenant
 * 
 * Executar com: node test-isolamento.js
 * 
 * Este script testa o isolamento multi-tenant antes de construir qualquer frontend.
 * Usa API REST direta para evitar dependência de WebSocket no Node.js 20.
 */

const SUPABASE_URL = 'https://nyclgbtrkkegcdkrxaeq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD'

// Credenciais de teste
const USER_A_EMAIL = 'teste.empresa.a@gmail.com'
const USER_B_EMAIL = 'teste.empresa.b@gmail.com'
const TEST_PASSWORD = 'SenhaForte123!'

async function supabaseAuthSignUp(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ email, password })
  })
  const data = await response.json()
  if (!response.ok) {
    return { data: null, error: data }
  }
  return { data, error: null }
}

async function supabaseSignIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ email, password })
  })
  const data = await response.json()
  if (!response.ok) {
    return { data: null, error: data }
  }
  return { data, error: null }
}

async function supabaseQuery(accessToken, table, method = 'SELECT', body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'SELECT' ? 'return=representation' : 'return=representation'
  }
  
  if (method === 'SELECT') {
    const response = await fetch(url, { headers })
    if (!response.ok) {
      const error = await response.json()
      return { data: null, error }
    }
    const data = await response.json()
    return { data, error: null }
  } else if (method === 'INSERT') {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      const error = await response.json()
      return { data: null, error }
    }
    const data = await response.json()
    return { data, error: null }
  }
  
  return { data: null, error: { message: 'Método não suportado' } }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testIsolamento() {
  console.log('='.repeat(60))
  console.log('PARTE 1 — Teste de Isolamento Multi-Tenant')
  console.log('='.repeat(60))
  
  // =====================
  // Passo 1.2 — Criar usuários de teste
  // =====================
  console.log('\n📝 Passo 1.2 — Criando usuários de teste...')
  
  // Tentar criar Usuário A
  console.log(`Criando usuário: ${USER_A_EMAIL}`)
  const { data: userA, error: errA } = await supabaseAuthSignUp(USER_A_EMAIL, TEST_PASSWORD)
  
  if (errA) {
    if (errA.msg?.includes('User already registered') || errA.message?.includes('already registered')) {
      console.log('⚠️  Usuário A já existe (ignorado)')
    } else {
      console.error('❌ Erro ao criar Usuário A:', errA)
      return false
    }
  } else {
    console.log('✅ Usuário A criado:', userA?.user?.id || userA?.id)
  }
  
  // Pequeno delay entre signups
  await sleep(500)
  
  // Criar Usuário B
  console.log(`Criando usuário: ${USER_B_EMAIL}`)
  const { data: userB, error: errB } = await supabaseAuthSignUp(USER_B_EMAIL, TEST_PASSWORD)
  
  if (errB) {
    if (errB.msg?.includes('User already registered') || errB.message?.includes('already registered')) {
      console.log('⚠️  Usuário B já existe (ignorado)')
    } else {
      console.error('❌ Erro ao criar Usuário B:', errB)
      return false
    }
  } else {
    console.log('✅ Usuário B criado:', userB?.user?.id || userB?.id)
  }
  
  // =====================
  // Passo 1.3 — Verificar se users foram criados no banco
  // =====================
  console.log('\n📝 Passo 1.3 — Verificando registros na tabela users...')
  console.log('⚠️  Nota: Atribuição de company_id requer acesso direto ao SQL')
  console.log('   Execute manualmente no SQL Editor do Supabase:')
  console.log('   ')
  console.log('   -- Primeiro, obtenha os IDs das empresas (ou crie novas):')
  console.log("   insert into companies (name) values ('Empresa Teste A') returning id;")
  console.log("   insert into companies (name) values ('Empresa Teste B') returning id;")
  console.log('   ')
  console.log('   -- Depois atribua aos usuários:')
  console.log(`   update users set company_id = '<id-empresa-a>' where email = '${USER_A_EMAIL}';`)
  console.log(`   update users set company_id = '<id-empresa-b>' where email = '${USER_B_EMAIL}';`)
  console.log('')
  console.log('🔴 PAUSA NECESSÁRIA: Execute os comandos SQL acima antes de continuar.')
  console.log('   Depois re-executar este script para prosseguir com o teste de isolamento...')
  
  // =====================
  // Passo 1.4 — Testar isolamento (assumindo que company_id foi atribuído)
  // =====================
  console.log('\n📝 Passo 1.4 — Testando isolamento...')
  
  // Login como Usuário A
  console.log(`\n🔐 Logando como: ${USER_A_EMAIL}`)
  const { data: sessionA, error: loginErrA } = await supabaseSignIn(USER_A_EMAIL, TEST_PASSWORD)
  
  if (loginErrA) {
    console.error('❌ Erro no login do Usuário A:', loginErrA)
    console.log('💡 Dica: Se o erro for "Invalid login credentials", execute o SQL de atribuição de company_id primeiro.')
    return false
  }
  console.log('✅ Login Usuário A sucesso')
  const tokenA = sessionA.access_token
  
  // Cadastrar produto como Empresa A
  console.log('\n📦 Cadastrando produto de teste para Empresa A...')
  const produtoATest = {
    sku: 'TESTE-A-01',
    name: 'Produto Teste A',
    category: 'Testes',
    cost_price: 10.00,
    weight_kg: 0.5,
    active: true
  }
  
  // Precisamos obter o company_id do usuário A primeiro
  const { data: userDataA, error: userFetchErrA } = await supabaseQuery(tokenA, `users?email=eq.${USER_A_EMAIL}&select=company_id`, 'SELECT')
  
  if (userFetchErrA) {
    console.error('❌ Erro ao buscar dados do usuário A:', userFetchErrA)
    return false
  }
  
  if (!userDataA || userDataA.length === 0 || !userDataA[0]?.company_id) {
    console.error('❌ Usuário A não tem company_id atribuído!')
    console.log('💡 Execute o SQL do Passo 1.3 primeiro.')
    return false
  }
  
  produtoATest.company_id = userDataA[0].company_id
  
  const { data: produtoCriado, error: prodErr } = await supabaseQuery(tokenA, 'products', 'INSERT', produtoATest)
  
  if (prodErr) {
    console.error('❌ Erro ao criar produto A:', prodErr)
    return false
  }
  console.log('✅ Produto A criado:', produtoCriado[0]?.id, '-', produtoCriado[0]?.sku)
  
  // Agora login como Usuário B e tentar ver produtos
  console.log(`\n🔐 Logando como: ${USER_B_EMAIL}`)
  const { data: sessionB, error: loginErrB } = await supabaseSignIn(USER_B_EMAIL, TEST_PASSWORD)
  
  if (loginErrB) {
    console.error('❌ Erro no login do Usuário B:', loginErrB)
    return false
  }
  console.log('✅ Login Usuário B sucesso')
  const tokenB = sessionB.access_token
  
  // Tentar ler produtos como Usuário B
  console.log('\n🔍 Buscando produtos como Usuário B (deveria retornar VAZIO)...')
  const { data: produtosDoB, error: fetchErrB } = await supabaseQuery(tokenB, 'products', 'SELECT')
  
  if (fetchErrB) {
    console.error('❌ Erro ao buscar produtos para Usuário B:', fetchErrB)
    return false
  }
  
  console.log(`📊 Produtos encontrados para Usuário B: ${produtosDoB.length}`)
  
  if (produtosDoB.length === 0) {
    console.log('\n✅✅✅ ISOLAMENTO CONFIRMADO! ✅✅✅')
    console.log('   Usuário B NÃO consegue ver produtos da Empresa A.')
    console.log('   RLS está funcionando corretamente.')
    return true
  } else {
    console.log('\n🔴🔴🔴 ALERTA CRÍTICO! 🔴🔴🔴')
    console.log('   Usuário B VIU produtos da Empresa A!')
    console.log('   O isolamento está QUEBRADO!')
    console.log('   Produtos vazados:', produtosDoB.map(p => `${p.sku} (${p.name})`))
    console.log('\n   Pare todo desenvolvimento e corrija as políticas de RLS imediatamente.')
    return false
  }
}

// Executar testes
testIsolamento()
  .then(sucesso => {
    console.log('\n' + '='.repeat(60))
    if (sucesso) {
      console.log('RESULTADO: PARTE 1 APROVADA ✅')
      console.log('Próximo passo: Construir frontend MVP (Parte 2)')
    } else {
      console.log('RESULTADO: PARTE 1 REPROVADA ❌')
      console.log('Não prossiga para Parte 2 até corrigir o isolamento.')
    }
    console.log('='.repeat(60))
    process.exit(sucesso ? 0 : 1)
  })
  .catch(err => {
    console.error('\n💥 Erro inesperado:', err)
    process.exit(1)
  })
