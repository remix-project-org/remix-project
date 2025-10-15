import { useContext, useEffect, useMemo, useState } from 'react'
import { trackMatomoEvent } from '@remix-api'
import { SearchableChainDropdown, ContractAddressInput } from '../components'
import { mergeChainSettingsWithDefaults, validConfiguration } from '../utils'
import type { LookupResponse, VerifierIdentifier } from '../types'
import { VERIFIERS } from '../types'
import { AppContext } from '../AppContext'
import { CustomTooltip } from '@remix-ui/helper'
import { useNavigate } from 'react-router-dom'
import { VerifyFormContext } from '../VerifyFormContext'
import { useSourcifySupported } from '../hooks/useSourcifySupported'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { FormattedMessage } from 'react-intl'

export const LookupView = () => {
  const { settings, clientInstance } = useContext(AppContext)
  const { selectedChain, setSelectedChain } = useContext(VerifyFormContext)
  const [contractAddress, setContractAddress] = useState('')
  const [contractAddressError, setContractAddressError] = useState('')
  const [loadingVerifiers, setLoadingVerifiers] = useState<Partial<Record<VerifierIdentifier, boolean>>>({})
  const [lookupResults, setLookupResult] = useState<Partial<Record<VerifierIdentifier, LookupResponse>>>({})
  const navigate = useNavigate()

  const chainSettings = useMemo(() => (selectedChain ? mergeChainSettingsWithDefaults(selectedChain.chainId.toString(), settings) : undefined), [selectedChain, settings])

  const sourcifySupported = useSourcifySupported(selectedChain, chainSettings)

  const noVerifierEnabled = VERIFIERS.every((verifierId) => !validConfiguration(chainSettings, verifierId) || (verifierId === 'Sourcify' && !sourcifySupported))
  const submitDisabled = !!contractAddressError || !contractAddress || !selectedChain || noVerifierEnabled || Object.values(loadingVerifiers).some((loading) => loading)

  // Reset results when chain or contract changes
  useEffect(() => {
    setLookupResult({})
    setLoadingVerifiers({})
  }, [selectedChain, contractAddress])

  const handleLookup = (e) => {
    if (Object.values(loadingVerifiers).some((loading) => loading)) {
      console.error('Lookup request already running')
      return
    }

    e.preventDefault()

    for (const verifierId of VERIFIERS) {
      if (!validConfiguration(chainSettings, verifierId) || (verifierId === 'Sourcify' && !sourcifySupported)) {
        continue
      }

      setLoadingVerifiers((prev) => ({ ...prev, [verifierId]: true }))
      clientInstance.lookup(verifierId, chainSettings, selectedChain.chainId.toString(), contractAddress)
        .then((result) => setLookupResult((prev) => ({ ...prev, [verifierId]: result })))
        .catch((err) =>
          setLookupResult((prev) => {
            console.error(err)
            return { ...prev, [verifierId]: { status: 'lookup failed' } }
          })
        )
        .finally(() => setLoadingVerifiers((prev) => ({ ...prev, [verifierId]: false })))
    }
  }

  const sendToMatomo = async (eventName: string) => {
    await trackMatomoEvent(clientInstance, { 
      category: 'contractVerification', 
      action: 'lookup', 
      name: eventName, 
      isClick: true 
    });
  }

  const handleOpenInRemix = async (lookupResponse: LookupResponse) => {
    try {
      await clientInstance.saveToRemix(lookupResponse)
      await sendToMatomo('openInRemix On: ' + selectedChain)
    } catch (err) {
      console.error(`Error while trying to open in Remix: ${err.message}`)
    }
  }

  return (
    <>
      <form onSubmit={handleLookup}>
        <SearchableChainDropdown label={<FormattedMessage id="contract-verification.searchableChainDropdownLabel" defaultMessage="Chain" />} id="network-dropdown" selectedChain={selectedChain} setSelectedChain={setSelectedChain} />
        <ContractAddressInput label={<FormattedMessage id="contract-verification.contractAddressInput" defaultMessage="Contract Address" />} id="contract-address" contractAddress={contractAddress} setContractAddress={setContractAddress} contractAddressError={contractAddressError} setContractAddressError={setContractAddressError} />
        <button type="submit" className="btn w-100 btn-primary" disabled={submitDisabled}>
          <FormattedMessage id="contract-verification.lookupButton" defaultMessage="Lookup" />
        </button>
      </form>
      <div className="pt-3">
        {chainSettings &&
          VERIFIERS.map((verifierId) => {
            if (!validConfiguration(chainSettings, verifierId)) {
              return (
                <div key={verifierId} className="pt-4">
                  <div>
                    <span className="fw-bold text-secondary">{verifierId}</span>{' '}
                    <CustomTooltip tooltipText="Configure the API in the settings">
                      <span className="text-secondary" style={{ textDecoration: 'underline dotted', cursor: 'pointer' }} onClick={() => navigate('/settings')}>
                        Enable?
                      </span>
                    </CustomTooltip>
                  </div>
                </div>
              )
            }

            if (verifierId === 'Sourcify' && !sourcifySupported) {
              return (
                <div key={verifierId} className="pt-4">
                  <div>
                    <span className="fw-bold text-secondary">{verifierId}</span>{' '}
                    <CustomTooltip tooltipText={`The configured Sourcify server (${chainSettings.verifiers['Sourcify'].apiUrl}) does not support chain ${selectedChain?.chainId}`}>
                      <span className="text-secondary w-auto" style={{ textDecoration: 'underline dotted', cursor: 'pointer' }} onClick={() => navigate('/settings')}>
                        Unsupported
                      </span>
                    </CustomTooltip>
                  </div>
                </div>
              )
            }

            return (
              <div key={verifierId} className="pt-4">
                <div className="d-flex align-items-center">
                  <span className="fw-bold">{verifierId}&nbsp;</span>
                  <span className="text-secondary d-inline-block text-truncate mw-100">{chainSettings.verifiers[verifierId].apiUrl}</span>
                </div>
                {!!loadingVerifiers[verifierId] && (
                  <div className="pt-2 d-flex justify-content-center">
                    <i className="fas fa-spinner fa-spin fa-2x"></i>
                  </div>
                )}
                {!loadingVerifiers[verifierId] && !!lookupResults[verifierId] && (
                  <div>
                    <div className="pt-2">
                      Status:{' '}
                      <span className="fw-bold" style={{ textTransform: 'capitalize' }}>
                        {lookupResults[verifierId].status}
                      </span>{' '}
                      {!!lookupResults[verifierId].lookupUrl && verifierId === 'Blockscout' ? <CopyToClipboard tip="Copy code URL" content={lookupResults[verifierId].lookupUrl} direction="top" /> : !!lookupResults[verifierId].lookupUrl && <a href={lookupResults[verifierId].lookupUrl} target="_blank" className="fa fas fa-arrow-up-right-from-square"></a>}
                    </div>
                    {!!lookupResults[verifierId].sourceFiles && lookupResults[verifierId].sourceFiles.length > 0 && (
                      <div className="pt-2 d-flex flex-row justify-content-center">
                        <button className="btn btn-secondary bg-transparent text-body" onClick={() => handleOpenInRemix(lookupResults[verifierId])}>
                          <i className="fas fa-download"></i> Open in Remix
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </>
  )
}
