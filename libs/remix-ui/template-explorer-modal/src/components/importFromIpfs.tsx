import React, { useContext, useEffect, useState } from 'react'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import { MatomoCategories } from '@remix-api'

export function ImportFromIpfs(props: any) {
  const { facade, state, trackMatomoEvent } = useContext(TemplateExplorerContext)
  const [externalResourceName, setExternalResourceName] = useState('')
  const [externalResourceNameError, setExternalResourceNameError] = useState('')

  return (
    <section className="tem-form-body">
      <div className="d-flex flex-column gap-2">
        <p className="tem-form-desc">
          {state.manageCategory === 'Files' && state.wizardStep === 'importFiles' ? (
            <>Enter the IPFS link you would like to import.<br />(e.g. ipfs://QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH)</>
          ) : state.manageCategory === 'Files' && state.wizardStep === 'importHttps' ? (
            <>Enter the HTTPS link you would like to import. (e.g. https://example.com/contract.sol)</>
          ) : null}
        </p>
        <input data-id="importFromExternalSource-input" type="text" className="form-control tem-form-input" value={externalResourceName} onChange={async (e) => {
          setExternalResourceName(e.target.value)
        }} />
        {externalResourceNameError.length > 0 && externalResourceName.length > 0 && (
          <span className="text-danger fw-light" style={{ fontSize: '12px' }}>{externalResourceNameError}</span>
        )}
      </div>
      <button className="btn btn-primary" data-id="validateWorkspaceButton" disabled={externalResourceName.length < 7} onClick={async () => {
        if (!externalResourceName.startsWith('ipfs://') && !externalResourceName.startsWith('https://')) {
          setExternalResourceNameError('Your URL must start with the proper protocol prefix of either ipfs:// or https://')
          return
        }
        const type = externalResourceName.startsWith('ipfs://') ? 'ipfs' : 'https'
        await facade.processLoadingExternalUrls(externalResourceName, type)
        facade.closeWizard()
        trackMatomoEvent({ category: MatomoCategories.TEMPLATE_EXPLORER_MODAL, action: 'importFiles', name: externalResourceName.startsWith('ipf') ? 'importFromIpfs' : 'importFromHttps', isClick: true })
      }}>
        Import
      </button>
    </section>
  )
}
