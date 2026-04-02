import React, { useContext, useEffect, useReducer } from 'react'
import { TemplateExplorer } from './template-explorer'
import { TopCards } from './topCards'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { NotFound } from './notfound'
import { MatomoCategories } from '@remix-api'

export function TemplateExplorerBody() {
  const { selectedTag, allTags, handleTagClick, clearFilter, dedupedTemplates, state, theme, trackMatomoEvent, fileMode } = useContext(TemplateExplorerContext)

  const filterTheseTags = tag => tag !== 'Circom' && tag !== 'All' && tag !== 'Noir' && tag !== 'AI'

  return (
    <section className="mx-4">
      <TopCards />
      {
        (dedupedTemplates.length === 0) ? <NotFound /> : (
          <div className={"body pt-2 mb-3"} style={{ height: `calc(88vh - ${fileMode ? 350 : 410}px)` }}>
            <>
              <div className="flex flex-col gap-1">
                <label
                  data-id="templateExplorerBodyLabel"
                  className={theme?.name === 'Dark' ? 'text-white-force fs-5' : 'text-dark fs-5'}
                >{state.manageCategory === 'Template' ? 'Workspace Templates' : 'File Templates'}</label>
                {state.manageCategory === 'Files' && <label htmlFor="templateExplorerBodySubheading" className={theme?.name === 'Dark' ? 'text-white-force fs-6 mb-3' : 'text-dark fs-6 mb-3'}>Choose a template to add files to your current workspace</label>}
              </div>
              <div className="">
                <div data-id="templateExplorerBodyTags" className="flex flex-wrap items-center gap-2">

                  {state.manageCategory === 'Template' ? allTags?.filter(filterTheseTags)?.reverse()?.map((tag: any) => (
                    <span
                      key={tag as any}
                      className={`template-tag badge rounded-full p-2 font-light ${selectedTag === tag ? 'badge rounded-full text-info p-2 font-light' : 'badge rounded-full text-bg-light p-2 font-light'}`}
                      onClick={() => {
                        handleTagClick(tag as any)
                        trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'tagSelected', name: tag, isClick: true })
                      }}
                    >
                      {tag as any}
                    </span>
                  )) : null}
                  {selectedTag && (
                    <small>
                      <span
                        className="p-0 ml-2 text-warning font-light"
                        onClick={() => {
                          clearFilter()
                          trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'clearFilterButtonClick', isClick: true })
                        }}
                      >
                Clear filter
                      </span>
                    </small>
                  )}
                </div>
              </div>
              <TemplateExplorer />
            </>
          </div>
        )}
    </section>
  )
}
