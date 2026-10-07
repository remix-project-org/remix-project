#!/usr/bin/env node
import latestVersion from 'latest-version'
import * as semver from 'semver'
import WebSocket from '../websocket'
import * as servicesList from '../serviceList'
import * as WS from 'ws' // eslint-disable-line
import { getDomain, absolutePath } from '../utils'
import Axios from 'axios'
import { writeJSON, existsSync } from 'fs-extra'
import * as path from 'path'
import { Command } from 'commander';

const program = new Command();

async function warnLatestVersion () {
  const latest = await latestVersion('@remix-project/remixd')
  const pjson = require('../../package.json') // eslint-disable-line
  if (semver.eq(latest, pjson.version)) {
    console.log('\x1b[32m%s\x1b[0m', `[INFO] you are using the latest version ${latest}`)
  } else if (semver.gt(latest, pjson.version)) {
    console.log('\x1b[33m%s\x1b[0m', `[WARN] latest version of remixd is ${latest}, you are using ${pjson.version}`)
    console.log('\x1b[33m%s\x1b[0m', '[WARN] please update using the following command:')
    console.log('\x1b[33m%s\x1b[0m', '[WARN] yarn global add @remix-project/remixd')
  }
}

const services = {
  git: (readOnly: boolean) => new servicesList.GitClient(readOnly),
  hardhat: (readOnly: boolean) => new servicesList.HardhatClient(readOnly),
  truffle: (readOnly: boolean) => new servicesList.TruffleClient(readOnly),
  slither: (readOnly: boolean) => new servicesList.SlitherClient(readOnly),
  folder: (readOnly: boolean) => new servicesList.Sharedfolder(readOnly),
  foundry: (readOnly: boolean) => new servicesList.FoundryClient(readOnly)
}

// Similar object is also defined in websocket.ts
const ports = {
  git: 65521,
  hardhat: 65522,
  slither: 65523,
  truffle: 65524,
  foundry: 65525,
  folder: 65520
}

const killCallBack: Array<any> = [] // any is function
function startService<S extends 'git' | 'hardhat' | 'truffle' | 'slither' | 'folder' | 'foundry'> (service: S, callback: (ws: WS, sharedFolderClient: servicesList.Sharedfolder, error?:Error) => void) {
  const options = program.opts();
  const socket = new WebSocket(ports[service], { remixIdeUrl: options.remixIde }, () => services[service](options.readOnly || false))
  socket.start(callback)
  killCallBack.push(socket.close.bind(socket))
}

function errorHandler (error: any, service: string) {
  const port = ports[service]
  if (error.code && error.code === 'EADDRINUSE') {
    console.log('\x1b[31m%s\x1b[0m', `[ERR] There is already a client running on port ${port}!`)
  } else {
    console.log('\x1b[31m%s\x1b[0m', '[ERR]', error)
  }
}

