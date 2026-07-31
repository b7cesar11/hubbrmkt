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

async function checkState() {
  console.log('=== VERIFICANDO ESTADO DO BANCO ===\n')

  // Tentar login sem auth primeiro - apenas ler tabelas públicas
  console.log('1. Verificando platforms (deveria funcionar sem auth)...')
  const { data: platforms, error: errPlats } = await supabase
    .from('platforms')
    .select('*')

  if (errPlats) {
    console.log(`   ❌ Erro: ${JSON.stringify(errPlats, null, 2)}`)
  } else {
    console.log(`   ✅ Platforms: ${platforms.length} registros`)
    console.log('   ', platforms.map(p => p.name))
  }

  console.log('\n2. Verificando platform_fee_rules...')
  const { data: rules, error: errRules } = await supabase
    .from('platform_fee_rules')
    .select('*')

  if (errRules) {
    console.log(`   ❌ Erro: ${JSON.stringify(errRules, null, 2)}`)
  } else {
    console.log(`   ✅ Regras: ${rules.length} registros`)
  }

  console.log('\n3. Verificando companies...')
  const { data: companies, error: errComp } = await supabase
    .from('companies')
    .select('*')

  if (errComp) {
    console.log(`   ❌ Erro: ${JSON.stringify(errComp, null, 2)}`)
  } else {
    console.log(`   ✅ Companies: ${companies.length} registros`)
    companies.forEach(c => console.log(`      - ${c.name} (${c.id})`))
  }

  console.log('\n4. Verificando users (tabela pública)...')
  const { data: users, error: errUsers } = await supabase
    .from('users')
    .select('*')

  if (errUsers) {
    console.log(`   ❌ Erro: ${JSON.stringify(errUsers, null, 2)}`)
  } else {
    console.log(`   ✅ Users: ${users.length} registros`)
    users.forEach(u => console.log(`      - ${u.email} (company_id: ${u.company_id}, role: ${u.role})`))
  }

  console.log('\n=== FIM DA VERIFICAÇÃO ===')
}

checkState().catch(console.error)
