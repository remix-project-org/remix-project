import { IntlShape } from 'react-intl'
import { ToolId } from '../verdict'

export function timeAgo (intl: IntlShape, at: number, now: number): string {
  const minutes = Math.round(Math.max(0, now - at) / 60000)
  if (minutes < 1) return intl.formatMessage({ id: 'preDeployChecks.justNow' })
  if (minutes < 60) return intl.formatMessage({ id: 'preDeployChecks.minutesAgo' }, { count: minutes })
  return intl.formatMessage({ id: 'preDeployChecks.hoursAgo' }, { count: Math.round(minutes / 60) })
}

export function toolName (intl: IntlShape, tool: ToolId): string {
  return intl.formatMessage({ id: `preDeployChecks.tool.${tool}` })
}

/** "Remix analyzer and Solhint", "Slither" */
export function toolList (intl: IntlShape, tools: ToolId[]): string {
  return intl.formatList(tools.map((tool) => toolName(intl, tool)), { type: 'conjunction' }) as string
}

export function splitPath (file: string): { name: string, folder: string } {
  const slash = file.lastIndexOf('/')
  return { name: file.substring(slash + 1), folder: slash > 0 ? file.substring(0, slash) : '' }
}
