function htmlEscape(value: unknown): string {
  const str = String(value ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getByPath(obj: Record<string, any>, path: string): unknown {
  const parts = path.split('.')
  let current: any = obj
  for (const part of parts) {
    if (current === null || current === undefined) return ''
    current = current[part]
  }
  return current ?? ''
}

/**
 * Supports:
 * - {{token}} for HTML-escaped interpolation
 * - {{{token}}} for raw interpolation
 */
export function renderTemplate(template: string, data: Record<string, any>): string {
  const withRaw = template.replace(/\{\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\}/g, (_, token) => {
    const value = getByPath(data, token)
    return String(value ?? '')
  })

  return withRaw.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, token) => {
    const value = getByPath(data, token)
    return htmlEscape(value)
  })
}

export function extractTemplateTokens(template: string): string[] {
  const tokens = new Set<string>()
  const regex = /\{\{\{?\s*([a-zA-Z0-9_.-]+)\s*\}?\}\}/g
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(template)) !== null) {
    tokens.add(match[1])
  }
  return Array.from(tokens).sort()
}
