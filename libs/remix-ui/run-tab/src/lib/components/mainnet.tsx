// eslint-disable-next-line no-use-before-define
import React, { useEffect, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomTooltip } from '@remix-ui/helper'
import { MainnetProps } from '../types'
import { formatUnits, parseUnits } from 'ethers'

export function MainnetPrompt(props: MainnetProps) {
  const intl = useIntl()
  const [baseFee, setBaseFee] = useState<string>('')
  const [transactionFee, setTransactionFee] = useState<string>('')

  useEffect(() => {
    props.init((txFeeText, gasPriceValue, gasPriceStatus) => {
      if (txFeeText) setTransactionFee(txFeeText)
      if (gasPriceValue) onGasPriceChange(gasPriceValue)
      if (props.network && props.network.lastBlock && props.network.lastBlock.baseFeePerGas) {
        const baseFee = formatUnits(BigInt(props.network.lastBlock.baseFeePerGas), 'gwei')
        setBaseFee(baseFee)
        onMaxFeeChange(baseFee)
      }
      if (gasPriceStatus !== undefined) props.updateGasPriceStatus(gasPriceStatus)
    })
  }, [])

  const onMaxFeeChange = (value: string) => {
    const maxFee = value
    if (BigInt(props.network.lastBlock.baseFeePerGas) > BigInt(parseUnits(maxFee, 'gwei'))) {
      setTransactionFee(intl.formatMessage({ id: 'udapp.transactionFee' }))
      props.updateGasPriceStatus(false)
      props.updateConfirmSettings(true)
      return
    } else {
      props.updateGasPriceStatus(true)
      props.updateConfirmSettings(false)
    }

    props.setNewGasPrice(maxFee, (txFeeText, priceStatus) => {
      setTransactionFee(txFeeText)
      if (priceStatus) {
        props.updateConfirmSettings(false)
      } else {
        props.updateConfirmSettings(true)
      }
      props.updateGasPriceStatus(priceStatus)
      props.updateMaxFee(maxFee)
      props.updateBaseFeePerGas(props.network.lastBlock.baseFeePerGas)
    })
  }

  const onGasPriceChange = (value: string) => {
    const gasPrice = value

    props.setNewGasPrice(gasPrice, (txFeeText, priceStatus) => {
      setTransactionFee(txFeeText)
      props.updateGasPriceStatus(priceStatus)
      props.updateGasPrice(gasPrice)
    })
  }

  const onMaxPriorityFeeChange = (value: string) => {
    props.updateMaxPriorityFee(value)
  }

  return (
    <div>
      <div className="text-dark">
        <FormattedMessage id="udapp.mainnetText1" values={{ name: props.network.name }} />
        <br />
        <FormattedMessage id="udapp.mainnetText2" values={{ name: props.network.name }} />
      </div>
      <div className="mt-3">
        <div>
          <span className="text-dark me-2">From:</span>
          <span>{props.tx.from}</span>
        </div>
        <div>
          <span className="text-dark me-2">To:</span>
          <span>{props.tx.to ? props.tx.to : `(${intl.formatMessage({ id: 'udapp.contractCreation' })})`}</span>
        </div>
        <div className="d-flex align-items-center">
          <span className="text-dark me-2">Data:</span>
          <pre className="udapp_wrapword mb-0">
            {props.tx.data && props.tx.data.length > 50 ? props.tx.data.substring(0, 49) + '...' : props.tx.data}
            <CopyToClipboard tip={intl.formatMessage({ id: 'udapp.copy' })} content={props.tx.data} />
          </pre>
        </div>
        <div className="mb-3">
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.amount" />:
          </span>
          <span>{props.amount} Ether</span>
        </div>
        <div>
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.gasEstimation" />:
          </span>
          <span>{props.gasEstimation}</span>
        </div>
        <div>
          <span className="text-dark me-2">
            <FormattedMessage id="udapp.gasLimit" />:
          </span>
          <span>{props.tx.gasLimit}</span>
        </div>
        {props.network.lastBlock.baseFeePerGas ? (
          <div>
            <CustomTooltip
              placement="top"
              tooltipText={intl.formatMessage({ id: 'udapp.title1' })}
              tooltipId="maxPriorityFeeTooltip"
            >
              <div className="align-items-center my-1">
                <div className="d-flex">
                  <span className="text-dark me-2 text-nowrap">
                    <FormattedMessage id="udapp.maxPriorityFee" />:
                  </span>
                  <input
                    className="form-control me-1 text-end"
                    style={{ height: '1.2rem', width: '6rem' }}
                    id="maxpriorityfee"
                    onInput={(e: any) => onMaxPriorityFeeChange(e.target.value)}
                    defaultValue={props.maxPriorityFee}
                  />
                  <CustomTooltip
                    placement="top"
                    tooltipText="visit https://ethgasstation.info for current gas price info."
                    tooltipId="gweiTooltip"
                  >
                    <span>Gwei</span>
                  </CustomTooltip>
                </div>
              </div>
            </CustomTooltip>
            <CustomTooltip
              placement="top"
              tooltipText={intl.formatMessage({ id: 'udapp.title2' })}
              tooltipId="maxFeeTooltip"
            >
              <div className="align-items-center my-1">
                <div className="d-flex">
                  <span className="text-dark me-2 text-nowrap">
                    <FormattedMessage id="udapp.maxFee" values={{ baseFeePerGas: formatUnits(BigInt(props.network.lastBlock.baseFeePerGas), 'gwei') }} />:
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
            </CustomTooltip>
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
