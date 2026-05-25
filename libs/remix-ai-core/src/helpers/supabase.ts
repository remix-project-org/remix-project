import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Plugin } from '@remixproject/engine'

let supabaseClient: SupabaseClient | null = null

export async  function getSupabaseClient(plugin: Plugin): Promise<SupabaseClient> {
  if (!supabaseClient) {
    const url = await plugin.call('config' as any, 'getAppParameter' as any, 'settings/supabase-project-url')
    const key = await plugin.call('config' as any, 'getAppParameter' as any, 'settings/supabase-api-key')
    if (!url || !key) {
      throw new Error('Missing Supabase URL or Service Role Key. Please provide via environment variables or parameters.')
    }
    
    supabaseClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }
  
  return supabaseClient
}

export async function getSupabaseSchema(projectUrl: string, serviceRoleKey: string) {
  const res = await fetch(`${projectUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  const openApiSpec = await res.json()

  // Extract just the tables and their columns
  const tables = Object.entries(openApiSpec.definitions).map(([tableName, def]: any) => ({
    table: tableName,
    columns: Object.entries(def.properties).map(([colName, col]: any) => ({
      name: colName,
      type: col.type || col.format || 'unknown',
      description: col.description || '',
    })),
  }))

  return tables
}

export const formatSupabaseSchema = (tables: any[]): string => {
  if (!tables || tables.length === 0) return ''
  return tables.map(table => 
    `Table: ${table.table}\n` +
    table.columns.map((col: any) => `  - ${col.name} (${col.type}): ${col.description}`).join('\n')
  ).join('\n\n')
}