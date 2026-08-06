import isElectron from 'is-electron'
import React, { useContext } from 'react'
import { ContractWizardAction, TemplateCategory, TemplateExplorerWizardAction, TemplateItem } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { MatomoCategories, trackMatomoEvent } from '@remix-api'

export function TemplateExplorer() {

  const { metadata, dedupedTemplates, plugin, dispatch, facade, templateCategoryStrategy, trackMatomoEvent } = useContext(TemplateExplorerContext)

  return (

    <div data-id="template-explorer-template-container" className="tem-template-list">

      {dedupedTemplates?.map((template: TemplateCategory, templateIndex) => (
        <div key={template.name} className="tem-template-category" data-id={`template-category-${template.name}`}>
          <p className="ht-section-title">
            {template.name.toUpperCase()}
          </p>

          {template.description && (
            <p className="category-description">
              {template.description}
            </p>
          )}

          <div className="template-items-container">
            {template.items.map((item: TemplateItem, itemIndex) => {
              item.templateType = metadata[item.value]

              if (item.templateType && item.templateType.disabled === true) return null
              if (item.templateType && item.templateType.desktopCompatible === false && isElectron()) return null

              const hasFooter = (item.opts && Object.keys(item.opts).length > 0) || (item.tagList && item.tagList.length > 0)

              return (
                <div
                  data-id={`template-card-${item.value}-${itemIndex}`}
                  key={`${templateIndex}-${itemIndex}`}
                  className="tem-card"
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
                  <strong className="tem-card-title">{item.displayName || item.value}</strong>
                  {item.description && (
                    <p className="tem-card-desc">{item.description}</p>
                  )}
                  {hasFooter && (
                    <div className="tem-card-footer">
                      {item.opts && Object.keys(item.opts).length > 0 && (
                        <>
                          {item.opts.upgradeable && <span className="tem-card-badge tem-card-badge-success">UUPS</span>}
                          {item.opts.mintable && <span className="tem-card-badge tem-card-badge-warning">Mint</span>}
                          {item.opts.burnable && <span className="tem-card-badge tem-card-badge-danger">Burn</span>}
                          {item.opts.pausable && <span className="tem-card-badge tem-card-badge-muted">Pause</span>}
                        </>
                      )}
                      {item.tagList && item.tagList.length > 0 && item.tagList.map((tag, tagIndex) => (
                        <span key={tagIndex} className="tem-card-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
