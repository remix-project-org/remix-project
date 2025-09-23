// eslint-disable-next-line no-unused-vars
import axios, { AxiosResponse } from 'axios'
import semver from 'semver'
import { BzzNode as Bzz } from '@erebos/bzz-node'
import { endpointUrls } from '.';

export interface Imported {
  content: string;
  cleanUrl: string;
  type: string;
}

interface PreviouslyHandledImports {
  [filePath: string]: Imported
}

interface Handler {
  type: string;
  match(url: string): any;
  handle(match: any): any;
}

interface HandlerResponse {
  content: any;
  cleanUrl: string
}

export type getPackages = () => Promise<{ [name: string]: string }>

export class RemixURLResolver {
  private previouslyHandled: PreviouslyHandledImports
  gistAccessToken: string
  protocol: string
  getDependencies: getPackages

  constructor (getDependencies?: getPackages, gistToken?: string, protocol = 'http:') {
    this.previouslyHandled = {}
    this.getDependencies = getDependencies
    this.setGistToken(gistToken, protocol)
  }

  async setGistToken (gistToken?: string, protocol = 'http:') {
    this.gistAccessToken = gistToken || ''
    this.protocol = protocol
  }

  clearCache () {
    this.previouslyHandled = {}
  }

  /**
  * Handle an import statement based on github
  * @param root The root of the github import statement
  * @param filePath path of the file in github
  */
  async handleGithubCall(root: string, filePath: string): Promise<HandlerResponse> {
    const regex = filePath.match(/blob\/([^/]+)\/(.*)/)
    let reference = 'master'
    if (regex) {
      // if we have /blob/master/+path we extract the branch name "master" and add it as a parameter to the github api
      // the ref can be branch name, tag, commit id
      reference = regex[1]
      filePath = filePath.replace(`blob/${reference}/`, '')
    }
    // eslint-disable-next-line no-useless-catch
    try {
      const req = `https://raw.githubusercontent.com/${root}/${reference}/${filePath}`
      const response: AxiosResponse = await axios.get(req, { transformResponse: []})
      return { content: response.data, cleanUrl: root + '/' + filePath }
    } catch (e) {
      throw e
    }
  }

  /**
  * Handle an import statement based on http
  * @param url The url of the import statement
  * @param cleanUrl
  */
  async handleHttp(url: string, cleanUrl: string): Promise<HandlerResponse> {
    // eslint-disable-next-line no-useless-catch
    try {
      const response: AxiosResponse = await axios.get(url, { transformResponse: []})
      return { content: response.data, cleanUrl }
    } catch (e) {
      throw e
    }
  }

  /**
  * Handle an import statement based on https
  * @param url The url of the import statement
  * @param cleanUrl
  */
  async handleHttps(url: string, cleanUrl: string): Promise<HandlerResponse> {
    // eslint-disable-next-line no-useless-catch
    try {
      const response: AxiosResponse = await axios.get(url, { transformResponse: []})
      return { content: response.data, cleanUrl }
    } catch (e) {
      throw e
    }
  }

  async handleSwarm(url: string, cleanUrl: string): Promise<HandlerResponse> {
    // eslint-disable-next-line no-useless-catch
    try {
      const bzz = new Bzz({ url: this.protocol + '//swarm-gateways.net' })
      const swarmUrl = bzz.getDownloadURL(cleanUrl, { mode: 'raw' }) // variable name changed
      const response: AxiosResponse = await axios.get(swarmUrl, { transformResponse: []})
      return { content: response.data, cleanUrl }
    } catch (e) {
      throw e
    }
  }

  /**
  * Handle an import statement based on IPFS
  * @param url The url of the IPFS import statement
  */
  async handleIPFS(url: string): Promise<HandlerResponse> {
    // replace ipfs:// with /ipfs/
    url = url.replace(/^ipfs:\/\/?/, 'ipfs/')
    // eslint-disable-next-line no-useless-catch
    try {
      const req = `${endpointUrls.ipfsGateway}/${url}`
      // If you don't find greeter.sol on ipfs gateway use local
      // const req = 'http://localhost:8080/' + url
      const response: any = await fetch(req)
      const data = await response.text()
      return { content: data, cleanUrl: url.replace('ipfs/', '') }
    } catch (e) {
      throw e
    }
  }

