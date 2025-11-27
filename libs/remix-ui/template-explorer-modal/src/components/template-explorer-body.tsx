import React, { useContext, useEffect, useReducer } from 'react'
import { TemplateExplorer } from './template-explorer'
import { TopCards } from './topCards'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { NotFound } from './notfound'

export function TemplateExplorerBody() {
  const { selectedTag, allTags, handleTagClick, clearFilter, dedupedTemplates, state } = useContext(TemplateExplorerContext)

  const filterTheseTags = tag => tag !== 'Circom' && tag !== 'All' && tag !== 'Noir' && tag !== 'AI'

  return (
    <section className="mx-4">
      <TopCards />
      {
        (dedupedTemplates.length === 0) ? <NotFound /> : (
          <div className="body overflow-y-hidden pt-3">
            <>
              <label className="text-dark fs-5">Workspace Templates</label>
              <div className="">
                <div className="d-flex flex-wrap align-items-center gap-2">

                  {allTags?.filter(filterTheseTags)?.reverse()?.map((tag: any) => (
                    <span
                      key={tag as any}
                      className={`template-tag badge rounded-pill p-2 fw-light ${selectedTag === tag ? 'badge rounded-pill text-info p-2 fw-light' : 'badge rounded-pill text-bg-light p-2 fw-light'}`}
                      onClick={() => handleTagClick(tag as any)}
                    >
                      {tag as any}
                    </span>
                  ))}
                  {selectedTag && (
                    <small>
                      <span
                        className="p-0 ms-2 text-warning fw-light"
                        onClick={clearFilter}
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
