import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cargar variables de entorno desde .env si existe
try {
  const envContent = readFileSync('.env', 'utf-8')
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'))
  
  for (const line of envLines) {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  }
  console.log('✓ Variables de entorno cargadas desde .env')
} catch (error) {
  console.warn('⚠ No se encontró archivo .env')
}

// Configurar import.meta.env para que funcione con vite-node
if (!globalThis.import || !globalThis.import.meta) {
  globalThis.import = { meta: { env: {} } }
}

// Copiar variables de proceso a import.meta.env
if (process.env.VITE_SUPABASE_URL) {
  globalThis.import.meta.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL
}
if (process.env.VITE_SUPABASE_ANON_KEY) {
  globalThis.import.meta.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
}

// Verificar variables antes de importar
if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('❌ Error: Faltan las variables de entorno de Supabase')
  console.error('\nPor favor, crea un archivo .env en la raíz del proyecto con:')
  console.error('VITE_SUPABASE_URL=tu_url_de_supabase')
  console.error('VITE_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase')
  process.exit(1)
}

// Ahora importar y ejecutar el test
try {
  const require = createRequire(import.meta.url)
  
  // Ejecutar el test usando vite-node dinámicamente
  const { execSync } = require('child_process')
  const result = execSync('npx vite-node src/test-supabase.js', { 
    encoding: 'utf-8',
    env: process.env,
    stdio: 'inherit'
  })
} catch (error) {
  console.error('Error al ejecutar el test:', error.message)
  process.exit(1)
}


