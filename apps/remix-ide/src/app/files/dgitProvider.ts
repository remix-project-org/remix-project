'use strict'

import {
  Plugin
} from '@remixproject/engine'
import git, { ReadBlobResult, ReadCommitResult, StatusRow } from 'isomorphic-git'
import path from 'path'
import axios from 'axios'
import { Registry } from '@remix-project/remix-lib'
import { Octokit } from "octokit"
import { IndexedDBStorage } from './filesystems/indexedDB'
import { branch, commitChange, remote } from '@remix-ui/git'
import { checkoutInputType, statusInput, logInputType, author, pagedCommits, remoteCommitsInputType, cloneInputType, fetchInputType, pullInputType, pushInputType, currentBranchInput, branchInputType, addInputType, rmInputType, resolveRefInput, readBlobInput, repositoriesInput, commitInputType, branchDifference, compareBranchesInput, initInputType, isoGitFSConfig, GitHubUser, userEmails } from '@remix-api'
import { LibraryProfile } from '@remixproject/plugin-utils'
import { CustomRemixApi } from '@remix-api'
import { isoGit } from "@remix-git"
declare global {
  interface Window { remixFileSystemCallback: IndexedDBStorage; remixFileSystem: any; }
}

const profile: LibraryProfile = {
  name: 'dgitApi',
  displayName: 'Decentralized git',
  description: 'Decentralized git provider',
  icon: 'assets/img/fileManager.webp',
  version: '0.0.1',
  methods: ['init', 'addremote', 'delremote', 'remotes', 'fetch', 'clone', 'status', 'log', 'commit', 'add', 'remove', 'rm', 'readblob', 'resolveref', 'branches', 'branch', 'checkout', 'currentbranch', 'push', 'pull', 'version', 'updateSubmodules'
    , 'getGitHubUser', 'remotebranches', 'remotecommits', 'repositories', 'getCommitChanges', 'compareBranches'],
  kind: 'file-system'
}
export default class DGitProvider extends Plugin<any, CustomRemixApi> {
  constructor() {
    super(profile)
  }

  async addIsomorphicGitConfigFS(dir = '') {

    const workspace = await this.call('filePanel', 'getCurrentWorkspace')

    if (!workspace) return
    return {
      fs: window.remixFileSystemCallback,
      dir: addSlash(path.join(workspace.absolutePath, dir || '')),
    }
  }

  async getToken() {
    return await this.call('config' as any, 'getAppParameter', 'settings/gist-access-token')
  }

  private isValidGitHubToken(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false
    }

    // Remove whitespace
    token = token.trim()

    // Check for empty token
    if (token.length === 0) {
      return false
    }

    // GitHub token patterns:
    // Personal Access Token (classic): ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)
    // Personal Access Token (fine-grained): github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (varies)
    // OAuth token: gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)
    // GitHub App token: ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)
    // GitHub App installation token: ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)
    // Refresh token: ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)

    const tokenPatterns = [
      /^ghp_[A-Za-z0-9]{36}$/, // Personal Access Token (classic)
      /^github_pat_[A-Za-z0-9_]{22,255}$/, // Personal Access Token (fine-grained)
      /^gho_[A-Za-z0-9]{36}$/, // OAuth token
      /^ghs_[A-Za-z0-9]{36}$/, // GitHub App token
      /^ghu_[A-Za-z0-9]{36}$/, // GitHub App installation token
      /^ghr_[A-Za-z0-9]{36}$/, // Refresh token
    ]

    // Check if token matches any known GitHub token pattern
    const matchesPattern = tokenPatterns.some(pattern => pattern.test(token))

    if (matchesPattern) {
      return true
    }

    // Fallback: check if it looks like a legacy token (40 chars, alphanumeric)
    // Some older tokens might not follow the new prefixed format
    if (/^[A-Za-z0-9]{40}$/.test(token)) {
      console.warn('Token appears to be a legacy GitHub token format')
      return true
    }

