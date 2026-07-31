/**
 * VERIFICAR ESTADO ATUAL DO BANCO
 * 
 * Este script apenas lê o estado atual das tabelas para diagnóstico.
 * Não cria usuários nem faz write operations.
 */

const SUPABASE_URL = 'https://nyclgbtrkkegcdkrxaeq.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD'

async function supabaseQueryPublic(table, select = '*') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  if (!response.ok) {
    const error = await response.json()
    return { data: null, error }
  }
  const data = await response.json()
  return { data, error: null }
}

async function verificarEstado() {
  console.log('='.repeat(60))
  console.log('DIAGNÓSTICO DO BANCO DE DADOS — MargemHub')
  console.log('='.repeat(60))
  
  // Verificar companies
  console.log('\n📊 Companies:')
  const { data: companies, error: errCompanies } = await supabaseQueryPublic('companies')
  if (errCompanies) {
    console.log('  Erro:', errCompanies)
  } else {
    console.log(`  Total: ${companies.length} empresa(s)`)
    companies.forEach(c => {
      console.log(`    - ${c.id}: ${c.name} (criada em ${c.created_at})`)
    })
  }
  
  // Verificar platforms (global)
  console.log('\n🌐 Platforms (global):')
  const { data: platforms, error: errPlatforms } = await supabaseQueryPublic('platforms', 'id,name')
  if (errPlatforms) {
    console.log('  Erro:', errPlatforms)
  } else {
    console.log(`  Total: ${platforms.length} plataforma(s)`)
    platforms.forEach(p => {
      console.log(`    - ${p.id}: ${p.name}`)
    })
  }
  
  // Verificar platform_fee_rules
  console.log('\n💰 Platform Fee Rules:')
  const { data: rules, error: errRules } = await supabaseQueryPublic('platform_fee_rules', 'id,platform_id,category,listing_type,commission_pct,fixed_fee,valid_from,valid_to')
  if (errRules) {
    console.log('  Erro:', errRules)
  } else {
    console.log(`  Total: ${rules.length} regra(s)`)
    
    // Agrupar por plataforma
    const porPlataforma = {}
    rules.forEach(r => {
      if (!porPlataforma[r.platform_id]) porPlataforma[r.platform_id] = []
      porPlataforma[r.platform_id].push(r)
    })
    
    for (const [platformId, regras] of Object.entries(porPlataforma)) {
      const platformName = platforms?.find(p => p.id === platformId)?.name || platformId
      console.log(`    ${platformName}: ${regras.length} regras`)
    }
  }
  
  // Verificar category_coverage_gaps
  console.log('\n⚠️  Category Coverage Gaps:')
  const { data: gaps, error: errGaps } = await supabaseQueryPublic('category_coverage_gaps', 'id,platform_id,category,detected_at,status')
  if (errGaps) {
    console.log('  Erro:', errGaps)
  } else {
    if (gaps.length === 0) {
      console.log('  Nenhuma lacuna detectada ✅')
    } else {
      console.log(`  Total: ${gaps.length} lacuna(s)`)
      gaps.forEach(g => {
        const platformName = platforms?.find(p => p.id === g.platform_id)?.name || g.platform_id
        console.log(`    - ${platformName} / ${g.category} (detectada em ${g.detected_at})`)
      })
    }
  }
  
  // Verificar users (pode ser restrito por RLS)
  console.log('\n👥 Users:')
  const { data: users, error: errUsers } = await supabaseQueryPublic('users', 'id,email,role,company_id')
  if (errUsers) {
    console.log('  Acesso restrito ou erro:', errUsers.message || errUsers)
    console.log('  💡 Para ver users, execute no SQL Editor:')
    console.log('     SELECT id, email, role, company_id, created_at FROM users;')
  } else {
    console.log(`  Total: ${users.length} usuário(s) visíveis`)
    users.forEach(u => {
      console.log(`    - ${u.email}: ${u.role}, company_id=${u.company_id || 'NULL'}`)
    })
  }
  
  // Verificar products (pode ser restrito por RLS)
  console.log('\n📦 Products:')
  const { data: products, error: errProducts } = await supabaseQueryPublic('products', 'id,sku,name,category,cost_price,company_id')
  if (errProducts) {
    console.log('  Acesso restrito ou erro:', errProducts.message || errProducts)
    console.log('  💡 Para ver products, execute no SQL Editor:')
    console.log('     SELECT id, sku, name, category, cost_price, company_id FROM products;')
  } else {
    console.log(`  Total: ${products.length} produto(s) visíveis`)
    if (products.length > 0) {
      products.slice(0, 5).forEach(p => {
        console.log(`    - ${p.sku}: ${p.name} (R$ ${p.cost_price}, company_id=${p.company_id})`)
      })
      if (products.length > 5) {
        console.log(`    ... e mais ${products.length - 5} produtos`)
      }
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('INSTRUÇÕES PARA TESTE DE ISOLAMENTO:')
  console.log('='.repeat(60))
  console.log(`
1. Acesse https://supabase.com/dashboard/project/nyclgbtrkkegcdkrxaeq/sql
  
2. Crie duas empresas de teste:
   INSERT INTO companies (name) VALUES ('Empresa Teste A') RETURNING id;
   INSERT INTO companies (name) VALUES ('Empresa Teste B') RETURNING id;
   
3. Crie dois usuários via Authentication → Users → Add user
   - user.a@teste.com / SenhaForte123!
   - user.b@teste.com / SenhaForte123!
   
4. Associe cada usuário a uma empresa:
   UPDATE users SET company_id = '<ID-EMPRESA-A>' WHERE email = 'user.a@teste.com';
   UPDATE users SET company_id = '<ID-EMPRESA-B>' WHERE email = 'user.b@teste.com';
   
5. Teste isolamento:
   -- Logado como usuário A (via dashboard ou app), insira:
   INSERT INTO products (company_id, sku, name, cost_price) 
   VALUES ('<ID-EMPRESA-A>', 'TESTE-A-01', 'Produto A', 10.00);
   
   -- Logado como usuário B, consulte:
   SELECT * FROM products;
   -- Deve retornar VAZIO. Se retornar o produto da Empresa A, RLS está quebrado.
  `)
  
  console.log('='.repeat(60))
}

verificarEstado()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err)
    process.exit(1)
  })
