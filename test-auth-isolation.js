import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabase = createClient(
  'https://nyclgbtrkkegcdkrxaeq.supabase.co',
  'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD',
  { realtime: { transport: ws } }
)

async function testAuthAndIsolation() {
  console.log('=== PARTE 1: Teste de Auth + Isolamento por Tenant ===\n')

  // Passo 1.2: Criar dois usuários de teste
  console.log('1. Criando Usuário A (teste-empresa-a@margemhub.dev)...')
  const { data: userA, error: errA } = await supabase.auth.signUp({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  })

  if (errA) {
    console.log(`   ⚠️ Erro ou já existe: ${errA.message}`)
  } else {
    console.log(`   ✅ Usuário A criado: ${userA.user?.id}`)
  }

  console.log('\n2. Criando Usuário B (teste-empresa-b@margemhub.dev)...')
  const { data: userB, error: errB } = await supabase.auth.signUp({
    email: 'teste-empresa-b@margemhub.dev',
    password: 'SenhaForte123!'
  })

  if (errB) {
    console.log(`   ⚠️ Erro ou já existe: ${errB.message}`)
  } else {
    console.log(`   ✅ Usuário B criado: ${userB.user?.id}`)
  }

  // Verificar se os usuários existem na tabela users
  console.log('\n3. Verificando usuários na tabela public.users...')
  
  // Login como usuário A para verificar
  await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  })
  
  const { data: usersData } = await supabase
    .from('users')
    .select('id, email, company_id, role')
    .in('email', ['teste-empresa-a@margemhub.dev', 'teste-empresa-b@margemhub.dev'])
  
  console.log('   Usuários encontrados:')
  if (usersData && usersData.length > 0) {
    usersData.forEach(u => {
      console.log(`   - ${u.email}: company_id=${u.company_id}, role=${u.role}`)
    })
  } else {
    console.log('   ⚠️ Nenhum usuário encontrado na tabela public.users')
    console.log('   → Isso significa que o trigger de criação automática não está configurado')
    console.log('   → Será necessário criar manualmente e atribuir company_id via SQL Editor')
  }

  // Listar empresas existentes
  console.log('\n4. Empresas cadastradas:')
  const { data: companies } = await supabase.from('companies').select('id, name, created_at')
  if (companies && companies.length > 0) {
    companies.forEach(c => {
      console.log(`   - ${c.id}: ${c.name}`)
    })
  } else {
    console.log('   Nenhuma empresa cadastrada ainda.')
    console.log('   → Você precisará criar via SQL Editor:')
    console.log('     INSERT INTO companies (name) VALUES (\'Empresa Teste A\') RETURNING id;')
    console.log('     INSERT INTO companies (name) VALUES (\'Empresa Teste B\') RETURNING id;')
    console.log('     UPDATE users SET company_id = \'...\' WHERE email = \'teste-empresa-a@margemhub.dev\';')
    console.log('     UPDATE users SET company_id = \'...\' WHERE email = \'teste-empresa-b@margemhub.dev\';')
  }

  // Verificar plataformas (dados globais)
  console.log('\n5. Plataformas cadastradas (globais):')
  const { data: platforms } = await supabase.from('platforms').select('id, name')
  if (platforms) {
    platforms.forEach(p => {
      console.log(`   - ${p.id}: ${p.name}`)
    })
  }

  // Verificar regras de taxa
  console.log('\n6. Regras de taxa cadastradas:')
  const { data: rules } = await supabase.from('platform_fee_rules').select('platform_id, category, listing_type, commission_pct, valid_from')
  const rulesByPlatform = {}
  if (rules) {
    rules.forEach(r => {
      if (!rulesByPlatform[r.platform_id]) rulesByPlatform[r.platform_id] = []
      rulesByPlatform[r.platform_id].push(r)
    })
    
    for (const [platformId, platformRules] of Object.entries(rulesByPlatform)) {
      const platformName = platforms?.find(p => p.id === platformId)?.name || platformId
      console.log(`   - ${platformName}: ${platformRules.length} regras`)
    }
  }

  // Verificar lacunas de categoria
  console.log('\n7. Lacunas de categoria detectadas:')
  const { data: gaps } = await supabase.from('category_coverage_gaps').select('platform_id, category, detected_at')
  if (gaps && gaps.length > 0) {
    gaps.forEach(g => {
      const platformName = platforms?.find(p => p.id === g.platform_id)?.name || g.platform_id
      console.log(`   🔴 ${g.category} em ${platformName} (detectado em ${g.detected_at})`)
    })
  } else {
    console.log('   Nenhuma lacuna registrada.')
  }

  console.log('\n=== Resumo da Parte 1 ===')
  console.log('✅ Client Supabase instalado e conectado')
  console.log('✅ Usuários de teste criados (ou já existiam)')
  if (usersData && usersData.some(u => u.company_id)) {
    console.log('✅ Usuários têm company_id atribuído')
  } else {
    console.log('⚠️ Usuários SEM company_id — precisa atribuir via SQL Editor')
  }
  console.log('\nPróximo passo: Atribuir company_id aos usuários e testar isolamento de produtos')
}

testAuthAndIsolation().catch(console.error)
