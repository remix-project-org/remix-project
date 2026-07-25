/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useState } from 'react'
import { TemplateExplorerWizardAction } from '../../types/template-explorer-types'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { cloneRepository } from 'libs/remix-ui/workspace/src/lib/actions'

export function GitCloneScreen() {
  const { state, dispatch, facade } = useContext(TemplateExplorerContext)
  const [url, setUrl] = useState('')

  const handleClone = () => {
    dispatch({ type: TemplateExplorerWizardAction.SET_GIT_URL, payload: url })
    cloneRepository(url)
    facade.closeWizard()
  }
  const type = url !== '' && (url.startsWith('https://') || url.startsWith('git@')) ? true : false
  return (
    <section className="tem-form-body">
      <div className="d-flex flex-column gap-2">
        <label className="tem-form-label">Repository URL</label>
        <input
          data-id="git-clone-screen-url-input"
          type="text"
          className="form-control tem-form-input"
          value={url}
          placeholder="https://github.com/username/repository"
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="tem-form-desc">Supported: <code>https://</code> and <code>git@</code> URLs</p>
      </div>
      <button
        data-id="git-clone-screen-clone-btn"
        className="btn btn-primary align-self-end"
        onClick={handleClone}
        disabled={!type}
      >
        Clone
      </button>
    </section>
  )
}
