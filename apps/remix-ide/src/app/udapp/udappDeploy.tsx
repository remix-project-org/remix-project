import React from 'react'
import { Plugin } from '@remixproject/engine'
import { DeployWidget } from '@remix-ui/run-tab-deploy'
import { DeployWidgetState, Actions, GasEstimationPrompt, MainnetPrompt, DeployUdappTx, DeployUdappNetwork } from '@remix-ui/run-tab-deploy'
import BN from 'bn.js'
import { parseUnits } from 'ethers'

const profile = {
  name: 'udappDeploy',
  displayName: 'Udapp Deploy',
  description: 'Handles contract deployment UI and state',
  methods: ['getUI', 'getGasLimit', 'getValueUnit', 'getMaxFee', 'getMaxPriorityFee', 'getBaseFeePerGas', 'getGasPrice', 'getConfirmSettings', 'getValue', 'getGasEstimationPrompt', 'getMainnetPrompt', 'getGasPriceStatus', 'setValue', 'setValueUnit', 'setBaseFeePerGas', 'getCompiledContracts'],
  events: []
}

export class DeployPlugin extends Plugin {
  editor: any
  fileManager: any
  getWidgetState: (() => DeployWidgetState) | null = null
  private getDispatch: (() => React.Dispatch<Actions>) | null = null
  constructor () {
    super(profile)
  }

  setStateGetter(getter: () => DeployWidgetState) {
    this.getWidgetState = getter
  }

  setDispatchGetter(getter: () => React.Dispatch<Actions>) {
    this.getDispatch = getter
  }

  getGasLimit(): string {
    return '0x' + new BN(this.getWidgetState()?.gasLimit, 10).toString(16)
  }

  getValue(): bigint {
    return parseUnits(this.getWidgetState()?.value.toString() || '0', this.getValueUnit() || 'gwei')
  }

  getValueUnit(): 'wei' | 'gwei' | 'finney' | 'ether' {
    return this.getWidgetState()?.valueUnit
  }

  getMaxFee(): string {
    return this.getWidgetState()?.maxFee
  }

  getMaxPriorityFee(): string {
    return this.getWidgetState()?.maxPriorityFee
  }

  getBaseFeePerGas(): string {
    return this.getWidgetState()?.baseFeePerGas
  }

  getGasPrice(): string {
    return this.getWidgetState()?.gasPrice
  }

  getConfirmSettings(): boolean {
    return this.getWidgetState()?.confirmSettings
  }

  getGasEstimationPrompt(msg: string): React.ReactElement {
    return <GasEstimationPrompt msg={msg} />
  }

  getMainnetPrompt(tx: DeployUdappTx, network: DeployUdappNetwork, amount: string, gasEstimation: string, gasPriceValue: string): React.ReactElement {
    return <MainnetPrompt udappDeploy={this} tx={tx} network={network} amount={amount} gasEstimation={gasEstimation} gasPriceValue={gasPriceValue} />
  }

  getGasPriceStatus(): boolean {
    return this.getWidgetState()?.gasPriceStatus
  }

  getCompiledContracts() {
    return this.getWidgetState()?.contracts.contractList
  }

  setGasPriceStatus(status: boolean) {
    this.getDispatch()({ type: 'SET_GAS_PRICE_STATUS', payload: status })
  }

  setConfirmSettings(confirmation: boolean) {
    this.getDispatch()({ type: 'SET_CONFIRM_SETTINGS', payload: confirmation })
  }

  setMaxPriorityFee(fee: string) {
    this.getDispatch()({ type: 'SET_MAX_PRIORITY_FEE', payload: fee })
  }

  setGasPrice(price: string) {
    this.getDispatch()({ type: 'SET_GAS_PRICE', payload: price })
  }

  setMaxFee(fee: string) {
    this.getDispatch()({ type: 'SET_MAX_FEE', payload: fee })
  }

  setBaseFeePerGas(fee: string) {
    this.getDispatch()({ type: 'SET_BASE_FEE_PER_GAS', payload: fee })
  }

  setValue(value: string) {
    this.getDispatch()({ type: 'SET_VALUE', payload: parseInt(value) })
  }

  setValueUnit(unit: 'wei' | 'gwei' | 'finney' | 'ether') {
    this.getDispatch()({ type: 'SET_VALUE_UNIT', payload: unit })
  }

  getUI() {
    return <DeployWidget plugin={this} />
  }
}

