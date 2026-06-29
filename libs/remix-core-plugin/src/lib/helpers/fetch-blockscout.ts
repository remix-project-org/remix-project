export const fetchContractFromBlockscout = async (plugin, endpoint, contractAddress, targetPath, shouldSetFile = true) => {
  let data
  const compilationTargets = {}

  try {
    data = await fetch('https://' + endpoint + '/api?module=contract&action=getsourcecode&address=' + contractAddress)
    data = await data.json()
    // blockscout api doc https://blockscout.com/poa/core/api-docs
    if (data.message === 'OK' && data.status === "1") {
      if (data.result.length) {
        if (!data.result[0].SourceCode || data.result[0].SourceCode === '') {
          throw new Error(`contract not verified on Blockscout ${endpoint} network`)
        }
      }
    } else throw new Error('unable to retrieve contract data ' + JSON.stringify(data.message))
  } catch (e) {
    throw new Error('unable to retrieve contract data: ' + JSON.stringify(e.message))
  }

  if (!data || !data.result) {
    return null
  }

  if (data.result[0].FileName === '.sol' && data.result[0].ContractName) {
    const fileName = `${targetPath}/${data.result[0].ContractName}.sol`
    if (shouldSetFile) await plugin.call('fileManager', 'setFile', fileName, data.result[0].SourceCode)
    compilationTargets[fileName] = { content: data.result[0].SourceCode }
  } else if (data.result[0].FileName === '') {
    const fileName = `${targetPath}/${data.result[0].ContractName}.sol`
    if (shouldSetFile) await plugin.call('fileManager', 'setFile', fileName, data.result[0].SourceCode)
    compilationTargets[fileName] = { content: data.result[0].SourceCode }
  } else {
    const sources = {}
    sources[data.result[0].FileName] = data.result[0].SourceCode
    if (data.result[0].AdditionalSources && Array.isArray(data.result[0].AdditionalSources)) {
      for (const object of data.result[0].AdditionalSources) {
        sources[object.Filename] = object.SourceCode
      }
    }

    for (let [file, source] of Object.entries(sources)) { // eslint-disable-line
      file = file.replace('browser/', '') // should be fixed in the remix IDE end.
      file = file.replace(/^\//g, '') // remove first slash.
      if (await plugin.call('contentImport', 'isExternalUrl', file)) {
        // nothing to do, the compiler callback will handle those
      } else {
        const path = `${targetPath}/${file}`
        const content = source
        if (shouldSetFile) await plugin.call('fileManager', 'setFile', path, content)
        compilationTargets[path] = { content }
      }
    }
  }

  let runs = 0
  try {
    runs = parseInt(data.result[0].OptimizationRuns)
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
