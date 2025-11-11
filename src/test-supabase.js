import { supabase } from './lib/supabase'

async function testConnection() {
  console.log('🔍 Probando conexión a Supabase...')
  
  const { data, error } = await supabase
    .from('lung_pairs')
    .select('name')
    .limit(3)
  
  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('✅ Conexión exitosa!')
    console.log('📊 Primeros 3 pares:', data)
  }
}

testConnection()