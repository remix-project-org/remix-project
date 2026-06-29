import { Profile } from '@remixproject/plugin-utils'
import { ElectronBasePlugin, ElectronBasePluginClient } from '@remixproject/plugin-electron'
import fs from 'fs/promises'
import git from 'isomorphic-git'
import { gitProxy } from '../tools/git'
import { isoGit } from '@remix-git'
import { branchDifference, branchInputType, checkoutInputType, cloneInputType, commitChange, commitInputType, compareBranchesInput, currentBranchInput, fetchInputType, initInputType, logInputType, pullInputType, pushInputType, remote, resolveRefInput, statusInput } from '@remix-api'

const profile: Profile = {
  name: 'isogit',
  displayName: 'isogit',
  description: 'isogit plugin',
}
// used in e2e tests
const useIsoGit = process.argv.includes('--use-isogit')
export class IsoGitPlugin extends ElectronBasePlugin {
  clients: IsoGitPluginClient[] = []
  constructor() {
    super(profile, clientProfile, IsoGitPluginClient)
  }

  startClone(webContentsId: any): void {
    const client = this.clients.find((c) => c.webContentsId === webContentsId)
    if (client) {
      client.startClone()
    }
  }
}

const clientProfile: Profile = {
  name: 'isogit',
  displayName: 'isogit',
  description: 'isogit plugin',
  methods: ['init', 'localStorageUsed', 'version', 'addremote', 'delremote', 'remotes', 'fetch', 'clone', 'export', 'import', 'status', 'log', 'commit', 'add', 'remove', 'rm', 'readblob', 'resolveref', 'branches', 'branch', 'checkout', 'currentbranch', 'push', 'pin', 'pull', 'pinList', 'unPin', 'setIpfsConfig', 'zip', 'setItem', 'getItem', 'openFolder', 'getCommitChanges', 'compareBranches', 'startClone', 'updateSubmodules'],
}

