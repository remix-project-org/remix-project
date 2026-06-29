import React from 'react' // eslint-disable-line
import * as packageJson from '../../../../../../../package.json'
import { FormattedMessage } from 'react-intl'
import { AbstractProvider } from './abstract-provider'

const profile = {
  name: 'ganache-provider',
  displayName: 'Ganache Provider',
  kind: 'provider',
  description: 'Truffle Ganache provider',
  methods: ['sendAsync', 'init'],
  version: packageJson.version
}

export class GanacheProvider extends AbstractProvider {
  constructor(blockchain) {
    super(profile, blockchain, 'http://127.0.0.1:8545')
  }

  body(): JSX.Element {
    return (
      <div>
        {' '}
        <FormattedMessage id="udapp.ganacheProviderText1" />
        <div className="p-1 ps-3">
          <b>yarn global add ganache</b>
        </div>
        <div className="p-1 ps-3">
          <b>ganache</b>
        </div>
        <div className="pt-2 pb-4">
          <FormattedMessage
            id="udapp.ganacheProviderText2"
            values={{
              a: (chunks) => (
                <a href="https://github.com/trufflesuite/ganache" target="_blank">
                  {chunks}
                </a>
              )
            }}
          />
        </div>
        <div>Ganache JSON-RPC Endpoint:</div>
      </div>
    )
  }
}
