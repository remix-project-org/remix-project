import isElectron from 'is-electron'
import React, { useContext } from 'react'
import { ContractWizardAction, TemplateCategory, TemplateExplorerWizardAction, TemplateItem } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { MatomoCategories, trackMatomoEvent } from '@remix-api'

export function TemplateExplorer() {

  const { metadata, dedupedTemplates, plugin, dispatch, facade, templateCategoryStrategy, theme, trackMatomoEvent } = useContext(TemplateExplorerContext)

  return (

    <div data-id="template-explorer-template-container" className={theme?.name === 'Dark' ? 'template-explorer-container overflow-y-auto text-white-force' : 'template-explorer-container overflow-y-auto text-dark'}>

      {dedupedTemplates?.map((template: TemplateCategory, templateIndex) => (
        <div key={template.name} className="template-category mb-4" data-id={`template-category-${template.name}`}>
          <h4 className={theme?.name === 'Dark' ? 'category-title mb-3 text-white-force' : 'category-title mb-3 text-dark'}>
            {template.name.toUpperCase()}
          </h4>

          {template.description && (
            <p className="category-description mb-2 text-secondary">
              {template.description}
            </p>
          )}

          <div className="template-items-container d-flex flex-wrap gap-3 mb-4">
            {template.items.map((item: TemplateItem, itemIndex) => {
              // Add template metadata
              item.templateType = metadata[item.value]

              // Skip disabled items
              if (item.templateType && item.templateType.disabled === true) return null

              // Skip desktop incompatible items in electron
              if (item.templateType && item.templateType.desktopCompatible === false && isElectron()) return null

              return (
                <div
                  data-id={`template-card-${item.value}-${itemIndex}`}
                  key={`${templateIndex}-${itemIndex}`}
                  className={theme?.name === 'Dark'? "template-card bg-light border-0 px-3 py-3" : "template-card bg-dark border-0 px-3 py-3"}
                  onClick={async () => {
                    if (item.value === 'cookbook') {
                      await plugin.call('manager', 'activatePlugin', 'cookbookdev')
                      await plugin.call('sidePanel', 'focus', 'cookbookdev')
                      trackMatomoEvent({ category: 'templateExplorerModal', action: 'selectWorkspaceTemplate', value: item.value, isClick: true })
                      facade.closeWizard()
                      return
                    }
                    dispatch({ type: TemplateExplorerWizardAction.SET_WORKSPACE_TEMPLATE_TYPE, payload: item.value })
                    facade.switchWizardScreen(dispatch, item, template, templateCategoryStrategy)
                    trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'selectWorkspaceTemplate', name: item.value, isClick: true })
                    if (item.displayName.toLowerCase().includes('ai')) {
                      await plugin.call('sidePanel', 'pinView', await plugin.call('remixaiassistant', 'getProfile'))
                    }
                  }}
                >
                  <div className="card-header mb-1">
                    <h6 className={`card-title mb-1 ${theme?.name === 'Dark' ? 'text-white-dimmed' : 'card-title-light'}`}>
                      {item.displayName || item.value}
                    </h6>

                  </div>
                  <div className="card-body d-flex flex-column justify-content-between overflow-y-auto">
                    {item.description && (
                      <p className={theme?.name === 'Dark' ? 'card-description mb-1 text-dark text-wrap text-truncate overflow-hidden' : 'card-description mb-1 text-dark text-wrap text-truncate overflow-hidden'}>
                        {item.description}
                      </p>
                    )}

                    {item.opts && Object.keys(item.opts).length > 0 && (
                      <div className="options-badges d-flex flex-wrap">
                        {item.opts.upgradeable && (
                          <span className="badge bg-success badge-uups">
                      UUPS
                          </span>
                        )}
                        {item.opts.mintable && (
                          <span className="badge bg-warning text-dark badge-mint">
                      Mint
                          </span>
                        )}
                        {item.opts.burnable && (
                          <span className="badge bg-danger badge-burn">
                      Burn
                          </span>
                        )}
                        {item.opts.pausable && (
                          <span className="badge bg-secondary badge-pause">
                      Pause
                          </span>
                        )}
                      </div>
                    )}

                    {item.tagList && item.tagList.length > 0 && (
                      <div className="tag-list d-flex flex-wrap gap-1 align-items-end">
                        {item.tagList.map((tag, tagIndex) => (
                          <span key={tagIndex} className="badge template-tag-badge">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
