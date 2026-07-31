import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const supabaseUrl = 'https://nyclgbtrkkegcdkrxaeq.supabase.co';
const supabaseKey = 'sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD';

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: ws
  }
});

async function testIsolation() {
  console.log('=== TESTE DE ISOLAMENTO MULTI-TENANT ===\n');
  
  // ============================================
  // PASSO 1: Login como Empresa A e inserir produto
  // ============================================
  console.log('1. Login como Empresa A...');
  const { data: authA, error: loginErrorA } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  });
  
  if (loginErrorA) {
    console.log(`   ❌ Erro no login A: ${loginErrorA.message}`);
    return;
  }
  console.log(`   ✅ Login A OK, user ID: ${authA.user.id}`);
  
  // Inserir produto da Empresa A
  console.log('\n2. Inserindo produto da Empresa A...');
  const { data: productA, error: insertError } = await supabase.from('products').insert({
    company_id: '6c7cf6d2-7497-46b7-802b-f54815922fa2',
    sku: 'TESTE-A-01',
    name: 'Produto Teste A',
    cost_price: 10.00
  }).select();
  
  if (insertError) {
    console.log(`   ❌ Erro ao inserir produto: ${insertError.message}`);
  } else {
    console.log(`   ✅ Produto inserido: ${JSON.stringify(productA[0])}`);
  }
  
  // ============================================
  // PASSO 2: Logout e login como Empresa B
  // ============================================
  console.log('\n3. Logout e login como Empresa B...');
  await supabase.auth.signOut();
  
  const { data: authB, error: loginErrorB } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-b@margemhub.dev',
    password: 'SenhaForte123!'
  });
  
  if (loginErrorB) {
    console.log(`   ❌ Erro no login B: ${loginErrorB.message}`);
    return;
  }
  console.log(`   ✅ Login B OK, user ID: ${authB.user.id}`);
  
  // ============================================
  // PASSO 3: Tentar ler produtos (deve vir vazio)
  // ============================================
  console.log('\n4. Tentando ler produtos como Empresa B...');
  const { data: productsB, error: selectError } = await supabase.from('products').select('*');
  
  if (selectError) {
    console.log(`   ❌ Erro ao selecionar: ${selectError.message}`);
  } else {
    console.log(`   📦 Produtos encontrados: ${productsB.length}`);
    if (productsB.length === 0) {
      console.log('   ✅ ISOLAMENTO FUNCIONANDO - Empresa B não vê produtos da Empresa A');
    } else {
      console.log('   🔴 CRÍTICO: ISOLAMENTO QUEBRADO - Empresa B viu produtos da Empresa A!');
      console.log(`   Dados vazados: ${JSON.stringify(productsB, null, 2)}`);
    }
  }
  
  // ============================================
  // PASSO 4: Verificar se platforms é visível
  // ============================================
  console.log('\n5. Verificando se platforms é visível (deve ser 5)...');
  const { data: platforms } = await supabase.from('platforms').select('*');
  console.log(`   📋 Plataformas encontradas: ${platforms?.length || 0}`);
  if (platforms && platforms.length === 5) {
    console.log('   ✅ Platforms visível corretamente');
  } else {
    console.log('   ⚠️ Platforms não visível como esperado');
  }
  
  // ============================================
  // PASSO 5: Verificar se platform_fee_rules é visível
  // ============================================
  console.log('\n6. Verificando se platform_fee_rules é visível...');
  const { data: rules } = await supabase.from('platform_fee_rules').select('*');
  console.log(`   📋 Regras encontradas: ${rules?.length || 0}`);
  if (rules && rules.length > 0) {
    console.log('   ✅ platform_fee_rules visível corretamente');
  } else {
    console.log('   ⚠️ platform_fee_rules não visível como esperado');
  }
  
  // ============================================
  // PASSO 6: Login como Empresa A e verificar seu produto
  // ============================================
  console.log('\n7. Logout e login como Empresa A para verificar seu produto...');
  await supabase.auth.signOut();
  
  const { data: authA2 } = await supabase.auth.signInWithPassword({
    email: 'teste-empresa-a@margemhub.dev',
    password: 'SenhaForte123!'
  });
  
  const { data: productsA } = await supabase.from('products').select('*');
  console.log(`   📦 Produtos da Empresa A: ${productsA?.length || 0}`);
  if (productsA && productsA.length > 0) {
    console.log('   ✅ Empresa A vê seus próprios produtos');
    console.log(`   Primeiro produto: ${productsA[0].name} (SKU: ${productsA[0].sku})`);
  }
  
  console.log('\n=== FIM DO TESTE ===');
}

testIsolation().catch(console.error);