class IsoGitPluginClient extends ElectronBasePluginClient {
  workingDir: string = ''
  gitIsInstalled: boolean = false
  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
    this.onload(async () => {
      this.on('fs' as any, 'workingDirChanged', async (path: string) => {
        this.workingDir = path
        this.gitIsInstalled = (await gitProxy.version()) && !useIsoGit ? true : false
      })
      this.workingDir = await this.call('fs' as any, 'getWorkingDir')
      this.gitIsInstalled = (await gitProxy.version()) && !useIsoGit ? true : false
    })
  }

  async version() {
    return this.gitIsInstalled ? gitProxy.version() : 'built-in'
  }

  async getGitConfig() {
    return {
      fs,
      dir: this.workingDir,
    }
  }

  async status(cmd: statusInput) {

    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    if (this.workingDir === '') {
      return []
    }

    if (this.gitIsInstalled) {
      const status = await gitProxy.status(this.workingDir)
      return status
    }

    const status = await git.statusMatrix({
      ...(await this.getGitConfig()),
      ...cmd,
    })

    return status
  }

  async log(cmd: logInputType) {

    const token = await this.call('config' as any, 'getAppParameter', 'settings/gist-access-token')

    if (this.workingDir === '') {
      return []
    }

    try {
      const log = await git.log({
        ...(await this.getGitConfig()),
        ...cmd,
        depth: cmd.depth || 10,
      })

      return log
    }
    catch (e) {
      return []
    }
  }

  async add(cmd: any) {
    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    const add = await git.add({
      ...(await this.getGitConfig()),
      ...cmd,
    })

    return add
  }

  async rm(cmd: any) {
    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    const rm = await git.remove({
      ...(await this.getGitConfig()),
      ...cmd,
    })

    return rm
  }

  async commit(cmd: commitInputType) {
    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    if (this.gitIsInstalled) {
      try {
        const result = await gitProxy.commit(this.workingDir, cmd)
        
        // Send commit output to terminal
        if (result.stdout) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stdout })
        }
        
        if (result.stderr) {
          this.call('terminal' as any, 'log', { type: 'warn', value: result.stderr })
        }
        
        this.call('terminal' as any, 'log', { type: 'info', value: `Commit successful: ${result.commitHash}` })
        return result.commitHash
      } catch (e) {
        this.call('terminal' as any, 'log', { type: 'error', value: `Commit failed: ${e.message}` })
        throw e
      }
    }

    const commit = await git.commit({
      ...(await this.getGitConfig()),
      ...cmd,
    })

    return commit
  }

  async init(input: initInputType) {
    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }
    if (this.gitIsInstalled) {
      const status = await gitProxy.init(this.workingDir)
      return status
    }
    await git.init({
      ...(await this.getGitConfig()),
      defaultBranch: (input && input.defaultBranch) || 'main',
    })
  }

  async branch(cmd: branchInputType) {
    if (!this.workingDir || this.workingDir === '') {
      return null
    }
    const branch = await git.branch({
      ...(await this.getGitConfig()),
      ...cmd,
    })

    return branch
  }

  async resolveref(cmd: resolveRefInput) {

    if (!this.workingDir || this.workingDir === '') {
      return null
    }
    try {
      const resolveref = await git.resolveRef({
        ...(await this.getGitConfig()),
        ...cmd,
      })

      return resolveref
    } catch (e) {
      return null
    }
  }

  async readblob(cmd: any) {
    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    const readblob = await git.readBlob({
      ...(await this.getGitConfig()),
      ...cmd,
    })

    return readblob
  }

  async checkout(cmd: checkoutInputType) {

    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }
    if (this.gitIsInstalled) {
      try {
        this.call('terminal' as any, 'log', `Checking out ${cmd.ref}...`)
        const result = await gitProxy.checkout(this.workingDir, cmd)
        
        if (result.stdout) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stdout })
        }
        
        if (result.stderr) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stderr })
        }
        
        this.call('terminal' as any, 'log', { type: 'info', value: `Checkout to ${cmd.ref} completed successfully!` })
        return result
      } catch (e) {
        this.call('terminal' as any, 'log', { type: 'error', value: `Checkout failed: ${e.message}` })
        throw e
      }
    } else {
      const checkout = await git.checkout({
        ...(await this.getGitConfig()),
        ...cmd,
      })
      return checkout
    }
  }

  async push(input: pushInputType) {
    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    if (this.gitIsInstalled) {
      try {
        this.call('terminal' as any, 'log', 'Pushing changes...')
        const result = await gitProxy.push(this.workingDir, input)
        
        if (result.stdout) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stdout })
        }
        
        if (result.stderr) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stderr })
        }
        
        this.call('terminal' as any, 'log', { type: 'info', value: 'Push completed successfully!' })
        return result
      } catch (e) {
        this.call('terminal' as any, 'log', { type: 'error', value: `Push failed: ${e.message}` })
        throw e
      }
    } else {
      const push = await isoGit.push(input, await this.getGitConfig(), this)
      return push
    }
  }

  async pull(input: pullInputType) {

    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    if (this.gitIsInstalled) {
      try {
        this.call('terminal' as any, 'log', 'Pulling changes...')
        const result = await gitProxy.pull(this.workingDir, input)
        
        if (result.stdout) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stdout })
        }
        
        if (result.stderr) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stderr })
        }
        
        this.call('terminal' as any, 'log', { type: 'info', value: 'Pull completed successfully!' })
        return result
      } catch (e) {
        this.call('terminal' as any, 'log', { type: 'error', value: `Pull failed: ${e.message}` })
        throw e
      }
    } else {
      const pull = await isoGit.pull(input, await this.getGitConfig(), this)
      return pull
    }
  }

  async fetch(input: fetchInputType) {

    if (!this.workingDir || this.workingDir === '') {
      throw new Error('No working directory')
    }

    if (this.gitIsInstalled) {
      try {
        this.call('terminal' as any, 'log', 'Fetching changes...')
        const result = await gitProxy.fetch(this.workingDir, input)
        
        if (result.stdout) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stdout })
        }
        
        if (result.stderr) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stderr })
        }
        
        this.call('terminal' as any, 'log', { type: 'info', value: 'Fetch completed successfully!' })
        return result
      } catch (e) {
        this.call('terminal' as any, 'log', { type: 'error', value: `Fetch failed: ${e.message}` })
        throw e
      }
    } else {
      const fetch = await isoGit.fetch(input, await this.getGitConfig(), this)
      return fetch
    }
  }

  async clone(cmd: cloneInputType) {
    // Only prompt for folder if not already provided
    if (!cmd.dir) {
      try {
        cmd.dir = await this.call('fs' as any, 'selectFolder', null, 'Select or create a folder to clone the repository in', 'Select as Repository Destination')
        if (!cmd.dir) {
          throw new Error('Clone cancelled: No destination folder selected')
        }
      } catch (e) {
        throw new Error('Clone cancelled: ' + e.message)
      }
    }

    if (this.gitIsInstalled) {
      try {
        this.call('terminal' as any, 'log', 'Cloning using git... please wait.')
        const result = await gitProxy.clone(cmd)

        // Send stdout to terminal as info
        if (result.stdout) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stdout })
        }

        // Send stderr to terminal as warning (git often sends progress info to stderr)
        if (result.stderr) {
          this.call('terminal' as any, 'log', { type: 'info', value: result.stderr })
        }

        this.call('terminal' as any, 'log', { type: 'info', value: 'Clone completed successfully!' })
      } catch (e) {
        this.call('terminal' as any, 'log', { type: 'error', value: `Clone failed: ${e.message}` })
        throw e
      }
    } else {
      try {
        this.call('terminal' as any, 'log', 'Cloning using builtin git... please wait.')
        const clone = await isoGit.clone(cmd, await this.getGitConfig(), this)
        return clone
      } catch (e) {
        console.log('CLONE ERROR', e)
        this.call('terminal' as any, 'log', { type: 'error', value: `Clone failed: ${e.message}` })
        throw e
      }
    }
  }

  async addremote(input: remote) {
    const addremote = await git.addRemote({
      ...(await this.getGitConfig()),
      url: input.url,
      remote: input.name,
    })

    return addremote
  }

  async delremote(input: remote) {
    const delremote = await git.deleteRemote({
      ...(await this.getGitConfig()),
      remote: input.name,
    })

    return delremote
  }

  async remotes() {

    if (!this.workingDir || this.workingDir === '') {
      return []
    }
    const defaultConfig = await this.getGitConfig()
    return await isoGit.remotes(defaultConfig)
  }

  async currentbranch(input: currentBranchInput) {

    if (!this.workingDir || this.workingDir === '') {
      return ''
    }
    const defaultConfig = await this.getGitConfig()
    return await isoGit.currentbranch(input, defaultConfig)
  }

  async branches(config: any) {

    if (!this.workingDir || this.workingDir === '') {
      return []
    }

    const defaultConfig = await this.getGitConfig()
    return await isoGit.branches(defaultConfig)
  }

  async startClone() {
    this.call('filePanel' as any, 'clone')
  }

  async getCommitChanges(commitHash1: string, commitHash2: string): Promise<commitChange[]> {
    return await isoGit.getCommitChanges(commitHash1, commitHash2, await this.getGitConfig())
  }

  async compareBranches({ branch, remote }: compareBranchesInput): Promise<branchDifference> {
    return await isoGit.compareBranches({ branch, remote }, await this.getGitConfig())
  }

  async updateSubmodules(input) {
    if (this.gitIsInstalled) {
      try {
        return await gitProxy.updateSubmodules(this.workingDir)
      } catch (e) {
        throw e
      }
    } else {
      this.call('terminal', 'log', { type: 'error', value: 'Please install git into your OS to use this functionality...' })
    }
  }
}
