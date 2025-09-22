# Remixd

[![npm version](https://badge.fury.io/js/%40remix-project%2Fremixd.svg)](https://www.npmjs.com/package/@remix-project/remixd)
[![npm](https://img.shields.io/npm/dt/@remix-project/remixd.svg?label=Total%20Downloads&logo=npm)](https://www.npmjs.com/package/@remix-project/remixd)
[![npm](https://img.shields.io/npm/dw/@remix-project/remixd.svg?logo=npm)](https://www.npmjs.com/package/@remix-project/remixd)


`@remix-project/remixd` is an NPM module that intends to be used with [Remix IDE](https://remix.ethereum.org/) web and desktop applications. It establishes a two-way websocket connection between the local computer and Remix IDE for a particular project directory.

`remixd` can be used to set up a development environment with other popular frameworks like Hardhat, Truffle, Slither etc.

More details are explained in the [documentation](https://remix-ide.readthedocs.io/en/latest/remixd.html).

## Installation

`npm install -g @remix-project/remixd`

NOTE: When the remixd NPM module is installed, it also installs [Slither](https://github.com/crytic/slither), [solc-select](https://github.com/crytic/solc-select#quickstart) and sets [solc](https://docs.soliditylang.org/en/latest/installing-solidity.html) to latest version i.e. 0.8.15 currently.

ALSO NOTE: Python3.6+ (pip3) needs to already be installed on the System. In case of any discrepancy, Slither can also be installed along with other dependencies using the command:
```
> remixd -i slither
``` 

_(This packaging of Slither with the remixd module is supported since Remixd v0.6.3)_

### Warning for quite old users
There is a new version of remixd with a new npm address: https://npmjs.com/package/@remix-project/remixd
If you were using the old one you need to:

  1. uninstall the old one: `npm uninstall -g remixd`
  2. install the new: `npm install -g @remix-project/remixd`

## remixd command

The remixd command without options shares present working directory and the shared Remix domain will be https://remix.ethereum.org, https://alpha.remix.live, or https://beta.remix.live

The remixd command is:
```
> remixd
```

If you are using Remix from localhost or you are not running the command from your working directory, you’ll need to use the command with flags.

```
> remixd -h
Usage: remixd [options]

Establish a two-way websocket connection between the local computer and Remix IDE for a folder

Options:
  -v, --version               output the version number
  -u, --remix-ide  <url>      URL of remix instance allowed to connect
  -s, --shared-folder <path>  Folder to share with Remix IDE (Default: CWD)
  -i, --install <name>        Module name to install locally (Supported: ["slither"])
  -r, --read-only             Treat shared folder as read-only (experimental)
  -h, --help                  output usage information

Example:

    remixd -s ./shared_project -u http://localhost:8080

```

## Share a project directory

`remixd -s ./shared_project -u https://remix.ethereum.org`

The current user should have `read/write` access to the folder (at least `read` access).

It is important to notice that changes made to the current file in `Remix IDE` are automatically saved to the local computer every 5000 ms. There is no `Save` action. But the `Ctrl-Z` (undo) can be used.

Furthermore:
 - No copy of the shared folder is kept in the browser storage.
 - Clicking on the new folder or new file icon under localhost will create a new file or folder in the shared folder.
 - If a folder does not contain any file, the folder will not be displayed in the explorer (that might change).
 - Symbolic links are not forwarded to Remix IDE.

## Ports Usage
remixd creates a websocket connection with Remix IDE on different ports. Ports are defined according to specific purposes. Port usage details are as:

- **65520** : For `remixd` websocket listener, to share a project from local device with Remix IDE. Shared folder will be loaded in the Remix IDE File Explorer workspace named localhost [See more](https://remix-ide.readthedocs.io/en/latest/remixd.html)
- **65522** : For `Hardhat` websocket listener, to enable the Hardhat Compilation using Remix IDE Solidity Compiler plugin, if shared folder is a Hardhat project [See more](https://remix-ide.readthedocs.io/en/latest/hardhat.html)
- **65523** : For `Slither` websocket listener, to enable the Slither Analysis using Remix IDE Solidity Static Analysis plugin [See more](https://remix-ide.readthedocs.io/en/latest/slither.html)
- **65524** : For `Truffle` websocket listener, to enable the Truffle Compilation using Remix IDE Solidity Compiler plugin, if shared folder is a Truffle project [See more](https://remix-ide.readthedocs.io/en/latest/truffle.html)

Note: Please make sure your system is secured enough and these ports are not opened nor forwarded.
 
