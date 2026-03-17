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
        <div className="d-flex p-4 bg-light flex-column">
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
      <div className="d-flex p-4 bg-light flex-column">
        <h3>{title}</h3>
        <p>
          1. Connect to your favorite Ethereum wallet provider
          <br></br>2. Go back to the Remix Desktop application
          <br></br>3. Deploy using 'Browser Wallet'
          {hasBrave && <div className='text-warning'>
            Note: Brave Wallet is not supported.
          </div>}
        </p>
      </div>

      <div>
        <div className="row">
          {filteredList && filteredList.length > 0 ? (
            filteredList
              .map((provider, index) => (
                <div key={index} className="col-md-4 mb-4">
                  <div className="provider-item card h-100">
                    <div className="card-body d-flex flex-column align-items-center">
                      <div className="d-flex mb-2">{providerLogos[provider.name] && providerLogos[provider.name].map((logo, index) => <img key={index} src={logo} style={{ width: '2rem', height: '2rem', marginRight: '0.5rem' }} />)}</div>
                      <h5 className="card-title">{provider.displayName}</h5>
                      <p className="card-text">{provider.description}</p>
                      <button data-id={`connection-btn-${provider.name}`} disabled={disableconnect || currentContext === provider.name} className="btn btn-primary mt-auto" onClick={() => onConnect(provider)}>
                        {disableconnect ? 'please wait  ...' : currentContext === provider.name ? 'Connected' : 'Connect'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
          ) : (
            <div className="col-12">
              <div className="alert alert-warning" role="alert">
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
