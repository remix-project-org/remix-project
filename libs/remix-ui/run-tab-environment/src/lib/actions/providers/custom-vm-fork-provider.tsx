import React, {useRef} from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import * as packageJson from '../../../../../../../package.json'
import { AppModal, ModalTypes } from '@remix-ui/app'
import { BasicVMProvider } from './vm-provider'
import { Hardfork } from '@ethereumjs/common'

export class CustomForkVMProvider extends BasicVMProvider {
  nodeUrl: string
  blockNumber: number | 'latest'
  inputs: any

  constructor(blockchain) {
    super(
      {
        name: 'vm-custom-fork',
        displayName: 'Custom fork - Remix VM',
        kind: 'provider',
        description: 'Custom fork - Remix VM',
        methods: ['sendAsync', 'init'],
        version: packageJson.version
      },
      blockchain
    )
    this.blockchain = blockchain
    this.fork = ''
    this.nodeUrl = ''
    this.blockNumber = 'latest'
    this.inputs = {}
  }

  async init() {
    const body = () => {
      return (
        <div>
          <span>
            <FormattedMessage id="udapp.customVmForkProviderText" />
          </span>
          <div>
            <label className="mt-3 mb-1">
              <FormattedMessage id="udapp.nodeUrl" />
            </label>
            <input data-id="CustomForkNodeUrl" name="nodeUrl" type="text" className="border form-control border-end-0" />
          </div>
          <div>
            <label className="mt-3 mb-1">
              <FormattedMessage id="udapp.blockNumber" />
            </label>
            <input
              data-id="CustomForkBlockNumber"
              name="blockNumber"
              type="text"
              defaultValue="latest"
              placeholder='block number or "latest"'
              className="border form-control border-end-0"
            />
          </div>
          <div>
            <label className="mt-3 mb-1">EVM</label>
            <select data-id="CustomForkEvmType" name="evmType" defaultValue="merge" className="border form-control border-end-0">
              {Object.keys(Hardfork).map((value, index) => {
                return (
                  <option value={Hardfork[value]} key={index}>
                    {value}
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      )
    }
    const result = await ((): Promise<any> => {
      return new Promise((resolve, reject) => {
        const modalContent: AppModal = {
          id: this.profile.name,
          title: this.profile.displayName,
          message: body(),
          validationFn: (data: any) => {
            if (data.nodeUrl !== '' && !data.nodeUrl.startsWith('http')) {
              return {
                valid: false,
                message: 'node URL should be a valid URL'
              }
            }
            if (data.blockNumber !== 'latest' && isNaN(data.blockNumber)) {
              return {
                valid: false,
                message: 'blockNumber should be a number or "latest"'
              }
            }
            return {
              valid: true,
              message: ''
            }
          },
          modalType: ModalTypes.form,
          okLabel: 'Connect',
          cancelLabel: 'Cancel',
          okFn: (value: string) => {
            setTimeout(() => resolve(value), 0)
          },
          cancelFn: () => {
            setTimeout(() => reject(new Error('Canceled')), 0)
          },
          hideFn: () => {
            setTimeout(() => reject(new Error('Hide')), 0)
          }
        }
        return this.call('notification', 'modal', modalContent)
      })
    })()
    this.fork = result.evmType
    this.nodeUrl = result.nodeUrl
    if (this.nodeUrl) {
      const block = result.blockNumber
      this.blockNumber = block === 'latest' ? 'latest' : parseInt(block)
    } else {
      this.nodeUrl = undefined
      this.blockNumber = undefined
    }

    return {
      fork: this.fork,
      nodeUrl: this.nodeUrl,
      blockNumber: this.blockNumber
    }
  }
}
