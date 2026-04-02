import React, { useContext, useEffect } from 'react'
import { AppContext, appActionTypes } from '@remix-ui/app'
import { Provider } from '@remix-ui/environment-explorer'
import { desktopConnection } from '@remix-api'

interface DesktopClientState {
  connected: desktopConnection
  providers: Provider[]
  disableconnect: boolean
  currentContext: string
}

export const providerLogos = {
  'injected-metamask-optimism': ['assets/img/optimism-ethereum-op-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-arbitrum': ['assets/img/arbitrum-arb-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-gnosis': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-chiado': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-linea': ['assets/img/linea_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-sepolia': ['assets/img/metamask.png'],
  'injected-metamask-ephemery': ['assets/img/metamask.png'],
  'injected-MetaMask': ['assets/img/metamask.png'],
  'injected-Brave Wallet': ['assets/img/brave.png'],
  'injected-Trust Wallet': ['assets/img/trust-wallet.png'],
  'hardhat-provider': ['assets/img/hardhat.png'],
  'walletconnect': ['assets/img/Walletconnect-logo.png'],
  'foundry-provider': ['assets/img/foundry.png']
}

const DesktopClientUI = (props: DesktopClientState & { openDesktopApp: () => void } & { onConnect: (providerName: Provider) => void }) => {
  const appContext = useContext(AppContext)
  const { connected, providers, onConnect, disableconnect, currentContext } = props
  const [title, setTitle] = React.useState('Connecting...')
  const [disabled, setDisabled] = React.useState(false)
  const [hasInjected, setHasInjected] = React.useState(false)
  const [hasBrave, setHasBrave] = React.useState(false)
  const [filteredList, setFilteredList] = React.useState<Provider[]>([])

  useEffect(() => {
    console.log('connected', props.connected)
    appContext.appStateDispatch({
      type: appActionTypes.setConnectedToDesktop,
      payload: props.connected,
    })
    appContext.appStateDispatch({
      type: appActionTypes.setShowPopupPanel,
      payload: false,
    })
  }, [props.connected])

  useEffect(() => {
    console.log('providers', props.providers)
    const injectedProviders = providers.find((provider) => provider.config.isInjected)
    const braveProvider = providers.find((provider) => provider.name.toLowerCase().includes('brave'))
    setHasInjected(!!injectedProviders)
    setHasBrave(!!braveProvider)

    setFilteredList(providers.filter((provider) => provider.config.isInjected == true && !provider.name.toLocaleLowerCase().includes('brave')))

  }, [providers])

  useEffect(() => {
    if (hasInjected) {
      setTitle('Connect to Browser Wallet')
      setDisabled(false)
    } else if (hasBrave && !hasInjected) {
      setTitle('Brave Wallet is not supported')
      setDisabled(true)
    } else {
      setTitle('Connecting...')
    }

  }, [hasInjected, hasBrave])

  if (disabled) {
    return (
      <div>
        <div className="flex p-4 bg-light flex-col">
          <h3>{title}</h3>
          <p>
            The Brave Wallet is not supported at this time.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex p-4 bg-light flex-col">
        <h3>{title}</h3>
        <p>
          1. Connect to your favorite Ethereum wallet provider
          <br></br>2. Go back to the Remix Desktop application
          <br></br>3. Deploy using 'Browser Wallet'
          {hasBrave && <div className='text-warning-600'>
            Note: Brave Wallet is not supported.
          </div>}
        </p>
      </div>

      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {filteredList && filteredList.length > 0 ? (
            filteredList
              .map((provider, index) => (
                <div key={index} className="">
                  <div className="bg-white dark:bg-surface-1 rounded-lg shadow-md border h-full">
                    <div className="p-4 flex flex-col items-center h-full">
                      <div className="flex mb-2">{providerLogos[provider.name] && providerLogos[provider.name].map((logo, index) => <img key={index} src={logo} className="w-8 h-8 mr-2" />)}</div>
                      <h5 className="text-lg font-semibold mb-2">{provider.displayName}</h5>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 text-center flex-1">{provider.description}</p>
                      <button data-id={`connection-btn-${provider.name}`} disabled={disableconnect || currentContext === provider.name} className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" onClick={() => onConnect(provider)}>
                        {disableconnect ? 'please wait  ...' : currentContext === provider.name ? 'Connected' : 'Connect'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <div className="col-span-full">
              <div className="bg-warning/10 border border-warning text-warning-800 p-4 rounded-lg" role="alert">
                No injected providers found. Please install MetaMask or another browser wallet.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DesktopClientUI
