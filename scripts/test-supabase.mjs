import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

// Cargar variables de entorno
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Faltan las variables de entorno de Supabase')
  console.error('Por favor, crea un archivo .env con:')
  console.error('VITE_SUPABASE_URL=tu_url')
  console.error('VITE_SUPABASE_ANON_KEY=tu_key')
  process.exit(1)
}

// Validar formato de URL
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
  console.error('❌ Error: La URL de Supabase debe comenzar con http:// o https://')
  console.error(`URL proporcionada: ${supabaseUrl}`)
  process.exit(1)
}

console.log('📋 Configuración:')
console.log(`   URL: ${supabaseUrl}`)
console.log(`   Key: ${supabaseAnonKey.substring(0, 20)}...`)

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
})

async function testConnection() {
  console.log('\n🔍 Probando conexión a Supabase...')
  
  // Primero, probar una conexión básica a la URL
  try {
    console.log('   Probando conectividad básica...')
    const healthCheckUrl = `${supabaseUrl}/rest/v1/`
    const response = await fetch(healthCheckUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    })
    console.log(`   ✅ Conectividad OK (Status: ${response.status})`)
  } catch (healthErr) {
    console.error('   ⚠️  Error en conectividad básica:', healthErr.message)
    if (healthErr.cause) {
      console.error('      Causa:', healthErr.cause.message || healthErr.cause)
    }
  }
  
  // Ahora probar la consulta a la tabla
  try {
    console.log('   Probando consulta a la tabla lung_pairs...')
    const { data, error } = await supabase
      .from('lung_pairs')
      .select('name')
      .limit(3)
    
    if (error) {
      console.error('❌ Error en la consulta:', error)
      if (error.message) {
        console.error('   Mensaje:', error.message)
      }
      if (error.details) {
        console.error('   Detalles:', error.details)
      }
      if (error.hint) {
        console.error('   Sugerencia:', error.hint)
      }
      if (error.code) {
        console.error('   Código:', error.code)
      }
    } else {
      console.log('✅ Conexión exitosa!')
      console.log('📊 Primeros 3 pares:', JSON.stringify(data, null, 2))
    }
  } catch (err) {
    console.error('❌ Error de conexión:', err.message)
    if (err.cause) {
      console.error('   Causa:', err.cause.message || err.cause)
    }
    console.error('\n💡 Posibles soluciones:')
    console.error('   1. Verifica que la URL de Supabase sea correcta')
    console.error('   2. Verifica tu conexión a internet')
    console.error('   3. Verifica que el proyecto de Supabase esté activo')
    console.error('   4. Verifica si hay un firewall o proxy bloqueando la conexión')
  }
}

testConnection()

