import { GitHubUser, author, branch, cloneInputType, commitChange, compareBranchesInput, currentBranchInput, fetchInputType, isoGitFSConfig, isoGitProxyConfig, pullInputType, pushInputType, remote, userEmails } from "@remix-api"
import git from 'isomorphic-git'
import {
  Plugin
} from '@remixproject/engine'
import http from 'isomorphic-git/http/web'

import { Octokit } from "octokit"
import { ElectronBasePluginClient } from "@remixproject/plugin-electron"
import { endpointUrls } from "@remix-endpoints-helper"
const currentbranch = async (input: currentBranchInput, fsConfig: isoGitFSConfig) => {

  try {
    const cmd = input ? fsConfig ? { ...fsConfig, ...input } : input : fsConfig

    const name = await git.currentBranch(cmd)
    let remote: remote = undefined
    try {
      const remoteName = await git.getConfig({
        ...fsConfig,
        path: `branch.${name}.remote`
      })
      if (remoteName) {
        const remoteUrl = await git.getConfig({
          ...fsConfig,
          path: `remote.${remoteName}.url`
        })
        remote = { name: remoteName, url: remoteUrl }
      }

    } catch (e) {
      // do nothing
    }

    return {
      remote: remote,
      name: name || ''
    }
  } catch (e) {
    return undefined
  }
}

const branches = async (fsConfig: isoGitFSConfig) => {
  try {

    const remotes = await isoGit.remotes(fsConfig)
    let branches: branch[] = []
    branches = (await git.listBranches(fsConfig)).map((branch) => { return { remote: undefined, name: branch } })
    for (const remote of remotes) {
      const cmd = {
        ...fsConfig,
        remote: remote.name
      }
      const remotebranches = (await git.listBranches(cmd)).map((branch) => { return { remote: remote, name: branch } })
      branches = [...branches, ...remotebranches]
    }
    return branches
  } catch (e) {
    console.log(e)
    return []
  }
}

const remotes = async (fsConfig: isoGitFSConfig) => {

  let remotes: remote[] = []
  try {
    remotes = (await git.listRemotes({ ...fsConfig })).map((remote) => { return { name: remote.remote, url: remote.url } }
    )
  } catch (e) {
    // do nothing
  }
  return remotes
}

const push = async (input: pushInputType, fsConfig: isoGitFSConfig, plugin: Plugin | ElectronBasePluginClient) => {
  const cmd = {
    force: input.force,
    ref: input.ref.name,
    remoteRef: input.remoteRef && input.remoteRef.name,
    remote: input.remote.name,
    author: await getAuthor(input, plugin),
    input,
  }

  const proxy = await isoGit.addIsomorphicGitProxyConfig(input, plugin)
  console.log({ ...fsConfig, ...cmd, ...proxy })
  return await git.push({ ...fsConfig, ...cmd, ...proxy })
}

const pull = async (input: pullInputType, fsConfig: isoGitFSConfig, plugin: Plugin | ElectronBasePluginClient) => {
  const cmd = {
    ref: input.ref.name,
    remoteRef: input.remoteRef && input.remoteRef.name,
    author: await getAuthor(input, plugin),
    remote: input.remote.name,
    input,
  }
  const proxy = await isoGit.addIsomorphicGitProxyConfig(input, plugin)
  console.log({ ...fsConfig, ...cmd, ...proxy })
  return await git.pull({ ...fsConfig, ...cmd, ...proxy })
}

const fetch = async (input: fetchInputType, fsConfig: isoGitFSConfig, plugin: Plugin | ElectronBasePluginClient) => {
  const cmd = {
    ref: input.ref && input.ref.name,
    remoteRef: input.remoteRef && input.remoteRef.name,
    author: await getAuthor(input, plugin),
    remote: input.remote && input.remote.name,
    depth: input.depth || 5,
    singleBranch: input.singleBranch,
    relative: input.relative,
    input
  }
  const proxy = await isoGit.addIsomorphicGitProxyConfig(input, plugin)
  console.log({ ...fsConfig, ...cmd, ...proxy })
  return await git.fetch({ ...fsConfig, ...cmd, ...proxy })
}

const clone = async (input: cloneInputType, fsConfig: isoGitFSConfig, plugin: Plugin | ElectronBasePluginClient) => {
  const proxy = await isoGit.addIsomorphicGitProxyConfig(input, plugin)
  const cmd = {
    url: input.url,
    singleBranch: input.singleBranch,
    ref: input.branch,
    depth: input.depth || 10,
    dir: input.dir,
    input
  }
  await git.clone({ ...fsConfig, ...cmd, ...proxy })
}

const getAuthor = async (input, plugin: any) => {
  const author: author = {
    name: '',
    email: ''
  }
  if (input && input.name && input.email) {
    author.name = input.name
    author.email = input.email
  } else {
    const username = await plugin.call('config' as any, 'getAppParameter', 'settings/github-user-name')
    const email = await plugin.call('config' as any, 'getAppParameter', 'settings/github-email')
    const token = await plugin.call('config' as any, 'getAppParameter', 'settings/gist-access-token')
    if (username && email) {
      author.name = username
      author.email = email
    } else if (token) {

      const gitHubUser = await isoGit.getGitHubUser({ token })

      if (gitHubUser) {
        author.name = gitHubUser.user.login
      }
    }
  }
  return author
}


