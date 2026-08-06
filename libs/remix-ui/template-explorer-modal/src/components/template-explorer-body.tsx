import React, { useContext } from 'react'
import { TemplateExplorer } from './template-explorer'
import { TopCards } from './topCards'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { NotFound } from './notfound'
import { MatomoCategories } from '@remix-api'

export function TemplateExplorerBody() {
  const { selectedTag, allTags, handleTagClick, clearFilter, dedupedTemplates, state, trackMatomoEvent } = useContext(TemplateExplorerContext)

  const filterTheseTags = tag => tag !== 'Circom' && tag !== 'All' && tag !== 'Noir' && tag !== 'AI'

  return (
    <section className="tem-body">
      <TopCards />
      {(dedupedTemplates.length === 0) ? <NotFound /> : (
        <div className="tem-template-section">
          <div className="d-flex flex-column gap-1">
            <label data-id="templateExplorerBodyLabel" className="tem-list-title">
              {state.manageCategory === 'Template' ? 'Workspace Templates' : 'File Templates'}
            </label>
            {state.manageCategory === 'Files' && (
              <label htmlFor="templateExplorerBodySubheading" className="tem-list-subtitle">
                Choose a template to add files to your current workspace
              </label>
            )}
          </div>
          {state.manageCategory === 'Template' && (
            <div data-id="templateExplorerBodyTags" className="d-flex flex-wrap align-items-center gap-2">
              <span
                className={`template-tag ${!selectedTag ? 'template-tag--active' : ''}`}
                onClick={() => {
                  clearFilter()
                  trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'clearFilterButtonClick', isClick: true })
                }}
              >
                All
              </span>
              {allTags?.filter(filterTheseTags)?.reverse()?.map((tag: any) => (
                <span
                  key={tag as any}
                  className={`template-tag ${selectedTag === tag ? 'template-tag--active' : ''}`}
                  onClick={() => {
                    handleTagClick(tag as any)
                    trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'tagSelected', name: tag, isClick: true })
                  }}
                >
                  {tag as any}
                </span>
              ))}
            </div>
          )}
          <TemplateExplorer />
        </div>
      )}
    </section>
  )
}
