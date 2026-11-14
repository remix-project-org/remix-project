import { Provider } from '@remix-project/remix-simulator'

const rpcError = (error) => error ? {
  message: error.message || String(error),
  code: error.code || -32603,
  data: error.data
} : null

let provider: Provider = null
self.onmessage = (e: MessageEvent) => {
  const data = e.data
  switch (data.cmd) {
  case 'init':
  {
    provider = new Provider({ baseBlockNumber: data.baseBlockNumer, fork: data.fork, nodeUrl: data.nodeUrl, blockNumber: data.blockNumber, stateDb: data.stateDb, blocks: data.blocks })
    provider.init().then(() => {
      self.postMessage({
        cmd: 'initiateResult',
        stamp: data.stamp
      })
    }).catch((error) => {
      self.postMessage({
        cmd: 'initiateResult',
        error: rpcError(error),
        stamp: data.stamp
      })
    })
    break
  }
  case 'sendAsync':
  {
    if (provider) {
      provider.sendAsync(data.query, (error, result) => {
        self.postMessage({
          cmd: 'sendAsyncResult',
          error: rpcError(error),
          result,
          stamp: data.stamp
        })
      })
    } else {
      self.postMessage({
        cmd: 'sendAsyncResult',
        error: 'Provider not instantiated',
        result: null,
        stamp: data.stamp
      })
    }

    break
  }
  case 'request':
  {
    (function (data) {
      const stamp = data.stamp
      if (provider) {
        provider.request(data.query).then((result) => {
          self.postMessage({
            cmd: 'requestResult',
            error: null,
            result: result,
            stamp: stamp
          })
        }).catch((error) => {
          self.postMessage({
            cmd: 'requestResult',
            error: rpcError(error),
            result: null,
            stamp: stamp
          })
        })
      } else {
        self.postMessage({
          cmd: 'requestResult',
          error: 'Provider not instantiated',
          result: null,
          stamp: stamp
        })
      }
    })(data)
    break
  }
  case 'addAccount':
  {
    if (provider) {
      provider.Accounts._addAccount(data.privateKey, data.balance)
    }

    break
  }
  case 'newAccount':
  {
    if (provider) {
      provider.Accounts.newAccount((error, address: string) => {
        if (error) {
          self.postMessage({
            cmd: 'newAccountResult',
            error,
            stamp: data.stamp
          })
        } else {
          self.postMessage({
            cmd: 'newAccountResult',
            result: address,
            stamp: data.stamp
          })
        }
      })
    }

    break
  }
  }
}
