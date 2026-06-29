import { CompilationResult } from '../types/types'

export const compilationParams = {
  optimize: false,
  evmVersion: null,
  language: 'Solidity',
  version: '0.8.30+commit.73712a01'
}

export const compilecontracts = async (contracts, plugin): Promise<CompilationResult> => {
  // do not compile tests files
  let result
  try {
    result = await plugin.call('solidity' as any, 'compileWithParameters', contracts, compilationParams)
    const data = result.data
    let error = false

    if (data.errors) {
      error = data.errors.find((error) => error.type !== 'Warning')
    }

    const errorFiles:{ [key: string]: any } = {};
    const fillErrors = (err) => {
      if (errorFiles[err.sourceLocation.file]) {
        errorFiles[err.sourceLocation.file].errors.push({
          errorStart : err.sourceLocation.start,
          errorEnd : err.sourceLocation.end,
          errorMessage : err.formattedMessage
        })
      } else {
        errorFiles[err.sourceLocation.file] = {
          content : err.sourceLocation.file,
          errors : [{
            errorStart : err.sourceLocation.start,
            errorEnd : err.sourceLocation.end,
            errorMessage : err.formattedMessage
          }]
        }
      }
    }
    if (data.errors && data.errors.length && error) {
      for (const error of data.errors) {
        if (error.type === 'Warning') continue
        fillErrors(error);
      }

      const msg = `
          - Compilation errors: ${data.errors.map((e) => e.formattedMessage)}.
          `
      return { compilationSucceeded: false, errors: msg, errfiles: errorFiles, compilerPayload: result }
    }

    if (data.error) {
      errorFiles['contracts'] = contracts
      errorFiles['error'] = data.error
      const msg = `
					- Compilation errors: ${data.error}.
					`
      return { compilationSucceeded: false, errors: msg, errfiles: errorFiles, compilerPayload: result }
    }

    return { compilationSucceeded: true, errors: null, compilerPayload: result }
  } catch (err) {
    return { compilationSucceeded: false, errors: 'An unexpected error occurred during compilation.', compilerPayload: result }
  }
}
