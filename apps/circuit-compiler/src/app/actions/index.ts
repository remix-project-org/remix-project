import * as snarkjs from 'snarkjs'
import type { CircomPluginClient } from "../services/circomPluginClient"
import { ActionPayloadTypes, AppState, ICircuitAppContext } from "../types"
import { GROTH16_VERIFIER, PLONK_VERIFIER } from './constant'
import { extractNameFromKey, extractParentFromKey } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'
import isElectron from 'is-electron'

export const compileCircuit = async (plugin: CircomPluginClient, appState: AppState) => {
  try {
    if (appState.status !== "compiling") {
      await plugin.compile(appState.filePath, { version: appState.version, prime: appState.primeValue })
    } else {
      console.log('Existing circuit compilation in progress')
    }
  } catch (e) {
    plugin.emit('statusChanged', { key: 'error', title: e.message, type: 'error' })
    plugin.internalEvents.emit('circuit_compiling_errored', e)
    console.error(e)
  }
}

export const computeWitness = async (plugin: CircomPluginClient, appState: AppState, dispatch: ICircuitAppContext['dispatch'], status: string, witnessValues: Record<string, string>) => {
  try {
    if (status !== "computing") {
      const input = JSON.stringify(witnessValues)
      const witness = await plugin.computeWitness(input)

      if (appState.exportWtnsJson) {
        const wtns = await snarkjs.wtns.exportJson(witness)
        const wtnsJson = wtns.map(wtn => wtn.toString())
        const fileName = extractNameFromKey(appState.filePath)
        const writePath = extractParentFromKey(appState.filePath) + `/.bin/${fileName.replace('.circom', '_js')}/${fileName.replace('.circom', '.wtn.json')}`

        await plugin.call('fileManager', 'writeFile', writePath, JSON.stringify(wtnsJson, null, 2))
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'compiler.generate_witness', name: 'wtns.exportJson', value: writePath, isClick: true })
      }
    } else {
      console.log('Existing witness computation in progress')
    }
  } catch (e) {
    plugin.emit('statusChanged', { key: 'error', title: e.message, type: 'error' })
    plugin.internalEvents.emit('circuit_computing_witness_errored', e)
    console.error('Computing witness failed: ', e)
  }
}

export const runSetupAndExport = async (plugin: CircomPluginClient, appState: AppState, dispatch: ICircuitAppContext['dispatch']) => {
  try {
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'exporting' })
    dispatch({ type: 'SET_SETUP_EXPORT_FEEDBACK', payload: null })
    plugin.emit('statusChanged', { key: 'none' })
    const ptau_final = `https://ipfs-cluster.ethdevops.io/ipfs/${appState.ptauList.find(ptau => ptau.name === appState.ptauValue)?.ipfsHash}`
    await plugin.generateR1cs(appState.filePath, { version: appState.version, prime: appState.primeValue })

    const fileName = extractNameFromKey(appState.filePath)
    const readPath = extractParentFromKey(appState.filePath) + `/.bin/${fileName.replace('.circom', '.r1cs')}`
    // @ts-ignore
    const r1csBuffer = await plugin.call('fileManager', 'readFile', readPath, { encoding: null })
    // @ts-ignore
    const r1cs = new Uint8Array(r1csBuffer)
    const zkey_final = { type: "mem" }

    if (appState.provingScheme === 'groth16') {
      trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'provingScheme', value: 'groth16', isClick: true })
      await snarkjs.zKey.newZKey(r1cs, ptau_final, zkey_final, zkLogger(plugin, dispatch, 'SET_SETUP_EXPORT_FEEDBACK'))
      const vKey = await snarkjs.zKey.exportVerificationKey(zkey_final, zkLogger(plugin, dispatch, 'SET_SETUP_EXPORT_FEEDBACK'))

      if (appState.exportVerificationKey) {
        await plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/groth16/zk/keys/verification_key.json`, JSON.stringify(vKey, null, 2))
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'zKey.exportVerificationKey', value: `${extractParentFromKey(appState.filePath)}/groth16/zk/keys/verification_key.json`, isClick: true })
      }
      if (appState.exportVerificationContract) {
        const templates = { groth16: GROTH16_VERIFIER }
        const solidityContract = await snarkjs.zKey.exportSolidityVerifier(zkey_final, templates, zkLogger(plugin, dispatch, 'SET_SETUP_EXPORT_FEEDBACK'))

        await plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/groth16/zk/build/zk_verifier.sol`, solidityContract)
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'zKey.exportSolidityVerifier', value: `${extractParentFromKey(appState.filePath)}/groth16/zk/build/zk_verifier.sol`, isClick: true })
      }
      dispatch({ type: 'SET_ZKEY', payload: zkey_final })
      dispatch({ type: 'SET_VERIFICATION_KEY', payload: vKey })
    } else if (appState.provingScheme === 'plonk') {
      trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'provingScheme', value: 'plonk', isClick: true })
      await snarkjs.plonk.setup(r1cs, ptau_final, zkey_final, zkLogger(plugin, dispatch, 'SET_SETUP_EXPORT_FEEDBACK'))
      const vKey = await snarkjs.zKey.exportVerificationKey(zkey_final, zkLogger(plugin, dispatch, 'SET_SETUP_EXPORT_FEEDBACK'))

      if (appState.exportVerificationKey) {
        await plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/plonk/zk/keys/verification_key.json`, JSON.stringify(vKey, null, 2))
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'zKey.exportVerificationKey', value: `${extractParentFromKey(appState.filePath)}/plonk/zk/keys/verification_key.json`, isClick: true })
      }
      if (appState.exportVerificationContract) {
        const templates = { plonk: PLONK_VERIFIER }
        const solidityContract = await snarkjs.zKey.exportSolidityVerifier(zkey_final, templates, zkLogger(plugin, dispatch, 'SET_SETUP_EXPORT_FEEDBACK'))

        await plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/plonk/zk/build/zk_verifier.sol`, solidityContract)
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'zKey.exportSolidityVerifier', value: `${extractParentFromKey(appState.filePath)}/plonk/zk/build/zk_verifier.sol`, isClick: true })
      }
      dispatch({ type: 'SET_ZKEY', payload: zkey_final })
      dispatch({ type: 'SET_VERIFICATION_KEY', payload: vKey })
    }
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'idle' })
    dispatch({ type: 'SET_SETUP_EXPORT_STATUS', payload: 'done' })
  } catch (e) {
    trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'runSetupAndExport', name: 'error', value: e.message, isClick: true })
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'errored' })
    console.error(e)
  }
}