(async () => {
  const { version } = require('../../package.json') // eslint-disable-line
  program.version(version, '-v, --version')

  program
    .description('Establish a two-way websocket connection between the local computer and Remix Web3 for a folder')
    .option('-u, --remix-ide  <url>', 'URL of remix instance allowed to connect')
    .option('-s, --shared-folder <path>', 'Folder to share with Remix Web3 (Default: CWD)')
    .option('-i, --install <name>', 'Module name to install locally (Supported: ["slither"])')
    .option('-r, --read-only', 'Treat shared folder as read-only (experimental)')
    .on('--help', function () {
      console.log('\nExample:\n\n    remixd -s ./shared_project -u http://localhost:8080')
    }).parse(process.argv)
  // eslint-disable-next-line
  const options = program.opts();
  await warnLatestVersion()

  if (options.install && !options.readOnly) {
    if (options.install.toLowerCase() === 'slither') require('./../scripts/installSlither')
    process.exit(0)
  }

  if (!options.remixIde) {
    console.log('\x1b[33m%s\x1b[0m', '[WARN] You can only connect to remixd from one of the supported origins.')
  } else {
    const isValid = await isValidOrigin(options.remixIde)
    /* Allow unsupported origins and display warning. */
    if (!isValid) {
      console.log('\x1b[33m%s\x1b[0m', '[WARN] You are using IDE from an unsupported origin.')
      console.log('\x1b[33m%s\x1b[0m', 'Check https://gist.github.com/EthereumRemix/091ccc57986452bbb33f57abfb13d173 for list of all supported origins.\n')
      // return
    }
    console.log('\x1b[33m%s\x1b[0m', '[WARN] You may now only use IDE at ' + options.remixIde + ' to connect to that instance')
  }

  if (!options.sharedFolder) options.sharedFolder = process.cwd() // if not specified, use the current folder

  if (options.sharedFolder && existsSync(absolutePath('./', options.sharedFolder))) {
    console.log('\x1b[33m%s\x1b[0m', '[WARN] Any application that runs on your computer can potentially read from and write to all files in the directory.')
    console.log('\x1b[33m%s\x1b[0m', '[WARN] Symbolic links are not forwarded to Remix Web3\n')
    try {
      startService('folder', (ws: WS, sharedFolderClient: servicesList.Sharedfolder, error: any) => {
        if (error) {
          errorHandler(error, 'folder')
          return false
        }
        sharedFolderClient.setWebSocket(ws)
        sharedFolderClient.setupNotifications(options.sharedFolder)
        sharedFolderClient.sharedFolder(options.sharedFolder)
      })
      startService('slither', (ws: WS, sharedFolderClient: servicesList.Sharedfolder) => {
        sharedFolderClient.setWebSocket(ws)
        sharedFolderClient.sharedFolder(options.sharedFolder)
      })
      // Run truffle service if a truffle project is shared as folder
      const truffleConfigFilePath = absolutePath('./', options.sharedFolder) + '/truffle-config.js'
      if (existsSync(truffleConfigFilePath)) {
        startService('truffle', (ws: WS, sharedFolderClient: servicesList.Sharedfolder, error: any) => {
          if (error) {
            errorHandler(error, 'truffle')
            return false
          }
          sharedFolderClient.setWebSocket(ws)
          sharedFolderClient.sharedFolder(options.sharedFolder)
        })
      }
      // Run hardhat service if a hardhat project is shared as folder
      const hardhatConfigFilePath = absolutePath('./', options.sharedFolder)
      const isHardhatProject = existsSync(hardhatConfigFilePath + '/hardhat.config.js') || existsSync(hardhatConfigFilePath + '/hardhat.config.ts')
      if (isHardhatProject) {
        startService('hardhat', (ws: WS, sharedFolderClient: servicesList.Sharedfolder, error: Error) => {
          if (error) {
            errorHandler(error, 'hardhat')
            return false
          }
          sharedFolderClient.setWebSocket(ws)
          sharedFolderClient.sharedFolder(options.sharedFolder)
        })
      }
      // Run foundry service if a foundry project is shared as folder
      const foundryConfigFilePath = absolutePath('./', options.sharedFolder)
      const isFoundryProject = existsSync(foundryConfigFilePath + '/foundry.toml')
      if (isFoundryProject) {
        startService('foundry', (ws: WS, sharedFolderClient: servicesList.Sharedfolder, error: Error) => {
          if (error) {
            errorHandler(error, 'foundry')
            return false
          }
          sharedFolderClient.setWebSocket(ws)
          sharedFolderClient.sharedFolder(options.sharedFolder)
        })
      }
      /*
      startService('git', (ws: WS, sharedFolderClient: servicesList.Sharedfolder) => {
        sharedFolderClient.setWebSocket(ws)
        sharedFolderClient.sharedFolder(options.sharedFolder)
      })
      */
    } catch (error) {
      throw new Error(error)
    }
  } else {
    console.log('\x1b[31m%s\x1b[0m', '[ERR] No valid shared folder provided.')
  }

  // kill
  function kill () {
    for (const k in killCallBack) {
      try {
        killCallBack[k]()
      } catch (e) {
        console.log(e)
      }
    }
    process.exit(0)
  }

  process.on('SIGINT', kill) // catch ctrl-c
  process.on('SIGTERM', kill) // catch kill
  process.on('exit', kill)

  async function isValidOrigin (origin: string): Promise<any> {
    if (!origin) return false
    const domain = getDomain(origin)
    const gistUrl = 'https://gist.githubusercontent.com/EthereumRemix/091ccc57986452bbb33f57abfb13d173/raw/59cedab38ae94cc72b68854b3706f11819e4a0af/origins.json'

    try {
      const { data } = (await Axios.get(gistUrl)) as { data: any }

      try {
        await writeJSON(path.resolve(path.join(__dirname, '../..', 'origins.json')), { data })
      } catch (e) {
        console.error(e)
      }

      const dataArray:string[] = data
      return dataArray.includes(origin) ? dataArray.includes(origin) : dataArray.includes(domain)
    } catch (e) {
      try {
        // eslint-disable-next-line
        const origins = require('../../origins.json')
        const { data } = origins

        return data.includes(origin) ? data.includes(origin) : data.includes(domain)
      } catch (e) {
        return false
      }
    }
  }
})()
