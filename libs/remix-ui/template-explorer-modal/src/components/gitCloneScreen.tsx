/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useState } from 'react'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { cloneRepository } from 'libs/remix-ui/workspace/src/lib/actions'

export function GitCloneScreen() {
  const { state, dispatch, facade, theme } = useContext(TemplateExplorerContext)
  const [url, setUrl] = useState('')

  const handleClone = () => {
    dispatch({ type: TemplateExplorerWizardAction.SET_GIT_URL, payload: url })
    cloneRepository(url)
    facade.closeWizard()
  }
  const type = url !== '' && (url.startsWith('https://') || url.startsWith('git@')) ? true : false
  return (
    <>
      <section className="d-flex flex-column gap-3 bg-light h-75">
        <div className={`pt-3 mx-3 form-label fs-6 ${theme?.name === 'Dark' ? 'text-white-force' : 'text-dark'}`}>
          Paste a valid git repository URL and press 'Clone' to start the process.
        </div>
        <div className="pt-1 mx-3 d-flex flex-row align-items-center text-dark">
          <input data-id="git-clone-screen-url-input" type="text" className="form-control form-control-lg" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="pt-3 mx-3">
          <button className="btn btn-primary btn-lg w-100" onClick={handleClone} disabled={!type}>
            Clone
          </button>
        </div>
      </section>
    </>
  )
}
