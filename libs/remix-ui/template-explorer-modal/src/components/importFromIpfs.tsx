import React, { useContext, useEffect, useState } from 'react'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { MatomoCategories } from '@remix-api'

export function ImportFromIpfs(props: any) {
  const { facade, state, trackMatomoEvent, theme } = useContext(TemplateExplorerContext)
  const [externalResourceName, setExternalResourceName] = useState('')
  const [externalResourceNameError, setExternalResourceNameError] = useState('')

  return (
    <section className="d-flex flex-column gap-3 bg-light" style={{ height: '80%' }}>
      <div className="pt-3 d-flex flex-column text-dark mx-3 my-3">
        <label className={`form-label small mb-3 text-dark fs-6 ${theme?.name === 'Dark' ? 'text-white-force' : 'text-dark'}`}>{state.manageCategory === 'Files' && state.wizardStep === 'importFiles' ? (<span>Enter the IPFS link you would like to import.<br /> (e.g. ipfs://QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH)</span>) : state.manageCategory === 'Files' && state.wizardStep === 'importHttps' ? (<span>Enter the HTTPS link you would like to import. (e.g. https://example.com/contract.sol)</span>) : null}</label>
        <input data-id="importFromExternalSource-input" type="text" className="form-control form-control-lg" value={externalResourceName} onChange={async (e) => {
          setExternalResourceName(e.target.value)
        }} />
        {externalResourceNameError.length > 0 && externalResourceName.length > 0 ? <span className="text-danger fw-light mt-1 justify-content-start fs-6">{externalResourceNameError}</span> : null }
      </div>

      <button className="btn btn-primary btn-lg mx-3" data-id="validateWorkspaceButton" onClick={async () => {
        if (!externalResourceName.startsWith('ipfs://') && !externalResourceName.startsWith('https://')) {
          setExternalResourceNameError('Your URL must start with the proper protocol prefix of either ipfs:// or https://')
          return
        }
        const type = externalResourceName.startsWith('ipfs://') ? 'ipfs' : 'https'
        await facade.processLoadingExternalUrls(externalResourceName, type)
        facade.closeWizard()
        trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'importFiles', name: externalResourceName.startsWith('ipf') ? 'importFromIpfs' : 'importFromHttps', isClick: true })
      }}
      disabled={externalResourceName.length < 7}
      >
        Import
      </button>
    </section>
  )
}
