import React from 'react' // eslint-disable-line
import * as packageJson from '../../../../../../../package.json'
import { FormattedMessage } from 'react-intl'
import { AbstractProvider } from './abstract-provider'

const profile = {
  name: 'hardhat-provider',
  displayName: 'Hardhat Provider',
  kind: 'provider',
  description: 'Hardhat provider',
  methods: ['sendAsync', 'init'],
  version: packageJson.version
}

export class HardhatProvider extends AbstractProvider {
  constructor(blockchain) {
    super(profile, blockchain, 'http://127.0.0.1:8545')
  }

  body(): JSX.Element {
    return (
      <div>
        {' '}
        <FormattedMessage id="udapp.hardhatProviderText1" />
        <div className="p-1 ps-3">
          <b>npx hardhat node</b>
        </div>
        <div className="pt-2 pb-4">
          <FormattedMessage
            id="udapp.hardhatProviderText2"
            values={{
              a: (chunks) => (
                <a href="https://hardhat.org/getting-started/#connecting-a-wallet-or-dapp-to-hardhat-network" target="_blank">
                  {chunks}
                </a>
              )
            }}
          />
        </div>
        <div>Hardhat JSON-RPC Endpoint:</div>
      </div>
    )
  }
}
