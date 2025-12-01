/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { TemplateCategory, TemplateExplorerContextType, TemplateExplorerWizardAction, TemplateItem } from '../types/template-explorer-types'
import { initialState, templateExplorerReducer } from '../reducers/template-explorer-reducer'
import { metadata, templatesRepository } from '../src/utils/helpers'
import { appActionTypes, AppContext } from '@remix-ui/app'
import { TemplateExplorerModalPlugin } from 'apps/remix-ide/src/app/plugins/template-explorer-modal'
import { RemixUiTemplateExplorerModal } from 'libs/remix-ui/template-explorer-modal/src/lib/remix-ui-template-explorer-modal'
import { TemplateExplorerModalFacade } from '../src/utils/workspaceUtils'
import { TemplateCategoryStrategy } from '../stategies/templateCategoryStrategy'
import { MatomoCategories, MatomoEvent, TemplateExplorerModalEvent } from '@remix-api'
import TrackingContext from '@remix-ide/tracking'

export const TemplateExplorerContext = createContext<TemplateExplorerContextType>({} as any)

export const TemplateExplorerProvider = (props: { plugin: TemplateExplorerModalPlugin, fileMode: boolean, ipfsMode: boolean, httpImportMode: boolean }) => {
  const [state, dispatch] = useReducer(templateExplorerReducer, initialState)
  const [theme, setTheme] = useState<any>(null)
  const appContext = useContext(AppContext)
  const { plugin, fileMode, ipfsMode, httpImportMode } = props
  const facade = new TemplateExplorerModalFacade(plugin, appContext, dispatch, state)
  const templateCategoryStrategy = new TemplateCategoryStrategy()
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = TemplateExplorerModalEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  useEffect(() => {
    const checkTheme = async () => {
      if (theme === null) {
        const currentTheme = await plugin.call('theme', 'currentTheme')
        setTheme(currentTheme)
      }
    }
    dispatch({ type: TemplateExplorerWizardAction.SET_TEMPLATE_REPOSITORY, payload: templatesRepository })
    dispatch({ type: TemplateExplorerWizardAction.SET_METADATA, payload: metadata })
    checkTheme()
  }, [])

  useEffect(() => {
    plugin.on('theme', 'themeChanged', (theme: any) => {
      setTheme(theme)
    })
  }, [state.wizardStep])

  useEffect(() => {
    const run = async () => {
      if (theme === null) {
        const currentTheme = await plugin.call('theme', 'currentTheme')
        setTheme(currentTheme)
      }
    }
    run()
  }, [])

  useEffect(() => {
    facade.setManageCategory(fileMode ? 'Files' : 'Template')
  }, [fileMode])

  useEffect(() => {
    facade.orchestrateImportFromExternalSource()
  }, [ipfsMode, httpImportMode])

  const generateUniqueWorkspaceName = async (name: string) => {
    try {
      const workspace = await plugin.call('filePanel', 'workspaceExists', name)
      if (!workspace) {
        return name
      } else {
        const uniqueName = await plugin.call('filePanel', 'getAvailableWorkspaceName', name) as string
        return uniqueName
      }
    } catch (error) {
      console.error(error)
    }
  }

  const setSearchTerm = (term: string) => {
    dispatch({ type: TemplateExplorerWizardAction.SET_SEARCH_TERM, payload: term })
    trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'search', name: term })
  }

  const allTags = useMemo((): string[] => {
    const tags: string[] = []

    if (state.templateRepository && Array.isArray(state.templateRepository)) {
      state.templateRepository.forEach((template: any) => {
        if (template && template.items && Array.isArray(template.items)) {
          template.items.forEach((item: any) => {
            if (item && item.tagList && Array.isArray(item.tagList)) {
              item.tagList.forEach((tag: string) => {
                if (typeof tag === 'string' && !tags.includes(tag)) {
                  tags.push(tag)
                }
              })
            }
          })
        }
      })
    }

    return tags.sort()
  }, [])

  const recentTemplates = useMemo((): TemplateItem[] => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RECENT_KEY) : null
      const list: string[] = raw ? JSON.parse(raw) : []
      const items: TemplateItem[] = []
      if (Array.isArray(state.templateRepository)) {
        list.forEach((val) => {
          for (const group of state.templateRepository as any[]) {
            if (group && Array.isArray(group.items)) {
              const found = group.items.find((it: any) => it && it.value === val)
              if (found) {
                items.push(found)
                break
              }
            }
          }
        })
      }
      //tag filter
      const filtered = state.selectedTag
        ? items.filter((it: any) => it && Array.isArray(it.tagList) && it.tagList.includes(state.selectedTag))
        : items
      return filtered
    } catch (e) {
      return []
    }
  }, [state.selectedTag, state.recentBump])

  const filteredTemplates = useMemo((): TemplateCategory[] => {
    const repo = (state.templateRepository as TemplateCategory[]) || []
    if (!Array.isArray(repo)) return []

    const searchTerm = (state.searchTerm || '').trim().toLowerCase()
    const selectedTag = state.selectedTag

    return repo
      .map((template: TemplateCategory) => ({
        ...template,
        items: (template.items || []).filter((item: TemplateItem) => {
          // Filter by search term - check multiple fields
          let matchesSearch = !searchTerm
          if (searchTerm) {
            // Check item fields
            const itemDisplayName = (item.displayName || '').toLowerCase()
            const itemValue = (item.value || '').toLowerCase()
            const itemDescription = (item.description || '').toLowerCase()
            const itemTags = (item.tagList || []).map(tag => tag.toLowerCase()).join(' ')

            // Check category fields
            const categoryName = (template.name || '').toLowerCase()
            const categoryDescription = (template.description || '').toLowerCase()

            // Search across all fields
            matchesSearch =
              itemDisplayName.includes(searchTerm) ||
              itemValue.includes(searchTerm) ||
              itemDescription.includes(searchTerm) ||
              itemTags.includes(searchTerm) ||
              categoryName.includes(searchTerm) ||
              categoryDescription.includes(searchTerm)
          }

          // Filter by selected tag
          const matchesTag = !selectedTag ||
            (item.tagList && item.tagList.includes(selectedTag))

          return matchesSearch && matchesTag
        })
      }))
      .filter((template: TemplateCategory) =>
        template && template.items && template.items.length > 0
      )
  }, [state.selectedTag, state.searchTerm, state.templateRepository])

  const fileModeOnlyCategories = useMemo(() => new Set(['GitHub Actions', 'Contract Verification', 'Solidity CREATE2', 'Generic ZKP']), [])

  const dedupedTemplates = useMemo((): TemplateCategory[] => {
    const recentSet = new Set<string>((recentTemplates || []).map((t: any) => t && t.value))
    const seen = new Set<string>()
    const makeUniqueItems = (items: any[]) => {
      const unique: any[] = []
      for (const it of items || []) {
        const val = it && it.value
        if (!val) continue
        if (recentSet.has(val)) continue
        if (seen.has(val)) continue
        seen.add(val)
        unique.push(it)
      }
      return unique
    }

    let processedTemplates = (filteredTemplates || []).map((group: any) => ({
      ...group,
      items: makeUniqueItems(group && group.items ? group.items : [])
    })).filter((g: any) => {
      // Keep categories that have items OR special functionality (like Cookbook)
      return g && (
        (g.items && g.items.length > 0) ||
        (g.name === 'Cookbook' && g.onClick) ||
        (g.hasOptions && g.name !== 'Cookbook')
      )
    })

    if (state.manageCategory === 'Template') {
      // Hide file-only categories when managing templates (workspace creation mode).
      processedTemplates = processedTemplates.filter((category: TemplateCategory) => !fileModeOnlyCategories.has(category?.name))
    } else if (state.manageCategory === 'Files') {
      // In file mode, only surface the file-only categories.
      processedTemplates = processedTemplates.filter((category: TemplateCategory) => fileModeOnlyCategories.has(category?.name))
    }

    // Find Cookbook from the original template repository
    const cookbookTemplate = (state.templateRepository as TemplateCategory[] || []).find(x => x.name === 'Cookbook')
    const searchTerm = (state.searchTerm || '').trim().toLowerCase()

    // Only add Cookbook if there's no search term or if the search term contains "cookbook"
    const shouldShowCookbook = state.manageCategory !== 'Files' && (!searchTerm || searchTerm.includes('cookbook'))

    // If Cookbook exists and should be shown and is not already in processedTemplates, add it as the second item
    if (cookbookTemplate && shouldShowCookbook && !processedTemplates.find(t => t.name === 'Cookbook')) {
      if (processedTemplates.length >= 1) {
        processedTemplates.splice(1, 0, cookbookTemplate)
      } else {
        processedTemplates.push(cookbookTemplate)
      }
    }

    return processedTemplates
  }, [filteredTemplates, recentTemplates, state.manageCategory, state.templateRepository, state.searchTerm, fileModeOnlyCategories])

  const handleTagClick = (tag: string) => {
    dispatch({ type: TemplateExplorerWizardAction.SET_SELECTED_TAG, payload: state.selectedTag === tag ? null : tag })
  }

  const clearFilter = () => {
    dispatch({ type: TemplateExplorerWizardAction.SET_SELECTED_TAG, payload: null })
  }

  const RECENT_KEY = 'remix.recentTemplates'

  const addRecentTemplate = (template: TemplateItem) => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RECENT_KEY) : null
      const list: string[] = raw ? JSON.parse(raw) : []
      const filtered = list.filter((v) => v !== template.value)
      filtered.unshift(template.value)
      const trimmed = filtered.slice(0, 4)
      if (typeof window !== 'undefined') window.localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed))
      dispatch({ type: TemplateExplorerWizardAction.SET_RECENT_BUMP, payload: state.recentBump + 1 })
    } catch (e) {

    }
  }

  const contextValue = { templateRepository: state.templateRepository, metadata: state.metadata, selectedTag: state.selectedTag, recentTemplates, filteredTemplates, dedupedTemplates, handleTagClick, clearFilter, addRecentTemplate, RECENT_KEY, allTags, plugin, setSearchTerm, dispatch, state, theme, facade, templateCategoryStrategy, generateUniqueWorkspaceName, trackMatomoEvent, fileMode, ipfsMode, httpImportMode }

  return (
    <TemplateExplorerContext.Provider value={contextValue}>
      <RemixUiTemplateExplorerModal
        appState={appContext.appState}
        dispatch={appContext.appStateDispatch}
      />
    </TemplateExplorerContext.Provider>
  )
}
