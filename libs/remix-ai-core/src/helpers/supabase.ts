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