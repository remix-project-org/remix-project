
export type Network = {
  id: number
  name: string
}

export const fetchContractFromEtherscan = async (plugin, endpoint: string | Network, contractAddress, targetPath, shouldSetFile = true, etherscanKey?) => {
  let data
  const compilationTargets = {}
  if (!etherscanKey) etherscanKey = await plugin.call('config', 'getAppParameter', 'etherscan-access-token')
  if (!etherscanKey) etherscanKey = '2HKUX5ZVASZIKWJM8MIQVCRUVZ6JAWT531'

  if (etherscanKey) {
    // Extract chain ID and build endpoint string once
    let chainId = 1 // Default to Ethereum mainnet
    let endpointStr: string
    if (typeof endpoint === 'object' && endpoint !== null && 'id' in endpoint && 'name' in endpoint) {
      chainId = endpoint.id
      const normalized = String(endpoint.name || '').toLowerCase()
      endpointStr = endpoint.id == 1 ? 'api.etherscan.io' : 'api-' + normalized + '.etherscan.io'
    } else {
      endpointStr = endpoint as string
    }
    try {
      // Prefer central V2 API host with chainid param (works across Etherscan-supported networks)
      const v2CentralUrl = 'https://api.etherscan.io/v2/api?chainid=' + chainId + '&module=contract&action=getsourcecode&address=' + contractAddress + '&apikey=' + etherscanKey
      let response = await fetch(v2CentralUrl)
      const centralV2Status = response.status;
      const centralV2StatusText = response.statusText;

      // If central V2 not OK, try per-network V2, then per-network V1
      if (!response.ok) {
        const v2PerNetworkUrl = 'https://' + endpointStr + '/v2/api?chainid=' + chainId + '&module=contract&action=getsourcecode&address=' + contractAddress + '&apikey=' + etherscanKey
        const v2PerNetworkResponse = await fetch(v2PerNetworkUrl)
        const v2PerNetworkStatus = v2PerNetworkResponse.status;
        const v2PerNetworkStatusText = v2PerNetworkResponse.statusText;
        if (v2PerNetworkResponse.ok) {
          response = v2PerNetworkResponse;
        } else {
          const v1Url = 'https://' + endpointStr + '/api?module=contract&action=getsourcecode&address=' + contractAddress + '&apikey=' + etherscanKey
          const v1Response = await fetch(v1Url)
          const v1Status = v1Response.status;
          const v1StatusText = v1Response.statusText;
          if (v1Response.ok) {
            response = v1Response;
          } else {
            // All three endpoints failed, throw a descriptive error
            throw new Error(
              `All Etherscan API endpoints failed:\n` +
              `Central V2: ${v2CentralUrl} [${centralV2Status} ${centralV2StatusText}]\n` +
              `Per-network V2: ${v2PerNetworkUrl} [${v2PerNetworkStatus} ${v2PerNetworkStatusText}]\n` +
              `Per-network V1: ${v1Url} [${v1Status} ${v1StatusText}]`
            );
          }
        }
      }

      data = await response.json()

      // etherscan api doc https://docs.etherscan.io/api-endpoints/contracts
      if (data.message === 'OK' && data.status === "1") {
        if (data.result.length) {
          if (data.result[0].SourceCode === '') throw new Error(`contract not verified on Etherscan ${endpoint}`)
          if (data.result[0].SourceCode.startsWith('{')) {
            data.result[0].SourceCode = JSON.parse(data.result[0].SourceCode.replace(/(?:\r\n|\r|\n)/g, '').replace(/^{{/, '{').replace(/}}$/, '}'))
          }
        }
      } else throw new Error('unable to retrieve contract data ' + data.message)
    } catch (e) {
      throw new Error('unable to retrieve contract data: ' + e.message)
    }
  } else throw new Error('unable to try fetching the source code from etherscan: etherscan access token not found. please go to the Remix settings page and provide an access token.')

  if (!data || !data.result) {
    return null
  }

  if (typeof data.result[0].SourceCode === 'string') {
    const fileName = `${targetPath}/${data.result[0].ContractName}.sol`
    if (shouldSetFile) await plugin.call('fileManager', 'setFile', fileName, data.result[0].SourceCode)
    compilationTargets[fileName] = { content: data.result[0].SourceCode }
  } else if (data.result[0].SourceCode && typeof data.result[0].SourceCode == 'object') {
    const sources = data.result[0].SourceCode.sources
    for (let [file, source] of Object.entries(sources)) { // eslint-disable-line
      file = file.replace('browser/', '') // should be fixed in the remix IDE end.
      file = file.replace(/^\//g, '') // remove first slash.
      if (await plugin.call('contentImport', 'isExternalUrl', file)) {
        // nothing to do, the compiler callback will handle those
      } else {
        const path = `${targetPath}/${file}`
        const content = (source as any).content
        if (shouldSetFile) await plugin.call('fileManager', 'setFile', path, content)
        compilationTargets[path] = { content }
      }
    }
  }
  let runs = 0
  try {
    runs = parseInt(data.result[0].Runs)
  } catch (e) { }
  const config = {
    language: 'Solidity',
    settings: data.result[0].SourceCode?.settings
  }
  return {
    config,
    compilationTargets,
    version: data.result[0].CompilerVersion.replace(/^v/, '')
  }
}
