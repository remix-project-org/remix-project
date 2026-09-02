import { z } from 'zod'
import { IMCPToolResult } from '../../../types/mcp'

export function sanitizeToolName(name: string | undefined): string | null {
  if (!name || typeof name !== 'string') return null
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+/, '')
    .slice(0, 64)
    .replace(/[_-]+$/, '')
  return cleaned.length > 0 ? cleaned : null
}

/**
 * Convert JSON Schema to Zod schema
 * @param schema - JSON Schema object
 * @returns Zod object schema
 */
function normalizeEnumValue(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Accept an argument name that differs from the declared one only in case or
 * separators — `file_path` for `filePath`, `FILEPATH`, `file-path`.
 *
 */
export function withTolerantKeys(objectSchema: z.ZodObject<any>): z.ZodType {
  const declared = Object.keys(objectSchema.shape ?? {})
  if (declared.length === 0) return objectSchema
  const canonicalOf = new Map(declared.map((key) => [normalizeEnumValue(key), key]))

  return z.preprocess((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const input = raw as Record<string, any>
    let renamed = false
    const out: Record<string, any> = {}
    for (const [key, value] of Object.entries(input)) {
      const canonical = canonicalOf.get(normalizeEnumValue(key))
      if (canonical && canonical !== key && !(canonical in input)) {
        out[canonical] = value
        renamed = true
      } else {
        out[key] = value
      }
    }
    return renamed ? out : input
  }, objectSchema)
}

function softEnum(values: string[], description?: string): z.ZodTypeAny {
  const canonical = new Map(values.map((v) => [normalizeEnumValue(v), v]))
  const allowed = `Allowed values: ${values.join(' | ')}.`
  const coerced = z.preprocess((raw) => {
    if (typeof raw !== 'string') return raw
    return canonical.get(normalizeEnumValue(raw)) ?? raw
  }, z.string())
  return coerced.describe(description ? `${description} ${allowed}` : allowed)
}

export function jsonSchemaToZod(schema: any): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {}

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
      let zodType: z.ZodTypeAny

      switch (prop.type) {
      case 'string':
        if (Array.isArray(prop.enum) && prop.enum.length > 0 && prop.enum.every((v: any) => typeof v === 'string')) {
          // describe() is applied inside softEnum — the allowed values have to
          // reach the model even when the schema carries no description.
          zodType = softEnum(prop.enum as string[], prop.description)
        } else {
          zodType = z.string()
          if (prop.description) zodType = zodType.describe(prop.description)
        }
        break
      case 'number':
        zodType = z.number()
        if (prop.description) zodType = zodType.describe(prop.description)
        break
      case 'boolean':
        zodType = z.boolean()
        if (prop.description) zodType = zodType.describe(prop.description)
        break
      case 'array':
        zodType = z.array(z.any())
        if (prop.description) zodType = zodType.describe(prop.description)
        break
      case 'object':
        zodType = z.record(z.string(), z.any())
        if (prop.description) zodType = zodType.describe(prop.description)
        break
      default:
        zodType = z.any()
      }

      // Make optional if not required
      if (!schema.required?.includes(key)) {
        zodType = zodType.optional()
      }

      shape[key] = zodType
    }
  }

  return z.object(shape)
}

export function mcpResultToString(result: IMCPToolResult): string {
  if (result.isError) {
    const errorText = result.content.find(c => c.type === 'text')?.text || 'Unknown error'
    return `Error: ${errorText}`
  }

  return result.content
    .map(c => {
      if (c.type === 'text') return c.text
      if (c.type === 'image') return `[Image: ${c.mimeType}]`
      if (c.type === 'resource') return `[Resource: ${c.mimeType}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}
