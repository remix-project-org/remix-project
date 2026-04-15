import React, { useMemo, useState, useRef } from 'react'
import { AddressToggle, CustomMenu, CustomTooltip, EnvironmentToggle, shortenAddress, SmartAccountPromptTitle } from "@remix-ui/helper"
import { Dropdown } from "react-bootstrap"
import { useIntl } from 'react-intl'
import { EnvAppContext } from '../contexts'
import { useContext } from "react"
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, UdappEvent } from '@remix-api'
import { createNewAccount, createSmartAccount, setExecutionContext, authorizeDelegation, signMessageWithAddress, deleteAccountAction, updateAccountAlias } from '../actions'
import { EnvCategoryUI } from '../components/envCategoryUI'
import { Provider, Account, SmartAccount } from '../types'
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
  const [isEnvironmentDropdownOpen, setIsEnvironmentDropdownOpen] = useState(false)
  const [isSubCategoryDropdownOpen, setIsSubCategoryDropdownOpen] = useState(false)
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
    trackMatomoEvent({ category: 'udapp', action: 'environmentSelected', name: provider.category || provider.displayName, isClick: true })
    if (provider.category && selectedProvider?.category === provider.category) return
    if (provider.category === 'Dev' || provider.category === 'Browser Extension') {
      // select category to show sub-categories
      dispatch({ type: 'SET_CURRENT_PROVIDER', payload: provider.name })
    } else {
      setExecutionContext(provider, plugin, dispatch)
    }
  }

  const handleAccountSelection = (account: Account) => {
    trackMatomoEvent({ category: 'udapp', action: 'accountSelected', name: shortenAddress(account.account), isClick: true })
    dispatch({ type: 'SET_SELECTED_ACCOUNT', payload: account.account })
  }

  const handleKebabClick = (e: React.MouseEvent, accountId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const willOpen = openKebabMenuId !== accountId
    if (willOpen) {
      trackMatomoEvent({ category: 'udapp', action: 'kebabMenuOpen', name: accountId, isClick: true })
    }
    setOpenKebabMenuId(prev => prev === accountId ? null : accountId)
  }

  const handleNewAccount = () => {
    trackMatomoEvent({ category: 'udapp', action: 'newAccount', name: 'clicked', isClick: true })
    createNewAccount(plugin, dispatch)
    setOpenKebabMenuId(null)
  }

  const handleCreateSmartAccount = (_account: Account) => {
    trackMatomoEvent({ category: 'udapp', action: 'createSmartAccount', name: shortenAddress(_account.account), isClick: true })
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

  const handleAuthorizeDelegation = (_account: Account) => {
    trackMatomoEvent({ category: 'udapp', action: 'authorizeDelegation', name: shortenAddress(_account.account), isClick: true })
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
    trackMatomoEvent({ category: 'udapp', action: 'renameAccount', name: shortenAddress(account.account), isClick: true })
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
    trackMatomoEvent({ category: 'udapp', action: 'deleteAccount', name: shortenAddress(account.account), isClick: true })
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
    trackMatomoEvent({ category: 'udapp', action: 'accountAliasEditStart', name: accountId, isClick: true })
    setIsAccountDropdownOpen(false)
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
      trackMatomoEvent({ category: 'udapp', action: 'accountAliasSaved', name: editingAlias.trim() })
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
      trackMatomoEvent({ category: 'udapp', action: 'accountAliasCancelled', name: shortenAddress(accountAddress) })
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
    // First check in smart accounts (to get correct alias from localStorage)
    const smartAccount = widgetState.accounts.smartAccounts.find(
      account => account.account === widgetState.accounts.selectedAccount
    )
    if (smartAccount) {
      return smartAccount as Account
    }

    // If not found in smart accounts, check in default accounts
    const defaultAccount = widgetState.accounts.defaultAccounts.find(
      account => account.account === widgetState.accounts.selectedAccount
    )

    return defaultAccount || widgetState.accounts.defaultAccounts[0]
  }, [widgetState.accounts.selectedAccount, widgetState.accounts.defaultAccounts, widgetState.accounts.smartAccounts])

  const selectedAccountIsSmartAccount = useMemo(() => {
    return widgetState.accounts.smartAccounts.some(smartAccount => smartAccount.account === selectedAccount?.account)
  }, [widgetState.accounts.smartAccounts, selectedAccount])

  const selectedSmartAccountOwner = useMemo(() => {
    if (!selectedAccountIsSmartAccount) return null
    const smartAccount = widgetState.accounts.smartAccounts.find(
      sa => sa.account === selectedAccount?.account
    )
    return smartAccount?.ownerEOA || null
  }, [selectedAccountIsSmartAccount, widgetState.accounts.smartAccounts, selectedAccount])

  const isSmartAccountSupported = useMemo(() => {
    return aaSupportedChainIds.includes(widgetState.network.chainId)
  }, [widgetState.network.chainId])

  const enableDelegationAuthorization = useMemo(() => {
    return widgetState.providers.selectedProvider === 'vm-prague' || widgetState.providers.selectedProvider === 'vm-osaka'
  }, [widgetState.providers.selectedProvider])

  const delegationAddress = useMemo(() => {
    return widgetState.accounts.delegations?.[selectedAccount?.account]
  }, [widgetState.accounts.delegations, selectedAccount])

  // Build hierarchical account structure: regular accounts with their smart accounts
  const hierarchicalAccounts = useMemo(() => {
    // Create a set of smart account addresses for quick lookup
    const smartAccountAddresses = new Set(
      widgetState.accounts.smartAccounts.map(sa => sa.account.toLowerCase())
    )

    // Group smart accounts by their owner
    const ownerToSmartAccountsMap = new Map<string, SmartAccount[]>()

    widgetState.accounts.smartAccounts.forEach((smartAccount) => {
      const owner = smartAccount.ownerEOA?.toLowerCase()
      if (owner) {
        if (!ownerToSmartAccountsMap.has(owner)) {
          ownerToSmartAccountsMap.set(owner, [])
        }
        ownerToSmartAccountsMap.get(owner).push(smartAccount)
      }
    })

    // Build display list with regular accounts followed by their smart accounts
    const displayList: Array<{ account: Account | SmartAccount; isSmartAccount: boolean; level: number }> = []

    widgetState.accounts.defaultAccounts.forEach((account) => {
      // Skip if this account is a smart account (it will be shown under its owner)
      if (smartAccountAddresses.has(account.account.toLowerCase())) {
        return
      }

      // Add regular account at level 0
      displayList.push({ account, isSmartAccount: false, level: 0 })

      // Add smart accounts owned by this account at level 1
      const ownedSmartAccounts = ownerToSmartAccountsMap.get(account.account.toLowerCase())
      if (ownedSmartAccounts) {
        ownedSmartAccounts.forEach((smartAccount) => {
          displayList.push({ account: smartAccount, isSmartAccount: true, level: 1 })
        })
      }
    })

    return displayList
  }, [widgetState.accounts.defaultAccounts, widgetState.accounts.smartAccounts])

  const handleDeleteDelegation = async () => {
    trackMatomoEvent({ category: 'udapp', action: 'deleteDelegation', name: shortenAddress(selectedAccount?.account), isClick: true })
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
      <div className='card mx-2 mb-2 pb-3 env-card' style={{ '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <div className="d-flex align-items-center">
            <h6 className="my-auto env-card-heading">{intl.formatMessage({ id: 'udapp.environment' })}</h6>
          </div>
          <div className="toggle-container">
            {widgetState.providers?.selectedProvider?.startsWith('vm') && !widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
              <button data-id="fork-state-icon" className='btn btn-primary btn-sm small me-2 btn-small-text' onClick={handleForkClick}>
                <i className='fas fa-code-branch'></i> {intl.formatMessage({ id: 'udapp.fork' })}
              </button>
            )}
            {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
              <button data-id="delete-state-icon" className='btn btn-outline-danger btn-sm small btn-small-text' onClick={handleResetClick}>
                <i className='fas fa-redo'></i> {intl.formatMessage({ id: 'udapp.reset' })}
              </button>
            )}
          </div>
        </div>
        {widgetState.fork.isVisible.forkUI && <ForkUI />}
        {widgetState.fork.isVisible.resetUI && <ResetUI />}
        {!widgetState.fork.isVisible.forkUI && !widgetState.fork.isVisible.resetUI && (
          <div className="d-flex p-3 pt-0">
            <Dropdown className="w-100" show={isEnvironmentDropdownOpen} onToggle={(isOpen) => {
              if (isOpen) {
                trackMatomoEvent({ category: 'udapp', action: 'environmentDropdownOpen', name: selectedProvider?.category || selectedProvider?.displayName || 'Remix VM' })
              }
              if (isOpen && isSubCategoryDropdownOpen) setIsSubCategoryDropdownOpen(false)
              if (isOpen && isAccountDropdownOpen) setIsAccountDropdownOpen(false)
              setIsEnvironmentDropdownOpen(isOpen)
              if (!isOpen) setIsSubCategoryDropdownOpen(false)
            }}>
              <Dropdown.Toggle
                as={EnvironmentToggle}
                data-id="settingsSelectEnvOptions"
                className="w-100 d-inline-block border form-control env-toggle"
                environmentUI={<EnvCategoryUI
                  key={selectedProvider?.category || widgetState.providers.selectedProvider}
                  isOpen={isSubCategoryDropdownOpen}
                  onToggle={(isOpen: boolean) => {
                    setIsSubCategoryDropdownOpen(isOpen)
                    if (isOpen) setIsEnvironmentDropdownOpen(false)
                    if (isOpen && isAccountDropdownOpen) setIsAccountDropdownOpen(false)
                  }}
                />}
              >
                <div className="env-toggle-content">
                  <div className="text-truncate text-secondary">
                    <span data-id={`selected-provider-${widgetState.providers.selectedProvider}`}> { selectedProvider?.category || selectedProvider?.displayName || 'Remix VM' }</span>
                    <span className="pe-1">
                      <i className="fas fa-caret-down text-secondary ms-2"></i>
                    </span>
                  </div>
                </div>
              </Dropdown.Toggle>

              <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden dropdown-menu-env p-0">
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
            { hierarchicalAccounts.length > 0 &&
            <Dropdown className="w-100" show={!widgetState.accounts.isRequesting && isAccountDropdownOpen} onToggle={(isOpen) => {
              if (!widgetState.accounts.isRequesting) {
                if (isOpen) {
                  trackMatomoEvent({ category: 'udapp', action: 'accountDropdownOpen', name: shortenAddress(selectedAccount?.account) })
                }
                setIsAccountDropdownOpen(isOpen)
              }
            }}>
              <Dropdown.Toggle as={AddressToggle} data-id="runTabSelectAccount" className={`w-100 d-inline-block border form-control ${!selectedAccountIsSmartAccount ? 'selected-account-hover' : ''} account-toggle ${isAccountDropdownOpen ? 'dropdown-open' : ''} ${widgetState.accounts.isRequesting ? 'disabled' : ''}`} style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', cursor: widgetState.accounts.isRequesting ? 'not-allowed' : 'pointer', opacity: widgetState.accounts.isRequesting ? 0.6 : 1 }}>
                {widgetState.accounts.isRequesting ? (
                  <div className="d-flex align-items-center justify-content-center w-100">
                    <i className="fas fa-spinner fa-spin"></i>
                  </div>
                ) : (
                  <div className="d-flex align-items-center">
                    <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm w-100">
                      <div className="d-flex align-items-center justify-content-between w-100">
                        <div className='d-flex align-items-start account-info-container'>
                          {selectedAccountIsSmartAccount && (
                            <CustomTooltip
                              placement="top"
                              tooltipClasses="text-nowrap"
                              tooltipId="selected-smart-account-badge-tooltip"
                              tooltipText="Smart Account"
                            >
                              <span className="smart-account-badge smart-account-badge-selected">S</span>
                            </CustomTooltip>
                          )}
                          <div className='d-flex flex-column align-items-start ms-1'>
                            <div className="text-truncate text-dark d-flex align-items-center">
                              {editingAccountId === 'selected' ? (
                                <input
                                  ref={editingInputRef}
                                  type="text"
                                  className="form-control form-control-sm edit-account-input"
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
                            <div className="account-address-label">
                              <span className="small">{shortenAddress(selectedAccount?.account)}</span>
                              <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => selectedAccount?.account} callback={() => trackMatomoEvent({ category: 'udapp', action: 'copyAccountAddress', name: shortenAddress(selectedAccount?.account), isClick: true })}>
                                <i className="fa-solid fa-copy small ms-1 copy-icon"></i>
                              </CopyToClipboard>
                            </div>
                          </div>
                        </div>
                        <div className={`selected-account-balance-container account-balance-color ${openKebabMenuId === 'selected' ? 'kebab-menu-open' : ''}`}>
                          <span className="selected-account-balance-text">{`${selectedAccount?.balance} ${selectedAccount?.symbol}`}</span>
                          <i
                            ref={(el) => {
                              if (el && selectedAccount) kebabIconRefs.current['selected'] = el
                            }}
                            className="selected-account-kebab-icon fas fa-ellipsis-v cursor-pointer"
                            data-id="selected-account-kebab-menu"
                            onClick={(e) => {
                              setIsAccountDropdownOpen(false)
                              handleKebabClick(e, 'selected')
                            }}
                          ></i>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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

              <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden dropdown-menu-env p-0">
                {
                  hierarchicalAccounts.map((item, index) => {
                    const { account, isSmartAccount, level } = item
                    const accountId = isSmartAccount ? `smart-account-${index}` : `account-${index}`
                    const accountData = account as Account
                    const isIndented = isSmartAccount && level > 0

                    return (
                      <div key={index} className={isSmartAccount ? 'smart-account-item' : ''}>
                        <Dropdown.Item
                          data-id={accountData.account}
                          className={`d-flex align-items-center justify-content-between py-1 account-item-hover cursor-pointer ${isIndented ? 'indented-account indented-dropdown-item' : 'normal-dropdown-item'}`}
                          onClick={() => handleAccountSelection(accountData)}
                        >
                          <div className='d-flex align-items-start indented-account-wrapper'>
                            {isIndented && (
                              <>
                                <div className="tree-connector-vertical"></div>
                                <div className="tree-connector-horizontal"></div>
                              </>
                            )}
                            {isSmartAccount && (
                              <CustomTooltip
                                placement="top"
                                tooltipClasses="text-nowrap"
                                tooltipId={`smart-account-badge-tooltip-${index}`}
                                tooltipText="Smart Account"
                              >
                                <span className="smart-account-badge smart-account-badge-dropdown">S</span>
                              </CustomTooltip>
                            )}
                            <div className='d-flex flex-column align-items-start'>
                              <div className="text-truncate text-dark d-flex align-items-center">
                                {editingAccountId === accountId ? (
                                  <input
                                    ref={editingInputRef}
                                    type="text"
                                    className="form-control form-control-sm edit-account-input"
                                    value={editingAlias}
                                    onChange={(e) => setEditingAlias(e.target.value)}
                                    onKeyDown={(e) => handleAliasKeyDown(e, accountData?.account)}
                                    onBlur={() => handleSaveAlias(accountData?.account)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <span>{accountData?.alias}</span>
                                )}
                              </div>
                              <div className="account-address-label">
                                <span className="small">{shortenAddress(accountData?.account)}</span>
                                <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => accountData?.account} callback={() => trackMatomoEvent({ category: 'udapp', action: 'copyAccountAddress', name: shortenAddress(accountData?.account), isClick: true })}>
                                  <i className="fa-solid fa-copy small ms-1 copy-icon"></i>
                                </CopyToClipboard>
                              </div>
                            </div>
                          </div>
                          <div className={`account-balance-container account-balance-color ${openKebabMenuId === accountId ? 'kebab-menu-open' : ''}`}>
                            <span className="account-balance-text">{`${accountData?.balance} ${accountData?.symbol}`}</span>
                            <i
                              ref={(el) => {
                                if (el) kebabIconRefs.current[accountId] = el
                              }}
                              className="account-kebab-icon fas fa-ellipsis-v cursor-pointer"
                              onClick={(e) => handleKebabClick(e, accountId)}
                            ></i>
                          </div>
                        </Dropdown.Item>
                        <AccountKebabMenu
                          show={openKebabMenuId === accountId}
                          target={kebabIconRefs.current[accountId]}
                          onHide={() => setOpenKebabMenuId(null)}
                          account={accountData}
                          menuIndex={index}
                          onRenameAccount={handleRenameAccount}
                          onDeleteAccount={isSmartAccount ? undefined : handleDeleteAccount}
                        />
                      </div>
                    )
                  })
                }
              </Dropdown.Menu>
            </Dropdown>
            }
          </div>)}
        {!widgetState.fork.isVisible.resetUI && selectedSmartAccountOwner && (
          <div className="px-3">
            <div className="d-flex align-items-center mt-2">
              <span className="owner-label-badge d-flex align-items-center">
                Owner: {shortenAddress(selectedSmartAccountOwner)}
                <CopyToClipboard tip="Copy owner address" icon="fa-copy" direction="top" getContent={() => selectedSmartAccountOwner} callback={() => trackMatomoEvent({ category: 'udapp', action: 'copyAccountAddress', name: shortenAddress(selectedSmartAccountOwner), isClick: true })}>
                  <i className="fa-solid fa-copy ms-2 copy-icon"></i>
                </CopyToClipboard>
              </span>
            </div>
          </div>
        )}
        {enableDelegationAuthorization && delegationAddress && (
          <div className="px-3">
            <div className="alert alert-info d-flex align-items-center justify-content-between p-2 mt-2 mb-0 rounded delegation-alert">
              <div className="d-flex align-items-center small">
                <span className="me-2">Delegation:</span>
                <span className="text-truncate delegation-address">{shortenAddress(delegationAddress)}</span>
                <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => delegationAddress} callback={() => trackMatomoEvent({ category: 'udapp', action: 'copyDelegationAddress', name: shortenAddress(delegationAddress), isClick: true })}>
                  <i className="fa-solid fa-copy small ms-1 copy-icon"></i>
                </CopyToClipboard>
              </div>
              <i
                className="fas fa-times cursor-pointer"
                data-id="delete-delegation"
                onClick={handleDeleteDelegation}
              ></i>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default EnvironmentPortraitView