export const generateProof = async (plugin: CircomPluginClient, appState: AppState, dispatch: ICircuitAppContext['dispatch']) => {
  try {
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'proving' })
    dispatch({ type: 'SET_PROOF_FEEDBACK', payload: null })
    plugin.emit('statusChanged', { key: 'none' })
    const fileName = extractNameFromKey(appState.filePath)
    const r1csPath = extractParentFromKey(appState.filePath) + `/.bin/${fileName.replace('.circom', '.r1cs')}`
    // @ts-ignore
    const r1csBuffer = await plugin.call('fileManager', 'readFile', r1csPath, { encoding: null })
    // @ts-ignore
    const r1cs = new Uint8Array(r1csBuffer)
    const wtnsPath = extractParentFromKey(appState.filePath) + "/.bin/" + fileName.replace('.circom', '_js') + "/" + fileName.replace('.circom', '.wtn')
    // @ts-ignore
    const wtnsBuffer = await plugin.call('fileManager', 'readFile', wtnsPath, { encoding: null })
    // @ts-ignore
    const wtns = new Uint8Array(wtnsBuffer)
    const zkey_final = appState.zKey
    const vKey = appState.verificationKey

    await snarkjs.wtns.check(r1cs, wtns, zkLogger(plugin, dispatch, 'SET_PROOF_FEEDBACK'))
    if (appState.provingScheme === 'groth16') {
      const { proof, publicSignals } = await snarkjs.groth16.prove(zkey_final, wtns, zkLogger(plugin, dispatch, 'SET_PROOF_FEEDBACK'))
      const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof, zkLogger(plugin, dispatch, 'SET_PROOF_FEEDBACK'))

      plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/groth16/zk/build/proof.json`, JSON.stringify(proof, null, 2))
      plugin.call('terminal', 'log', { type: 'log', value: 'zk proof validity ' + verified })
      trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'generateProof', name: 'groth16.prove', value: verified, isClick: true })
      if (appState.exportVerifierCalldata) {
        const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)

        plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/groth16/zk/build/verifierCalldata.json`, calldata)
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'generateProof', name: 'groth16.exportSolidityCallData', value: `${extractParentFromKey(appState.filePath)}/groth16/zk/build/verifierCalldata.json`, isClick: true })
      }
    } else if (appState.provingScheme === 'plonk') {
      const { proof, publicSignals } = await snarkjs.plonk.prove(zkey_final, wtns, zkLogger(plugin, dispatch, 'SET_PROOF_FEEDBACK'))
      const verified = await snarkjs.plonk.verify(vKey, publicSignals, proof, zkLogger(plugin, dispatch, 'SET_PROOF_FEEDBACK'))

      plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/plonk/zk/build/proof.json`, JSON.stringify(proof, null, 2))
      plugin.call('terminal', 'log', { type: 'log', value: 'zk proof validity ' + verified })
      trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'generateProof', name: 'plonk.prove', value: verified, isClick: true })
      if (appState.exportVerifierCalldata) {
        const calldata = await snarkjs.plonk.exportSolidityCallData(proof, publicSignals)

        plugin.call('fileManager', 'writeFile', `${extractParentFromKey(appState.filePath)}/plonk/zk/build/verifierCalldata.json`, calldata)
        trackMatomoEvent(plugin, { category: 'circuit-compiler', action: 'generateProof', name: 'plonk.exportSolidityCallData', value: `${extractParentFromKey(appState.filePath)}/plonk/zk/build/verifierCalldata.json`, isClick: true })
      }
    }
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'idle' })
    dispatch({ type: 'SET_PROOF_FEEDBACK', payload: null })
  } catch (e) {
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'errored' })
    dispatch({ type: 'SET_PROOF_FEEDBACK', payload: e.message })
    console.error(e)
  }
}

function zkLogger(plugin: CircomPluginClient, dispatch: ICircuitAppContext['dispatch'], dispatchType: keyof ActionPayloadTypes) {
  return {
    info: (...args) => plugin.call('terminal', 'log', { type: 'log', value: args.join(' ') }),
    debug: (...args) => plugin.call('terminal', 'log', { type: 'log', value: args.join(' ') }),
    error: (...args) => {
      plugin.call('terminal', 'log', { type: 'error', value: args.join(' ') })
      dispatch({ type: dispatchType as any, payload: args.join(' ') })
      plugin.emit('statusChanged', { key: args.length, title: `You have ${args.length} problem${args.length === 1 ? '' : 's'}`, type: 'error' })
    }
  }
}
