import * as packageJson from '../../../../../package.json'
import React from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { AbstractProvider } from './abstract-provider'

const profile = {
  name: 'foundry-provider',
  displayName: 'Foundry Provider',
  kind: 'provider',
  description: 'Foundry Anvil provider',
  methods: ['sendAsync', 'init'],
  version: packageJson.version
}

export class FoundryProvider extends AbstractProvider {
  constructor(blockchain) {
    super(profile, blockchain, 'http://127.0.0.1:8545')
  }

  body(): JSX.Element {
    return (
      <div>
        {' '}
        <FormattedMessage id="udapp.foundryProviderText1" />
        <div className="p-1 ps-3">
          <b>curl -L https://foundry.paradigm.xyz | bash</b>
        </div>
        <div className="p-1 ps-3">
          <b>anvil --steps-tracing</b>
        </div>
        <div className="pt-2 pb-4">
          <FormattedMessage
            id="udapp.foundryProviderText2"
            values={{
              a: (chunks) => (
                <a href="https://github.com/foundry-rs/foundry" target="_blank">
                  {chunks}
                </a>
              )
            }}
          />
        </div>
        <div>Anvil JSON-RPC Endpoint:</div>
      </div>
    )
  }
}
