import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabase = createClient(
  'https://nyclgbtrkkegcdkrxaeq.supabase.co',
  'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD',
  { realtime: { transport: ws } }
)

async function verifyDatabaseState() {
  console.log('=== Verificação do Estado Real do Banco ===\n')

  // Primeiro, tentar login com um usuário administrador (se existir)
  // Se não tiver usuário, vamos precisar criar via SQL Editor
  console.log('Tentando login com usuário admin (se existir)...')
  
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'admin@margemhub.dev',
    password: 'AdminSenha123!'
  })

  if (signInError) {
    console.log(`⚠️ Login falhou: ${signInError.message}`)
    console.log('\n📋 AÇÕES NECESSÁRIAS (via SQL Editor do Supabase):\n')
    console.log('1. Criar empresas de teste:')
    console.log("   INSERT INTO companies (name) VALUES ('Empresa Teste A'), ('Empresa Teste B') RETURNING id, name;")
    console.log('\n2. Criar usuários manualmente na tabela auth.users (via Authentication > Users no painel) OU:')
    console.log('   Usar o signup uma vez e depois atribuir company_id:')
    console.log("   -- Após signup, atribuir empresa:")
    console.log("   UPDATE users SET company_id = '<id-da-empresa>' WHERE email = 'teste-empresa-a@margemhub.dev';")
    console.log("   UPDATE users SET company_id = '<id-da-empresa>' WHERE email = 'teste-empresa-b@margemhub.dev';")
    console.log('\n3. Habilitar RLS nas tabelas globais para leitura anon (opcional, só se quiser expor plataformas sem login):')
    console.log('   ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;')
    console.log("   CREATE POLICY \"Plataformas são públicas para leitura\" ON platforms FOR SELECT USING (true);")
    console.log('   ALTER TABLE platform_fee_rules ENABLE ROW LEVEL SECURITY;')
    console.log("   CREATE POLICY \"Regras são públicas para leitura\" ON platform_fee_rules FOR SELECT USING (true);")
    return
  }

  console.log(`✅ Login realizado: ${signInData.user.email}`)
  console.log(`   User ID: ${signInData.user.id}\n`)

  // Agora verificar os dados reais
  console.log('1. Empresas cadastradas:')
  const { data: companies } = await supabase.from('companies').select('id, name, created_at')
  if (companies && companies.length > 0) {
    companies.forEach(c => console.log(`   - ${c.id}: ${c.name} (criada em ${c.created_at})`))
  } else {
    console.log('   Nenhuma empresa cadastrada.')
  }

  console.log('\n2. Usuários na tabela public.users:')
  const { data: users } = await supabase.from('users').select('id, email, company_id, role')
  if (users && users.length > 0) {
    users.forEach(u => {
      const companyId = u.company_id || 'NULL'
      console.log(`   - ${u.email}: role=${u.role}, company_id=${companyId}`)
    })
  } else {
    console.log('   Nenhum usuário encontrado (trigger de criação automática pode não estar ativo).')
  }

  console.log('\n3. Plataformas cadastradas:')
  const { data: platforms } = await supabase.from('platforms').select('id, name')
  if (platforms && platforms.length > 0) {
    platforms.forEach(p => console.log(`   - ${p.id}: ${p.name}`))
  } else {
    console.log('   Nenhuma plataforma encontrada.')
  }

  console.log('\n4. Regras de taxa (platform_fee_rules):')
  const { data: rules } = await supabase.from('platform_fee_rules').select('id, platform_id, category, listing_type, commission_pct, fixed_fee, valid_from, valid_to')
  if (rules && rules.length > 0) {
    const rulesByPlatform = {}
    rules.forEach(r => {
      if (!rulesByPlatform[r.platform_id]) rulesByPlatform[r.platform_id] = []
      rulesByPlatform[r.platform_id].push(r)
    })

    for (const [platformId, platformRules] of Object.entries(rulesByPlatform)) {
      const platformName = platforms?.find(p => p.id === platformId)?.name || platformId
      console.log(`   - ${platformName}: ${platformRules.length} regras`)
      
      // Mostrar categorias únicas
      const categories = [...new Set(platformRules.map(r => r.category || '(geral)'))]
      console.log(`     Categorias: ${categories.join(', ')}`)
    }
    console.log(`   TOTAL: ${rules.length} regras`)
  } else {
    console.log('   Nenhuma regra encontrada.')
  }

  console.log('\n5. Lacunas de categoria (category_coverage_gaps):')
  const { data: gaps } = await supabase.from('category_coverage_gaps').select('id, platform_id, category, detected_at')
  if (gaps && gaps.length > 0) {
    gaps.forEach(g => {
      const platformName = platforms?.find(p => p.id === g.platform_id)?.name || g.platform_id
      console.log(`   🔴 ${g.category} em ${platformName} (detectado em ${g.detected_at})`)
    })
  } else {
    console.log('   Nenhuma lacuna registrada.')
  }

  console.log('\n6. Produtos cadastrados:')
  const { data: products } = await supabase.from('products').select('id, company_id, sku, name, category, cost_price')
  if (products && products.length > 0) {
    products.forEach(p => {
      const companyId = companies?.find(c => c.id === p.company_id)?.name || p.company_id
      console.log(`   - ${p.sku}: ${p.name} (${companyId}) - R$ ${p.cost_price}`)
    })
  } else {
    console.log('   Nenhum produto cadastrado.')
  }

  console.log('\n=== Resumo ===')
  console.log(`Empresas: ${companies?.length || 0}`)
  console.log(`Usuários: ${users?.length || 0}`)
  console.log(`Plataformas: ${platforms?.length || 0}`)
  console.log(`Regras de taxa: ${rules?.length || 0}`)
  console.log(`Lacunas de categoria: ${gaps?.length || 0}`)
  console.log(`Produtos: ${products?.length || 0}`)

  if ((!users || users.length === 0) && (!companies || companies.length === 0)) {
    console.log('\n⚠️ BANCO VAZIO DE TENANTS E USUÁRIOS')
    console.log('Execute os scripts SQL listados acima para configurar o ambiente de teste.')
  }
}

verifyDatabaseState().catch(console.error)
