import { ZeroAddress } from 'ethers'

// AA02: Add network name and public URL to support contract transactions using smart account
export const aaSupportedNetworks = {
  "11155111": {
    name: "sepolia",
    publicNodeUrl: "https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2"
  },
  "100": {
    name: "gnosis",
    publicNodeUrl: "https://rpc.gnosischain.com"
  }
}

export const getPimlicoBundlerURL = (chainId) => {
  return `https://pimlico.api.remix.live/api/proxy/${chainId}`
}

export const aaLocalStorageKey = 'smartAccounts'

// AA03: Check if this address is valid for newly added network
// This determiniticProxyAddress is used for replay protection during contract deployment
// See: https://github.com/safe-global/safe-smart-account?tab=readme-ov-file#replay-protection-eip-155
export const aaDeterminiticProxyAddress = "0x4e59b44847b379578588920cA78FbF26c0B4956C"

export const toAddress = ZeroAddress // A dummy zero value tx is made to this zero address to create existence of smart account
