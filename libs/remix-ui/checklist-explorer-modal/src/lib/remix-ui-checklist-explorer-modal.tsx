import React, { useState, useEffect, useRef } from 'react'
import './remix-ui-checklist-explorer-modal.css'

interface ChecklistItem {
  id: string
  question: string
  description: string
  remediation?: string
  references?: string[]
  tags?: string[]
}

interface ChecklistCategory {
  category: string
  description: string
  data: (ChecklistItem | ChecklistCategory)[]
}

interface ChecklistData {
  category: string
  description: string
  data: (ChecklistItem | ChecklistCategory)[]
}

export interface RemixUiChecklistExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  plugin?: any // Plugin instance to access fileManager
}

// Helper function to check if an item is a ChecklistItem or ChecklistCategory
const isChecklistItem = (item: ChecklistItem | ChecklistCategory): item is ChecklistItem => {
  return 'id' in item && 'question' in item
}

// Helper function to recursively collect all checklist items from nested categories
const collectChecklistItems = (data: (ChecklistItem | ChecklistCategory)[]): ChecklistItem[] => {
  const items: ChecklistItem[] = []

  for (const item of data) {
    if (isChecklistItem(item)) {
      items.push(item)
    } else {
      // It's a category, recurse into its data
      items.push(...collectChecklistItems(item.data))
    }
  }

  return items
}

// Helper function to count total items in a category (including nested)
const countTotalItems = (data: (ChecklistItem | ChecklistCategory)[]): number => {
  return collectChecklistItems(data).length
}

