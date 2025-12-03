import { useContext, useEffect, useMemo, useState } from 'react'
import { trackMatomoEvent } from '@remix-api'

import { AppContext } from '../AppContext'
import { SearchableChainDropdown, ContractDropdown, ContractAddressInput } from '../components'
import type { VerifierIdentifier, SubmittedContract, VerificationReceipt, VerifierInfo, VerificationResponse } from '../types'
import { VERIFIERS } from '../types'
import { mergeChainSettingsWithDefaults, validConfiguration } from '../utils'
import { Form, useNavigate } from 'react-router-dom'
import { ConstructorArguments } from '../components/ConstructorArguments'
import { CustomTooltip } from '@remix-ui/helper'
import { AbstractVerifier, getVerifier } from '../Verifiers'
import { VerifyFormContext } from '../VerifyFormContext'
import { useSourcifySupported } from '../hooks/useSourcifySupported'
import { FormattedMessage } from 'react-intl'

export const VerifyView = () => {
  const { compilationOutput, setSubmittedContracts, settings, clientInstance } = useContext(AppContext)
  const { selectedChain, setSelectedChain, contractAddress, setContractAddress, contractAddressError, setContractAddressError, selectedContract, setSelectedContract, proxyAddress, setProxyAddress, proxyAddressError, setProxyAddressError, abiEncodedConstructorArgs, setAbiEncodedConstructorArgs, abiEncodingError, setAbiEncodingError } = useContext(VerifyFormContext)
  const [enabledVerifiers, setEnabledVerifiers] = useState<Partial<Record<VerifierIdentifier, boolean>>>({})
  const [hasProxy, setHasProxy] = useState(!!proxyAddress)
  const navigate = useNavigate()

  const chainSettings = useMemo(() => (selectedChain ? mergeChainSettingsWithDefaults(selectedChain.chainId.toString(), settings) : undefined), [selectedChain, settings])

  const sourcifySupported = useSourcifySupported(selectedChain, chainSettings)

  const noVerifierEnabled = VERIFIERS.every((verifierId) => !validConfiguration(chainSettings, verifierId) || (verifierId === 'Sourcify' && !sourcifySupported)) || Object.values(enabledVerifiers).every((enabled) => !enabled)
  const submitDisabled = !!contractAddressError || !contractAddress || !selectedChain || !selectedContract || (hasProxy && !!proxyAddressError) || (hasProxy && !proxyAddress) || noVerifierEnabled || (enabledVerifiers['Etherscan'] && !abiEncodedConstructorArgs && !!abiEncodingError)

  // Enable all verifiers with valid configuration
  useEffect(() => {
    const changedEnabledVerifiers = {}
    for (const verifierId of VERIFIERS) {
      if (validConfiguration(chainSettings, verifierId) && (verifierId !== 'Sourcify' || sourcifySupported)) {
        changedEnabledVerifiers[verifierId] = true
      }
    }
    setEnabledVerifiers(changedEnabledVerifiers)
  }, [selectedChain, sourcifySupported])

  const handleVerifierCheckboxClick = (verifierId: VerifierIdentifier, checked: boolean) => {
    setEnabledVerifiers({ ...enabledVerifiers, [verifierId]: checked })
  }

  const sendToMatomo = async (eventName: string) => {
    await trackMatomoEvent(clientInstance, { 
      category: 'contractVerification', 
      action: 'verify', 
      name: eventName, 
      isClick: true 
    });
  }

  const handleVerify = async (e) => {
    e.preventDefault()

    const { triggerFilePath, filePath, contractName } = selectedContract
    const compilerAbstract = compilationOutput[triggerFilePath]
    if (!compilerAbstract) {
      throw new Error(`Error: Compilation output not found for ${triggerFilePath}`)
    }

    const date = new Date()
    const contractId = selectedChain?.chainId + '-' + contractAddress + '-' + date.toUTCString()
    const receipts: VerificationReceipt[] = []
    for (const [verifierId, enabled] of Object.entries(enabledVerifiers)) {
      if (!enabled) {
        continue
      }

      const verifierInfo: VerifierInfo = {
        apiUrl: chainSettings.verifiers[verifierId].apiUrl,
        name: verifierId as VerifierIdentifier,
      }
      receipts.push({ verifierInfo, status: 'pending', contractId, isProxyReceipt: false, failedChecks: 0 })
      await sendToMatomo(`verifyWith${verifierId} On: ${selectedChain?.chainId} IsProxy: ${!!(hasProxy && proxyAddress)}`)
    }

    const newSubmittedContract: SubmittedContract = {
      id: contractId,
      address: contractAddress,
      chainId: selectedChain?.chainId.toString(),
      filePath,
      contractName,
      date: date.toUTCString(),
      receipts,
    }
    if (abiEncodedConstructorArgs) {
      newSubmittedContract.abiEncodedConstructorArgs = abiEncodedConstructorArgs
    }

    const proxyReceipts: VerificationReceipt[] = []
    if (hasProxy) {
      for (const [verifierId, enabled] of Object.entries(enabledVerifiers)) {
        if (!enabled) {
          continue
        }

        const verifierSettings = chainSettings.verifiers[verifierId]
        const verifierInfo: VerifierInfo = {
          apiUrl: verifierSettings.apiUrl,
          name: verifierId as VerifierIdentifier,
        }

        let verifier: AbstractVerifier
        try {
          verifier = getVerifier(verifierId as VerifierIdentifier, verifierSettings)
        } catch (e) {
          // User settings might be invalid
          proxyReceipts.push({ verifierInfo, status: 'failed', contractId, isProxyReceipt: true, message: e.message, failedChecks: 0 })
          continue
        }

        if (!verifier.verifyProxy) {
          continue
        }

        proxyReceipts.push({ verifierInfo, status: 'awaiting implementation verification', contractId, isProxyReceipt: true, failedChecks: 0 })
      }

      newSubmittedContract.proxyAddress = proxyAddress
      newSubmittedContract.proxyReceipts = proxyReceipts
    }

    setSubmittedContracts((prev) => ({ ...prev, [newSubmittedContract.id]: newSubmittedContract }))

    // Reset form
    setContractAddress('')
    setAbiEncodedConstructorArgs('')
    setSelectedContract(undefined)
    setProxyAddress('')

    // Take user to receipt view
    navigate('/receipts')

    const verify = async (receipt: VerificationReceipt) => {
      if (receipt.status === 'failed') {
        return // failed already when creating
      }

      const { verifierInfo } = receipt

      if (receipt.status === 'awaiting implementation verification') {
        const implementationReceipt = newSubmittedContract.receipts.find((r) => r.verifierInfo.name === verifierInfo.name)
        if (implementationReceipt.status === 'pending') {
          setTimeout(() => verify(receipt), 1000)
          return
        }
      }

      const verifierSettings = chainSettings.verifiers[verifierInfo.name]
      try {
        const verifier = getVerifier(verifierInfo.name, verifierSettings)
        let response: VerificationResponse
        if (receipt.isProxyReceipt) {
          response = await verifier.verifyProxy(newSubmittedContract)
        } else {
          response = await verifier.verify(newSubmittedContract, compilerAbstract)
        }
        const { status, message, receiptId, lookupUrl, receiptLookupUrl } = response
        receipt.status = status
        receipt.message = message
        if (lookupUrl) {
          receipt.lookupUrl = lookupUrl
        }
        if (receiptId) {
          receipt.receiptId = receiptId
        }
        if (receiptLookupUrl) {
          receipt.receiptLookupUrl = receiptLookupUrl
        }
      } catch (e) {
        const err = e as Error
        receipt.status = 'failed'
        receipt.message = err.message
      }

      // Update the UI
      setSubmittedContracts((prev) => ({ ...prev, [newSubmittedContract.id]: newSubmittedContract }))
    }

    // Verify for each verifier. forEach does not wait for await and each promise will execute in parallel
    receipts.forEach(verify)
    proxyReceipts.forEach(verify)
  }

  return (
    <form onSubmit={handleVerify}>
      <SearchableChainDropdown
        label={<FormattedMessage id="contract-verification.searchableChainDropdown" defaultMessage={"Chain"} />}
        id="network-dropdown"
        selectedChain={selectedChain}
        setSelectedChain={setSelectedChain}
      />
      <ContractAddressInput
        label={<FormattedMessage id="contract-verification.contractAddressInput" defaultMessage={"Contract Address"}/>}
        id="contract-address"
        contractAddress={contractAddress}
        setContractAddress={setContractAddress}
        contractAddressError={contractAddressError}
        setContractAddressError={setContractAddressError}
      />
      <CustomTooltip tooltipText="Please compile and select the solidity contract you need to verify.">
        <div>
          <ContractDropdown label="Contract Name" id="contract-dropdown-1" selectedContract={selectedContract} setSelectedContract={setSelectedContract} />
        </div>
      </CustomTooltip>
      {selectedContract && <ConstructorArguments
        abiEncodedConstructorArgs={abiEncodedConstructorArgs}
        setAbiEncodedConstructorArgs={setAbiEncodedConstructorArgs}
        selectedContract={selectedContract}
        abiEncodingError={abiEncodingError}
        setAbiEncodingError={setAbiEncodingError}
      />}
      <div className="pt-1">
        <div className="d-flex align-items-center form-check">
          <input id="has-proxy" className="form-check-input" type="checkbox" checked={!!hasProxy} onChange={(e) => setHasProxy(e.target.checked)} />
          <label htmlFor="has-proxy" className="ms-1 form-check-label" style={{ paddingTop: '2px' }}>
            <FormattedMessage id="contract-verification.proxyInputLabel" defaultMessage={'The deployed contract is behind a proxy'} />
          </label>
        </div>
        {hasProxy && <ContractAddressInput
          label={<FormattedMessage id="contract-verification.proxyContractAddressInput" defaultMessage={'Proxy Address'} />}
          id="proxy-address"
          contractAddress={proxyAddress}
          setContractAddress={setProxyAddress}
          contractAddressError={proxyAddressError}
          setContractAddressError={setProxyAddressError}
        />}
      </div>

      <div className="pt-3">
        Verify on:
        {VERIFIERS.map((verifierId) => {
          const disabledVerifier = !chainSettings || !validConfiguration(chainSettings, verifierId) || (verifierId === 'Sourcify' && !sourcifySupported)

          return (
            <div key={verifierId} className="pt-2">
              <div className="d-flex align-items-center form-check">
                <input
                  className="form-check-input mb-1"
                  type="checkbox"
                  id={`verifier-${verifierId}`}
                  checked={!!enabledVerifiers[verifierId]}
                  onChange={(e) => handleVerifierCheckboxClick(verifierId, e.target.checked)}
                  disabled={disabledVerifier}
                />
                <label
                  htmlFor={`verifier-${verifierId}`}
                  className={`ms-1 form-check-label large  fw-bold${!disabledVerifier ? '' : ' text-secondary'}`}
                  style={{ fontSize: '1rem' }}
                >
                  {verifierId}
                </label>
              </div>
              <div className="d-flex flex-column align-items-start ps-4">
                {!chainSettings ? (
                  ''
                ) : !validConfiguration(chainSettings, verifierId) ? (
                  <CustomTooltip tooltipText="Configure the API in the settings">
                    <span className="text-secondary w-auto" style={{ textDecoration: 'underline dotted', cursor: 'pointer' }} onClick={() => navigate('/settings')}>
                      Enable?
                    </span>
                  </CustomTooltip>
                ) : verifierId === 'Sourcify' && !sourcifySupported ? (
                  <CustomTooltip tooltipText={`The configured Sourcify server (${chainSettings.verifiers['Sourcify'].apiUrl}) does not support chain ${selectedChain?.chainId}`}>
                    <span className="text-secondary w-auto" style={{ textDecoration: 'underline dotted', cursor: 'pointer' }} onClick={() => navigate('/settings')}>
                      Unsupported
                    </span>
                  </CustomTooltip>
                ) : (
                  <span className="text-secondary d-inline-block text-truncate mw-100">{chainSettings.verifiers[verifierId].apiUrl}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <CustomTooltip tooltipText={submitDisabled ? (
        (!!contractAddressError || !contractAddress) ? <FormattedMessage id="contract-verification.contractAddressError" defaultMessage="Please provide a valid contract address." /> :
          !selectedChain ? <FormattedMessage id="contract-verification.chainError" defaultMessage="Please select the chain." /> :
            !selectedContract ? <FormattedMessage id="contract-verification.selectedContractError" defaultMessage="Please select the contract." /> :
              enabledVerifiers['Etherscan'] && !abiEncodedConstructorArgs && !!abiEncodingError ? <FormattedMessage id="contract-verification.constructorArgumentsError" defaultMessage="Must provide constructor arguments if verifying on Etherscan" /> :
                ((hasProxy && !!proxyAddressError) || (hasProxy && !proxyAddress)) ? <FormattedMessage id="contract-verification.proxyAddressError" defaultMessage="Please provide a valid proxy address." /> :
                  <FormattedMessage id="contract-verification.generalVerifyError" defaultMessage={"Please provide all necessary data to verify"} />) // Is not expected to be a case
        : <FormattedMessage id="contract-verification.verifyButtonTooltip" defaultMessage="Verify the contract on the selected chains with the selected verifiers." />}>
        <button type="submit" className="w-100 btn btn-primary mt-3" disabled={submitDisabled}>
          <FormattedMessage id="contract-verification.verifyButton" defaultMessage="Verify" />
        </button>
      </CustomTooltip>
    </form>
  )
}
