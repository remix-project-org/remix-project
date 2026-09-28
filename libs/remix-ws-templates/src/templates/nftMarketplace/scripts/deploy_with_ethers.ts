import { deploy } from './ethers-lib'

(async () => {
  try {
    const [deployer] = await (new (require('ethers').providers.Web3Provider)(web3Provider)).listAccounts()

    // 1. Deploy an NFT collection
    const nft = await deploy('MintableNFT', [
      'My NFT Collection', // name
      'MNC',               // symbol
      deployer,            // royalty recipient
      500                  // 5% royalty (500 bps)
    ])
    console.log(`MintableNFT deployed at: ${nft.address}`)

    // 2. Deploy the marketplace (protocol fees go to deployer)
    const marketplace = await deploy('NFTMarketplace', [deployer])
    console.log(`NFTMarketplace deployed at: ${marketplace.address}`)

    // 3. Deploy the Royalty Registry (for legacy collections without EIP-2981)
    const royaltyRegistry = await deploy('RoyaltyRegistry', [])
    console.log(`RoyaltyRegistry deployed at: ${royaltyRegistry.address}`)

    console.log(`\nMarketplace setup:`)
    console.log(`  NFT Collection: ${nft.address}`)
    console.log(`  Marketplace: ${marketplace.address}`)
    console.log(`  Protocol fee: 2.5%`)
    console.log(`  Creator royalty: up to 5%`)
    console.log(`\nTo list an NFT for sale:`)
    console.log(`  1. nft.mint(yourAddress) to mint an NFT`)
    console.log(`  2. nft.setApprovalForAll(marketplace.address, true)`)
    console.log(`  3. marketplace.list(nft.address, tokenId, priceInWei)`)
    console.log(`\nTo buy an NFT:`)
    console.log(`  marketplace.buy(listingId, { value: priceInWei })`)
  } catch (e) {
    console.log(e.message)
  }
})()