    console.warn('Token does not match known GitHub token patterns:', {
      length: token.length,
      prefix: token.substring(0, 4),
      hasValidChars: /^[A-Za-z0-9_]+$/.test(token)
    })

    return false
  }

  async getAuthor(input) {
    const author: author = {
      name: '',
      email: ''
    }
    if (input && input.name && input.email) {
      author.name = input.name
      author.email = input.email
    } else {
      const username = await this.call('config' as any, 'getAppParameter', 'settings/github-user-name')
      const email = await this.call('config' as any, 'getAppParameter', 'settings/github-email')
      const token = await this.call('config' as any, 'getAppParameter', 'settings/gist-access-token')
      if (username && email) {
        author.name = username
        author.email = email
      } else if (token) {

        const gitHubUser = await this.getGitHubUser({ token })

        if (gitHubUser) {
          author.name = gitHubUser.user.login
        }
      }
    }
    return author
  }

  async init(input?: initInputType): Promise<void> {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      await this.call('isogit', 'init', {
        defaultBranch: (input && input.defaultBranch) || 'main'
      })
      this.emit('init')
      return
    }

    await git.init({
      ...await this.addIsomorphicGitConfigFS(),
      defaultBranch: (input && input.defaultBranch) || 'main'
    })
    this.emit('init')
  }

  async version() {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'version')
    }

    const version = 'built-in'
    return version
  }

  async status(cmd: statusInput): Promise<Array<StatusRow>> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      const status = await this.call('isogit', 'status', cmd)
      return status
    }

    const status = await git.statusMatrix({
      ...await this.addIsomorphicGitConfigFS(),
      ...cmd
    })

    return status
  }

  async add(cmd: addInputType): Promise<void> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      await this.call('isogit', 'add', cmd)
    } else {
      await git.add({
        ...await this.addIsomorphicGitConfigFS(),
        ...cmd
      })
    }

    this.emit('add')
  }

  async rm(cmd: rmInputType) {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      await this.call('isogit', 'rm', cmd)
    } else {
      await git.remove({
        ...await this.addIsomorphicGitConfigFS(),
        ...cmd
      })
    }
    this.emit('rm')
  }

  async checkout(cmd: checkoutInputType): Promise<void> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      await this.call('isogit', 'checkout', cmd)
    } else {
      const gitmodules = await this.parseGitmodules() || []
      await git.checkout({
        ...await this.addIsomorphicGitConfigFS(),
        ...cmd
      })
      const newgitmodules = await this.parseGitmodules() || []
      // find the difference between the two gitmodule versions
      const toRemove = gitmodules.filter((module) => {
        return !newgitmodules.find((newmodule) => {
          return newmodule.name === module.name
        })
      })

      for (const module of toRemove) {
        const path = (await this.addIsomorphicGitConfigFS(module.path)).dir
        if (await window.remixFileSystem.exists(path)) {
          const stat = await window.remixFileSystem.stat(path)
          try {
            if (stat.isDirectory()) {
              await window.remixFileSystem.unlink((await this.addIsomorphicGitConfigFS(module.path)).dir)
            }
          } catch (e) {
            // do nothing
          }
        }
      }
    }
    if (cmd.refresh) {
      setTimeout(async () => {
        await this.call('fileManager', 'refresh')
      }, 1000)
    }

    this.emit('checkout')
  }

  async log(cmd: logInputType): Promise<ReadCommitResult[]> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      const status = await this.call('isogit', 'log', {
        ...cmd,
      })

      return status
    }

    const status = await git.log({
      ...await this.addIsomorphicGitConfigFS(),
      ...cmd,
    })

    return status
  }

  async compareBranches({ branch, remote }: compareBranchesInput): Promise<branchDifference> {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'compareBranches', { branch, remote })
    }
    return await isoGit.compareBranches({ branch, remote }, await this.addIsomorphicGitConfigFS())
  }

  async getCommitChanges(commitHash1: string, commitHash2: string): Promise<commitChange[]> {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      const result = this.call('isogit', 'getCommitChanges', commitHash1, commitHash2)
      return result
    }

    return await isoGit.getCommitChanges(commitHash1, commitHash2, await this.addIsomorphicGitConfigFS())
  }

  async remotes(): Promise<remote[]> {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'remotes')
    }

    return await isoGit.remotes(await this.addIsomorphicGitConfigFS())
  }

  async branch(cmd: branchInputType): Promise<void> {

    let status
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      status = await this.call('isogit', 'branch', cmd)
    } else {
      status = await git.branch({
        ...await this.addIsomorphicGitConfigFS(),
        ...cmd
      })
    }
    if (cmd.refresh) {
      setTimeout(async () => {
        await this.call('fileManager', 'refresh')
      }, 1000)
    }
    this.emit('branch')
    return status
  }

  async currentbranch(input: currentBranchInput): Promise<branch> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'currentbranch', input)
    }

    const defaultConfig = await this.addIsomorphicGitConfigFS()
    return await isoGit.currentbranch(input, defaultConfig)
  }

  async branches(config: isoGitFSConfig): Promise<branch[]> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      const branches = await this.call('isogit', 'branches')
      return branches
    }
    const defaultConfig = await this.addIsomorphicGitConfigFS()
    const cmd = config ? defaultConfig ? { ...defaultConfig, ...config } : config : defaultConfig
    return await isoGit.branches(cmd)
  }

  async commit(cmd: commitInputType): Promise<string> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      try {
        await this.call('isogit', 'init')
        const sha = await this.call('isogit', 'commit', cmd)
        this.emit('commit')
        return sha
      } catch (e) {
        throw new Error(e)
      }
    } else {

      await this.init()
      try {
        const sha = await git.commit({
          ...await this.addIsomorphicGitConfigFS(),
          ...cmd
        })
        this.emit('commit')
        return sha
      } catch (e) {
        throw new Error(e)
      }
    }
  }

  async resolveref(cmd: resolveRefInput): Promise<string> {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'resolveref', cmd)
    }

    const oid = await git.resolveRef({
      ...await this.addIsomorphicGitConfigFS(),
      ...cmd
    })
    return oid
  }

  async readblob(cmd: readBlobInput): Promise<ReadBlobResult> {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      const readBlobResult = await this.call('isogit', 'readblob', cmd)
      return readBlobResult
    }
    const readBlobResult = await git.readBlob({
      ...await this.addIsomorphicGitConfigFS(),
      ...cmd
    })

    return readBlobResult
  }

  async addremote(input: remote): Promise<void> {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      await this.call('isogit', 'addremote', input)
      return
    }
    await git.addRemote({ ...await this.addIsomorphicGitConfigFS(), url: input.url, remote: input.name })
  }

  async delremote(input: remote) {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      await this.call('isogit', 'delremote', input)
      return
    }
    await git.deleteRemote({ ...await this.addIsomorphicGitConfigFS(), remote: input.name })
  }

  async clone(input: cloneInputType) {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      try {
        const folder = await this.call('fs', 'selectFolder', null, 'Select or create a folder to clone the repository in', 'Select as Repository Destination')
        if (!folder) return false
        input.dir = folder
        input.depth = input.depth || 10
        const result = await this.call('isogit', 'clone', input)
        this.call('fs' as any, 'openWindow', folder)
      } catch (e) {
        this.call('notification', 'alert', {
          id: 'dgitAlert',
          title: 'Error Cloning',
          message: 'Unexpected error while cloning the repository: \n' + e.toString(),
        })
      }
    } else {
      const permission = await this.askUserPermission('clone', 'Import multiple files into your workspaces.')
      if (!permission) return false
      if (!input.workspaceExists) await this.call('filePanel', 'createWorkspace', input.workspaceName || `workspace_${Date.now()}`, true)
      const cmd = {
        url: input.url,
        singleBranch: input.singleBranch,
        ref: input.branch,
        depth: input.depth || 10,
        ...await isoGit.addIsomorphicGitProxyConfig(input, this),
        ...await this.addIsomorphicGitConfigFS()
      }
      this.call('terminal', 'logHtml', `Cloning ${input.url}... please wait...`)
      const result = await git.clone(cmd)
      if (!input.workspaceExists) {
        setTimeout(async () => {
          await this.call('fileManager', 'refresh')
        }, 1000)
      }
      this.emit('clone')
      this.call('fileManager', 'hasGitSubmodules').then((submodules) => {
        if (submodules) {
          this.call('terminal', 'log', { type: 'warn', value: 'This repository has submodules. Please update submodules to pull all the dependencies.' })
          this.emit('repositoryWithSubmodulesCloned')
        }
      })
      return result
    }
  }

  async parseGitmodules(dir = '') {
    try {
      const gitmodules = await this.call('fileManager', 'readFile', path.join(dir, '.gitmodules'))
      if (gitmodules) {
        const lines = gitmodules.split('\n')
        let currentModule: any = {}
        const modules = []
        for (let line of lines) {
          line = line.trim()
          if (line.startsWith('[')) {
            if (currentModule.path) {
              modules.push(currentModule)
            }
            currentModule = {}
            currentModule.name = line.replace('[submodule "', '').replace('"]', '')
          } else if (line.startsWith('url')) {
            currentModule.url = line.replace('url = ', '')
          } else if (line.startsWith('path')) {
            currentModule.path = line.replace('path = ', '')
          }
        }
        if (currentModule.path) {
          modules.push(currentModule)
        }
        return modules
      }
    } catch (e) {
      // do nothing
    }
  }

  async updateSubmodules(input) {
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'updateSubmodules', null)
    }
    try {
      const currentDir = (input && input.dir) || ''
      const gitmodules = await this.parseGitmodules(currentDir)
      this.call('terminal', 'logHtml', `Found ${(gitmodules && gitmodules.length) || 0} submodules in ${currentDir || '/'}`)
      //parse gitmodules
      if (gitmodules) {
        for (const module of gitmodules) {
          const dir = path.join(currentDir, module.path)
          const targetPath = (await this.addIsomorphicGitConfigFS(dir)).dir
          if (await window.remixFileSystem.exists(targetPath)) {
            const stat = await window.remixFileSystem.stat(targetPath)
            try {
              if (stat.isDirectory()) {
                await window.remixFileSystem.unlink(targetPath)
              }
            } catch (e) {
              // do nothing
            }
          }
        }
        for (const module of gitmodules) {
          const dir = path.join(currentDir, module.path)
          // if url contains git@github.com: convert it
          if (module.url && module.url.startsWith('git@github.com:')) {
            module.url = module.url.replace('git@github.com:', 'https://github.com/')
          }
          try {
            const cmd = {
              url: module.url,
              singleBranch: true,
              depth: 1,
              ...await isoGit.addIsomorphicGitProxyConfig({
                ...input,
                provider: 'github',
              }, this),
              ...await this.addIsomorphicGitConfigFS(dir)
            }
            this.call('terminal', 'logHtml', `Cloning submodule ${dir}...`)
            await git.clone(cmd)
            this.call('terminal', 'logHtml', `Cloned successfully submodule ${dir}...`)

            const commitHash = await git.resolveRef({
              ...await this.addIsomorphicGitConfigFS(currentDir),
              ref: 'HEAD'
            })

            const result = await git.walk({
              ...await this.addIsomorphicGitConfigFS(currentDir),
              trees: [git.TREE({ ref: commitHash })],
              map: async function (filepath, [A]) {
                if (filepath === module.path) {
                  return await A.oid()
                }
              }
            })
            if (result && result.length) {
              this.call('terminal', 'logHtml', `Checking out submodule ${dir} to ${result[0]} in directory ${dir}`)
              await git.fetch({
                ...await isoGit.addIsomorphicGitProxyConfig({
                  ...input,
                  provider: 'github',
                }, this),
                ...await this.addIsomorphicGitConfigFS(dir),
                singleBranch: true,
                ref: result[0]
              })

              await git.checkout({
                ...await this.addIsomorphicGitConfigFS(dir),
                ref: result[0]
              })

              const log = await git.log({
                ...await this.addIsomorphicGitConfigFS(dir),
              })

              if (log[0].oid !== result[0]) {
                this.call('terminal', 'log', {
                  type: 'error',
                  value: `Could not checkout submodule to ${result[0]}`
                })
              } else {
                this.call('terminal', 'logHtml', `Checked out submodule ${dir} to ${result[0]}`)
              }
            }

            await this.updateSubmodules({
              ...input,
              dir
            })
          } catch (e) {
            this.call('terminal', 'log', { type: 'error', value: `[Cloning]: Error occurred! ${e}` })
            console.log(e)
          }
        }

        setTimeout(async () => {
          await this.call('fileManager', 'refresh')
        }, 1000)
      }
    } catch (e) {
      this.call('terminal', 'log', { type: 'error', value: `[Cloning]: Error occurred! ${e}` })
      // do nothing
    }
  }

  async push(input: pushInputType) {

    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      return await this.call('isogit', 'push', input)
    } else {
      const result = await isoGit.push(input, await this.addIsomorphicGitConfigFS(), this)
      return result
    }
  }

  async pull(input: pullInputType) {

    let result
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      result = await this.call('isogit', 'pull', input)
    }
    else {
      result = await isoGit.pull(input, await this.addIsomorphicGitConfigFS(), this)
    }
    setTimeout(async () => {
      await this.call('fileManager', 'refresh')
    }, 1000)
    return result
  }

  async fetch(input: fetchInputType) {

    let result
    if ((Registry.getInstance().get('platform').api.isDesktop())) {
      result = await this.call('isogit', 'fetch', {
        ...input,
      })
    } else {
      result = await isoGit.fetch(input, await this.addIsomorphicGitConfigFS(), this)
    }

    setTimeout(async () => {
      await this.call('fileManager', 'refresh')
    }, 1000)
    return result
  }

  // OCTOKIT FEATURES

  async remotebranches(input: { owner: string, repo: string, token: string, page: number, per_page: number }) {
    try {
      // Quick validation to avoid unnecessary API calls
      if (!this.isValidGitHubToken(input.token)) {
        throw new Error('Invalid GitHub token format')
      }

      const octokit = new Octokit({
        auth: input.token,
        retry: { enabled: false }
      })

      const data = await octokit.request('GET /repos/{owner}/{repo}/branches{?protected,per_page,page}', {
        owner: input.owner,
        repo: input.repo,
        per_page: input.per_page || 100,
        page: input.page || 1
      })

      return data.data
    } catch (e) {
      console.error('Error fetching remote branches:', e)
      if (e.status === 403) {
        console.error('GitHub API returned 403 Forbidden - check token permissions or rate limits')
      }
      throw e // Re-throw to let caller handle
    }
  }

  async getGitHubUser(input: { token: string }): Promise<{
    user: GitHubUser,
    emails: userEmails,
    scopes: string[]
  }> {
    try {
      // Quick validation to avoid unnecessary API calls
      if (!this.isValidGitHubToken(input.token)) {
        console.warn('Invalid GitHub token format, skipping API call')
        return null
      }

      const octokit = new Octokit({
        auth: input.token,
        retry: { enabled: false }
      })

      const user = await octokit.request('GET /user', {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })

      let emails = { data: []}
      try {
        emails = await octokit.request('GET /user/emails')
      } catch (emailError) {
        console.warn('Could not fetch user emails:', emailError)
        // Continue without emails if this fails
      }

      const scopes = user.headers['x-oauth-scopes'] || ''

      return {
        user: {
          ...user.data,
          isConnected: user.data.login !== undefined && user.data.login !== null && user.data.login !== ''
        },
        emails: emails.data,
        scopes: scopes && scopes.split(',').map(scope => scope.trim())
      }
    } catch (e) {
      console.error('Error in getGitHubUser:', e)
      // Check if it's a 403 specifically
      if (e.status === 403) {
        console.error('GitHub API returned 403 Forbidden - check token permissions')
      }
      return null
    }
  }

  async remotecommits(input: remoteCommitsInputType): Promise<pagedCommits[]> {
    try {
      // Quick validation to avoid unnecessary API calls
      if (!this.isValidGitHubToken(input.token)) {
        throw new Error('Invalid GitHub token format')
      }

      const octokit = new Octokit({
        auth: input.token,
        retry: { enabled: false }
      })
      input.length = input.length || 5
      input.page = input.page || 1
      const response = await octokit.request('GET /repos/{owner}/{repo}/commits', {
        owner: input.owner,
        repo: input.repo,
        sha: input.branch,
        per_page: input.length,
        page: input.page
      })
      const pages: pagedCommits[] = []
      const readCommitResults: ReadCommitResult[] = []
      for (const githubApiCommit of response.data) {
        const readCommitResult = {
          oid: githubApiCommit.sha,
          commit: {
            author: {
              name: githubApiCommit.commit.author.name,
              email: githubApiCommit.commit.author.email,
              timestamp: new Date(githubApiCommit.commit.author.date).getTime() / 1000,
              timezoneOffset: new Date(githubApiCommit.commit.author.date).getTimezoneOffset()
            },
            committer: {
              name: githubApiCommit.commit.committer.name,
              email: githubApiCommit.commit.committer.email,
              timestamp: new Date(githubApiCommit.commit.committer.date).getTime() / 1000,
              timezoneOffset: new Date(githubApiCommit.commit.committer.date).getTimezoneOffset()
            },
            message: githubApiCommit.commit.message,
            tree: githubApiCommit.commit.tree.sha,
            parent: githubApiCommit.parents.map(parent => parent.sha)
          },
          payload: '' // You may need to reconstruct the commit object in Git's format if necessary
        }
        readCommitResults.push(readCommitResult)
      }

      // Check for the Link header to determine pagination
      const linkHeader = response.headers.link;

      let hasNextPage = false;
      if (linkHeader) {
        // A simple check for the presence of a 'next' relation in the Link header
        hasNextPage = linkHeader.includes('rel="next"');
      }

      pages.push({
        page: input.page,
        perPage: input.length,
        total: response.data.length,
        hasNextPage: hasNextPage,
        commits: readCommitResults
      })
      return pages
    } catch (e) {
      console.error('Error fetching remote commits:', e)
      if (e.status === 403) {
        console.error('GitHub API returned 403 Forbidden - check token permissions or rate limits')
      }
      throw e // Re-throw to let caller handle
    }
  }

  async repositories(input: repositoriesInput) {
    try {
      // Quick validation to avoid unnecessary API calls
      if (!this.isValidGitHubToken(input.token)) {
        throw new Error('Invalid GitHub token format')
      }

      const accessToken = input.token;

      const page = input.page || 1
      const perPage = input.per_page || 10

      const baseURL = 'https://api.github.com/user/repos'
      const repositories = []
      const sort = 'updated'
      const direction = 'desc'

      const headers = {
        'Authorization': `Bearer ${accessToken}`, // Include your GitHub access token
        'Accept': 'application/vnd.github.v3+json', // GitHub API v3 media type
      };

      const url = `${baseURL}?visibility=private,public&page=${page}&per_page=${perPage}&sort=${sort}&direction=${direction}`;
      const response = await axios.get(url, { headers });

      repositories.push(...response.data);

      return repositories
    } catch (e) {
      console.error('Error fetching repositories:', e)
      if (e.response?.status === 403) {
        console.error('GitHub API returned 403 Forbidden - check token permissions or rate limits')
      }
      throw e // Re-throw to let caller handle
    }
  }

}

const addSlash = (file) => {
  if (!file.startsWith('/')) file = '/' + file
  return file
}

module.exports = DGitProvider
