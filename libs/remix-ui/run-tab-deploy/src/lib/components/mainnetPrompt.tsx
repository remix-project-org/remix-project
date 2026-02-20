import React, { useState, useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { formatUnits, parseUnits } from 'ethers'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { DeployPlugin } from 'apps/remix-ide/src/app/udapp/udappDeploy'
import { DeployUdappTx, DeployUdappNetwork } from '../types'

export function MainnetPrompt({ udappDeploy, tx, network, amount, gasEstimation, gasPriceValue }: { udappDeploy: DeployPlugin, tx: DeployUdappTx, network: DeployUdappNetwork, amount: string, gasEstimation: string, gasPriceValue: string }) {
  const intl = useIntl()
  const [baseFee, setBaseFee] = useState<string>('')
  const [transactionFee, setTransactionFee] = useState<string>('')
  const [maxPriorityFee, setMaxPriorityFee] = useState<string>('')

  useEffect(() => {
    const maxPriorityFee = udappDeploy.getMaxPriorityFee()

    setMaxPriorityFee(maxPriorityFee)
    if (gasPriceValue) onGasPriceChange(gasPriceValue)
    if (network && network.lastBlock && network.lastBlock.baseFeePerGas) {
      const baseFee = formatUnits(BigInt(network.lastBlock.baseFeePerGas), 'gwei')

      setBaseFee(baseFee)
      onMaxFeeChange(baseFee)
    }
  }, [tx, network, amount, gasEstimation])

  const determineGasFees = (gasPriceValue) => {
    try {
      const fee = BigInt(gasEstimation) * BigInt(parseUnits(gasPriceValue.toString(10) as string, 'gwei'))
      const txFeeText = ' ' + formatUnits(fee.toString(10), 'ether') + ' Ether'

      setTransactionFee(txFeeText)
      udappDeploy.setGasPriceStatus(true)
      udappDeploy.setConfirmSettings(false)
    } catch (e) {
      const txFeeText = ' Please fix this issue before sending any transaction. ' + e.message

      setTransactionFee(txFeeText)
      udappDeploy.setGasPriceStatus(false)
      udappDeploy.setConfirmSettings(true)
    }
  }

  const onMaxFeeChange = (value: string) => {
    const maxFee = value
    if (BigInt(network.lastBlock.baseFeePerGas) > BigInt(parseUnits(maxFee, 'gwei'))) {
      setTransactionFee(intl.formatMessage({ id: 'udapp.transactionFee' }))
      udappDeploy.setGasPriceStatus(false)
      udappDeploy.setConfirmSettings(true)
      return
    } else {
      udappDeploy.setGasPriceStatus(true)
      udappDeploy.setConfirmSettings(false)
    }
    determineGasFees(maxFee)
    udappDeploy.setMaxFee(maxFee)
    udappDeploy.setBaseFeePerGas(network.lastBlock.baseFeePerGas)
  }

  const onGasPriceChange = (value: string) => {
    determineGasFees(value)
    udappDeploy.setGasPriceStatus(true)
    udappDeploy.setGasPrice(value)
  }

  const onMaxPriorityFeeChange = (value: string) => {
    udappDeploy.setMaxPriorityFee(value)
    setMaxPriorityFee(value)
  }

  return (
    <div>
      <div className="text-dark">
        <FormattedMessage id="udapp.mainnetText1" values={{ name: network.name }} />
        <br />
        <FormattedMessage id="udapp.mainnetText2" values={{ name: network.name }} />
      </div>
      <div className="mt-3">
        <div>
          <span className="text-dark me-2">From:</span>
          <span>{tx.from}</span>
        </div>
        <div>
          <span className="text-dark me-2">To:</span>
          <span>{tx.to ? tx.to : `(${intl.formatMessage({ id: 'udapp.contractCreation' })})`}</span>
        </div>
        <div className="d-flex align-items-center">
          <span className="text-dark me-2">Data:</span>
          <pre className="udapp_wrapword mb-0">
            {tx.data && tx.data.length > 50 ? tx.data.substring(0, 49) + '...' : tx.data}
            <CopyToClipboard tip={intl.formatMessage({ id: 'udapp.copy' })} content={tx.data} />
          </pre>
        </div>
        <div className="mb-3">
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.amount" />:
          </span>
          <span>{amount} Ether</span>
        </div>
        <div>
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.gasEstimation" />:
          </span>
          <span>{gasEstimation}</span>
        </div>
        <div>
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.gasLimit" />:
          </span>
          <span>{tx.gasLimit}</span>
        </div>
        {network?.lastBlock?.baseFeePerGas ? (
          <div>
            <div className="align-items-center my-1" title={intl.formatMessage({ id: 'udapp.title1' })}>
              <div className="d-flex">
                <span className="text-dark me-2 text-nowrap">
                  <FormattedMessage id="udapp.maxPriorityFee" />:
                </span>
                <input
                  className="form-control me-1 text-end"
                  style={{ height: '1.2rem', width: '6rem' }}
                  id="maxpriorityfee"
                  onInput={(e: any) => onMaxPriorityFeeChange(e.target.value)}
                  defaultValue={maxPriorityFee}
                />
                <span title="visit https://ethgasstation.info for current gas price info.">Gwei</span>
              </div>
            </div>
            <div className="align-items-center my-1" title={intl.formatMessage({ id: 'udapp.title2' })}>
              <div className="d-flex">
                <span className="text-dark me-2 text-nowrap">
                  <FormattedMessage id="udapp.maxFee" values={{ baseFeePerGas: formatUnits(BigInt(network.lastBlock.baseFeePerGas), 'gwei') }} />:
                </span>
                <input
                  className="form-control me-1 text-end"
                  style={{ height: '1.2rem', width: '6rem' }}
                  id="maxfee"
                  onInput={(e: any) => onMaxFeeChange(e.target.value)}
                  defaultValue={baseFee}
                />
                <span>Gwei</span>
                <span className="text-dark ms-2"></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="d-flex align-items-center my-1">
            <span className="text-dark me-2 text-nowrap">
              <FormattedMessage id="udapp.gasPrice" />:
            </span>
            <input className="form-control me-1 text-end" style={{ width: '40px', height: '28px' }} id="gasprice" onInput={(e: any) => onGasPriceChange(e.target.value)} />
            <span>
                Gwei (
              <FormattedMessage
                id="udapp.gweiText"
                values={{
                  a: (
                    <a target="_blank" href="https://ethgasstation.info" rel="noreferrer">
                        ethgasstation.info
                    </a>
                  )
                }}
              />
                )
            </span>
          </div>
        )}
        <div className="mb-3">
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.maxTransactionFee" />:
          </span>
          <span className="text-warning" id="txfee">
            {transactionFee}
          </span>
        </div>
      </div>
      <div className="d-flex py-1 align-items-center form-check">
        <input className="form-check-input" id="confirmsetting" type="checkbox" />
        <label className="ms-1 mt-1 form-check-label" htmlFor="confirmsetting">
          <FormattedMessage id="udapp.mainnetText3" />
        </label>
      </div>
    </div>
  )
}
