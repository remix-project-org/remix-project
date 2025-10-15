// eslint-disable-next-line no-use-before-define
import React, { useEffect, useState, useRef, useContext } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { AccountProps } from '../types'
import { PassphrasePrompt } from './passphrase'
import { shortenAddress, CustomMenu, CustomToggle, CustomTooltip } from '@remix-ui/helper'
import { eip7702Constants } from '@remix-project/remix-lib'
import { Dropdown } from 'react-bootstrap'
import { TrackingContext } from '@remix-ide/tracking'
import { UdappEvent } from '@remix-api'

export function AccountUI(props: AccountProps) {
  const { selectedAccount, loadedAccounts } = props.accounts
  const { selectExEnv, personalMode, networkName } = props
  const accounts = Object.keys(loadedAccounts)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends UdappEvent = UdappEvent>(event: T) => baseTrackEvent?.<T>(event)
  const [plusOpt, setPlusOpt] = useState({
    classList: '',
    title: ''
  })
  const [contractHasDelegation, setContractHasDelegation] = useState(false)
  const [enableDelegationAuthorization, setEnableDelegationAuthorization] = useState(false)
  const [smartAccountSelected, setSmartAccountSelected] = useState(false)

  const messageRef = useRef('')
  const delegationAuthorizationAddressRef = useRef(null)

  const intl = useIntl()
  const aaSupportedChainIds = ["11155111", "100"] // AA01: Add chain id here to show 'Create Smart Account' button in Udapp

  const smartAccountsData = props.runTabPlugin?.REACT_API?.smartAccounts || {}
  const allSmartAccountsSet = new Set(Object.keys(smartAccountsData))
  const ownerToSmartAccountsMap = new Map()

  for (const [saAddress, saData] of Object.entries(smartAccountsData)) {
    const owner = (saData as any)?.ownerEOA?.toLowerCase()
    if (owner) {
      if (!ownerToSmartAccountsMap.has(owner)) {
        ownerToSmartAccountsMap.set(owner, [])
      }
      ownerToSmartAccountsMap.get(owner).push(saAddress)
    }
  }

  const displayAccounts = []
  for (const account of accounts) {
    if (allSmartAccountsSet.has(account)) {
      continue
    }

    displayAccounts.push(account)

    const ownedSmartAccounts = ownerToSmartAccountsMap.get(account.toLowerCase())
    if (ownedSmartAccounts) {
      displayAccounts.push(...ownedSmartAccounts)
    }
  }

  useEffect(() => {
    if (accounts.length > 0 && !accounts.includes(selectedAccount)) {
      props.setAccount(accounts[0])
    }
  }, [accounts, selectedAccount])

  useEffect(() => {
    const run = async () => {
      if (selectExEnv !== 'vm-prague' && selectExEnv !== 'vm-mainnet-fork') {
        setEnableDelegationAuthorization(false)
        setContractHasDelegation(false)
        delegationAuthorizationAddressRef.current = null
        return
      }
      setEnableDelegationAuthorization(true)
      const web3 = props.runTabPlugin.blockchain.web3()
      if (!selectedAccount || !web3) {
        setContractHasDelegation(false)
        delegationAuthorizationAddressRef.current = null
        return
      }
      const code = await props.runTabPlugin.blockchain.web3().eth.getCode(selectedAccount)
      if (code && code.startsWith(eip7702Constants.EIP7702_CODE_INDICATOR_FLAG)) {
        // see https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7702.md delegation indicator
        const address = '0x' + code.replace(eip7702Constants.EIP7702_CODE_INDICATOR_FLAG, '')
        if (address === '0x0000000000000000000000000000000000000000') {
          setContractHasDelegation(false)
          delegationAuthorizationAddressRef.current = null
        } else {
          setContractHasDelegation(true)
          delegationAuthorizationAddressRef.current = address
        }
      } else {
        setContractHasDelegation(false)
        delegationAuthorizationAddressRef.current = null
      }
    }
    run()
  }, [selectedAccount, selectExEnv])

  useEffect(() => {
    props.setAccount('')
    if (selectExEnv && selectExEnv.startsWith('injected')) {
      setPlusOpt({
        classList: 'udapp_disableMouseEvents',
        title: intl.formatMessage({ id: 'udapp.injectedTitle' })
      })
    } else {
      switch (selectExEnv) {
      case 'vm-prague':
        setPlusOpt({
          classList: '',
          title: intl.formatMessage({ id: 'udapp.createNewAccount' })
        })
        break

      case 'vm-cancun':
        setPlusOpt({
          classList: '',
          title: intl.formatMessage({ id: 'udapp.createNewAccount' })
        })
        break

      case 'vm-paris':
        setPlusOpt({
          classList: '',
          title: intl.formatMessage({ id: 'udapp.createNewAccount' })
        })
        break

      case 'vm-london':
        setPlusOpt({
          classList: '',
          title: intl.formatMessage({ id: 'udapp.createNewAccount' })
        })
        break

      case 'vm-berlin':
        setPlusOpt({
          classList: '',
          title: intl.formatMessage({ id: 'udapp.createNewAccount' })
        })
        break

      case 'vm-shanghai':
        setPlusOpt({
          classList: '',
          title: intl.formatMessage({ id: 'udapp.createNewAccount' })
        })
        break

      case 'web3':
        if (!personalMode) {
          setPlusOpt({
            classList: 'disableMouseEvents',
            title: intl.formatMessage({ id: 'udapp.web3Title' })
          })
        } else {
          setPlusOpt({
            classList: '',
            title: intl.formatMessage({ id: 'udapp.createNewAccount' })
          })
        }
        break

      default:
        setPlusOpt({
          classList: 'disableMouseEvents',
          title: intl.formatMessage({ id: 'udapp.defaultTitle' }, { selectExEnv })
        })
      }
    }
  }, [selectExEnv, personalMode, networkName])

  const displayAccount = loadedAccounts?.[selectedAccount] ?? shortenAddress(selectedAccount)

  const createSmartAccount = () => {
    props.modal(
      <div className="d-flex align-items-center">
        <span className="badge bg-success me-2">Alpha</span>
        <span>{intl.formatMessage({ id: 'udapp.createSmartAccount' })}</span>
      </div>,
      (
        <div className="w-100" data-id="createSmartAccountModal">
          <p className="mb-2">
            <FormattedMessage id="udapp.createSmartAccountDesc1" />
          </p>
          <p className="mb-3">
            <FormattedMessage id="udapp.createSmartAccountDesc2" />
          </p>
          <a
            href="https://docs.safe.global/advanced/smart-account-overview#safe-smart-account"
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => trackMatomoEvent({ category: 'udapp', action: 'safeSmartAccount', name: 'learnMore', isClick: true })}
            className="mb-3 d-inline-block link-primary"
          >
            Learn more
          </a>
          <p className="mb-2">
            <FormattedMessage id="udapp.createSmartAccountDesc3" />
            <FormattedMessage id="udapp.createSmartAccountDesc4" />
          </p>
          { selectExEnv && selectExEnv.startsWith('injected') && (
            <div className="alert alert-warning d-flex align-items-center" role="alert">
              <i className="fas fa-exclamation-triangle me-2"></i>
              <div>
                <FormattedMessage id="udapp.createSmartAccountDesc5" />
              </div>
            </div>
          )}
          <label className="form-label text-uppercase text-muted small mb-1">
            Account
          </label>
          <CustomTooltip
            placement="top"
            tooltipClasses="text-wrap"
            tooltipId="createSmartAccountOwnerTooltip"
            tooltipText={'Owner address for Smart Account'}
          >
            <input
              type="text"
              className="form-control"
              value={displayAccount}
              disabled
              readOnly
            />
          </CustomTooltip>
        </div>
      ),
      intl.formatMessage({ id: 'udapp.continue' }),
      () => {
        trackMatomoEvent({ category: 'udapp', action: 'safeSmartAccount', name: 'createClicked', isClick: true })
        props.createNewSmartAccount()
      },
      intl.formatMessage({ id: 'udapp.cancel' }),
      () => {
        trackMatomoEvent({ category: 'udapp', action: 'safeSmartAccount', name: 'cancelClicked', isClick: true })
      }
    )
  }

  const handleDelegationAuthorizationAddressRef = (e) => {
    delegationAuthorizationAddressRef.current = e.target.value
  }

  const createDelegationAuthorization = () => {
    props.modal(
      intl.formatMessage({ id: 'udapp.createDelegationTitle' }),
      (
        <div className="w-100" data-id="createDelegationAuthorizationModal">
          <span>{intl.formatMessage({ id: 'udapp.createDelegationDescription' }, {
            a: (chunks) => (
              <a href='https://eip7702.io/' target="_blank" rel="noreferrer">
                {chunks}
              </a>
            )
          })}</span>
          <label className="mt-3">Authorization Address</label>
          <input className='border form-control' data-id="create-delegation-authorization-input" onChange={handleDelegationAuthorizationAddressRef} />
        </div>
      ),
      intl.formatMessage({ id: 'udapp.authorize' }),
      async () => {
        try {
          await props.delegationAuthorization(delegationAuthorizationAddressRef.current)
          setContractHasDelegation(true)
          trackMatomoEvent({ category: 'udapp', action: 'contractDelegation', name: 'create', isClick: false })
        } catch (e) {
          props.runTabPlugin.call('terminal', 'log', { type: 'error', value: e.message })
        }
      },
      intl.formatMessage({ id: 'udapp.cancel' }),
      () => {
        props.setPassphrase('')
      }
    )
  }

  const deleteDelegation = () => {
    props.modal(
      intl.formatMessage({ id: 'udapp.removeDelegationTitle' }),
      (
        <div className="w-100">
          Are you sure to remove the delegation?
        </div>
      ),
      intl.formatMessage({ id: 'udapp.continue' }),
      async () => {
        try {
          await props.delegationAuthorization('0x0000000000000000000000000000000000000000')
          delegationAuthorizationAddressRef.current = ''
          setContractHasDelegation(false)
          trackMatomoEvent({ category: 'udapp', action: 'contractDelegation', name: 'remove', isClick: false })
        } catch (e) {
          props.runTabPlugin.call('terminal', 'log', { type: 'error', value: e.message })
        }
      },
      intl.formatMessage({ id: 'udapp.cancel' }),
      () => {}
    )
  }

  const newAccount = () => {
    props.createNewBlockchainAccount(passphraseCreationPrompt())
  }

  const signMessage = () => {
    trackMatomoEvent({ category: 'udapp', action: 'signUsingAccount', name: `selectExEnv: ${selectExEnv}`, isClick: false })
    if (!accounts[0]) {
      return props.tooltip(intl.formatMessage({ id: 'udapp.tooltipText1' }))
    }

    if (selectExEnv === 'web3') {
      return props.modal(
        intl.formatMessage({ id: 'udapp.modalTitle1' }),
        <PassphrasePrompt message={intl.formatMessage({ id: 'udapp.modalMessage1' })} setPassphrase={props.setPassphrase} />,
        intl.formatMessage({ id: 'udapp.ok' }),
        () => {
          props.modal(
            intl.formatMessage({ id: 'udapp.signAMessage' }),
            signMessagePrompt(),
            intl.formatMessage({ id: 'udapp.sign' }),
            () => {
              props.signMessageWithAddress(selectedAccount, messageRef.current, signedMessagePrompt, props.passphrase)
              props.setPassphrase('')
            },
            intl.formatMessage({ id: 'udapp.cancel' }),
            null
          )
        },
        intl.formatMessage({ id: 'udapp.cancel' }),
        () => {
          props.setPassphrase('')
        }
      )
    }

    props.modal(
      intl.formatMessage({ id: 'udapp.signAMessage' }),
      signMessagePrompt(),
      intl.formatMessage({ id: 'udapp.sign' }),
      () => {
        props.signMessageWithAddress(selectedAccount, messageRef.current, signedMessagePrompt)
      },
      intl.formatMessage({ id: 'udapp.cancel' }),
      null
    )
  }

  const handlePassphrase = (e) => {
    props.setPassphrase(e.target.value)
  }

  const handleMatchPassphrase = (e) => {
    props.setMatchPassphrase(e.target.value)
  }

  const handleMessageInput = (e) => {
    messageRef.current = e.target.value
  }

  const passphraseCreationPrompt = () => {
    return (
      <div className="d-flex flex-column">
        <FormattedMessage id="udapp.text1" />
        <input id="prompt1" type="password" name="prompt_text" className="w-100 py-2" onInput={handlePassphrase} />
        <input id="prompt2" type="password" name="prompt_text" className="w-100" onInput={handleMatchPassphrase} />
      </div>
    )
  }

  const signMessagePrompt = () => {
    return (
      <div>
        <FormattedMessage id="udapp.enterAMessageToSign" />
        <textarea
          id="prompt_text"
          className="bg-light form-control"
          data-id="signMessageTextarea"
          style={{ width: '100%' }}
          rows={4}
          cols={50}
          onInput={handleMessageInput}
          defaultValue={messageRef.current}
        ></textarea>
        <div className='mt-2'>
          <span>otherwise</span><button className='ms-2 modal-ok btn btn-sm border-primary' data-id="sign-eip-712" onClick={() => {
            props.modal(
              'Message signing with EIP-712',
              <div>
                <div>{intl.formatMessage({ id: 'udapp.EIP712-2' }, {
                  a: (chunks) => (
                    <a href='https://eips.ethereum.org/EIPS/eip-712' target="_blank" rel="noreferrer">
                      {chunks}
                    </a>
                  )
                })}</div>
                <div>{intl.formatMessage({ id: 'udapp.EIP712-3' })}</div></div>,
              intl.formatMessage({ id: 'udapp.EIP712-create-template' }),
              () => { props.addFile('EIP-712-data.json', JSON.stringify(EIP712_Example, null, '\t')) },
              intl.formatMessage({ id: 'udapp.EIP712-close' }),
              () => {})
          }}>Sign with EIP 712</button>
        </div>
      </div>
    )
  }

  const signedMessagePrompt = (msgHash: string, signedData: string) => {
    return (
      <div className="d-flex flex-column">
        <label className="text-uppercase">
          <FormattedMessage id="udapp.hash" />
        </label>
        <span id="remixRunSignMsgHash" data-id="settingsRemixRunSignMsgHash">
          {msgHash}
        </span>
        <label className="pt-2 text-uppercase">
          <FormattedMessage id="udapp.signature" />
        </label>
        <span id="remixRunSignMsgSignature" data-id="settingsRemixRunSignMsgSignature">
          {signedData}
        </span>
      </div>
    )
  }

  return (
    <div className="udapp_crow">
      {(() => {
        const isSmart = allSmartAccountsSet.has(selectedAccount)
        if (!isSmart) return null

        const owner = (smartAccountsData as any)[selectedAccount]?.ownerEOA
        if (!owner) return null

        return (
          <div className="udapp_owner-chip">
            <span>Owner: {shortenAddress(owner)}
              <CopyToClipboard className="fas fa-copy ms-2" tip={intl.formatMessage({ id: 'udapp.copyOwnerAccount' })} content={owner} direction="top" />
            </span>
          </div>
        )
      })()}
      <label className="udapp_settingsLabel">
        <FormattedMessage id="udapp.account" />
        {!allSmartAccountsSet.has(selectedAccount) ? <CustomTooltip placement={'top'} tooltipClasses="text-wrap" tooltipId="remixPlusWrapperTooltip" tooltipText={plusOpt.title}>
          <span className="px-1" id="remixRunPlusWrapper">
            <i id="remixRunPlus" className={`fas fa-plus udapp_icon ${plusOpt.classList}`} aria-hidden="true" onClick={newAccount}></i>
          </span>
        </CustomTooltip> : null }
        {!allSmartAccountsSet.has(selectedAccount) ? <CustomTooltip placement={'top'} tooltipClasses="text-nowrap" tooltipId="remixSignMsgTooltip" tooltipText={<FormattedMessage id="udapp.signMsgUsingAccount" />}>
          <i id="remixRunSignMsg" data-id="settingsRemixRunSignMsg" className="mx-1 fas fa-edit udapp_icon" aria-hidden="true" onClick={signMessage}></i>
        </CustomTooltip> : null }
        <span className='mx-1'>
          <CopyToClipboard className="fas fa-copy p-0" tip={intl.formatMessage({ id: 'udapp.copyAccount' })} content={selectedAccount} direction="top" />
        </span>
        { enableDelegationAuthorization ? (<span className="mx-1 mt-1">
          <CustomTooltip placement={'top'} tooltipClasses="text-wrap" tooltipId="remixDelegationAuthTooltip" tooltipText={"Using EIP 7702 in Remix"}>
            <a href={"https://remix-ide.readthedocs.io/en/latest/account-abstraction-7702.html#using-eip-7702-in-remix"} className="titleInfo p-0 mb-2" target="_blank" rel="noreferrer">
              <i aria-hidden="true" className="ms-0 fas fa-info align-self-center"></i>
            </a>
          </CustomTooltip>
        </span>) : null }
        { smartAccountSelected ? (<span className="mx-1 mt-1">
          <CustomTooltip placement={'top'} tooltipClasses="text-wrap" tooltipId="remixDelegationAuthTooltip" tooltipText={"Gnosis Safe Smart Accounts in Remix"}>
            <a href={"https://remix-ide.readthedocs.io/en/latest/account-abstraction-7702.html#gnosis-safe-smart-accounts-in-remix"} className="titleInfo p-0 mb-2" target="_blank" rel="noreferrer">
              <i aria-hidden="true" className="ms-0 fas fa-info align-self-center"></i>
            </a>
          </CustomTooltip>
        </span>) : null }
        {props.accounts.isRequesting && <i className="fa fa-spinner fa-pulse ms-2" aria-hidden="true"></i>}
      </label>
      <div className="udapp_account">
        <div className="udapp_account-toggle-container">
          <Dropdown className="udapp_selectExEnvOptions" data-id="runTabSelectAccount">
            <Dropdown.Toggle as={CustomToggle} icon={null} id="txorigin" data-id="runTabSelectAccount" className="btn btn-light btn-block w-100 d-inline-block border form-select">
              { selectedAccount && loadedAccounts[selectedAccount] ? (
                <div className="udapp_account-item">
                  {(() => {
                    const isSmartAccount = allSmartAccountsSet.has(selectedAccount)
                    const isOwner = ownerToSmartAccountsMap.has(selectedAccount.toLowerCase())

                    if (isSmartAccount || isOwner) {
                      return (
                        <span className="udapp_account-badge">
                          {isSmartAccount ? 'Smart' : 'Owner'}
                        </span>
                      )
                    }
                    return null
                  })()}
                  <span>
                    {(loadedAccounts[selectedAccount] || selectedAccount).replace(/\[SMART\]\s*/, '')}
                  </span>
                </div>
              ) : '' }
            </Dropdown.Toggle>

            <Dropdown.Menu as={CustomMenu} className="w-100 form-select" data-id="custom-dropdown-items">
              {displayAccounts.map((value) => {
                const isSmartAccount = allSmartAccountsSet.has(value)
                const isOwner = ownerToSmartAccountsMap.has(value.toLowerCase())
                const displayName = (loadedAccounts[value] || value).replace(/\[SMART\]\s*/, '')

                const itemContent = (
                  <div className="udapp_account-item">
                    {(isSmartAccount || isOwner) && (
                      <span className="udapp_account-badge">
                        {isSmartAccount ? 'Smart' : 'Owner'}
                      </span>
                    )}
                    <span data-id={`${value}`}>
                      {displayName}
                    </span>
                  </div>
                )
                return (
                  <Dropdown.Item
                    key={value}
                    onClick={() => { props.setAccount(value) }}
                    data-id={`txOriginSelectAccountItem-${value}`}
                  >
                    {isSmartAccount ? <div className="udapp_tree-view">{itemContent}</div> : itemContent}
                  </Dropdown.Item>
                )
              })}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>

      { contractHasDelegation ?
        <span className="alert-info badge text-bg-secondary">
          Delegation: {shortenAddress(delegationAuthorizationAddressRef.current || "")}
          <CopyToClipboard className="fas fa-copy ms-2 text-primary" content={delegationAuthorizationAddressRef.current} direction="top" />
          <a><span data-id="delete-delegation" style={{ padding: 'padding: 0.15rem' }} onClick={() => deleteDelegation()}>
            <CustomTooltip placement="top" tooltipClasses="text-nowrap" tooltipId="udapp_deleteDelegation" tooltipText="Remove delegation">
              <i className="fas fa-close ms-2 text-primary" aria-hidden="true" onClick={() => deleteDelegation()}></i>
            </CustomTooltip>
          </span></a>
        </span> : null
      }
      { !allSmartAccountsSet.has(selectedAccount) && aaSupportedChainIds.some(e => networkName.includes(e)) ? (<div className="mt-1">
        <CustomTooltip placement={'top'} tooltipClasses="text-wrap" tooltipId="remixCSMPlusTooltip" tooltipText={intl.formatMessage({ id: 'udapp.createSmartAccount' })}>
          <button type="button" className="btn btn-sm btn-secondary w-100" onClick={() => createSmartAccount()}>
            <i id="createSmartAccountPlus" className="me-1 fas fa-plus" aria-hidden="true" style={{ "color": "#fff" }}></i>
            Create Smart Account
          </button>
        </CustomTooltip>
      </div>) : null }
      { enableDelegationAuthorization ? (<div className="mt-1">
        <CustomTooltip placement={'top'} tooltipClasses="text-wrap" tooltipId="remixDelegationAuthTooltip" tooltipText={intl.formatMessage({ id: 'udapp.createDelegationAuthorization' })}>
          <button data-id="create-delegation-authorization" type="button" className="btn btn-sm btn-secondary w-100" onClick={() => createDelegationAuthorization()}>
            <i id="createDelegationPlus" className="me-1 fas fa-plus" aria-hidden="true" style={{ "color": "#fff" }}></i>
            Authorize Delegation
          </button>
        </CustomTooltip>
      </div>) : null }
    </div>
  )
}

const EIP712_Example = {
  domain: {
    chainId: 1,
    name: "Example App",
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
    version: "1",
  },
  message: {
    prompt: "Welcome! In order to authenticate to this website, sign this request and your public address will be sent to the server in a verifiable way.",
    createdAt: 1718570375196,
  },
  primaryType: 'AuthRequest',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    AuthRequest: [
      { name: 'prompt', type: 'string' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
}
