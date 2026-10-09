/**
 * Shapes of the Cyfrin catalogue as the modal consumes it.
 *
 * The path/filename derivations that pair with these (categoryFileToken,
 * deriveContractName, computeLoadedCategories) live in
 * `@remix/remix-ai-core/audit-taxonomy`, next to the selectable-path enumeration
 * they must stay in sync with.
 */

export interface ChecklistItem {
  id: string
  question: string
  description: string
  remediation?: string
  references?: string[]
  tags?: string[]
}

export interface ChecklistCategory {
  category: string
  description: string
  data: (ChecklistItem | ChecklistCategory)[]
}

export interface ChecklistData {
  category: string
  description: string
  data: (ChecklistItem | ChecklistCategory)[]
}

export const isChecklistItem = (item: ChecklistItem | ChecklistCategory): item is ChecklistItem => {
  return 'id' in item && 'question' in item
}

/** Every leaf item under `data`, recursing through nested categories. */
export const collectChecklistItems = (data: (ChecklistItem | ChecklistCategory)[]): ChecklistItem[] => {
  const items: ChecklistItem[] = []
  for (const item of data) {
    if (isChecklistItem(item)) items.push(item)
    else items.push(...collectChecklistItems(item.data))
  }
  return items
}

export const countTotalItems = (data: (ChecklistItem | ChecklistCategory)[]): number => {
  return collectChecklistItems(data).length
}
