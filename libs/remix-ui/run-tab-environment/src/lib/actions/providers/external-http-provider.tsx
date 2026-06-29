import React from 'react' // eslint-disable-line
import * as packageJson from '../../../../../../../package.json'
import { FormattedMessage } from 'react-intl'
import { AbstractProvider } from './abstract-provider'

const profile = {
  name: 'basic-http-provider',
  displayName: 'External Http Provider',
  kind: 'provider',
  description: 'External Http Provider',
  methods: ['sendAsync', 'init'],
  version: packageJson.version
}

export class ExternalHttpProvider extends AbstractProvider {
  constructor(blockchain) {
    super(profile, blockchain, 'http://127.0.0.1:8545')
  }

  body(): JSX.Element {
    const thePath = '<path/to/local/folder/for/test/chain>'
    return (
      <>
        <div className="pe-1">
          <FormattedMessage
            id="udapp.externalHttpProviderText1"
            values={{
              a: (chunks) => (
                <a href="https://geth.ethereum.org/docs/rpc/server" target="_blank" rel="noreferrer">
                  <>{chunks}</>
                </a>
              )
            }}
          />
          <div className="border p-1 mt-2 mb-3">geth --http --http.corsdomain https://remix.ethereum.org</div>
          <FormattedMessage
            id="udapp.externalHttpProviderText2"
            values={{
              a: (chunks) => (
                <a href="https://geth.ethereum.org/getting-started/dev-mode" target="_blank" rel="noreferrer">
                  <>{chunks}</>
                </a>
              )
            }}
          />
          <div className="border p-1 mt-2 mb-3">
            geth --http --http.corsdomain="{window.origin}" --http.api web3,eth,debug,net --vmdebug --datadir {thePath} --dev console
          </div>
          <div className='alert-warning p-1 mb-3 px-2'>
            <FormattedMessage id="udapp.externalHttpProviderText3" values={{ b: (chunks) => <b><p className='pt-2'>{chunks}</p></b> }} />
          </div>
          <FormattedMessage
            id="udapp.externalHttpProviderText4"
            values={{
              a: (chunks) => (
                <a href="https://remix-ide.readthedocs.io/en/latest/run.html#more-about-web3-provider" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              )
            }}
          />
          <label className='pt-4 mb-0'>
            External HTTP Provider Endpoint
          </label>
        </div>
      </>
    )
  }
}
