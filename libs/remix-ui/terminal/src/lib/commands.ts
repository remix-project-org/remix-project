export const allPrograms = [
  { ethers: 'The ethers.js library is a compact and complete JavaScript library for Ethereum.' },
  { remix: 'Ethereum IDE and tools for the web.' }
  // { swarmgw: 'This library can be used to upload/download files to Swarm via https://swarm-gateways.net/.' }
]

export const allCommands = [
  { 'remix.execute(filepath)': 'Run the script specified by file path. If filepath is empty, script currently displayed in the editor is executed.' },
  { 'remix.exeCurrent()': 'Run the script currently displayed in the editor.' },
  { 'remix.loadgist(id)': 'Load a gist in the file explorer.' },
  // { 'remix.loadurl(url)': 'Load the given url in the file explorer. The url can be of type github, swarm or ipfs.' },

  // { 'swarmgw.get(url, cb)': 'Download files from Swarm via https://swarm-gateways.net/' },
  // { 'swarmgw.put(content, cb)': 'Upload files to Swarm via https://swarm-gateways.net/' },

  { 'ethers.Contract': 'This API provides a graceful connection to a contract deployed on the blockchain, simplifying calling and querying its functions and handling all the binary protocol and conversion as necessarily.' },
  // { 'ethers.HDNode': 'A Hierarchical Deterministic Wallet represents a large tree of private keys which can reliably be reproduced from an initial seed.' },
  // { 'ethers.Interface': 'The Interface Object is a meta-class that accepts a Solidity (or compatible) Application Binary Interface (ABI) and populates functions to deal with encoding and decoding the parameters to pass in and results returned.' },
  { 'ethers.providers': 'A Provider abstracts a connection to the Ethereum blockchain, for issuing queries and sending state changing transactions.' },
  // { 'ethers.SigningKey': 'The SigningKey interface provides an abstraction around the secp256k1 elliptic curve cryptography library.' },
  // { 'ethers.utils': 'The utility functions exposed in both the ethers umbrella package and the ethers-utils.' },
  // { 'ethers.utils.AbiCoder': 'Create a new ABI Coder object' },
  // { 'ethers.utils.RLP': 'This encoding method is used internally for several aspects of Ethereum, such as encoding transactions and determining contract addresses.' },
  { 'ethers.Wallet': 'A wallet manages a private/public key pair which is used to cryptographically sign transactions and prove ownership on the Ethereum network.' },
  { 'ethers.version': 'Contains the version of the ethers container object.' },
]
