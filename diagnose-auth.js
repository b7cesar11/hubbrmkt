import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabase = createClient(
  'https://nyclgbtrkkegcdkrxaeq.supabase.co',
  'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD',
  {
    realtime: { transport: ws }
  }
)

async function diagnose() {
  console.log('=== DIAGNÓSTICO DE AUTH ===\n')
  
  // Testar signUp em vez de signIn
  const testEmail = `test-${Date.now()}@margemhub.dev`
  console.log(`1. Tentando criar usuário temporário: ${testEmail}`)
  
  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: 'Teste123!'
  })
  
  if (error) {
    console.log(`   ❌ signUp falhou:`, error)
    console.log(`   Status: ${error.status}`)
    console.log(`   Nome: ${error.name}`)
  } else {
    console.log(`   ✅ signUp funcionou!`)
    console.log(`   User ID: ${data.user?.id}`)
    console.log(`   Email confirmado: ${data.user?.email_confirmed_at ? 'sim' : 'não'}`)
    
    // Tentar fazer login imediatamente
    console.log('\n2. Tentando login com o usuário criado...')
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: 'Teste123!'
    })
    
    if (loginError) {
      console.log(`   ❌ login falhou:`, loginError)
    } else {
      console.log(`   ✅ login funcionou!`)
      console.log(`   Access token presente: ${!!loginData.session?.access_token}`)
      
      // Agora tentar ler products com usuário logado
      console.log('\n3. Tentando ler products com usuário autenticado...')
      const { data: prods, error: prodsError } = await supabase.from('products').select('*')
      if (prodsError) {
        console.log(`   Erro ao ler products: ${prodsError.message}`)
      } else {
        console.log(`   Products: ${prods.length} registros`)
      }
      
      // Ler platforms
      console.log('\n4. Tentando ler platforms com usuário autenticado...')
      const { data: plats, error: platsError } = await supabase.from('platforms').select('*')
      if (platsError) {
        console.log(`   Erro: ${platsError.message}`)
      } else {
        console.log(`   Platforms: ${plats.length} registros`)
      }
    }
  }
}

diagnose().catch(console.error)