const getGitHubUser = async(input: { token: string }): Promise<{
  user: GitHubUser,
  emails: userEmails,
  scopes: string[]
}> => {
  try {
    const octokit = new Octokit({
      auth: input.token
    })

    const user = await octokit.request('GET /user', {
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    const emails = await octokit.request('GET /user/emails')

    const scopes = user.headers['x-oauth-scopes'] || ''

    return {
      user: {
        ...user.data, isConnected:
          user.data.login !== undefined && user.data.login !== null && user.data.login !== ''
      },
      emails: emails.data,
      scopes: scopes && scopes.split(',').map(scope => scope.trim())
    }
  } catch (e) {
    return null
  }
}

const addIsomorphicGitProxyConfig = async (input: {
  url?: string,
  remote?: remote,
  provider?: 'github' | 'localhost',
  token?: string,
}, plugin: any) => {

  const token = await plugin.call('config' as any, 'getAppParameter', 'settings/gist-access-token')

  // Check if running in Electron (desktop app)
  const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron

  let config: isoGitProxyConfig = {
    // Electron apps don't need CORS proxy since they're not subject to browser CORS restrictions
    corsProxy: isElectron ? null : `${endpointUrls.corsProxy}`,
    http,
    onAuth: url => {
      url
      const auth = {
        username: input.token || token,
        password: ''
      }
      return auth
    }
  }

  // For non-Electron environments, handle localhost URLs
  if (!isElectron && input.url) {
    const url = new URL(input.url)
    if (url.hostname.includes('localhost')) {
      config = {
        ...config,
        corsProxy: null
      }
    }
  }
  if (!isElectron && (input.remote && input.remote.url)) {
    const url = new URL(input.remote.url)
    if (url.hostname.includes('localhost')) {
      config = {
        ...config,
        corsProxy: null,
      }
    }
  }

  // Provider overrides (only for non-Electron)
  if (!isElectron && input.provider && input.provider === 'github') {
    config = {
      ...config,
      corsProxy: `${endpointUrls.corsProxy}`,
    }
  }

  if (input.provider && input.provider === 'localhost') {
    config = {
      ...config,
      corsProxy: null
    }
  }

  return config
}

const getCommitChanges = async (commitHash1: string, commitHash2: string, fsConfig: isoGitFSConfig) => {
  const result: commitChange[] = await git.walk({
    ...fsConfig,
    trees: [git.TREE({ ref: commitHash1 }), git.TREE({ ref: commitHash2 })],
    map: async function (filepath, [A, B]) {

      if (filepath === '.') {
        return
      }
      try {
        if ((A && await A.type()) === 'tree' || B && (await B.type()) === 'tree') {
          return
        }
      } catch (e) {
        // ignore
      }

      // generate ids
      const Aoid = A && await A.oid() || undefined
      const Boid = B && await B.oid() || undefined

      const commitChange: Partial<commitChange> = {
        hashModified: commitHash1,
        hashOriginal: commitHash2,
        path: filepath,
      }

      // determine modification type
      if (Aoid !== Boid) {
        commitChange.type = "modified"
      }
      if (Aoid === undefined) {
        commitChange.type = "deleted"
      }
      if (Boid === undefined || !commitHash2) {
        commitChange.type = "added"
      }
      if (Aoid === undefined && Boid === undefined) {
        commitChange.type = "unknown"
      }
      if (commitChange.type)
        return commitChange
      else
        return undefined
    },
  })

  return result
}

const compareBranches = async ({ branch, remote }: compareBranchesInput, fsConfig: isoGitFSConfig) => {
  // Get current branch commits
  const headCommits = await git.log({
    ...fsConfig,
    ref: branch.name,
    depth: 10,
  });

  // Get remote branch commits
  const remoteCommits = await git.log({
    ...fsConfig,
    ref: `${remote.name}/${branch.name}`,
    depth: 10,
  });

  // Convert arrays of commit objects to sets of commit SHAs
  const headCommitSHAs = new Set(headCommits.map(commit => commit.oid));
  const remoteCommitSHAs = new Set(remoteCommits.map(commit => commit.oid));

  // Filter out commits that are only in the remote branch
  const uniqueRemoteCommits = remoteCommits.filter(commit => !headCommitSHAs.has(commit.oid));

  // filter out commits that are only in the local branch
  const uniqueHeadCommits = headCommits.filter(commit => !remoteCommitSHAs.has(commit.oid));

  return {
    uniqueHeadCommits,
    uniqueRemoteCommits,
  };
}

export const isoGit = {
  currentbranch,
  remotes,
  branches,
  getCommitChanges,
  compareBranches,
  addIsomorphicGitProxyConfig,
  push,
  pull,
  fetch,
  getGitHubUser,
  clone
}