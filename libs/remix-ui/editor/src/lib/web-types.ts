import { remixTypes } from './remix-plugin-types'
import { hardhatEthersExtension } from './hardhat-ethers-extension'

export const loadTypes = async (monaco) => {
  // ethers.js

  // @ts-ignore
  const ethersAbi = await import('raw-loader!@ethersproject/abi/lib/index.d.ts')
  const ethersAbiDefault = ethersAbi.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersAbiDefault, `file:///node_modules/@types/@ethersproject_abi/index.d.ts`)

  // @ts-ignore
  const ethersAbstract = await import('raw-loader!@ethersproject/abstract-provider/lib/index.d.ts')
  const ethersAbstractDefault = ethersAbstract.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersAbstractDefault, `file:///node_modules/@types/@ethersproject_abstract-provider/index.d.ts`)

  // @ts-ignore
  const ethersSigner = await import('raw-loader!@ethersproject/abstract-signer/lib/index.d.ts')
  const ethersSignerDefault = ethersSigner.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersSignerDefault, `file:///node_modules/@types/@ethersproject_abstract-signer/index.d.ts`)

  // @ts-ignore
  const ethersAddress = await import('raw-loader!@ethersproject/address/lib/index.d.ts')
  const ethersAddressDefault = ethersAddress.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersAddressDefault, `file:///node_modules/@types/@ethersproject_address/index.d.ts`)

  // @ts-ignore
  const ethersBase64 = await import('raw-loader!@ethersproject/base64/lib/index.d.ts')
  const ethersBase64Default = ethersBase64.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersBase64Default, `file:///node_modules/@types/@ethersproject_base64/index.d.ts`)

  // @ts-ignore
  const ethersBasex = await import('raw-loader!@ethersproject/basex/lib/index.d.ts')
  const ethersBasexDefault = ethersBasex.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersBasexDefault, `file:///node_modules/@types/@ethersproject_basex/index.d.ts`)

  // @ts-ignore
  const ethersBignumber = await import('raw-loader!@ethersproject/bignumber/lib/index.d.ts')
  const ethersBignumberDefault = ethersBignumber.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersBignumberDefault, `file:///node_modules/@types/@ethersproject_bignumber/index.d.ts`)

  // @ts-ignore
  const ethersBytes = await import('raw-loader!@ethersproject/bytes/lib/index.d.ts')
  const ethersBytesDefault = ethersBytes.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersBytesDefault, `file:///node_modules/@types/@ethersproject_bytes/index.d.ts`)

  // @ts-ignore
  const ethersConstants = await import('raw-loader!@ethersproject/constants/lib/index.d.ts')
  const ethersConstantsDefault = ethersConstants.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersConstantsDefault, `file:///node_modules/@types/@ethersproject_constants/index.d.ts`)

  // @ts-ignore
  const ethersContracts = await import('raw-loader!@ethersproject/contracts/lib/index.d.ts')
  const ethersContractsDefault = ethersContracts.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersContractsDefault, `file:///node_modules/@types/@ethersproject_contracts/index.d.ts`)

  // @ts-ignore
  const ethersHash = await import('raw-loader!@ethersproject/hash/lib/index.d.ts')
  const ethersHashDefault = ethersHash.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersHashDefault, `file:///node_modules/@types/@ethersproject_hash/index.d.ts`)

  // @ts-ignore
  const ethersHdnode = await import('raw-loader!@ethersproject/hdnode/lib/index.d.ts')
  const ethersHdnodeDefault = ethersHdnode.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersHdnodeDefault, `file:///node_modules/@types/@ethersproject_hdnode/index.d.ts`)

  // @ts-ignore
  const ethersJsonWallets = await import('raw-loader!@ethersproject/json-wallets/lib/index.d.ts')
  const ethersJsonWalletsDefault = ethersJsonWallets.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersJsonWalletsDefault, `file:///node_modules/@types/@ethersproject_json-wallets/index.d.ts`)

  // @ts-ignore
  const ethersKeccak256 = await import('raw-loader!@ethersproject/keccak256/lib/index.d.ts')
  const ethersKeccak256Default = ethersKeccak256.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersKeccak256Default, `file:///node_modules/@types/@ethersproject_keccak256/index.d.ts`)

  // @ts-ignore
  const ethersLogger = await import('raw-loader!@ethersproject/logger/lib/index.d.ts')
  const ethersLoggerDefault = ethersLogger.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersLoggerDefault, `file:///node_modules/@types/@ethersproject_logger/index.d.ts`)

  // @ts-ignore
  const ethersNetworks = await import('raw-loader!@ethersproject/networks/lib/index.d.ts')
  const ethersNetworksDefault = ethersNetworks.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersNetworksDefault, `file:///node_modules/@types/@ethersproject_networks/index.d.ts`)

  // @ts-ignore
  const ethersPbkdf2 = await import('raw-loader!@ethersproject/pbkdf2/lib/index.d.ts')
  const ethersPbkdf2Default = ethersPbkdf2.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersPbkdf2Default, `file:///node_modules/@types/@ethersproject_pbkdf2/index.d.ts`)

  // @ts-ignore
  const ethersProperties = await import('raw-loader!@ethersproject/properties/lib/index.d.ts')
  const ethersPropertiesDefault = ethersProperties.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersPropertiesDefault, `file:///node_modules/@types/@ethersproject_properties/index.d.ts`)

  // @ts-ignore
  const ethersProviders = await import('raw-loader!@ethersproject/providers/lib/index.d.ts')
  const ethersProvidersDefault = ethersProviders.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersProvidersDefault, `file:///node_modules/@types/@ethersproject_providers/index.d.ts`)

  // @ts-ignore
  const ethersRandom = await import('raw-loader!@ethersproject/random/lib/index.d.ts')
  const ethersRandomDefault = ethersRandom.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersRandomDefault, `file:///node_modules/@types/@ethersproject_random/index.d.ts`)

  // @ts-ignore
  const ethersRlp = await import('raw-loader!@ethersproject/rlp/lib/index.d.ts')
  const ethersRlpDefault = ethersRlp.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersRlpDefault, `file:///node_modules/@types/@ethersproject_rlp/index.d.ts`)

  // @ts-ignore
  const ethersSha2 = await import('raw-loader!@ethersproject/sha2/lib/index.d.ts')
  const ethersSha2Default = ethersSha2.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersSha2Default, `file:///node_modules/@types/@ethersproject_sha2/index.d.ts`)

  // @ts-ignore
  const ethersSigningkey = await import('raw-loader!@ethersproject/signing-key/lib/index.d.ts')
  const ethersSigningkeyDefault = ethersSigningkey.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersSigningkeyDefault, `file:///node_modules/@types/@ethersproject_signing-key/index.d.ts`)

  // @ts-ignore
  const ethersSolidity = await import('raw-loader!@ethersproject/solidity/lib/index.d.ts')
  const ethersSolidityDefault = ethersSolidity.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersSolidityDefault, `file:///node_modules/@types/@ethersproject_solidity/index.d.ts`)

  // @ts-ignore
  const ethersStrings = await import('raw-loader!@ethersproject/strings/lib/index.d.ts')
  const ethersStringsDefault = ethersStrings.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersStringsDefault, `file:///node_modules/@types/@ethersproject_strings/index.d.ts`)

  // @ts-ignore
  const ethersTransactions = await import('raw-loader!@ethersproject/transactions/lib/index.d.ts')
  const ethersTransactionsDefault = ethersTransactions.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersTransactionsDefault, `file:///node_modules/@types/@ethersproject_transactions/index.d.ts`)

  // @ts-ignore
  const ethersUnits = await import('raw-loader!@ethersproject/units/lib/index.d.ts')
  const ethersUnitsDefault = ethersUnits.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersUnitsDefault, `file:///node_modules/@types/@ethersproject_units/index.d.ts`)

  // @ts-ignore
  const ethersWallet = await import('raw-loader!@ethersproject/wallet/lib/index.d.ts')
  const ethersWalletDefault = ethersWallet.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersWalletDefault, `file:///node_modules/@types/@ethersproject_wallet/index.d.ts`)

  // @ts-ignore
  const ethersWeb = await import('raw-loader!@ethersproject/web/lib/index.d.ts')
  const ethersWebDefault = ethersWeb.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersWebDefault, `file:///node_modules/@types/@ethersproject_web/index.d.ts`)

  // @ts-ignore
  const ethersWordlists = await import('raw-loader!@ethersproject/wordlists/lib/index.d.ts')
  const ethersWordlistsDefault = ethersWordlists.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersWordlistsDefault, `file:///node_modules/@types/@ethersproject_wordlists/index.d.ts`)

  // @ts-ignore
  /*
  const versionEthers = await import('raw-loader!ethers/lib.esm/_version.d.ts')
  const versionEthersDefault = versionEthers.default.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(versionEthersDefault, `file:///node_modules/@types/_version-ethers-lib/index.d.ts`)

  // @ts-ignore
  const ethers = await import('raw-loader!ethers/lib.esm/ethers.d.ts')
  let ethersDefault = ethers.default
  ethersDefault = ethersDefault.replace(/.\/utils/g, 'utils-ethers-lib')
  ethersDefault = ethersDefault.replace(/.\/_version/g, '_version-ethers-lib')
  ethersDefault = ethersDefault.replace(/.\/ethers/g, 'ethers-lib')
  ethersDefault = ethersDefault.replace(/@ethersproject\//g, '@ethersproject_')
  ethersDefault = ethersDefault + '\n' + hardhatEthersExtension
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ethersDefault, `file:///node_modules/@types/ethers-lib/index.d.ts`)

  // @ts-ignore
  const indexEthers = await import('raw-loader!ethers/lib.esm/index.d.ts')
  let indexEthersDefault = indexEthers.default
  indexEthersDefault = indexEthersDefault.replace(/.\/ethers/g, 'ethers-lib')
  indexEthersDefault = indexEthersDefault.replace(/@ethersproject\//g, '@ethersproject_')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(indexEthersDefault, `file:///node_modules/@types/ethers/index.d.ts`)
  */
  // remix
  const indexRemixApi = remixTypes + `\n
    declare global {
        const remix: PluginClient;
        const web3Provider;
        const require;
    }
    `
  monaco.languages.typescript.typescriptDefaults.addExtraLib(indexRemixApi)

  // @ts-ignore
  const chaiType = await import('raw-loader!@types/chai/index.d.ts')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(chaiType.default, `file:///node_modules/@types/chai/index.d.ts`)

  // @ts-ignore
  const mochaType = await import('raw-loader!@types/mocha/index.d.ts')
  monaco.languages.typescript.typescriptDefaults.addExtraLib(mochaType.default, `file:///node_modules/@types/mocha/index.d.ts`)

  const loadedElement = document.createElement('span')
  loadedElement.setAttribute('data-id', 'typesloaded')
  document.body.appendChild(loadedElement)
}