  /**
  * Handle an import statement based on NPM
  * @param url The url of the NPM import statement
  */
  async handleNpmImport(url: string): Promise<HandlerResponse> {
    if (!url) throw new Error('url is empty')
    let fetchUrl = url
    const isVersioned = semverRegex().exec(url.replace(/@/g, '@ ').replace(/\//g, ' /'))
    if (this.getDependencies && !isVersioned) {
      try {
        const { deps, yarnLock, packageLock } = await this.getDependencies()
        if (deps) {
          // Packages have usually a slash in the name which make it difficult to distinguish them from a path.
          // we first try to resolve the path with a slash. packages like @openzepplin/contracts will be resolved in that case.
          let transformedUrl = getPkg(fetchUrl.split('/')[0] + '/' + fetchUrl.split('/')[1], yarnLock, packageLock, deps, url, fetchUrl)
          if (!transformedUrl) {
            // then we fallback to the case where the package doesn't have a slash in its name.
            transformedUrl = getPkg(fetchUrl.split('/')[0], yarnLock, packageLock, deps, url, fetchUrl)
          }
          if (transformedUrl) {
            fetchUrl = transformedUrl
          }
        }
      } catch (e) {
        console.log(e)
      }
    }

    const npm_urls = ["https://cdn.jsdelivr.net/npm/", "https://unpkg.com/"]
    process && process.env && process.env['NX_NPM_URL'] && npm_urls.unshift(process.env['NX_NPM_URL'])
    let content = null
    // get response from all urls
    for (let i = 0; i < npm_urls.length; i++) {
      try {
        const req = npm_urls[i] + fetchUrl
        const response: AxiosResponse = await axios.get(req, { transformResponse: []})
        content = response.data
        break
      } catch (e) {
        // try next url
      }

    }
    if (!content) throw new Error('Unable to load ' + url)
    return { content, cleanUrl: url }
  }

  async handleV4CoreGithub (url: string): Promise<HandlerResponse> {
    // e.g https://raw.githubusercontent.com/Uniswap/v4-core/refs/tags/v4.0.0/src/interfaces/IExtsload.sol
    url = url.replace('@uniswap/v4-core/contracts/', '')
    url = url.replace('@uniswap/v4-core/src/', '')
    url = url.replace('@uniswap/v4-core/', '')
    url = url.replace('v4-core/src', '')

    // eslint-disable-next-line no-useless-catch
    try {
      const req = `https://raw.githubusercontent.com/Uniswap/v4-core/refs/tags/v4.0.0/src/${url}`
      const response: AxiosResponse = await axios.get(req, { transformResponse: []})
      return { content: response.data, cleanUrl: req }
    } catch (e) {
      throw e
    }
  }

  async handleV4PeriphGithub (url: string): Promise<HandlerResponse> {
    url = url.replace('@uniswap/v4-periphery', '')
    url = url.replace('v4-periphery', '')

    // eslint-disable-next-line no-useless-catch
    try {
      const req = `https://raw.githubusercontent.com/Uniswap/v4-periphery/main/${url}`
      const response: AxiosResponse = await axios.get(req, { transformResponse: []})
      return { content: response.data, cleanUrl: req }
    } catch (e) {
      throw e
    }
  }
  getHandlers (): Handler[] {
    return [
      {
        type: 'github',
        match: (url) => { return /^(https?:\/\/)?(www.)?github.com\/([^/]*\/[^/]*)\/(.*)/.exec(url) },
        handle: (match) => this.handleGithubCall(match[3], match[4])
      },
      {
        type: 'http',
        match: (url) => { return /^(http?:\/\/?(.*))$/.exec(url) },
        handle: (match) => this.handleHttp(match[1], match[2])
      },
      {
        type: 'https',
        match: (url) => { return /^(https?:\/\/?(.*))$/.exec(url) },
        handle: (match) => this.handleHttps(match[1], match[2])
      },
      {
        type: 'swarm',
        match: (url) => { return /^(bzz-raw?:\/\/?(.*))$/.exec(url) },
        handle: (match) => this.handleSwarm(match[1], match[2])
      },
      {
        type: 'ipfs',
        match: (url) => { return /^(ipfs:\/\/?.+)/.exec(url) },
        handle: (match) => this.handleIPFS(match[1])
      },
      {
        type: 'v4-core-github',
        match: (url) => {
          if (url.startsWith('v4-core/') || url.startsWith('@uniswap/v4-core')) {
            return [url]
          }
        },
        handle: (match) => this.handleV4CoreGithub(match[0])
      },
      {
        type: 'v4-periph-github',
        match: (url) => {
          if (url.startsWith('v4-periphery/') || url.startsWith('@uniswap/v4-periphery')) {
            return [url]
          }
        },
        handle: (match) => this.handleV4PeriphGithub(match[0])
      },
      {
        type: 'npm',
        match: (url) => {
          if (url && url.startsWith('npm:')) {
            return [url.replace('npm:', '')]
          }
        },
        handle: (match) => this.handleNpmImport(match[0])
      },
      {
        type: 'npm',
        match: (url) => { return /^[^/][^\n"?:*<>|]*$/g.exec(url) }, // match a typical relative path
        handle: (match) => this.handleNpmImport(match[0])
      }
    ]
  }

  public async resolve (filePath: string, customHandlers?: Handler[], force?: boolean): Promise<Imported> {
    let imported: Imported = this.previouslyHandled[filePath]
    if (!force && imported) {
      return imported
    }
    const builtinHandlers: Handler[] = this.getHandlers()
    const handlers: Handler[] = customHandlers ? [...builtinHandlers, ...customHandlers] : [...builtinHandlers]
    const matchedHandler = handlers.filter(handler => handler.match(filePath))
    const handler: Handler = matchedHandler[0]
    const match = handler.match(filePath)
    const { content, cleanUrl } = await handler.handle(match)
    imported = {
      content,
      cleanUrl: cleanUrl || filePath,
      type: handler.type
    }
    this.previouslyHandled[filePath] = imported
    return imported
  }
}

// see npm semver-regex
function semverRegex() {
  return /(?<=^v?|\sv?)(?:(?:0|[1-9]\d{0,9}?)\.){2}(?:0|[1-9]\d{0,9})(?:-(?:--+)?(?:0|[1-9]\d*|\d*[a-z]+\d*)){0,100}(?=$| |\+|\.)(?:(?<=-\S+)(?:\.(?:--?|[\da-z-]*[a-z-]\d*|0|[1-9]\d*)){1,100}?)?(?!\.)(?:\+(?:[\da-z]\.?-?){1,100}?(?!\w))?(?!\+)/gi;
}

function getPkg(pkg, yarnLock, packageLock, deps, url, fetchUrl) {
  let version
  if (yarnLock) {
    // yarn.lock
    const regex = new RegExp(`"${pkg}@(.*)"`, 'g')
    const yarnVersion = regex.exec(yarnLock)
    if (yarnVersion && yarnVersion.length > 1) {
      version = yarnVersion[1]
    }
  }
  if (!version && packageLock && packageLock['packages'] && packageLock['packages']['node_modules/' + pkg] && packageLock['packages']['node_modules/' + pkg]['version']) {
    // package-lock.json version 3
    version = packageLock['packages']['node_modules/' + pkg]['version']
  }
  if (!version && packageLock && packageLock['dependencies'] && packageLock['dependencies'][pkg] && packageLock['dependencies'][pkg]['version']) {
    // package-lock.json version 2
    version = packageLock['dependencies'][pkg]['version']
  }
  // package.json
  if (deps[pkg]) {
    version = deps[pkg]
  }
  if (version) {
    // If the entry is pointing to a github repo, redirect to correct handler instead of continuing
    if (version.startsWith("github:")) {
      const [, repo, tag] = version.match(/github:([^#]+)#(.+)/);
      const filePath = url.replace(/^[^/]+\//, '');
      return this.handleGithubCall(repo, `blob/${tag}/${filePath}`);
    }
    if (version.startsWith('npm:')) {
      fetchUrl = url.replace(pkg, version.replace('npm:', ''))
      return fetchUrl
    } else {
      // const versionSemver = semver.minVersion(version)
      fetchUrl = url.replace(pkg, `${pkg}@${version}`)
      return fetchUrl
    }
  }
  return null
}
