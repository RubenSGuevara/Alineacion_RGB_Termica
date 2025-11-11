import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Función helper para construir URLs públicas
export const getPublicUrl = (bucket, path) => {
  if (!path) return null
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}