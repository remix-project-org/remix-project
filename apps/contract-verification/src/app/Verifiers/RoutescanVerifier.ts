import { routescan } from 'explorer-verify/clients/routescan'
import { EtherscanVerifier } from './EtherscanVerifier'
import { type ExplorerVerifyRoute, joinApiUrl } from './explorerVerify'

export class RoutescanVerifier extends EtherscanVerifier {
  LOOKUP_STORE_DIR = 'routescan-verified'

  // Routescan does not support proxy verification
  verifyProxy = undefined

  protected explorerVerifyRoute(): ExplorerVerifyRoute {
    return {
      backend: 'routescan',
      clients: [routescan()],
      route: { backend: 'routescan', apiUrl: joinApiUrl(this.apiUrl, '/api'), apiKey: this.apiKey || undefined },
    }
  }

  getContractCodeUrl(address: string, chainId: string): string {
    const url = new URL(this.explorerUrl + `/address/${address}/contract/${chainId}/code`)
    return url.href
  }
}