const categoryFileToken = (categoryPath: string): string => {
  const raw = categoryPath.includes('::') ? categoryPath.split('::').join('-') : categoryPath
  return raw
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

const enumerateSelectablePaths = (data: ChecklistData[]): string[] => {
  const paths: string[] = []
  for (const mainCat of data) {
    const hasDirectItems = mainCat.data.some(isChecklistItem)
    const subCats = mainCat.data.filter(item => !isChecklistItem(item)) as ChecklistCategory[]
    if (hasDirectItems && subCats.length === 0) {
      paths.push(mainCat.category)
    } else {
      subCats.forEach(sub => paths.push(`${mainCat.category}::${sub.category}`))
    }
  }
  return paths
}

const computeLoadedCategories = (data: ChecklistData[], files: string[]): Set<string> => {
  const haystack = files.join('\n')
  const loaded = new Set<string>()
  enumerateSelectablePaths(data).forEach(path => {
    const token = categoryFileToken(path)
    if (token && haystack.includes(token)) loaded.add(path)
  })
  return loaded
}

export function RemixUiChecklistExplorerModal(props: RemixUiChecklistExplorerModalProps) {
  const { isOpen, onClose, plugin } = props
  const [checklistData, setChecklistData] = useState<ChecklistData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(new Set())
  const [wizardStep, setWizardStep] = useState<'browse' | 'confirm' | 'saving'>('browse')
  const [saving, setSaving] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchChecklistData = async (): Promise<ChecklistData[]> => {
    const response = await fetch('https://raw.githubusercontent.com/Cyfrin/audit-checklist/main/checklist.json')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid checklist format - expected array')
    }
    return data
  }

  const ensureDirectoryExists = async (dirPath: string) => {
    try {
      await plugin.call('fileManager', 'mkdir', dirPath)
    } catch (e) {
      // Directory may already exist
    }
  }

  const fetchExistingChecklistFiles = async (): Promise<string[]> => {
    if (!plugin) return []
    try {
      const entries = await plugin.call('fileManager', 'readdir', 'audits')
      return Object.keys(entries || {})
    } catch (e) {
      return []
    }
  }

  useEffect(() => {
    if (isOpen) {
      setWizardStep('browse')
      setSelectedCategories(new Set())
      setExpandedCategories(new Set())
      setLoadedCategories(new Set())
      setSearchTerm('')
      setError(null)

      const load = async () => {
        setLoading(true)
        try {
          const data = await fetchChecklistData()
          setChecklistData(data)
          // Highlight categories whose checklist is already saved in the workspace
          const existingFiles = await fetchExistingChecklistFiles()
          setLoadedCategories(computeLoadedCategories(data, existingFiles))
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load checklist')
        } finally {
          setLoading(false)
        }
      }
      load()
    }
  }, [isOpen])

  const toggleCategory = (categoryPath: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      next.has(categoryPath) ? next.delete(categoryPath) : next.add(categoryPath)
      return next
    })
  }

  const toggleExpanded = (categoryPath: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(categoryPath) ? next.delete(categoryPath) : next.add(categoryPath)
      return next
    })
  }

  // Helper function to recursively generate markdown with nested categories
  const generateNestedMarkdown = (data: (ChecklistItem | ChecklistCategory)[], basePath: string = '', level: number = 4): string => {
    let markdown = ''
    let itemIndex = 1

    for (const item of data) {
      if (isChecklistItem(item)) {
        // It's a checklist item
        const headerLevel = '#'.repeat(level)
        markdown += `${headerLevel} ${itemIndex}. ${item.question}\n\n`
        markdown += `**Category Path:** ${basePath}\n\n`
        markdown += `**Description:** ${item.description}\n\n`

        if (item.remediation) {
          markdown += `**Remediation:** ${item.remediation}\n\n`
        }

        if (item.references && item.references.length > 0) {
          markdown += `**References:**\n`
          item.references.forEach(ref => {
            markdown += `- [${ref}](${ref})\n`
          })
          markdown += `\n`
        }

        markdown += `- [ ] **Status:** Not Checked\n`
        markdown += `- [ ] **Finding:** N/A\n`
        markdown += `- [ ] **Notes:** \n\n`
        markdown += `---\n\n`
        itemIndex++
      } else {
        // It's a nested category
        const headerLevel = '#'.repeat(level)
        const newPath = basePath ? `${basePath} → ${item.category}` : item.category

        markdown += `${headerLevel} ${item.category}\n\n`
        if (item.description) {
          markdown += `${item.description}\n\n`
        }

        // Recursively process nested data
        markdown += generateNestedMarkdown(item.data, newPath, level + 1)
      }
    }

    return markdown
  }

  const generateChecklistMarkdown = (): string => {
    const selectedData = checklistData.filter(mainCat => {
      // Check if main category is selected (for direct checklist items)
      if (selectedCategories.has(mainCat.category)) {
        return true
      }
      // Check if any sub-categories are selected (for nested structure)
      return mainCat.data.some(item => {
        if (!isChecklistItem(item)) {
          return selectedCategories.has(`${mainCat.category}::${item.category}`)
        }
        return false
      })
    })

    let markdown = `# Audit Checklist\n\n`
    markdown += `Generated on: ${new Date().toISOString().split('T')[0]}\n\n`

    selectedData.forEach(mainCategory => {
      markdown += `## ${mainCategory.category}\n\n`
      if (mainCategory.description) {
        markdown += `${mainCategory.description}\n\n`
      }

      // Check if this main category was directly selected (contains direct checklist items)
      if (selectedCategories.has(mainCategory.category)) {
        // Generate markdown for direct items in this category
        markdown += generateNestedMarkdown(mainCategory.data, mainCategory.category)
      } else {
        // Handle sub-categories
        const selectedSubCategories = mainCategory.data.filter(item =>
          !isChecklistItem(item) && selectedCategories.has(`${mainCategory.category}::${item.category}`)
        ) as ChecklistCategory[]

        selectedSubCategories.forEach(subCategory => {
          markdown += `### ${subCategory.category}\n\n`
          if (subCategory.description) {
            markdown += `${subCategory.description}\n\n`
          }

          // Generate nested markdown with proper category paths
          markdown += generateNestedMarkdown(subCategory.data, `${mainCategory.category} → ${subCategory.category}`)
        })
      }
    })

    return markdown
  }

  const handleLoadSelected = () => {
    if (selectedCategories.size === 0) return
    setWizardStep('confirm')
  }

  const handleConfirmChecklist = async () => {
    if (!plugin) {
      setError('Plugin not available')
      return
    }
    setWizardStep('saving')
    setSaving(true)

    try {
      await ensureDirectoryExists('audits')

      const timestamp = new Date().toISOString().split('T')[0]

      // Generate filename with selected categories
      const selectedCategoryNames = Array.from(selectedCategories).map(categoryPath => {
        if (categoryPath.includes('::')) {
          const [mainCat, subCat] = categoryPath.split('::')
          return `${mainCat}-${subCat}`
        } else {
          return categoryPath
        }
      }).join('_')

      // Clean the category names for filename (remove special characters and spaces)
      const cleanCategoryNames = selectedCategoryNames
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 100) // Limit length

      const filename = `audit-checklist-${cleanCategoryNames}-${timestamp}.md`
      const checklistContent = generateChecklistMarkdown()

      await plugin.call('fileManager', 'writeFile', `audits/${filename}`, checklistContent)

      // Post a summary into the chat so completion isn't silent — especially for
      // /load-audit-checklist, where nothing else is sent after the modal closes.
      try {
        let itemCount = 0
        const categoryLabels: string[] = []
        Array.from(selectedCategories).forEach(path => {
          if (path.includes('::')) {
            const [mainName, subName] = path.split('::')
            const main = checklistData.find(c => c.category === mainName)
            const sub = main?.data.find(i => !isChecklistItem(i) && (i as ChecklistCategory).category === subName) as ChecklistCategory | undefined
            if (sub) { itemCount += countTotalItems(sub.data); categoryLabels.push(subName) }
          } else {
            const main = checklistData.find(c => c.category === path)
            if (main) { itemCount += countTotalItems(main.data); categoryLabels.push(path) }
          }
        })
        const labelText = categoryLabels.join(', ') || 'selected'
        const summary = `Created \`audits/${filename}\` with the ${labelText} checklist (${itemCount} item${itemCount === 1 ? '' : 's'})`
        await plugin.call('remixaiassistant', 'handleExternalMessage', summary)
      } catch (e) {
        // assistant panel unavailable — the file is still created
      }

      setSaving(false)
      handleOk()
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Failed to save checklist')
      setWizardStep('confirm')
    }
  }

  const handleOk = () => {
    onClose()
    Promise.resolve(plugin?.call('remixaiassistant', 'submitChatInput')).catch(() => {
      // assistant plugin unavailable — modal is already closed
    })
  }

  const handleBack = () => {
    setWizardStep('browse')
    setError(null)
  }

  // Helper function to recursively filter data based on search term
  const filterData = (data: (ChecklistItem | ChecklistCategory)[], searchTerm: string): (ChecklistItem | ChecklistCategory)[] => {
    const filtered: (ChecklistItem | ChecklistCategory)[] = []

    for (const item of data) {
      if (isChecklistItem(item)) {
        // It's a checklist item, check if it matches the search
        if (
          item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          filtered.push(item)
        }
      } else {
        // It's a category, check if it or its children match
        const filteredSubData = filterData(item.data, searchTerm)
        if (
          filteredSubData.length > 0 ||
          item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          filtered.push({
            ...item,
            data: filteredSubData
          })
        }
      }
    }

    return filtered
  }

  const filteredData = checklistData.map(mainCat => {
    const filteredSubData = filterData(mainCat.data, searchTerm)
    return {
      ...mainCat,
      data: filteredSubData
    }
  }).filter(mainCat =>
    mainCat.data.length > 0 ||
    mainCat.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mainCat.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!isOpen) return null

  const showBackButton = wizardStep !== 'browse'
  const isProcessing = saving

  return (
    <section data-id="checklist-explorer-modal-react" className="checklist-explorer-modal-background" style={{ zIndex: 8888 }}>
      <div ref={containerRef} className="checklist-explorer-modal-container border bg-dark p-2">

        {/* Header */}
        <div className="checklist-explorer-modal-close-container bg-dark mb-3 w-100 d-flex flex-row justify-content-between align-items-center">
          {showBackButton ? (
            <div className="d-flex flex-row gap-2 w-100 mx-1 my-2">
              <button className="btn" onClick={handleBack} disabled={isProcessing}>
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              {wizardStep === 'confirm' && (
                <span className="text-light align-self-center">
                  Generate Audit Checklist
                </span>
              )}
              {wizardStep === 'saving' && (
                <span className="text-light align-self-center">Saving Checklist...</span>
              )}
            </div>
          ) : (
            <div className="d-flex flex-row gap-2 w-100 mx-3 my-2">
              <input
                type="text"
                data-id="checklist-explorer-search-input"
                placeholder="Search audit items..."
                className="form-control checklist-explorer-modal-search-input ps-5 fw-light"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
          <button
            data-id="checklist-explorer-modal-close-button"
            className="checklist-explorer-modal-close-button"
            onClick={onClose}
            disabled={isProcessing}
          >
            <i className="fa-solid fa-xmark text-dark"></i>
          </button>
        </div>

        <div className="checklist-explorer-container">

          {/* Step 1: Browse and select categories */}
          {wizardStep === 'browse' && (
            <>
              {loading && (
                <div className="d-flex justify-content-center align-items-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading checklist...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="alert alert-danger" role="alert">
                  <i className="fa-solid fa-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}

              {!loading && !error && (
                <>
                  <div className="category-title">Audit Checklist Categories</div>
                  <div className="category-description mb-4">
                    Select audit categories to include in your checklist
                    {loadedCategories.size > 0 && (
                      <span className="ms-2 badge bg-success text-white small">
                        <i className="fa-solid fa-check me-1"></i>
                        already in workspace
                      </span>
                    )}
                  </div>

                  {filteredData.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="fa-solid fa-search fa-3x mb-3"></i>
                      <div>No checklist items found matching your search</div>
                    </div>
                  ) : (
                    <div className="checklist-categories">
                      {filteredData.map((mainCategory) => {
                        // Check if this category has direct checklist items (no sub-categories)
                        const hasDirectItems = mainCategory.data.some(item => isChecklistItem(item))
                        const subCategories = mainCategory.data.filter(item => !isChecklistItem(item)) as ChecklistCategory[]

                        if (hasDirectItems && subCategories.length === 0) {
                          // Category with only direct checklist items
                          const isSelected = selectedCategories.has(mainCategory.category)
                          const isExpanded = expandedCategories.has(mainCategory.category)
                          const isLoaded = loadedCategories.has(mainCategory.category)

                          return (
                            <div key={mainCategory.category} className="main-category mb-3">
                              <div
                                className={`main-category-header p-3 d-flex justify-content-between align-items-center cursor-pointer bg-secondary text-light`}
                                onClick={() => toggleCategory(mainCategory.category)}
                                style={isSelected ? { boxShadow: 'inset 4px 0 0 var(--bs-primary)' } : isLoaded ? { boxShadow: 'inset 4px 0 0 var(--bs-success)' } : {}}
                              >
                                <div className="flex-grow-1">
                                  <div className="d-flex align-items-center mb-1">
                                    <h5 className="mb-0">{mainCategory.category}</h5>
                                    {isSelected && (
                                      <i className="fa-solid fa-circle-check ms-2"></i>
                                    )}
                                    {isLoaded && (
                                      <span className="badge bg-success text-white small ms-2" title="A checklist for this category is already saved in audits/">
                                        <i className="fa-solid fa-check me-1"></i>
                                        in workspace
                                      </span>
                                    )}
                                  </div>
                                  <p className="mb-0 small opacity-75">{mainCategory.description}</p>
                                  <span className="badge bg-light text-dark small mt-1">{countTotalItems(mainCategory.data)} items</span>
                                </div>
                                <button
                                  className="btn btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleExpanded(mainCategory.category)
                                  }}
                                >
                                  <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-white`}></i>
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="category-items p-3 bg-light border border-secondary rounded-bottom">
                                  {collectChecklistItems(mainCategory.data).slice(0, 3).map((item) => (
                                    <div key={item.id} className="item-preview mb-2 p-2 bg-white border rounded">
                                      <div className="fw-bold small text-dark">{item.question}</div>
                                      <div className="text-muted small">{item.description.substring(0, 100)}...</div>
                                    </div>
                                  ))}
                                  {countTotalItems(mainCategory.data) > 3 && (
                                    <div className="text-muted small">...and {countTotalItems(mainCategory.data) - 3} more items</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        } else {
                          // Category with sub-categories (original structure)
                          return (
                            <div key={mainCategory.category} className="main-category mb-3">
                              <div className="main-category-header bg-secondary text-light p-2 rounded-top">
                                <h5 className="mb-1">{mainCategory.category}</h5>
                                <p className="mb-0 small text-light-emphasis">{mainCategory.description}</p>
                              </div>

                              <div className="sub-categories border border-secondary rounded-bottom">
                                {subCategories.map((subCategory) => {
                                  const categoryPath = `${mainCategory.category}::${subCategory.category}`
                                  const isSelected = selectedCategories.has(categoryPath)
                                  const isExpanded = expandedCategories.has(categoryPath)
                                  const isLoaded = loadedCategories.has(categoryPath)

                                  return (
                                    <div key={categoryPath} className="sub-category border-bottom">
                                      <div
                                        className={`sub-category-header p-3 d-flex justify-content-between align-items-center cursor-pointer bg-light`}
                                        onClick={() => toggleCategory(categoryPath)}
                                        style={isSelected ? { backgroundColor: 'rgba(var(--bs-primary-rgb), 0.12)', boxShadow: 'inset 4px 0 0 var(--bs-primary)' } : isLoaded ? { boxShadow: 'inset 4px 0 0 var(--bs-success)' } : {}}
                                      >
                                        <div className="flex-grow-1">
                                          <div className="d-flex align-items-center mb-1">
                                            <h6 className="text-dark mb-0">{subCategory.category}</h6>
                                            {isSelected && (
                                              <i className="fa-solid fa-circle-check text-primary ms-2"></i>
                                            )}
                                            {isLoaded && (
                                              <span className="badge bg-success text-white small ms-2" title="A checklist for this category is already saved in audits/">
                                                <i className="fa-solid fa-check me-1"></i>
                                                in workspace
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-muted mb-0 small">{subCategory.description}</p>
                                          <span className="badge bg-primary text-white small">{countTotalItems(subCategory.data)} items</span>
                                        </div>
                                        <button
                                          className="btn btn-sm"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleExpanded(categoryPath)
                                          }}
                                        >
                                          <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                                        </button>
                                      </div>

                                      {isExpanded && (
                                        <div className="category-items p-3 bg-light-subtle">
                                          {collectChecklistItems(subCategory.data).slice(0, 3).map((item) => (
                                            <div key={item.id} className="item-preview mb-2 p-2 bg-white border rounded">
                                              <div className="fw-bold small text-dark">{item.question}</div>
                                              <div className="text-muted small">{item.description.substring(0, 100)}...</div>
                                            </div>
                                          ))}
                                          {countTotalItems(subCategory.data) > 3 && (
                                            <div className="text-muted small">...and {countTotalItems(subCategory.data) - 3} more items</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Step 2: Confirm */}
          {wizardStep === 'confirm' && (
            <div className="confirm-checklist-step">
              <div className="d-flex flex-column align-items-center py-5">
                <i className="fa-solid fa-list-check fa-3x mb-4 text-primary"></i>
                <h3 className="mb-3">Generate Audit Checklist</h3>
                <div className="checklist-details mb-4 text-center">
                  <div className="mb-3">
                    <strong className="text-light">{selectedCategories.size} categories selected</strong>
                  </div>
                  <div className="selected-categories">
                    {Array.from(selectedCategories).map(categoryPath => {
                      if (categoryPath.includes('::')) {
                        const [mainCat, subCat] = categoryPath.split('::')
                        return (
                          <div key={categoryPath} className="mb-1">
                            <span className="text-muted small">{mainCat} →</span>
                            <span className="text-light ms-1">{subCat}</span>
                          </div>
                        )
                      } else {
                        return (
                          <div key={categoryPath} className="mb-1">
                            <span className="text-light">{categoryPath}</span>
                          </div>
                        )
                      }
                    })}
                  </div>
                </div>
                <div className="alert alert-info mb-4">
                  <i className="fa-solid fa-info-circle me-2"></i>
                  {(() => {
                    const timestamp = new Date().toISOString().split('T')[0]
                    const selectedCategoryNames = Array.from(selectedCategories).map(categoryPath => {
                      if (categoryPath.includes('::')) {
                        const [mainCat, subCat] = categoryPath.split('::')
                        return `${mainCat}-${subCat}`
                      } else {
                        return categoryPath
                      }
                    }).join('_')
                    const cleanCategoryNames = selectedCategoryNames
                      .replace(/[^a-zA-Z0-9_-]/g, '_')
                      .replace(/_+/g, '_')
                      .replace(/^_|_$/g, '')
                      .substring(0, 50) // Shorter for display
                    return (
                      <span>This will create a markdown checklist in <code>audits/audit-checklist-{cleanCategoryNames}-{timestamp}.md</code></span>
                    )
                  })()}
                </div>
                {error && (
                  <div className="alert alert-danger mb-3" role="alert">
                    <i className="fa-solid fa-exclamation-triangle me-2"></i>
                    <pre className="mb-0 small">{error}</pre>
                  </div>
                )}
                <div className="d-flex gap-3">
                  <button className="btn btn-secondary" onClick={handleBack}>Cancel</button>
                  <button
                    data-id="checklist-explorer-confirm-generate"
                    className="btn btn-primary"
                    onClick={handleConfirmChecklist}
                  >
                    Generate Checklist
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Saving */}
          {wizardStep === 'saving' && (
            <div className="saving-checklist-step">
              <div className="d-flex flex-column align-items-center py-5">
                <div className="spinner-border text-primary fa-3x mb-4" role="status">
                  <span className="visually-hidden">Saving checklist...</span>
                </div>
                <h3 className="text-light mb-3">Generating Checklist</h3>
                <p className="text-muted">
                  Creating your audit checklist file...
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Fixed footer */}
        {wizardStep === 'browse' && !loading && !error && selectedCategories.size > 0 && (
          <div className="checklist-explorer-modal-footer">
            <button
              data-id="checklist-explorer-generate-selected"
              className="btn btn-primary"
              onClick={handleLoadSelected}
            >
              <i className="fa-solid fa-list-check me-2"></i>
              Generate Checklist ({selectedCategories.size} categories)
            </button>
          </div>
        )}
      </div>
    </section>
  )
}