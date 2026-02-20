import React, { useMemo, useState, useRef, useEffect } from 'react'
import { AddressToggle, CustomMenu, EnvironmentToggle, shortenAddress, SmartAccountPromptTitle } from "@remix-ui/helper"
import { Dropdown } from "react-bootstrap"
import { useIntl } from 'react-intl'
import { EnvAppContext } from '../contexts'
import { useContext } from "react"
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, UdappEvent } from '@remix-api'
import { createNewAccount, createSmartAccount, setExecutionContext, authorizeDelegation, signMessageWithAddress, deleteAccountAction, updateAccountAlias } from '../actions'
import { EnvCategoryUI } from '../components/envCategoryUI'
import { Provider, Account } from '../types'
import { ForkUI } from '../components/forkUI'
import { ResetUI } from '../components/resetUI'
import { AccountKebabMenu } from '../components/accountKebabMenu'
import '../css/index.css'
import { SmartAccountPrompt } from '../components/smartAccountPrompt'
import { DelegationAuthorizationPrompt } from '../components/delegationAuthorizationPrompt'
import { SignMessagePrompt, SignedMessagePrompt } from '../components/signMessagePrompt'
import { CopyToClipboard } from '@remix-ui/clipboard'

function EnvironmentPortraitView() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = UdappEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const intl = useIntl()
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false)
  const [openKebabMenuId, setOpenKebabMenuId] = useState<string | null>(null)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editingAlias, setEditingAlias] = useState<string>('')
  const kebabIconRefs = useRef<{[key: string]: HTMLElement}>({})
  const delegationAuthorizationAddressRef = useRef<string>('')
  const messageRef = useRef<string>('')
  const editingInputRef = useRef<HTMLInputElement>(null)
  const aaSupportedChainIds = ["11155111", "100"] // AA01: Add chain id here to show 'Create Smart Account' button in Udapp

  const handleResetClick = () => {
    trackMatomoEvent({ category: 'udapp', action: 'deleteState', name: 'deleteState clicked', isClick: true })
    dispatch({ type: 'SHOW_RESET_UI', payload: undefined })
  }

  const handleForkClick = () => {
    trackMatomoEvent({ category: 'udapp', action: 'forkState', name: 'forkState clicked', isClick: true })
    dispatch({ type: 'SHOW_FORK_UI', payload: undefined })
  }

  const handleProviderSelection = (provider: Provider) => {
    if (provider.category && selectedProvider?.category === provider.category) {
      return
    }
    if (provider.category === 'Dev') {
      // select category to show sub-categories
      dispatch({ type: 'SET_CURRENT_PROVIDER', payload: provider.name })
    } else {
      setExecutionContext(provider, plugin, widgetState, dispatch)
    }
  }

  const handleAccountSelection = (account: Account) => {
    dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: account.account })
  }

  const handleKebabClick = (e: React.MouseEvent, accountId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setOpenKebabMenuId(prev => prev === accountId ? null : accountId)
  }

  const handleNewAccount = () => {
    createNewAccount(plugin, dispatch)
    setOpenKebabMenuId(null)
  }

  const handleCreateSmartAccount = (account: Account) => {
    plugin.call('notification', 'modal', {
      id: 'createSmartAccount',
      title: <SmartAccountPromptTitle title={intl.formatMessage({ id: 'udapp.createSmartAccount' })} />,
      message: <SmartAccountPrompt plugin={plugin} />,
      okLabel: intl.formatMessage({ id: 'udapp.continue' }),
      cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
      okFn: function () {
        trackMatomoEvent({ category: 'udapp', action: 'safeSmartAccount', name: 'createClicked', isClick: true })
        createSmartAccount(plugin, widgetState, dispatch)
      }
    })
    setOpenKebabMenuId(null)
  }

  const handleAuthorizeDelegation = (account: Account) => {
    plugin.call('notification', 'modal', {
      id: 'createDelegationAuthorization',
      title: intl.formatMessage({ id: 'udapp.createDelegationTitle' }),
      message: (
        <DelegationAuthorizationPrompt
          onAddressChange={(address) => {
            delegationAuthorizationAddressRef.current = address
          }}
        />
      ),
      okLabel: intl.formatMessage({ id: 'udapp.authorize' }),
      cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
      okFn: async () => {
        try {
          await authorizeDelegation(
            delegationAuthorizationAddressRef.current,
            plugin,
            selectedAccount?.account,
            widgetState.accounts.defaultAccounts,
            dispatch
          )
          trackMatomoEvent({ category: 'udapp', action: 'contractDelegation', name: 'create', isClick: false })
        } catch (e) {
          plugin.call('terminal', 'log', { type: 'error', value: e.message })
        }
      }
    })
    setOpenKebabMenuId(null)
  }

  const handleSignUsingAccount = (account: Account) => {
    trackMatomoEvent({ category: 'udapp', action: 'signUsingAccount', name: `selectExEnv: ${widgetState.providers.selectedProvider}`, isClick: false })

    if (!widgetState.accounts.defaultAccounts || widgetState.accounts.defaultAccounts.length === 0) {
      plugin.call('notification', 'toast', intl.formatMessage({ id: 'udapp.tooltipText1' }))
      setOpenKebabMenuId(null)
      return
    }

    const showSignMessageModal = (passphrase?: string) => {
      plugin.call('notification', 'modal', {
        id: 'signMessage',
        title: intl.formatMessage({ id: 'udapp.signAMessage' }),
        message: (
          <SignMessagePrompt
            plugin={plugin}
            onMessageChange={(message) => {
              messageRef.current = message
            }}
            defaultMessage={messageRef.current}
          />
        ),
        okLabel: intl.formatMessage({ id: 'udapp.sign' }),
        cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
        okFn: async () => {
          try {
            const result = await signMessageWithAddress(
              plugin,
              account.account,
              messageRef.current,
              passphrase
            )
            plugin.call('notification', 'modal', {
              id: 'signedMessage',
              title: 'Signed Message',
              message: <SignedMessagePrompt msgHash={result.msgHash} signedData={result.signedData} />,
              okLabel: 'OK',
              cancelLabel: null,
              okFn: () => {},
              hideFn: () => {}
            })
          } catch (e) {
            console.error(e)
          }
        }
      })
    }

    if (widgetState.providers.selectedProvider === 'web3') {
      // For web3 provider, we need to get passphrase first
      plugin.call('notification', 'modal', {
        id: 'enterPassphrase',
        title: intl.formatMessage({ id: 'udapp.modalTitle1' }),
        message: intl.formatMessage({ id: 'udapp.modalMessage1' }),
        okLabel: intl.formatMessage({ id: 'udapp.ok' }),
        cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
        okFn: async () => {
          const passphrase = await plugin.call('udappEnv', 'getPassphrase')
          showSignMessageModal(passphrase)
        }
      })
    } else {
      showSignMessageModal()
    }

    setOpenKebabMenuId(null)
  }

  const handleRenameAccount = (account: Account) => {
    setOpenKebabMenuId(null)
    const accountId = account.account === selectedAccount?.account ? 'selected' : `account-${widgetState.accounts.defaultAccounts.findIndex(a => a.account === account.account)}`
    setEditingAccountId(accountId)
    setEditingAlias(account.alias)
    setTimeout(() => {
      if (editingInputRef.current) {
        editingInputRef.current.select()
      }
    }, 0)
  }

  const handleDeleteAccount = (account: Account) => {
    plugin.call('notification', 'modal', {
      id: 'deleteAccount',
      title: 'Delete Account',
      message: `Are you sure you want to delete account ${account.alias} (${account.account})? This will hide it from the list but won't affect the actual blockchain account.`,
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
      okFn: async () => {
        await deleteAccountAction(account.account, plugin, widgetState, dispatch)
      }
    })
    setOpenKebabMenuId(null)
  }

  const handleStartEditAlias = (accountId: string, currentAlias: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingAccountId(accountId)
    setEditingAlias(currentAlias)
    // Auto-select text after state update
    setTimeout(() => {
      if (editingInputRef.current) {
        editingInputRef.current.select()
      }
    }, 0)
  }

  const handleSaveAlias = async (accountAddress: string) => {
    if (editingAlias.trim()) {
      await updateAccountAlias(accountAddress, editingAlias.trim(), plugin, dispatch)
    }
    setEditingAccountId(null)
    setEditingAlias('')
  }

  const handleAliasKeyDown = (e: React.KeyboardEvent, accountAddress: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveAlias(accountAddress)
    } else if (e.key === 'Escape') {
      setEditingAccountId(null)
      setEditingAlias('')
    }
  }

  const uniqueDropdownItems = useMemo(() => {
    const categoryMap = new Map<string, Provider>()
    const itemsWithoutCategory: Provider[] = []

    widgetState.providers.providerList.forEach((provider) => {
      if (provider.category) {
        // Only add the category once (use first provider with that category)
        if (!categoryMap.has(provider.category)) {
          categoryMap.set(provider.category, provider)
        }
      } else {
        // Providers without category are shown individually
        itemsWithoutCategory.push(provider)
      }
    })

    return [...Array.from(categoryMap.values()), ...itemsWithoutCategory]
  }, [widgetState.providers.providerList])

  const selectedProvider = useMemo(() => {
    return widgetState.providers.providerList.find(provider => provider.name === widgetState.providers.selectedProvider)
  }, [widgetState.providers.selectedProvider])

  const selectedAccount = useMemo(() => {
    return widgetState.accounts.defaultAccounts.find(account => account.account === widgetState.accounts.selectedAccount) || widgetState.accounts.defaultAccounts[0]
  }, [widgetState.accounts.selectedAccount, widgetState.accounts.defaultAccounts])

  const isSmartAccountSupported = useMemo(() => {
    return aaSupportedChainIds.includes(widgetState.network.chainId)
  }, [widgetState.network.chainId])

  const enableDelegationAuthorization = useMemo(() => {
    return widgetState.providers.selectedProvider === 'vm-prague'
  }, [widgetState.providers.selectedProvider])

  const delegationAddress = useMemo(() => {
    return widgetState.accounts.delegations?.[selectedAccount?.account]
  }, [widgetState.accounts.delegations, selectedAccount])

  const handleDeleteDelegation = async () => {
    plugin.call('notification', 'modal', {
      id: 'deleteDelegation',
      title: 'Remove Delegation',
      message: `Are you sure you want to remove the delegation for ${selectedAccount?.account}?`,
      okLabel: 'Remove',
      cancelLabel: 'Cancel',
      okFn: async () => {
        try {
          await authorizeDelegation(
            '0x0000000000000000000000000000000000000000',
            plugin,
            selectedAccount?.account,
            widgetState.accounts.defaultAccounts,
            dispatch
          )
          plugin.call('terminal', 'log', { type: 'info', value: `Delegation for ${selectedAccount?.account} removed.` })
        } catch (e) {
          plugin.call('terminal', 'log', { type: 'error', value: e.message })
        }
      }
    })
  }

  return (
    <>
      <div className='card mx-2 mb-2' style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <div className="d-flex align-items-center">
            <h6 className="my-auto" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>{intl.formatMessage({ id: 'udapp.environment' })}</h6>
          </div>
          <div className="toggle-container">
            {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
              <button className='btn btn-primary btn-sm small me-2' style={{ fontSize: '0.7rem' }} onClick={handleForkClick}>
                <i className='fas fa-code-branch'></i> {intl.formatMessage({ id: 'udapp.fork' })}
              </button>
            )}
            {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
              <button className='btn btn-outline-danger btn-sm small' style={{ fontSize: '0.7rem' }} onClick={handleResetClick}>
                <i className='fas fa-redo'></i> {intl.formatMessage({ id: 'udapp.reset' })}
              </button>
            )}
          </div>
        </div>
        {widgetState.fork.isVisible.forkUI && <ForkUI />}
        {widgetState.fork.isVisible.resetUI && <ResetUI />}
        {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
          <div className="d-flex p-3 pt-0">
            <Dropdown className="w-100">
              <Dropdown.Toggle
                as={EnvironmentToggle}
                data-id="settingsSelectEnvOptions"
                className="w-100 d-inline-block border form-control"
                environmentUI={<EnvCategoryUI />}
                style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}
              >
                <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
                  <div className="text-truncate text-secondary">
                    <span data-id={`selected-provider-${widgetState.providers.selectedProvider}`}> { selectedProvider?.category || selectedProvider?.displayName || 'Remix VM' }</span>
                  </div>
                </div>
              </Dropdown.Toggle>

              <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', zIndex: 1 }}>
                {
                  uniqueDropdownItems.map((provider, index) => {
                    return (
                      <Dropdown.Item key={index} onClick={() => handleProviderSelection(provider)} data-id={`dropdown-item-${provider.category ? provider.category?.split(' ')?.join('_') : provider.name}`} className="environment-item-hover">
                        {provider.category ? provider.category : provider.displayName}
                      </Dropdown.Item>
                    )})
                }
              </Dropdown.Menu>
            </Dropdown>
          </div>)}
        {!widgetState.fork.isVisible.resetUI && (
          <div className="d-flex px-3">
            <Dropdown className="w-100" onToggle={(isOpen) => setIsAccountDropdownOpen(isOpen)}>
              <Dropdown.Toggle as={AddressToggle} data-id="runTabSelectAccount" className={`w-100 d-inline-block border form-control selected-account-hover ${isAccountDropdownOpen ? 'dropdown-open' : ''}`} style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                <div className="d-flex align-items-center">
                  <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm w-100">
                    <div className="d-flex align-items-center justify-content-between w-100">
                      <div className='d-flex flex-column align-items-start'>
                        <div className="text-truncate text-dark d-flex align-items-center">
                          {editingAccountId === 'selected' ? (
                            <input
                              ref={editingInputRef}
                              type="text"
                              className="form-control form-control-sm"
                              style={{ width: '150px' }}
                              value={editingAlias}
                              onChange={(e) => setEditingAlias(e.target.value)}
                              onKeyDown={(e) => handleAliasKeyDown(e, selectedAccount?.account)}
                              onBlur={() => handleSaveAlias(selectedAccount?.account)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <span>{selectedAccount?.alias}</span>
                              <i
                                className="fa-solid fa-pen small ms-1"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => handleStartEditAlias('selected', selectedAccount?.alias, e)}
                              ></i>
                            </>
                          )}
                        </div>
                        <div style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
                          <span className="small">{shortenAddress(selectedAccount?.account)}</span>
                          <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => selectedAccount?.account}>
                            <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                          </CopyToClipboard>
                        </div>
                      </div>
                      <div className={`selected-account-balance-container ${openKebabMenuId === 'selected' ? 'kebab-menu-open' : ''}`} style={{ color: 'var(--bs-tertiary-color)' }}>
                        <span className="selected-account-balance-text">{`${selectedAccount?.balance} ${selectedAccount?.symbol}`}</span>
                        <i
                          ref={(el) => {
                            if (el && selectedAccount) kebabIconRefs.current['selected'] = el
                          }}
                          className="selected-account-kebab-icon fas fa-ellipsis-v"
                          data-id="selected-account-kebab-menu"
                          onClick={(e) => handleKebabClick(e, 'selected')}
                          style={{ cursor: 'pointer' }}
                        ></i>
                      </div>
                    </div>
                  </div>
                </div>
              </Dropdown.Toggle>

              <AccountKebabMenu
                show={openKebabMenuId === 'selected'}
                target={kebabIconRefs.current['selected']}
                onHide={() => setOpenKebabMenuId(null)}
                account={selectedAccount}
                menuIndex="selected"
                onRenameAccount={handleRenameAccount}
                onNewAccount={handleNewAccount}
                onCreateSmartAccount={isSmartAccountSupported ? handleCreateSmartAccount : undefined}
                onAuthorizeDelegation={enableDelegationAuthorization && !delegationAddress ? handleAuthorizeDelegation : undefined}
                onSignUsingAccount={handleSignUsingAccount}
                onDeleteAccount={handleDeleteAccount}
              />

              <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                {
                  widgetState.accounts.defaultAccounts.map((account, index) => {
                    const accountId = `account-${index}`
                    return (
                      <div key={index}>
                        <Dropdown.Item data-id={account.account} className="d-flex align-items-center justify-content-between p-1 m-1 account-item-hover" onClick={() => handleAccountSelection(account)} style={{ cursor: 'pointer' }}>
                          <div className='d-flex flex-column align-items-start'>
                            <div className="text-truncate text-dark d-flex align-items-center">
                              {editingAccountId === accountId ? (
                                <input
                                  ref={editingInputRef}
                                  type="text"
                                  className="form-control form-control-sm"
                                  style={{ width: '150px' }}
                                  value={editingAlias}
                                  onChange={(e) => setEditingAlias(e.target.value)}
                                  onKeyDown={(e) => handleAliasKeyDown(e, account?.account)}
                                  onBlur={() => handleSaveAlias(account?.account)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span>{account?.alias}</span>
                              )}
                            </div>
                            <div style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
                              <span className="small">{shortenAddress(account?.account)}</span>
                              <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => account?.account}>
                                <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                              </CopyToClipboard>
                            </div>
                          </div>
                          <div className={`account-balance-container ${openKebabMenuId === accountId ? 'kebab-menu-open' : ''}`} style={{ color: 'var(--bs-tertiary-color)' }}>
                            <span className="account-balance-text">{`${account?.balance} ${account?.symbol}`}</span>
                            <i
                              ref={(el) => {
                                if (el) kebabIconRefs.current[accountId] = el
                              }}
                              className="account-kebab-icon fas fa-ellipsis-v"
                              onClick={(e) => handleKebabClick(e, accountId)}
                              style={{ cursor: 'pointer' }}
                            ></i>
                          </div>
                        </Dropdown.Item>
                        <AccountKebabMenu
                          show={openKebabMenuId === accountId}
                          target={kebabIconRefs.current[accountId]}
                          onHide={() => setOpenKebabMenuId(null)}
                          account={account}
                          menuIndex={index}
                          onRenameAccount={handleRenameAccount}
                          onDeleteAccount={handleDeleteAccount}
                        />
                      </div>
                    )
                  })
                }
              </Dropdown.Menu>
            </Dropdown>
          </div>)}
        {enableDelegationAuthorization && delegationAddress && (
          <div className="px-3">
            <div className="alert alert-info d-flex align-items-center justify-content-between p-2 mt-2 mb-0 rounded" style={{ fontSize: '0.85rem' }}>
              <div className="d-flex align-items-center small">
                <span className="me-2">Delegation:</span>
                <span className="text-truncate" style={{ maxWidth: '150px' }}>{shortenAddress(delegationAddress)}</span>
                <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => delegationAddress}>
                  <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                </CopyToClipboard>
              </div>
              <i
                className="fas fa-times"
                data-id="delete-delegation"
                onClick={handleDeleteDelegation}
                style={{ cursor: 'pointer' }}
              ></i>
            </div>
          </div>
        )}
        <div className="mx-auto py-3" style={{ color: 'var(--bs-tertiary-color)' }}>
          <span className="small me-1">Deployed Contracts</span><span className="small me-2 text-primary">{ widgetState.deployedContractsCount }</span>
          <span className="small me-1">Transactions recorded</span><span className="small text-primary">{ widgetState.transactionRecorderCount }</span>
        </div>
      </div>
    </>
  )
}

export default EnvironmentPortraitView